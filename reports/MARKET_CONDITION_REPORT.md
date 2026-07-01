# Market Condition Report

## Evaluated Dimensions

### Market Regime
| Regime | Risk Adjustment | Description |
|--------|----------------|-------------|
| Trending | +10 | Directional momentum, controlled risk-taking supported |
| Ranging | +5 | Mean-reversion, tighter targets recommended |
| Expansion | +5 | Expanding ranges offer opportunity |
| Low Volatility | 0 | Compressed ranges, limited opportunity |
| Compression | -5 | Pre-breakout, high-risk inflection point |
| Transition | -10 | Regime change in progress, elevated uncertainty |
| Volatile | -15 | High unpredictability, reduced exposure mandatory |

### Volatility Level
| Level | Risk Adjustment | Description |
|-------|----------------|-------------|
| Low | +15 | Stable price action, controlled risk |
| Normal | +5 | Standard conditions |
| High | -10 | Wider spreads, elevated slippage risk |
| Extreme | -25 | Dangerous conditions, maximum caution |

### Trading Session
| Session | Risk Adjustment | Description |
|---------|----------------|-------------|
| London | +10 | Primary session, highest liquidity |
| New York | +8 | Secondary, strong trend continuation |
| Overlap | +3 | Maximum volume but elevated volatility |
| Asian | -5 | Lower liquidity, tighter ranges preferred |
| Off-Hours | -15 | Minimal liquidity, elevated risk |

### Liquidity Level
| Level | Risk Adjustment | Description |
|-------|----------------|-------------|
| High | +10 | Tight spreads, excellent execution |
| Medium | 0 | Standard execution quality |
| Low | -15 | Wide spreads, poor execution quality |

## Composite Score Calculation

The composite risk score (0-100) is computed as a weighted average across all dimensions:

| Dimension | Weight |
|-----------|--------|
| Regime | 25% |
| Volatility | 20% |
| Session | 20% |
| Pair | 20% |
| Liquidity | 10% |
| Condition | 5% |

Each dimension's weight is further scaled by its sample size (up to 30 trades = full weight).

## Context Adjustments
- News Risk > 70%: -15 points
- News Risk > 50%: -7 points  
- Volatility Score > 80: -10 points
- Liquidity Score < 30: -8 points

## Score to Favorability Mapping
- 70-100: Favorable
- 50-69: Neutral
- 30-49: Unfavorable
- 0-29: Avoid
