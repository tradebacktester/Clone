# MARKET WORLD MODEL REPORT
Generated: Build-time placeholder — live report generated at /api/market/world-model/report
Engine Version: 1.0.0

---

## Overview

The Market World Model constructs a structured, statistically-grounded representation
of the market environment and learns the relationships between its 13 components.

This report is populated dynamically via: `GET /api/market/world-model/report`

---

## Architecture

### 13 World Model Components
1. Market Regime
2. Trend
3. Volatility
4. Liquidity
5. Correlation
6. News Context
7. Session
8. Spread
9. Market Structure
10. Supply/Demand Quality
11. Liquidity Sweeps
12. AMD Completion
13. Confirmation Quality

### Engine Pipeline
1. Feature extraction from historical trade data
2. Pearson correlation analysis with lag detection (0, 1, 3 bars)
3. p-value filtering (p < 0.10) for statistical significance
4. Domain prior overlay for data-sparse edges
5. Directed influence graph construction (depth 1 + 2)
6. Transition state machine with probability estimation
7. Scenario simulation via bucket comparison analysis
8. Market memory storage for longitudinal tracking

---

## Limitations

- Relationships derived from trade feature data may be incomplete if sample sizes are low.
- Correlation ≠ causation. Causal labelling requires lag > 0, confidence ≥ 75%, sample ≥ 50.
- Scenario simulation uses bucket comparison, not regression.

_Advisory only. No trading signals generated._
