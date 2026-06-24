"""
AMD Score Aggregator — Build #4
=================================
Orchestrates Accumulation → Manipulation → Distribution detection
and returns a single AMDResult with the current phase and score.

Score (max 100):
  Accumulation score  × 0.25
  Manipulation score  × 0.40
  Distribution score  × 0.35
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import List, Literal, Optional

from trading_clone.market_structure.swing_detector import Candle
from trading_clone.amd.accumulation  import AccumulationZone,   detect_accumulation
from trading_clone.amd.manipulation  import ManipulationResult, detect_manipulation
from trading_clone.amd.distribution  import DistributionResult, detect_distribution


Phase = Literal["none", "accumulation", "manipulation", "distribution"]


@dataclass
class AMDResult:
    phase:        Phase
    direction:    Optional[Literal["bullish", "bearish"]]
    accumulation: AccumulationZone
    manipulation: ManipulationResult
    distribution: DistributionResult
    amd_score:    int
    complete:     bool
    summary:      str


AMDSequence = AMDResult


def detect_amd(candles: List[Candle], _grabs=None) -> AMDResult:
    """Alias for calc_amd; accepts optional _grabs argument for API compatibility."""
    return calc_amd(candles)


def calc_amd(candles: List[Candle]) -> AMDResult:
    if len(candles) < 20:
        return _null_result()

    acc   = detect_accumulation(candles)
    manip = detect_manipulation(candles, acc)

    if not manip.found:
        sc = round(acc.score * 0.25) if acc.found else 0
        return AMDResult(
            phase="accumulation" if acc.found else "none",
            direction=None,
            accumulation=acc, manipulation=manip,
            distribution=_null_dist(),
            amd_score=sc, complete=False,
            summary=_summary("accumulation" if acc.found else "none",
                             None, acc.score, 0, 0, sc),
        )

    dist = detect_distribution(candles, manip)

    amd_score = min(100, round(
        acc.score   * 0.25
        + manip.score * 0.40
        + (dist.score if dist.found else 0) * 0.35
    ))

    phase: Phase = "distribution" if dist.found else "manipulation"
    complete     = dist.found and amd_score >= 70

    return AMDResult(
        phase=phase,
        direction=manip.direction,
        accumulation=acc, manipulation=manip, distribution=dist,
        amd_score=amd_score, complete=complete,
        summary=_summary(phase, manip.direction, acc.score,
                         manip.score, dist.score if dist.found else 0, amd_score),
    )


# ── helpers ───────────────────────────────────────────────────────────────────

def _null_dist() -> DistributionResult:
    from trading_clone.amd.distribution import DistributionResult, _NULL
    return _NULL


def _null_result() -> AMDResult:
    from trading_clone.amd.accumulation import _NULL as a_null
    from trading_clone.amd.manipulation import _NULL as m_null
    return AMDResult(
        phase="none", direction=None,
        accumulation=a_null, manipulation=m_null,
        distribution=_null_dist(),
        amd_score=0, complete=False, summary="AMD: insufficient data",
    )


def _summary(phase, direction, acc_sc, manip_sc, dist_sc, total) -> str:
    dir_str = direction.upper() if direction else "—"
    return (
        f"Phase={phase.upper():<14}  Direction={dir_str:<8}  Score={total}/100"
        f"  |  Acc={acc_sc}  Manip={manip_sc}  Dist={dist_sc}"
    )
