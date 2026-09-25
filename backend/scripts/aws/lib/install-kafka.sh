#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

KEDA_NAMESPACE="keda"

echo "============================================================"
echo " INSTALL KEDA"
echo "============================================================"

echo
echo "[KEDA 1/4] Adding Helm repository..."

helm repo add kedacore \
    https://kedacore.github.io/charts \
    --force-update >/dev/null

helm repo update >/dev/null

echo
echo "[KEDA 2/4] Installing/checking KEDA..."

if helm status keda \
    -n "$KEDA_NAMESPACE" >/dev/null 2>&1; then

    echo "KEDA already installed."

else
    helm install keda kedacore/keda \
        --namespace "$KEDA_NAMESPACE" \
        --create-namespace
fi

echo
echo "[KEDA 3/4] Waiting for KEDA..."

kubectl rollout status \
    deployment/keda-operator \
    -n "$KEDA_NAMESPACE" \
    --timeout=300s

kubectl rollout status \
    deployment/keda-operator-metrics-apiserver \
    -n "$KEDA_NAMESPACE" \
    --timeout=300s

echo
echo "[KEDA 4/4] Applying Kafka ScaledObjects..."

kubectl apply -f "$ROOT/k8s/worker/scaledobject.yaml"
kubectl apply -f "$ROOT/k8s/planner/scaledobject.yaml"
kubectl apply -f "$ROOT/k8s/finalizer/scaledobject.yaml"
kubectl apply -f "$ROOT/k8s/video-finalizer/scaledobject.yaml"

echo
echo "ScaledObjects:"
kubectl get scaledobjects -A

echo
echo "KEDA pods:"
kubectl get pods -n "$KEDA_NAMESPACE"

echo
echo "============================================================"
echo " KEDA READY"
echo "============================================================"