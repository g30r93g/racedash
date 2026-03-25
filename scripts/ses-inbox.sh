#!/bin/bash
set -euo pipefail

ENDPOINT="${AWS_ENDPOINT_URL:-http://localhost:4566}"

usage() {
  echo "Usage: ses-inbox.sh [options]"
  echo ""
  echo "Query LocalStack SES sent messages."
  echo ""
  echo "Options:"
  echo "  --from <email>    Filter by sender email"
  echo "  --id <id>         Get a specific message by ID"
  echo "  --clear           Delete all sent messages"
  echo "  -h, --help        Show this help"
  echo ""
  echo "Examples:"
  echo "  pnpm local:ses                          # List all sent emails"
  echo "  pnpm local:ses -- --from test@racedash.local"
  echo "  pnpm local:ses -- --clear"
}

FILTER=""
ACTION="list"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --from)  [[ $# -ge 2 ]] || { echo "ERROR: --from requires an email argument"; exit 1; }; FILTER="?email=$2"; shift 2 ;;
    --id)    [[ $# -ge 2 ]] || { echo "ERROR: --id requires a message ID argument"; exit 1; }; FILTER="?id=$2"; shift 2 ;;
    --clear) ACTION="clear"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1"; usage; exit 1 ;;
  esac
done

if [ "$ACTION" = "clear" ]; then
  curl -sf -X DELETE "$ENDPOINT/_aws/ses" >/dev/null || {
    echo "ERROR: Could not reach LocalStack at $ENDPOINT. Is it running?"
    exit 1
  }
  echo "Cleared all sent emails."
  exit 0
fi

response=$(curl -sf "$ENDPOINT/_aws/ses${FILTER}" 2>/dev/null) || {
  echo "ERROR: Could not reach LocalStack at $ENDPOINT. Is it running?"
  exit 1
}

# Pretty-print with summary
echo "$response" | python3 -c "
import sys, json

data = json.load(sys.stdin)
messages = data.get('messages', [])

if not messages:
    print('No emails found.')
    sys.exit(0)

print(f'Found {len(messages)} email(s):\n')

for i, msg in enumerate(messages, 1):
    to_addrs = ', '.join(msg.get('Destination', {}).get('ToAddresses', ['?']))
    print(f'  [{i}] {msg.get(\"Source\", \"?\")} → {to_addrs}')
    print(f'      Subject: {msg.get(\"Subject\", \"(no subject)\")}')
    print(f'      Date:    {msg.get(\"Timestamp\", \"?\")}')
    print(f'      ID:      {msg.get(\"Id\", \"?\")}')
    body = msg.get('Body', {})
    text = body.get('text_part') or body.get('html_part') or '(empty)'
    preview = text[:120].replace('\n', ' ')
    if len(text) > 120:
        preview += '...'
    print(f'      Body:    {preview}')
    print()
"
