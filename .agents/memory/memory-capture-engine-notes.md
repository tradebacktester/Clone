---
name: Memory Capture Engine
description: Auto episodic memory system — quirks, fixes, and integration patterns.
---

## Key decisions

- All capture functions are fire-and-forget: `.catch(() => {})` at every call site — never block the trading engine.
- `blocked` variable in `analyzer.ts::analyzeAll()` must be declared with `let` BEFORE the try block, then assigned inside it. Declaring inside try causes a TS "cannot find name" error at every reference outside the try scope.
- Duration uses `Math.floor` (not `Math.round`) so sub-minute trades show 0 minutes, not 1.
- Excursion tracker is in-memory `Map<tradeId, ExcursionState>` — zero DB I/O per monitoring tick.
- On server restart, call `seedExcursionTracker()` for every open trade to preserve MFE/MAE continuity.

## tsx test runner

Use `node_modules/.pnpm/node_modules/.bin/tsx --test <file>` from workspace root. The `pnpm exec tsx` shorthand does not resolve in api-server subpackage.

## Tables added

- `market_snapshot_memory` — extended with supplyZoneCount, demandZoneCount, activeSignalCount
- `setup_memory` — extended with entryPrice, stopLoss, takeProfit, riskReward
- `trade_events` — new append-only event log (one row per lifecycle event per trade)

## API endpoints added

- `GET /memory/timeline` — global event timeline
- `GET /memory/trade/:id` — full episodic chain for one trade
- `GET /memory/trade/:id/events` — just the event rows
- `GET /memory/history` — paginated all-records history

## Test file

`artifacts/api-server/src/lib/__tests__/memory-capture.test.ts` — 51 tests, 16 suites, all pass. Pure unit tests (no DB), safe to run any time.
