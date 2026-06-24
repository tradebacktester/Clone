"""
Support & Resistance — Market Structure Engine V2
===================================================
Uses pandas for price clustering and numpy for level scoring.

Algorithm
---------
1. Collect all swing-point prices into a numpy array.
2. Cluster prices within ATR × tolerance into single levels
   (agglomerative: nearest-first, single-linkage).
3. Score each level:
     touch_count  — how many swing points cluster here
     bounce_score — avg ATR-normalised rejection at each touch
     recency      — exponential decay: recent touches score higher
4. Mark levels as broken if recent closes exceed them by > 0.5 ATR.
5. Classify as support (below price) or resistance (above price).
6. Return top 10 unbroken levels sorted by strength desc.

Public exports
--------------
  SRLevel            — dataclass
  detect_sr_levels() — main function
  major_support()    — highest-strength support
  major_resistance() — highest-strength resistance
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import List, Literal, Optional

import numpy as np
import pandas as pd

from trading_clone.market_structure.swing_detector import (
    Candle, SwingPoint, calc_atr, candles_to_df,
)

# Tolerance: swings within this many ATRs are grouped into one level
CLUSTER_ATR_MULT  = 0.40
# Broken: a close beyond the level by this many ATRs voids it
BREAK_ATR_MULT    = 0.50
# Recency half-life: each bar back decays score by this factor
RECENCY_DECAY     = 0.97


@dataclass
class SRLevel:
    price:       float
    type:        Literal["support", "resistance"]
    strength:    int          # 0–100 composite
    touch_count: int
    bounce_avg:  float        # avg ATR-normalised wick rejection
    recency:     int          # bars since most recent touch
    broken:      bool = False


# ── Main function ──────────────────────────────────────────────────────────────

def detect_sr_levels(
    candles: List[Candle],
    swings:  List[SwingPoint],
) -> List[SRLevel]:
    """
    Detect support and resistance levels from swing-point clusters.
    Returns up to 10 unbroken levels, sorted strongest-first.
    """
    if not candles or not swings:
        return []

    atr           = calc_atr(candles)
    if atr == 0:
        return []
    tolerance     = atr * CLUSTER_ATR_MULT
    break_margin  = atr * BREAK_ATR_MULT
    current_price = candles[-1].close
    n             = len(candles)

    df = candles_to_df(candles)
    highs  = df["high"].values
    lows   = df["low"].values
    closes = df["close"].values

    # ── Step 1: extract swing prices with their candle index ──────────────
    swing_prices  = np.array([s.price for s in swings], dtype=np.float64)
    swing_indices = np.array([s.index for s in swings], dtype=np.int64)

    # ── Step 2: cluster ────────────────────────────────────────────────────
    used   = np.zeros(len(swings), dtype=bool)
    levels: List[SRLevel] = []

    order = np.argsort(swing_prices)

    for i in order:
        if used[i]:
            continue

        # Collect all swings within tolerance of this price
        members = np.where(np.abs(swing_prices - swing_prices[i]) <= tolerance)[0]
        used[members] = True

        cluster_prices  = swing_prices[members]
        cluster_indices = swing_indices[members]
        avg_price       = float(np.mean(cluster_prices))
        touch_count     = len(members)

        # ── Step 3: score ──────────────────────────────────────────────────
        # (a) Bounce score: avg wick rejection at each touch
        bounce_scores = []
        for idx in cluster_indices:
            if idx >= n:
                continue
            wick = max(
                abs(highs[idx] - closes[idx]),
                abs(closes[idx] - lows[idx]),
            )
            bounce_scores.append(wick / atr)
        bounce_avg = float(np.mean(bounce_scores)) if bounce_scores else 0.0

        # (b) Recency: exponential decay from most recent touch
        most_recent = int(np.max(cluster_indices))
        bars_since  = n - 1 - most_recent
        recency_factor = RECENCY_DECAY ** bars_since

        # (c) Composite strength (0–100)
        touch_pts   = min(40, touch_count * 10)
        bounce_pts  = min(40, int(bounce_avg * 20))
        recency_pts = int(recency_factor * 20)
        strength    = min(100, touch_pts + bounce_pts + recency_pts)

        # ── Step 4: broken check ───────────────────────────────────────────
        level_type: Literal["support", "resistance"] = (
            "support" if avg_price < current_price else "resistance"
        )
        broken = _is_broken(avg_price, level_type, closes, break_margin)
        if broken:
            continue

        levels.append(SRLevel(
            price=round(avg_price, 5),
            type=level_type,
            strength=strength,
            touch_count=touch_count,
            bounce_avg=round(bounce_avg, 3),
            recency=bars_since,
            broken=False,
        ))

    levels.sort(key=lambda l: l.strength, reverse=True)
    return levels[:10]


# ── Broken detection (vectorised) ─────────────────────────────────────────────

def _is_broken(
    price: float,
    level_type: str,
    closes: np.ndarray,
    margin: float,
    lookback: int = 10,
) -> bool:
    recent = closes[-lookback:]
    if level_type == "resistance":
        return bool(np.any(recent > price + margin))
    return bool(np.any(recent < price - margin))


# ── Convenience accessors ──────────────────────────────────────────────────────

def major_support(levels: List[SRLevel]) -> Optional[SRLevel]:
    """Strongest unbroken support level."""
    supports = [l for l in levels if l.type == "support"]
    return supports[0] if supports else None


def major_resistance(levels: List[SRLevel]) -> Optional[SRLevel]:
    """Strongest unbroken resistance level."""
    resistances = [l for l in levels if l.type == "resistance"]
    return resistances[0] if resistances else None
