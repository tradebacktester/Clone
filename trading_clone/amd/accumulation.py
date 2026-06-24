"""
Accumulation Phase Detector — Build #4
========================================
Accumulation = a tight consolidation range where Smart Money is
positioning before a manipulative move.

Criteria:
  • Avg candle body < 0.6 × ATR
  • Range (high-low) < 2 × ATR
  • Duration: 8–60 candles

Score (max 100):
  Tightness    40  — avg body vs ATR (lower = tighter = stronger)
  Duration     30  — 10–30 bars ideal
  Range width  30  — narrower range = better
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import List, Optional

from trading_clone.market_structure.swing_detector import Candle, calc_atr


@dataclass
class AccumulationZone:
    found:       bool
    range_high:  float
    range_low:   float
    midpoint:    float
    bars:        int
    avg_body:    float    # ATR units
    start_time:  Optional[datetime]
    score:       int


_NULL = AccumulationZone(found=False, range_high=0, range_low=0,
                         midpoint=0, bars=0, avg_body=0,
                         start_time=None, score=0)


def detect_accumulation(candles: List[Candle]) -> AccumulationZone:
    if len(candles) < 10:
        return _NULL

    atr = calc_atr(candles)
    if atr == 0:
        return _NULL

    best: Optional[AccumulationZone] = None

    for window in range(min(60, len(candles)), 7, -1):
        sl         = candles[-window:]
        high       = max(c.high for c in sl)
        low        = min(c.low  for c in sl)
        width      = high - low
        avg_body   = sum(abs(c.close - c.open) for c in sl) / len(sl)

        if avg_body >= atr * 0.65:
            continue
        if width >= atr * 2.5:
            continue

        sc = _score(avg_body / atr, window, width / atr)
        if sc < 40:
            continue

        if best is None or sc > best.score:
            best = AccumulationZone(
                found=True,
                range_high=round(high, 5), range_low=round(low, 5),
                midpoint=round((high + low) / 2, 5),
                bars=window,
                avg_body=round(avg_body / atr, 2),
                start_time=sl[0].time,
                score=sc,
            )

    return best if best else _NULL


def _score(body_ratio: float, bars: int, width_ratio: float) -> int:
    # Tightness (lower body ratio = better)
    tight = 40 if body_ratio < 0.25 else 30 if body_ratio < 0.40 else 18 if body_ratio < 0.55 else 5
    # Duration
    dur   = 30 if 10 <= bars <= 30 else 20 if bars <= 50 else 12
    # Width
    wid   = 30 if width_ratio < 0.8 else 20 if width_ratio < 1.5 else 10
    return min(100, tight + dur + wid)
