from dataclasses import dataclass
from typing import List, Literal, Optional

from trading_clone.market_structure.swing_detector import Candle, SwingPoint, calc_atr


@dataclass
class SRLevel:
    price: float
    type: Literal["support", "resistance"]
    strength: int
    touch_count: int
    broken: bool = False


def detect_sr_levels(candles: List[Candle], swings: List[SwingPoint]) -> List[SRLevel]:
    if not candles or not swings:
        return []
    atr = calc_atr(candles)
    tolerance = atr * 0.3
    current_price = candles[-1].close

    prices = [s.price for s in swings]
    used: List[float] = []
    levels: List[SRLevel] = []

    for price in prices:
        if any(abs(price - u) <= tolerance for u in used):
            continue
        cluster = [p for p in prices if abs(p - price) <= tolerance]
        touch_count = len(cluster)
        avg_price = sum(cluster) / touch_count
        strength = min(100, 40 + touch_count * 15)
        level_type: Literal["support", "resistance"] = (
            "support" if avg_price < current_price else "resistance"
        )
        broken = _is_broken(avg_price, level_type, candles, atr)
        if not broken:
            levels.append(SRLevel(
                price=round(avg_price, 5),
                type=level_type,
                strength=strength,
                touch_count=touch_count,
            ))
        used.append(avg_price)

    levels.sort(key=lambda l: l.strength, reverse=True)
    return levels[:10]


def _is_broken(price: float, level_type: str, candles: List[Candle], atr: float) -> bool:
    margin = atr * 0.5
    for c in candles[-10:]:
        if level_type == "resistance" and c.close > price + margin:
            return True
        if level_type == "support"    and c.close < price - margin:
            return True
    return False


def major_support(levels: List[SRLevel]) -> Optional[SRLevel]:
    supports = [l for l in levels if l.type == "support"]
    return supports[0] if supports else None


def major_resistance(levels: List[SRLevel]) -> Optional[SRLevel]:
    resistances = [l for l in levels if l.type == "resistance"]
    return resistances[0] if resistances else None
