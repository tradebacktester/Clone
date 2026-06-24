import logging
from dataclasses import dataclass
from datetime import datetime
from typing import List, Literal, Optional

from trading_clone.market_data.data_feed import Candle
from trading_clone.market_structure.swing_detector import SwingPoint, calc_atr

logger = logging.getLogger(__name__)

SweepType = Literal["buy_side", "sell_side"]


@dataclass
class SweepEvent:
    time: datetime
    type: SweepType
    level_price: float
    sweep_price: float
    sweep_distance: float
    sweep_score: int


def _has_bos_after_sweep(candles: List[Candle], idx: int, sweep_type: SweepType) -> bool:
    post = candles[idx + 1: idx + 4]
    pre = candles[max(0, idx - 10): idx]
    if not post or not pre:
        return False
    if sweep_type == "buy_side":
        pre_low = min(c.low for c in pre)
        return any(c.close < pre_low for c in post)
    else:
        pre_high = max(c.high for c in pre)
        return any(c.close > pre_high for c in post)


def detect_sweeps(candles: List[Candle], swings: List[SwingPoint]) -> List[SweepEvent]:
    if len(candles) < 10:
        return []
    atr = calc_atr(candles)
    if atr == 0:
        return []

    min_sweep = atr * 0.5
    sweeps: List[SweepEvent] = []

    for i in range(10, len(candles)):
        c = candles[i]
        lookback20 = candles[max(0, i - 20): i]
        avg_vol = sum(x.volume for x in lookback20) / len(lookback20) if lookback20 else 0

        prior_highs = [s for s in swings if s.type == "high" and s.index < i]
        prior_lows = [s for s in swings if s.type == "low" and s.index < i]

        if prior_highs:
            level = max(prior_highs, key=lambda s: s.index)
            if c.high > level.price and c.close < level.price:
                dist = c.high - level.price
                dist_score = 40 if dist >= min_sweep else 0
                vol_score = 20 if avg_vol > 0 and c.volume > avg_vol * 1.2 else 0
                rng = c.high - c.low
                bear_body = c.open - c.close
                rev_score = 20 if bear_body > 0 and rng > 0 and bear_body / rng > 0.5 else 0
                bos_score = 20 if _has_bos_after_sweep(candles, i, "buy_side") else 0
                score = dist_score + vol_score + rev_score + bos_score
                if score >= 70:
                    sweeps.append(SweepEvent(time=c.time, type="buy_side",
                                             level_price=level.price, sweep_price=c.high,
                                             sweep_distance=round(dist / atr, 3),
                                             sweep_score=score))

        if prior_lows:
            level = max(prior_lows, key=lambda s: s.index)
            if c.low < level.price and c.close > level.price:
                dist = level.price - c.low
                dist_score = 40 if dist >= min_sweep else 0
                vol_score = 20 if avg_vol > 0 and c.volume > avg_vol * 1.2 else 0
                rng = c.high - c.low
                bull_body = c.close - c.open
                rev_score = 20 if bull_body > 0 and rng > 0 and bull_body / rng > 0.5 else 0
                bos_score = 20 if _has_bos_after_sweep(candles, i, "sell_side") else 0
                score = dist_score + vol_score + rev_score + bos_score
                if score >= 70:
                    sweeps.append(SweepEvent(time=c.time, type="sell_side",
                                             level_price=level.price, sweep_price=c.low,
                                             sweep_distance=round(dist / atr, 3),
                                             sweep_score=score))

    return sweeps


def recent_sweep(sweeps: List[SweepEvent], lookback: int, candles: List[Candle]) -> Optional[SweepEvent]:
    if not sweeps or not candles:
        return None
    cutoff = candles[max(0, len(candles) - lookback)].time
    recent = [s for s in sweeps if s.time >= cutoff]
    return recent[-1] if recent else None
