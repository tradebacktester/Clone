# Broker Protection Report

## Overview

The Broker Protection Monitor continuously evaluates execution quality across 5 dimensions. If broker conditions deteriorate, new trade entries are automatically suspended to prevent adverse execution.

## Monitored Dimensions

| Dimension | Default Limit | Weight |
|-----------|--------------|--------|
| Spread (vs baseline) | 3.0 pips | 30% |
| Slippage | 1.0 pips | 20% |
| Execution time | 500ms | 20% |
| Order rejection rate | 10% | 15% |
| Connection quality | 90% | 15% |

## Scoring Formulas

**Spread Score:**
```
ratio = spread / baseline
if ratio ≤ 1:   100
if spread ≤ max: 100 - ((spread - baseline) / (max - baseline)) × 40
else:           60 - ((spread - max) / max) × 55
```

**Connection Score:**
```
if quality ≥ min: 100 - ((100 - quality) / (100 - min)) × 20
else:             80 - ((min - quality) / min) × 75
```

## Protection Actions

| Condition | Action |
|-----------|--------|
| Connection < 70% of min | suspend_broker_entries + generate_emergency_alert |
| Connection < min | suspend_broker_entries |
| Spread ≥ 2× max | suspend_broker_entries + generate_emergency_alert |
| Spread ≥ max | suspend_broker_entries |
| Spread ≥ 75% of max | increase_confirmation_requirements |
| Slippage ≥ 2× max | suspend_broker_entries |
| Slippage ≥ max | increase_confirmation_requirements |
| Execution ≥ 2× max | suspend_broker_entries |
| Rejection rate ≥ 2× max | suspend_broker_entries |

## Recovery

Broker suspensions clear automatically once conditions normalise:
- Spread within limits for sustained period
- Connection quality restored
- Execution time normalised

Recovery grace period: 1 hour minimum.

## Integration with Risk Intelligence

The Broker Protection Monitor shares data with the Risk Intelligence Engine's `evaluateBrokerRisk` function. Both use `m.spreadBaseline` (not `m.baseline`) as the spread reference.
