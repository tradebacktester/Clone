# Mission Control Report
## Phase 7.4 — Framework, Planning & Conflict Resolution Methodology

---

## Purpose

Mission Control is the operational interface for KRYTOS's goal management system. It continuously evaluates the current mission state, resolves competing objectives, generates multi-horizon plans, and tracks progress against measurable targets.

---

## Mission Cycle

Every time `runExecutiveMission()` is called, KRYTOS executes a 6-stage analysis in < 10ms:

```
1. generateAllGoals()         ~1ms    Build Level 1-4 goal set
2. prioritizeGoals()          ~0.5ms  Sort by structural + computed priority
3. detectAndResolveConflicts  ~1ms    Find conflicting pairs, resolve
4. generateAllPlans()         ~2ms    Build 4 horizon plans
5. trackGoalProgress()        ~0.5ms  Score each goal's completion
6. computeMissionHealth()     ~0.5ms  Aggregate mission health score
                              -----
                              ~5.5ms  Total (durationMs tracked)
```

---

## Plan Generation Logic

### Immediate Plan Decision Tree

```
if survivalMode || crisisStatus != "none":
  → "Emergency Pause — No New Positions"
  
else if drawdownPct >= 5%:
  → "Drawdown Recovery — Defensive Entry Only"
  
else if executiveScore >= 70 && riskScore < 65:
  → "High-Quality Execution Window Open"
  
else:
  → "Observation Mode — Await Confirmation"
```

### Short-Term Plan Logic

```
if riskScore >= 65:
  → "Defensive Session Strategy"
  → max 1 position, quality filter elevated
  
else:
  → "Quality-First Session Strategy"  
  → focus on win rate improvement or maintenance
```

### Medium-Term Plan Logic

```
if drawdownPct >= 5%:
  → "Drawdown Recovery Campaign" (5-day)
  
else:
  → "Systematic Performance Improvement"
  → target win rate / profit factor improvement
```

### Long-Term Plan

Always: **"Permanent Mission Alignment — 30-Day Horizon"**  
Always links to Level 1 goals.  
Contains: drawdown limit, profit factor target, RL agent learning cycle, backtesting, monthly certification.

---

## Conflict Resolution Methodology

The conflict resolver detects objective pairs where recommended actions are mutually exclusive.

### Detection Logic

```typescript
// A conflict exists when:
1. Both goals are active or pending
2. Their categories represent opposing postures
3. A conflict type can be identified
```

### Detection Rules

| Category A | Category B | Conflict Type |
|------------|------------|---------------|
| trade_quality OR profitability | capital_preservation OR risk_management | opportunity_vs_risk |
| exposure_control | trade_quality | exposure_vs_opportunity |
| execution_quality | market_observation | speed_vs_quality |
| Level 4 goal | Level 2 goal | short_vs_long_term |
| recovery | trade_quality OR profitability | aggressive_vs_defensive |

### Resolution Formula

```
winner = goal with lower level (structural priority)
         OR higher priority score (same level)

confidence = (winner.confidence + loser.confidence) / 2
```

### Validation

`opportunity_vs_risk` resolution is validated by test — the winner must always be the `capital_preservation`, `risk_management`, or `drawdown_control` category goal, or a Level 1 goal. This rule cannot be violated.

---

## Mission Health Computation

```
missionHealth = 
  level1Adherence     × 0.40 +
  goalAchievement     × 0.30 +
  planConsistency     × 0.20 +
  conflictResolution  × 0.10
```

### Level 1 Adherence (40% weight)

```
level1Adherence = average progress of all Level 1 goals
                = 0 if any Level 1 goal has status "violated"
```

The 40% weight reflects that Level 1 goals represent the non-negotiable foundation. A single Level 1 violation collapses health to "violated" status.

### Goal Achievement (30% weight)

```
goalAchievement = (count of active goals with progress >= 60%) / total active goals × 100
```

### Plan Consistency (20% weight)

```
planConsistency = average confidence across all active goals
```

Proxies the quality of intelligence inputs that drive plan generation.

### Conflict Resolution Quality (10% weight)

```
conflictResolution = 100                         (if no conflicts)
                   = average confidence of all resolved conflicts
```

Zero conflicts = perfect resolution quality (100). Conflicts with low-confidence resolutions reduce this score.

---

## Timeline & Replay

Every mission cycle is recorded in `ep_timeline`:

```
{ missionId, recordedAt, pair, healthScore, healthStatus, 
  confidence, activeGoals, conflictCount, immediateAction }
```

This enables:
- **Trend analysis**: health score over time
- **Regime analysis**: how mission health correlates with market conditions
- **Replay**: reconstruct any past mission state from `ep_missions.fullPayload`
- **Audit**: every priority change and goal update is timestamped

---

## Explainability

Every mission output includes:

1. **`whyThisRank`** per goal — exact formula breakdown with values
2. **`conflictSummary`** per conflict — plain-English description of the tension
3. **`resolution`** per conflict — who wins and exactly why
4. **`supportingEvidence`** per conflict — quantitative evidence
5. **`supportingEvidence`** on the mission object — 5 key facts about current state
6. **`planRationale`** per action — why this action was selected

All outputs are deterministic given the same intelligence inputs — reproduced exactly on re-run.

---

## Scalability

| Dimension | Design |
|-----------|--------|
| Goals per mission | Typically 12-16; upper bound ~20 |
| Plans per mission | Always exactly 4 |
| Conflicts per mission | Typically 2-5; bounded by goal count |
| Cycle time | ~5ms deterministic (no I/O in engine) |
| DB write overhead | ~50ms async (non-blocking) |
| History capacity | Unlimited (timeline append-only) |
| Replay | Full reconstruction from fullPayload JSON |

---

## Future AI Integration

The Mission Control architecture is designed to serve as the **operational directive layer** for future AI integrations:

1. **RL Agent Alignment**: The RL agent's reward signal can incorporate mission health as a secondary objective alongside P&L
2. **GPT/LLM Narrative**: The structured goal objects and conflict resolutions are prompt-friendly for natural language reports
3. **Adaptive Thresholds**: Goal targets (e.g., drawdown limit) can be made adaptive based on market regime
4. **Multi-Objective Optimisation**: The 4-dimensional priority vector (importance, urgency, impact, risk) can be fed directly to MOOT algorithms
5. **External Stakeholder Reporting**: The mission state can be serialised to reports for human oversight
