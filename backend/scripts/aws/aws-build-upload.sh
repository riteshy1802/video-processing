#!/usr/bin/env bash
set -Eeuo pipefail

REGION="ap-southeast-2"
ACCOUNT_ID="815470164705"
ECR_REPO="video-processing-backend"
IMAGE_TAG="${1:-latest}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKEND_DIR="$ROOT/backend"

ECR_REGISTRY="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"
REMOTE_IMAGE="${ECR_REGISTRY}/${ECR_REPO}:${IMAGE_TAG}"

echo "============================================================"
echo " BUILD + UPLOAD BACKEND"
echo " Image: $REMOTE_IMAGE"
echo "============================================================"

# Verify required commands
for cmd in aws docker; do
    command -v "$cmd" >/dev/null || {
        echo "ERROR: '$cmd' is not installed."
        exit 1
    }
done

# Verify AWS authentication
aws sts get-caller-identity >/dev/null

# Create ECR repository if it was previously destroyed
if ! aws ecr describe-repositories \
    --repository-names "$ECR_REPO" \
    --region "$REGION" >/dev/null 2>&1; then

    echo
    echo "Creating ECR repository..."

    aws ecr create-repository \
        --repository-name "$ECR_REPO" \
        --image-scanning-configuration scanOnPush=true \
        --encryption-configuration encryptionType=AES256 \
        --region "$REGION" >/dev/null
else
    echo
    echo "ECR repository already exists."
fi

echo
echo "Logging into ECR..."

aws ecr get-login-password --region "$REGION" |
docker login \
    --username AWS \
    --password-stdin "$ECR_REGISTRY"

echo
echo "Building Docker image..."

docker build \
    -t "${ECR_REPO}:${IMAGE_TAG}" \
    "$BACKEND_DIR"

echo
echo "Tagging image..."

docker tag \
    "${ECR_REPO}:${IMAGE_TAG}" \
    "$REMOTE_IMAGE"

echo
echo "Pushing image..."

docker push "$REMOTE_IMAGE"

echo
echo "============================================================"
echo " BUILD + UPLOAD COMPLETE"
echo " $REMOTE_IMAGE"
echo "============================================================"