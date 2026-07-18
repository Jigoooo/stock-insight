#!/home/jigoo/.hermes/hermes-agent/venv/bin/python3
"""Fetch corporate actions (dividends, splits) from yfinance and emit NDJSON.

Input JSON: [{"market":"KR|US","symbol":"...","exchange":"KOSPI|KOSDAQ|US"}].
Output NDJSON lines:
  {"market","symbol","action_type":"dividend|split","effective_date","amount","ratio"}
No database access. Mirrors fetch_ohlcv.py conventions (bounded batches, stderr progress).
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import yfinance as yf


def _yf_symbol(row: dict) -> str | None:
    market = str(row.get("market", "")).upper()
    symbol = str(row.get("symbol", "")).upper().strip()
    exchange = str(row.get("exchange", "")).upper()
    if market == "KR" and exchange == "KOSPI":
        return f"{symbol}.KS"
    if market == "KR" and exchange == "KOSDAQ":
        return f"{symbol}.KQ"
    if market == "US":
        return symbol
    return None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--sleep", type=float, default=0.4)
    args = parser.parse_args()

    rows = json.loads(Path(args.input).read_text(encoding="utf-8"))
    out = Path(args.output).open("w", encoding="utf-8")
    ok = 0
    failed = 0
    for index, row in enumerate(rows):
        ticker = _yf_symbol(row)
        if not ticker:
            continue
        try:
            actions = yf.Ticker(ticker).actions
            if actions is None or actions.empty:
                continue
            for ts, action in actions.iterrows():
                effective = ts.date().isoformat()
                dividend = float(action.get("Dividends", 0) or 0)
                split = float(action.get("Stock Splits", 0) or 0)
                if dividend > 0:
                    out.write(json.dumps({
                        "market": row["market"], "symbol": row["symbol"],
                        "action_type": "dividend", "effective_date": effective,
                        "amount": dividend, "ratio": None,
                    }) + "\n")
                if split > 0:
                    out.write(json.dumps({
                        "market": row["market"], "symbol": row["symbol"],
                        "action_type": "split", "effective_date": effective,
                        "amount": None, "ratio": split,
                    }) + "\n")
            ok += 1
        except Exception as error:  # noqa: BLE001 — per-symbol isolation
            failed += 1
            print(f"actions failed {ticker}: {error}", file=sys.stderr)
        if index % 25 == 24:
            print(f"progress {index + 1}/{len(rows)} ok={ok} failed={failed}", file=sys.stderr)
        time.sleep(args.sleep)
    out.close()
    print(f"done symbols={len(rows)} ok={ok} failed={failed}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
