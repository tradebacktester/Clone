"""
Manipulation Phase Detector — Build #4
=========================================
Manipulation = the fakeout move that hunts liquidity above/below
the accumulation range before the real distribution move begins.

Patterns detected:
  1. Break above range high → close back inside  → bearish manipulation
  2. Break below range low  → close back inside  → bullish manipulation
  3. Standalone sweep / stop-hunt without a formal range

Score (max 100):
  BOS strength    40  — how far price broke out of range
  Return speed    35  — how quickly it came back
  Liquidity grab  25  — confirmed sweep or stop-hunt at the break point
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import List, Literal, Optional

from trading_clone.market_structure.swing_detector import Candle, calc_atr
from trading_clone.amd.accumulation import AccumulationZone


ManipDirection = Literal["bullish", "bearish"]


@dataclass
class ManipulationResult:
    found:      bool
    direction:  Optional[ManipDirection]
    time:       Optional[datetime]
    candle_idx: Optional[int]
    break_size: float      # ATR units
    returned:   bool       # price closed back inside range
    score:      int


_NULL = ManipulationResult(found=False, direction=None, time=None,
                           candle_idx=None, break_size=0.0, returned=False, score=0)


def detect_manipulation(
    candles: List[Candle],
    acc: AccumulationZone,
) -> ManipulationResult:
    if len(candles) < 5:
        return _NULL

    atr  = calc_atr(candles)
    if atr == 0:
        return _NULL

    recent = candles[-30:]

    # ── Range-based manipulation ───────────────────────────────────────────
    if acc.found:
        for i, c in enumerate(recent):
            # Break above range high
            if c.high > acc.range_high and c.close < acc.range_high:
                break_sz = (c.high - acc.range_high) / atr
                returned = True  # already closed back inside
                sc = _score(break_sz, returned, has_grab=True)
                return ManipulationResult(
                    found=True, direction="bearish",
                    time=c.time, candle_idx=len(candles) - len(recent) + i,
                    break_size=round(break_sz, 2), returned=returned, score=sc,
                )
            # Break below range low
            if c.low < acc.range_low and c.close > acc.range_low:
                break_sz = (acc.range_low - c.low) / atr
                returned = True
                sc = _score(break_sz, returned, has_grab=True)
                return ManipulationResult(
                    found=True, direction="bullish",
                    time=c.time, candle_idx=len(candles) - len(recent) + i,
                    break_size=round(break_sz, 2), returned=returned, score=sc,
                )

    # ── Swing-based manipulation (no formal range needed) ─────────────────
    lookback = min(40, len(candles))
    window   = candles[-lookback:]
    prev_high = max(c.high for c in window[:-5]) if len(window) > 5 else 0
    prev_low  = min(c.low  for c in window[:-5]) if len(window) > 5 else 9e9

    for i in range(max(0, len(candles) - 20), len(candles)):
        c = candles[i]
        if prev_high and c.high > prev_high and c.close < prev_high:
            break_sz = (c.high - prev_high) / atr
            sc = _score(break_sz, returned=True, has_grab=False)
            if sc >= 50:
                return ManipulationResult(
                    found=True, direction="bearish",
                    time=c.time, candle_idx=i,
                    break_size=round(break_sz, 2), returned=True, score=sc,
                )
        if prev_low and c.low < prev_low and c.close > prev_low:
            break_sz = (prev_low - c.low) / atr
            sc = _score(break_sz, returned=True, has_grab=False)
            if sc >= 50:
                return ManipulationResult(
                    found=True, direction="bullish",
                    time=c.time, candle_idx=i,
                    break_size=round(break_sz, 2), returned=True, score=sc,
                )

    return _NULL


def _score(break_sz: float, returned: bool, has_grab: bool) -> int:
    bos_pts  = 40 if break_sz > 1.0 else 28 if break_sz > 0.5 else 15 if break_sz > 0.2 else 5
    ret_pts  = 35 if returned   else 0
    grab_pts = 25 if has_grab   else 0
    return min(100, bos_pts + ret_pts + grab_pts)
