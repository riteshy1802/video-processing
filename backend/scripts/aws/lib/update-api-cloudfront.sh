#!/usr/bin/env bash
set -Eeuo pipefail

# ============================================================
# Update API CloudFront origin to the newly-created ALB
#
# Usage:
#   ./update-api-cloudfront.sh <ALB_HOSTNAME>
# ============================================================

API_CLOUDFRONT_DOMAIN="d2zao1jnjo0hf8.cloudfront.net"

ALB_HOST="${1:-}"

if [[ -z "$ALB_HOST" ]]; then
    echo "ERROR: ALB hostname is required."
    echo
    echo "Usage:"
    echo "  $0 <ALB_HOSTNAME>"
    exit 1
fi

echo "============================================================"
echo " UPDATE API CLOUDFRONT ORIGIN"
echo "============================================================"
echo "CloudFront: $API_CLOUDFRONT_DOMAIN"
echo "New ALB:    $ALB_HOST"

# ------------------------------------------------------------
# 1. Discover distribution ID
# ------------------------------------------------------------

echo
echo "[CF 1/4] Finding API CloudFront distribution..."

DISTRIBUTION_ID=$(aws cloudfront list-distributions \
    --query "DistributionList.Items[?DomainName=='${API_CLOUDFRONT_DOMAIN}'].Id | [0]" \
    --output text)

if [[ -z "$DISTRIBUTION_ID" || "$DISTRIBUTION_ID" == "None" ]]; then
    echo "ERROR: Could not find CloudFront distribution:"
    echo "  $API_CLOUDFRONT_DOMAIN"
    exit 1
fi

echo "Distribution: $DISTRIBUTION_ID"

# ------------------------------------------------------------
# 2. Get current config + ETag
# ------------------------------------------------------------

echo
echo "[CF 2/4] Downloading current configuration..."

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

CONFIG_FILE="$TMP_DIR/config.json"

ETAG=$(aws cloudfront get-distribution-config \
    --id "$DISTRIBUTION_ID" \
    --query 'ETag' \
    --output text)

aws cloudfront get-distribution-config \
    --id "$DISTRIBUTION_ID" \
    --query 'DistributionConfig' \
    --output json > "$CONFIG_FILE"

# ------------------------------------------------------------
# 3. Replace ONLY the API origin hostname
# ------------------------------------------------------------

echo
echo "[CF 3/4] Replacing origin with new ALB..."

python3 - "$CONFIG_FILE" "$ALB_HOST" <<'PY'
import json
import sys

path = sys.argv[1]
alb_host = sys.argv[2]

with open(path, "r") as f:
    config = json.load(f)

origins = config["Origins"]["Items"]

if len(origins) != 1:
    raise SystemExit(
        f"ERROR: Expected exactly 1 API CloudFront origin, found {len(origins)}. "
        "Refusing to modify distribution automatically."
    )

old_origin = origins[0]["DomainName"]

print(f"Old origin: {old_origin}")
print(f"New origin: {alb_host}")

origins[0]["DomainName"] = alb_host

with open(path, "w") as f:
    json.dump(config, f)
PY

# ------------------------------------------------------------
# 4. Update distribution
# ------------------------------------------------------------

echo
echo "[CF 4/4] Updating CloudFront distribution..."

aws cloudfront update-distribution \
    --id "$DISTRIBUTION_ID" \
    --if-match "$ETAG" \
    --distribution-config "file://$CONFIG_FILE" \
    >/dev/null

echo
echo "CloudFront update submitted."
echo "Waiting for deployment..."

aws cloudfront wait distribution-deployed \
    --id "$DISTRIBUTION_ID"

echo
echo "============================================================"
echo " API CLOUDFRONT UPDATED"
echo "============================================================"
echo
echo "https://$API_CLOUDFRONT_DOMAIN"
echo "        ↓"
echo "$ALB_HOST"