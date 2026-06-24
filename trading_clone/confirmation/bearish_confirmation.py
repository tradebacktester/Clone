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


def check_bearish_confirmation(candles: List[Candle]) -> ConfirmationResult:
    if len(candles) < 3:
        return ConfirmationResult(valid=False, score=0, notes=["Not enough candles"])
    atr = calc_atr(candles)
    c = candles[-2]
    notes: List[str] = []
    score = 0

    body = c.open - c.close
    if body > 0:
        score += 30
        notes.append("Bearish close")

    rng = c.high - c.low
    body_ratio = body / rng if rng > 0 else 0
    if body_ratio > 0.6:
        score += 30
        notes.append(f"Strong body ratio ({body_ratio:.2f})")

    prior_low = min(x.low for x in candles[-12:-2])
    if c.close < prior_low:
        score += 40
        notes.append("BOS — close below prior low")

    upper_wick = c.high - c.open
    if upper_wick > atr * 0.3:
        score += 10
        notes.append("Wick sweep above — rejection")

    return ConfirmationResult(valid=score >= 70, score=min(100, score), notes=notes)
