#!/usr/bin/env bash
set -Eeuo pipefail

REGION="ap-southeast-2"
CLUSTER="video-processing"

EBS_ROLE_ARN="arn:aws:iam::815470164705:role/video-processing-ebs-csi"

echo "============================================================"
echo " INSTALL EBS CSI"
echo "============================================================"

# ------------------------------------------------------------
# 1. Pod Identity Agent
# ------------------------------------------------------------

echo
echo "[EBS 1/4] Checking EKS Pod Identity Agent..."

if aws eks describe-addon \
    --cluster-name "$CLUSTER" \
    --addon-name eks-pod-identity-agent \
    --region "$REGION" >/dev/null 2>&1; then

    echo "Pod Identity Agent already installed."
else
    echo "Installing Pod Identity Agent..."

    aws eks create-addon \
        --cluster-name "$CLUSTER" \
        --addon-name eks-pod-identity-agent \
        --region "$REGION" >/dev/null

    aws eks wait addon-active \
        --cluster-name "$CLUSTER" \
        --addon-name eks-pod-identity-agent \
        --region "$REGION"
fi

# ------------------------------------------------------------
# 2. EBS CSI Pod Identity association
# ------------------------------------------------------------

echo
echo "[EBS 2/4] Checking EBS CSI Pod Identity association..."

ASSOCIATION_ID=$(aws eks list-pod-identity-associations \
    --cluster-name "$CLUSTER" \
    --region "$REGION" \
    --query \
    "associations[?namespace=='kube-system' && serviceAccount=='ebs-csi-controller-sa'].associationId | [0]" \
    --output text)

if [[ -z "$ASSOCIATION_ID" || "$ASSOCIATION_ID" == "None" ]]; then

    echo "Creating EBS CSI Pod Identity association..."

    aws eks create-pod-identity-association \
        --cluster-name "$CLUSTER" \
        --namespace kube-system \
        --service-account ebs-csi-controller-sa \
        --role-arn "$EBS_ROLE_ARN" \
        --region "$REGION" >/dev/null
else
    echo "Pod Identity association already exists: $ASSOCIATION_ID"
fi

# ------------------------------------------------------------
# 3. EBS CSI addon
# ------------------------------------------------------------

echo
echo "[EBS 3/4] Checking aws-ebs-csi-driver..."

if aws eks describe-addon \
    --cluster-name "$CLUSTER" \
    --addon-name aws-ebs-csi-driver \
    --region "$REGION" >/dev/null 2>&1; then

    echo "EBS CSI addon already installed."
else
    echo "Installing EBS CSI addon..."

    aws eks create-addon \
        --cluster-name "$CLUSTER" \
        --addon-name aws-ebs-csi-driver \
        --region "$REGION" >/dev/null

    aws eks wait addon-active \
        --cluster-name "$CLUSTER" \
        --addon-name aws-ebs-csi-driver \
        --region "$REGION"
fi

# ------------------------------------------------------------
# 4. gp3 StorageClass
# ------------------------------------------------------------

echo
echo "[EBS 4/4] Creating gp3 StorageClass..."

kubectl apply -f - <<'EOF'
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: gp3
provisioner: ebs.csi.aws.com
volumeBindingMode: WaitForFirstConsumer
allowVolumeExpansion: true
reclaimPolicy: Delete
parameters:
  type: gp3
EOF

echo
echo "Waiting for EBS CSI controller..."

kubectl rollout status \
    deployment/ebs-csi-controller \
    -n kube-system \
    --timeout=300s

echo
echo "Storage classes:"
kubectl get storageclass

echo
echo "============================================================"
echo " EBS CSI READY"
echo "============================================================"