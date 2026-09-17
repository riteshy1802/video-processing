import uuid
import logging
from app.database import AsyncSessionLocal
from sqlalchemy import select
from app.models import Chunk, Rendition, Video

logger = logging.getLogger("transcoder")


async def fetch_chunk_rendition_video_data(chunk_id: str):
    """
    Helps to fetch the chunk data, rendition data, and video data for a given chunk_id
    """
    try:
        chunk_uuid = uuid.UUID(chunk_id) if isinstance(chunk_id, str) else chunk_id
    except ValueError:
        logger.error(f"Invalid chunk UUID string: '{chunk_id}'")
        return None

    async with AsyncSessionLocal() as db:
        stmt = (
            select(
                Chunk.id,
                Video.s3_key,
                Rendition.resolution,
                Chunk.start_seconds,
                Chunk.end_seconds,
                Chunk.temporary_s3_prefix,
            )
            .join(Rendition, Chunk.rendition_id == Rendition.id)
            .join(Video, Rendition.video_id == Video.id)
            .where(Chunk.id == chunk_uuid)
        )
        result = await db.execute(stmt)
        return result.mappings().first()


async def main_worker(chunk_id: str):
    """
    This is the main worker function that will be called by the worker process.
    It will fetch the chunk data, rendition data, and video data for a given chunk_id
    and then print the details.
    """
    result = await fetch_chunk_rendition_video_data(chunk_id)
    if not result:
        logger.warning(f"No database records found for chunk_id: {chunk_id}")
        return

    print("=" * 60)
    print(f"  Chunk ID   : {result['id']}")
    print(f"  Source S3  : {result['s3_key']}")
    print(f"  Resolution : {result['resolution']}p")
    print(f"  Time Range : {result['start_seconds']}s -> {result['end_seconds']}s")
    print(f"  Target S3  : {result['temporary_s3_prefix']}")
    print("=" * 60)
