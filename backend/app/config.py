from pydantic_settings import BaseSettings
from pydantic import Field
from typing import List

import os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENV_FILE_PATH = os.path.join(BASE_DIR, ".env")


class Settings(BaseSettings):
    DATABASE_URL: str = Field(
        default="postgresql+asyncpg://postgres:postgres@localhost:5432/postgres",
        description="PostgreSQL Connection String (from Supabase)",
    )
    AWS_REGION: str = Field(
        default="us-east-1", description="AWS Region for S3 and AWS services"
    )
    S3_BUCKET_NAME: str = Field(
        default="video-transcoding-dev-bucket", description="S3 bucket name for uploads"
    )
    AWS_ACCESS_KEY_ID: str | None = Field(
        default=None, description="Optional local AWS Access Key ID"
    )
    AWS_SECRET_ACCESS_KEY: str | None = Field(
        default=None, description="Optional local AWS Secret Access Key"
    )
    AWS_SESSION_TOKEN: str | None = Field(
        default=None, description="Optional local AWS Session Token"
    )
    PRESIGNED_UPLOAD_EXPIRY_SECONDS: int = Field(
        default=900, description="Upload URL expiration in seconds (default 15m)"
    )
    PRESIGNED_DOWNLOAD_EXPIRY_SECONDS: int = Field(
        default=900, description="Download URL expiration in seconds (default 15m)"
    )
    FRONTEND_ORIGIN: str = Field(
        default="http://localhost:3000", description="CORS allowed frontend origin"
    )
    CLOUDFRONT_DOMAIN: str | None = Field(
        default=None, description="Optional CloudFront domain for future HLS delivery"
    )
    MAX_UPLOAD_SIZE_BYTES: int = Field(
        default=5 * 1024 * 1024 * 1024,  # 5 GB
        description="Maximum allowed video file size in bytes",
    )
    ALLOWED_CONTENT_TYPES: List[str] = Field(
        default=[
            "video/mp4",
            "video/quicktime",
            "video/x-matroska",
            "video/webm",
            "video/avi",
            "video/mpeg",
        ],
        description="Allowed video MIME types",
    )
    KAFKA_BOOTSTRAP_SERVERS: str = Field(
        default="localhost:9092", description="Helps the instances find Kafka servers"
    )
    KAFKA_PLANNER_TOPIC: str = Field(
        default="planner.jobs", description="Name of the planner topic"
    )
    KAFKA_PLANNER_GROUP_ID: str = Field(
        default="video-planners",
        description="Name of the consumer group for the planner",
    )
    KAFKA_WORKER_TOPIC: str = Field(
        default="transcode.jobs", description="Name of the worker topic"
    )
    KAFKA_WORKER_GROUP_ID: str = Field(
        default="video-transcoders",
        description="Name of the consumer group for the worker doing video rendition processing",
    )
    SUPPORTED_RENDITIONS: List[int] = Field(
        default=[360, 480, 720, 1080, 1440],
        description="The renditions which are supported",
    )
    DISTRIBUTED_THRESHOLD_SECONDS: int = Field(
        default=600, description="Minimum duration of video to enable chunking"
    )
    CHUNK_DURATION_SECONDS: int = Field(
        default=300, description="The duration width of a chunk generated"
    )

    @property
    def async_database_url(self) -> str:
        """Returns database URL formatted for asyncpg driver."""
        url = self.DATABASE_URL
        if url.startswith("postgresql://"):
            return url.replace("postgresql://", "postgresql+asyncpg://", 1)
        if url.startswith("postgres://"):
            return url.replace("postgres://", "postgresql+asyncpg://", 1)
        return url

    @property
    def sync_database_url(self) -> str:
        """Returns database URL formatted for sync psycopg2 driver (used by Alembic)."""
        url = self.DATABASE_URL
        if url.startswith("postgresql+asyncpg://"):
            return url.replace("postgresql+asyncpg://", "postgresql+psycopg2://", 1)
        if url.startswith("postgres://"):
            return url.replace("postgres://", "postgresql+psycopg2://", 1)
        if url.startswith("postgresql://") and not url.startswith("postgresql+"):
            return url.replace("postgresql://", "postgresql+psycopg2://", 1)
        return url

    model_config = {
        "env_file": (ENV_FILE_PATH, ".env"),
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }


settings = Settings()
