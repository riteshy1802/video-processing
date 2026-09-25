#!/usr/bin/env bash
set -Eeuo pipefail

REGION="ap-southeast-2"
CLUSTER="video-processing"

NAMESPACE="kube-system"
SERVICE_ACCOUNT="aws-load-balancer-controller"

POLICY_ARN="arn:aws:iam::815470164705:policy/AWSLoadBalancerControllerIAMPolicy"

echo "============================================================"
echo " INSTALL AWS LOAD BALANCER CONTROLLER"
echo "============================================================"

# ------------------------------------------------------------
# 1. Check whether Pod Identity association already exists
# ------------------------------------------------------------

echo
echo "[ALB 1/4] Checking Pod Identity association..."

ASSOCIATION_ID=$(aws eks list-pod-identity-associations \
    --cluster-name "$CLUSTER" \
    --region "$REGION" \
    --query \
    "associations[?namespace=='${NAMESPACE}' && serviceAccount=='${SERVICE_ACCOUNT}'].associationId | [0]" \
    --output text)

if [[ -z "$ASSOCIATION_ID" || "$ASSOCIATION_ID" == "None" ]]; then

    echo "Creating Pod Identity association..."

    eksctl create podidentityassociation \
        --cluster "$CLUSTER" \
        --region "$REGION" \
        --namespace "$NAMESPACE" \
        --service-account-name "$SERVICE_ACCOUNT" \
        --permission-policy-arns "$POLICY_ARN"

else
    echo "Association already exists: $ASSOCIATION_ID"
fi


# ------------------------------------------------------------
# 2. Get EKS VPC
# ------------------------------------------------------------

echo
echo "[ALB 2/4] Getting cluster VPC..."

VPC_ID=$(aws eks describe-cluster \
    --name "$CLUSTER" \
    --region "$REGION" \
    --query "cluster.resourcesVpcConfig.vpcId" \
    --output text)

if [[ -z "$VPC_ID" || "$VPC_ID" == "None" ]]; then
    echo "ERROR: Could not determine cluster VPC."
    exit 1
fi

echo "VPC: $VPC_ID"


# ------------------------------------------------------------
# 3. Install controller
# ------------------------------------------------------------

echo
echo "[ALB 3/4] Installing AWS Load Balancer Controller..."

helm repo add eks \
    https://aws.github.io/eks-charts \
    --force-update >/dev/null

helm repo update >/dev/null

if helm status aws-load-balancer-controller \
    -n "$NAMESPACE" >/dev/null 2>&1; then

    echo "Controller already installed."

    helm upgrade aws-load-balancer-controller \
        eks/aws-load-balancer-controller \
        -n "$NAMESPACE" \
        --set clusterName="$CLUSTER" \
        --set serviceAccount.create=true \
        --set serviceAccount.name="$SERVICE_ACCOUNT" \
        --set region="$REGION" \
        --set vpcId="$VPC_ID"

else

    helm install aws-load-balancer-controller \
        eks/aws-load-balancer-controller \
        -n "$NAMESPACE" \
        --set clusterName="$CLUSTER" \
        --set serviceAccount.create=true \
        --set serviceAccount.name="$SERVICE_ACCOUNT" \
        --set region="$REGION" \
        --set vpcId="$VPC_ID"

fi


# ------------------------------------------------------------
# 4. Wait until controller is ready
# ------------------------------------------------------------

echo
echo "[ALB 4/4] Waiting for controller..."

kubectl rollout status \
    deployment/aws-load-balancer-controller \
    -n "$NAMESPACE" \
    --timeout=300s

echo
echo "Controller:"
kubectl get deployment aws-load-balancer-controller \
    -n "$NAMESPACE"

echo
echo "Pods:"
kubectl get pods \
    -n "$NAMESPACE" \
    -l app.kubernetes.io/name=aws-load-balancer-controller

echo
echo "============================================================"
echo " AWS LOAD BALANCER CONTROLLER READY"
echo "============================================================"