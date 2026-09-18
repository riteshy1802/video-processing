from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import logging
from app.config import settings
from app.api import videos, events

# Configure logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("video_api")

app = FastAPI(
    title="Distributed Video Transcoding Platform API",
    version="1.0.0",
    description="Phase 1: Secure Direct S3 Uploads, Metadata Verification, and Temporary Playback Links",
)


# Global exception handler to preserve CORS headers on unexpected errors
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled server exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error", "error": str(exc)},
        headers={"Access-Control-Allow-Origin": "*"},
    )


# Universal CORS middleware allowing all origins, methods, and headers
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API Routers
app.include_router(videos.router)
app.include_router(events.router)


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
