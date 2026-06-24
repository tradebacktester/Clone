import logging
from dataclasses import dataclass
from typing import List, Literal, Optional

from trading_clone.market_data.data_feed import Candle
from trading_clone.market_structure.swing_detector import SwingPoint, detect_trend
from trading_clone.market_structure.support_resistance import SRLevel
from trading_clone.market_structure.premium_discount import FibAnalysis

logger = logging.getLogger(__name__)


@dataclass
class StructureScore:
    trend: Literal["bullish", "bearish", "ranging"]
    trend_score: int
    sr_score: int
    fib_score: int
    total: int
    notes: List[str]


def score_structure(
    candles: List[Candle],
    swings: List[SwingPoint],
    sr_levels: List[SRLevel],
    fib: Optional[FibAnalysis],
    direction: Literal["buy", "sell"],
) -> StructureScore:
    notes: List[str] = []
    trend = detect_trend(swings)

    trend_score = 0
    if direction == "buy" and trend == "bullish":
        trend_score = 30
        notes.append("Bullish trend aligned with buy")
    elif direction == "sell" and trend == "bearish":
        trend_score = 30
        notes.append("Bearish trend aligned with sell")
    elif trend == "ranging":
        trend_score = 10
        notes.append("Ranging market — reduced confidence")

    sr_score = 0
    current_price = candles[-1].close if candles else 0.0
    for lvl in sr_levels[:3]:
        dist = abs(lvl.price - current_price)
        if dist < 0.001:
            sr_score += lvl.strength // 3
            notes.append(f"Near SR level {lvl.price} (strength {lvl.strength})")
            break

    fib_score = 0
    if fib:
        if direction == "buy" and fib.zone == "discount":
            fib_score = 20
            notes.append("Price in discount zone — bullish bias")
        elif direction == "sell" and fib.zone == "premium":
            fib_score = 20
            notes.append("Price in premium zone — bearish bias")

    total = min(100, trend_score + sr_score + fib_score)
    return StructureScore(trend=trend, trend_score=trend_score, sr_score=sr_score,
                          fib_score=fib_score, total=total, notes=notes)
