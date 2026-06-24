import logging
from dataclasses import dataclass
from datetime import datetime
from typing import List, Optional

from trading_clone.market_data.data_feed import Candle
from trading_clone.market_structure.swing_detector import calc_atr

logger = logging.getLogger(__name__)


@dataclass
class DemandZone:
    pair: str
    timeframe: str
    price_top: float
    price_bottom: float
    origin_time: datetime
    origin_index: int
    move_size: float
    base_candles: int
    impulse_wick: float
    tested: int = 0
    active: bool = True


def detect_demand_zones(
    pair: str, timeframe: str, candles: List[Candle]
) -> List[DemandZone]:
    if len(candles) < 20:
        return []
    atr = calc_atr(candles)
    if atr == 0:
        return []

    impulse_threshold = atr * 1.5
    zones: List[DemandZone] = []

    for i in range(3, len(candles)):
        c = candles[i]
        body = c.close - c.open
        if body < impulse_threshold:
            continue

        impulse_wick = min(c.open, c.close) - c.low
        base_top = c.open
        base_bottom = c.open
        base_count = 0

        for b in range(i - 1, max(0, i - 4) - 1, -1):
            base = candles[b]
            if abs(base.close - base.open) > atr * 0.8:
                break
            base_top = max(base_top, base.high)
            base_bottom = min(base_bottom, base.low)
            base_count += 1

        if base_count == 0:
            base_top = max(c.open, c.high * 0.998)
            base_bottom = min(c.open, c.low * 1.002)

        tested = _count_retests(base_top, base_bottom, candles, i)
        broken = _is_broken(base_bottom, candles, i)
        if broken:
            continue

        zones.append(DemandZone(
            pair=pair, timeframe=timeframe,
            price_top=round(base_top, 5), price_bottom=round(base_bottom, 5),
            origin_time=c.time, origin_index=i,
            move_size=round(body / atr, 2),
            base_candles=base_count, impulse_wick=round(impulse_wick, 5),
            tested=tested, active=True,
        ))

    zones.sort(key=lambda z: z.origin_index, reverse=True)
    return zones[:6]


def _count_retests(top: float, bottom: float, candles: List[Candle], from_idx: int) -> int:
    count = 0
    in_zone = False
    for c in candles[from_idx + 1:]:
        touches = c.low <= top and c.high >= bottom
        if touches and not in_zone:
            count += 1
            in_zone = True
        elif not touches:
            in_zone = False
    return count


def _is_broken(bottom: float, candles: List[Candle], from_idx: int) -> bool:
    for c in candles[from_idx + 1:]:
        if c.close < bottom * 0.997:
            return True
    return False
