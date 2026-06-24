import logging
from dataclasses import dataclass
from typing import List

from trading_clone.market_data.data_feed import Candle
from trading_clone.market_structure.swing_detector import calc_atr

logger = logging.getLogger(__name__)


@dataclass
class ConfirmationResult:
    valid: bool
    score: int
    notes: List[str]


def check_bullish_confirmation(candles: List[Candle]) -> ConfirmationResult:
    if len(candles) < 3:
        return ConfirmationResult(valid=False, score=0, notes=["Not enough candles"])
    atr = calc_atr(candles)
    c = candles[-2]
    notes: List[str] = []
    score = 0

    body = c.close - c.open
    if body > 0:
        score += 30
        notes.append("Bullish close")

    rng = c.high - c.low
    body_ratio = body / rng if rng > 0 else 0
    if body_ratio > 0.6:
        score += 30
        notes.append(f"Strong body ratio ({body_ratio:.2f})")

    prior_high = max(x.high for x in candles[-12:-2])
    if c.close > prior_high:
        score += 40
        notes.append("BOS — close above prior high")

    lower_wick = c.open - c.low
    if lower_wick > atr * 0.3:
        score += 10
        notes.append("Wick sweep below — rejection")

    return ConfirmationResult(valid=score >= 70, score=min(100, score), notes=notes)
