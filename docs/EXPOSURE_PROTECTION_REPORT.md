# Exposure Protection Report

## Overview

The Exposure Protection Monitor prevents dangerous portfolio concentration by monitoring total open risk, per-pair exposure, correlation, directional bias, and concentration risk.

## Monitored Metrics

| Metric | Description | Default Limit |
|--------|-------------|---------------|
| totalOpenRiskPct | Sum of all position risk% | 6.0% of balance |
| maxPairExposurePct | Highest single-pair risk | 3.0% of balance |
| correlationScore | Portfolio correlation index (0–1) | 0.7 |
| directionalBias | % risk in dominant direction | 70% |
| concentrationRisk | % of total risk in single pair | Derived |

## Correlation Model

The monitor uses a static correlation matrix for KRYTOS's 3 pairs:

| | EUR/USD | GBP/USD | USD/JPY |
|---|--------|---------|---------|
| EUR/USD | 1.00 | 0.78 | -0.65 |
| GBP/USD | 0.78 | 1.00 | -0.55 |
| USD/JPY | -0.65 | -0.55 | 1.00 |

Same-direction positions amplify correlation risk; opposing directions reduce it.

## Health Score Formula

```
openRiskScore  = 100 - (totalRisk / limit) × 50
pairRiskScore  = 100 - (maxPair / pairLimit) × 50
corrScore      = 100 - correlation × 40
biasScore      = 100 - ((bias - 50) / 50) × 40
healthScore    = min(all scores)
```

## Protection Actions

| Condition | Action |
|-----------|--------|
| Total risk ≥ 1.5× limit | block_all_entries + generate_emergency_alert |
| Total risk ≥ limit | pause_new_trades |
| Total risk ≥ 75% of limit | reduce_position_size |
| Pair concentration ≥ 1.5× limit | reduce_position_size |
| Pair concentration ≥ limit | increase_confirmation_requirements |
| Correlation ≥ 0.7 | reduce_max_trades + increase_confirmation_requirements |
| Directional bias ≥ 70% | increase_confirmation_requirements |

## Recovery

Exposure-related restrictions clear when positions are reduced or closed, bringing metrics within limits. The system recalculates on every evaluation cycle.
