"""
Simulate Adaptive Weight Learning over N synthetic trades.
Shows exactly how weights shift as trade history grows.
Run: PYTHONPATH=. python3 trading_clone/learning_engine/simulate_learning.py
"""

import os
import random
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from trading_clone.learning_engine.weight_learner import (
    AdaptiveWeightLearner, LearnerRecord, _bar,
)


# ── Synthetic trade generator ──────────────────────────────────────────────────
# Simulates a dataset where high zone + high AMD = more wins.
# This should cause the learner to increase zone + AMD weight over time.

def synthetic_trade(i: int) -> LearnerRecord:
    random.seed(i)

    zone  = random.randint(60, 100)
    liq   = random.randint(40, 100)
    amd   = random.randint(55, 100)
    conf  = random.randint(50, 100)

    # Win probability: biased toward zone + amd
    win_prob = (zone * 0.40 + liq * 0.15 + amd * 0.30 + conf * 0.15) / 100
    result = "WIN" if random.random() < win_prob else "LOSS"

    return LearnerRecord(
        zone_score=zone, liquidity_score=liq,
        amd_score=amd, confirmation_score=conf,
        final_score=round(zone*0.30 + liq*0.25 + amd*0.25 + conf*0.20, 1),
        result=result,
    )


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    TOTAL_TRADES  = 1000
    BATCH_SIZES   = [0, 50, 100, 200, 300, 500, 750, 1000]

    learner  = AdaptiveWeightLearner()
    all_records: list = []

    print("\n╔══════════════════════════════════════════════════════════╗")
    print("║  AI LEARNING ARCHITECTURE — V1 Adaptive Weight Learning  ║")
    print("╚══════════════════════════════════════════════════════════╝")
    print()
    print("  Strategy: Zone=30%  Liq=25%  AMD=25%  Conf=20%  (start)")
    print("  Bias    : Zone + AMD → wins  (synthetic data)")
    print("  Expected: Zone↑  AMD↑  Liq↓  Conf↓  after enough trades")
    print()

    snapshots = []

    for total in BATCH_SIZES:
        # Add trades up to this checkpoint
        while len(all_records) < total:
            all_records.append(synthetic_trade(len(all_records)))

        snap = learner.update(all_records)
        snapshots.append((total, snap))

    # ── Weight evolution table ─────────────────────────────────────────────
    print(f"  {'Trades':>7}  {'Zone':>7}  {'Liquidity':>10}  {'AMD':>7}  {'Confirm':>8}  {'LR':>8}  Winner")
    print(f"  {'─'*7}  {'─'*7}  {'─'*10}  {'─'*7}  {'─'*8}  {'─'*8}  {'─'*10}")

    for n_trades, snap in snapshots:
        weights = [snap.zone, snap.liquidity, snap.amd, snap.confirmation]
        winner_key = ["zone", "liquidity", "amd", "confirmation"][weights.index(max(weights))]
        changed = "✓" if snap.version > 1 else "—"
        print(
            f"  {n_trades:>7}  {snap.zone*100:>6.1f}%  {snap.liquidity*100:>9.1f}%  "
            f"{snap.amd*100:>6.1f}%  {snap.confirmation*100:>7.1f}%  "
            f"{snap.learning_rate:>8.5f}  {winner_key} {changed}"
        )

    # ── Final weight visualisation ─────────────────────────────────────────
    final = learner.current
    print(f"\n  ── Final Weights after {TOTAL_TRADES} trades ──────────────────────────")
    print(f"  Zone         : {final.zone*100:>5.1f}%  {_bar(final.zone)}")
    print(f"  Liquidity    : {final.liquidity*100:>5.1f}%  {_bar(final.liquidity)}")
    print(f"  AMD          : {final.amd*100:>5.1f}%  {_bar(final.amd)}")
    print(f"  Confirmation : {final.confirmation*100:>5.1f}%  {_bar(final.confirmation)}")
    total_check = final.zone + final.liquidity + final.amd + final.confirmation
    print(f"  {'─'*48}")
    print(f"  Total        : {total_check*100:>5.1f}%  (must be 100.0%)")

    # ── Safety constraints ─────────────────────────────────────────────────
    print(f"\n  ── Safety Constraints ────────────────────────────────────")
    from trading_clone.learning_engine.weight_learner import MIN_TRADES, MIN_WEIGHT, MAX_WEIGHT
    weights_list = [final.zone, final.liquidity, final.amd, final.confirmation]
    print(f"  Min trades before learning : {MIN_TRADES}")
    print(f"  Weight floor               : {MIN_WEIGHT*100:.0f}%")
    print(f"  Weight ceiling             : {MAX_WEIGHT*100:.0f}%")
    print(f"  All weights ≥ floor        : {'✓' if all(w >= MIN_WEIGHT for w in weights_list) else '✗'}")
    print(f"  All weights ≤ ceiling      : {'✓' if all(w <= MAX_WEIGHT for w in weights_list) else '✗'}")
    print(f"  Sum = 100%                 : {'✓' if abs(total_check - 1.0) < 0.001 else '✗'}")

    # ── Show score calc with new weights ──────────────────────────────────
    print(f"\n  ── Example: same trade scored with old vs new weights ────")
    zone_s, liq_s, amd_s, conf_s = 85, 60, 90, 70
    old_score = zone_s*0.30 + liq_s*0.25 + amd_s*0.25 + conf_s*0.20
    new_score = learner.apply(zone_s, liq_s, amd_s, conf_s)
    print(f"  Input:  Zone={zone_s}  Liq={liq_s}  AMD={amd_s}  Conf={conf_s}")
    print(f"  Old score (default weights): {old_score:.2f}")
    print(f"  New score (learned weights): {new_score:.2f}")
    diff = new_score - old_score
    print(f"  Difference                 : {diff:+.2f} ({'higher — zone+AMD heavy setup rewarded' if diff > 0 else 'lower'})")

    print(f"\n  ── Weight History (all checkpoints) ──────────────────────")
    print(learner.history_table())
    print()


if __name__ == "__main__":
    main()
