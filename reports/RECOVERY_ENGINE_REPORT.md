# Recovery Engine Report

## Recovery Pathway

```
Emergency → Survival → Observation → Defensive → Caution → Normal
```

**Rules:**
- NEVER skip a recovery stage
- NEVER de-escalate during active crisis (score must drop first)
- Each stage requires ALL four conditions simultaneously

## Stage Advancement Requirements

| Requirement | Threshold |
|-------------|-----------|
| Infrastructure stable | Crisis score < 20 |
| Broker reliable | Crisis score < 20 AND reliability score ≥ 80% |
| Market stable | Crisis score < 20 |
| Confirmation cycles | ≥ 5 stable readings |

## Estimated Recovery Time
Each remaining stage: 10 minutes if conditions are stable.
Example: Emergency → Normal = 5 stages × 10 min = 50 minutes minimum.

## Recovery Audit
Every recovery assessment is persisted to `crisis_recovery_log`:
- Current and target stage
- All four readiness flags
- Stages completed and remaining
- Next-stage requirements
- Estimated recovery minutes
- Trigger event ID reference

## Recovery Explainability
Each recovery assessment provides:
- `stableInfrastructure` boolean with infra score
- `stableBroker` boolean with reliability score
- `stableMarket` boolean with market score
- `sufficientConfirmation` boolean with cycle count
- `nextStageRequirements` — plain-language list of what's missing

## AI Integration Readiness
Recovery logic is deterministic and rule-based. Future AI modules may provide:
- Predicted time to stability (time-series forecasting)
- Anomaly pattern matching against historical recoveries
- Confidence-weighted stage advancement recommendations
All AI recommendations will be advisory-only and cannot bypass the confirmation gate.
