#!/home/jigoo/.hermes/hermes-agent/venv/bin/python3
"""Fetch 1D OHLCV from yfinance in bounded batches and emit NDJSON.

Input JSON: [{"market":"KR|US","symbol":"..."}].
Output NDJSON: one validated raw bar per line. No database access.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
import time
from pathlib import Path

import pandas as pd
import yfinance as yf


def _candidates(row: dict) -> list[str]:
    market = str(row.get("market", "")).upper()
    symbol = str(row.get("symbol", "")).upper().strip()
    if market == "KR":
        return [f"{symbol}.KS", f"{symbol}.KQ"]
    return [symbol]


def _frame_for(data: pd.DataFrame, ticker: str) -> pd.DataFrame:
    if data is None or data.empty:
        return pd.DataFrame()
    if not isinstance(data.columns, pd.MultiIndex):
        return data
    for level in range(data.columns.nlevels):
        values = set(str(value) for value in data.columns.get_level_values(level))
        if ticker in values:
            try:
                return data.xs(ticker, axis=1, level=level, drop_level=True)
            except (KeyError, ValueError):
                pass
    return pd.DataFrame()


def _number(value):
    try:
        number = float(value)
        return number if math.isfinite(number) else None
    except (TypeError, ValueError):
        return None


def _records(frame: pd.DataFrame, *, market: str, symbol: str, yf_symbol: str) -> list[dict]:
    out: list[dict] = []
    if frame.empty:
        return out
    for index, row in frame.iterrows():
        open_ = _number(row.get("Open"))
        high = _number(row.get("High"))
        low = _number(row.get("Low"))
        close = _number(row.get("Close"))
        volume = _number(row.get("Volume"))
        if any(value is None for value in (open_, high, low, close)):
            continue
        assert open_ is not None and high is not None and low is not None and close is not None
        if high < max(open_, low, close) or low > min(open_, high, close):
            continue
        if volume is not None and volume < 0:
            continue
        timestamp = pd.Timestamp(index)
        date = timestamp.date().isoformat()
        exchange = "KOSPI" if yf_symbol.endswith(".KS") else "KOSDAQ" if yf_symbol.endswith(".KQ") else "US"
        out.append({
            "exchange": exchange,
            "symbol": symbol,
            "timeframe": "1D",
            "ts": f"{date}T00:00:00.000Z",
            "open": open_,
            "high": high,
            "low": low,
            "close": close,
            "volumeBase": volume,
            "volumeQuote": None,
            "domain": "stock",
            "sourceId": "yfinance",
            "market": market,
            "yfSymbol": yf_symbol,
        })
    return out


def _download(batch: list[str], period: str) -> pd.DataFrame:
    last_error = None
    for attempt in range(3):
        try:
            return yf.download(
                batch,
                period=period,
                interval="1d",
                auto_adjust=False,
                actions=False,
                progress=False,
                threads=True,
                timeout=30,
                group_by="ticker",
                multi_level_index=True,
            )
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            if attempt < 2:
                time.sleep(2 ** (attempt + 1))
    print(f"batch_failed:{type(last_error).__name__}", file=sys.stderr)
    return pd.DataFrame()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--period", default="1y", choices=("7d", "1mo", "1y"))
    parser.add_argument("--batch-size", type=int, default=40)
    args = parser.parse_args()

    universe = json.loads(Path(args.input).read_text(encoding="utf-8"))
    lookup: dict[str, dict] = {}
    candidates: list[str] = []
    for row in universe:
        for ticker in _candidates(row):
            lookup[ticker] = row
            candidates.append(ticker)

    best: dict[tuple[str, str], list[dict]] = {}
    for start in range(0, len(candidates), args.batch_size):
        batch = candidates[start : start + args.batch_size]
        data = _download(batch, args.period)
        for ticker in batch:
            row = lookup[ticker]
            market = str(row["market"]).upper()
            symbol = str(row["symbol"]).upper()
            records = _records(_frame_for(data, ticker), market=market, symbol=symbol, yf_symbol=ticker)
            key = (market, symbol)
            if len(records) > len(best.get(key, [])):
                best[key] = records
        time.sleep(0.25)

    rows_written = 0
    with Path(args.output).open("w", encoding="utf-8") as handle:
        for key in sorted(best):
            for record in best[key]:
                handle.write(json.dumps(record, ensure_ascii=False, separators=(",", ":")) + "\n")
                rows_written += 1
    print(json.dumps({
        "universe": len(universe),
        "candidateSymbols": len(candidates),
        "tickersWithData": sum(bool(rows) for rows in best.values()),
        "bars": rows_written,
        "period": args.period,
    }, separators=(",", ":")), file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
