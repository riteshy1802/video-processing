import boto3
from botocore.exceptions import ClientError
from botocore.config import Config
import logging
import re
from typing import Dict, Any, Optional
from app.config import settings

logger = logging.getLogger("s3_service")

class S3Service:
    def __init__(self):
        # Uses standard AWS SDK credential chain (IAM roles, environment vars, or local AWS CLI credentials)
        # Signature v4 is required for S3 presigned URLs
        s3_config = Config(
            region_name=settings.AWS_REGION,
            signature_version="s3v4",
            s3={"addressing_style": "virtual"}
        )
        client_kwargs: Dict[str, Any] = {"config": s3_config}

        # If credentials are explicitly provided in backend/.env, pass them to boto3
        if settings.AWS_ACCESS_KEY_ID and settings.AWS_SECRET_ACCESS_KEY:
            client_kwargs["aws_access_key_id"] = settings.AWS_ACCESS_KEY_ID
            client_kwargs["aws_secret_access_key"] = settings.AWS_SECRET_ACCESS_KEY
            if settings.AWS_SESSION_TOKEN:
                client_kwargs["aws_session_token"] = settings.AWS_SESSION_TOKEN

        self.s3_client = boto3.client("s3", **client_kwargs)
        self.bucket = settings.S3_BUCKET_NAME

    def sanitize_filename(self, filename: str) -> str:
        """Sanitizes filename for safe S3 object key paths."""
        # Replace un-safe characters with underscore, keeping alphanumeric, dots, dashes, underscores
        clean_name = re.sub(r'[^a-zA-Z0-9._-]', '_', filename)
        # Avoid leading/trailing dots or spaces
        clean_name = clean_name.strip(" .")
        return clean_name or "video.mp4"

    def get_deterministic_s3_key(self, video_id: str, original_filename: str) -> str:
        """Generates deterministic S3 key: videos/{video_id}/original/{sanitized_filename}"""
        sanitized = self.sanitize_filename(original_filename)
        return f"videos/{video_id}/original/{sanitized}"

    def generate_presigned_put_url(
        self, s3_key: str, content_type: str, expires_in: int = settings.PRESIGNED_UPLOAD_EXPIRY_SECONDS
    ) -> str:
        """Generates short-lived presigned PUT URL for browser direct S3 upload."""
        try:
            url = self.s3_client.generate_presigned_url(
                ClientMethod="put_object",
                Params={
                    "Bucket": self.bucket,
                    "Key": s3_key,
                    "ContentType": content_type,
                },
                ExpiresIn=expires_in,
                HttpMethod="PUT",
            )
            return url
        except ClientError as e:
            logger.error(f"Failed to generate presigned PUT URL for key {s3_key}: {e}")
            raise RuntimeError(f"Error generating presigned upload URL: {e}")

    def generate_presigned_get_url(
        self, s3_key: str, expires_in: int = settings.PRESIGNED_DOWNLOAD_EXPIRY_SECONDS, response_filename: Optional[str] = None
    ) -> str:
        """Generates short-lived presigned GET URL for temporary original video access."""
        try:
            params: Dict[str, Any] = {
                "Bucket": self.bucket,
                "Key": s3_key,
            }
            if response_filename:
                sanitized = self.sanitize_filename(response_filename)
                params["ResponseContentDisposition"] = f'inline; filename="{sanitized}"'

            url = self.s3_client.generate_presigned_url(
                ClientMethod="get_object",
                Params=params,
                ExpiresIn=expires_in,
                HttpMethod="GET",
            )
            return url
        except ClientError as e:
            logger.error(f"Failed to generate presigned GET URL for key {s3_key}: {e}")
            raise RuntimeError(f"Error generating presigned download URL: {e}")

    def verify_object_exists(self, s3_key: str) -> Optional[Dict[str, Any]]:
        """
        Performs S3 HeadObject for bucket and key.
        Returns metadata dict if object exists, None if object is missing.
        """
        try:
            response = self.s3_client.head_object(Bucket=self.bucket, Key=s3_key)
            return {
                "content_length": response.get("ContentLength"),
                "content_type": response.get("ContentType"),
                "last_modified": response.get("LastModified"),
                "etag": response.get("ETag"),
            }
        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code")
            if error_code in ("404", "NoSuchKey", "NotFound"):
                logger.warning(f"S3 HeadObject 404 for key: {s3_key}")
                return None
            logger.error(f"S3 HeadObject error for key {s3_key}: {e}")
            raise e

    def delete_object(self, s3_key: str) -> bool:
        """Deletes object from S3 bucket."""
        try:
            self.s3_client.delete_object(Bucket=self.bucket, Key=s3_key)
            logger.info(f"Successfully deleted S3 key: {s3_key}")
            return True
        except ClientError as e:
            logger.error(f"Failed to delete S3 key {s3_key}: {e}")
            return False

s3_service = S3Service()
