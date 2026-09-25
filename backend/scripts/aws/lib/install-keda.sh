#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

KEDA_NAMESPACE="keda"
KEDA_VERSION="2.20.2"

echo "============================================================"
echo " INSTALL KEDA"
echo "============================================================"

# ------------------------------------------------------------
# 1. Add KEDA Helm repository
# ------------------------------------------------------------

echo
echo "[KEDA 1/4] Configuring Helm repository..."

helm repo add kedacore \
    https://kedacore.github.io/charts \
    --force-update >/dev/null

helm repo update >/dev/null


# ------------------------------------------------------------
# 2. Install / upgrade KEDA
# ------------------------------------------------------------

echo
echo "[KEDA 2/4] Installing KEDA ${KEDA_VERSION}..."

if helm status keda \
    --namespace "$KEDA_NAMESPACE" >/dev/null 2>&1; then

    echo "KEDA already installed. Ensuring correct version..."

    helm upgrade keda kedacore/keda \
        --namespace "$KEDA_NAMESPACE" \
        --version "$KEDA_VERSION"

else

    helm install keda kedacore/keda \
        --namespace "$KEDA_NAMESPACE" \
        --create-namespace \
        --version "$KEDA_VERSION"

fi


# ------------------------------------------------------------
# 3. Wait for KEDA components
# ------------------------------------------------------------

echo
echo "[KEDA 3/4] Waiting for KEDA components..."

kubectl rollout status \
    deployment/keda-operator \
    --namespace "$KEDA_NAMESPACE" \
    --timeout=300s

kubectl rollout status \
    deployment/keda-operator-metrics-apiserver \
    --namespace "$KEDA_NAMESPACE" \
    --timeout=300s

kubectl rollout status \
    deployment/keda-admission-webhooks \
    --namespace "$KEDA_NAMESPACE" \
    --timeout=300s


# ------------------------------------------------------------
# 4. Apply our Kafka ScaledObjects
# ------------------------------------------------------------

echo
echo "[KEDA 4/4] Applying application ScaledObjects..."

SCALED_OBJECTS=(
    "$ROOT/k8s/worker/scaledobject.yaml"
    "$ROOT/k8s/planner/scaledobject.yaml"
    "$ROOT/k8s/finalizer/scaledobject.yaml"
    "$ROOT/k8s/video-finalizer/scaledobject.yaml"
)

for manifest in "${SCALED_OBJECTS[@]}"; do

    if [[ ! -f "$manifest" ]]; then
        echo "ERROR: Missing ScaledObject manifest:"
        echo "  $manifest"
        exit 1
    fi

    kubectl apply -f "$manifest"

done


# ------------------------------------------------------------
# Verification
# ------------------------------------------------------------

echo
echo "KEDA pods:"
kubectl get pods \
    --namespace "$KEDA_NAMESPACE"

echo
echo "ScaledObjects:"
kubectl get scaledobjects -A

echo
echo "HPAs created by KEDA:"
kubectl get hpa -A

echo
echo "============================================================"
echo " KEDA READY"
echo "============================================================"