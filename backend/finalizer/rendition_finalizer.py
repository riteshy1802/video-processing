import uuid
from app.repositories.chunk_repository import chunk_repository
from app.models import Chunk
from typing import List
from app.database import AsyncSessionLocal

async def check_rendition_ready(rendition_id: str):
    """
        Return True only if every chunk belonging
        to this rendition has status DONE.
    """
    rendition_uuid = uuid.UUID(rendition_id)
    async with AsyncSessionLocal() as db:
        # This returns all the chunks for a specific rendition
        chunks = await chunk_repository.get_by_rendition_id(db, rendition_id=rendition_uuid)
        if not chunks:
            return False
        for chunk in chunks:
            if chunk.status != "DONE":
                return False
        return True