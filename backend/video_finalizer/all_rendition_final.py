import uuid
import logging
from datetime import datetime, timezone
from app.database import AsyncSessionLocal
from app.models.video import Video
from app.repositories.rendition_repository import rendition_repository
from app.repositories.video_repository import video_repository
from app.services.s3 import s3_service


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


async def finalize_video(video_id: str) -> bool:
    print(f"FINALIZE VIDEO RECEIVED: {video_id}")
    try:
        video_uuid = uuid.UUID(video_id)
    except ValueError:
        logger.error(f"Invalid video UUID: {video_id}")
        return False
    async with AsyncSessionLocal() as db:
        video = await video_repository.get_by_id(db, video_id=video_uuid)
        if video is None:
            logger.warning(f"Video {video_id} does not exist")
            return False

        # Fetch all renditions :
        renditions = await rendition_repository.get_by_video_id(db, video_id=video_uuid)
        if not renditions:
            logger.warning(f"No renditions found for video {video_id}")
            return False

        # as we have the renditions just use them to check their readiness (all should be READY status before we publish the video for the finalization):

        if not all(rendition.status == "READY" for rendition in renditions):
            logger.warning(f"Not all renditions are READY for video {video_id}")
            return False

        claimed = await video_repository.claim_for_finalization(db, video_id=video_uuid)
        if not claimed:
            logger.info(f"Video {video_id} could not be claimed for finalization")
            return False
        logger.info(f"Video {video_id} successfully claimed for the finalization")

        # master m3u8 generation:
        master_playlist = generate_master_playlist(video=video, renditions=renditions)
        master_playlist_key = f"videos/{video.id}/processed/master.m3u8"
        s3_service.put_text_file(
            s3_key=master_playlist_key,
            content=master_playlist,
        )
        logger.info(f"Master playlist uploaded: {master_playlist_key}")
        # Mark the Job completed :
        completed_at = datetime.now(timezone.utc)
        video.status = "READY"
        video.completed_at = completed_at
        await db.commit()
        logger.info(f"Video {video.id} finalized successfully")
    return True
