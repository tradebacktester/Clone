import logging
from dataclasses import dataclass
from typing import List, Optional

from trading_clone.market_data.data_feed import Candle

logger = logging.getLogger(__name__)

FIB_LEVELS = [0.0, 0.236, 0.382, 0.5, 0.618, 0.705, 0.786, 1.0]


@dataclass
class FibAnalysis:
    swing_high: float
    swing_low: float
    levels: dict
    current_ratio: float
    zone: str


def calc_fib(candles: List[Candle], lookback: int = 100) -> Optional[FibAnalysis]:
    if len(candles) < lookback:
        return None
    slice_ = candles[-lookback:]
    high = max(c.high for c in slice_)
    low = min(c.low for c in slice_)
    rng = high - low
    if rng == 0:
        return None
    current = candles[-1].close
    ratio = (high - current) / rng
    levels = {lvl: round(high - rng * lvl, 5) for lvl in FIB_LEVELS}
    zone = "premium" if ratio < 0.5 else "discount" if ratio > 0.5 else "equilibrium"
    return FibAnalysis(swing_high=high, swing_low=low, levels=levels,
                       current_ratio=round(ratio, 4), zone=zone)


def is_premium(fib: FibAnalysis) -> bool:
    return fib.current_ratio < 0.5


def is_discount(fib: FibAnalysis) -> bool:
    return fib.current_ratio > 0.5


def nearest_fib_level(price: float, fib: FibAnalysis) -> float:
    return min(fib.levels.values(), key=lambda p: abs(p - price))


def get_fib_label(price: float, fib: FibAnalysis) -> Optional[float]:
    for lvl, lvl_price in fib.levels.items():
        if abs(price - lvl_price) / max(abs(fib.swing_high - fib.swing_low), 1e-8) < 0.02:
            return lvl
    return None
