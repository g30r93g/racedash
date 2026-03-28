#!/bin/bash
set -euo pipefail

ENDPOINT="${AWS_ENDPOINT_URL:-http://localhost:4566}"
REGION="${AWS_REGION:-us-east-1}"
STATE_MACHINE_ARN="${STEP_FUNCTIONS_STATE_MACHINE_ARN:-arn:aws:states:us-east-1:000000000000:stateMachine:RenderPipeline-local}"
POLL_INTERVAL=3
MAX_POLL=300  # 5 minutes default

usage() {
  echo "Usage: sfn-execute.sh [options]"
  echo ""
  echo "Start a Step Functions execution on LocalStack and tail its status."
  echo ""
  echo "Options:"
  echo "  --input <json>     JSON input for the execution (default: sample render job)"
  echo "  --arn <arn>        State machine ARN (default: RenderPipeline-local)"
  echo "  --status <id>     Just check status of an existing execution ARN"
  echo "  --list             List recent executions"
  echo "  -h, --help         Show this help"
  echo ""
  echo "Examples:"
  echo "  pnpm local:sfn:execute"
  echo "  pnpm local:sfn:execute -- --input '{\"jobId\":\"test-1\",\"userId\":\"user-1\"}'"
  echo "  pnpm local:sfn:execute -- --list"
}

AWS_CMD="aws --endpoint-url $ENDPOINT --region $REGION --no-cli-pager"

INPUT='{"jobId":"test-job-001","userId":"test-user-001"}'
ACTION="execute"
STATUS_ARN=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --input)  [[ $# -ge 2 ]] || { echo "ERROR: --input requires a JSON argument"; exit 1; }; INPUT="$2"; shift 2 ;;
    --arn)    [[ $# -ge 2 ]] || { echo "ERROR: --arn requires an ARN argument"; exit 1; }; STATE_MACHINE_ARN="$2"; shift 2 ;;
    --status) [[ $# -ge 2 ]] || { echo "ERROR: --status requires an execution ARN"; exit 1; }; ACTION="status"; STATUS_ARN="$2"; shift 2 ;;
    --list)   ACTION="list"; shift ;;
    -h|--help) usage; exit 0 ;;
    --) shift ;;  # skip pnpm's -- separator
    *) echo "Unknown option: $1"; usage; exit 1 ;;
  esac
done

if [ "$ACTION" = "list" ]; then
  echo "Recent executions for $STATE_MACHINE_ARN:"
  echo ""
  $AWS_CMD stepfunctions list-executions \
    --state-machine-arn "$STATE_MACHINE_ARN" \
    --max-results 10 \
    --query 'executions[].{Name:name,Status:status,Start:startDate}' \
    --output table
  exit 0
fi

if [ "$ACTION" = "status" ]; then
  $AWS_CMD stepfunctions describe-execution \
    --execution-arn "$STATUS_ARN" \
    --query '{Status:status,Input:input,Output:output,Error:error,Cause:cause,Start:startDate,Stop:stopDate}' \
    --output json | python3 -m json.tool
  exit 0
fi

# Start a new execution
EXEC_NAME="local-$(date +%s)"

echo "Starting execution: $EXEC_NAME"
echo "  State machine: $STATE_MACHINE_ARN"
echo "  Input: $INPUT"
echo ""

EXEC_RESULT=$($AWS_CMD stepfunctions start-execution \
  --state-machine-arn "$STATE_MACHINE_ARN" \
  --name "$EXEC_NAME" \
  --input "$INPUT" \
  --output json)

EXEC_ARN=$(echo "$EXEC_RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin)['executionArn'])")

echo "  Execution ARN: $EXEC_ARN"
echo ""
echo "Polling status every ${POLL_INTERVAL}s (timeout: ${MAX_POLL}s)..."
echo ""

poll_elapsed=0
while [ "$poll_elapsed" -lt "$MAX_POLL" ]; do
  STATUS_JSON=$($AWS_CMD stepfunctions describe-execution \
    --execution-arn "$EXEC_ARN" \
    --output json)

  STATUS=$(echo "$STATUS_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")

  echo "  $(date +%H:%M:%S) — $STATUS"

  if [ "$STATUS" = "SUCCEEDED" ] || [ "$STATUS" = "FAILED" ] || [ "$STATUS" = "TIMED_OUT" ] || [ "$STATUS" = "ABORTED" ]; then
    echo ""
    echo "=== Final State ==="
    echo "$STATUS_JSON" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(f\"Status:  {data['status']}\")
if 'output' in data and data['output']:
    print(f\"Output:  {data['output'][:500]}\")
if 'error' in data and data['error']:
    print(f\"Error:   {data['error']}\")
if 'cause' in data and data['cause']:
    print(f\"Cause:   {data['cause'][:500]}\")
"
    exit 0
  fi

  sleep "$POLL_INTERVAL"
  poll_elapsed=$((poll_elapsed + POLL_INTERVAL))
done

echo ""
echo "ERROR: Execution did not complete within ${MAX_POLL}s. Last status: $STATUS"
echo "  Check with: $0 --status $EXEC_ARN"
exit 1
