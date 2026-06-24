from dataclasses import dataclass
from typing import List, Literal, Optional

from trading_clone.market_structure.swing_detector import Candle, SwingPoint, detect_trend
from trading_clone.market_structure.support_resistance import SRLevel, major_support, major_resistance
from trading_clone.market_structure.premium_discount import FibAnalysis, premium_area, discount_area


@dataclass
class MarketStructureResult:
    pair: str
    timeframe: str
    current_price: float
    trend: Literal["bullish", "bearish", "ranging"]
    major_support: Optional[float]
    major_resistance: Optional[float]
    support_strength: int
    resistance_strength: int
    premium_high: Optional[float]
    premium_low: Optional[float]
    discount_high: Optional[float]
    discount_low: Optional[float]
    current_zone: Literal["premium", "equilibrium", "discount", "unknown"]
    fib_ratio: float
    swing_high: Optional[float]
    swing_low: Optional[float]


def analyse_structure(
    pair: str,
    timeframe: str,
    candles: List[Candle],
    swings: List[SwingPoint],
    sr_levels: List[SRLevel],
    fib: Optional[FibAnalysis],
) -> MarketStructureResult:
    trend = detect_trend(swings)
    current = candles[-1].close if candles else 0.0

    sup = major_support(sr_levels)
    res = major_resistance(sr_levels)

    if fib:
        p_high, p_low = premium_area(fib)
        d_high, d_low = discount_area(fib)
        current_zone = fib.zone
        fib_ratio = fib.current_ratio
        s_high = fib.swing_high
        s_low = fib.swing_low
    else:
        p_high = p_low = d_high = d_low = None
        current_zone = "unknown"
        fib_ratio = 0.0
        s_high = s_low = None

    return MarketStructureResult(
        pair=pair,
        timeframe=timeframe,
        current_price=round(current, 5),
        trend=trend,
        major_support=sup.price if sup else None,
        major_resistance=res.price if res else None,
        support_strength=sup.strength if sup else 0,
        resistance_strength=res.strength if res else 0,
        premium_high=round(p_high, 5) if p_high else None,
        premium_low=round(p_low, 5) if p_low else None,
        discount_high=round(d_high, 5) if d_high else None,
        discount_low=round(d_low, 5) if d_low else None,
        current_zone=current_zone,
        fib_ratio=fib_ratio,
        swing_high=s_high,
        swing_low=s_low,
    )
