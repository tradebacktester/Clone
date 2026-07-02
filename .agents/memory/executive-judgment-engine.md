---
name: Executive Judgment Engine
description: Phase 7.3 — 7-candidate decision simulation; 5-stage pipeline; key gotchas
---

## Key Facts

- Engine: `lib/market-analysis/src/executive-judgment/` — 7 files
- DB tables: `ej_judgments`, `ej_simulations`, `ej_counterfactuals`, `ej_timeline` (4 tables)
- API routes: 6 routes registered in `executiveJudgmentRouter` at `/executive/judgment|simulations|rankings|opportunity-cost|counterfactual|report`
- Tests: 51/51 pass (6 suites) — runner: `node_modules/.pnpm/node_modules/.bin/tsx --test`
- Dashboard: `/executive-judgment` (10 tabs) — lazy-loaded in App.tsx

## Architecture

5 stages in `runExecutiveJudgment()`:
1. `simulateAllDecisions()` → 7 DecisionSimulation objects (8 metrics each)
2. `analyzeOpportunityCost()` → OC score -100 to +100, recommendation
3. `rankDecisions()` → 7 ranked entries, composite: EV×30%+conf×20%+evidence×20%+safety×15%+reliability×15%
4. `buildJudgmentExplainability()` → Wilson CI, why-best, alternatives-rejected
5. `buildCounterfactualAnalysis()` → post-trade only (counterfactual = null on initial run)

## Critical Rules

### Emergency Override
If `crisisStatus === "emergency"` OR `survivalModeActive === true` AND ranking selects `execute_trade` → `finalDecision` is overridden to `emergency_pause`. This is a hard-coded safety constraint tested in "emergency override" test.

### isAdvisoryOnly
`isAdvisoryOnly: true` hardcoded in `runExecutiveJudgment()` return, all 6 route handlers, all DB inserts.

### EV Normalisation
EV range is approximately [-1R, +4R]. Normalise to 0-100 via: `((EV + 1) / 5) × 100`. Do NOT use a different range or the composite score will be skewed.

### API Routes Pattern
Routes at `/executive/*` (NOT `/api/executive/*`) because app mounts at `/api`. These are different from executive-ai routes which are at `/executive-ai/*`.

## DB Tables Imported In Routes
Route file imports from `@workspace/db`: `ejJudgmentsTable`, `ejSimulationsTable`, `ejCounterfactualsTable`, `ejTimelineTable`. Also imports `esbReportsTable` and `erbReportsTable` for sub-system data.

## counterfactual field
The `counterfactual` field of `ExecutiveJudgment` is always `null` on the initial judgment run. It is populated only when `buildCounterfactualAnalysis()` is called post-trade (after trade closes with known outcome).
