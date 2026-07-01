# Risk Profile Report

## Profile Definitions

### Emergency
- Max Risk/Trade: 0.10% | Max Trades: 0 | Daily Budget: 0.20% | Size: 0.10x
- Triggered when: composite risk score < 15, extreme volatility + high news risk, or insufficient evidence with adverse context
- Purpose: Halt further capital loss. Near-zero exposure while conditions stabilise.

### Observation
- Max Risk/Trade: 0.25% | Max Trades: 1 | Daily Budget: 0.50% | Size: 0.25x
- Triggered when: composite score 15-30 OR insufficient historical evidence (< 10 trades)
- Purpose: Monitor conditions without meaningful capital at risk.

### Recovery
- Max Risk/Trade: 0.35% | Max Trades: 1 | Daily Budget: 1.00% | Size: 0.35x
- Triggered when: composite score 30-45 following adverse period
- Purpose: Gradual re-engagement to rebuild confidence without over-correcting.

### Conservative
- Max Risk/Trade: 0.50% | Max Trades: 2 | Daily Budget: 1.50% | Size: 0.50x
- Triggered when: composite score 45-60
- Purpose: Capital preservation in uncertain or neutral market environments.

### Balanced
- Max Risk/Trade: 1.00% | Max Trades: 3 | Daily Budget: 3.00% | Size: 1.00x
- Triggered when: composite score 60-75
- Purpose: Optimal risk-adjusted returns in neutral-to-favourable conditions.

### Aggressive
- Max Risk/Trade: 1.50% | Max Trades: 4 | Daily Budget: 4.50% | Size: 1.30x
- Triggered when: composite score ≥ 75 AND confidence ≥ 50
- Purpose: Maximise returns when multiple dimensions confirm favourable conditions.

## Absolute Safety Limits (cannot be exceeded by any profile or AI)

| Parameter | Absolute Limit |
|-----------|---------------|
| Max Risk Per Trade | 2.0% |
| Max Open Trades | 5 |
| Max Pair Exposure | 4.0% |
| Max Correlation Exposure | 8.0% |
| Daily Risk Budget | 6.0% |
| Weekly Risk Budget | 12.0% |
| Position Size Multiplier | 2.0x |
| Exposure Multiplier | 2.0x |

## Protective Override Rules

1. **Extreme volatility** → Profile capped at Conservative (Aggressive/Balanced → Conservative)
2. **News risk > 85%** → At minimum Observation profile enforced
3. **Low liquidity** → Aggressive → Balanced
4. **Confidence < 30%** → Aggressive → Balanced
5. **Confidence < 20%** → Balanced → Conservative

## Profile Selection Flow

```
Trades → Multi-Dimension Learning → Composite Score
↓
Confidence Check (< 10 trades → Observation)
↓
Score → Profile Mapping
↓
Protective Override Check
↓
User Safety Limit Clamp
↓
Absolute Safety Limit Clamp
↓
Final Profile + Parameters
```
