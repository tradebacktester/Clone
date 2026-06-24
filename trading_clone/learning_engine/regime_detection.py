import logging
import math
from dataclasses import dataclass
from typing import List, Literal

from trading_clone.market_data.data_feed import Candle
from trading_clone.market_structure.swing_detector import calc_atr, detect_swings, detect_trend

logger = logging.getLogger(__name__)

Regime = Literal["trending_bullish", "trending_bearish", "ranging", "volatile"]


@dataclass
class RegimeResult:
    regime: Regime
    confidence: float
    atr_ratio: float
    trend: str


def detect_regime(candles: List[Candle]) -> RegimeResult:
    if len(candles) < 50:
        return RegimeResult(regime="ranging", confidence=50.0, atr_ratio=1.0, trend="ranging")

    atr = calc_atr(candles, period=14)
    long_atr = calc_atr(candles[:len(candles) // 2], period=14)
    atr_ratio = round(atr / long_atr, 3) if long_atr > 0 else 1.0

    if atr_ratio > 1.5:
        return RegimeResult(regime="volatile", confidence=75.0, atr_ratio=atr_ratio, trend="volatile")

    swings = detect_swings(candles)
    trend = detect_trend(swings)

    if trend == "bullish":
        return RegimeResult(regime="trending_bullish", confidence=70.0, atr_ratio=atr_ratio, trend=trend)
    if trend == "bearish":
        return RegimeResult(regime="trending_bearish", confidence=70.0, atr_ratio=atr_ratio, trend=trend)

    return RegimeResult(regime="ranging", confidence=60.0, atr_ratio=atr_ratio, trend="ranging")
