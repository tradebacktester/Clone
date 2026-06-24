import logging
from dataclasses import dataclass
from datetime import datetime
from typing import List, Literal, Optional

from trading_clone.market_data.data_feed import Candle
from trading_clone.market_structure.swing_detector import calc_atr

logger = logging.getLogger(__name__)


@dataclass
class DistResult:
    found: bool
    start_time: Optional[datetime]
    score: int


def detect_distribution(
    candles: List[Candle],
    manip_time: datetime,
    direction: Literal["bullish", "bearish"],
) -> DistResult:
    NONE = DistResult(found=False, start_time=None, score=0)
    atr = calc_atr(candles)
    after = [c for c in candles if c.time > manip_time]
    if len(after) < 2:
        return NONE

    sl = after[:10]
    first_close = sl[0].close
    last_close = sl[-1].close
    move = abs(last_close - first_close)

    is_directional = (last_close > first_close) if direction == "bullish" else (last_close < first_close)
    if not is_directional:
        return NONE

    bos_score = 15
    move_score = 20 if move > atr * 1.5 else 0
    if bos_score + move_score == 0:
        return NONE

    return DistResult(found=True, start_time=sl[0].time, score=bos_score + move_score)
