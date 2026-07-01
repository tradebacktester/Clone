# Broker Reliability Report

## Monitored Signals

| Signal | Threshold (High) | Threshold (Critical) | Score Impact |
|--------|-----------------|---------------------|-------------|
| Order Rejections | ≥ 3/hour | ≥ 8/hour | +15 / +30 |
| Execution Delay | ≥ 2000ms | ≥ 5000ms | +15 |
| Slippage | ≥ 3 pips | ≥ 8 pips | +20 |
| Connection Loss | — | Disconnected | +50 |
| API Error Rate | ≥ 10% | ≥ 30% | +20 |
| Heartbeat Stale | ≥ 60s | ≥ 300s | escalating |
| Server Downtime | — | 300s+ no heartbeat | +40 |
| Price Feed | Multi-signal | — | +10 |

## Reliability Score
Inverse of crisis score: `reliabilityScore = max(0, 100 - crisisScore)`

## Execution Quality
`executionQuality = 100 - (avgExecutionMs/50) - (slippagePips × 5) - (apiErrorRate × 100)`
(clamped 0-100; equals 0 when connection is lost)

## Response to Broker Crisis

| Reliability Score | Action |
|------------------|--------|
| ≥ 80 | Normal — monitor |
| 60-79 | Caution — alert |
| 40-59 | Defensive — reduce exposure |
| 20-39 | Observation — suspend entries |
| < 20 | Survival/Emergency — halt |

## Broker Safety Note
All broker API keys are stored in the `broker_accounts` table, never in environment variables.
Crisis actions never modify broker credentials or account settings.
