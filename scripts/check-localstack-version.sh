#!/bin/bash
set -euo pipefail

# Pinned version — update this when upgrading LocalStack
PINNED_VERSION="4.14.0"

echo "Checking for latest LocalStack version..."

# Fetch the latest stable version tag from Docker Hub (exclude -bigdata, -arm64, -amd64 suffixes)
LATEST=$(curl -sf "https://hub.docker.com/v2/repositories/localstack/localstack/tags/?page_size=50&ordering=last_updated" \
  | python3 -c "
import sys, json, re
tags = json.load(sys.stdin)['results']
versions = [t['name'] for t in tags if re.match(r'^\d+\.\d+\.\d+$', t['name'])]
print(versions[0] if versions else '')
" 2>/dev/null) || true

if [ -z "$LATEST" ]; then
  echo "  ⚠ Could not fetch latest version from Docker Hub (offline?). Using pinned version $PINNED_VERSION."
  exit 0
fi

if [ "$PINNED_VERSION" != "$LATEST" ]; then
  echo "  ⚠ LocalStack $LATEST is available (pinned: $PINNED_VERSION)."
  echo "    Update image tag in infra/docker-compose.localstack.yml and docker-compose.local.yml"
  echo "    Then update PINNED_VERSION in scripts/check-localstack-version.sh"
else
  echo "  LocalStack $PINNED_VERSION is the latest version."
fi
