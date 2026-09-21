from __future__ import annotations

import asyncio
import concurrent.futures
import json
import logging
import queue
import threading
from dataclasses import dataclass
from typing import Literal

from confluent_kafka import Consumer, KafkaException, KafkaError, TopicPartition

from app.config import settings


def _format_partitions(partitions) -> list[str]:
    return sorted(f"{partition.topic}:{partition.partition}" for partition in partitions)


def _consumer_identity(consumer: Consumer) -> str:
    try:
        return consumer.memberid() or "unavailable"
    except (AttributeError, KafkaException, RuntimeError):
        return "unavailable"


def _current_assignment(consumer: Consumer) -> list[TopicPartition]:
    try:
        return consumer.assignment()
    except (KafkaException, RuntimeError):
        return []


@dataclass(frozen=True)
class ConsumerRecord:
    topic: str
    partition: int
    offset: int
    key: bytes | None
    value: object


class RebalanceTracker:
    def __init__(
        self,
        logger: logging.Logger,
        paused_partitions: set[tuple[str, int]],
    ):
        self.logger = logger
        self.paused_partitions = paused_partitions
        self.assigned: set[tuple[str, int]] = set()
        self.active_partition: tuple[str, int] | None = None
        self.active_offset: int | None = None
        self.active_ownership_survived = False

    @staticmethod
    def _key(partition: TopicPartition) -> tuple[str, int]:
        return partition.topic, partition.partition

    def set_active(self, message: ConsumerRecord, assigned) -> None:
        self.active_partition = (message.topic, message.partition)
        self.active_offset = message.offset
        self.assigned = {self._key(partition) for partition in assigned}
        self.active_ownership_survived = self.active_partition in self.assigned
        self.logger.info(
            "Active Kafka message topic=%s partition=%s offset=%s ownership_survived=%s",
            message.topic,
            message.partition,
            message.offset,
            self.active_ownership_survived,
        )

    def clear_active(self) -> None:
        self.active_partition = None
        self.active_offset = None
        self.active_ownership_survived = False

    def on_revoke(self, consumer: Consumer, partitions) -> None:
        revoked = {self._key(partition) for partition in partitions}
        self.assigned.difference_update(revoked)
        self.paused_partitions.difference_update(revoked)
        active_revoked = (
            self.active_partition is not None and self.active_partition in revoked
        )
        if active_revoked:
            self.active_ownership_survived = False
        self.logger.info(
            "Kafka rebalance member=%s revoked=%s current_assignment=%s "
            "active_partition=%s active_offset=%s active_revoked=%s "
            "ownership_survived=%s",
            _consumer_identity(consumer),
            _format_partitions(partitions),
            _format_partitions(_current_assignment(consumer)),
            self.active_partition,
            self.active_offset,
            active_revoked,
            self.active_ownership_survived,
        )

    def on_assign(self, consumer: Consumer, partitions) -> None:
        assigned = {self._key(partition) for partition in partitions}
        self.assigned.update(assigned)
        # A newly assigned partition must be treated as not paused until this
        # thread explicitly pauses it for active work. Reused topic/partition
        # keys must not inherit stale local pause bookkeeping.
        self.paused_partitions.difference_update(assigned)
        if self.active_partition is not None:
            # Ownership loss is sticky for the active record. If the same
            # topic/partition is later assigned again, it is a new ownership
            # epoch and must not authorize committing the old delivery.
            self.active_ownership_survived = (
                self.active_ownership_survived
                and self.active_partition in self.assigned
            )
        self.logger.info(
            "Kafka rebalance member=%s assigned=%s current_assignment=%s "
            "active_partition=%s active_offset=%s ownership_survived=%s",
            _consumer_identity(consumer),
            _format_partitions(partitions),
            _format_partitions(_current_assignment(consumer)),
            self.active_partition,
            self.active_offset,
            self.active_ownership_survived,
        )

    def on_lost(self, consumer: Consumer, partitions) -> None:
        lost = {self._key(partition) for partition in partitions}
        self.assigned.difference_update(lost)
        self.paused_partitions.difference_update(lost)
        active_lost = self.active_partition is not None and self.active_partition in lost
        if active_lost:
            self.active_ownership_survived = False
        self.logger.info(
            "Kafka rebalance member=%s lost=%s current_assignment=%s "
            "active_partition=%s active_offset=%s active_lost=%s "
            "ownership_survived=%s",
            _consumer_identity(consumer),
            _format_partitions(partitions),
            _format_partitions(_current_assignment(consumer)),
            self.active_partition,
            self.active_offset,
            active_lost,
            self.active_ownership_survived,
        )


