"""
Adaptive Weight Learner — V1
==============================
Adjusts the four scoring weights (zone, liquidity, amd, confirmation)
based on historical trade outcomes.  No RL.  No black box.

Algorithm
---------
For each component:
  contribution = avg_score_in_wins - avg_score_in_losses

Weights are nudged toward components that correlate with wins,
then re-normalised so they always sum to 1.0.

Safety rules:
  • Requires MIN_TRADES closed trades before any adjustment.
  • Each weight is capped between MIN_WEIGHT and MAX_WEIGHT.
  • Learning rate decays as sample size grows (confidence).
  • Changes are logged and persisted so every update is auditable.
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from typing import List, Optional

logger = logging.getLogger(__name__)

MIN_TRADES   = 50          # must have this many closed trades before learning
MIN_WEIGHT   = 0.10        # no component ever drops below 10%
MAX_WEIGHT   = 0.55        # no component ever exceeds 55%
BASE_LR      = 0.05        # max learning rate (decays with more data)
DECAY_FACTOR = 500         # trades at which LR halves


# ── Weight snapshot ────────────────────────────────────────────────────────────

@dataclass
class WeightSnapshot:
    version:       int
    trade_count:   int
    zone:          float
    liquidity:     float
    amd:           float
    confirmation:  float
    learning_rate: float
    timestamp:     str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    notes: str = ""

    def to_dict(self) -> dict:
        return asdict(self)

    @staticmethod
    def from_dict(d: dict) -> "WeightSnapshot":
        return WeightSnapshot(**d)

    def as_pct(self) -> str:
        return (
            f"Zone={self.zone*100:.1f}%  "
            f"Liq={self.liquidity*100:.1f}%  "
            f"AMD={self.amd*100:.1f}%  "
            f"Conf={self.confirmation*100:.1f}%"
        )


# ── Trade record expected by the learner ──────────────────────────────────────

@dataclass
class LearnerRecord:
    zone_score:          int
    liquidity_score:     int
    amd_score:           int
    confirmation_score:  int
    final_score:         float
    result:              str   # "WIN" | "LOSS" | "BREAKEVEN"


# ── Core learner ──────────────────────────────────────────────────────────────

class AdaptiveWeightLearner:
    """
    Maintains a live WeightSnapshot and updates it whenever
    ``update(records)`` is called with the latest closed trades.
    """

    # Default starting weights (sum = 1.0)
    _DEFAULTS = dict(zone=0.30, liquidity=0.25, amd=0.25, confirmation=0.20)

    def __init__(self, snapshot: Optional[WeightSnapshot] = None):
        if snapshot:
            self.current = snapshot
        else:
            self.current = WeightSnapshot(
                version=1, trade_count=0,
                **self._DEFAULTS,
                learning_rate=BASE_LR,
                notes="Initial default weights",
            )
        self.history: List[WeightSnapshot] = [self.current]

    # ── Public API ────────────────────────────────────────────────────────────

    def update(self, records: List[LearnerRecord]) -> WeightSnapshot:
        """
        Recalculate weights from ``records`` (all closed trades).
        Returns the new WeightSnapshot (or the current one if unchanged).
        """
        closed = [r for r in records if r.result in ("WIN", "LOSS")]
        n = len(closed)

        if n < MIN_TRADES:
            logger.info(
                "AdaptiveWeights: %d closed trades — need %d before learning",
                n, MIN_TRADES,
            )
            self.current.trade_count = n
            return self.current

        wins   = [r for r in closed if r.result == "WIN"]
        losses = [r for r in closed if r.result == "LOSS"]

        if not wins or not losses:
            logger.info("AdaptiveWeights: all wins or all losses — skipping update")
            return self.current

        # ── Contribution of each factor ────────────────────────────────────
        def avg(recs: List[LearnerRecord], attr: str) -> float:
            return sum(getattr(r, attr) for r in recs) / len(recs)

        deltas = {
            "zone":         avg(wins, "zone_score")         - avg(losses, "zone_score"),
            "liquidity":    avg(wins, "liquidity_score")    - avg(losses, "liquidity_score"),
            "amd":          avg(wins, "amd_score")          - avg(losses, "amd_score"),
            "confirmation": avg(wins, "confirmation_score") - avg(losses, "confirmation_score"),
        }

        # ── Adaptive learning rate (decays as sample grows) ────────────────
        lr = BASE_LR / (1 + math.log1p(n / DECAY_FACTOR))

        # ── Nudge weights toward high-delta factors ────────────────────────
        old = dict(
            zone=self.current.zone, liquidity=self.current.liquidity,
            amd=self.current.amd,   confirmation=self.current.confirmation,
        )
        raw = {}
        for key in old:
            # Normalise delta to [-1, 1] by dividing by max possible range (100)
            normalised_delta = deltas[key] / 100.0
            raw[key] = old[key] + lr * normalised_delta

        # ── Clamp to [MIN_WEIGHT, MAX_WEIGHT] ─────────────────────────────
        clamped = {k: max(MIN_WEIGHT, min(MAX_WEIGHT, v)) for k, v in raw.items()}

        # ── Re-normalise so weights sum exactly to 1.0 ────────────────────
        total = sum(clamped.values())
        new_w = {k: round(v / total, 4) for k, v in clamped.items()}

        # floating-point residual fix
        residual = round(1.0 - sum(new_w.values()), 4)
        new_w["zone"] = round(new_w["zone"] + residual, 4)

        new_snap = WeightSnapshot(
            version=       self.current.version + 1,
            trade_count=   n,
            zone=          new_w["zone"],
            liquidity=     new_w["liquidity"],
            amd=           new_w["amd"],
            confirmation=  new_w["confirmation"],
            learning_rate= round(lr, 5),
            notes=         self._change_note(old, new_w, deltas, n),
        )

        self.current = new_snap
        self.history.append(new_snap)

        logger.info(
            "AdaptiveWeights updated (v%d, n=%d, lr=%.4f): %s",
            new_snap.version, n, lr, new_snap.as_pct(),
        )
        return new_snap

    def weights(self) -> dict:
        return dict(
            zone=         self.current.zone,
            liquidity=    self.current.liquidity,
            amd=          self.current.amd,
            confirmation= self.current.confirmation,
        )

    def apply(
        self,
        zone_score:         float,
        liquidity_score:    float,
        amd_score:          float,
        confirmation_score: float,
    ) -> float:
        """Return the weighted final score using current weights."""
        w = self.weights()
        return round(
            zone_score         * w["zone"]
            + liquidity_score  * w["liquidity"]
            + amd_score        * w["amd"]
            + confirmation_score * w["confirmation"],
            2,
        )

    # ── Internal helpers ──────────────────────────────────────────────────────

    @staticmethod
    def _change_note(old: dict, new: dict, deltas: dict, n: int) -> str:
        parts = []
        for k in old:
            diff = round((new[k] - old[k]) * 100, 1)
            sign = "+" if diff >= 0 else ""
            parts.append(f"{k}:{sign}{diff}%")
        delta_str = "  ".join(f"{k}Δ={deltas[k]:+.1f}" for k in deltas)
        return f"n={n}  {delta_str}  |  changes: {', '.join(parts)}"

    def summary(self) -> str:
        snap = self.current
        lines = [
            f"  Version       : v{snap.version}",
            f"  Trades seen   : {snap.trade_count}",
            f"  Learning rate : {snap.learning_rate}",
            f"  Timestamp     : {snap.timestamp[:19]}",
            f"",
            f"  ── Current Weights ───────────────────────────",
            f"  Zone          : {snap.zone*100:>5.1f}%  {_bar(snap.zone)}",
            f"  Liquidity     : {snap.liquidity*100:>5.1f}%  {_bar(snap.liquidity)}",
            f"  AMD           : {snap.amd*100:>5.1f}%  {_bar(snap.amd)}",
            f"  Confirmation  : {snap.confirmation*100:>5.1f}%  {_bar(snap.confirmation)}",
            f"  {'─'*44}",
            f"  Total         :  {(snap.zone+snap.liquidity+snap.amd+snap.confirmation)*100:.1f}%",
        ]
        return "\n".join(lines)

    def history_table(self) -> str:
        header = f"  {'v':>4}  {'n':>6}  {'zone':>7}  {'liq':>7}  {'amd':>7}  {'conf':>7}  {'lr':>8}  notes"
        sep = "  " + "─" * 90
        rows = [header, sep]
        for s in self.history:
            rows.append(
                f"  {s.version:>4}  {s.trade_count:>6}  "
                f"{s.zone*100:>6.1f}%  {s.liquidity*100:>6.1f}%  "
                f"{s.amd*100:>6.1f}%  {s.confirmation*100:>6.1f}%  "
                f"{s.learning_rate:>8.5f}  {s.notes[:60]}"
            )
        return "\n".join(rows)


def _bar(weight: float, width: int = 20) -> str:
    filled = round(weight * width)
    return "[" + "█" * filled + "░" * (width - filled) + "]"
