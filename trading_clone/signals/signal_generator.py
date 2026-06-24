"""
Signal Generator — Build #5
==============================
Combines all four engine outputs into a final trade signal.

Signal logic
------------
  BUY   — bullish bias across ≥ 3 of 4 engines + confidence ≥ 65
  SELL  — bearish bias across ≥ 3 of 4 engines + confidence ≥ 65
  NO TRADE — conflicting engines, low confidence, or AMD not confirmed

Confidence score (0–100)
  Engine weights use AdaptiveWeightLearner (defaults until 50 trades):
    Zone (S&D)     30%
    Liquidity      25%
    AMD            25%
    Confirmation   20%   ← market structure alignment

Output
------
  signal:       "BUY" | "SELL" | "NO TRADE"
  confidence:   0–100
  grade:        "A+" ≥90  "A" ≥80  "B" ≥70  "C" ≥60  "D" <60
  reason:       plain-text explanation
  engine_votes  dict of each engine's directional vote + score
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Literal, Optional

from trading_clone.market_structure.swing_detector     import Candle, detect_swings, calc_atr, detect_trend
from trading_clone.market_structure.support_resistance import detect_sr_levels
from trading_clone.market_structure.premium_discount   import calc_fib
from trading_clone.market_structure.structure_score    import analyse_structure

from trading_clone.supply_demand.demand_detector import detect_demand_zones
from trading_clone.supply_demand.supply_detector import detect_supply_zones
from trading_clone.supply_demand.zone_filter     import is_price_in_zone, approaching_zone

from trading_clone.liquidity.liquidity_score import calc_liquidity

from trading_clone.amd.amd_score import calc_amd

from trading_clone.learning_engine.weight_learner import AdaptiveWeightLearner


Signal   = Literal["BUY", "SELL", "NO TRADE"]
Grade    = Literal["A+", "A", "B", "C", "D"]
EngVote  = Literal["bullish", "bearish", "neutral"]


@dataclass
class EngineVote:
    name:      str
    vote:      EngVote
    score:     int
    detail:    str


@dataclass
class TradeSignal:
    pair:          str
    timeframe:     str
    signal:        Signal
    confidence:    int
    grade:         Grade
    engine_votes:  List[EngineVote]
    weights_used:  Dict[str, float]
    reason:        str
    current_price: float
    atr:           float


_LEARNER = AdaptiveWeightLearner()   # default weights; swap for persisted learner


def generate_signal(
    pair:      str,
    timeframe: str,
    candles:   List[Candle],
    learner:   Optional[AdaptiveWeightLearner] = None,
) -> TradeSignal:
    """Run all engines and return the final signal."""
    lrn = learner or _LEARNER
    w   = lrn.weights()

    atr     = calc_atr(candles)
    current = candles[-1].close

    # ── Engine 1: Market Structure (Confirmation) ──────────────────────────
    conf_vote, conf_score, conf_detail = _market_structure_vote(candles)

    # ── Engine 2: Supply & Demand (Zone) ──────────────────────────────────
    zone_vote, zone_score, zone_detail = _zone_vote(pair, timeframe, candles, current, atr)

    # ── Engine 3: Liquidity ────────────────────────────────────────────────
    liq_result = calc_liquidity(candles)
    liq_vote   = liq_result.bias if liq_result.bias != "neutral" else "neutral"
    liq_score  = liq_result.liquidity_score
    liq_detail = liq_result.summary

    # ── Engine 4: AMD ──────────────────────────────────────────────────────
    amd_result = calc_amd(candles)
    amd_vote: EngVote
    if amd_result.direction == "bullish":
        amd_vote = "bullish"
    elif amd_result.direction == "bearish":
        amd_vote = "bearish"
    else:
        amd_vote = "neutral"
    amd_score  = amd_result.amd_score
    amd_detail = amd_result.summary

    votes = [
        EngineVote("Zone (S&D)",    zone_vote, zone_score, zone_detail),
        EngineVote("Liquidity",     liq_vote,  liq_score,  liq_detail),
        EngineVote("AMD",           amd_vote,  amd_score,  amd_detail),
        EngineVote("Market Struct", conf_vote, conf_score, conf_detail),
    ]

    # ── Weighted confidence ────────────────────────────────────────────────
    bull_conf = (
        (zone_score  if zone_vote  == "bullish" else 0) * w["zone"]
        + (liq_score   if liq_vote   == "bullish" else 0) * w["liquidity"]
        + (amd_score   if amd_vote   == "bullish" else 0) * w["amd"]
        + (conf_score  if conf_vote  == "bullish" else 0) * w["confirmation"]
    )
    bear_conf = (
        (zone_score  if zone_vote  == "bearish" else 0) * w["zone"]
        + (liq_score   if liq_vote   == "bearish" else 0) * w["liquidity"]
        + (amd_score   if amd_vote   == "bearish" else 0) * w["amd"]
        + (conf_score  if conf_vote  == "bearish" else 0) * w["confirmation"]
    )

    # Count bullish vs bearish votes (weighted)
    bull_votes = sum(1 for v in votes if v.vote == "bullish")
    bear_votes = sum(1 for v in votes if v.vote == "bearish")

    # ── Final signal decision ──────────────────────────────────────────────
    signal: Signal
    confidence: int

    if bull_conf > bear_conf and bull_votes >= 3:
        signal     = "BUY"
        confidence = min(100, round(bull_conf))
    elif bear_conf > bull_conf and bear_votes >= 3:
        signal     = "SELL"
        confidence = min(100, round(bear_conf))
    else:
        signal     = "NO TRADE"
        confidence = min(100, round(max(bull_conf, bear_conf)))

    # Require minimum confidence for BUY/SELL
    if signal in ("BUY", "SELL") and confidence < 55:
        signal = "NO TRADE"

    grade = _grade(confidence)
    reason = _reason(signal, confidence, votes, bull_votes, bear_votes)

    return TradeSignal(
        pair=pair, timeframe=timeframe,
        signal=signal, confidence=confidence, grade=grade,
        engine_votes=votes, weights_used=w,
        reason=reason, current_price=current, atr=round(atr, 5),
    )


# ── Engine vote helpers ────────────────────────────────────────────────────────

def _market_structure_vote(candles: List[Candle]):
    swings    = detect_swings(candles)
    sr        = detect_sr_levels(candles, swings)
    fib       = calc_fib(candles)
    trend     = detect_trend(swings)

    # Score based on SR levels and swing quality
    score = min(100, len(sr) * 15 + (30 if trend != "ranging" else 0))

    # Premium / discount bias from fib
    fib_zone = fib.zone if fib else "equilibrium"
    fib_bias = "neutral"
    if fib_zone == "discount":
        fib_bias = "bullish"
    elif fib_zone == "premium":
        fib_bias = "bearish"

    vote: EngVote
    if trend == "bullish" and fib_bias in ("bullish", "neutral"):
        vote = "bullish"
    elif trend == "bearish" and fib_bias in ("bearish", "neutral"):
        vote = "bearish"
    else:
        vote = "neutral"

    detail = (
        f"Trend={trend.upper()}  FibZone={fib_zone.upper()}  "
        f"Score={score}/100  SR_levels={len(sr)}"
    )
    return vote, score, detail


def _zone_vote(pair, timeframe, candles, current, atr):
    demand = detect_demand_zones(pair, timeframe, candles)
    supply = detect_supply_zones(pair, timeframe, candles)

    # Is price in or approaching a zone?
    in_demand = any(is_price_in_zone(current, z, atr) or
                    approaching_zone(current, z, atr, "buy") for z in demand)
    in_supply = any(is_price_in_zone(current, z, atr) or
                    approaching_zone(current, z, atr, "sell") for z in supply)

    best_d = max((z.score for z in demand), default=0)
    best_s = max((z.score for z in supply), default=0)

    vote: EngVote
    if in_demand and not in_supply:
        vote  = "bullish"
        score = best_d
    elif in_supply and not in_demand:
        vote  = "bearish"
        score = best_s
    elif in_demand and in_supply:
        # Overlap — go with stronger zone
        vote  = "bullish" if best_d >= best_s else "bearish"
        score = max(best_d, best_s)
    else:
        vote  = "neutral"
        score = max(best_d, best_s) // 2   # partial credit for nearby zones

    d_cnt = len(demand)
    s_cnt = len(supply)
    detail = (
        f"DemandZones={d_cnt} (best={best_d})  "
        f"SupplyZones={s_cnt} (best={best_s})  "
        f"InZone={'demand' if in_demand else 'supply' if in_supply else 'none'}"
    )
    return vote, score, detail


# ── Formatting helpers ─────────────────────────────────────────────────────────

def _grade(confidence: int) -> Grade:
    if confidence >= 90: return "A+"
    if confidence >= 80: return "A"
    if confidence >= 70: return "B"
    if confidence >= 60: return "C"
    return "D"


def _reason(signal: Signal, confidence: int, votes: List[EngineVote],
            bull_votes: int, bear_votes: int) -> str:
    if signal == "NO TRADE":
        if bull_votes == bear_votes:
            return f"Engines split ({bull_votes}↑ vs {bear_votes}↓) — no consensus"
        weak = "bullish" if bull_votes > bear_votes else "bearish"
        return (
            f"Lean {weak} ({bull_votes if weak=='bullish' else bear_votes}/4 engines) "
            f"but confidence {confidence}/100 below threshold"
        )
    direction = "bullish" if signal == "BUY" else "bearish"
    aligned   = [v.name for v in votes if v.vote == direction]
    opposed   = [v.name for v in votes if v.vote not in (direction, "neutral")]
    parts     = [f"Aligned: {', '.join(aligned)}"]
    if opposed:
        parts.append(f"Conflicting: {', '.join(opposed)}")
    return "  |  ".join(parts)
