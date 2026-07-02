# Executive Planning, Goal Management & Mission Control Engine
## Phase 7.4 — Architecture & Design Reference

**Version:** 1.0.0  
**Status:** Production-Ready (Advisory Only)  
**Tests:** 44/44 passing  

---

## Overview

The Executive Planning Engine enables KRYTOS to think beyond individual trades by managing long-term objectives, balancing competing priorities, planning actions over time, and continuously evaluating progress.

The engine answers seven core questions every cycle:
1. What is my current objective?
2. What should I prioritise right now?
3. Am I protecting capital?
4. Am I maximising high-quality opportunities?
5. Should I become more defensive?
6. Should I continue observing?
7. Am I achieving my long-term mission?

The engine is **advisory only** — it never modifies the trading strategy, deploys research, or overrides safety mechanisms.

---

## Architecture

```
RunMissionInput
      │
      ▼
┌─────────────────────────────────────────────────────────────────┐
│                    runExecutiveMission()                        │
│                                                                 │
│  Stage 1: generateAllGoals()        → Goal[] (all 4 levels)    │
│  Stage 2: prioritizeGoals()         → Goal[] (ranked)          │
│  Stage 3: detectAndResolveConflicts → GoalConflict[]           │
│  Stage 4: generateAllPlans()        → ExecutivePlan[] (×4)     │
│  Stage 5: trackGoalProgress()       → GoalProgress[]           │
│  Stage 6: computeMissionHealth()    → MissionHealth            │
│                                                                 │
│  Output: ExecutiveMission (isAdvisoryOnly: true)                │
└─────────────────────────────────────────────────────────────────┘
```

---

## Mission Hierarchy

### Level 1 — Permanent Mission (5 goals, immutable)

| Goal | Metric | Target |
|------|--------|--------|
| Preserve Capital at All Times | capitalIntactPct | 100% |
| Maintain Disciplined Execution | executionAdherence | 100% |
| Ensure Long-Term Profitability | longTermExpectancy | ≥ 1.0R |
| Never Violate Safety Rules | safetyViolations | 0 |
| Remain Statistically Robust | regimeRobustness | ≥ 80% |

Level 1 goals **always rank above Level 2–4 goals** via structural priority weighting (`level_weight[1] = 1000`).

### Level 2 — Strategic Goals (~5 goals)
- Maintain Maximum Drawdown Below 8%
- Maintain Profit Factor ≥ 1.5
- Improve Long-Term Expectancy
- Reduce Execution Errors
- Improve Average Trade Quality Score

### Level 3 — Operational Goals (dynamic, 2–4 goals)
- Reduce Portfolio Exposure (triggered when riskScore ≥ 65 or drawdown ≥ 5%)
- Increase Observation Time (triggered when marketScore < 55 or crisis)
- Focus on Higher-Quality Setups Only (triggered when conditions are favourable)
- Avoid Correlated Trades (always present)
- Improve Entry Execution Quality (always present)

### Level 4 — Immediate Goals (dynamic, 1–2 goals)
Exactly one primary immediate goal is generated based on current conditions:
- `survivalMode || crisis → "Pause Trading — Survival Mode Active"`
- `drawdownPct ≥ 5% → "Recover from Drawdown — Conservative Mode"`
- `executiveScore ≥ 70 && !highRisk → "Execute High-Quality Setup"`
- `winRate < 50% → "Monitor Market — Wait for Clearer Signal"`
- `default → "Wait for Confirmation Signal"`

---

## Goal Prioritization Formula

```
priorityScore = importance × 0.35 + urgency × 0.30 + expectedImpact × 0.20 + riskIfUnmet × 0.15
```

### Level Ordering Guarantee

To ensure Level 1 always outranks Level 2, and Level 2 always outranks Level 3:

```
weightedPriority = LEVEL_WEIGHT[level] + priorityScore

LEVEL_WEIGHT = { 1: 1000, 2: 500, 3: 250, 4: 0 }
```

This guarantees Level 1 goals appear first in all priority rankings regardless of computed score.

---

## Goal Conflict Resolution

