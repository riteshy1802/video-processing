# import asyncio
# import logging
# import shutil
# import subprocess
# import tempfile
# import uuid
# from pathlib import Path
# from app.database import AsyncSessionLocal
# from app.repositories.video_repository import video_repository
# from app.services.s3 import s3_service
# from app.config import settings

# from PIL import Image, ImageFilter, ImageStat

# logger = logging.getLogger("thumbnail_generator")

# CANDIDATE_POSITIONS = [0.10, 0.30, 0.50, 0.70, 0.90]


# def get_candidate_timestamps(duration_seconds: float) -> list[float]:
#     """
#         Returns the timestamps of the 10%, 30%, 50%, 70%, 90%
#     """
#     if duration_seconds <= 0:
#         raise ValueError("Video duration must be greater than 0")

#     return [duration_seconds * position for position in CANDIDATE_POSITIONS]


# async def extract_candidate(
#     input_url: str,
#     timestamp: float,
#     output_path: Path,
# ) -> None:
#     command = [
#         "ffmpeg",
#         "-y",
#         "-nostdin",
#         "-hide_banner",
#         "-loglevel",
#         "error",
#         # Put -ss BEFORE -i for fast seeking
#         "-ss",
#         str(timestamp),
#         "-i",
#         input_url,
#         "-frames:v",
#         "1",
#         # Thumbnail doesn't need original resolution
#         "-vf",
#         "scale=640:-2",
#         str(output_path),
#     ]
#     def run_ffmpeg() -> subprocess.CompletedProcess[bytes]:
#         return subprocess.run(
#             command,
#             stdout=subprocess.DEVNULL,
#             stderr=subprocess.PIPE,
#             timeout=settings.THUMBNAIL_FFMPEG_TIMEOUT_SECONDS,
#             check=False,
#         )

#     try:
#         # This worker processes one Kafka job at a time. Running FFmpeg directly
#         # avoids unreliable child-process waits when it is spawned from a thread.
#         result = run_ffmpeg()
#     except subprocess.TimeoutExpired as exc:
#         stderr = exc.stderr or b""
#         details = (
#             stderr.decode(errors="replace")
#             if isinstance(stderr, bytes)
#             else str(stderr)
#         ).strip()
#         raise RuntimeError(
#             "FFmpeg thumbnail extraction timed out after "
#             f"{settings.THUMBNAIL_FFMPEG_TIMEOUT_SECONDS}s at {timestamp:.2f}s"
#             + (f": {details}" if details else "")
#         ) from exc

#     if result.returncode != 0:
#         raise RuntimeError(
#             "FFmpeg thumbnail extraction failed: "
#             f"{result.stderr.decode(errors='replace')}"
#         )

#     if not output_path.is_file() or output_path.stat().st_size == 0:
#         raise RuntimeError(
#             f"FFmpeg returned success but produced no thumbnail at {timestamp:.2f}s"
#         )


# def score_thumbnail(path: Path) -> float:
#     with Image.open(path) as image:

#         gray = image.convert("L")
#         gray.thumbnail((320, 180))

#         stats = ImageStat.Stat(gray)

#         brightness = stats.mean[0]
#         contrast = stats.stddev[0]

#         edges = gray.filter(ImageFilter.FIND_EDGES)
#         edge_stats = ImageStat.Stat(edges)

#         sharpness = edge_stats.mean[0]

#         # Reject extremely dark / bright frames
#         if brightness < 25:
#             return -1.0

#         if brightness > 235:
#             return -1.0

#         # Reject extremely flat frames
#         if contrast < 12:
#             return -1.0

#         score = contrast * 0.4 + sharpness * 0.6

#         return score


# async def generate_best_thumbnail(
#     input_url: str,
#     duration_seconds: float,
#     temp_dir: Path,
# ) -> Path:
#     timestamps = get_candidate_timestamps(duration_seconds)
#     candidates = []
#     for index, timestamp in enumerate(timestamps):

#         output_path = temp_dir / f"candidate_{index}.webp"

#         try:
#             logger.info(
#                 "Extracting thumbnail candidate %s/%s at %.2fs",
#                 index + 1,
#                 len(timestamps),
#                 timestamp,
#             )
#             await extract_candidate(
#                 input_url=input_url,
#                 timestamp=timestamp,
#                 output_path=output_path,
#             )

#             score = score_thumbnail(output_path)

#             logger.info(
#                 "Thumbnail candidate %s timestamp=%.2fs score=%.2f",
#                 index + 1,
#                 timestamp,
#                 score,
#             )

#             candidates.append(
#                 {
#                     "path": output_path,
#                     "timestamp": timestamp,
#                     "score": score,
#                 }
#             )

#         except Exception:
#             logger.exception(
#                 "Failed thumbnail candidate timestamp=%.2f",
#                 timestamp,
#             )

#     if not candidates:
#         raise RuntimeError("Could not generate any thumbnail candidates")

#     best = max(candidates, key=lambda candidate: candidate["score"])

#     logger.info(
#         "Selected thumbnail timestamp=%.2fs score=%.2f",
#         best["timestamp"],
#         best["score"],
#     )

#     return best["path"]


# async def process_thumbnail(video_id: str) -> str:
#     video_uuid = uuid.UUID(video_id)

#     async with AsyncSessionLocal() as db:
#         video = await video_repository.get_by_id(db, video_id=video_uuid)
#         if video is None:
#             raise ValueError(f"Video not found: {video_id}")
#         if not video.duration_seconds:
#             raise ValueError(f"Video duration unavailable: {video_id}")
#         video_s3_key = video.s3_key
#         duration_seconds = video.duration_seconds

#     temp_dir = Path(tempfile.mkdtemp(prefix=f"thumbnail_{video_id}_"))
#     source_suffix = Path(video_s3_key).suffix or ".video"
#     local_source_path = temp_dir / f"source{source_suffix}"
#     thumbnail_key = f"videos/{video_id}/thumbnail/thumbnail.webp"

#     try:
#         logger.info(
#             "Downloading source once for local thumbnail extraction: video_id=%s",
#             video_id,
#         )
#         downloaded = s3_service.download_file(
#             s3_key=video_s3_key,
#             local_file_path=str(local_source_path),
#         )
#         if not downloaded:
#             raise RuntimeError(
#                 f"Could not download source video for thumbnail generation: {video_s3_key}"
#             )

#         logger.info(
#             "Source downloaded for thumbnail extraction: video_id=%s bytes=%s",
#             video_id,
#             local_source_path.stat().st_size,
#         )
#         thumbnail_path = await generate_best_thumbnail(
#             input_url=str(local_source_path),
#             duration_seconds=duration_seconds,
#             temp_dir=temp_dir,
#         )
#         uploaded = s3_service.upload_file(
#             local_file_path=str(thumbnail_path),
#             s3_key=thumbnail_key,
#             content_type="image/webp",
#         )
#         if not uploaded:
#             raise RuntimeError(
#                 f"S3 thumbnail upload failed for video {video_id}: {thumbnail_key}"
#             )

#         logger.info(
#             "Thumbnail uploaded successfully: video_id=%s key=%s",
#             video_id,
#             thumbnail_key,
#         )
#         return thumbnail_key
#     finally:
#         shutil.rmtree(temp_dir, ignore_errors=True)
