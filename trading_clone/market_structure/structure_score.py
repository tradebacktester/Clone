"""
Structure Score — Market Structure Engine V2
=============================================
Orchestrates all sub-modules and returns a rich MarketStructureResult.

Score breakdown (max 100):
  ┌──────────────────┬──────┬──────────────────────────────────────────────┐
  │ Component        │  Max │ Condition                                    │
  ├──────────────────┼──────┼──────────────────────────────────────────────┤
  │ Trend clarity    │   30 │ Confirmed HH/HL or LH/LL from 3+ swings      │
  │ SR alignment     │   25 │ Price near major S or R level (< 1 ATR away) │
  │ Fib zone         │   25 │ Price in premium (sell) or discount (buy)    │
  │ Swing quality    │   20 │ Avg strength of last 4 swings                │
  └──────────────────┴──────┴──────────────────────────────────────────────┘

Public exports
--------------
  MarketStructureResult   — full output object
  analyse_structure()     — orchestrator (all sub-modules → result)
  score_summary()         — one-line human summary
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import List, Literal, Optional

import numpy as np

from trading_clone.market_structure.swing_detector import (
    Candle, SwingPoint, calc_atr, detect_swings, detect_trend,
)
from trading_clone.market_structure.support_resistance import (
    SRLevel, detect_sr_levels, major_support, major_resistance,
)
from trading_clone.market_structure.premium_discount import (
    FibAnalysis, FibLevel, calc_fib, premium_area, discount_area,
)


# ── Output object ─────────────────────────────────────────────────────────────

@dataclass
class MarketStructureResult:
    # Identity
    pair:              str
    timeframe:         str
    current_price:     float
    atr:               float

    # Trend
    trend:             Literal["bullish", "bearish", "ranging"]
    swing_count:       int
    last_swing_high:   Optional[float]
    last_swing_low:    Optional[float]

    # Support / Resistance
    sr_levels:         List[SRLevel]
    major_support:     Optional[float]
    major_resistance:  Optional[float]
    support_strength:  int
    resistance_strength: int
    distance_to_support:    Optional[float]   # in ATR units
    distance_to_resistance: Optional[float]   # in ATR units

    # Fibonacci / Premium-Discount
    fib:               Optional[FibAnalysis]
    swing_high:        Optional[float]
    swing_low:         Optional[float]
    current_zone:      Literal["premium", "equilibrium", "discount", "unknown"]
    fib_ratio:         float                  # 0=at high, 1=at low
    premium_high:      Optional[float]
    premium_low:       Optional[float]
    discount_high:     Optional[float]
    discount_low:      Optional[float]
    equilibrium:       Optional[float]
    golden_pocket_high: Optional[float]
    golden_pocket_low:  Optional[float]

    # Composite score
    score:             int                    # 0–100
    score_components:  dict                   # breakdown for debugging


# ── Orchestrator ──────────────────────────────────────────────────────────────

def analyse_structure(
    pair:      str,
    timeframe: str,
    candles:   List[Candle],
    swings:    Optional[List[SwingPoint]] = None,
    sr_levels: Optional[List[SRLevel]]    = None,
    fib:       Optional[FibAnalysis]      = None,
) -> MarketStructureResult:
    """
    Run all sub-modules if not pre-computed, then score and return
    a fully-populated MarketStructureResult.
    """
    if not candles:
        return _null_result(pair, timeframe)

    atr     = calc_atr(candles)
    current = candles[-1].close

    # Allow callers to pass pre-computed results (for efficiency)
    swings    = swings    or detect_swings(candles)
    sr_levels = sr_levels or detect_sr_levels(candles, swings)
    fib       = fib       or calc_fib(candles)

    trend = detect_trend(swings)

    # Swing extremes
    highs = [s for s in swings if s.type == "high"]
    lows  = [s for s in swings if s.type == "low"]
    last_sh = highs[-1].price if highs else None
    last_sl = lows[-1].price  if lows  else None

    # SR distances
    sup = major_support(sr_levels)
    res = major_resistance(sr_levels)
    dist_sup = round(abs(current - sup.price) / atr, 2) if sup and atr else None
    dist_res = round(abs(current - res.price) / atr, 2) if res and atr else None

    # Fib fields
    if fib:
        ph, pl = premium_area(fib)
        dh, dl = discount_area(fib)
        current_zone = fib.zone
        fib_ratio    = fib.current_ratio
        s_high, s_low = fib.swing_high, fib.swing_low
        eq   = fib.equilibrium
        gph  = fib.golden_pocket_high
        gpl  = fib.golden_pocket_low
    else:
        ph = pl = dh = dl = s_high = s_low = eq = gph = gpl = None
        current_zone  = "unknown"
        fib_ratio     = 0.0

    # ── Score ─────────────────────────────────────────────────────────────
    comp = _score_components(swings, trend, sup, res, fib, current, atr)
    total_score = min(100, sum(comp.values()))

    return MarketStructureResult(
        pair=pair, timeframe=timeframe,
        current_price=round(current, 5), atr=round(atr, 5),

        trend=trend,
        swing_count=len(swings),
        last_swing_high=round(last_sh, 5) if last_sh else None,
        last_swing_low=round(last_sl, 5)  if last_sl  else None,

        sr_levels=sr_levels,
        major_support=sup.price   if sup else None,
        major_resistance=res.price if res else None,
        support_strength=sup.strength    if sup else 0,
        resistance_strength=res.strength if res else 0,
        distance_to_support=dist_sup,
        distance_to_resistance=dist_res,

        fib=fib,
        swing_high=round(s_high, 5) if s_high else None,
        swing_low=round(s_low,   5) if s_low  else None,
        current_zone=current_zone,
        fib_ratio=fib_ratio,
        premium_high=round(ph, 5) if ph else None,
        premium_low=round(pl, 5)  if pl else None,
        discount_high=round(dh, 5) if dh else None,
        discount_low=round(dl, 5)  if dl else None,
        equilibrium=round(eq, 5)   if eq else None,
        golden_pocket_high=round(gph, 5) if gph else None,
        golden_pocket_low=round(gpl, 5)  if gpl else None,

        score=total_score,
        score_components=comp,
    )


# ── Scoring sub-components ────────────────────────────────────────────────────

def _score_components(
    swings:  List[SwingPoint],
    trend:   str,
    sup:     Optional[SRLevel],
    res:     Optional[SRLevel],
    fib:     Optional[FibAnalysis],
    current: float,
    atr:     float,
) -> dict:
    # (1) Trend clarity — need confirmed HH/HL or LH/LL
    highs = [s for s in swings if s.type == "high"]
    lows  = [s for s in swings if s.type == "low"]
    if trend != "ranging" and len(highs) >= 2 and len(lows) >= 2:
        # More confirmed swings = more confidence
        swing_pairs = min(len(highs), len(lows))
        trend_pts = min(30, 15 + swing_pairs * 3)
    else:
        trend_pts = 0

    # (2) SR alignment — price within 1 ATR of a major S or R
    sr_pts = 0
    if atr > 0:
        if sup and abs(current - sup.price) <= atr:
            sr_pts = max(sr_pts, min(25, int(sup.strength * 0.25)))
        if res and abs(current - res.price) <= atr:
            sr_pts = max(sr_pts, min(25, int(res.strength * 0.25)))

    # (3) Fib zone — premium or discount scores, equilibrium = 0
    fib_pts = 0
    if fib:
        if fib.zone in ("premium", "discount"):
            # Distance from equilibrium → stronger signal
            dist_from_eq = abs(fib.current_ratio - 0.5)
            fib_pts = min(25, int(dist_from_eq * 50))

    # (4) Swing quality — avg strength of last 4 swings
    last4 = swings[-4:] if len(swings) >= 4 else swings
    if last4:
        avg_strength = float(np.mean([s.strength for s in last4]))
        swing_pts = min(20, int(avg_strength * 0.20))
    else:
        swing_pts = 0

    return {
        "trend_clarity": trend_pts,
        "sr_alignment":  sr_pts,
        "fib_zone":      fib_pts,
        "swing_quality": swing_pts,
    }


# ── Human summary ─────────────────────────────────────────────────────────────

def score_summary(result: MarketStructureResult) -> str:
    comp = result.score_components
    return (
        f"Score={result.score}/100  "
        f"[Trend={comp.get('trend_clarity',0)}  "
        f"SR={comp.get('sr_alignment',0)}  "
        f"Fib={comp.get('fib_zone',0)}  "
        f"Swings={comp.get('swing_quality',0)}]  "
        f"Trend={result.trend.upper()}  "
        f"Zone={result.current_zone.upper()}"
    )


# ── Null result ───────────────────────────────────────────────────────────────

def _null_result(pair: str, timeframe: str) -> MarketStructureResult:
    return MarketStructureResult(
        pair=pair, timeframe=timeframe, current_price=0.0, atr=0.0,
        trend="ranging", swing_count=0,
        last_swing_high=None, last_swing_low=None,
        sr_levels=[], major_support=None, major_resistance=None,
        support_strength=0, resistance_strength=0,
        distance_to_support=None, distance_to_resistance=None,
        fib=None, swing_high=None, swing_low=None,
        current_zone="unknown", fib_ratio=0.0,
        premium_high=None, premium_low=None,
        discount_high=None, discount_low=None,
        equilibrium=None, golden_pocket_high=None, golden_pocket_low=None,
        score=0, score_components={},
    )
