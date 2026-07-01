# Crisis Intelligence Engine

## Architecture Overview

The Crisis Intelligence Engine is a 5-dimensional anomaly detection and response system that continuously evaluates market, broker, infrastructure, data, and strategy conditions to detect, classify, and respond to crises before they become catastrophic.

```
5 Context Inputs
      ↓
5 Specialized Detectors
      ↓
Crisis Classifier (weighted composite)
      ↓
Severity Level (Normal → Catastrophic)
      ↓
Survival Mode Engine (mode selection)
      ↓
Recovery Engine (stage assessment)
      ↓
Emergency Decision Engine (event logging)
      ↓
Explainability Engine (narrative + actions)
      ↓
Full CrisisEngineReport (isAdvisoryOnly: true)
```

## Detection Dimensions

| Dimension | Weight | Key Signals |
|-----------|--------|-------------|
| Market | 30% | Flash crash, volatility, liquidity, spread, trading halt |
| Broker | 25% | Connection loss, rejections, slippage, execution time, API errors |
| Infrastructure | 20% | CPU, memory, DB response, network latency, disk |
| Data Integrity | 15% | Missing candles, duplicates, feed delay, timestamp errors |
| Strategy | 10% | Win rate decline, drawdown, loss clusters, drift |

## Crisis Severity Levels

| Severity | Score | Recommended Mode | Impact |
|----------|-------|-----------------|--------|
| Normal | 0-9 | Normal | No action required |
| Minor | 10-29 | Caution | Increase monitoring |
| Moderate | 30-49 | Defensive | Reduce exposure 50% |
| Major | 50-69 | Observation | Suspend new entries |
| Critical | 70-89 | Survival | No new trades, protect positions |
| Catastrophic | 90-100 | Emergency | Halt all trading |

## Survival Mode Cascade

Escalation: immediate (safety-critical — never delay going defensive)
De-escalation: ONE stage at a time (never skip recovery stages)

```
Normal → Caution → Defensive → Observation → Survival → Emergency
         ←─────── gradual de-escalation (one step at a time) ────────
```

## Key Design Decisions

- `isAdvisoryOnly: true` hardcoded on all outputs — engine never executes trades
- Strategy rules are NEVER modified by crisis response
- Every event is permanently stored with full snapshot for audit replay
- Recovery requires: stable infrastructure + stable broker + stable market + 5 confirmation cycles
- Emergency events only created when overall score ≥ 20
