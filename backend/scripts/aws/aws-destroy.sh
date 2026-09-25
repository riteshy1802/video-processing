#!/usr/bin/env bash
set -Eeuo pipefail

REGION="ap-southeast-2"
CLUSTER="video-processing"
ECR_REPO="video-processing-backend"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CHECK_SCRIPT="$ROOT/scripts/aws/check-running-instances.sh"

KAFKA_VOLUME_ID=""

echo "============================================================"
echo " DESTROY VIDEO PROCESSING AWS RUNTIME"
echo "============================================================"
echo
echo "WILL DELETE:"
echo "  - EKS cluster"
echo "  - managed node groups"
echo "  - EC2 EKS nodes"
echo "  - Kubernetes workloads"
echo "  - API ALB"
echo "  - Kafka EBS/PVC infrastructure"
echo "  - ECR repository + backend images"
echo
echo "WILL KEEP:"
echo "  - S3"
echo "  - CloudFront distributions"
echo "  - IAM roles/policies"
echo "  - AWS Budget"
echo
echo "Region : $REGION"
echo "Cluster: $CLUSTER"
echo

read -rp "Type DESTROY to continue: " CONFIRM

if [[ "$CONFIRM" != "DESTROY" ]]; then
    echo "Cancelled."
    exit 0
fi

# ------------------------------------------------------------
# EKS / Kubernetes cleanup
# ------------------------------------------------------------

if aws eks describe-cluster \
    --name "$CLUSTER" \
    --region "$REGION" >/dev/null 2>&1; then

    echo
    echo "[1/5] Connecting to EKS..."

    aws eks update-kubeconfig \
        --name "$CLUSTER" \
        --region "$REGION" >/dev/null

    # --------------------------------------------------------
    # Capture Kafka EBS volume BEFORE deleting Kubernetes.
    # This allows us to safely clean up only this project's
    # Kafka volume if Kubernetes leaves it orphaned.
    # --------------------------------------------------------

    echo
    echo "Finding Kafka EBS volume..."

    KAFKA_PVC="$(
        kubectl get pod kafka-0 \
            -n default \
            -o jsonpath='{.spec.volumes[?(@.persistentVolumeClaim)].persistentVolumeClaim.claimName}' \
            2>/dev/null || true
    )"

    if [[ -n "$KAFKA_PVC" ]]; then

        KAFKA_PV="$(
            kubectl get pvc "$KAFKA_PVC" \
                -n default \
                -o jsonpath='{.spec.volumeName}' \
                2>/dev/null || true
        )"

        if [[ -n "$KAFKA_PV" ]]; then

            VOLUME_HANDLE="$(
                kubectl get pv "$KAFKA_PV" \
                    -o jsonpath='{.spec.csi.volumeHandle}' \
                    2>/dev/null || true
            )"

            # EBS CSI normally returns the volume ID directly,
            # but strip a possible path prefix defensively.
            KAFKA_VOLUME_ID="${VOLUME_HANDLE##*/}"

            if [[ "$KAFKA_VOLUME_ID" == vol-* ]]; then
                echo "Kafka EBS volume: $KAFKA_VOLUME_ID"
            else
                echo "Could not determine a valid Kafka EBS volume ID."
                KAFKA_VOLUME_ID=""
            fi
        fi
    fi

    if [[ -z "$KAFKA_VOLUME_ID" ]]; then
        echo "No Kafka EBS volume identified."
    fi

    # --------------------------------------------------------
    # Delete Ingress / ALB
    # --------------------------------------------------------

    echo
    echo "[2/5] Deleting API Ingress so ALB is cleaned up..."

    kubectl delete ingress api \
        -n default \
        --ignore-not-found=true || true

    echo "Waiting for ingress deletion..."

    for _ in {1..60}; do
        if ! kubectl get ingress api \
            -n default >/dev/null 2>&1; then
            break
        fi

        sleep 5
    done

    echo
    echo "Waiting for project ALB cleanup..."

    # Give AWS Load Balancer Controller time to process deletion.
    sleep 30

    # --------------------------------------------------------
    # Delete EKS
    # --------------------------------------------------------

    echo
    echo "[3/5] Deleting EKS cluster..."

    eksctl delete cluster \
        --name "$CLUSTER" \
        --region "$REGION" \
        --wait \
        --disable-nodegroup-eviction

else
    echo
    echo "EKS cluster does not exist. Skipping EKS deletion."
fi

# ------------------------------------------------------------
# Kafka orphaned EBS cleanup
# ------------------------------------------------------------

echo
echo "[4/5] Checking Kafka EBS cleanup..."

if [[ -n "$KAFKA_VOLUME_ID" ]]; then

    if aws ec2 describe-volumes \
        --volume-ids "$KAFKA_VOLUME_ID" \
        --region "$REGION" >/dev/null 2>&1; then

        VOLUME_STATE="$(
            aws ec2 describe-volumes \
                --volume-ids "$KAFKA_VOLUME_ID" \
                --region "$REGION" \
                --query 'Volumes[0].State' \
                --output text
        )"

        if [[ "$VOLUME_STATE" == "available" ]]; then

            echo "Kafka volume survived cluster deletion."
            echo "Deleting orphaned Kafka volume: $KAFKA_VOLUME_ID"

            aws ec2 delete-volume \
                --volume-id "$KAFKA_VOLUME_ID" \
                --region "$REGION"

            echo "Deleted Kafka EBS volume."

        else
            echo "Kafka volume still has state: $VOLUME_STATE"
            echo "Not deleting it automatically."
        fi

    else
        echo "Kafka EBS volume was already deleted automatically."
    fi

else
    echo "No captured Kafka volume to clean up."
fi

# ------------------------------------------------------------
# ECR cleanup
# ------------------------------------------------------------

echo
echo "[5/5] Removing backend ECR repository..."

if aws ecr describe-repositories \
    --repository-names "$ECR_REPO" \
    --region "$REGION" >/dev/null 2>&1; then

    aws ecr delete-repository \
        --repository-name "$ECR_REPO" \
        --region "$REGION" \
        --force >/dev/null

    echo "Deleted ECR repository: $ECR_REPO"
else
    echo "ECR repository already absent."
fi

echo
echo "============================================================"
echo " PRIMARY DESTRUCTION COMPLETE"
echo "============================================================"
echo
echo "Checking AWS for remaining resources..."
echo

if [[ -x "$CHECK_SCRIPT" ]]; then
    "$CHECK_SCRIPT"
else
    echo "Run manually:"
    echo "  $CHECK_SCRIPT"
fi

echo
echo "IMPORTANT:"
echo "Review EC2, EBS and Load Balancer sections above."
echo "Do NOT blindly delete leftovers because this AWS account"
echo "contains resources belonging to other projects."
echo
echo "S3 and CloudFront were intentionally retained."