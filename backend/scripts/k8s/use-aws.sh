#!/usr/bin/env bash
set -Eeuo pipefail

REGION="ap-southeast-2"
CLUSTER="video-processing"

if ! aws eks describe-cluster \
    --name "$CLUSTER" \
    --region "$REGION" >/dev/null 2>&1; then

    echo "ERROR: EKS cluster '$CLUSTER' does not exist."
    echo "Run aws-start.sh first."
    exit 1
fi

aws eks update-kubeconfig \
    --name "$CLUSTER" \
    --region "$REGION" >/dev/null

echo
echo "Current context:"
kubectl config current-context

echo
kubectl get nodes