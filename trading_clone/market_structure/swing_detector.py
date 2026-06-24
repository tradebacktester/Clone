from dataclasses import dataclass
from datetime import datetime
from typing import List, Literal


@dataclass
class Candle:
    time: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float
    pair: str
    timeframe: str


@dataclass
class SwingPoint:
    index: int
    time: datetime
    price: float
    type: Literal["high", "low"]


def calc_atr(candles: List[Candle], period: int = 14) -> float:
    if len(candles) < 2:
        return 0.0
    trs = []
    for i in range(1, min(period + 1, len(candles))):
        c = candles[i]
        prev = candles[i - 1]
        tr = max(c.high - c.low, abs(c.high - prev.close), abs(c.low - prev.close))
        trs.append(tr)
    return sum(trs) / len(trs) if trs else 0.0


def detect_swings(candles: List[Candle], left: int = 5, right: int = 5) -> List[SwingPoint]:
    swings: List[SwingPoint] = []
    n = len(candles)
    for i in range(left, n - right):
        c = candles[i]
        is_high = all(c.high >= candles[j].high for j in range(i - left, i + right + 1) if j != i)
        is_low  = all(c.low  <= candles[j].low  for j in range(i - left, i + right + 1) if j != i)
        if is_high:
            swings.append(SwingPoint(index=i, time=c.time, price=c.high, type="high"))
        if is_low:
            swings.append(SwingPoint(index=i, time=c.time, price=c.low,  type="low"))
    return sorted(swings, key=lambda s: s.index)


def detect_trend(swings: List[SwingPoint]) -> Literal["bullish", "bearish", "ranging"]:
    highs = [s for s in swings if s.type == "high"]
    lows  = [s for s in swings if s.type == "low"]
    if len(highs) >= 2 and len(lows) >= 2:
        hh = highs[-1].price > highs[-2].price
        hl = lows[-1].price  > lows[-2].price
        lh = highs[-1].price < highs[-2].price
        ll = lows[-1].price  < lows[-2].price
        if hh and hl:
            return "bullish"
        if lh and ll:
            return "bearish"
    return "ranging"
