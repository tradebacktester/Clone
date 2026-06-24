import logging
from dataclasses import dataclass
from typing import List, Optional

from trading_clone.market_data.data_feed import Candle
from trading_clone.market_structure.swing_detector import calc_atr

logger = logging.getLogger(__name__)


@dataclass
class RangeInfo:
    high: float
    low: float
    bars: int
    is_range: bool
    score: int


def detect_accumulation_range(candles: List[Candle]) -> RangeInfo:
    NONE = RangeInfo(high=0, low=0, bars=0, is_range=False, score=0)
    if len(candles) < 10:
        return NONE
    atr = calc_atr(candles)
    if atr == 0:
        return NONE

    max_window = min(50, len(candles))
    for window in range(max_window, 9, -1):
        sl = candles[-window:]
        high = max(c.high for c in sl)
        low = min(c.low for c in sl)
        width = high - low
        avg_body = sum(abs(c.close - c.open) for c in sl) / len(sl)
        if avg_body >= atr * 0.8:
            continue
        bars_score = 15 if 10 <= window <= 50 else 0
        width_score = 15 if width < atr else 0
        score = bars_score + width_score
        if score > 0:
            return RangeInfo(high=high, low=low, bars=window, is_range=True, score=score)

    return NONE
