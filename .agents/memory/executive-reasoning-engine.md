---
name: Executive Reasoning Engine
description: Phase 7.2 — 5-stage autonomous reasoning pipeline; key gotchas for index exports and conflict detection
---

## Key Facts

- Engine: `lib/market-analysis/src/executive-reasoning/` — 7 files
- DB tables: `er_reports`, `er_traces`, `er_safety_gates` (3 tables, schema in `lib/db/src/schema/executive-reasoning.ts`)
- API routes: 6 routes mounted on `executiveAiRouter` at `/executive-ai/reasoning`, `/reasoning/:id`, `/conflict-matrix`, `/alternatives`, `/safety-gates`, `/replay`
- Tests: 52/52 pass (13 suites) — runner: `node_modules/.pnpm/node_modules/.bin/tsx --test`

## Critical Gotchas

### 1. EvidenceItem collision
`adaptive-risk/index.js` already exports `EvidenceItem`. The executive-reasoning module also has an `EvidenceItem` type (different shape). In `lib/market-analysis/src/index.ts`, export it aliased:
```typescript
EvidenceItem as ErEvidenceItem,
```
from the executive-reasoning module to avoid duplicate identifier TS2300.

### 2. ReasoningStage must be explicitly re-exported
`ReasoningStage` is defined in `types.ts` but must be explicitly added to the re-exports in `executive-reasoning/index.ts`. Without it, `lib/market-analysis/src/index.ts` line 985 fails with TS2724.

### 3. detectMissingEvidence conflict threshold
The `detectMissingEvidence` function in `conflict-detector.ts` must only flag a conflict when the missing-data advisor recommends ≥ 2 rank levels above "observe" (i.e., "trade"). A missing-data advisor recommending "wait" (rank diff = 1) must NOT create a conflict entry, or the "no conflicts for fully aligned advisors" test fails.

**Why:** When all advisors are overridden to the same recommendation in tests, memory advisor still has `dataQuality: "missing"` (because `memoryAdvisor(null)` defaults to no historical data). The old code created a conflict entry unconditionally, causing `hasConflicts = true` even for fully aligned scenarios.

## Safety Gate Thresholds

```typescript
GATE_THRESHOLDS = {
  rulePassRate: 70, erbRiskScore: 65, capitalHealthScore: 40,
  evidenceQuality: 50, brokerReliability: 60, executiveConfidence: 55,
}
```

Critical gates (prohibit trading if failed): rulePassRate, erbRiskScore, capitalHealthScore, Emergency Mode.
Warning gates: evidenceQuality, brokerReliability, executiveConfidence.

## isAdvisoryOnly

Hardcoded `isAdvisoryOnly: true` in `runExecutiveReasoning()` return value and in all 6 route handlers via the DB insert.
