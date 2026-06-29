# Market Context Intelligence Engine — Architecture Report

Generated: 2026-06-29

---

## 1. Architecture Overview

The Market Context Intelligence Engine (MCIE) is a read-only intelligence layer that answers a single question:

> **How favorable is the current market environment, based on historical evidence?**

It observes — never modifies — trading strategy, risk management, or learning/decision systems.

### Module Structure

```
lib/market-analysis/src/context/
├── types.ts                  — All TypeScript types + constants
├── performance-analyzer.ts   — Historical trade performance by condition dimension
├── context-scorer.ts         — Market Context Score (MCS) weighted composition
├── historical-matcher.ts     — Structured feature-similarity matching
├── stability-analyzer.ts     — Market stability measurement
├── environment-classifier.ts — Environment classification (Excellent → Dangerous)
├── market-context.ts         — Main builder (FullMarketContext output)
└── __tests__/
    ├── performance-analyzer.test.ts
    ├── context-scorer.test.ts
    ├── historical-matcher.test.ts
    ├── stability-analyzer.test.ts
    ├── environment-classifier.test.ts
    └── market-context.test.ts
```

### Database Tables

| Table | Purpose |
|---|---|
| `market_context_snapshots` | Stores every computed MCS with all component scores |
| `market_context_profiles` | Aggregated performance profiles per condition dimension |

Both tables are append-only. No strategy data is written.

---

## 2. Performance Analyzer

### Data Source
The performance analyzer reads from the `trades` table, filtering to closed trades only. It extracts:

| Field | Source |
|---|---|
| `regime` | `trades.regime` |
| `session` | `trades.session` |
| `direction` | `trades.direction` |
| `newsStatus` | `trades.news_status` |
| `spreadPips` | `trades.spread_pips` |
| `pnl` | `trades.pnl` |
| `riskRewardRatio` | `trades.risk_reward_ratio` |
| `trendDirection` | From associated market snapshot (optional) |
| `volatilityClass` | From associated market snapshot (optional) |
| `liquidityQuality` | From associated market snapshot (optional) |

### Dimensions Analyzed

| Dimension | Conditions |
|---|---|
| Regime | trending, ranging, volatile, low_volatility, transitioning |
| Session | london, new_york, tokyo, sydney, off_hours |
| Trend Direction | bullish, bearish, neutral, strong_bullish, strong_bearish |
| Volatility | very_low, low, medium, high, very_high, extreme |
| Liquidity | excellent, good, fair, poor |
| Correlation Risk | low, moderate, high, extreme |
| News Status | safe, cautious, blocked |
| Day of Week | monday – friday |
| Month | january – december |
| Spread Band | tight_spread, normal_spread, wide_spread, very_wide_spread |

### Statistics Computed Per Condition

| Metric | Formula |
|---|---|
| Win Rate | `wins / total × 100` |
| Loss Rate | `losses / total × 100` |
| Average RR | `sum(RR) / n` |
| Profit Factor | `gross_profit / gross_loss` |
| Expectancy | `(winRate × avgWinRR) − (lossRate × avgLossRR)` |
| Max Drawdown | Peak-to-trough equity curve percentage |
| Confidence Score | Wilson score lower bound (z=1.645) |

### Wilson Confidence Score

Used throughout the engine to prevent small sample sizes from generating misleading statistics:

```
score = (p̂ + z²/2n − z√(p̂(1−p̂)/n + z²/4n²)) / (1 + z²/n) × 100
```

Where `p̂ = wins/n` and `z = 1.645` (90% confidence interval).

---

## 3. Market Context Score (MCS)

### Definition

The MCS is a single 0–100 integer representing how favorable the current market environment is, based on historical trade performance under similar conditions.

### Component Weights

| Component | Dimension | Weight |
|---|---|---|
| Regime Performance | regime | 20% |
| Session Performance | session | 15% |
| Trend Performance | trend | 15% |
| Volatility Performance | volatility | 15% |
| Liquidity Performance | liquidity | 10% |
| Correlation Risk | correlation | 10% |
| News Context | news | 10% |
| Historical Confidence | data volume | 5% |

**Total: 100%**

