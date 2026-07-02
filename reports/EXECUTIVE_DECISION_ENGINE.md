# EXECUTIVE_DECISION_ENGINE.md
## KRYTOS Phase 7 — Decision Engine Specification

### Decision Engine Logic

The Decision Engine transforms 7 dimension scores into a single Executive Decision through a 4-stage pipeline:

#### Stage 1: Dimension Score Computation

Each subsystem contributes a normalized 0–100 score:

| Dimension | Formula |
|-----------|---------|
| Strategy | executiveScore×0.40 + strategyStrength×0.30 + rulePassRate×0.20 + ruleQuality×0.10 |
| Market | healthScore×0.35 + opportunity×0.30 + stability×0.20 + (100-volatility)×0.15 |
| Risk (Safety) | (100-ERBrisk)×0.40 + survival×0.25 + capitalHealth×0.20 + brokerReliability×0.15 |
| Memory | historicalWinRate×0.35 + confidence×0.30 + positiveOutcomeRate×0.20 + frequency×0.15 |
| Learning | confidence×0.40 + patternScore×0.30 + reliability×0.20 + driftBonus×0.10 |
| Identity | similarityScore×0.35 + preferenceAlignment×0.35 + consistency×0.20 + idConfidence×0.10 |
| Research | researchConfidence×0.80 + experimentalBonus×0.20 (advisory, minimal weight) |

#### Stage 2: Weighted Composite

```
composite = strategy×0.30 + market×0.20 + risk_safety×0.25
           + memory×0.10 + learning×0.08 + identity×0.05 + research×0.02
```

Default weights sum to 1.0 and are versioned independently. Weights are re-normalised after any override to ensure they always sum to 1.0.

#### Stage 3: Veto Logic (Override Rules)

Vetoes are applied after composite calculation:

| Condition | Action |
|-----------|--------|
| ERB crisis=emergency OR survivalModeActive | Force score=5 (emergency_halt) |
| ERB recommendation=emergency_stop | Force score=5 (emergency_halt) |
| ERB recommendation=survival_mode | Force score=18 (pause_trading) |
| ERB overallRisk > 70 | Cap composite to (100-risk)+20 |
| Critical conflicts detected AND composite>65 | Dampen composite by 25% |

#### Stage 4: Score → Decision Mapping

| Score | Decision |
|-------|---------|
| ≥ 80 | trade |
| 65–79 | wait |
| 45–64 | observe |
| 30–44 | reduce_risk |
| 15–29 | pause_trading |
| < 15 | emergency_halt |

### Weighting Philosophy

Strategy (30%) is the primary driver because it incorporates the AMD/SMC rule engine directly. Risk (25%) is second highest because capital preservation is non-negotiable. Market (20%) provides the environmental context.

The remaining 35% (Memory, Learning, Identity, Research) are supporting evidence — they modulate confidence and refine the final score, but cannot override the primary safety logic.

### Version Control

Every decision records:
- `engineVersion` — EAI engine version
- `decisionVersion` — Decision schema version
- `strategyVersion` — Strategy subsystem version
- `riskVersion` — Risk subsystem version
- `weightsVersion` — Active weights version

This enables full historical replay and drift analysis.
