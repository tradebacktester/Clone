# Phase 7.2 — Autonomous Executive Reasoning: Engine Design

## Overview

The Autonomous Executive Reasoning Engine (AERE) wraps the Phase 7.1 Executive AI Core with a structured deliberation pipeline. Instead of a direct score-to-decision mapping, every decision now passes through a 5-stage reasoning process that collects evidence, consults independent advisors, detects conflicts, deliberates over alternatives, and validates via safety gates before committing to a recommendation.

All decisions remain strictly advisory — the engine never executes a trade.

---

## Stage 1: Evidence Collection

**File:** `evidence-collector.ts`

Collects 8 evidence items from all active sub-systems:

| Evidence Item | Source | Quality Basis |
|--------------|--------|---------------|
| Strategy Intelligence | Executive Strategy Brain | Executive score |
| Risk Intelligence | Executive Risk Brain | Always "strong" |
| Market Intelligence | Risk Intelligence (market component) | Inverse of market risk score |
| Memory Intelligence | Memory System | Synthetic (win rate, sample count) |
| Learning Intelligence | Learning Engine | Synthetic (confidence, validation) |
| Identity Intelligence | Trader Identity Engine | Synthetic (similarity, alignment) |
| Broker Status | Broker Monitor | Broker reliability score |
| Infrastructure Status | Infrastructure Monitor | Infra health score |

Each item is tagged with `quality` (strong/moderate/weak/missing) and `freshness` (fresh/stale/unknown). The collection returns an `overallQuality` score (0–100) based on the fraction of valid items.

---

## Stage 2: Independent Advisor Assessments

**File:** `advisor-engine.ts`

Six independent advisors each produce a `recommendation` (one of: trade / wait / observe / reduce_risk / pause_trading / emergency_halt) with `confidence` and `reliability` scores.

| Advisor | Primary Signal | Reliability |
|---------|---------------|-------------|
| Strategy Intelligence Advisor | ESB executive score + rule pass rate + strategy strength | Variable (scales with rule pass rate) |
| Market Intelligence Advisor | ERB market health + volatility | Fixed 75 |
| Risk Intelligence Advisor | ERB overall risk + crisis status + survival mode | Fixed 95 (highest) |
| Memory Intelligence Advisor | Historical win rate + similar trade count | Variable (scales with sample count) |
| Learning Intelligence Advisor | Learning confidence + prediction reliability + drift | Variable (scales with reliability) |
| Trader Identity Advisor | Identity similarity + preference alignment | Fixed 65 |

Advisors run independently — they do not see each other's outputs before producing their recommendation.

---

## Stage 3: Conflict Detection

**File:** `conflict-detector.ts`

Detects four types of inter-advisor conflicts:

| Conflict Type | Trigger | Severity |
|--------------|---------|---------|
| `opposing_recommendations` | Rank difference ≥ 2 between any two advisors | low/moderate/high/critical |
| `low_confidence_disagreement` | Low-confidence advisor (< 45%) disagrees with high-confidence advisor (≥ 70%) | moderate |
| `missing_evidence` | Advisor has missing data quality AND recommends ≥ 2 ranks above "observe" | moderate |
| `risk_policy_violation` | Non-risk advisor recommends trade/wait while risk advisor mandates restrict/halt | high/critical |

Conflicts are deduplicated by advisor pair (highest severity wins). The conflict matrix reports:
- `agreementScore` — percentage of advisor pairs that agree
- `overallConflictLevel` — worst severity across all detected conflicts
- `dominantPattern` — most frequent conflict type

---

## Stage 4: Executive Deliberation

**File:** `deliberation-engine.ts`

Evaluates all 6 possible actions using a utility formula:

```
utility = benefit × (confidence/100) × (historicalReliability/100)
        - risk × 1.5
        + advisorSupport × 0.20
        + survivalImpact × 0.10
        - conflictPenalty
```

Where:
- `conflictPenalty = criticalConflicts × 8 + highConflicts × 4`
- Policy-non-compliant actions receive `utility = -999` and are excluded from selection

The highest-utility viable action is selected. All others are recorded as `rejectedAlternatives` with their utility scores and rejection reasons — providing full counterfactual explainability.

---

## Stage 5: Safety Gate Validation

**File:** `safety-gates.ts`

7 gates checked in sequence. Gates have two severity tiers:
- **Critical** — failure prohibits trading (final action overridden to "observe" if deliberation selected "trade")
- **Warning** — failure noted, trading permitted with reduced confidence

| Gate | Threshold | Severity |
|------|-----------|---------|
| Deterministic Strategy | Rule pass rate ≥ 70% | Critical |
| Risk Limits | ERB risk ≤ 65 | Critical |
| Capital Protection | Capital health ≥ 40% | Critical |
| Emergency Mode | No emergency / survival mode | Critical |
| Data Integrity | Evidence quality ≥ 50% | Warning |
| Broker Reliability | Broker score ≥ 60% | Warning |
| Executive Confidence | Executive confidence ≥ 55% | Warning |

---

## Reasoning Trace

**File:** `reasoning-trace.ts`

The trace captures every stage with:
- `stageNumber`, `stageName`, `completedAt`, `durationMs`, `success`, `summary`
- `stage1_evidence`, `stage2_advisors`, `stage3_conflicts`, `stage4_deliberation`, `safetyGates`
- `primaryEvidence` — top strong-quality evidence items
- `secondaryEvidence` — moderate-quality items + conflict/gate summaries
- `riskSummary` — gate failure narrative
- `historicalComparison` — utility score and reliability narrative
- `justification` — full pipeline narrative

Traces are flagged `isReplayable: true` and persisted to `er_traces` for later retrieval.

---

## Determinism Properties

- Evidence collection uses the current timestamp as input; the same sub-system state always produces the same evidence quality scores
- Advisor computations are pure functions of their inputs — no random sampling
- Conflict detection is deterministic (no random tie-breaking)
- Deliberation is deterministic — utility ties broken by action enum order
- Safety gates are pure threshold checks

The only non-deterministic element is `randomUUID()` used in IDs (conflict IDs, collection IDs, deliberation IDs) which does not affect the decision outcome.
