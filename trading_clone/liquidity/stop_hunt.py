"""
Stop Hunt Detector — Build #3
================================
A stop hunt is a targeted move to trigger stop-loss clusters
just above a swing high or below a swing low, before reversing.

Distinguished from a sweep by:
  • Smaller extension (precise, surgical pierce)
  • Very fast reversal within the same candle (long wick, small body)
  • Often coincides with a news event / session open

Score (max 100):
  Wick ratio     40  — wick beyond level / candle range
  Body ratio     30  — body on opposite side (rejection strength)
  Speed          20  — reversal within same candle
  Volume         10  — volume spike confirms institutional move
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import List, Literal, Optional

from trading_clone.market_structure.swing_detector import Candle, calc_atr


HuntType = Literal["HUNT_HIGH", "HUNT_LOW"]


@dataclass
class StopHunt:
    hunt_type:    HuntType
    hunted_level: float
    hunt_time:    datetime
    hunt_index:   int
    wick_size:    float      # wick extension past level
    body_ratio:   float      # body / candle range (rejection strength 0–1)
    same_candle:  bool       # reversal completed in same candle
    volume_spike: bool
    score:        int


def detect_stop_hunts(candles: List[Candle], lookback: int = 20) -> List[StopHunt]:
    if len(candles) < lookback + 1:
        return []

    atr     = calc_atr(candles)
    if atr == 0:
        return []

    avg_vol = sum(c.volume for c in candles[-lookback:]) / lookback
    hunts: List[StopHunt] = []

    for i in range(lookback, len(candles)):
        window     = candles[i - lookback: i]
        swing_high = max(c.high for c in window)
        swing_low  = min(c.low  for c in window)

        c         = candles[i]
        candle_rng = c.high - c.low
        if candle_rng == 0:
            continue

        vol_spike = c.volume > avg_vol * 1.3

        # ── Hunt above swing high ─────────────────────────────────────────
        upper_wick = c.high - max(c.open, c.close)
        if (c.high > swing_high
                and upper_wick > (c.high - swing_high)     # majority of wick past level
                and c.close <= swing_high):                 # closes back below
            body = abs(c.close - c.open)
            body_r = body / candle_rng
            wick_r = (c.high - swing_high) / candle_rng
            same = c.close < swing_high
            sc = _score(wick_r, body_r, same, vol_spike)
            if sc >= 55:
                hunts.append(StopHunt(
                    hunt_type="HUNT_HIGH", hunted_level=round(swing_high, 5),
                    hunt_time=c.time, hunt_index=i,
                    wick_size=round(c.high - swing_high, 5),
                    body_ratio=round(body_r, 2), same_candle=same,
                    volume_spike=vol_spike, score=sc,
                ))

        # ── Hunt below swing low ──────────────────────────────────────────
        lower_wick = min(c.open, c.close) - c.low
        if (c.low < swing_low
                and lower_wick > (swing_low - c.low)
                and c.close >= swing_low):
            body  = abs(c.close - c.open)
            body_r = body / candle_rng
            wick_r = (swing_low - c.low) / candle_rng
            same  = c.close > swing_low
            sc = _score(wick_r, body_r, same, vol_spike)
            if sc >= 55:
                hunts.append(StopHunt(
                    hunt_type="HUNT_LOW", hunted_level=round(swing_low, 5),
                    hunt_time=c.time, hunt_index=i,
                    wick_size=round(swing_low - c.low, 5),
                    body_ratio=round(body_r, 2), same_candle=same,
                    volume_spike=vol_spike, score=sc,
                ))

    hunts.sort(key=lambda h: h.hunt_index, reverse=True)
    return hunts[:6]


def most_recent_hunt(hunts: List[StopHunt]) -> Optional[StopHunt]:
    same = [h for h in hunts if h.same_candle]
    return same[0] if same else (hunts[0] if hunts else None)


def detect_liquidity_grabs(candles: List[Candle], _liq_levels=None) -> List[StopHunt]:
    """Alias for detect_stop_hunts; _liq_levels argument accepted for API compatibility."""
    return detect_stop_hunts(candles)


def recent_grab(
    hunts: List[StopHunt],
    lookback: int,
    candles: List[Candle],
) -> Optional[StopHunt]:
    """Return the most recent hunt within `lookback` candles of the end."""
    n = len(candles)
    close_enough = [h for h in hunts if (n - h.hunt_index) <= lookback]
    return most_recent_hunt(close_enough) if close_enough else None


def _score(wick_r: float, body_r: float, same: bool, vol: bool) -> int:
    wick_pts = 40 if wick_r > 0.4 else 25 if wick_r > 0.2 else 10
    body_pts = 30 if body_r > 0.4 else 18 if body_r > 0.2 else 5
    same_pts = 20 if same else 0
    vol_pts  = 10 if vol  else 0
    return min(100, wick_pts + body_pts + same_pts + vol_pts)
