---
name: Strategy Quality Intelligence Engine
description: Phase 5 Prompt 2 — SQI engine details, patterns, gotchas, and constraints.
---

## What it is
Advisory-only multi-factor setup quality scoring engine. Produces SQS (0–100) and 7-tier classification.

## 7 Components + Weights
- Rule Integrity 15%, Structural Quality 18%, Liquidity Intelligence 15%, AMD Intelligence 15%
- Confirmation Intelligence 12%, Market Intelligence 15%, Historical Intelligence 10%
- Weights sum to exactly 1.00.

## DB Tables
- `sqi_reports` — full quality report per evaluated setup
- `sqi_timeline` — lightweight time-series for trend queries

## API Routes (no /api prefix — mounted at /api in app.ts)
- POST /strategy/quality — evaluate a setup
- GET /strategy/quality — list recent reports
- GET /strategy/quality/:id — full report by ID
- GET /strategy/quality-history — timeline
- GET /strategy/component-scores — average component scores
- GET /strategy/classifications — classification distribution
- GET /strategy/statistics — aggregate statistics

## Key Gotchas
- esbuild cannot resolve deep `@workspace/db/schema/strategy-quality` paths — must import from `@workspace/db` directly (re-exports everything from schema index via schema/index.ts).
- Same pattern: `import { sqiReportsTable, sqiTimelineTable, learningFeaturesTable } from "@workspace/db"`
- isAdvisoryOnly is hard-coded `true as const` — enforced at engine AND route level.
- All component scores clamped 0–100 at every step.

## Test Coverage
74 tests across 11 suites, all passing.

## Dashboard
Page at `/strategy-quality` — 4 tabs: Evaluate, Report, History, Statistics.
HistoryRow/ClassificationRow/PairStatRow/SessionStatRow DTO types replace any in dashboard.
