# Executive Judgment & Decision Simulation Engine
## Phase 7.3 — Architecture & Design Reference

**Version:** 1.0.0  
**Status:** Production-Ready (Advisory Only)  
**Tests:** 51/51 passing  

---

## Overview

The Executive Judgment Engine is the decision-simulation layer of KRYTOS V2. Before any trade action is taken, the engine generates **7 candidate decisions**, evaluates each independently across **8 simulation metrics**, ranks them by a **weighted composite score**, and produces a fully explainable judgment with confidence intervals and historical evidence.

The engine is **advisory only** — it never places trades, modifies risk settings, or overrides other system components.

---

## Architecture

```
RunJudgmentInput
      │
      ▼
┌─────────────────────────────────────────────────────────────────┐
│                     runExecutiveJudgment()                      │
│                                                                 │
│  Stage 1: simulateAllDecisions()     → 7 DecisionSimulation     │
│  Stage 2: analyzeOpportunityCost()   → OpportunityCostAnalysis  │
│  Stage 3: rankDecisions()            → DecisionRanking[7]       │
│  Stage 4: buildJudgmentExplainability() → JudgmentExplainability│
│  Stage 5: buildCounterfactualAnalysis() (post-trade)            │
│                                                                 │
│  Output: ExecutiveJudgment (isAdvisoryOnly: true)               │
└─────────────────────────────────────────────────────────────────┘
```

---

## Stage 1: Decision Candidates (7)

| Decision Type       | Label                    | Trade Action |
|---------------------|--------------------------|:------------:|
| `execute_trade`     | Execute Trade            | ✅ |
| `wait_one_candle`   | Wait One Candle          | ❌ |
| `wait_confirmation` | Wait for Confirmation    | ❌ |
| `reduce_position`   | Reduce Position Size     | ✅ |
| `observation_mode`  | Observation Mode         | ❌ |
| `skip_trade`        | Skip Trade               | ❌ |
| `emergency_pause`   | Emergency Pause          | ❌ |

### Per-Candidate Metrics (8)

1. **Expected Probability** (0-100) — probability of a successful outcome for this action
2. **Expected Risk** (0-100) — risk exposure score
3. **Historical Win Rate** (0-100) — historical win rate for this action type in similar conditions
4. **Historical Drawdown** (0-100) — expected maximum drawdown percentage
5. **Expected RR** — expected risk-reward ratio
6. **Confidence** (0-100) — confidence in this simulation's accuracy
7. **Sample Size** — number of similar historical cases supporting this evaluation
8. **Similar Cases** — narrative descriptions of historically similar situations

---

## Stage 2: Opportunity Cost Analysis

For every judgment cycle, the engine computes the opportunity cost of the two most consequential alternatives:

**If Trade:**
- Expected benefit = `expectedRR × expectedProbability`
- Potential downside = `expectedRisk`
- Net EV = `p × RR - (1-p) × 1.0`

**If Skip:**
- Benefit = `riskAvoidedBySkipping` (capital preservation)
- Downside = `opportunityMissedBySkipping` (missed upside)
- Net EV ≈ small positive (capital preservation)

**Opportunity Cost Score** = `(tradeEV - skipEV) × 25 + (executiveScore - 50) × 0.5`  
Range: -100 (skip strongly preferred) to +100 (trade strongly preferred)

**Recommendations:** `trade` | `skip` | `wait` | `reduce`

---

## Stage 3: Decision Ranking

### Composite Score Formula

```
overallScore = 
  normalise(expectedValue) × 0.30 +    // Expected value (30%)
  confidence             × 0.20 +       // Simulation confidence (20%)
  historicalEvidence     × 0.20 +       // Evidence strength (20%)
  (100 - riskScore)      × 0.15 +       // Safety (15%)
  statisticalReliability × 0.15         // Reliability (15%)
```

**EV Normalisation:** `((EV + 1) / 5) × 100` maps [-1R, +4R] to [0, 100]  
**Statistical Reliability:** `30 + (1 - e^{-n/15}) × 65` — reaches ~80 at n=20

---

## Stage 4: Judgment Engine

Produces the final judgment including:

- **Best, Second, Third Decisions** (ranked 1-3)
- **Final Decision** — normally = best-ranked (with emergency override)
- **Explainability** — why best ranked highest, why alternatives rejected, most influential evidence
- **Confidence Interval** — Wilson lower/upper bounds using historical win rate + sample size
- **Key Risks** — actionable risk flags for the final decision

### Emergency Override Rule

If `crisisStatus === "emergency"` OR `survivalModeActive === true` AND the ranking engine selects `execute_trade` as rank #1, the final decision is overridden to `emergency_pause`. This is a hard-coded safety constraint that cannot be bypassed.

---

## Stage 5: Counterfactual Analysis (Post-Trade)

After a trade completes, the counterfactual engine simulates what would have occurred with each alternative decision:

| Alternative          | Simulation Method |
|----------------------|-------------------|
| `wait_one_candle`   | Entry improvement via probability delta |
| `wait_confirmation` | Optional filter (may have missed the setup) |
| `reduce_position`   | `actualPnL × 0.5` (scaling) |
| `observation_mode`  | `pnl = 0` (neutral) |
| `skip_trade`        | `pnl = 0, outcome = avoided_loss` |
| `emergency_pause`   | `pnl = 0, outcome = avoided_loss` |

**Decision Quality Score:** Percentage of alternatives that would have produced worse outcomes (0-100).

---

## Database Schema

| Table | Purpose |
|-------|---------|
| `ej_judgments`      | One row per judgment cycle — final decision, scores, OC |
| `ej_simulations`    | One row per candidate per judgment (7 rows/cycle) |
| `ej_counterfactuals`| Post-trade what-if analysis |
| `ej_timeline`       | Lightweight time-series for trend charts |

---

## API Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/executive/judgment`         | Run full judgment cycle + persist |
| GET | `/api/executive/simulations`      | Recent simulation data + summary |
| GET | `/api/executive/rankings`         | Latest rankings + historical rank distribution |
| GET | `/api/executive/opportunity-cost` | Latest OC analysis + trend |
| GET | `/api/executive/counterfactual`   | List or generate counterfactuals |
| GET | `/api/executive/report`           | Aggregated metrics + decision distribution |

---

## Safety Rules

The Executive Judgment Engine:

✅ **MAY:**
- Simulate 7 candidate decision paths
- Rank alternatives by composite score
- Recommend the strongest option
- Learn from counterfactual analysis
- Feed insights back into the learning system

❌ **MUST NEVER:**
- Predict future prices as certainty
- Rewrite the deterministic strategy
- Ignore Executive Risk decisions
- Deploy experimental research
- Bypass safety or approval workflows

`isAdvisoryOnly: true` is hardcoded in the engine, all route handlers, and all DB inserts.
