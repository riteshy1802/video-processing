import asyncio
import json
import logging
import uuid
from typing import AsyncGenerator
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models import Video, Rendition
from app.services.redis_publisher import get_async_redis_client
from app.services.thumbnail_service import build_thumbnail_url

logger = logging.getLogger("sse_events")
router = APIRouter(prefix="/api/videos", tags=["Real-time Events"])


async def build_initial_state_snapshot(db: AsyncSession, video_id: uuid.UUID) -> dict:
    """
    Fetch current full processing state from PostgreSQL database.
    PostgreSQL is the single source of truth.
    """
    stmt = (
        select(Video)
        .options(selectinload(Video.renditions).selectinload(Rendition.chunks))
        .where(Video.id == video_id)
    )
    res = await db.execute(stmt)
    video = res.scalar_one_or_none()

    if not video:
        return {}

    rendition_list = []
    all_chunks = []

    for r in sorted(video.renditions, key=lambda x: x.resolution, reverse=True):
        r_status = (r.status or "PENDING").upper()
        chunks_for_r = sorted(r.chunks, key=lambda c: c.chunk_index)

        chunk_info_list = []
        completed_count = 0
        total_progress_sum = 0.0

        for c in chunks_for_r:
            c_status = (c.status or "PENDING").upper()
            c_prog = (
                100.0
                if c_status in ("DONE", "READY")
                else 0.0
                if c_status in ("PENDING", "CANCELLED")
                else min(99.0, max(0.0, c.progress_percent or 0.0))
            )
            if c_status in ("DONE", "READY"):
                completed_count += 1
            total_progress_sum += c_prog

            c_dict = {
                "chunk_id": str(c.id),
                "rendition_id": str(r.id),
                "video_id": str(video.id),
                "chunk_index": c.chunk_index,
                "resolution": r.resolution,
                "status": c_status,
                "progress": round(c_prog, 1),
                "worker_id": c.worker_id,
                "error": c.error_message,
                "start_seconds": c.start_seconds,
                "end_seconds": c.end_seconds,
                "processing_time_seconds": c.processing_time_seconds,
                "attempt_count": c.attempt_count,
            }
            chunk_info_list.append(c_dict)
            all_chunks.append(c_dict)

        num_chunks = len(chunks_for_r)
        r_progress = (
            round(total_progress_sum / num_chunks, 1)
            if num_chunks > 0
            else (100.0 if r_status == "READY" else 0.0)
        )

        rendition_list.append(
            {
                "rendition_id": str(r.id),
                "video_id": str(video.id),
                "resolution": r.resolution,
                "status": r_status,
                "progress": r_progress,
                "processing_time_seconds": r.processing_time_seconds,
                "total_chunks": num_chunks,
                "completed_chunks": completed_count,
                "chunks": chunk_info_list,
            }
        )

    v_status = (video.status or "PROCESSING").upper()

    return {
        "type": "initial.state",
        "video_id": str(video.id),
        "status": v_status,
        "error": video.error_message,
        "message": video.error_message,
        "filename": video.original_filename,
        "duration_seconds": video.duration_seconds,
        "source_height": video.source_height,
        "source_frame_rate": video.source_frame_rate,
        "thumbnail_url": build_thumbnail_url(video.id, video.thumbnail_version),
        "thumbnail_version": video.thumbnail_version,
        "total_renditions": len(rendition_list),
        "total_chunks": len(all_chunks),
        "completed_chunks": sum(
            1 for chunk in all_chunks if chunk["status"] in ("DONE", "READY")
        ),
        "overall_progress": round(
            sum(chunk["progress"] for chunk in all_chunks) / len(all_chunks), 1
        )
        if all_chunks
        else 0.0,
        "renditions": rendition_list,
        "chunks": all_chunks,
    }


@router.get(
    "/{video_id}/processing-state",
    summary="Current Video Processing State",
    description="Returns the durable rendition/chunk hierarchy from PostgreSQL.",
)
async def get_video_processing_state(
    video_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    snapshot = await build_initial_state_snapshot(db, video_id)
    if not snapshot:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Video asset {video_id} not found",
        )
    return snapshot


@router.get(
    "/{video_id}/events",
    summary="Real-Time Video Progress SSE Stream",
    description="Streams real-time processing events (chunk.progress, rendition.ready, video.ready) for a specific video using SSE.",
)
async def stream_video_events(
    video_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    # 1. Validate video existence
    stmt = select(Video.id).where(Video.id == video_id)
    res = await db.execute(stmt)
    if not res.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Video asset {video_id} not found",
        )

    # 2. Define event generator for Server-Sent Events
    async def event_generator() -> AsyncGenerator[str, None]:
        # Subscribe before building the snapshot. Events published after this point
        # remain buffered by Pub/Sub while PostgreSQL is read, preventing the
        # snapshot-to-subscription race from dropping live chunk progress.
        channel_name = f"video:{video_id}:progress"
        redis_client = get_async_redis_client()
        pubsub = redis_client.pubsub()

        try:
            await pubsub.subscribe(channel_name)
            logger.info(f"SSE client subscribed to Redis channel: {channel_name}")

            # PostgreSQL is still the authoritative initial state. Any duplicate
            # queued Redis event is harmless because frontend updates are monotonic.
            snapshot = await build_initial_state_snapshot(db, video_id)
            yield f"data: {json.dumps(snapshot)}\n\n"

            # If video is already terminal, the snapshot is all the client needs.
            v_status = snapshot.get("status", "").upper()
            if v_status in ("READY", "FAILED", "CANCELLED"):
                return

            idle_seconds = 0
            while True:
                try:
                    message = await pubsub.get_message(
                        ignore_subscribe_messages=True, timeout=1.0
                    )
                    if message and message.get("type") == "message":
                        data_str = message.get("data")
                        logger.info(
                            f"SSE streaming event to client on channel {channel_name}: {data_str}"
                        )
                        yield f"data: {data_str}\n\n"
                        idle_seconds = 0

                        # If message indicates video finished, close stream cleanly
                        try:
                            evt = json.loads(data_str)
                            if evt.get("type") in (
                                "video.ready",
                                "video.failed",
                                "video.cancelled",
                            ):
                                await asyncio.sleep(1.0)
                                break
                        except Exception:
                            pass
                    else:
                        idle_seconds += 1
                        if idle_seconds >= 15:
                            yield ": ping\n\n"
                            idle_seconds = 0
                except asyncio.CancelledError:
                    raise
                except Exception as ex:
                    logger.warning(
                        f"Error reading message from pubsub channel {channel_name}: {ex}"
                    )
                    await asyncio.sleep(1.0)

        except asyncio.CancelledError:
            logger.info(f"SSE client disconnected from {channel_name}")
        except Exception as e:
            logger.warning(f"Error in SSE generator for {video_id}: {e}")
        finally:
            try:
                await pubsub.unsubscribe(channel_name)
                await pubsub.close()
            except Exception:
                pass

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