The conflict resolver detects opposing objectives and resolves them via priority + level ordering.

### Conflict Types

| Type | Description |
|------|-------------|
| `opportunity_vs_risk` | Maximise opportunity conflicts with risk reduction |
| `exposure_vs_opportunity` | Reduce exposure conflicts with entering a trade |
| `speed_vs_quality` | Act now conflicts with observe longer |
| `short_vs_long_term` | Immediate goal conflicts with strategic goal |
| `aggressive_vs_defensive` | Recovery mode conflicts with opportunity-seeking |
| `expansion_vs_consolidation` | Growth objectives conflict with consolidation |

### Resolution Rule

```
winner = goal with lower level (structural)
       OR goal with higher priority score (same level)

finalDecision = winner.title takes precedence; loser is deferred
```

### Validation Rule
Winner of `opportunity_vs_risk` is always the risk/capital goal — tested in test suite.

---

## Planning Engine (4 Horizons)

| Horizon | Timeframe | Key Drivers |
|---------|-----------|-------------|
| Immediate | Next trade | Survival mode, drawdown, executive score |
| Short-term | Next 4h session | Risk posture, quality filters |
| Medium-term | Next 5 trading days | Win rate, profit factor trends |
| Long-term | Next 30 days | Permanent mission alignment |

Each plan contains:
- `title` and `summary` (plain English)
- `actions[]` with priority rank, description, rationale, and linked goalId
- `linkedGoals[]`
- `confidence` (0-100)
- `risks[]` and `expectedBenefits[]`

### Emergency Plan Rule
If `survivalMode || crisisStatus = "emergency"`: immediate plan title always includes "pause", "halt", or "emergency". Tested explicitly.

---

## Progress Tracking

Progress per goal is computed from the measurable metric:

```
higherIsBetter: progress = clamp((current / target) × 100)
lowerIsBetter:  progress = clamp((1 - (current - target) / target) × 100)
```

Goal health thresholds:
- `progress ≥ 85` → `"healthy"`
- `progress ≥ 55` → `"at_risk"`
- `progress ≥ 30` → `"critical"`
- `progress < 30` → `"critical"`
- `status = "violated"` → `"violated"`

---

## Mission Health Formula

```
missionHealth = 
  level1Adherence     × 0.40 +   // Permanent mission compliance
  goalAchievement     × 0.30 +   // % of active goals with progress ≥ 60%
  planConsistency     × 0.20 +   // Average confidence across active goals
  conflictResolution  × 0.10     // Average confidence of resolved conflicts
```

Health status thresholds:
- `score ≥ 85` → `"optimal"`
- `score ≥ 70` → `"healthy"`
- `score ≥ 50` → `"degraded"`
- `score < 50` → `"critical"`
- `any Level 1 violated` → `"violated"`

---

## Database Schema

| Table | Purpose |
|-------|---------|
| `ep_missions` | One row per mission cycle — health, confidence, snapshot |
| `ep_goals` | One row per goal per mission (top 15 persisted) |
| `ep_plans` | One row per plan per mission (4 plans) |
| `ep_timeline` | Lightweight time-series for health trend charts |

---

## API Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/executive/mission`    | Run full mission cycle + persist all data |
| GET | `/api/executive/goals`      | Latest goals + category stats |
| GET | `/api/executive/plans`      | Latest 4-horizon plans + historical stats |
| GET | `/api/executive/progress`   | Goal progress reports + health trend |
| GET | `/api/executive/priorities` | Goal priority rankings + conflicts |
| GET | `/api/executive/report`     | Aggregated mission metrics |

---

## Safety Rules

The Executive Planning Engine:

✅ **MAY:**
- Create and manage goals
- Prioritise objectives using evidence-based scoring
- Build operational plans
- Monitor progress and generate health scores
- Recommend adjustments
- Coordinate all intelligence systems

❌ **MUST NEVER:**
- Modify the deterministic trading strategy
- Rewrite production code
- Deploy research automatically
- Ignore Executive Risk decisions
- Override permanent mission objectives
- Bypass human approval for production changes

`isAdvisoryOnly: true` hardcoded everywhere.
