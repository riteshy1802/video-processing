import boto3
from botocore.exceptions import ClientError
from botocore.config import Config
import logging
from pathlib import Path
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
            s3={"addressing_style": "virtual"},
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
        clean_name = re.sub(r"[^a-zA-Z0-9._-]", "_", filename)
        # Avoid leading/trailing dots or spaces
        clean_name = clean_name.strip(" .")
        return clean_name or "video.mp4"

    def get_deterministic_s3_key(self, video_id: str, original_filename: str) -> str:
        """Generates deterministic S3 key: videos/{video_id}/original/{sanitized_filename}"""
        sanitized = self.sanitize_filename(original_filename)
        return f"videos/{video_id}/original/{sanitized}"

    def generate_presigned_put_url(
        self,
        s3_key: str,
        content_type: str,
        expires_in: int = settings.PRESIGNED_UPLOAD_EXPIRY_SECONDS,
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
        self,
        s3_key: str,
        expires_in: int = settings.PRESIGNED_DOWNLOAD_EXPIRY_SECONDS,
        response_filename: Optional[str] = None,
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
            last_mod = response.get("LastModified")
            if hasattr(last_mod, "isoformat"):
                last_mod = last_mod.isoformat()

            return {
                "content_length": response.get("ContentLength"),
                "content_type": response.get("ContentType"),
                "last_modified": str(last_mod) if last_mod is not None else None,
                "etag": response.get("ETag"),
            }
        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code")
            if error_code in ("404", "NoSuchKey", "NotFound"):
                logger.warning(f"S3 HeadObject 404 for key: {s3_key}")
                return None
            logger.error(f"S3 HeadObject error for key {s3_key}: {e}")
            raise e

    def upload_file(
        self,
        local_file_path: str,
        s3_key: str,
        content_type: Optional[str] = None,
        extra_args: Optional[Dict[str, Any]] = None,
    ) -> bool:
        """
        Uploads a local file directly to S3.
        Auto-detects Content-Type for HLS playlists and TS segment files if not provided.
        Returns True if successful, False otherwise.
        """
        try:
            upload_args = extra_args or {}

            if not content_type:
                file_str = str(local_file_path)
                if file_str.endswith(".m3u8"):
                    content_type = "application/x-mpegURL"
                elif file_str.endswith(".ts"):
                    content_type = "video/mp2t"
                elif file_str.endswith(".mp4"):
                    content_type = "video/mp4"

            if content_type:
                upload_args["ContentType"] = content_type

            self.s3_client.upload_file(
                Filename=str(local_file_path),
                Bucket=self.bucket,
                Key=s3_key,
                ExtraArgs=upload_args if upload_args else None,
            )
            logger.info(
                f"Successfully uploaded '{local_file_path}' to s3://{self.bucket}/{s3_key}"
            )
            return True
        except ClientError as e:
            logger.error(
                f"Failed to upload '{local_file_path}' to s3://{self.bucket}/{s3_key}: {e}"
            )
            return False
        except Exception as e:
            logger.error(
                f"Unexpected error uploading '{local_file_path}' to s3://{self.bucket}/{s3_key}: {e}"
            )
            return False

    def upload_directory(
        self,
        local_dir_path: str,
        s3_prefix: str,
    ) -> int:
        """
        Uploads all files inside a local directory to S3 under the given s3_prefix.
        Returns the number of files successfully uploaded.
        """
        dir_path = Path(local_dir_path)
        if not dir_path.is_dir():
            logger.error(
                f"Directory path '{local_dir_path}' does not exist or is not a directory."
            )
            return 0

        prefix = s3_prefix.rstrip("/") + "/"
        uploaded_count = 0

        for file_path in dir_path.rglob("*"):
            if file_path.is_file():
                relative_path = file_path.relative_to(dir_path)
                s3_key = f"{prefix}{relative_path}"
                if self.upload_file(str(file_path), s3_key):
                    uploaded_count += 1

        logger.info(
            f"Successfully uploaded {uploaded_count} file(s) from '{local_dir_path}' to s3://{self.bucket}/{prefix}"
        )
        return uploaded_count

    def download_file(self, s3_key: str, local_file_path: str) -> bool:
        """
        Downloads an object from S3 bucket to a local file path.
        Returns True if successful, False otherwise.
        """
        try:
            path = Path(local_file_path)
            path.parent.mkdir(parents=True, exist_ok=True)

            self.s3_client.download_file(
                Bucket=self.bucket,
                Key=s3_key,
                Filename=str(path),
            )
            logger.info(
                f"Successfully downloaded s3://{self.bucket}/{s3_key} to '{local_file_path}'"
            )
            return True
        except ClientError as e:
            logger.error(
                f"Failed to download s3://{self.bucket}/{s3_key} to '{local_file_path}': {e}"
            )
            return False
        except Exception as e:
            logger.error(
                f"Unexpected error downloading s3://{self.bucket}/{s3_key}': {e}"
            )
            return False

    def delete_object(self, s3_key: str) -> bool:
        """Deletes object from S3 bucket."""
        try:
            self.s3_client.delete_object(Bucket=self.bucket, Key=s3_key)
            logger.info(f"Successfully deleted S3 key: {s3_key}")
            return True
        except ClientError as e:
            logger.error(f"Failed to delete S3 key {s3_key}: {e}")
            return False

    def get_text_file(self, s3_key: str) -> Optional[str]:
        """
        Reads a text file (e.g. .m3u8 playlist) from S3 directly into a string.
        """
        try:
            response = self.s3_client.get_object(
                Bucket=self.bucket,
                Key=s3_key,
            )
            return response["Body"].read().decode("utf-8")
        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code")
            if error_code in ("404", "NoSuchKey", "NotFound"):
                logger.warning(f"S3 text file not found for key: {s3_key}")
                return None
            logger.error(f"Failed to read S3 text file {s3_key}: {e}")
            raise
        except Exception as e:
            logger.error(f"Unexpected error reading S3 text file {s3_key}: {e}")
            raise

    def copy_object(
        self,
        source_key: str,
        destination_key: str,
        content_type: Optional[str] = None,
        cache_control: Optional[str] = None,
    ) -> bool:
        """
        Copies an S3 object from source_key to destination_key within the same bucket.
        """
        try:
            copy_args: Dict[str, Any] = {
                "Bucket": self.bucket,
                "CopySource": {
                    "Bucket": self.bucket,
                    "Key": source_key,
                },
                "Key": destination_key,
            }
            if content_type or cache_control:
                copy_args["MetadataDirective"] = "REPLACE"
                if content_type:
                    copy_args["ContentType"] = content_type
                if cache_control:
                    copy_args["CacheControl"] = cache_control

            self.s3_client.copy_object(
                **copy_args,
            )
            logger.info(f"Copied S3 object: {source_key} -> {destination_key}")
            return True
        except Exception as e:
            logger.error(
                f"Failed to copy S3 object {source_key} -> {destination_key}: {e}"
            )
            return False

    def put_text_file(
        self,
        s3_key: str,
        content: str,
        content_type: str = "application/vnd.apple.mpegurl",
    ) -> None:
        """
        To put a file directly from server to S3
        """
        try:
            self.s3_client.put_object(
                Bucket=self.bucket,
                Key=s3_key,
                Body=content.encode("utf-8"),
                ContentType=content_type,
            )
        except Exception as e:
            logger.error(f"Failed to upload text file {s3_key}: {e}")
            raise

    def delete_prefix(self, prefix: str) -> int:
        """Delete every current object beneath a prefix and return the count."""
        try:
            prefix = prefix.rstrip("/") + "/"
            deleted_count = 0

            paginator = self.s3_client.get_paginator("list_objects_v2")

            for page in paginator.paginate(
                Bucket=self.bucket,
                Prefix=prefix,
            ):
                objects = page.get("Contents", [])

                if not objects:
                    continue

                response = self.s3_client.delete_objects(
                    Bucket=self.bucket,
                    Delete={"Objects": [{"Key": obj["Key"]} for obj in objects]},
                )
                errors = response.get("Errors", [])
                if errors:
                    failed_keys = ", ".join(
                        str(error.get("Key", "unknown")) for error in errors[:5]
                    )
                    raise RuntimeError(
                        f"S3 rejected deletion for objects under {prefix}: {failed_keys}"
                    )
                deleted_count += len(objects)

            logger.info(f"Deleted {deleted_count} S3 objects under prefix: {prefix}")
            return deleted_count

        except Exception as e:
            logger.error(f"Failed to delete S3 prefix {prefix}: {e}")
            raise


s3_service = S3Service()