### Component Score Formula

For performance-based components (regime, session, trend, volatility, liquidity):
```
score = winRate × 0.6 + (50 + rrBonus + pfBonus − ddPenalty) × 0.4
rrBonus = clamp((avgRR − 1.0) × 20, −20, +20)
pfBonus = clamp((profitFactor − 1.0) × 5, −10, +10)
ddPenalty = min(15, maxDrawdown × 0.3)
```

For rule-based components (correlation, news):
- News: `safe=80, cautious=45, blocked=15`
- Correlation: `low=80, moderate=60, high=35, extreme=15`

### Fallback Behavior

When `sampleSize < 5` for any performance component, that component scores **50 (neutral)** with **0% confidence** — ensuring the engine produces stable output even before meaningful trade history accumulates.

---

## 4. Historical Comparison — Structured Feature Matching

### Feature Vector

Each market state snapshot is characterized by 8 features:

| Feature | Type | Weight |
|---|---|---|
| Market Regime | Categorical | 28% |
| Trend Direction | Categorical | 22% |
| Volatility Classification | Categorical | 18% |
| Trading Session | Categorical | 14% |
| Liquidity Quality | Categorical | 8% |
| News Environment | Categorical | 6% |
| Trend Strength | Numeric [0–100] | 2% |
| Volatility Percentile | Numeric [0–100] | 2% |

### Similarity Computation

```
similarity = Σ (weight_i × sim_i)  × 100

Categorical sim: 1.0 if match, 0.0 otherwise
Numeric sim: max(0, 1 − |a − b| / range)
```

### Output per Match

| Field | Description |
|---|---|
| `date` | Date of historical period |
| `pair` | Trading pair |
| `regime` | Market regime |
| `trendDirection` | Trend direction |
| `volatilityClassification` | Volatility class |
| `session` | Trading session |
| `similarityScore` | 0–100 similarity percentage |
| `outcome` | profitable / losing / neutral / unknown |
| `confidence` | Original snapshot confidence score |

---

## 5. Market Stability Analysis

### Window

Analyzes the last **20 market state snapshots** to measure stability across 4 dimensions.

### Stability Measures

| Measure | Algorithm | Warning Threshold |
|---|---|---|
| Regime Stability | % of recent snapshots matching current regime | < 50% or ≥ 3 unique regimes |
| Trend Stability | % of recent snapshots matching current trend direction | Flip rate > 40% |
| Volatility Stability | `100 − (std_dev of volatilityPercentile)` | Std-dev > 25 |
| Liquidity Stability | `100 − std_dev(liquidityScore)` | Std-dev > 30 |

### Overall Stability

```
overallStability = regime.score × 0.30 + trend.score × 0.30
                 + volatility.score × 0.25 + liquidity.score × 0.15
```

### Labels

| Score | Label |
|---|---|
| ≥ 75 | very_stable |
| ≥ 55 | stable |
| ≥ 35 | unstable |
| < 35 | very_unstable |

---

## 6. Environment Classification

### Base Classification

| MCS Score | Classification |
|---|---|
| ≥ 80 | Excellent |
| ≥ 65 | Good |
| ≥ 45 | Neutral |
| ≥ 30 | Difficult |
| < 30 | Dangerous |

### Classification Caps (Safety Overrides)

The environment classifier applies protective caps that reduce classification based on external factors:

| Condition | Cap Applied |
|---|---|
| `stability = very_unstable` | Maximum: Neutral |
| `stability = unstable` | Maximum: Good |
| `newsEnvironment = blocked` | Maximum: Difficult |
| `correlationRisk = extreme` | Score − 10 |

These caps are **additive downward only** — they can only reduce classification, never increase it.

---

## 7. API Endpoints

| Endpoint | Description |
|---|---|
| `GET /api/market/context?pair=EURUSD` | Full market context with MCS, stability, classification, matches |
| `GET /api/market/context-score?pair=EURUSD` | MCS only (lightweight) |
| `GET /api/market/context-history?pair=EURUSD&limit=50` | Historical MCS snapshots for timeline |
| `GET /api/market/context-analysis?pair=EURUSD` | Performance by dimension (all conditions) |
| `GET /api/market/context-comparison?pair=EURUSD` | Historical match list |
| `GET /api/market/stability?pair=EURUSD` | Stability analysis only |

