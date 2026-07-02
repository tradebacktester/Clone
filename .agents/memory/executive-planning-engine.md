---
name: Executive Planning Engine
description: Phase 7.4 — 4-level mission hierarchy; goal prioritization; conflict resolution; 4-horizon planning; 44/44 tests
---

## Key Facts

- Engine: `lib/market-analysis/src/executive-planning/` — 7 files
- DB tables: `ep_missions`, `ep_goals`, `ep_plans`, `ep_timeline` (4 tables)
- API routes: 6 routes at `/executive/mission|goals|plans|progress|priorities|report`
- Tests: 44/44 pass — runner: `/home/runner/workspace/node_modules/.pnpm/node_modules/.bin/tsx --test`
- Dashboard: `/mission-control` (10 tabs) — lazy-loaded in App.tsx

## Architecture

6 stages in `runExecutiveMission()`:
1. `generateAllGoals()` → Level 1-4 goal set (12-16 goals)
2. `prioritizeGoals()` → sorted by level_weight + priority
3. `detectAndResolveConflicts()` → conflict pairs resolved
4. `generateAllPlans()` → 4-horizon plans
5. `trackGoalProgress()` → progress per goal
6. `computeMissionHealth()` → mission health score

## Critical Rules

### Level Weight Guarantee
`weightedScore = level_weight[level] + priorityScore`
where `level_weight = {1: 1000, 2: 500, 3: 250, 4: 0}`.
This ensures Level 1 always outranks Level 2-4 regardless of computed score.

### Priority Formula
`priority = importance × 0.35 + urgency × 0.30 + impact × 0.20 + riskIfUnmet × 0.15`

### Mission Health Formula
`health = level1Adherence × 0.40 + goalAchievement × 0.30 + planConsistency × 0.20 + conflictResolution × 0.10`

### Immediate Plan Decision Tree
- survivalMode || crisis → emergency pause plan
- drawdownPct ≥ 5% → drawdown recovery plan
- executiveScore ≥ 70 && riskScore < 65 → execute setup plan
- winRate < 50% → monitor/wait plan
- default → wait for confirmation plan

### conflict resolution: opportunity_vs_risk
Winner must always be risk/capital goal or Level 1 goal — this is tested explicitly.

### Route Prefix Warning
Routes at `/executive/mission|goals|plans|...` SHARE the `/executive/` prefix with the judgment engine's `/executive/judgment|simulations|...`. Both routers are registered separately in routes/index.ts. No conflict because route paths are fully distinct.

### isAdvisoryOnly
Hardcoded everywhere: engine return, all 6 route handlers, all DB inserts.

## DB Tables
Import from `@workspace/db`: `epMissionsTable`, `epGoalsTable`, `epPlansTable`, `epTimelineTable`. Route file also imports `esbReportsTable` and `erbReportsTable` for sub-system data.

## Test Count Summary (Phase 7 total: 203)
- 7.1 Executive AI Core: 56
- 7.2 Executive Reasoning: 52
- 7.3 Executive Judgment: 51
- 7.4 Executive Planning: 44
