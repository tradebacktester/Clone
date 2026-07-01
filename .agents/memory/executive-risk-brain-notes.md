---
name: Executive Risk Brain
description: Phase 6 capstone that unifies all Risk Intelligence subsystems (RI, CP, ARI, Crisis) into one ERO with 7 scores, 7-level recommendation, explainability, and 13-point certification.
---

## Engine Location
`lib/market-analysis/src/executive-risk-brain/` — scorer.ts, recommender.ts, explainer.ts, certification.ts, types.ts, index.ts

## DB Tables
- `erb_reports` — full ERIO snapshots
- `erb_decisions` — lightweight decision timeline
- `erb_certification` — 13-point audit results

Schema: `lib/db/src/schema/executive-risk-brain.ts`

## API Routes (6) — prefix `/executive-risk/`
`/status` `/object` `/history` `/recommendation` `/readiness` `/report`

## 7 Executive Risk Scores
- `overallRiskScore` — 0-100, higher = worse (composite)
- `survivalScore` — 0-100, higher = better
- `capitalHealthScore` — 0-100, higher = better
- `infrastructureScore` — 0-100, higher = better
- `brokerReliabilityScore` — 0-100, higher = better
- `portfolioStabilityScore` — 0-100, higher = better
- `recoveryConfidenceScore` — 0-100, higher = better

## 8 Scoring Weights (sum = 1.0)
accountHealth=0.25, positionRisk=0.15, portfolioStability=0.15, marketRisk=0.15, brokerReliability=0.10, systemHealth=0.08, crisisScore=0.07, adaptiveRisk=0.05

## 7-Level Recommendations
trade_normally(0) → reduced_risk(20) → restrict_exposure(40) → observation_mode(55) → defensive_mode(65) → survival_mode(75) → emergency_stop(85)

## Key Quirks
1. `clamp(Infinity)` must return `hi` (100), not 0 — fixed: `if (!isFinite(v)) return v === Infinity ? hi : lo`
2. Crisis at 7% weight: extreme crisis + low account health → `restrict_exposure` (~46 risk), not `observation_mode`. Test must include restrict_exposure in elevated recs.
3. Dashboard: Risk Command Center now has 10 tabs with "Executive Brain" as the default first tab. Header shows ERB status banner above tabs (from `/executive-risk/status`).
4. `buildRecommendationDetail`, `buildHistoricalComparison`, scorer sub-functions and explainer sub-functions all must be explicitly re-exported from `index.ts` — the test imports them directly.
5. The `runErbCertification` function accepts `{ reports, decisions }` and runs 13-point audit against historical data and live counts.

## Test File
`lib/market-analysis/src/executive-risk-brain/__tests__/executive-risk-brain.test.ts`
72 tests, 25 suites — all pass.

**Why:** Phase 6 capstone must unify all 4 risk subsystems without any single subsystem dominating (crisis 7%, adaptive 5% keeps them advisory). Advisory isolation is hard-enforced (`isAdvisoryOnly=true` in every output).
