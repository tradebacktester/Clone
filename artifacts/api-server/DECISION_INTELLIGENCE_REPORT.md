# DECISION INTELLIGENCE REPORT

**Generated:** 2026-06-28  
**Engine Version:** 1.0.0  
**Advisory Only:** This engine NEVER executes trades or modifies strategy parameters.

---

## Executive Summary

The KRYTOS Decision Intelligence Engine (DIE v1.0.0) evaluates every detected setup against full historical evidence and generates an explainable Trade Intelligence Report. The engine operates in a strictly advisory capacity — it produces recommendations for review only, never acting on them autonomously.

**Core question answered:** "Given everything KRYTOS has learned, how does this setup compare to historical winners and losers?"

## Decision Pipeline

Every setup evaluation follows this 8-stage pipeline:

```
Current Market Snapshot
        ↓
Historical Pattern Lookup (cosine similarity matching)
        ↓
Feature Comparison (15 TIS components scored 0–100)
        ↓
Market Regime & Session Analysis
        ↓
Historical Performance Analysis (win rate, expectancy)
        ↓
Risk Context Analysis (spread, RR, volatility)
        ↓
Confidence Calculation (5-factor model)
        ↓
Trade Intelligence Report + Recommendation
```


## Trade Intelligence Score (TIS) — 0 to 100

The TIS is a weighted composite of 15 individually-scored components. Every component is independently auditable.

| # | Component | Weight | What it measures |
|---|-----------|--------|-----------------|
| 1 | patternPerformance | 10% | Historical win rate in the same session + regime combination |
| 2 | historicalWinRate | 10% | Win rate across most-similar historical setups (cosine similarity) |
| 3 | sampleSize | 5% | Adequacy of evidence — asymptotically scores toward 100 at 50+ samples |
| 4 | featureImportance | 10% | Fraction of key setup features (zone, AMD, liquidity, confirmation) in favorable range |
| 5 | confidenceScore | 8% | Average model confidence from historical trades on this pair |
| 6 | marketRegimeMatch | 8% | Historical win rate when the current market regime was active |
| 7 | sessionPerformance | 7% | Historical win rate for the current trading session |
| 8 | pairPerformance | 6% | Overall historical win rate for this currency pair |
| 9 | zoneQuality | 8% | Best of supply/demand quality score (0–100) |
| 10 | liquidityQuality | 6% | Strength of the liquidity sweep preceding the setup |
| 11 | amdQuality | 6% | Clarity of the AMD (Accumulation/Manipulation/Distribution) pattern |
| 12 | confirmationQuality | 5% | Quality of the confirmation candle at entry |
| 13 | volatility | 4% | Historical win rate in the current volatility regime |
| 14 | spread | 3% | Inverted spread score: lower spread = higher score (3+ pips = 0) |
| 15 | dataQuality | 4% | Overall historical data volume (50+ trades = 100) |

**Total weight: 100%** — scores are fully reproducible from the same input data.

## Recommendation Levels

| Level | Label | TIS Range | Meaning |
|-------|-------|-----------|---------|
| exceptional | Exceptional Opportunity | 80–100 | Setup aligns strongly with all historical success patterns |
| high_quality | High Quality | 65–80 | Most indicators favor a positive outcome |
| good_opportunity | Good Opportunity | 50–65 | More evidence for than against; warrants careful consideration |
| neutral | Neutral | 35–50 | Mixed signals — historical evidence does not favor either direction |
| low_quality | Low Quality | 20–35 | More evidence against than for; proceed with extreme caution |
| avoid | Avoid | 0–20 | Historical evidence strongly suggests avoiding this setup |


## Confidence Model

Confidence (0–100%) measures how certain we are about the TIS — distinct from the TIS itself.

**5-factor weighted confidence model:**

| Factor | Weight | Description |
|--------|--------|-------------|
| Historical Evidence | 30% | Sample size × Wilson lower bound on similar wins |
| TIS Stability | 25% | Fraction of TIS components scoring above 55 |
| Factor Agreement | 20% | Balance of positive vs negative evidence factors |
| Setup Consistency | 15% | How uniformly all quality metrics score (low spread = more consistent) |
| RR Adequacy | 10% | Planned Risk:Reward normalised to 0–1 |

