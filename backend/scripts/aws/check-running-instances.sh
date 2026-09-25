#!/usr/bin/env bash
set -Eeuo pipefail

# ============================================================
# Video Processing - AWS Running Resource Check
#
# READ-ONLY.
# Makes no modifications to AWS resources.
# ============================================================

REGION="ap-southeast-2"
CLUSTER="video-processing"
ECR_REPO="video-processing-backend"
S3_BUCKET="transcode-video-processing"

echo
echo "============================================================"
echo " VIDEO PROCESSING - AWS RESOURCE CHECK"
echo " Region:  $REGION"
echo " Cluster: $CLUSTER"
echo "============================================================"

# ------------------------------------------------------------
# Verify AWS credentials
# ------------------------------------------------------------

echo
echo "=== AWS IDENTITY ==="

aws sts get-caller-identity \
    --query '{Account:Account,Arn:Arn}' \
    --output table


# ------------------------------------------------------------
# EKS
# ------------------------------------------------------------

echo
echo "=== EKS CLUSTER ==="

if aws eks describe-cluster \
    --name "$CLUSTER" \
    --region "$REGION" >/dev/null 2>&1; then

    aws eks describe-cluster \
        --name "$CLUSTER" \
        --region "$REGION" \
        --query 'cluster.{
            Name:name,
            Status:status,
            Version:version,
            Endpoint:endpoint
        }' \
        --output table

    echo
    echo "--- NODE GROUPS ---"

    NODEGROUPS=$(aws eks list-nodegroups \
        --cluster-name "$CLUSTER" \
        --region "$REGION" \
        --query 'nodegroups[]' \
        --output text)

    if [[ -n "$NODEGROUPS" ]]; then
        for NG in $NODEGROUPS; do
            aws eks describe-nodegroup \
                --cluster-name "$CLUSTER" \
                --nodegroup-name "$NG" \
                --region "$REGION" \
                --query 'nodegroup.{
                    Name:nodegroupName,
                    Status:status,
                    InstanceTypes:instanceTypes,
                    Min:scalingConfig.minSize,
                    Desired:scalingConfig.desiredSize,
                    Max:scalingConfig.maxSize
                }' \
                --output table
        done
    else
        echo "No managed node groups."
    fi

else
    echo "No EKS cluster named '$CLUSTER'."
fi


# ------------------------------------------------------------
# EC2
# ------------------------------------------------------------

echo
echo "=== EC2 INSTANCES ==="

EC2_COUNT=$(aws ec2 describe-instances \
    --region "$REGION" \
    --filters \
        "Name=instance-state-name,Values=pending,running,stopping,stopped" \
    --query 'length(Reservations[].Instances[])' \
    --output text)

if [[ "$EC2_COUNT" == "0" ]]; then
    echo "No active/stopped EC2 instances."
else
    aws ec2 describe-instances \
        --region "$REGION" \
        --filters \
            "Name=instance-state-name,Values=pending,running,stopping,stopped" \
        --query 'Reservations[].Instances[].{
            ID:InstanceId,
            State:State.Name,
            Type:InstanceType,
            AZ:Placement.AvailabilityZone,
            Name:Tags[?Key==`Name`]|[0].Value
        }' \
        --output table
fi


# ------------------------------------------------------------
# EBS
# ------------------------------------------------------------

echo
echo "=== EBS VOLUMES ==="

EBS_COUNT=$(aws ec2 describe-volumes \
    --region "$REGION" \
    --query 'length(Volumes)' \
    --output text)

if [[ "$EBS_COUNT" == "0" ]]; then
    echo "No EBS volumes."
else
    aws ec2 describe-volumes \
        --region "$REGION" \
        --query 'Volumes[].{
            ID:VolumeId,
            State:State,
            Type:VolumeType,
            GiB:Size,
            AZ:AvailabilityZone,
            Instance:Attachments[0].InstanceId
        }' \
        --output table
fi


# ------------------------------------------------------------
# ALB / NLB
# ------------------------------------------------------------

echo
echo "=== APPLICATION / NETWORK LOAD BALANCERS ==="

LB_COUNT=$(aws elbv2 describe-load-balancers \
    --region "$REGION" \
    --query 'length(LoadBalancers)' \
    --output text)

if [[ "$LB_COUNT" == "0" ]]; then
    echo "No ALB/NLB resources."
else
    aws elbv2 describe-load-balancers \
        --region "$REGION" \
        --query 'LoadBalancers[].{
            Name:LoadBalancerName,
            Type:Type,
            Scheme:Scheme,
            State:State.Code,
            DNS:DNSName
        }' \
        --output table
