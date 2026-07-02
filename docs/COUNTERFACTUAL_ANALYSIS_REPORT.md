# Counterfactual Analysis Report
## Phase 7.3 — Post-Trade What-If Methodology

---

## Purpose

After every completed trade, the Counterfactual Engine answers:

> *"What would have happened if KRYTOS had selected a different decision?"*

This analysis is the primary mechanism for **post-hoc decision quality validation** — it determines whether the actual decision produced the best available outcome given the intelligence that was available at the time.

---

## When Counterfactuals Run

Counterfactual analysis is triggered after a trade closes with a known outcome:

```
actualDecision : DecisionType   // What the system actually chose
actualOutcome  : win | loss | neutral
actualPnL      : number          // Actual P&L in R units
actualRR       : number          // Actual risk-reward achieved
simulations    : DecisionSimulation[]  // Original candidates from the judgment
```

---

## Simulation Methods per Alternative

| Alternative | Counterfactual Method | Reliability |
|-------------|-----------------------|-------------|
| `execute_trade` | Same as actual (if different from actual, uses EV formula) | 80% |
| `wait_one_candle` | Entry improvement: `actualPnL + entryImprovement` where `improvement = (prob-50)/100 × 0.3` | 65% |
| `wait_confirmation` | Optional filter: if low confidence, outcome = neutral; else `actualPnL × 0.85` | 60% |
| `reduce_position` | `actualPnL × 0.5` (direct position scaling) | 80% |
| `observation_mode` | `pnl = 0, outcome = neutral` | 95% |
| `skip_trade` | `pnl = 0, outcome = avoided_loss` | 95% |
| `emergency_pause` | `pnl = 0, outcome = avoided_loss` | 98% |

---

## Decision Quality Score

```
betterAlternatives = count(alternatives where comparedToActual > 0.1)
decisionQualityScore = (1 - betterAlternatives / total) × 85 + 15
```

| Score Range | Interpretation |
|-------------|----------------|
| 85-100 | Optimal decision — no alternative would have done meaningfully better |
| 65-85 | Good decision — few alternatives were marginally better |
| 40-65 | Acceptable — one or two alternatives would have improved outcome |
| 10-40 | Poor decision quality — multiple alternatives were clearly superior |

---

## Learning Insight

The counterfactual engine generates a plain-English learning insight for every analysis:

- If no alternative would have beaten actual by > 0.2R: **"Decision quality validated"** — confirms the judgment engine made the right call
- If a better alternative exists: **"[Alternative] would have improved outcome by [delta]R"** — seeds pattern learning for future similar conditions

---

## Storage

Every counterfactual analysis is stored in `ej_counterfactuals` with:

- `analysisId` — unique identifier (`cfa_xxxxxxxx`)
- `judgmentId` — link back to the original judgment
- `tradeId` — link to the actual trade
- `decisionQualityScore` — 0-100 quality metric
- `learningInsight` — plain-English lesson
- `fullPayload` — complete JSON with all alternatives

---

## Limitations

1. **Counterfactual outcomes are simulated, not observed.** The `wait_one_candle` and `wait_confirmation` alternatives cannot be verified with certainty.
2. **Reliability varies by candidate.** Skip/pause alternatives have near-100% reliability (the outcome is definitionally 0). Active alternatives are estimates based on the original simulation parameters.
3. **Counterfactuals do not alter the original judgment.** They inform future judgment cycles through the learning pipeline but never modify past records.
4. **isAdvisoryOnly: true** — counterfactual results are stored for learning purposes only. They do not trigger any automatic adjustments to risk settings or strategy parameters.
