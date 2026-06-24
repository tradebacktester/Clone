"""
Distribution Phase Detector — Build #4
=========================================
Distribution = the expansion / trend move that follows manipulation.
This is where Smart Money delivers price to the next liquidity pool.

Criteria (after the manipulation candle):
  • Price moves decisively in the manipulation direction
  • Move size ≥ 1.5 × ATR
  • Minimal retracement (≤ 30% pullback of the expansion move)

Score (max 100):
  Move size       40  — expansion in ATR units
  Consistency     35  — % of candles closing in distribution direction
  Clean expansion 25  — low retracement ratio
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import List, Literal, Optional

from trading_clone.market_structure.swing_detector import Candle, calc_atr
from trading_clone.amd.manipulation import ManipulationResult


@dataclass
class DistributionResult:
    found:          bool
    direction:      Optional[Literal["bullish", "bearish"]]
    start_time:     Optional[datetime]
    move_size:      float    # ATR units
    candles_in_dist: int
    consistency:    float    # 0–1
    score:          int


_NULL = DistributionResult(found=False, direction=None, start_time=None,
                           move_size=0.0, candles_in_dist=0,
                           consistency=0.0, score=0)


def detect_distribution(
    candles:  List[Candle],
    manip:    ManipulationResult,
) -> DistributionResult:
    if not manip.found or manip.time is None or manip.direction is None:
        return _NULL

    atr = calc_atr(candles)
    if atr == 0:
        return _NULL

    after = [c for c in candles if c.time > manip.time]
    if len(after) < 2:
        return _NULL

    direction = manip.direction
    window    = after[:15]   # look at up to 15 candles post-manipulation

    first_close = window[0].close
    if direction == "bullish":
        last_close = max(c.close for c in window)
    else:
        last_close = min(c.close for c in window)

    move = abs(last_close - first_close)
    move_atr = move / atr

    if move_atr < 0.8:
        return _NULL

    # Directional check
    is_directional = (last_close > first_close) if direction == "bullish" else (last_close < first_close)
    if not is_directional:
        return _NULL

    # Consistency: % of candles closing in distribution direction
    if direction == "bullish":
        dist_candles = sum(1 for c in window if c.close > c.open)
    else:
        dist_candles = sum(1 for c in window if c.close < c.open)
    consistency = dist_candles / len(window)

    # Retracement check (max pullback vs total move)
    if direction == "bullish":
        extreme = max(c.close for c in window)
        min_after = min(c.low for c in window)
        retrace = (extreme - min_after) / move if move else 1.0
    else:
        extreme = min(c.close for c in window)
        max_after = max(c.high for c in window)
        retrace = (max_after - extreme) / move if move else 1.0

    clean = retrace < 0.4

    sc = _score(move_atr, consistency, clean)
    return DistributionResult(
        found=True, direction=direction,
        start_time=window[0].time,
        move_size=round(move_atr, 2),
        candles_in_dist=len(window),
        consistency=round(consistency, 2),
        score=sc,
    )


def _score(move_atr: float, consistency: float, clean: bool) -> int:
    move_pts  = 40 if move_atr > 3 else 30 if move_atr > 2 else 20 if move_atr > 1.5 else 10
    cons_pts  = 35 if consistency > 0.7 else 22 if consistency > 0.5 else 10
    clean_pts = 25 if clean else 0
    return min(100, move_pts + cons_pts + clean_pts)
