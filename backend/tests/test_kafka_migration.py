import asyncio
import json
import threading
import time
from confluent_kafka import TopicPartition

from app.core.dead_letter import publish_dead_letter
from app.core.kafka import flush_producer, produce_json
from app.core.kafka_consumer import KafkaConsumerThread
from worker.producer import publish_chunk


class FakeMessage:
    def __init__(self, topic="jobs", partition=0, offset=7, value=None):
        self._topic = topic
        self._partition = partition
        self._offset = offset
        self._value = json.dumps(value or {"chunk_id": "chunk-1"}).encode()

    def topic(self):
        return self._topic

    def partition(self):
        return self._partition

    def offset(self):
        return self._offset

    def key(self):
        return None

    def value(self):
        return self._value

    def error(self):
        return None


class FakeConsumer:
    def __init__(self, *, revoke_active=False, assign_during_processing=False):
        self.owner = threading.get_ident()
        self.active = TopicPartition("jobs", 0)
        self.other = TopicPartition("jobs", 1)
        self.assigned = {("jobs", 0)}
        self.revoke_active = revoke_active
        self.assign_during_processing = assign_during_processing
        self.poll_count = 0
        self.commits = []
        self.pauses = []
        self.resumes = []
        self.closed = False
        self.on_assign = None
        self.on_revoke = None

    def _check_thread(self):
        assert threading.get_ident() == self.owner

    def subscribe(self, topics, on_assign, on_revoke, on_lost):
        self._check_thread()
        self.on_assign = on_assign
        self.on_revoke = on_revoke

    def assignment(self):
        self._check_thread()
        return [TopicPartition(topic, partition) for topic, partition in self.assigned]

    def pause(self, partitions):
        self._check_thread()
        self.pauses.extend((p.topic, p.partition) for p in partitions)

    def resume(self, partitions):
        self._check_thread()
        self.resumes.append([(p.topic, p.partition) for p in partitions])

    def memberid(self):
        self._check_thread()
        return "fake-member"

    def seek(self, partition):
        self._check_thread()

    def commit(self, offsets, asynchronous):
        self._check_thread()
        self.commits.append((offsets, asynchronous))
        return [TopicPartition(p.topic, p.partition, p.offset) for p in offsets]

    def poll(self, timeout):
        self._check_thread()
        self.poll_count += 1
        time.sleep(0.005)
        if self.poll_count == 1:
            self.on_assign(self, [self.active])
            return FakeMessage()
        if self.poll_count == 2 and self.revoke_active:
            self.on_revoke(self, [self.active])
            self.assigned = {("jobs", 1)}
            self.on_assign(self, [self.other])
        elif self.poll_count == 2 and self.assign_during_processing:
            self.assigned.add(("jobs", 1))
            self.on_assign(self, [self.other])
        return None

    def close(self):
        self._check_thread()
        self.closed = True


async def run_consumer_scenario(*, revoke=False, assign=False):
    fake_holder = {}
    consumer_thread = KafkaConsumerThread(
        topic="jobs",
        group_id="test-group",
        logger_name="test_consumer",
    )

    def create_fake():
        fake = FakeConsumer(
            revoke_active=revoke,
            assign_during_processing=assign,
        )
        fake_holder["consumer"] = fake
        return fake

    consumer_thread._create_consumer = create_fake
    await consumer_thread.start()
    record = await consumer_thread.get_message(asyncio.Event())
    await asyncio.sleep(0.06)
    committed = await consumer_thread.commit(record)
    await consumer_thread.stop()
    return fake_holder["consumer"], record, committed


def test_normal_consume_exact_commit_and_close():
    fake, record, committed = asyncio.run(run_consumer_scenario())
    assert record.offset == 7
    assert committed is True
    assert fake.commits[0][0][0].offset == 8
    assert fake.commits[0][1] is False
    assert fake.closed is True
    assert fake.owner != threading.get_ident()


def test_active_partition_revoked_does_not_commit_or_cancel_work():
    fake, record, committed = asyncio.run(run_consumer_scenario(revoke=True))
    assert record.offset == 7
    assert fake.poll_count > 2
    assert committed is False
    assert fake.commits == []


def test_new_assignment_is_serviced_while_application_job_is_active():
    fake, _, committed = asyncio.run(run_consumer_scenario(assign=True))
    assert fake.poll_count > 2
    assert ("jobs", 1) in fake.pauses
    assert committed is True


