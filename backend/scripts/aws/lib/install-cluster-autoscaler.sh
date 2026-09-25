#!/usr/bin/env bash
set -Eeuo pipefail

REGION="ap-southeast-2"
CLUSTER="video-processing"

NAMESPACE="kube-system"
SERVICE_ACCOUNT="cluster-autoscaler"

AUTOSCALER_VERSION="v1.34.2"

ROLE_ARN="arn:aws:iam::815470164705:role/video-processing-cluster-autoscaler"

echo "============================================================"
echo " INSTALL CLUSTER AUTOSCALER"
echo "============================================================"

# ------------------------------------------------------------
# 1. Ensure ServiceAccount exists
# ------------------------------------------------------------

echo
echo "[CA 1/4] Creating/checking ServiceAccount..."

kubectl create serviceaccount "$SERVICE_ACCOUNT" \
    -n "$NAMESPACE" \
    --dry-run=client \
    -o yaml | kubectl apply -f -

# ------------------------------------------------------------
# 2. Pod Identity association
# ------------------------------------------------------------

echo
echo "[CA 2/4] Checking Pod Identity association..."

ASSOCIATION_ID=$(aws eks list-pod-identity-associations \
    --cluster-name "$CLUSTER" \
    --region "$REGION" \
    --query \
    "associations[?namespace=='${NAMESPACE}' && serviceAccount=='${SERVICE_ACCOUNT}'].associationId | [0]" \
    --output text)

if [[ -z "$ASSOCIATION_ID" || "$ASSOCIATION_ID" == "None" ]]; then

    echo "Creating Cluster Autoscaler Pod Identity association..."

    aws eks create-pod-identity-association \
        --cluster-name "$CLUSTER" \
        --namespace "$NAMESPACE" \
        --service-account "$SERVICE_ACCOUNT" \
        --role-arn "$ROLE_ARN" \
        --region "$REGION" >/dev/null

else
    echo "Association already exists: $ASSOCIATION_ID"
fi

# ------------------------------------------------------------
# 3. Install upstream Cluster Autoscaler manifest
# ------------------------------------------------------------

echo
echo "[CA 3/4] Installing Cluster Autoscaler..."

kubectl apply -f \
"https://raw.githubusercontent.com/kubernetes/autoscaler/cluster-autoscaler-${AUTOSCALER_VERSION}/cluster-autoscaler/cloudprovider/aws/examples/cluster-autoscaler-autodiscover.yaml"

# Ensure the deployment uses OUR service account
kubectl patch deployment cluster-autoscaler \
    -n "$NAMESPACE" \
    --type='merge' \
    -p "{\"spec\":{\"template\":{\"spec\":{\"serviceAccountName\":\"${SERVICE_ACCOUNT}\"}}}}"

# ------------------------------------------------------------
# 4. Configure exact working settings
# ------------------------------------------------------------

echo
echo "[CA 4/4] Configuring autoscaler..."

kubectl set image \
    deployment/cluster-autoscaler \
    cluster-autoscaler="registry.k8s.io/autoscaling/cluster-autoscaler:${AUTOSCALER_VERSION}" \
    -n "$NAMESPACE"

kubectl patch deployment cluster-autoscaler \
    -n "$NAMESPACE" \
    --type='json' \
    -p='[
      {
        "op":"replace",
        "path":"/spec/template/spec/containers/0/command",
        "value":[
          "./cluster-autoscaler",
          "--v=4",
          "--stderrthreshold=info",
          "--cloud-provider=aws",
          "--skip-nodes-with-local-storage=false",
          "--expander=least-waste",
          "--node-group-auto-discovery=asg:tag=k8s.io/cluster-autoscaler/enabled,k8s.io/cluster-autoscaler/video-processing"
        ]
      }
    ]'

echo
echo "Waiting for Cluster Autoscaler..."

kubectl rollout status \
    deployment/cluster-autoscaler \
    -n "$NAMESPACE" \
    --timeout=300s

echo
echo "Cluster Autoscaler:"
kubectl get deployment cluster-autoscaler \
    -n "$NAMESPACE"

echo
echo "Recent logs:"
kubectl logs \
    -n "$NAMESPACE" \
    deployment/cluster-autoscaler \
    --tail=20 || true

echo
echo "============================================================"
echo " CLUSTER AUTOSCALER READY"
echo "============================================================"