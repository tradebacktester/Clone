# Goal Management Report
## Phase 7.4 — Goal Creation, Scoring & Lifecycle Methodology

---

## Purpose

Every goal in KRYTOS is **measurable** — it has a metric, a target, a current value, and a direction of improvement. Goals are created dynamically from the current intelligence snapshot, scored deterministically, and ranked by composite priority.

---

## Goal Lifecycle

```
Intelligence Snapshot
        │
        ▼
  generateAllGoals()   → All goals created (Level 1-4)
        │
        ▼
  prioritizeGoals()    → Sorted by weighted priority
        │
        ▼
  detectConflicts()    → Conflicting pairs identified + resolved
        │
        ▼
  trackProgress()      → Each goal scored for completeness
        │
        ▼
  Active Goals         → Persisted to ep_goals table
```

---

## Goal Score Components

### Priority Score (0-100)

```
priority = importance × 0.35 + urgency × 0.30 + expectedImpact × 0.20 + riskIfUnmet × 0.15
```

**Why these weights?**
- Importance × 0.35: The most significant weight. A goal that isn't strategically important shouldn't dominate.
- Urgency × 0.30: Time pressure is the second strongest driver. An unimportant but urgent goal shouldn't be ignored.
- Expected Impact × 0.20: If achieved, how much does this move the needle?
- Risk if Unmet × 0.15: Consequence of failure — lowest weight because most risk is captured by Level 1 goals.

### Level Weighting (ensures structural ordering)

```
weightedScore = level_weight + priority

Level 1: 1000 + priority
Level 2:  500 + priority
Level 3:  250 + priority
Level 4:    0 + priority
```

This means a Level 1 goal with priority 30 (score 1030) always outranks a Level 2 goal with priority 100 (score 600).

---

## Goal Fields

| Field | Type | Description |
|-------|------|-------------|
| `goalId` | string | Unique `g_xxxxxxxx` identifier |
| `level` | 1-4 | Mission hierarchy level |
| `levelName` | string | permanent_mission / strategic / operational / immediate |
| `category` | enum | 11 categories (capital_preservation, risk_management, etc.) |
| `title` | string | Short goal title |
| `description` | string | Detailed goal description |
| `metric` | string | Measurable metric key |
| `target` | number | Target value |
| `current` | number | Current value from intelligence |
| `unit` | string | %, R, ratio, count, bool |
| `higherIsBetter` | boolean | Direction of improvement |
| `priority` | 0-100 | Composite priority score |
| `importance` | 0-100 | Strategic importance |
| `urgency` | 0-100 | Time pressure |
| `expectedImpact` | 0-100 | Impact if achieved |
| `riskIfUnmet` | 0-100 | Consequence of failure |
| `confidence` | 0-100 | Confidence in assessment |
| `status` | enum | active / completed / paused / violated / pending |
| `progress` | 0-100 | Completion percentage |
| `estimatedCompletion` | ISO string | Estimated completion date |
| `obstacles` | string[] | Known obstacles |
| `evidence` | string[] | Intelligence evidence supporting this goal |
| `whyThisRank` | string | Plain-English explainability of rank |

---

## Category Distribution

| Category | Levels | Description |
|----------|--------|-------------|
| `capital_preservation` | 1 | Never lose capital — Level 1 permanent |
| `risk_management` | 1, 2 | Risk exposure control |
| `execution_quality` | 1, 2, 3 | Trade execution discipline |
| `profitability` | 1, 2 | P&L and expectancy targets |
| `drawdown_control` | 2 | Maximum drawdown monitoring |
| `trade_quality` | 2, 3, 4 | Setup quality thresholds |
| `exposure_control` | 3, 4 | Open position management |
| `market_observation` | 3, 4 | Intelligence gathering |
| `portfolio_management` | 3 | Correlation and diversification |
| `recovery` | 4 | Drawdown and crisis recovery |
| `compliance` | 1 | Safety rule adherence |

---

## Progress Computation

For each goal, progress is computed from its measurable metric:

```
if higherIsBetter:
  progress = clamp((current / target) × 100)
else:
  progress = clamp((1 - (current - target) / target) × 100)
```

**Special Cases:**
- `target = 0` and `higherIsBetter = false`: progress = 100 (already at target)
- `current > target` and `higherIsBetter = false`: progress < 100 (still needs reduction)
- Level 1 `safetyViolations` goal: `current = 0`, `target = 0`, `lowerIsBetter` → always 100% unless violations occur

---

## Estimated Completion

```
estDays = (100 - progress) / max(1, urgency / 10)
estimatedCompletion = now + estDays × 86,400,000ms
```

High-urgency goals (urgency = 90) estimate completion in `(100-progress)/9` days.  
Low-urgency goals (urgency = 10) estimate completion in `(100-progress)/1 = (100-progress)` days.

---

## Validation Rules

All goals produced by the engine are validated before return:

| Property | Validation |
|----------|-----------|
| `priority` | 0 ≤ v ≤ 100 |
| `importance` | 0 ≤ v ≤ 100 |
| `urgency` | 0 ≤ v ≤ 100 |
| `progress` | 0 ≤ v ≤ 100 |
| `confidence` | 0 ≤ v ≤ 100 |
| Level 1 goals | Always 5 goals, always ranked first |
| Emergency context | Level 4 goal always has `category = "recovery"` |
| No NaN propagation | All inputs use `isFinite(n) ? n : fallback` pattern |
