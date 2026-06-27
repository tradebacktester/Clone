---
name: Robustness Framework
description: Strategy Robustness & Stress Testing Framework — 7 engines, dashboard page, report generator, test suite.
---

## Route path prefix gotcha
Express routes in `artifacts/api-server/src/routes/` must NOT include `/api` prefix — they're registered on a sub-router that is itself mounted at `/api` by the main app. All robustness routes use `/robustness/status`, `/robustness/run`, etc. (not `/api/robustness/...`).

**Why:** The main router in `routes/index.ts` uses `router.use(someRouter)` and is mounted at `/api` in the Express app. Prefixing with `/api` creates double-prefixed paths like `/api/api/robustness/status`.

## Execution stress test seed fix
`execution-stress.ts` uses the same seed as the baseline when a scenario only changes `spreadCostPips` (no winRate/RR/missedSignal/partialFill changes). Different seeds cause stochastic win/loss variance that can overwhelm the spread cost reduction, making the "higher spread reduces PnL" assertion non-deterministic.

**Why:** RNG seed determines win/loss outcomes. If trade outcomes differ between baseline and stress scenario, a lucky seed can produce more wins than the spread cost removes. Using identical seeds for spread-only scenarios ensures identical trade outcomes and deterministic PnL reduction.

**How to apply:** When adding new execution scenarios that only apply a cost (not changing win/loss selection), set `onlySpreadCost = true` logic to keep baseline seed.

## Test runner path
```
cd lib/market-analysis && /home/runner/workspace/node_modules/.pnpm/node_modules/.bin/tsx --test src/robustness/__tests__/robustness.test.ts
```
51 tests pass across 11 suites.

## Report generator export
`generateRobustnessReportMarkdown` is exported from `lib/market-analysis/src/index.ts` → imported as `@workspace/market-analysis`. The function lives in `src/robustness/report-generator.ts` and takes a `RobustnessPipelineResult`.

## Files
- `lib/market-analysis/src/robustness/` — all 7 engines + pipeline + report generator
- `artifacts/api-server/src/routes/robustness.ts` — 5 endpoints (status, results, results/latest, run, report)
- `artifacts/dashboard/src/pages/robustness.tsx` — full dashboard page (raw fetch, collapsible sections)
- `lib/db/src/schema/robustness.ts` — `robustness_results` table
- `lib/api-spec/openapi.yaml` — 5 robustness paths + 6 schemas added
