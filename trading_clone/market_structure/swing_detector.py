"""
Swing Detector — Market Structure Engine V2
============================================
Uses numpy + pandas internally. Public API is unchanged so all
downstream modules (supply/demand, liquidity, AMD, signals) keep
working without modification.

Public exports
--------------
  Candle          — OHLCV dataclass (single source of truth)
  SwingPoint      — swing high / low at a given index
  calc_atr()      — Average True Range (Wilder / EMA smoothing)
  detect_swings() — fractal-based swing high/low detection
  detect_trend()  — HH/HL or LH/LL trend classification
  candles_to_df() — List[Candle] → pd.DataFrame  (internal helper)
  df_to_candles() — pd.DataFrame → List[Candle]  (internal helper)
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import List, Literal

import numpy as np
import pandas as pd


# ── Core dataclasses ──────────────────────────────────────────────────────────

@dataclass
class Candle:
    """Single OHLCV bar. Single source of truth across all modules."""
    time:      datetime
    open:      float
    high:      float
    low:       float
    close:     float
    volume:    float
    pair:      str
    timeframe: str


@dataclass
class SwingPoint:
    """A confirmed swing high or low."""
    index:  int
    time:   datetime
    price:  float
    type:   Literal["high", "low"]
    strength: int    # 0–100: touches × ATR-distance scoring


# ── DataFrame helpers ─────────────────────────────────────────────────────────

def candles_to_df(candles: List[Candle]) -> pd.DataFrame:
    """Convert a list of Candle objects to a pandas DataFrame."""
    if not candles:
        return pd.DataFrame(columns=["time", "open", "high", "low", "close", "volume"])
    return pd.DataFrame(
        {
            "time":      [c.time      for c in candles],
            "open":      np.array([c.open  for c in candles], dtype=np.float64),
            "high":      np.array([c.high  for c in candles], dtype=np.float64),
            "low":       np.array([c.low   for c in candles], dtype=np.float64),
            "close":     np.array([c.close for c in candles], dtype=np.float64),
            "volume":    np.array([c.volume for c in candles], dtype=np.float64),
            "pair":      [c.pair      for c in candles],
            "timeframe": [c.timeframe for c in candles],
        }
    ).set_index("time")


def df_to_candles(df: pd.DataFrame) -> List[Candle]:
    """Convert a DataFrame (time-indexed) back to List[Candle]."""
    return [
        Candle(
            time=row.name if isinstance(row.name, datetime) else row.name.to_pydatetime(),
            open=float(row["open"]),  high=float(row["high"]),
            low=float(row["low"]),    close=float(row["close"]),
            volume=float(row["volume"]),
            pair=str(row["pair"]),
            timeframe=str(row["timeframe"]),
        )
        for _, row in df.iterrows()
    ]


# ── ATR — Wilder smoothing via pandas EWM ─────────────────────────────────────

def calc_atr(candles: List[Candle], period: int = 14) -> float:
    """
    Wilder-smoothed Average True Range.
    Returns the most recent ATR value as a float.
    """
    if len(candles) < 2:
        return 0.0

    df = candles_to_df(candles)
    h = df["high"].values
    l = df["low"].values
    c = df["close"].values

    prev_close = np.roll(c, 1)
    prev_close[0] = c[0]

    tr = np.maximum(
        h - l,
        np.maximum(np.abs(h - prev_close), np.abs(l - prev_close)),
    )

    # Wilder smoothing: EWM with alpha = 1/period
    tr_series = pd.Series(tr)
    atr_series = tr_series.ewm(alpha=1.0 / period, adjust=False).mean()
    return float(atr_series.iloc[-1])


# ── Swing detection — fractal-based with numpy argrelextrema ─────────────────

def detect_swings(
    candles: List[Candle],
    left:    int = 5,
    right:   int = 5,
) -> List[SwingPoint]:
    """
    Detect swing highs and lows using a fractal window.
    A swing high at index i requires:   high[i] > max(high[i-left : i+right])
    A swing low  at index i requires:   low[i]  < min(low[i-left  : i+right])

    Each SwingPoint is scored (0–100) by how many ATRs its price
    extends beyond the surrounding candles.
    """
    if len(candles) < left + right + 1:
        return []

    df  = candles_to_df(candles)
    atr = calc_atr(candles)
    if atr == 0:
        atr = 1e-8

    highs = df["high"].values
    lows  = df["low"].values
    times = list(df.index)
    n     = len(highs)

    swings: List[SwingPoint] = []

    for i in range(left, n - right):
        window_highs = np.concatenate([highs[i - left: i], highs[i + 1: i + right + 1]])
        window_lows  = np.concatenate([lows[i  - left: i], lows[i  + 1: i + right + 1]])

        # ── Swing high ────────────────────────────────────────────────────
        if highs[i] > np.max(window_highs):
            margin   = highs[i] - np.max(window_highs)
            strength = min(100, int(30 + (margin / atr) * 40))
            swings.append(SwingPoint(
                index=i, time=times[i], price=float(highs[i]),
                type="high", strength=strength,
            ))

        # ── Swing low ─────────────────────────────────────────────────────
        if lows[i] < np.min(window_lows):
            margin   = np.min(window_lows) - lows[i]
            strength = min(100, int(30 + (margin / atr) * 40))
            swings.append(SwingPoint(
                index=i, time=times[i], price=float(lows[i]),
                type="low", strength=strength,
            ))

    return sorted(swings, key=lambda s: s.index)


# ── Trend classification ───────────────────────────────────────────────────────

def detect_trend(
    swings: List[SwingPoint],
) -> Literal["bullish", "bearish", "ranging"]:
    """
    Classify trend from the last two confirmed swing highs and lows.

    Bullish : Higher High  AND  Higher Low
    Bearish : Lower  High  AND  Lower  Low
    Ranging : anything else
    """
    highs = [s for s in swings if s.type == "high"]
    lows  = [s for s in swings if s.type == "low"]

    if len(highs) >= 2 and len(lows) >= 2:
        hh = highs[-1].price > highs[-2].price   # higher high
        hl = lows[-1].price  > lows[-2].price    # higher low
        lh = highs[-1].price < highs[-2].price   # lower high
        ll = lows[-1].price  < lows[-2].price    # lower low

        if hh and hl:
            return "bullish"
        if lh and ll:
            return "bearish"

    return "ranging"
