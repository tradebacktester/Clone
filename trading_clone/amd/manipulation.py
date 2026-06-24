import logging
from dataclasses import dataclass
from datetime import datetime
from typing import List, Literal, Optional

from trading_clone.market_data.data_feed import Candle
from trading_clone.amd.accumulation import RangeInfo
from trading_clone.liquidity.stop_hunt import LiquidityGrab
from trading_clone.market_structure.swing_detector import calc_atr

logger = logging.getLogger(__name__)


@dataclass
class ManipResult:
    found: bool
    direction: Optional[Literal["bullish", "bearish"]]
    time: Optional[datetime]
    score: int


def detect_manipulation(
    candles: List[Candle],
    range_: RangeInfo,
    grabs: List[LiquidityGrab],
) -> ManipResult:
    NONE = ManipResult(found=False, direction=None, time=None, score=0)
    if not range_.is_range:
        grab = next((g for g in reversed(grabs) if g.confirmed), None)
        if grab:
            direction: Literal["bullish", "bearish"] = "bullish" if grab.type == "sweep_low" else "bearish"
            return ManipResult(found=True, direction=direction, time=grab.time, score=35)
        return NONE

    recent = candles[-20:]
    for i in range(len(recent) - 1):
        c = recent[i]
        if c.high > range_.high:
            returned = any(r.close < range_.high for r in recent[i + 1:])
            score = 15 + (20 if returned else 0)
            if score > 0:
                return ManipResult(found=True, direction="bearish", time=c.time, score=score)
        if c.low < range_.low:
            returned = any(r.close > range_.low for r in recent[i + 1:])
            score = 15 + (20 if returned else 0)
            if score > 0:
                return ManipResult(found=True, direction="bullish", time=c.time, score=score)

    grab = next((g for g in reversed(grabs[-3:]) if g.confirmed), None)
    if grab:
        direction = "bullish" if grab.type == "sweep_low" else "bearish"
        return ManipResult(found=True, direction=direction, time=grab.time, score=35)

    return NONE
