# Drawdown Protection Report

## Overview

The Drawdown Protection Monitor continuously tracks balance and equity drawdown from their respective peaks. It applies graduated protective measures based on configurable thresholds.

## Monitored Metrics

| Metric | Description |
|--------|-------------|
| currentDrawdownPct | Max(balanceDD, equityDD) from peak |
| maxDrawdownPct | Historical maximum drawdown |
| drawdownVelocity | Rate of DD worsening (%/hour) |
| recoveryRate | Rate of DD improvement (%/hour) |
| thresholdCrossed | Highest threshold currently breached |

## Default Thresholds

| Level | Threshold | Actions Triggered |
|-------|-----------|-------------------|
| Warning | 5.0% | reduce_position_size, increase_confirmation_requirements |
| Elevated | 8.0% | reduce_position_size, reduce_max_trades, increase_confirmation_requirements |
| Critical | 12.0% | pause_new_trades, generate_emergency_alert, enter_observation_mode |
| Emergency | 15.0% | block_all_entries, generate_emergency_alert, trading_halt |

## Health Score Formula

```
if DD < warning:   100 - (DD / warning) × 15
if DD < elevated:  85 - ratio × 20
if DD < critical:  65 - ratio × 30
if DD < emergency: 35 - ratio × 25
if DD ≥ emergency: 10 - (DD - emergency) × 2
```

## Velocity-Based Pre-emption

When drawdown is worsening at >0.5%/hour and current DD > 2%, a pre-emptive `reduce_position_size` action fires — before any threshold is formally breached. This limits momentum-driven drawdown.

## Recovery Logic

De-escalation from drawdown-triggered levels requires:
- **Warning**: Drawdown < warning threshold sustained for grace period
- **Elevated**: Drawdown < warning threshold + account health ≥ 65
- **Critical**: Drawdown < elevated threshold + account health ≥ 65
- **Emergency**: Drawdown < critical threshold + all monitors normal/caution

Stepwise restoration: one level down per grace period. No instant recovery.

## Configuration

All thresholds configurable via the Configuration panel or `POST /api/risk/protection/config`.
Validation enforces: warning < elevated < critical < emergency.
