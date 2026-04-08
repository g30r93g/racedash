#!/bin/bash
set -euo pipefail

# Skip on non-macOS
if [ "$(uname)" != "Darwin" ]; then
    echo "Skipping metal-composite build (not macOS)"
    exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Skip if already built and source hasn't changed
BINARY=".build/release/metal-composite"
if [ -f "$BINARY" ]; then
    # Check if any source file is newer than the binary
    NEWER=$(find Sources Package.swift -newer "$BINARY" 2>/dev/null | head -1)
    if [ -z "$NEWER" ]; then
        echo "metal-composite: up to date"
        exit 0
    fi
fi

echo "Building metal-composite..."
swift build -c release 2>&1

if [ -f "$BINARY" ]; then
    echo "Built: $BINARY ($(ls -lh "$BINARY" | awk '{print $5}'))"
else
    echo "ERROR: Binary not found at $BINARY"
    exit 1
fi
