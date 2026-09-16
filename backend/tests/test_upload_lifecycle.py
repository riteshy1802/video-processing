import pytest
import pytest_asyncio
from unittest.mock import patch
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from app.main import app
from app.database import Base, get_db

# In-memory SQLite async engine for tests
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

test_engine = create_async_engine(
    TEST_DATABASE_URL,
    echo=False,
    future=True,
)

TestingSessionLocal = async_sessionmaker(
    test_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

async def override_get_db():
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with TestingSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()

app.dependency_overrides[get_db] = override_get_db

client = TestClient(app)

def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["phase"] == 1

def test_create_video_validation():
    # Invalid MIME type
    response = client.post(
        "/api/videos",
        json={
            "filename": "document.pdf",
            "content_type": "application/pdf",
            "file_size_bytes": 1024
        }
    )
    assert response.status_code == 400
    assert "Unsupported content type" in response.json()["detail"]

    # File size too large
    response = client.post(
        "/api/videos",
        json={
            "filename": "huge.mp4",
            "content_type": "video/mp4",
            "file_size_bytes": 10 * 1024 * 1024 * 1024 * 1024  # Extremely huge
        }
    )
    assert response.status_code == 400
    assert "File size exceeds" in response.json()["detail"]

@patch("app.services.s3.s3_service.generate_presigned_put_url")
@patch("app.services.s3.s3_service.verify_object_exists")
@patch("app.services.s3.s3_service.generate_presigned_get_url")
@patch("app.services.s3.s3_service.delete_object")
def test_full_upload_lifecycle(mock_delete, mock_get_url, mock_verify, mock_put_url):
    mock_put_url.return_value = "https://test-bucket.s3.amazonaws.com/videos/mock/original/test.mp4?presigned=put"
    mock_get_url.return_value = "https://test-bucket.s3.amazonaws.com/videos/mock/original/test.mp4?presigned=get"
    mock_verify.return_value = {"content_length": 1048576, "content_type": "video/mp4"}
    mock_delete.return_value = True

    # Step 1: Initiate video upload
    create_res = client.post(
        "/api/videos",
        json={
            "filename": "test_video.mp4",
            "content_type": "video/mp4",
            "file_size_bytes": 1048576
        }
    )
    assert create_res.status_code == 201
    create_data = create_res.json()
    assert "video_id" in create_data
    assert "upload_url" in create_data
    assert "s3_key" in create_data
    video_id = create_data["video_id"]
    assert f"videos/{video_id}/original/test_video.mp4" in create_data["s3_key"]

    # Step 2: Complete direct S3 upload (HeadObject verification)
    complete_res = client.post(f"/api/videos/{video_id}/complete")
    assert complete_res.status_code == 200
    complete_data = complete_res.json()
    assert complete_data["video_id"] == video_id
    assert complete_data["status"] == "UPLOADED"

    # Step 3: List videos
    list_res = client.get("/api/videos")
    assert list_res.status_code == 200
    videos_list = list_res.json()
    assert any(v["id"] == video_id for v in videos_list)

    # Step 4: Get video detail (presigned GET URL)
    detail_res = client.get(f"/api/videos/{video_id}")
    assert detail_res.status_code == 200
    detail_data = detail_res.json()
    assert detail_data["id"] == video_id
    assert detail_data["status"] == "UPLOADED"
    assert detail_data["original_url"] == "https://test-bucket.s3.amazonaws.com/videos/mock/original/test.mp4?presigned=get"

    # Step 5: Delete video
    delete_res = client.delete(f"/api/videos/{video_id}")
    assert delete_res.status_code == 204

    # Verify video is no longer found
    detail_after_res = client.get(f"/api/videos/{video_id}")
    assert detail_after_res.status_code == 404
