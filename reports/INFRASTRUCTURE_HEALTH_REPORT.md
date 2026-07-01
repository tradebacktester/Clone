# Infrastructure Health Report

## Monitored Resources

| Resource | High Threshold | Critical Threshold | Score Impact |
|----------|---------------|-------------------|-------------|
| CPU | ≥ 80% | ≥ 95% | +15 / +30 |
| Memory | ≥ 85% | ≥ 95% | +15 / +30 |
| Disk | ≥ 85% | ≥ 95% | +10 / +25 |
| DB Response | ≥ 500ms | ≥ 2000ms | +15 / +35 |
| Network Latency | ≥ 200ms | ≥ 1000ms | +10 / +45 |
| VPS Uptime | < 0.5h | — | +20 |
| Service Crash | CPU+MEM both critical | — | +60 |

## Health Score
`healthScore = max(0, 100 - crisisScore)`

## Infrastructure Response Cascade

1. **Network latency ≥ 1000ms** → Internet connectivity crisis → Emergency mode
2. **CPU ≥ 95% + MEM ≥ 95%** → Service crash risk → Emergency mode
3. **DB Response ≥ 2000ms** → Database failure → Critical response
4. **Disk ≥ 95%** → Disk space critical → Major response
5. **VPS fresh restart** (uptime < 0.5h) → Observation mode minimum

## Monitoring Integration
Infrastructure metrics are checked on every `/crisis/status` API call. Health snapshots persist to `crisis_system_health` table for trend analysis.

## Recovery Requirements
Infrastructure must score < 20 before recovery can advance to the next stage.
