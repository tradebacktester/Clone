# SCENARIO SIMULATION REPORT
Generated: Build-time placeholder — live report at /api/market/world-model/report
Engine Version: 1.0.0

---

## Overview

The Scenario Simulator answers observational questions such as:
- "What historically happens to liquidity when volatility increases by 20%?"
- "How has spread responded to news events?"

**All simulations are historical/observational only. No trading signals generated.**

## Predefined Scenarios

| # | Trigger          | Affected      | Type               |
|---|------------------|---------------|--------------------|
| 1 | volatility (+20%)| liquidity     | volatility_impact  |
| 2 | volatility (+20%)| spread        | volatility_impact  |
| 3 | correlation (-20%)| trend        | correlation_shift  |
| 4 | regime (+30%)    | confirmation  | regime_transition  |
| 5 | liquidity (-30%) | spread        | liquidity_shock    |
| 6 | news (+50%)      | volatility    | news_event         |
| 7 | news (+50%)      | spread        | news_event         |
| 8 | session (+30%)   | liquidity     | session_change     |

## Methodology

- Bucket comparison: split historical data by high/low trigger values
- Compare affected component values between buckets
- Report mean, std, min, max, and response time
- Confidence scales with sample size and consistency

Live scenario data: `GET /api/market/scenarios`
Custom scenarios: `POST /api/market/scenarios/custom`

_Advisory only._
