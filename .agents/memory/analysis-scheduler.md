---
name: Analysis Scheduler
description: How the background analysis loop works and integrates with bot start/stop
---

## Location
`artifacts/api-server/src/lib/analyzer.ts`

## Architecture
- `startAnalysisScheduler(intervalMinutes)` — called from `app.ts` on server boot AND from `POST /bot/start` route
- `stopAnalysisScheduler()` — called from `POST /bot/stop` route
- Uses `setInterval` with module-level guard to prevent double-starting
- Runs `analyzeAll()` immediately on start, then every 10 minutes

## analyzeAll flow
For each pair × timeframe: `runFullAnalysis()` → cache result → `persistAnalysis()` (4h only)

## persistAnalysis
1. DELETE all zones for pair → INSERT new detected zones
2. UPSERT market regime
3. IF signals.length > 0: mark pair signals inactive → INSERT new signals

**Why conditional signal update:** synthetic data may not produce signals on every run; existing seed signals should persist rather than be wiped.

## Cache
In-memory Map `pair_timeframe → {result, ts}`. Expires after 30 minutes. Used by market routes to serve cached analysis without re-computation.

**How to apply:** When bot is started, analysis runs immediately. If zones/signals seem stale, restart the workflow — the scheduler fires on startup.
