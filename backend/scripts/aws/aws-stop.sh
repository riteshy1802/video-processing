#!/usr/bin/env bash
set -Eeuo pipefail

REGION="ap-southeast-2"
CLUSTER="video-processing"

SYSTEM_NG="system"
COMPUTE_NG="compute"

echo "============================================================"
echo " TEMPORARILY STOP AWS VIDEO PROCESSING"
echo "============================================================"
echo
echo "This will scale EKS worker nodes to ZERO."
echo
echo "It DOES NOT delete:"
echo "  - EKS control plane"
echo "  - EBS"
echo "  - ALB"
echo "  - ECR"
echo "  - S3"
echo "  - CloudFront"
echo
echo "For overnight shutdown, prefer aws-destroy.sh."
echo

read -rp "Type STOP to continue: " CONFIRM

if [[ "$CONFIRM" != "STOP" ]]; then
    echo "Cancelled."
    exit 0
fi

# Make sure cluster exists
if ! aws eks describe-cluster \
    --name "$CLUSTER" \
    --region "$REGION" >/dev/null 2>&1; then

    echo "Cluster '$CLUSTER' does not exist."
    echo "Nothing to stop."
    exit 0
fi

aws eks update-kubeconfig \
    --name "$CLUSTER" \
    --region "$REGION" >/dev/null

echo
echo "[1/3] Stopping Cluster Autoscaler..."

if kubectl get deployment cluster-autoscaler \
    -n kube-system >/dev/null 2>&1; then

    kubectl scale deployment cluster-autoscaler \
        -n kube-system \
        --replicas=0
else
    echo "Cluster Autoscaler deployment not found. Skipping."
fi

echo
echo "[2/3] Scaling compute nodegroup to zero..."

aws eks update-nodegroup-config \
    --cluster-name "$CLUSTER" \
    --nodegroup-name "$COMPUTE_NG" \
    --scaling-config minSize=0,maxSize=3,desiredSize=0 \
    --region "$REGION" >/dev/null

aws eks wait nodegroup-active \
    --cluster-name "$CLUSTER" \
    --nodegroup-name "$COMPUTE_NG" \
    --region "$REGION"

echo
echo "[3/3] Scaling system nodegroup to zero..."

aws eks update-nodegroup-config \
    --cluster-name "$CLUSTER" \
    --nodegroup-name "$SYSTEM_NG" \
    --scaling-config minSize=0,maxSize=1,desiredSize=0 \
    --region "$REGION" >/dev/null

aws eks wait nodegroup-active \
    --cluster-name "$CLUSTER" \
    --nodegroup-name "$SYSTEM_NG" \
    --region "$REGION"

echo
echo "============================================================"
echo " NODE SHUTDOWN REQUESTED"
echo "============================================================"
echo
echo "system  : desired 0"
echo "compute : desired 0"
echo
echo "EC2 termination can take a few minutes."
echo
echo "Run:"
echo "  ./scripts/aws/check-running-instances.sh"
echo
echo "to verify the instances actually disappear."