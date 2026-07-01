# Survival Mode Report

## Overview

Survival Mode describes the highest protection levels (Emergency Mode and Trading Halt) that activate when KRYTOS faces existential threats to trading capital.

## Trigger Conditions

### Emergency Mode (Level 5)
Activates when any of the following occur:
- 2+ monitors simultaneously in critical state
- Account monthly loss reaches configured limit
- Margin level ≤ emergency threshold (default 150%)
- ≥10 consecutive losses (emergency threshold)

### Trading Halt (Level 6)
Activates when any critical infrastructure fails:
- Database availability < 95% of minimum
- API availability < 95% of minimum
- Data feed health < 50%
- Balance drawdown ≥ emergency threshold (default 15%)
- Margin level ≤ emergency threshold

## Survival Mode Behavior

When in Survival Mode:
1. **All new entries blocked** — no new trades can be opened
2. **Emergency alerts generated** — operators are notified immediately
3. **All open positions monitored** — existing trades are not forcibly closed (advisory only)
4. **Recovery tracking begins** — the system monitors conditions for improvement
5. **Grace period starts** — minimum 4h (configurable) before any de-escalation

## Recovery from Survival Mode

Trading Halt recovery requires:
1. System health ≥ 90% (all infrastructure restored)
2. Drawdown below emergency threshold
3. Account health ≥ 70
4. No monitors in emergency state
5. Grace period elapsed (4h × 7 = 28h minimum for Trading Halt)
6. Stepwise restoration: 5 steps back to Normal

Emergency Mode recovery requires:
1. No monitor in emergency state
2. Account health ≥ 60
3. Drawdown below critical threshold
4. Grace period elapsed

## Design Principles

**Advisory only**: The Survival Mode engine never forcibly closes positions. It blocks new entries and notifies operators. Existing position management remains with the operator.

**Irreversibility threshold**: Trading Halt requires the longest recovery path by design. The system must demonstrate sustained improvement, not just momentary improvement.

**Explainability**: Every survival mode activation includes a full trace: which monitor triggered it, which threshold was crossed, what the evidence was, and exactly what conditions are needed to recover.

## Historical Context

The survival mode framework is designed for real-world scenarios:
- Flash crash market conditions
- Infrastructure failures
- Systematic strategy failure detection
- Extreme broker/liquidity events

All Survival Mode activations are logged to `cp_events` with full context for post-incident analysis.