class IncrementalRebalanceConsumer:
    def __init__(self, *, revoke_active: bool):
        self.owner = threading.get_ident()
        self.revoke_active = revoke_active
        self.assigned = {("jobs", 0), ("jobs", 1)}
        self.paused = set()
        self.poll_count = 0
        self.first_delivered = False
        self.second_delivered = False
        self.commits = []
        self.resume_calls = []
        self.on_assign = None
        self.on_revoke = None
        self.on_lost = None

    def _check_thread(self):
        assert threading.get_ident() == self.owner

    def memberid(self):
        self._check_thread()
        return "incremental-member"

    def subscribe(self, topics, on_assign, on_revoke, on_lost):
        self._check_thread()
        self.on_assign = on_assign
        self.on_revoke = on_revoke
        self.on_lost = on_lost

    def assignment(self):
        self._check_thread()
        return [TopicPartition(topic, partition) for topic, partition in self.assigned]

    def pause(self, partitions):
        self._check_thread()
        self.paused.update((p.topic, p.partition) for p in partitions)

    def resume(self, partitions):
        self._check_thread()
        resumed = {(p.topic, p.partition) for p in partitions}
        self.resume_calls.append(resumed)
        self.paused.difference_update(resumed)

    def seek(self, partition):
        self._check_thread()

    def commit(self, offsets, asynchronous):
        self._check_thread()
        self.commits.append((offsets, asynchronous))
        return [TopicPartition(p.topic, p.partition, p.offset) for p in offsets]

    def poll(self, timeout):
        self._check_thread()
        self.poll_count += 1
        time.sleep(0.005)
        if not self.first_delivered:
            self.first_delivered = True
            self.on_assign(
                self,
                [TopicPartition("jobs", 0), TopicPartition("jobs", 1)],
            )
            return FakeMessage(partition=0, offset=7)

        if self.poll_count == 2:
            revoked = {("jobs", 0), ("jobs", 1)} if self.revoke_active else {("jobs", 1)}
            self.on_revoke(
                self,
                [TopicPartition(topic, partition) for topic, partition in revoked],
            )
            self.assigned.difference_update(revoked)
            self.assigned.add(("jobs", 2))
            self.on_assign(self, [TopicPartition("jobs", 2)])
            return None

        if (
            ("jobs", 2) in self.assigned
            and ("jobs", 2) not in self.paused
            and not self.second_delivered
        ):
            self.second_delivered = True
            return FakeMessage(partition=2, offset=11, value={"chunk_id": "chunk-2"})
        return None

    def close(self):
        self._check_thread()


async def run_incremental_resume_scenario(*, release: bool):
    fake_holder = {}
    consumer_thread = KafkaConsumerThread(
        topic="jobs",
        group_id="test-group",
        logger_name="test_incremental_consumer",
    )

    def create_fake():
        fake = IncrementalRebalanceConsumer(revoke_active=release)
        fake_holder["consumer"] = fake
        return fake

    consumer_thread._create_consumer = create_fake
    await consumer_thread.start()
    first = await consumer_thread.get_message(asyncio.Event())
    await asyncio.sleep(0.05)
    if release:
        await consumer_thread.release(first)
    else:
        assert await consumer_thread.commit(first) is True
    second = await asyncio.wait_for(
        consumer_thread.get_message(asyncio.Event()),
        timeout=1,
    )
    await consumer_thread.release(second)
    await consumer_thread.stop()
    return fake_holder["consumer"], second


def test_commit_resumes_entire_current_assignment_after_incremental_rebalance():
    fake, second = asyncio.run(run_incremental_resume_scenario(release=False))
    assert second.partition == 2
    assert second.offset == 11
    assert {("jobs", 0), ("jobs", 2)} in fake.resume_calls


def test_release_resumes_entire_current_assignment_after_incremental_rebalance():
    fake, second = asyncio.run(run_incremental_resume_scenario(release=True))
    assert second.partition == 2
    assert second.offset == 11
    assert {("jobs", 2)} in fake.resume_calls


class FakeDeliveryMessage:
    def topic(self):
        return "jobs"

    def partition(self):
        return 2

    def offset(self):
        return 12


class FakeProducer:
    def __init__(self):
        self.events = []
        self.callback = None
        self.value = None

    def produce(self, topic, key, value, on_delivery):
        self.events.append("produce")
        self.value = value
        self.callback = on_delivery

    def poll(self, timeout):
        self.events.append("delivery_ack")
        if self.callback is not None:
            callback, self.callback = self.callback, None
            callback(None, FakeDeliveryMessage())

    def flush(self, timeout=None):
        self.events.append("flush")
        self.poll(0)
        return 0


def test_producer_serialization_and_delivery_acknowledgement():
    producer = FakeProducer()
    future = produce_json(producer, "jobs", {"chunk_id": "chunk-1", "attempt": 2})
    metadata = future.get(timeout=1)
    assert json.loads(producer.value) == {"chunk_id": "chunk-1", "attempt": 2}
    assert metadata.partition == 2 and metadata.offset == 12


def test_retry_is_acknowledged_before_source_settlement():
    producer = FakeProducer()
    future = publish_chunk(producer, "chunk-1", attempt=2)
    future.get(timeout=1)
    producer.events.append("source_settlement")
    assert producer.events.index("delivery_ack") < producer.events.index(
        "source_settlement"
    )


def test_dlq_is_acknowledged_and_flushed_before_source_settlement():
    producer = FakeProducer()
    publish_dead_letter(
        producer=producer,
        dlq_topic="jobs.dlq",
        message={"payload": {"chunk_id": "chunk-1"}},
    )
    producer.events.append("source_settlement")
    assert producer.events.index("delivery_ack") < producer.events.index(
        "source_settlement"
    )
    assert producer.events.index("flush") < producer.events.index("source_settlement")


def test_consumer_configuration_enables_kip848_without_classic_timers(monkeypatch):
    captured = {}

    def fake_constructor(config):
        captured.update(config)
        return object()

    monkeypatch.setattr("app.core.kafka_consumer.Consumer", fake_constructor)
    consumer_thread = KafkaConsumerThread(
        topic="jobs",
        group_id="test-group",
        logger_name="test_consumer",
    )
    consumer_thread._create_consumer()
    assert captured["group.protocol"] == "consumer"
    assert captured["enable.auto.commit"] is False
    assert "session.timeout.ms" not in captured
    assert "heartbeat.interval.ms" not in captured
    assert "partition.assignment.strategy" not in captured


def test_producer_shutdown_flushes_pending_delivery():
    producer = FakeProducer()
    produce_json(producer, "jobs", {"video_id": "video-1"})
    flush_producer(producer)
    assert producer.callback is None
    assert "flush" in producer.events
