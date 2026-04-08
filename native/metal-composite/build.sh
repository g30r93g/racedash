#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "Building metal-composite..."
swift build -c release 2>&1

BINARY=".build/release/metal-composite"
if [ -f "$BINARY" ]; then
    echo "Built: $BINARY"
    ls -lh "$BINARY"
else
    echo "ERROR: Binary not found at $BINARY"
    exit 1
fi
