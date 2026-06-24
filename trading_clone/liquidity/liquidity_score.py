"""
Liquidity Score Aggregator — Build #3
=======================================
Combines sweep + stop-hunt data into a single LiquidityResult.

Score formula (max 100):
  best_sweep_score   * 0.55
  best_hunt_score    * 0.30
  recency_bonus              (0–15 pts if within last 10 candles)
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import List, Literal, Optional

from trading_clone.market_structure.swing_detector import Candle
from trading_clone.liquidity.sweep_detector import LiquiditySweep, detect_sweeps, most_recent_sweep
from trading_clone.liquidity.stop_hunt      import StopHunt,       detect_stop_hunts, most_recent_hunt


@dataclass
class LiquidityResult:
    sweeps:          List[LiquiditySweep]
    hunts:           List[StopHunt]
    top_sweep:       Optional[LiquiditySweep]
    top_hunt:        Optional[StopHunt]
    bias:            Literal["bullish", "bearish", "neutral"]
    liquidity_score: int
    summary:         str


def calc_liquidity(candles: List[Candle]) -> LiquidityResult:
    sweeps = detect_sweeps(candles)
    hunts  = detect_stop_hunts(candles)

    top_sweep = most_recent_sweep(sweeps)
    top_hunt  = most_recent_hunt(hunts)

    n = len(candles)

    # ── Weighted score ─────────────────────────────────────────────────────
    sweep_sc = top_sweep.score if top_sweep else 0
    hunt_sc  = top_hunt.score  if top_hunt  else 0

    # Recency bonus: was the top signal within last 10 candles?
    recency = 0
    if top_sweep and (n - top_sweep.sweep_index) <= 10:
        recency = 15
    elif top_hunt and (n - top_hunt.hunt_index) <= 10:
        recency = 10

    score = min(100, round(sweep_sc * 0.55 + hunt_sc * 0.30 + recency))

    # ── Directional bias ───────────────────────────────────────────────────
    bullish_signals, bearish_signals = 0, 0
    for s in sweeps[:3]:
        if s.sweep_type == "SSL_SWEEP":   # sold below lows → expect bullish reversal
            bullish_signals += s.score
        else:
            bearish_signals += s.score
    for h in hunts[:3]:
        if h.hunt_type == "HUNT_LOW":
            bullish_signals += h.score
        else:
            bearish_signals += h.score

    if bullish_signals > bearish_signals * 1.3:
        bias: Literal["bullish", "bearish", "neutral"] = "bullish"
    elif bearish_signals > bullish_signals * 1.3:
        bias = "bearish"
    else:
        bias = "neutral"

    summary = _summarise(sweeps, hunts, bias, score)
    return LiquidityResult(sweeps=sweeps, hunts=hunts, top_sweep=top_sweep,
                           top_hunt=top_hunt, bias=bias,
                           liquidity_score=score, summary=summary)


def _summarise(sweeps, hunts, bias, score) -> str:
    parts = []
    if sweeps:
        bsl = sum(1 for s in sweeps if s.sweep_type == "BSL_SWEEP")
        ssl = sum(1 for s in sweeps if s.sweep_type == "SSL_SWEEP")
        parts.append(f"{len(sweeps)} sweeps (BSL:{bsl} SSL:{ssl})")
    if hunts:
        hi = sum(1 for h in hunts if h.hunt_type == "HUNT_HIGH")
        lo = sum(1 for h in hunts if h.hunt_type == "HUNT_LOW")
        parts.append(f"{len(hunts)} stop-hunts (high:{hi} low:{lo})")
    if not parts:
        parts = ["no qualifying liquidity events"]
    return f"Bias={bias.upper()}  Score={score}/100  |  " + "  ".join(parts)
