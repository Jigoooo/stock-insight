#!/usr/bin/env bash
set -euo pipefail
umask 077

ROOT="${STOCK_INSIGHT_ROOT:-/home/jigoo/.hermes/workspace/stock-insight}"
PROJECT="$ROOT/apps/api/python-runtime"
RUNTIME_ROOT="${STOCK_INSIGHT_PYTHON_RUNTIME:-$HOME/.local/share/stock-insight/python}"

command -v uv >/dev/null
UV_PROJECT_ENVIRONMENT="$RUNTIME_ROOT" uv sync --frozen --no-dev --no-progress --project "$PROJECT"
"$RUNTIME_ROOT/bin/python3" -c 'import pandas, yfinance'
