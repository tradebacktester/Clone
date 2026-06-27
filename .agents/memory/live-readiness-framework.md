---
name: Live Trading Readiness Framework
description: Deployment mode gating, broker safety layer, strategy health monitor, recovery engine, and readiness checklist — all in artifacts/api-server/src/lib/
---

## Architecture

Five engines in `artifacts/api-server/src/lib/`:
- `deployment-manager.ts` — paper/demo/live mode transitions + live gate toggle
- `broker-safety.ts` — spread filter, slippage protection, connection monitor, auto-retry, partial fill, reconciliation
- `strategy-health-monitor.ts` — 6-metric health score, 30-min interval, stored in strategy_health_snapshots
- `recovery-engine.ts` — startup sequence: restore positions → restore state → broker reconcile → resume monitoring
- `readiness-checklist.ts` — 7 pre-live checks, score updates bot_state.readiness_score

Three new routes: `routes/deployment.ts`, `routes/readiness-checklist.ts`, `routes/live-journal.ts`

Three dashboard pages: `/deployment`, `/readiness-checklist`, `/live-journal`

## Key thresholds (all constants at top of each engine file)
- Demo mode: ≥10 paper trades, readiness score ≥50, demo broker account
- Live mode: ≥50 paper trades, readiness score ≥75, live broker account, live gate explicitly ON
- Spread filter default: 3.0 pips max
- Slippage protection default: 5.0 pips max
- Health check intervals: strategy health every 30min, reconciliation every 5min
- Win rate warn/critical: 40%/30% over last 20 trades
- Profit factor warn/critical: 1.0/0.7 over last 30 trades
- Drawdown warn/critical: 8%/15% of initial capital

## DB schema
- 5 new tables in `lib/db/src/schema/readiness.ts`: live_journal, strategy_health_snapshots, readiness_checklist_results, broker_safety_config, recovery_log
- `bot_state` extended: broker_mode, readiness_score, last_recovery_at, recovery_positions_restored
- `broker_accounts` extended: is_demo, connection_health, last_connected_at, max_spread_pips

## app.ts startup sequence
`runStartupRecovery()` is called instead of the old inline bot-state check. It calls startAnalysisScheduler, startStrategyHealthMonitor, startPaperMonitor (if was running paper), and startReconciliationScheduler internally. The old `startAnalysisScheduler(10)` and `startPaperMonitor(30)` calls were removed from the top level.

**Why:** Recovery engine handles all startup monitoring initialization in one place, with logging and DB persistence.

## Live gate safety
- `bot_state.live_enabled` must be explicitly set to true via PUT /api/deployment/live-gate
- Defaults to false — even after restart
- Mode switch to "live" is blocked if live_enabled=false, readiness score <75, <50 closed trades, or no live broker account
- Mode switches blocked while bot is running (must stop first)
