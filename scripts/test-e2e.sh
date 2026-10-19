#!/usr/bin/env bash
set -euo pipefail
root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
mkdir -p "$root/test-results" "$root/playwright-report"
docker build --platform linux/amd64 -f "$root/test/e2e/Dockerfile" -t chroma-ui-tests "$root"
docker run --rm --init --platform linux/amd64 --shm-size=1g \
    --user "$(id -u):$(id -g)" \
    -v "$root/test-results:/app/test-results" \
    -v "$root/playwright-report:/app/playwright-report" \
    chroma-ui-tests npm run test:e2e -- "$@"
