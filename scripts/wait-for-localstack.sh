#!/bin/bash
set -euo pipefail

ENDPOINT="${AWS_ENDPOINT_URL:-http://localhost:4566}"
MAX_WAIT="${1:-90}"  # seconds, default 90
INTERVAL=2

# ── Pre-flight: is Docker running? ──────────────────────────────────────────
docker info >/dev/null 2>&1 || {
  echo "ERROR: Docker is not running. Please start Docker Desktop and try again."
  exit 1
}

echo "Waiting for LocalStack at $ENDPOINT (timeout: ${MAX_WAIT}s)..."

# ── Phase 1: Wait for services to report "running" ─────────────────────────
elapsed=0
while [ "$elapsed" -lt "$MAX_WAIT" ]; do
  status=$(curl -sf "$ENDPOINT/_localstack/health" 2>/dev/null) || true

  if [ -n "$status" ]; then
    all_ready=true
    for svc in s3 sqs stepfunctions ses; do
      svc_status=$(echo "$status" | python3 -c "
import sys, json
data = json.load(sys.stdin)
services = data.get('services', {})
print(services.get('$svc', 'missing'))
" 2>/dev/null) || true

      if [ "$svc_status" != "running" ] && [ "$svc_status" != "available" ]; then
        all_ready=false
        break
      fi
    done

    if [ "$all_ready" = true ]; then
      echo "  Services healthy (${elapsed}s)."
      break
    fi
  fi

  sleep "$INTERVAL"
  elapsed=$((elapsed + INTERVAL))
done

if [ "$elapsed" -ge "$MAX_WAIT" ]; then
  echo "ERROR: LocalStack services did not become ready within ${MAX_WAIT}s."
  exit 1
fi

# ── Phase 2: Wait for init scripts to finish (resource verification) ────────
# The ready.d/setup.sh creates buckets, queues, and state machine.
# Services being "running" does NOT mean init scripts have completed.
echo "  Waiting for init resources (buckets, queues, state machine)..."

remaining=$((MAX_WAIT - elapsed))
while [ "$elapsed" -lt "$MAX_WAIT" ]; do
  # Check that the S3 uploads bucket exists (last resource created before SFN)
  bucket_check=$(aws --endpoint-url "$ENDPOINT" s3api head-bucket --bucket racedash-uploads-local 2>&1) && {
    # Also verify the state machine exists (created last in setup.sh)
    sm_check=$(aws --endpoint-url "$ENDPOINT" stepfunctions list-state-machines --query 'stateMachines[?name==`RenderPipeline-local`].name' --output text 2>/dev/null) || true
    if [ -n "$sm_check" ]; then
      echo "  Init resources ready (${elapsed}s total)."
      echo "LocalStack is ready."
      exit 0
    fi
  }

  sleep "$INTERVAL"
  elapsed=$((elapsed + INTERVAL))
done

echo "ERROR: LocalStack init scripts did not complete within ${MAX_WAIT}s."
echo "  Check logs: pnpm local:logs:localstack"
exit 1
