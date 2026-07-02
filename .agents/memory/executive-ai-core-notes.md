---
name: Executive AI Core
description: Phase 7.1 orchestrator that unifies all 7 subsystems into one Executive Decision with 6 types, veto logic, conflict resolution, and full explainability.
---

## Engine Location
`lib/market-analysis/src/executive-ai-core/` — types.ts, intelligence-aggregator.ts, weighting-engine.ts, confidence-engine.ts, conflict-resolver.ts, decision-engine.ts, explainer.ts, index.ts

## DB Tables (3)
- `eai_decisions` — full snapshot with JSON payload
- `eai_timeline` — lightweight decision history
- `eai_conflicts` — per-decision conflict log

Schema: `lib/db/src/schema/executive-ai-core.ts`

## API Routes (6) — prefix `/executive-ai/`
`/status` `/decision` `/history` `/conflicts` `/evidence` `/report`

## 7 Intelligence Inputs
1. **Strategy** (from ESB): executiveScore, rulePassRate, strategyStrength, ruleQuality
2. **Market** (from Unified): regime, volatility, liquidity, healthScore, opportunity
3. **Risk** (from ERB): overallRiskScore inverted to safety score, survivalScore, capitalHealth
4. **Memory**: historicalWinRate, patternFrequency, historicalConfidence
5. **Learning**: overallConfidence, patternPerformanceScore, predictionReliability, drift
6. **Identity**: identitySimilarityScore, preferenceAlignmentScore, historicalConsistency
7. **Research**: researchConfidence, activeProjects (advisory only, 2% weight)

## Default Weights (v1.0.0, sum = 1.0)
strategy=0.30, risk=0.25, market=0.20, memory=0.10, learning=0.08, identity=0.05, research=0.02

Risk is applied as safety score: `(100 - overallRiskScore)` — higher = safer.

## 6 Decision Types + Thresholds
| Score | Decision |
|-------|----------|
| ≥ 80  | trade |
| 65–79 | wait |
| 45–64 | observe |
| 30–44 | reduce_risk |
| 15–29 | pause_trading |
| < 15  | emergency_halt |

## Veto Logic (checked after composite)
1. ERB crisis=emergency OR survivalModeActive → score=5 (emergency_halt)
2. ERB recommendation=emergency_stop → score=5
3. ERB recommendation=survival_mode → score=18
4. ERB overallRisk > 70 → cap composite to (100-risk)+20
5. Critical conflicts AND composite>65 → dampen 25%

## Conflict Types (4 detectors)
- `risk_vs_strategy` — strategy>60, riskSafety<50, divergence>25
- `market_vs_strategy` — strategy>70, marketHealth<45, divergence>30
- `memory_vs_learning` — winRate/confidence diverge>30 AND drift < -20
- `multi_system` — 3+ systems with max deviation from average > 35

Risk Intelligence always wins over Strategy. Market always wins over Strategy.

## Key Quirks
1. `resolveAllConflicts` must be exported both by name AND aliased in index.ts — test imports it by original name `resolveAllConflicts as eaiResolveAllConflicts`.
2. `DimensionScores` type lives in `decision-engine.ts`, NOT in `types.ts` — export it from decision-engine, not types.
3. Weights are re-normalised after any override to always sum to 1.0 — divide by total after clamping.
4. The route file uses direct DB imports (`esbReportsTable`, `erbReportsTable`, `riReportsTable`) to pull latest subsystem data.

## Confidence Engine (5 dimensions)
statistical(25%) + dataQuality(20%) + historicalReliability(25%) + marketReliability(15%) + systemReliability(15%)

Confidence interval: `uncertainty = (100 - reliability) × 0.15`

## Tests
`lib/market-analysis/src/executive-ai-core/__tests__/executive-ai-core.test.ts`
56 tests, 11 suites — all pass.

## Dashboard
`/executive-command-center` — 7 tabs: Decision, Systems, Conflicts, Evidence, Timeline, Report, Status

**Why:** Phase 7 introduces the concept of unified orchestration. The Executive AI is advisory-only and has no autonomous execution capability — `isAdvisoryOnly: true` is enforced at every output layer. Risk vetoes are unconditional to prevent strategy optimism from overriding capital safety.
