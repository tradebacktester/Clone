import logging
from dataclasses import dataclass
from datetime import datetime
from typing import List, Optional

from trading_clone.market_data.data_feed import Candle
from trading_clone.liquidity.liquidity_score import LiquidityLevel
from trading_clone.market_structure.swing_detector import calc_atr

logger = logging.getLogger(__name__)


@dataclass
class LiquidityGrab:
    time: datetime
    price: float
    type: str
    level_swept: float
    reversal_strength: float
    confirmed: bool


def detect_liquidity_grabs(
    candles: List[Candle], levels: List[LiquidityLevel]
) -> List[LiquidityGrab]:
    grabs: List[LiquidityGrab] = []
    atr = calc_atr(candles)
    min_sweep = atr * 0.1
    min_reversal = atr * 0.3
    high_types = {"equal_highs", "prev_high", "prev_week_high"}
    low_types = {"equal_lows", "prev_low", "prev_week_low"}

    for i in range(5, len(candles) - 1):
        c = candles[i]
        nxt = candles[i + 1]

        for lvl in levels:
            if lvl.swept:
                continue

            if lvl.type in high_types and c.high > lvl.price + min_sweep:
                rev = c.high - c.close
                next_down = nxt.close < c.close
                if rev > min_reversal or next_down:
                    strength = min(100.0, (rev / atr) * 50)
                    confirmed = rev > min_reversal and next_down
                    grabs.append(LiquidityGrab(time=c.time, price=c.high,
                                               type="sweep_high", level_swept=lvl.price,
                                               reversal_strength=round(strength, 2),
                                               confirmed=confirmed))
                    lvl.swept = True
                    lvl.sweep_time = c.time

            elif lvl.type in low_types and c.low < lvl.price - min_sweep:
                rev = c.close - c.low
                next_up = nxt.close > c.close
                if rev > min_reversal or next_up:
                    strength = min(100.0, (rev / atr) * 50)
                    confirmed = rev > min_reversal and next_up
                    grabs.append(LiquidityGrab(time=c.time, price=c.low,
                                               type="sweep_low", level_swept=lvl.price,
                                               reversal_strength=round(strength, 2),
                                               confirmed=confirmed))
                    lvl.swept = True
                    lvl.sweep_time = c.time

    return grabs[-10:]


def recent_grab(grabs: List[LiquidityGrab], lookback: int = 10,
                candles: Optional[List[Candle]] = None) -> Optional[LiquidityGrab]:
    if not grabs:
        return None
    candidates = [g for g in grabs if g.confirmed]
    if candles and len(candles) >= lookback:
        cutoff = candles[max(0, len(candles) - lookback)].time
        candidates = [g for g in candidates if g.time >= cutoff]
    return candidates[-1] if candidates else None
