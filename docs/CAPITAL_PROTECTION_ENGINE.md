# Capital Protection & Survival Engine

## Overview

The Capital Protection & Survival Engine is an autonomous, always-on safety layer that monitors every source of trading risk and applies predefined protective measures when thresholds are crossed.

**Core principle:** Protect capital, not strategy. The engine may adjust risk management parameters. It must never modify entry/exit logic, learning models, or research modules.

## Architecture

```
CapitalProtectionInput
        │
        ▼
┌─────────────────────────────────────────┐
│           7 Independent Monitors         │
│  Account │ ConsecLoss │ Drawdown         │
│  Exposure │ Margin │ Broker │ System     │
└──────────┬──────────────────────────────┘
           │ MonitorSeverity (normal→emergency)
           ▼
┌─────────────────────────────────────────┐
│         Level Evaluator                  │
│  + Hysteresis (no instant de-escalation) │
│  → ProtectionLevel (7 levels)            │
└──────────┬──────────────────────────────┘
           │
    ┌──────┴───────┐
    ▼              ▼
Action Engine    Recovery Engine
(ActiveActions)  (RecoveryStatus)
    │
    ▼
Explainer → ProtectionExplainability
    │
    ▼
CapitalProtectionObject (advisory only)
```

## Protection Levels

| Level | Score | Trigger |
|-------|-------|---------|
| Normal | 0 | All monitors healthy |
| Caution | 1 | 1 monitor at caution |
| Restricted | 2 | 1 warning, or 3+ cautions |
| Observation Mode | 3 | 2+ warnings |
| Protected Mode | 4 | 1 critical |
| Emergency Mode | 5 | 2+ criticals, or 1 emergency |
| Trading Halt | 6 | System/drawdown/margin emergency |

## Monitor Severities

Each of the 7 monitors independently scores conditions from `normal` → `caution` → `warning` → `critical` → `emergency`. The worst-case monitor drives overall level escalation.

Hysteresis prevents instant de-escalation: a configurable grace period (default 4h) must elapse and recovery criteria met before stepping down one level at a time.

## Protection Actions

All actions are risk-management only. Strategy logic is never touched.

| Action | Trigger |
|--------|---------|
| reduce_position_size | Caution on any monitor |
| reduce_max_trades | Multiple warnings |
| increase_confirmation_requirements | Elevated broker/system risk |
| enter_observation_mode | Warning on consecutive loss |
| pause_new_trades | Critical on account/drawdown/margin |
| suspend_broker_entries | Broker quality failure |
| generate_emergency_alert | Any emergency condition |
| block_all_entries | Monthly loss limit / DD emergency |
| trading_halt | System emergency or extreme DD |

## Explainability

Every protection decision includes:
- **Summary**: One-line description of current status
- **Primary trigger**: Which monitor and what threshold
- **Level justification**: Why this exact level was chosen
- **Action justifications**: Why each action was taken, with expected benefit
- **Historical comparison**: Current vs. historical max drawdown/losses
- **Recovery path**: Exactly what's needed to step down

## Configuration

All thresholds are user-configurable via `POST /api/risk/protection/config`. Changes are validated before applying and the previous config is archived.

See `DRAWDOWN_PROTECTION_REPORT.md` for drawdown-specific thresholds.

## Database Tables

| Table | Purpose |
|-------|---------|
| cp_reports | Full protection snapshots |
| cp_actions | Individual protection actions taken |
| cp_config | User-configurable thresholds |
| cp_events | Level change events (escalation/de-escalation) |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/risk/protection | Full evaluation + persist |
| GET | /api/risk/protection/status | Current level + active actions |
| GET | /api/risk/protection/history | Level change events |
| GET | /api/risk/protection/actions | Recent actions log |
| POST | /api/risk/protection/config | Update thresholds |
| GET | /api/risk/protection/report | Full diagnostic report |

## Dashboard

Navigate to `/capital-protection` for:
- Live protection level banner
- All 7 monitor details (expandable)
- Active protection actions with recovery requirements
- Drawdown threshold visualization
- Broker health metrics
- Configuration panel
- Recovery progress tracker
