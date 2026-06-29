---
name: Unified Market Intelligence Engine
description: Architecture, gotchas, and constraints for the unified market intelligence layer (Phase 4 final).
---

# Unified Market Intelligence Engine

## Purpose
Single source of truth for all future intelligence modules. Advisory only — no trade execution, no strategy modification.

## Location
- Library: `lib/market-analysis/src/unified-intelligence/` (5 engine files + types + index)
- API routes: `artifacts/api-server/src/routes/market-intelligence.ts`
- Dashboard: `artifacts/dashboard/src/pages/market-intelligence-center.tsx` at `/market-intelligence-center`
- DB schema: `lib/db/src/schema/market-intelligence.ts` (5 tables)

## 5 Engines
1. **Health Scorer** — 8-component weighted score (0-100), grade A–F. Weights sum to 1.0.
2. **Opportunity Scorer** — 7-factor non-directional score. Never indicates buy/sell direction.
3. **Risk Assessor** — 6-dimension risk (Low→Extreme) with measurable evidence strings.
4. **Historical Comparator** — Sliding window similarity matching; returns win rate, PF, expectancy.
5. **Outlook Generator** — Regime continuation probability; no price forecasting.

## Key Gotchas

### learningFeaturesTable field names
- Field is `openedAt` (not `entryTime`) — Timestamp column
- No `patternType` column — use hardcoded "unknown" as placeholder
- `tradeId` is `text` not `integer`
- All numeric fields come as strings from Drizzle — always wrap in `Number()`

### Pair filtering
- `loadFeatureRows()` accepts an optional `pair` parameter that adds a `WHERE pair = ?` clause
- All 5 route handlers (intelligence, health, opportunity, risk, outlook, report) must pass `pair` to `loadFeatureRows(500, pair)` to avoid cross-pair data pollution

### Export collision
- `HistoricalMatch` type from `unified-intelligence/types.ts` conflicts with any future `HistoricalMatch` type
- In `lib/market-analysis/src/index.ts`, export it as `UnifiedHistoricalMatch` (aliased)

### Feature row ordering
- `loadFeatureRows()` queries with `DESC extractedAt` then `.reverse()` to restore chronological order
- All 5 engines depend on ascending time order (same pattern as world model engine)

## DB Tables (5)
- `market_intelligence_reports` — full unified report records
- `market_health_scores` — health score history with component breakdown
- `market_opportunity_scores` — opportunity score history with factor breakdown
- `market_risk_assessments` — risk assessment records with 6-dimension scores
- `market_outlook` — market outlook records with scenarios

## API Endpoints (7)
All paths without /api prefix (app mounts at /api):
- GET /market/intelligence — full unified report (primary endpoint)
- GET /market/health — health score breakdown
- GET /market/opportunity — opportunity score (non-directional)
- GET /market/risk — risk assessment with evidence
- GET /market/outlook — statistical market outlook
- GET /market/report — full report + generates 4 Markdown reports to /reports/
- GET /market/history — recent historical reports

## Tests
56 tests, 7 suites, all passing. Runner: `node_modules/.pnpm/node_modules/.bin/tsx --test`

## Phase 5 Input Contract
`UnifiedMarketState` object from `/api/market/intelligence` → `report.unifiedState` is the official Phase 5 input.

**Why:** Centralizes all market perception into one versioned object so Strategy Intelligence doesn't re-compute any market analysis.

**How to apply:** Phase 5 should call GET /market/intelligence first, consume `unifiedState`, and never re-implement health/risk/opportunity scoring independently.
