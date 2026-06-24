import logging
from dataclasses import dataclass
from typing import List

from trading_clone.market_data.data_feed import Candle
from trading_clone.market_structure.swing_detector import SwingPoint, calc_atr

logger = logging.getLogger(__name__)


@dataclass
class SRLevel:
    price: float
    strength: int
    type: str
    touch_count: int
    broken: bool = False


def detect_sr_levels(candles: List[Candle], swings: List[SwingPoint]) -> List[SRLevel]:
    if not candles:
        return []
    atr = calc_atr(candles)
    tolerance = atr * 0.3
    levels: List[SRLevel] = []

    prices = [s.price for s in swings]
    used: List[float] = []

    for price in prices:
        if any(abs(price - u) <= tolerance for u in used):
            continue
        cluster = [p for p in prices if abs(p - price) <= tolerance]
        touch_count = len(cluster)
        avg_price = sum(cluster) / touch_count
        strength = min(100, 40 + touch_count * 15)
        level_type = "resistance" if avg_price > candles[-1].close else "support"
        broken = _is_broken(avg_price, level_type, candles, atr)
        if not broken:
            levels.append(SRLevel(price=round(avg_price, 5), strength=strength,
                                  type=level_type, touch_count=touch_count))
        used.append(avg_price)

    levels.sort(key=lambda l: l.strength, reverse=True)
    return levels[:10]


def _is_broken(price: float, level_type: str, candles: List[Candle], atr: float) -> bool:
    margin = atr * 0.5
    for c in candles[-10:]:
        if level_type == "resistance" and c.close > price + margin:
            return True
        if level_type == "support" and c.close < price - margin:
            return True
    return False


def nearest_sr(price: float, levels: List[SRLevel]) -> SRLevel | None:
    if not levels:
        return None
    return min(levels, key=lambda l: abs(l.price - price))
