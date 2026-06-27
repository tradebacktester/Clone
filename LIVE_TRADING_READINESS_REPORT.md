# Live Trading Readiness Framework — Implementation Report

**Date:** 2026-06-27  
**Project:** TradeClone AI  
**Scope:** Operational safety and reliability layer for live trading graduation

---

## Overview

The Live Trading Readiness Framework adds a production-grade operational layer between paper trading and real capital deployment. It addresses eight concerns: mode management, broker safety, emergency protection, strategy health monitoring, enriched trade journaling, crash recovery, pre-live verification, and this report.

No trading strategy logic was modified. All changes are additive safety and observability infrastructure.

---

## Components Delivered

### 1. Deployment Manager
**File:** `artifacts/api-server/src/lib/deployment-manager.ts`  
**Routes:** `artifacts/api-server/src/routes/deployment.ts`  
**Dashboard:** `artifacts/dashboard/src/pages/deployment.tsx`

Manages the three-stage deployment pipeline:

| Stage | Description | Prerequisites |
|-------|-------------|---------------|
| **Paper** | Simulated orders, zero real money | None (default) |
| **Demo** | Real broker connection, demo account | ≥10 paper trades, readiness score ≥50, demo account configured |
| **Live** | Real broker, real capital | ≥50 paper trades, readiness score ≥75, live account, live gate explicitly armed, risk settings valid |

Key safety measures:
- **Live gate** must be explicitly toggled `ON` before live mode is accessible — defaults to OFF on every startup
- Mode transitions are blocked while the bot is running
- All transitions are logged to the execution log table
- `brokerMode` field on `bot_state` tracks deployment stage independently from the legacy `mode` field

---

### 2. Broker Safety Layer
**File:** `artifacts/api-server/src/lib/broker-safety.ts`

Six interlocking protections for live order execution:

| Protection | Default | Trigger |
|-----------|---------|---------|
| **Spread Filter** | ON — max 3.0 pips | Reject order if spread exceeds threshold at execution time |
| **Slippage Protection** | ON — max 5.0 pips | Reject fill if slippage exceeds threshold |
| **Connection Monitor** | ON | Flags degraded/disconnected status; emits supervisor alert |
| **Auto-Retry** | ON — 3 retries, exponential backoff | Retries broker operations on transient failure |
| **Partial Fill Handling** | ON — 80% threshold | Accept partial fills above threshold; reject below 50% |
| **Position Reconciliation** | ON — every 5 min | Compares open positions vs broker state; flags discrepancies |

All thresholds are configurable via the Deployment Manager UI or the `/api/deployment/safety-config` endpoint. Configuration is persisted in the `broker_safety_config` table.

---

### 3. Emergency Protection Integration

Emergency protection builds on the existing `supervisor-engine.ts` infrastructure:

- Daily loss limit (from `risk_settings.max_daily_loss`) enforced by supervisor
- Weekly loss limit (`risk_settings.max_weekly_loss`) enforced by supervisor
- Emergency stop flag on `bot_state` — bot refuses to restart without manual reset
- Connection failures detected by broker safety layer → supervisor alert emitted
- Position reconciliation discrepancies → supervisor alert emitted
- The readiness checklist verifies all emergency protection is in place before allowing live

---

### 4. Strategy Health Monitor
**File:** `artifacts/api-server/src/lib/strategy-health-monitor.ts`

Runs every 30 minutes and scores six dimensions:

| Metric | Window | Warn | Critical |
|--------|--------|------|----------|
| Win Rate | Last 20 trades | < 40% | < 30% |
| Profit Factor | Last 30 trades | < 1.0 | < 0.7 |
| Max Drawdown | All trades | ≥ 8% | ≥ 15% |
| Signal Frequency | Last 7 days | < 0.3/day or > 10/day | — |
| Data Quality | Live prices + cached analysis | < 70/100 | ≥2 pairs stale |
| Regime Stability | All active pairs | ≥2 unfavorable regimes | — |

Each check emits a `supervisor_alert` when degraded or critical. The overall health score (0-100) is stored in `strategy_health_snapshots` for trend tracking. The Deployment Manager dashboard shows a live health score chart.

---

### 5. Live Trade Journal
**File:** `artifacts/api-server/src/lib/live-journal.ts`  
**Routes:** `artifacts/api-server/src/routes/live-journal.ts`  
**Dashboard:** `artifacts/dashboard/src/pages/live-journal.tsx`

Enriched journal beyond the standard trades table:

- **Entry / exit reasoning** — human-readable rationale captured at trade event time
- **Rule evaluation** — per-rule pass/fail from the AMD/SMC ruleset
- **Confidence scores** — per-signal confidence percentages (rendered as bar charts)
- **Market regime context** — regime + confidence at the time of entry
- **Broker execution details** — requested vs executed price, spread, slippage, fill %
- **Operator notes** — editable post-trade annotations
- **Mode tagging** — paper/demo/live labeled on every entry

Filterable by pair and mode. Entries are linked to the parent trade row via `trade_id`.

---

### 6. Recovery System
**File:** `artifacts/api-server/src/lib/recovery-engine.ts`

Runs automatically on every API server startup:

