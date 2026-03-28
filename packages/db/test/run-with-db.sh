#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.yml"
export DATABASE_URL="postgresql://racedash:racedash_test@localhost:5433/racedash_test"

cleanup() {
  docker compose -f "$COMPOSE_FILE" down --volumes --remove-orphans 2>/dev/null
}
trap cleanup EXIT

echo "Starting PostgreSQL..."
docker compose -f "$COMPOSE_FILE" up -d --wait

echo "Applying migrations..."
cd "$SCRIPT_DIR/.."
pnpm drizzle-kit push --force

echo "Running tests..."
DATABASE_URL="$DATABASE_URL" pnpm vitest run "$@"