fi


# ------------------------------------------------------------
# Classic ELB
# ------------------------------------------------------------

echo
echo "=== CLASSIC LOAD BALANCERS ==="

CLASSIC_COUNT=$(aws elb describe-load-balancers \
    --region "$REGION" \
    --query 'length(LoadBalancerDescriptions)' \
    --output text)

if [[ "$CLASSIC_COUNT" == "0" ]]; then
    echo "No Classic Load Balancers."
else
    aws elb describe-load-balancers \
        --region "$REGION" \
        --query 'LoadBalancerDescriptions[].{
            Name:LoadBalancerName,
            DNS:DNSName
        }' \
        --output table
fi


# ------------------------------------------------------------
# NAT Gateway
# ------------------------------------------------------------

echo
echo "=== NAT GATEWAYS ==="

NAT_COUNT=$(aws ec2 describe-nat-gateways \
    --region "$REGION" \
    --filter \
        "Name=state,Values=pending,available,deleting" \
    --query 'length(NatGateways)' \
    --output text)

if [[ "$NAT_COUNT" == "0" ]]; then
    echo "No active NAT Gateways."
else
    aws ec2 describe-nat-gateways \
        --region "$REGION" \
        --filter \
            "Name=state,Values=pending,available,deleting" \
        --query 'NatGateways[].{
            ID:NatGatewayId,
            State:State,
            VPC:VpcId,
            Subnet:SubnetId
        }' \
        --output table
fi


# ------------------------------------------------------------
# Elastic IP / public IPv4
# ------------------------------------------------------------

echo
echo "=== ELASTIC IP ADDRESSES ==="

EIP_COUNT=$(aws ec2 describe-addresses \
    --region "$REGION" \
    --query 'length(Addresses)' \
    --output text)

if [[ "$EIP_COUNT" == "0" ]]; then
    echo "No Elastic IP allocations."
else
    aws ec2 describe-addresses \
        --region "$REGION" \
        --query 'Addresses[].{
            IP:PublicIp,
            Allocation:AllocationId,
            Association:AssociationId,
            Instance:InstanceId
        }' \
        --output table
fi


# ------------------------------------------------------------
# ECR
# ------------------------------------------------------------

echo
echo "=== ECR BACKEND REPOSITORY ==="

if aws ecr describe-repositories \
    --repository-names "$ECR_REPO" \
    --region "$REGION" >/dev/null 2>&1; then

    IMAGE_COUNT=$(aws ecr list-images \
        --repository-name "$ECR_REPO" \
        --region "$REGION" \
        --query 'length(imageIds)' \
        --output text)

    echo "Repository: $ECR_REPO"
    echo "Images:     $IMAGE_COUNT"

    aws ecr describe-images \
        --repository-name "$ECR_REPO" \
        --region "$REGION" \
        --query 'imageDetails[].{
            Tags:imageTags,
            SizeBytes:imageSizeInBytes,
            Pushed:imagePushedAt
        }' \
        --output table 2>/dev/null || true
else
    echo "ECR repository '$ECR_REPO' does not exist."
fi


# ------------------------------------------------------------
# RETAINED resources
# ------------------------------------------------------------

echo
echo "============================================================"
echo " RETAINED RESOURCES"
echo " These are intentionally NOT considered runtime resources."
echo "============================================================"

echo
echo "=== PROJECT S3 BUCKET ==="

if aws s3api head-bucket \
    --bucket "$S3_BUCKET" 2>/dev/null; then
    echo "KEEP: s3://$S3_BUCKET"
else
    echo "Bucket not found/access denied: $S3_BUCKET"
fi


echo
echo "=== CLOUDFRONT DISTRIBUTIONS ==="

aws cloudfront list-distributions \
    --query 'DistributionList.Items[].{
        ID:Id,
        Domain:DomainName,
        Enabled:Enabled,
        Comment:Comment
    }' \
    --output table 2>/dev/null || true


echo
echo "============================================================"
echo " CHECK COMPLETE"
echo "============================================================"
echo
echo "Runtime resources that should disappear after aws-destroy.sh:"
echo "  - EKS cluster"
echo "  - EKS node groups"
echo "  - EC2 worker instances"
echo "  - project EBS volumes"
echo "  - project ALB/NLB"
echo "  - project ECR repository/images"
echo "  - project NAT Gateway / EIP (if any)"
echo
echo "Resources intentionally retained:"
echo "  - S3"
echo "  - CloudFront"
echo "  - IAM roles/policies"
echo "  - AWS Budget"
echo
