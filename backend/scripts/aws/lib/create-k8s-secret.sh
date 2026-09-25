#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

ENV_FILE="$ROOT/backend/.env"
SECRET_NAME="video-processing-env"
NAMESPACE="default"

echo "============================================================"
echo " CREATE KUBERNETES APPLICATION SECRET"
echo "============================================================"

if [[ ! -f "$ENV_FILE" ]]; then
    echo "ERROR: Environment file not found:"
    echo "  $ENV_FILE"
    exit 1
fi

echo
echo "Source:"
echo "  backend/.env"
echo
echo "Target:"
echo "  secret/$SECRET_NAME"
echo

# Generate the Secret manifest locally and apply it.
# Secret values are never printed to stdout.

kubectl create secret generic "$SECRET_NAME" \
    --namespace "$NAMESPACE" \
    --from-env-file="$ENV_FILE" \
    --dry-run=client \
    -o yaml |
kubectl apply -f -

echo
echo "Verifying secret..."

if kubectl get secret "$SECRET_NAME" \
    --namespace "$NAMESPACE" >/dev/null 2>&1; then

    KEY_COUNT=$(kubectl get secret "$SECRET_NAME" \
        --namespace "$NAMESPACE" \
        -o jsonpath='{.data}' |
        python3 -c 'import json,sys; print(len(json.load(sys.stdin)))')

    echo "Secret created successfully."
    echo "Keys stored: $KEY_COUNT"
else
    echo "ERROR: Secret creation failed."
    exit 1
fi

echo
echo "============================================================"
echo " KUBERNETES SECRET READY"
echo "============================================================"