import logging
from dataclasses import dataclass
from typing import List, Optional

from trading_clone.market_data.data_feed import Candle
from trading_clone.market_structure.swing_detector import SwingPoint, calc_atr

logger = logging.getLogger(__name__)


@dataclass
class LiquidityLevel:
    price: float
    type: str
    swept: bool
    strength: int
    sweep_time: Optional[object] = None


def detect_liquidity_levels(candles: List[Candle], swings: List[SwingPoint]) -> List[LiquidityLevel]:
    levels: List[LiquidityLevel] = []
    atr = calc_atr(candles)
    tolerance = atr * 0.3

    highs = [s for s in swings if s.type == "high"]
    lows = [s for s in swings if s.type == "low"]

    for group_type, swing_list, level_type in [
        ("equal_highs", highs, "equal_highs"),
        ("equal_lows", lows, "equal_lows"),
    ]:
        prices = [s.price for s in swing_list]
        groups: List[dict] = []
        for p in prices:
            found = next((g for g in groups if abs(g["price"] - p) <= tolerance), None)
            if found:
                found["count"] += 1
                found["sum"] += p
                found["price"] = found["sum"] / found["count"]
            else:
                groups.append({"price": p, "count": 1, "sum": p})
        for g in groups:
            if g["count"] >= 2:
                strength = min(100, 50 + g["count"] * 15)
                levels.append(LiquidityLevel(price=round(g["price"], 5),
                                             type=level_type, swept=False, strength=strength))

    if len(candles) >= 20:
        prev_day = candles[-48:-24]
        if prev_day:
            levels.append(LiquidityLevel(price=max(c.high for c in prev_day),
                                         type="prev_high", swept=False, strength=70))
            levels.append(LiquidityLevel(price=min(c.low for c in prev_day),
                                         type="prev_low", swept=False, strength=70))
        prev_week = candles[-7 * 6: -6]
        if prev_week:
            levels.append(LiquidityLevel(price=max(c.high for c in prev_week),
                                         type="prev_week_high", swept=False, strength=80))
            levels.append(LiquidityLevel(price=min(c.low for c in prev_week),
                                         type="prev_week_low", swept=False, strength=80))

    _mark_swept(levels, candles, atr)
    return levels


def _mark_swept(levels: List[LiquidityLevel], candles: List[Candle], atr: float) -> None:
    recent = candles[-20:]
    buf = atr * 0.1
    high_types = {"equal_highs", "prev_high", "prev_week_high"}
    low_types = {"equal_lows", "prev_low", "prev_week_low"}
    for lvl in levels:
        if lvl.swept:
            continue
        for c in recent:
            if lvl.type in high_types and c.high > lvl.price + buf:
                lvl.swept = True
                lvl.sweep_time = c.time
                break
            if lvl.type in low_types and c.low < lvl.price - buf:
                lvl.swept = True
                lvl.sweep_time = c.time
                break