**Threshold:** Recommendations below 40% confidence are flagged as low-confidence.

## Similarity Architecture

Current implementation uses **12-dimensional normalized feature vectors** with weighted cosine similarity:

``````
Vector dimensions:
  [0] supplyQuality / 100
  [1] demandQuality / 100
  [2] liquidityScore / 100
  [3] amdScore / 100
  [4] confirmationQuality / 100
  [5] setupScore / 100
  [6] tqi / 100
  [7] (rrPlanned − 0.5) / 4.5  → normalized RR
  [8] 1 − spreadPips / 5        → inverted spread
  [9] session encoding (london=1, new_york=0.7, asian=0.3)
  [10] regime encoding (trending=1, ranging=0.5, other=0.2)
  [11] volatility encoding (low=1, medium=0.5, high=0)
``````

Similarity threshold: 0.5 cosine similarity (50%+ feature alignment required).

**Future upgrade path:** Feature vectors are persisted in `di_similar_experiences.feature_vector` (JSONB).
When vector embeddings are added, the similarity search can be upgraded to use pgvector or a dedicated vector DB without schema changes.

## Explainability Design

Every recommendation includes:

- **Trade Intelligence Score** with 15 individually auditable components
- **Confidence Score** with 5-factor breakdown
- **Historical Evidence Count** — number of similar setups in the dataset
- **Similar Winning Patterns** — up to 5 most similar wins with similarity reason
- **Similar Losing Patterns** — up to 5 most similar losses with similarity reason
- **Strongest Positive Factors** — named evidence supporting the setup
- **Strongest Negative Factors** — named evidence against the setup
- **Statistical Expectancy** — avg(win_pnl) × winRate − avg(loss_pnl) × lossRate
- **Reliability Rating** — institutional/strong/moderate/weak/insufficient
- **Uncertainty Level** — very_low/low/moderate/high/very_high
- **Validation Flags** — insufficient_evidence, low_confidence, conflicting_evidence, unstable_features, high_uncertainty

**No black-box outputs.** Every number traces back to raw historical trades.

## Statistical Validation Safeguards

1. **Minimum evidence gate** — recommendations flagged as insufficient below 3 similar setups
2. **Wilson lower bound** — confidence intervals used instead of raw win rates
3. **Conflict detection** — positive/negative factor balance checked for near-parity
4. **Stability check** — TIS components with <3 evidence trades flagged as `isInsufficient`
5. **Uncertainty quantification** — 5-level uncertainty scale derived from confidence + evidence + conflict
6. **Reproducibility guarantee** — same inputs always produce same TIS (no random elements)

## Recommendation Accuracy Tracking

Every recommendation stores its `recommendationId`. When a trade closes:

- Final outcome (win/loss/break_even) is recorded against the recommendation
- Accuracy is assessed: Positive recommendations (exceptional/high/good) are accurate when the trade wins
- Accuracy rate is tracked overall and per-recommendation-level
- History is persisted in `di_recommendation_history` for retrospective analysis

## Future AI Integration Points

The engine is architected to support future AI enhancements without core changes:

| Integration Point | Current | Future |
|-------------------|---------|--------|
| Similarity search | Cosine on 12-dim feature vectors | pgvector / Pinecone on learned embeddings |
| Pattern matching | Rule-based regime/session grouping | Semantic cluster embeddings |
| Factor extraction | Threshold-based rules | Attention weights from transformer |
| Confidence model | 5-factor linear weighted | Bayesian calibrated neural confidence |
| Expectancy estimate | Geometric average of similar trades | Monte Carlo with learned distributions |


## Database Schema

| Table | Purpose |
|-------|---------|
| `di_recommendations` | One row per evaluated setup — full TIS, factors, evidence |
| `di_similar_experiences` | Up to 5 wins + 5 losses per recommendation |
| `di_recommendation_history` | Append-only audit log with outcome tracking |


---

_KRYTOS Decision Intelligence Engine v1.0.0 — Advisory only. No trades are executed automatically._