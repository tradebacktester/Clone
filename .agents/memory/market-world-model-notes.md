---
name: Market World Model
description: 13-component observational world model; statistical relationships, transitions, influence graph, scenarios; Phase 4 Prompt 3.
---

## Critical Implementation Notes

### Chronological Ordering (severe if missed)
- `loadFeatureRows()` queries DB in **DESC** order (newest first) — must `.reverse()` before passing to engines.
- All engines assume ascending time order: lag correlation, transition detection, current state extraction all depend on this.
- **Fix applied**: `rows.reverse().map(...)` in `market-world-model.ts` route.

### Engine Architecture
- **Relationship Analyzer**: Pearson correlation at lags 0/1/3 bars; p-value < 0.10 filter; |r| > 0.15 minimum; causal = lag > 0 + conf ≥ 75% + n ≥ 50.
- **Transition Engine**: state classifiers for regime/volatility/liquidity; 14 known transitions; `detectTransitions` returns internal `RawTransitionEvent` (property is `.category` not `.transitionCategory`); `computeTransitionStats` returns public type with `.transitionCategory`.
- **Influence Graph**: depth-1 direct edges from data + 16 domain priors; depth-2 propagation — **must guard against self-loops (A→B→A = A→A)** with `if (e1.sourceNode === e2.targetNode) continue`.
- **Scenario Simulator**: bucket comparison (75th percentile split); 8 predefined + custom via POST; observational only, no trading signals.
- **World Model Store**: singleton; `.compute(features, memoryCount)` must be called before all accessors; `features[features.length - 1]` = current state (ascending order).

### DB Tables (6)
- `world_model_relationships`, `world_model_transitions`, `world_model_transition_stats`, `world_model_memory`, `world_model_influence_edges`, `world_model_scenarios`

### API Routes (9 total)
- GET /market/world-model, /market/relationships, /market/transitions, /market/influence-graph, /market/scenarios, /market/history, /market/world-model/report, /market/world-model/status
- POST /market/scenarios/custom
- All without /api prefix (app mounts at /api)

### Dashboard
- Route: `/market-world` — 6 tabs: Overview, Influence Graph, Relationships, Transitions, Scenarios, History
- Uses lazy loading + tanstack query

### Test Runner
- `node_modules/.pnpm/node_modules/.bin/tsx --test lib/market-analysis/src/world-model/__tests__/world-model.test.ts`
- 64 tests, 9 suites, all pass

### Exports
- World model exports are selective in `lib/market-analysis/src/index.ts` to avoid type collisions with root `types.ts`.

**Why:** Time ordering matters because the engines use array index as a proxy for time. Descending DB query without reversal would treat the most recent data as the oldest, reversing lag detection and transition direction.
