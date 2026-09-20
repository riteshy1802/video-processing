import uuid
import logging
import asyncio
from datetime import datetime, timezone
from app.database import AsyncSessionLocal
from app.models.video import Video
from app.repositories.rendition_repository import rendition_repository
from app.repositories.video_repository import video_repository
from app.services.s3 import s3_service
from app.services.redis_publisher import publish_event_async
from app.services.pipeline_settlement import settle_stopped_video
from app.core.failure_handling import PermanentJobError

def calculate_rendition_width(
    source_width: int,
    source_height: int,
    target_height: int,
) -> int:
    width = round(source_width * target_height / source_height)

    # FFmpeg scale=-2 requires an even width
    if width % 2 != 0:
        width += 1

    return width


RENDITION_BANDWIDTHS = {
    360: 800_000,
    480: 1_400_000,
    720: 2_800_000,
    1080: 5_000_000,
    1440: 8_000_000,
}

logger = logging.getLogger("video_finalizer")


def generate_master_playlist(
    video: Video,
    renditions,
) -> str:
    lines = ["#EXTM3U", "#EXT-X-VERSION:3"]

    for rendition in sorted(
        renditions,
        key=lambda r: r.resolution,
    ):
        height = rendition.resolution
        width = calculate_rendition_width(
            source_width=video.source_width,
            source_height=video.source_height,
            target_height=height,
        )
        bandwidth = RENDITION_BANDWIDTHS[height]
        lines.append(
            f"#EXT-X-STREAM-INF:BANDWIDTH={bandwidth},RESOLUTION={width}x{height}"
        )
        lines.append(f"{height}p/index.m3u8")

    return "\n".join(lines) + "\n"


async def check_all_renditions_complete(video_id: str) -> bool:
    """
    This is used to check if all the renditions of a video_id are processed and marked done:
    """
    try:
        video_uuid = uuid.UUID(video_id)
    except ValueError:
        return False
    async with AsyncSessionLocal() as db:
        all_renditions = await rendition_repository.get_by_video_id(db, video_uuid)
        if not all_renditions:
            return False
        return all(rendition.status == "READY" for rendition in all_renditions)


async def finalize_video(
    video_id: str,
    cancel_event: asyncio.Event | None = None,
) -> bool:
    print(f"FINALIZE VIDEO RECEIVED: {video_id}")
    try:
        video_uuid = uuid.UUID(video_id)
    except (ValueError, TypeError) as exc:
        raise PermanentJobError(
            f"Invalid video UUID: {video_id}"
        ) from exc
    # Claim in a short transaction and snapshot all playlist inputs. S3 work
    # happens only after this session has returned its connection.
    async with AsyncSessionLocal() as db:
        video = await video_repository.get_by_id(db, video_id=video_uuid)
        if video is None:
            raise PermanentJobError(
                f"Video does not exist in database: video_id={video_id}"
            )

        if video.status in {"CANCELLING", "CANCELLED", "FAILING", "FAILED"}:
            settlement = await settle_stopped_video(db, video_uuid)
            if settlement.status != "PROCESSING":
                logger.info(
                    "Skipping video finalization %s because cancellation is terminal/incomplete",
                    video_id,
                )
                return True
            video = await video_repository.get_by_id(db, video_id=video_uuid)
            logger.info(
                "Allowing video %s to finish because all chunks and renditions completed before cancellation",
                video_id,
            )

        # Fetch all renditions :
        renditions = await rendition_repository.get_by_video_id(db, video_id=video_uuid)
        if not renditions:
            raise PermanentJobError(
                f"No renditions found for video_id={video_id}"
            )

        # as we have the renditions just use them to check their readiness (all should be READY status before we publish the video for the finalization):

        if not all(rendition.status == "READY" for rendition in renditions):
            logger.warning(f"Not all renditions are READY for video {video_id}")
            return False

        claimed = await video_repository.claim_for_finalization(db, video_id=video_uuid)
        if not claimed:
            logger.info(f"Video {video_id} could not be claimed for finalization")
            return False
        logger.info(f"Video {video_id} successfully claimed for the finalization")

        # Build from the loaded snapshot while the claim is durable.
        master_playlist = generate_master_playlist(video=video, renditions=renditions)
        master_playlist_key = f"videos/{video.id}/processed/master.m3u8"

    await publish_event_async(
        video_id,
        {
            "type": "video.finalizing",
            "video_id": video_id,
            "status": "FINALIZING",
        },
    )

    # boto3 is synchronous. Keep it off the asyncio loop and do not retain a
    # DB session while the network upload is in progress.
    await asyncio.to_thread(
        s3_service.put_text_file,
        s3_key=master_playlist_key,
        content=master_playlist,
    )
    logger.info(f"Master playlist uploaded: {master_playlist_key}")

    # Re-check under the video-row lock immediately before READY. If a
    # cancellation raced here, completed renditions are allowed to finish;
    # incomplete cancellation is never overwritten.
    async with AsyncSessionLocal() as db:
        current_status = await video_repository.get_status_for_update(db, video_uuid)
        if current_status in {"CANCELLING", "CANCELLED", "FAILING", "FAILED"}:
            await db.rollback()
            settlement = await settle_stopped_video(db, video_uuid)
            if settlement.status != "PROCESSING":
                logger.info(
                    "Not marking video %s READY because cancellation is incomplete/terminal",
                    video_id,
                )
                return True
            claimed = await video_repository.claim_for_finalization(db, video_uuid)
            if not claimed:
                logger.info(
                    "Video %s completion-race finalization was already claimed",
                    video_id,
                )
                return True
        elif current_status == "PROCESSING":
            await db.rollback()
            claimed = await video_repository.claim_for_finalization(db, video_uuid)
            if not claimed:
                return True
        elif current_status != "FINALIZING":
            await db.rollback()
            logger.info(
                "Not marking video %s READY from status %s",
                video_id,
                current_status,
            )
            return True

        completed_at = datetime.now(timezone.utc)
        marked_ready = await video_repository.mark_ready_if_finalizing(
            db,
            video_uuid,
            completed_at,
        )
        if not marked_ready:
            await db.rollback()
            logger.info("Video %s lost its READY transition to cancellation", video_id)
            return True
        await db.commit()
        logger.info(f"Video {video_id} finalized successfully")

    await publish_event_async(
        video_id,
        {
            "type": "video.ready",
            "video_id": video_id,
            "status": "READY",
        },
    )
    return True