All endpoints accept `pair` query parameter (EURUSD, GBPUSD, USDJPY).

---

## 8. Dashboard

The Market Context dashboard (`/market-context`) provides:

| Panel | Description |
|---|---|
| MCS Gauge | Arc gauge with 8 component breakdown bars |
| Environment Classification | Large classification label + evidence list |
| Market Stability | Overall score with 4 sub-dimension bars + warnings |
| Context Timeline | Line chart of MCS score + stability over time |
| Historical Comparison | Similarity-ranked list of historical market periods |
| Performance by Dimension | Bar chart + table; switchable across 7 dimensions |
| Summary Card | Natural language summary of current context |

---

## 9. Statistical Validation

### Minimum Sample Rules

| Threshold | Usage |
|---|---|
| `MIN_SAMPLE_FOR_SCORE = 5` | Minimum trades before a condition produces a real score |
| `MIN_SAMPLE_FOR_CONFIDENCE = 20` | Target sample for full confidence |
| `STABILITY_WINDOW = 20` | Snapshots used for stability analysis |

### Fallback Guarantees

- **No trades**: All performance components score 50 (neutral), confidence = 0
- **No snapshots**: All stability measures score 50, no warnings
- **Missing conditions**: Dimension skipped gracefully
- **Zero-sample profile**: Returns `{ sampleSize: 0 }` — never divides by zero

### Wilson Score Confidence Intervals

The `confidenceScore` on every `ConditionStats` object is the **Wilson lower bound** — a conservative estimate of the true win rate. This ensures:
- Small samples with high win rates do not generate inflated confidence
- Only genuine statistical evidence lifts a condition's confidence

---

## 10. Future AI Integration

The MCIE is explicitly designed as a foundation layer for future AI enhancement:

### Phase 1 (Current — Implemented)
- Structured feature matching (no ML)
- Historical rule-based statistics
- Deterministic, fully auditable

### Phase 2 — Embedding Layer
- Replace `computeSimilarityScore()` with vector embeddings
- Market state → embedding vector (regime, trend, volatility, session, news as features)
- Store embeddings in `market_state_snapshots.embedding` (pgvector)
- `findHistoricalMatches()` uses cosine similarity against stored embeddings
- **No change to API contracts**

### Phase 3 — Regime Prediction
- Train LSTM on sequence of market state snapshots
- Predict upcoming regime transitions
- Feed predictions into stability analysis as forward-looking signals

### Phase 4 — Adaptive Weights
- `MCS_WEIGHTS` are currently static
- Phase 4 introduces per-pair weight optimization using Bayesian optimization
- Weights updated weekly from closed trade outcome feedback
- Historical performance confirms which weights correlate with actual profitability

### Integration Points for Other Engines

| Consumer | How MCIE Feeds It |
|---|---|
| Setup Evaluator | `classification` used to gate or adjust setup quality thresholds |
| Decision Intelligence | `mcs.score` added as a feature to decision context vector |
| Learning Engine | `mcs.label` stored with each trade for conditional learning |
| Risk Management | `stability.warnings` triggers position size reduction |
| Pattern Performance | `condition dimension stats` cross-referenced with pattern quality |

---

## 11. Test Coverage

| Test File | Tests | Coverage Area |
|---|---|---|
| `performance-analyzer.test.ts` | 25+ | All 10 dimension analyzers, stats correctness, edge cases |
| `context-scorer.test.ts` | 18+ | MCS computation, weights, label thresholds, component count |
| `historical-matcher.test.ts` | 14+ | Similarity scoring, filtering, sorting, outcome inference |
| `stability-analyzer.test.ts` | 12+ | All 4 stability measures, warnings, labels, edge cases |
| `environment-classifier.test.ts` | 14+ | Classification thresholds, safety caps, evidence generation |
| `market-context.test.ts` | 18+ | End-to-end builder, all pairs, blocked news, stability impact |

**Target:** Institutional-grade — deterministic, zero silent failures, all edge cases covered.