1. **Scan open positions** — finds all DB trades with `status = 'open'`
2. **Refresh prices** — updates `current_price` from live price feed
3. **State restoration** — reads `bot_state`; leaves bot halted if `emergency_stop` or `halted_due_to_risk` flags are set (requires manual review)
4. **Broker reconciliation** — in demo/live mode, checks for positions open > 48h as a staleness proxy
5. **Resume monitoring** — restarts analysis scheduler, health monitor, reconciliation scheduler
6. **Recovery log** — all events written to `recovery_log` table and visible in the Deployment Manager UI

The `bot_state` table records `last_recovery_at` and `recovery_positions_restored` after each startup sequence.

---

### 7. Readiness Checklist
**File:** `artifacts/api-server/src/lib/readiness-checklist.ts`  
**Routes:** `artifacts/api-server/src/routes/readiness-checklist.ts`  
**Dashboard:** `artifacts/dashboard/src/pages/readiness-checklist.tsx`

Seven gated checks across five categories:

| Check | Category | Required | Live Threshold |
|-------|----------|----------|----------------|
| Risk Configuration | Risk | ✓ | ≤1% per trade, ≤3% daily, ≤6% weekly |
| Paper Trading History | Validation | ✓ | ≥50 trades, ≥14 days, WR≥45%, PF≥1.1 |
| Production Readiness Score | Validation | ✓ | ≥75/100 |
| Broker Configuration | Infrastructure | ✓ (live check) | Live account configured |
| Broker Safety Layer | Safety | ✓ | All core protections ON |
| Emergency Protection | Safety | ✓ | Loss limits > 0 |
| Live Trading Gate | Safety | ✓ (live check) | Gate explicitly armed |

The score (0-100) updates `bot_state.readiness_score` and feeds back into the Deployment Manager mode-transition gate. Run history is preserved in `readiness_checklist_results`.

---

## Database Schema

Five new tables added in `lib/db/src/schema/readiness.ts`:

| Table | Purpose |
|-------|---------|
| `live_journal` | Enriched trade journal entries |
| `strategy_health_snapshots` | Periodic health metric history |
| `readiness_checklist_results` | Checklist run history |
| `broker_safety_config` | Safety layer configuration (singleton) |
| `recovery_log` | Startup recovery event log |

Two existing tables extended:

| Table | New Columns |
|-------|------------|
| `bot_state` | `broker_mode`, `readiness_score`, `last_recovery_at`, `recovery_positions_restored` |
| `broker_accounts` | `is_demo`, `connection_health`, `last_connected_at`, `max_spread_pips` |

---

## API Endpoints

### Deployment Manager
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/deployment/status` | Full deployment status |
| PUT | `/api/deployment/mode` | Switch paper/demo/live |
| PUT | `/api/deployment/live-gate` | Toggle live gate on/off |
| GET | `/api/deployment/safety-config` | Get safety thresholds |
| PUT | `/api/deployment/safety-config` | Update safety config |
| GET | `/api/deployment/connection-health` | Broker connection check |
| POST | `/api/deployment/reconcile` | Manual reconciliation |
| GET | `/api/deployment/strategy-health` | Run health check |
| GET | `/api/deployment/strategy-health/snapshots` | Health history |
| GET | `/api/deployment/recovery-log` | Startup recovery log |

### Readiness Checklist
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/readiness/checklist/latest` | Latest checklist result |
| POST | `/api/readiness/checklist/run` | Run checklist |
| GET | `/api/readiness/checklist/history` | Run history |

### Live Journal
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/live-journal` | List entries (filterable) |
| POST | `/api/live-journal` | Create entry |
| GET | `/api/live-journal/:id` | Get entry + trade data |
| PUT | `/api/live-journal/:id` | Update notes/execution |

---

## Dashboard Pages

Three new pages accessible from the left navigation:

| Nav Label | Route | Page |
|-----------|-------|------|
| Deployment | `/deployment` | Mode selector, live gate, connection health, strategy health chart, safety config editor, recovery log |
| Live Readiness | `/readiness-checklist` | Score gauge, checklist by category, run button, history |
| Live Journal | `/live-journal` | Enriched trade entries with rule eval, confidence bars, broker execution, notes editor |

---

## Path to Live Trading

To graduate from paper → live, resolve all checklist blockers in order:

1. **Accumulate paper trades** — run bot in paper mode until ≥50 trades, ≥14 days, WR≥45%, PF≥1.1
2. **Run Production Readiness suite** — score must reach ≥75 (Prod. Readiness page)
3. **Configure risk limits** — Settings → Risk Management (≤1%/trade, ≤3% daily, ≤6% weekly)
4. **Add a demo broker account** — Settings → Broker Accounts (mark as demo)
5. **Graduate to demo mode** — Deployment Manager → select Demo
6. **Validate in demo** — observe live execution, check journal, confirm health metrics
7. **Add a live broker account** — Settings → Broker Accounts (mark as live, not demo)
8. **Arm the live gate** — Deployment Manager → toggle Live Trading Gate ON
9. **Run Live Readiness checklist** with "Include live-mode checks" enabled — all must pass
10. **Switch to live mode** — Deployment Manager → select Live

At any point, emergency stop (`/api/bot/emergency-stop`) returns to safe state immediately.

---

## What Was NOT Changed

- Trading strategy logic (AMD/SMC/Supply-Demand pattern detection)
- Signal generation algorithms
- Risk calculation formulas
- Existing backtesting, replay, or historical validation systems
- Supervisor alert thresholds for existing checks
- Any existing database tables (only additive columns)
