#!/usr/bin/env bash
# End-to-end Docker deployment smoke for the Retriever Hub.
# Validates: build → run → healthz → MCP round-trip → restart → persistence.
set -euo pipefail

cd "$(dirname "$0")/.."

echo "[smoke-docker.sh] building image..."
docker compose build --quiet retriever-hub

echo "[smoke-docker.sh] starting hub (clean volume)..."
docker compose down --volumes >/dev/null 2>&1 || true
docker compose up -d retriever-hub

cleanup() {
  echo "[smoke-docker.sh] cleaning up..."
  docker compose down --volumes >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "[smoke-docker.sh] populate + verify..."
node scripts/smoke-docker.mjs

echo "[smoke-docker.sh] restarting container to test persistence..."
docker compose restart retriever-hub
sleep 1

echo "[smoke-docker.sh] verify-only after restart..."
node scripts/smoke-docker.mjs --verify

echo "[smoke-docker.sh] ALL CHECKS PASSED"
