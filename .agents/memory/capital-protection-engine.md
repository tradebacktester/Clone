---
name: Capital Protection Engine
description: Phase 6 P2 — 7-monitor capital survival engine; advisory only; 75 tests; 4 DB tables; 6 API routes.
---

## What it is
`lib/market-analysis/src/capital-protection/` — autonomous always-on capital safety layer. Evaluates 7 independent monitors, produces a ProtectionLevel (0–6), generates risk-management-only actions. Never touches strategy logic.

## Architecture
- 7 monitors: account / consecutive-loss / drawdown / exposure / margin / broker / system
- Level evaluator: worst-case severity → protection level; hysteresis prevents instant de-escalation
- Action engine: deduplicates actions by severity; includes recovery requirements per action
- Recovery engine: grade period + criteria count before stepping down ONE level
- Explainer: builds human-readable summary, trigger, justification, action justifications, recovery path
- `runCapitalProtection(input)` → `CapitalProtectionObject`

## Protection levels (0–6)
normal / caution / restricted / observation_mode / protected_mode / emergency_mode / trading_halt

## Key gotchas

**botStateTable has no balance/equity columns** — always fall back to defaults (10000). The table only has: running, mode, activePairs, haltedDueToRisk, emergencyStop, liveEnabled, brokerMode, readinessScore, lastRecoveryAt.

**gatherSystemMetrics field name mismatch** — returns `dbHealth`/`apiHealth`/`apiErrorRate`, NOT `dbAvailability`/`apiAvailability`/`errorRate`. Cast with `(sysMetrics as any).dbHealth ?? 95`.

**MONITOR_SEVERITY_SCORE** — must be defined LOCALLY in action-engine.ts as a const. Do not import it from level-evaluator.ts (it's not exported from there).

**Margin healthScore crashes with marginLevel=0** — when `usedMargin <= 0 && marginLevel <= 0`, the formula `clamp(5 - emergencyLevel * 0.2)` produces −25 → health 0 → severity "emergency". Fix: gate with `noMarginUsed` flag and return health=100.

**Consecutive loss streak direction** — trades sorted most-recent-first. Walk from index 0 until result switches from loss to win. If index 0 is a win, consecutiveLosses = 0.

## DB tables
- `cp_reports` — full snapshots per evaluation
- `cp_actions` — individual actions (with reportId FK)
- `cp_events` — level-change events (escalation / de-escalation)
- `cp_config` — user thresholds (JSONB); one active row at a time; previous archived on update

## API routes (at /api/risk/protection*)
- GET /risk/protection — full eval + persist (pass `?pair=EURUSD`)
- GET /risk/protection/status — current level + action count from DB
- GET /risk/protection/history — events + reports list
- GET /risk/protection/actions — recent actions (last 7d default)
- POST /risk/protection/config — validate + persist config
- GET /risk/protection/report — generate report object (no persist)

## Tests
75 tests in `lib/market-analysis/src/tests/capital-protection.test.ts`
Run: `node_modules/.pnpm/node_modules/.bin/tsx --test src/tests/capital-protection.test.ts`

## Dashboard
`/capital-protection` — 10 tabs: Overview, Monitors, Drawdown, Exposure, Margin, Broker, History, Config, Recovery, Report.
