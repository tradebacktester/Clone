# FEATURE IMPORTANCE REPORT

**Generated:** 2026-06-28 (initial template — run POST /api/learning/features/analyze to populate)  
**Engine Version:** 1.0.0  
**Sample Size:** 0 trades  
**Features Analyzed:** 17 (0 with sufficient data)  
**Overall Confidence:** 0.0% (Insufficient)  
**Advisory Only:** This report never modifies trading behavior.

---

## Engine Status

The Feature Importance & Confidence Learning Engine (v1.0.0) is initialized and ready.

To generate a populated report:
1. Run a Learning Engine cycle: `POST /api/learning-engine/run`
2. Trigger Feature Importance analysis: `POST /api/learning/features/analyze`
3. Retrieve the full report: `GET /api/learning/features/report?format=markdown`

---

## 17 Features Under Analysis

| # | Feature | Category | Type | Description |
|---|---------|----------|------|-------------|
| 1 | Supply Zone Quality | zone | numeric | Quality score of the supply zone at trade entry (0–100) |
| 2 | Demand Zone Quality | zone | numeric | Quality score of the demand zone at trade entry (0–100) |
| 3 | Premium / Discount Position | zone | categorical | Whether price is in premium or discount relative to range |
| 4 | Liquidity Sweep Strength | execution | numeric | Strength of the liquidity sweep before the entry (0–100) |
| 5 | AMD Quality | execution | numeric | AMD pattern quality score (0–100) |
| 6 | Confirmation Candle Quality | execution | numeric | Quality of the confirmation candle at entry (0–100) |
| 7 | Higher Timeframe Alignment | context | numeric | Multi-timeframe confluence score (0–100) |
| 8 | Trend Direction | context | categorical | Prevailing trend at trade time (bullish/bearish/ranging) |
| 9 | Market Regime | context | categorical | Market regime classification (trending/ranging/volatile/low_volatility) |
| 10 | Session | context | categorical | Trading session at trade open (london/new_york/asian) |
| 11 | Volatility | context | categorical | Volatility level at trade time (low/medium/high) |
| 12 | Spread | execution | numeric | Bid-ask spread in pips at entry |
| 13 | News Distance | context | numeric | Hours to nearest high-impact news event |
| 14 | Risk:Reward Ratio | risk | numeric | Planned risk-to-reward ratio at entry |
| 15 | Trade Duration | execution | numeric | Time in trade (minutes) |
| 16 | Position Size | risk | numeric | Risk percentage of account at entry |
| 17 | Correlation Exposure | risk | numeric | Degree of correlated open positions at entry (TQI proxy) |

---

## 10 Pre-defined Feature Interactions

| # | Combination | Description |
|---|------------|-------------|
| 1 | Strong Demand + London Session | demand_zone_quality ≥ 70 × session = london |
| 2 | Strong Supply + Trending Market | supply_zone_quality ≥ 70 × market_regime = trending |
| 3 | High Liquidity Sweep + Strong Confirmation | liquidity ≥ 65 × confirmation ≥ 65 |
| 4 | Premium Zone + High Volatility | tqi ≥ 60 × volatility = high |
| 5 | Discount Zone + Low Spread | demand_quality ≥ 60 × spread ≤ 1.5 pips |
| 6 | Strong AMD + High HTF Alignment | amd_score ≥ 65 × setup_score ≥ 70 |
| 7 | Trending Market + London/NY Session | regime = trending × session ∈ {london, new_york} |
| 8 | High RR + Strong Confirmation | rr_planned ≥ 2.0 × confirmation ≥ 65 |
| 9 | Strong AMD + London Session | amd_score ≥ 65 × session = london |
| 10 | Strong Supply + Strong Liquidity Sweep | supply_quality ≥ 70 × liquidity ≥ 65 |

---

## Confidence Methodology

The Feature Importance Engine uses statistical methods to measure the predictive value of each strategy component:

1. **Point-biserial correlation**: Linear relationship between feature value and trade outcome (win=1, loss=0).
2. **Chi-square significance**: Whether outcome distribution differs significantly across feature buckets.
3. **Wilson Score Lower Bound (90% CI)**: Conservative lower bound on true win rate, accounting for sample size.
4. **Bucket analysis**: Features divided into Low/Medium/High buckets; win rates computed per bucket.
5. **Predictive Value (0–100)**: Composite of correlation strength (40%), significance (35%), sample adequacy (25%).
6. **Reliability Score (0–100)**: Wilson lower bound × consistency factor (stability across buckets).
7. **Confidence Score (0–100)**: Blends predictive value, reliability, significance, and sample adequacy.
8. **Minimum evidence threshold**: Conclusions flagged as insufficient below 5 samples per feature.

All scores are reproducible from the same input data. No neural networks or RL agents are used.

---

_This report is advisory only. No trading parameters are modified by this analysis._  
_Engine: KRYTOS Feature Importance Engine v1.0.0 | Initialized: 2026-06-28_