@dataclass
class _ConsumerCommand:
    action: Literal["commit", "release", "stop"]
    message: ConsumerRecord | None
    completion: concurrent.futures.Future


class _ConsumerThreadFailure:
    def __init__(self, error: BaseException):
        self.error = error


class KafkaConsumerThread:
    """Own a Confluent Consumer on one thread and expose one job at a time."""

    def __init__(self, *, topic: str, group_id: str, logger_name: str):
        self.topic = topic
        self.group_id = group_id
        self.logger = logging.getLogger(logger_name)
        self._jobs: queue.Queue = queue.Queue(maxsize=1)
        self._commands: queue.Queue[_ConsumerCommand] = queue.Queue()
        self._command_ready = threading.Event()
        self._ready = threading.Event()
        self._startup_failure: BaseException | None = None
        self._failure: BaseException | None = None
        self._stopped = threading.Event()
        self._thread = threading.Thread(
            target=self._run,
            name=f"kafka-{logger_name}",
            daemon=True,
        )

    async def start(self) -> None:
        self.start_sync()

    def start_sync(self) -> None:
        self._thread.start()
        self._ready.wait()
        if self._startup_failure is not None:
            raise self._startup_failure

    async def get_message(self, shutdown_event: asyncio.Event) -> ConsumerRecord | None:
        while not shutdown_event.is_set():
            try:
                item = self._jobs.get_nowait()
            except queue.Empty:
                await asyncio.sleep(0.05)
                continue
            if isinstance(item, _ConsumerThreadFailure):
                raise item.error
            return item
        return None

    async def commit(self, message: ConsumerRecord) -> bool:
        return await self._command("commit", message)

    async def release(self, message: ConsumerRecord) -> None:
        await self._command("release", message)

    async def stop(self) -> None:
        if self._thread.is_alive():
            try:
                await self._command("stop", None)
            except Exception:
                pass
        deadline = asyncio.get_running_loop().time() + 10
        while self._thread.is_alive() and asyncio.get_running_loop().time() < deadline:
            await asyncio.sleep(0.01)
        self._thread.join(timeout=0)

    async def _command(self, action, message):
        if self._failure is not None:
            raise RuntimeError("Kafka consumer thread failed") from self._failure
        if self._stopped.is_set() or not self._thread.is_alive():
            raise RuntimeError("Kafka consumer thread is not running")
        completion = concurrent.futures.Future()
        self._commands.put(_ConsumerCommand(action, message, completion))
        self._command_ready.set()
        while not completion.done():
            if self._stopped.is_set():
                raise RuntimeError("Kafka consumer thread stopped before command completion")
            await asyncio.sleep(0.01)
        return completion.result()

    def command_sync(self, action, message):
        if self._failure is not None:
            raise RuntimeError("Kafka consumer thread failed") from self._failure
        if self._stopped.is_set() or not self._thread.is_alive():
            raise RuntimeError("Kafka consumer thread is not running")
        completion = concurrent.futures.Future()
        self._commands.put(_ConsumerCommand(action, message, completion))
        self._command_ready.set()
        return completion.result()

    @staticmethod
    def _complete(future, *, result=None, error=None) -> None:
        if future.done():
            return
        if error is not None:
            future.set_exception(error)
        else:
            future.set_result(result)

    @staticmethod
    def _same_record(left: ConsumerRecord | None, right: ConsumerRecord | None) -> bool:
        return (
            left is not None
            and right is not None
            and left.topic == right.topic
            and left.partition == right.partition
            and left.offset == right.offset
        )

    def _create_consumer(self) -> Consumer:
        return Consumer(
            {
                "bootstrap.servers": settings.KAFKA_BOOTSTRAP_SERVERS,
                "group.id": self.group_id,
                "enable.auto.commit": False,
                "auto.offset.reset": "earliest",
                "group.protocol": "consumer",
            }
        )

    def _run(self) -> None:
        consumer = None
        active_message: ConsumerRecord | None = None
        ready_announced = False
        processing = False
        paused_partitions: set[tuple[str, int]] = set()
        tracker = RebalanceTracker(self.logger, paused_partitions)

        def pause_current_assignment(reason: str) -> None:
            assigned = consumer.assignment()
            assigned_keys = {
                (partition.topic, partition.partition) for partition in assigned
            }
            paused_partitions.intersection_update(assigned_keys)
            to_pause = [
                partition
                for partition in assigned
                if (partition.topic, partition.partition) not in paused_partitions
            ]
            if not to_pause:
                return
            consumer.pause(to_pause)
            paused_partitions.update(
                (partition.topic, partition.partition) for partition in to_pause
            )
            self.logger.info(
                "Paused Kafka partitions for active work member=%s partitions=%s "
                "reason=%s",
                _consumer_identity(consumer),
                _format_partitions(to_pause),
                reason,
            )

        def resume_current_assignment(reason: str) -> None:
            # librdkafka's current assignment is authoritative. In particular,
            # do not restrict resume to the historical local pause set: an
            # incremental rebalance may have changed effective pause state.
            assigned = consumer.assignment()
            if assigned:
                consumer.resume(assigned)
            paused_partitions.clear()
            self.logger.info(
                "Explicitly resumed current Kafka assignment member=%s "
                "partitions=%s reason=%s",
                _consumer_identity(consumer),
                _format_partitions(assigned),
                reason,
            )

        try:
            consumer = self._create_consumer()
            consumer.subscribe(
                [self.topic],
                on_assign=tracker.on_assign,
                on_revoke=tracker.on_revoke,
                on_lost=tracker.on_lost,
            )
            self.logger.info(
                "Kafka consumer started topic=%s group=%s protocol=consumer",
                self.topic,
                self.group_id,
            )
            ready_announced = True
            self._ready.set()
            stopping = False

            while not stopping:
                while True:
                    try:
                        command = self._commands.get_nowait()
                    except queue.Empty:
                        break
                    try:
                        if command.action == "stop":
                            stopping = True
                        elif not self._same_record(command.message, active_message):
                            raise RuntimeError(
                                "Kafka completion command does not match active record"
                            )
                        elif command.action == "commit":
                            settled_message = active_message
                            key = (active_message.topic, active_message.partition)
                            assigned = {
                                (partition.topic, partition.partition)
                                for partition in consumer.assignment()
                            }
                            ownership_survived = (
                                tracker.active_ownership_survived and key in assigned
                            )
                            if ownership_survived:
                                results = consumer.commit(
                                    offsets=[
                                        TopicPartition(
                                            active_message.topic,
                                            active_message.partition,
                                            active_message.offset + 1,
                                        )
                                    ],
                                    asynchronous=False,
                                )
                                for result in results or []:
                                    if result.error is not None:
                                        raise KafkaException(result.error)
                                self.logger.info(
                                    "Settled Kafka offset topic=%s partition=%s offset=%s",
                                    active_message.topic,
                                    active_message.partition,
                                    active_message.offset + 1,
                                )
                            else:
                                self.logger.info(
                                    "Intentional non-commit after ownership loss topic=%s "
                                    "partition=%s offset=%s",
                                    active_message.topic,
                                    active_message.partition,
                                    active_message.offset,
                                )
                            active_message = None
                            tracker.clear_active()
                            processing = False
                            self.logger.info(
                                "Kafka application job settled topic=%s partition=%s "
                                "offset=%s committed=%s; processing true -> false",
                                settled_message.topic,
                                settled_message.partition,
                                settled_message.offset,
                                ownership_survived,
                            )
                            resume_current_assignment("commit settlement")
                            self._complete(command.completion, result=ownership_survived)
                            continue
                        elif command.action == "release":
                            released_message = active_message
                            key = (active_message.topic, active_message.partition)
                            assigned = {
                                (partition.topic, partition.partition)
                                for partition in consumer.assignment()
                            }
                            if key in assigned:
                                consumer.seek(
                                    TopicPartition(
                                        active_message.topic,
                                        active_message.partition,
                                        active_message.offset,
                                    )
                                )
                            active_message = None
                            tracker.clear_active()
                            processing = False
                            self.logger.info(
                                "Kafka application job released topic=%s partition=%s "
                                "offset=%s; processing true -> false",
                                released_message.topic,
                                released_message.partition,
                                released_message.offset,
                            )
                            resume_current_assignment("release settlement")
                        self._complete(command.completion)
                    except BaseException as exc:
                        self._complete(command.completion, error=exc)

                if stopping:
                    break

                if processing:
                    pause_current_assignment("active application job")

                message = consumer.poll(0.25 if processing else 1.0)
                if message is None:
                    continue
                if message.error():
                    if message.error().code() == KafkaError._PARTITION_EOF:
                        continue
                    raise KafkaException(message.error())
                if processing:
                    # Assignment callbacks are served by poll(). The assignment
                    # is paused before the next poll. If a just-assigned
                    # partition supplied one record in the same poll, rewind it
                    # once and pause it; it is never handed to application code.
                    partition = TopicPartition(
                        message.topic(),
                        message.partition(),
                        message.offset(),
                    )
                    consumer.seek(partition)
                    consumer.pause([partition])
                    paused_partitions.add((message.topic(), message.partition()))
                    continue

                try:
                    value = json.loads(message.value().decode("utf-8"))
                except (AttributeError, UnicodeDecodeError, json.JSONDecodeError) as exc:
                    raise ValueError(
                        f"Invalid JSON Kafka record {message.topic()}:{message.partition()}:"
                        f"{message.offset()}"
                    ) from exc
                active_message = ConsumerRecord(
                    topic=message.topic(),
                    partition=message.partition(),
                    offset=message.offset(),
                    key=message.key(),
                    value=value,
                )
                tracker.set_active(active_message, consumer.assignment())
                processing = True
                self.logger.info(
                    "Kafka active message established topic=%s partition=%s offset=%s; "
                    "processing false -> true",
                    active_message.topic,
                    active_message.partition,
                    active_message.offset,
                )
                pause_current_assignment("active message established")
                self._jobs.put_nowait(active_message)

        except BaseException as exc:
            self._failure = exc
            if not ready_announced:
                self._startup_failure = exc
                self._ready.set()
            else:
                try:
                    self._jobs.put_nowait(_ConsumerThreadFailure(exc))
                except queue.Full:
                    pass
        finally:
            failure = self._failure or RuntimeError("Kafka consumer thread stopped")
            while True:
                try:
                    command = self._commands.get_nowait()
                except queue.Empty:
                    break
                self._complete(command.completion, error=failure)
            if consumer is not None:
                consumer.close()
            self._stopped.set()


class BlockingConsumerAdapter:
    """Keep existing synchronous main loops on top of the thread-owned consumer."""

    def __init__(self, consumer_thread: KafkaConsumerThread):
        self._consumer_thread = consumer_thread
        self._active_message: ConsumerRecord | None = None
        self._consumer_thread.start_sync()

    def poll(self, timeout_ms: int = 1000, max_records: int = 1):
        if self._active_message is not None:
            self._consumer_thread.command_sync("release", self._active_message)
            self._active_message = None
        try:
            item = self._consumer_thread._jobs.get(timeout=timeout_ms / 1000)
        except queue.Empty:
            return {}
        if isinstance(item, _ConsumerThreadFailure):
            raise item.error
        self._active_message = item
        return {(item.topic, item.partition): [item]}

    def commit(self) -> bool:
        if self._active_message is None:
            raise RuntimeError("No active Kafka record to commit")
        message = self._active_message
        committed = self._consumer_thread.command_sync("commit", message)
        self._active_message = None
        return committed

    def close(self) -> None:
        if self._consumer_thread._thread.is_alive():
            try:
                self._consumer_thread.command_sync("stop", None)
            finally:
                self._consumer_thread._thread.join(timeout=10)
