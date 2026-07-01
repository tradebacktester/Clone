# Portfolio Risk Report
## KRYTOS V2 — Risk Intelligence Core Engine

---

## Purpose

The Portfolio Risk Evaluator monitors the aggregate risk profile of all open positions simultaneously. Individual position risks are acceptable; portfolio-level concentration, correlation, and directional bias can amplify those individual risks dramatically.

---

## Inputs

| Field | Description |
|-------|-------------|
| openPositions[] | Array of all open positions (pair, direction, sizeUsd, riskUsd, pnl) |
| accountBalance | Current account balance |
| maxOpenTrades | Configured maximum simultaneous trades (default: 5) |
| correlationMatrix? | Optional cross-pair correlation matrix |

---

## Evaluation Dimensions

### 1. Concentration Score (25% weight)

Measures how concentrated exposure is in a single pair.

| Max Pair Concentration | Status |
|-----------------------|--------|
| ≤ 60% of total exposure | Acceptable |
| > 60% | Warning |
| > 90% | Critical |

Formula: `1 - (maxPairExposureUsd / totalExposureUsd)`

### 2. Correlation Score (25% weight)

Evaluates average pairwise correlation across open positions. Highly correlated positions (e.g., EURUSD + GBPUSD both long) amplify risk. When no correlation matrix is available, a moderate correlation of 0.5 is assumed.

| Avg Correlation | Score |
|----------------|-------|
| 0.0 | 100 |
| 0.5 | 60 |
| 0.8 | 20 |

### 3. Directional Bias Score (20% weight)

Measures the ratio of long vs short positions. Fully directional portfolios are more vulnerable to regime shifts.

| Directional Bias | Alert |
|-----------------|-------|
| ±75% (e.g., 4/5 positions same direction) | Warning |
| ±100% | Critical |

Formula: `((buyCount - sellCount) / totalPositions) × 100`

Range: -100 (all short) to +100 (all long)

### 4. Capacity Score (15% weight)

Evaluates current position count vs maximum allowed.

| Open Trades vs Max | Score |
|-------------------|-------|
| 0 positions | 100 |
| ≤ max | 50–100 |
| = max | 50 |
| > max | 0–50 |

### 5. Aggregate Risk Score (15% weight)

Total open risk across all positions as % of account balance. Limit: 6%.

| Aggregate Risk | Status |
|---------------|--------|
| ≤ 3% | Green |
| 3–6% | Yellow |
| > 6% | Warning alert |
| > 9% | Critical |

---

## Currency Exposure

The engine automatically builds a currency-level exposure map from pair tickers:

```
EURUSD long $10,000 → EUR +$10,000, USD +$10,000
GBPUSD long $10,000 → GBP +$10,000, USD +$10,000
```

This allows detection of concentrated single-currency risk (e.g., heavy USD exposure across multiple pairs).

---

## Portfolio Risk Score Formula

```
portfolioHealth =
  concentrationScore × 0.25 +
  correlationScore   × 0.25 +
  directionScore     × 0.20 +
  capacityScore      × 0.15 +
  aggregateScore     × 0.15

portfolioRiskScore = 100 - portfolioHealth
```

**Special case**: An empty portfolio (no open positions) has a risk score of exactly 0.

---

## Alert Conditions

| Alert | Severity | Condition |
|-------|----------|-----------|
| Too Many Open Positions | Warning | openTrades > maxOpenTrades |
| Aggregate Portfolio Risk Elevated | Warning | totalRisk > 6% |
| High Portfolio Correlation | Warning | avgCorrelation > 0.75 |
| Strong Directional Bias | Info | absDirectionalBias > 75% |

---

## Scalability

O(n²) for correlation matrix building where n = number of open positions. With maximum 5 positions, this is O(25) = negligible.
