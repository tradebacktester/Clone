"""
Fibonacci Premium / Discount — Market Structure Engine V2
===========================================================
Uses numpy for all level arithmetic.

Fibonacci levels (standard SMC set)
-------------------------------------
  0.000  — Swing Low    (100% retracement)
  0.236  — Minor retracement
  0.382  — Golden pocket low
  0.500  — Equilibrium (EQ)
  0.618  — Golden pocket high  ← Premium / Discount dividing line
  0.705  — Premium entry
  0.786  — Deep premium
  1.000  — Swing High   (0% retracement)

Zone classification
-------------------
  premium     : price > 0.618 fib (above equilibrium)
  equilibrium : 0.382 ≤ price ≤ 0.618
  discount    : price < 0.382 fib (below equilibrium)

Public exports
--------------
  FibLevel           — single level dataclass
  FibAnalysis        — full analysis object
  calc_fib()         — main function
  premium_area()     — (top, bottom) tuple
  discount_area()    — (top, bottom) tuple
  is_premium()       — bool
  is_discount()      — bool
  get_fib_label()    — nearest fib ratio for a given price
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Literal, Optional, Tuple

import numpy as np

from trading_clone.market_structure.swing_detector import Candle

# ── Standard SMC Fibonacci ratios ─────────────────────────────────────────────
FIB_RATIOS: List[float] = [0.0, 0.236, 0.382, 0.500, 0.618, 0.705, 0.786, 1.0]

# Zone thresholds (ratio measured from swing high, downward)
PREMIUM_THRESHOLD    = 0.382   # price within top 38.2% of range → premium
DISCOUNT_THRESHOLD   = 0.618   # price within bottom 38.2% of range → discount


# ── Data structures ───────────────────────────────────────────────────────────

@dataclass
class FibLevel:
    ratio:         float
    price:         float
    label:         str         # "0.382", "EQ", "Golden Pocket", etc.
    is_premium:    bool
    is_discount:   bool


@dataclass
class FibAnalysis:
    swing_high:         float
    swing_low:          float
    range_size:         float
    levels:             Dict[float, float]    # ratio → price (kept for back-compat)
    fib_levels:         List[FibLevel]        # richer objects
    current_price:      float
    current_ratio:      float                 # 0=at high, 1=at low
    zone:               Literal["premium", "equilibrium", "discount"]
    premium_threshold:  float                 # price at 0.382 fib
    discount_threshold: float                 # price at 0.618 fib
    golden_pocket_high: float                 # 0.618 fib price
    golden_pocket_low:  float                 # 0.705 fib price
    equilibrium:        float                 # 0.500 fib price


# ── Main function ──────────────────────────────────────────────────────────────

def calc_fib(candles: List[Candle], lookback: int = 100) -> Optional[FibAnalysis]:
    """
    Compute Fibonacci levels from the highest high and lowest low
    in the most recent `lookback` candles.

    Returns None if < 10 candles or zero range.
    """
    if len(candles) < 10:
        return None

    sl     = candles[-min(lookback, len(candles)):]
    highs  = np.array([c.high  for c in sl], dtype=np.float64)
    lows   = np.array([c.low   for c in sl], dtype=np.float64)
    closes = np.array([c.close for c in sl], dtype=np.float64)

    swing_high = float(np.max(highs))
    swing_low  = float(np.min(lows))
    rng        = swing_high - swing_low

    if rng < 1e-10:
        return None

    current = float(closes[-1])

    # ratio: 0.0 = price is at swing_high, 1.0 = price is at swing_low
    current_ratio = float(np.clip((swing_high - current) / rng, 0.0, 1.0))

    # Build level dict (backward-compatible key → price)
    ratios_arr = np.array(FIB_RATIOS, dtype=np.float64)
    prices_arr = swing_high - rng * ratios_arr   # price decreases as ratio ↑
    levels_dict = {float(r): round(float(p), 5)
                   for r, p in zip(ratios_arr, prices_arr)}

    # Build richer FibLevel list
    _labels = {
        0.000: "Swing High (0%)",
        0.236: "0.236",
        0.382: "Golden Pocket Low / Premium Boundary",
        0.500: "Equilibrium (50%)",
        0.618: "Golden Pocket High / Discount Boundary",
        0.705: "0.705",
        0.786: "0.786",
        1.000: "Swing Low (100%)",
    }
    fib_levels: List[FibLevel] = [
        FibLevel(
            ratio=float(r),
            price=round(float(p), 5),
            label=_labels.get(float(r), str(round(r, 3))),
            is_premium=float(r) < PREMIUM_THRESHOLD,
            is_discount=float(r) > DISCOUNT_THRESHOLD,
        )
        for r, p in zip(ratios_arr, prices_arr)
    ]

    # Zone
    if current_ratio < PREMIUM_THRESHOLD:
        zone: Literal["premium", "equilibrium", "discount"] = "premium"
    elif current_ratio > DISCOUNT_THRESHOLD:
        zone = "discount"
    else:
        zone = "equilibrium"

    prem_threshold  = round(swing_high - rng * PREMIUM_THRESHOLD,  5)
    disc_threshold  = round(swing_high - rng * DISCOUNT_THRESHOLD, 5)
    golden_high     = round(swing_high - rng * 0.618, 5)
    golden_low      = round(swing_high - rng * 0.705, 5)
    eq              = round(swing_high - rng * 0.500, 5)

    return FibAnalysis(
        swing_high=round(swing_high, 5),
        swing_low=round(swing_low, 5),
        range_size=round(rng, 5),
        levels=levels_dict,
        fib_levels=fib_levels,
        current_price=round(current, 5),
        current_ratio=round(current_ratio, 4),
        zone=zone,
        premium_threshold=prem_threshold,
        discount_threshold=disc_threshold,
        golden_pocket_high=golden_high,
        golden_pocket_low=golden_low,
        equilibrium=eq,
    )


# ── Convenience helpers ────────────────────────────────────────────────────────

def premium_area(fib: FibAnalysis) -> Tuple[float, float]:
    """Returns (top, bottom) of the premium zone."""
    return (fib.swing_high, fib.premium_threshold)


def discount_area(fib: FibAnalysis) -> Tuple[float, float]:
    """Returns (top, bottom) of the discount zone."""
    return (fib.discount_threshold, fib.swing_low)


def is_premium(fib: FibAnalysis) -> bool:
    return fib.zone == "premium"


def is_discount(fib: FibAnalysis) -> bool:
    return fib.zone == "discount"


def get_fib_label(price: float, fib: FibAnalysis) -> Optional[float]:
    """Return the nearest Fibonacci ratio for a given price, or None if > 2% away."""
    if fib.range_size < 1e-10:
        return None
    ratios = np.array(list(fib.levels.keys()), dtype=np.float64)
    prices = np.array(list(fib.levels.values()), dtype=np.float64)
    dists  = np.abs(prices - price) / fib.range_size
    idx    = int(np.argmin(dists))
    return float(ratios[idx]) if dists[idx] < 0.02 else None
