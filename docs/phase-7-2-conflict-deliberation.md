# Phase 7.2 — Conflict Detection & Deliberation Reference

## Conflict Detection (Stage 3)

### Decision Rank System

All 6 possible actions are mapped to an integer rank for conflict severity calculation:

| Action | Rank |
|--------|------|
| trade | 5 |
| wait | 4 |
| observe | 3 |
| reduce_risk | 2 |
| pause_trading | 1 |
| emergency_halt | 0 |

A rank difference ≥ 2 is considered a meaningful conflict. A difference of 1 (e.g., "wait" vs "observe") is treated as minor divergence and not flagged.

### Conflict Severity Mapping

| Rank Difference | Severity |
|-----------------|---------|
| 0 | none |
| 1 | low (below threshold — not flagged) |
| 2 | moderate |
| 3 | high |
| ≥ 4 | critical |

### Four Detection Algorithms

**1. Opposing Recommendations** — scans all advisor pairs (15 pairs from 6 advisors). Any pair with rank difference ≥ 2 creates a conflict entry. This is the primary structural conflict type.

**2. Low-Confidence Disagreement** — if an advisor with confidence < 45% disagrees with an advisor of confidence ≥ 70%, a "moderate" conflict is flagged. This catches cases where uncertain advisors are pulling in a different direction from confident ones.

**3. Missing Evidence** — if an advisor has `dataQuality === "missing"` AND recommends ≥ 2 ranks above "observe" (i.e., "trade" or "wait"), a conflict is flagged. Minor divergences (missing data but conservative recommendation) are not flagged to avoid spurious conflicts on aligned scenarios.

**4. Risk-Policy Violations** — if the Risk Advisor recommends a restrictive action (reduce_risk / pause_trading / emergency_halt) but another advisor recommends "trade" or "wait" with rank difference ≥ 2, a "high" or "critical" risk-policy violation is flagged.

### Deduplication

All detected conflicts are deduplicated by advisor pair (sorted names as key). When the same pair has multiple conflict entries from different detection algorithms, only the highest-severity entry is kept.

### Agreement Score

```
agreementScore = (agreeing_pairs / total_pairs) × 100
```
where `agreeing_pairs = total_pairs - opposing_recommendation_count`

A score of 100% means all 6 advisors recommend the same action. A score of 0% means every pair disagrees.

---

## Executive Deliberation (Stage 4)

### Candidate Actions

All 6 possible actions are always evaluated as candidates. Each candidate has:

| Field | Description |
|-------|-------------|
| `expectedBenefit` | Intrinsic benefit of the action (trade=90, wait=55, ...) |
| `expectedRisk` | Intrinsic execution risk (trade=60, wait=20, ...) |
| `survivalImpact` | Capital preservation score (emergency_halt=60, trade=30, ...) |
| `advisorSupport` | % of advisors recommending this action |
| `confidence` | Mean confidence of supporting advisors (or composite-derived) |
| `historicalReliability` | Static reliability estimate per action given current composite score |
| `policyCompliance` | False if survival mode + trade, or emergency + trade/wait, or ERB mandates halt |
| `utilityScore` | Computed utility (see formula below) |

### Utility Formula

```
utility = benefit × (confidence/100) × (historicalReliability/100)
        - risk × 1.5
        + advisorSupport × 0.20
        + survivalImpact × 0.10
        - conflictPenalty
```

Where:
```
conflictPenalty = criticalConflicts × 8 + highConflicts × 4
```

Policy-non-compliant candidates receive `utility = -999` and are excluded from selection.

### Selection Logic

1. Filter candidates to those with `isViable = true` (policy-compliant)
2. Sort by `utilityScore` descending
3. Select top candidate as `selectedAction`
4. All others recorded as `rejectedAlternatives` with utility scores and rejection reasons
5. If no viable candidates exist (extreme edge case), fall back to `emergency_halt`

### Rejected Alternatives

Every rejected action is recorded with:
- `action`, `actionLabel`
- `utilityScore` (to 1 decimal place)
- `rejectionReason` — either the policy violation reason or "Lower utility (X vs Y)"
- `confidence`

This provides full counterfactual transparency — the dashboard can show why each alternative was rejected.

### Intrinsic Parameters

```typescript
INTRINSIC_BENEFIT:  { trade: 90, wait: 55, observe: 40, reduce_risk: 30, pause_trading: 20, emergency_halt: 10 }
INTRINSIC_RISK:     { trade: 60, wait: 20, observe: 10, reduce_risk: 15, pause_trading: 5,  emergency_halt: 5  }
SURVIVAL_IMPACT:    { trade: 30, wait: 10, observe: 5,  reduce_risk: 20, pause_trading: 40, emergency_halt: 60 }
```

These reflect the asymmetric nature of trading: executing a trade has the highest benefit but also the highest risk, while emergency halt has the lowest benefit but the highest survival impact.
