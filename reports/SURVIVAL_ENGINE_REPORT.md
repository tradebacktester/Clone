# Survival Engine Report

## Mode Definitions

### Normal
Standard operation. All trading capabilities active. Monitoring every 10 minutes.

### Caution
Increased monitoring (5 min). All trading allowed. Alerts active. No restrictions.
**Triggered by**: Score 10-29 (Minor severity)

### Defensive
Reduced exposure (50%). Limited new positions. Higher confirmation required. Monitoring every 3 minutes.
**Triggered by**: Score 30-49 (Moderate severity)

### Observation
No new trade entries. Continue managing open positions. Active monitoring every 2 minutes.
**Triggered by**: Score 50-69 (Major severity)

### Survival
No new trades under any circumstances. Protect open positions with emergency stops. Continuous diagnostics every 1 minute.
**Triggered by**: Score 70-89 (Critical severity)

### Emergency
Automated trading halted. Continuous monitoring of markets, broker, infrastructure. Complete logs maintained. Operator alert required.
**Triggered by**: Score 90-100 (Catastrophic severity)

## Recovery Protocol

Recovery is always gradual — never skip stages:
```
Emergency → Survival → Observation → Defensive → Caution → Normal
```

Requirements to advance one stage:
1. Infrastructure score < 20 (healthy)
2. Broker reliability score ≥ 80%
3. Market crisis score < 20
4. ≥ 5 stable confirmation cycles

## Protective Override Rules
- `safeToTrade = true` ONLY in Normal or Caution mode
- All other modes: `safeToTrade = false`
- Emergency and Survival modes: `allowNewTrades = false` (hardcoded)
- Observation mode: `allowNewTrades = false`, `protectOpenPositions = true`
