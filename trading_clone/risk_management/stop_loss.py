import logging
from typing import Literal

from trading_clone.market_structure.swing_detector import SwingPoint

logger = logging.getLogger(__name__)


def calc_zone_stop(zone_bottom: float, zone_top: float, direction: Literal["buy", "sell"],
                   atr: float) -> float:
    buf = atr * 0.2
    if direction == "buy":
        return round(zone_bottom - buf, 5)
    return round(zone_top + buf, 5)


def calc_swing_stop(swings: list[SwingPoint], direction: Literal["buy", "sell"],
                    atr: float) -> float:
    buf = atr * 0.1
    if direction == "buy":
        lows = [s for s in swings if s.type == "low"]
        if not lows:
            return 0.0
        return round(min(s.price for s in lows[-3:]) - buf, 5)
    highs = [s for s in swings if s.type == "high"]
    if not highs:
        return 0.0
    return round(max(s.price for s in highs[-3:]) + buf, 5)
