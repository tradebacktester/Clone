---
name: Adaptive Risk Intelligence Engine
description: Phase 6 P3 — ARI engine; profile selection, safeToTrade logic, column name fix, naming collision.
---

## Key Facts

- Routes at `/adaptive-risk/profile|recommendations|history|market-analysis|performance|report` (6 routes)
- 4 DB tables: `ari_profiles`, `ari_recommendations`, `ari_history`, `ari_performance`
- 55 tests pass; tsx runner at `/home/runner/workspace/node_modules/.pnpm/node_modules/.bin/tsx`
- `isAdvisoryOnly: true` hardcoded on all engine outputs and route responses

## Gotchas

### safeToTrade logic
`safeToTrade` must be `true` ONLY for `balanced`, `aggressive`, `conservative` profiles. `observation` and `recovery` are NOT safe to trade (low-evidence / recovering modes). Wrong formula was `profile !== "emergency"` — correct is `["balanced","aggressive","conservative"].includes(profile)`.

### marketRegimeTable column name
The column for ordering is `updatedAt` (maps to `updated_at`), NOT `analyzedAt`. The schema has no `analyzedAt` field.

### generateRecommendations naming collision
`generateRecommendations` is already exported from an earlier engine (line ~178 in market-analysis index). The ARI export must be aliased: `generateRecommendations as generateAriRecommendations`.

## Profile → safeToTrade mapping
- emergency: false
- observation: false
- recovery: false
- conservative: true
- balanced: true
- aggressive: true
