from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import logging
from app.config import settings
from app.api import videos

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("video_api")

app = FastAPI(
    title="Distributed Video Transcoding Platform API",
    version="1.0.0",
    description="Phase 1: Secure Direct S3 Uploads, Metadata Verification, and Temporary Playback Links",
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_ORIGIN, "http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API Routers
app.include_router(videos.router)

@app.get("/health", tags=["System"])
@app.get("/api/health", tags=["System"])
async def health_check():
    """System health check endpoint."""
    return {
        "status": "healthy",
        "phase": 1,
        "aws_region": settings.AWS_REGION,
        "s3_bucket": settings.S3_BUCKET_NAME,
    }
