from dataclasses import dataclass
from typing import Dict, List, Literal, Optional

from trading_clone.market_structure.swing_detector import Candle


FIB_LEVELS = [0.0, 0.236, 0.382, 0.5, 0.618, 0.705, 0.786, 1.0]


@dataclass
class FibAnalysis:
    swing_high: float
    swing_low: float
    range_size: float
    levels: Dict[float, float]
    current_price: float
    current_ratio: float
    zone: Literal["premium", "equilibrium", "discount"]
    premium_threshold: float
    discount_threshold: float


def calc_fib(candles: List[Candle], lookback: int = 100) -> Optional[FibAnalysis]:
    if len(candles) < 10:
        return None
    sl = candles[-min(lookback, len(candles)):]
    high  = max(c.high for c in sl)
    low   = min(c.low  for c in sl)
    rng   = high - low
    if rng == 0:
        return None

    current = candles[-1].close
    ratio = (high - current) / rng

    levels = {lvl: round(high - rng * lvl, 5) for lvl in FIB_LEVELS}

    if ratio < 0.45:
        zone: Literal["premium", "equilibrium", "discount"] = "premium"
    elif ratio > 0.55:
        zone = "discount"
    else:
        zone = "equilibrium"

    return FibAnalysis(
        swing_high=round(high, 5),
        swing_low=round(low, 5),
        range_size=round(rng, 5),
        levels=levels,
        current_price=round(current, 5),
        current_ratio=round(ratio, 4),
        zone=zone,
        premium_threshold=round(high - rng * 0.45, 5),
        discount_threshold=round(high - rng * 0.55, 5),
    )


def premium_area(fib: FibAnalysis) -> tuple:
    return (fib.swing_high, fib.premium_threshold)


def discount_area(fib: FibAnalysis) -> tuple:
    return (fib.discount_threshold, fib.swing_low)


def is_premium(fib: FibAnalysis) -> bool:
    return fib.zone == "premium"


def is_discount(fib: FibAnalysis) -> bool:
    return fib.zone == "discount"


def get_fib_label(price: float, fib: FibAnalysis) -> Optional[float]:
    for lvl, lvl_price in fib.levels.items():
        if abs(price - lvl_price) / max(fib.range_size, 1e-8) < 0.02:
            return lvl
    return None
