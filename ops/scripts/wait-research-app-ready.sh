#!/usr/bin/env bash
set -euo pipefail
CONTAINER=${RESEARCH_APP_CONTAINER:-research-app-postgres}
for _ in $(seq 1 120); do
  if docker inspect "$CONTAINER" >/dev/null 2>&1 \
    && docker exec "$CONTAINER" pg_isready -U research_app -d research_app >/dev/null 2>&1; then
    echo 'research_app_readiness=PASS'
    exit 0
  fi
  sleep 1
done
echo 'research_app readiness timeout' >&2
exit 70
