# KRYTOS V2 — Learning Engine Architecture

**Version:** 1.0.0  
**Status:** Production  
**Type:** Advisory Only — observes, measures, and learns. Never modifies trading behavior.

---

## 1. Overview

The Learning Engine continuously studies KRYTOS's historical trading memory and produces statistical learning insights. Every conclusion is explainable and backed by statistical evidence. The engine does **not** execute trades, recommend position sizing, or change any live strategy parameter.

```
Experience Collection
        ↓
  Data Validation
        ↓
  Feature Extraction
        ↓
 Statistical Analysis
        ↓
Pattern Performance Analysis
        ↓
 Confidence Calculation
        ↓
   Learning Reports
        ↓
Recommendations (stored only, never auto-applied)
```

---

## 2. Module Structure

```
lib/market-analysis/src/learning/
├── learning-core/
│   ├── types.ts              — All shared type definitions (no logic)
│   └── pipeline.ts           — 8-stage pipeline orchestrator
├── learning-analysis/
│   ├── feature-extractor.ts  — Normalises raw DB rows → ExtractedFeature objects
│   └── statistical-analyzer.ts — Distributions, Pearson correlations, skipped-setup insights
├── learning-metrics/
│   └── metrics-calculator.ts — 18+ pure-function metrics (reproducible)
├── learning-confidence/
│   └── confidence-engine.ts  — Wilson score lower bound + consistency + data quality
├── learning-history/
│   └── history-store.ts      — Append-only in-process cycle store (never overwrites)
├── learning-reports/
│   └── report-generator.ts   — Recommendations, cycle summaries, comparison reports
├── learning-validation/
│   └── data-validator.ts     — Input validation with completeness scoring
└── index.ts                  — Barrel export
```

---

## 3. Pipeline Stages

### Stage 1 — Data Validation
- Validates all raw trade records from `trade_memory` table
- Rejects records without a closed outcome
- Scores data completeness 0–100 across 10 fields per record
- Issues warnings for sparse regime / R:R data
- Minimum 3 usable records to proceed (10 for full analysis)

### Stage 2 — Feature Extraction
- Converts DB rows into typed `ExtractedFeature` objects
- Normalises pair, session, regime, outcome to canonical enum values
- Derives supply quality (zone score for sell trades), demand quality (zone score for buy trades)
- Derives volatility from regime + confidence proxy
- Stored separately for future ML pipeline consumption

### Stage 3 — Statistical Analysis
- Computes 12 numeric feature distributions (mean, median, std, p25/p75, skewness)
- Computes 10 Pearson correlation pairs (e.g., setupScore vs rrActual)
- Significance threshold: |r| > 0.3 AND n ≥ 10
- Analyses skipped setup patterns by rejecting rule and pair
- Analyses manual review data (ratings, rule adherence rate)

### Stage 4 — Metrics Calculation (Pattern Performance Analysis)
All metrics are pure functions — identical inputs always produce identical outputs.

| Metric | Formula |
|--------|---------|
| Win Rate | wins / totalTrades |
| Loss Rate | losses / totalTrades |
| Avg R:R | mean(rrActual) |
| Avg Duration | mean(tradeDurationMins) |
| Profit Factor | grossProfit / grossLoss |
| Expectancy | winRate × avgWin − lossRate × avgLoss |
| Max Drawdown % | peak-to-trough / peak × 100 (chronological equity curve) |
| Recovery Factor | totalPnl / maxDrawdown |
| Sharpe Ratio | (meanReturn − 0) / stdReturn |
| Sortino Ratio | (meanReturn − 0) / downsideStdDev |

**Dimensional breakdowns:** pair, session, regime, zone quality, liquidity, AMD, confirmation quality, volatility.

**Histograms:** confidence distribution (5 bins), R:R distribution (5 bins), duration distribution (5 bins).

### Stage 5 — Confidence Calculation

#### Methodology: Wilson Score Lower Bound

```
p̂ = observed win rate (wins / n)
z = 1.645  (90% CI)

wilsonLower = (p̂ + z²/2n − z·√((p̂(1−p̂) + z²/4n)/n)) / (1 + z²/n)
```

This gives a **conservative lower estimate** that:
- Automatically increases with more evidence
- Automatically decreases with sparse data
- Accounts for sample size without requiring a fixed formula

#### Composite Confidence Score

| Factor | Weight | Description |
|--------|--------|-------------|
| Wilson Lower Bound | 50% | Conservative 90% CI lower bound |
| Data Quality | 25% | Completeness score from Stage 1 |
| Consistency | 15% | Stability of win rate across sub-segments |
| Sample Adequacy | 10% | n / 30 (asymptotically approaches 1) |

**Confidence Tiers:**
- `insufficient` — n < 5 (no estimate)
- `low` — score < 30%
- `moderate` — score 30–50%
- `high` — score 50–75%
- `very_high` — score ≥ 75%

**Minimum sample:** 5 records for any estimate. Recommended: 30 records for reliable analysis.

### Stage 6 — Report Generation & Recommendations

Recommendations are generated for:
1. **Pair Performance** — pairs with win rate < 35% or > 65% (evidence-based)
2. **Session Timing** — sessions with win rate < 30%
3. **Regime Filter** — regimes with negative expectancy (PF < 1.0)
4. **Score Threshold** — low zone quality trades underperforming
5. **Data Quality** — completeness below 60%
6. **Sample Size** — fewer than 30 closed trades

Each recommendation includes:
- `category`, `title`, `description`
- `evidence` — exact statistical values backing the claim
- `confidence` — inherited from the relevant segment's confidence score
- `priority` — low / medium / high
- `isAdvisoryOnly: true` — always set, cannot be changed

### Stage 7 — History Storage
- Cycle persisted to in-process `HistoryStore` (Map, 100-cycle rolling window)
- Cycle persisted to PostgreSQL `learning_cycles` table (append-only)
- Extracted features persisted to `learning_features` table (append-only)
- **Never overwrites previous learning** — all historical cycles preserved

---

## 4. Learning Inputs

| Source | Table | Usage |
|--------|-------|-------|
| Trade Memory | `trade_memory` | Primary input — scores, outcomes, durations |
| Skipped Setups | `skipped_setup_memory` | Rejection pattern analysis |
| Manual Reviews | `trade_reviews` | Rule adherence + rating analysis |
| Setup Confidence | `setup_confidence_profiles` | Cluster performance (future use) |
| Market Snapshots | `market_snapshot_memory` | Context (future use) |

---

## 5. API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/learning-engine/run` | Trigger a learning cycle |
| GET | `/api/learning-engine/dashboard` | All-in-one dashboard data |
| GET | `/api/learning-engine/latest` | Latest cycle full detail |
| GET | `/api/learning-engine/history` | Paginated cycle history |
| GET | `/api/learning-engine/cycle/:id` | Single cycle by ID |
| GET | `/api/learning-engine/compare` | Compare last two cycles |
| GET | `/api/learning-engine/metrics/trend` | Win rate + confidence trend |
| GET | `/api/learning-engine/features/summary` | Feature summary for latest cycle |
| GET | `/api/learning-engine/recommendations` | Latest advisory recommendations |
| GET | `/api/learning-engine/statistics` | Statistical analysis output |
| GET | `/api/learning-engine/status` | Quick status check |

---

## 6. Database Schema

### `learning_cycles`
Append-only. One row per learning cycle. Contains denormalised metrics for fast dashboard queries plus full JSONB payloads for complete cycle reconstruction.

### `learning_features`
One row per extracted feature per cycle. Stored separately for future ML pipeline consumption. Includes all 18 normalised feature fields.

---

## 7. Scalability

### Current Capacity
- Handles 5,000 trade records per cycle in < 200ms (pure in-process computation)
- DB inserts are batched (100 rows per batch)
- In-process history store: 100-cycle rolling window (FIFO eviction)

### Scaling Path
1. **More trades:** The pipeline scales linearly — O(n) for metrics, O(n²) for correlations (capped at 10 pairs)
2. **Scheduled cycles:** Add a cron scheduler in the API server (interval configurable)
3. **More features:** Add new fields to `ExtractedFeature` type + `NUMERIC_FEATURES` array — no other changes needed
4. **More metrics:** Add pure functions to `metrics-calculator.ts` + expose in the API

### No Breaking Changes Required For:
- Adding new pair/session/regime breakdowns (automatic via `segmentBy`)
- Adding new confidence factors (add to `factors` array in confidence engine)
- Adding new recommendation categories (add to `generateRecommendations`)

---

## 8. Future AI Integration

The Learning Engine is explicitly designed as the **foundation layer** for future AI/ML modules. Integration points are clearly marked but **not active**:

### Ready-Made Integration Points

| Field | Purpose | Status |
|-------|---------|--------|
| `learning_features` table | Feature vectors for future ML training | Ready — populated now |
| `memory_experiences.featureVector` | 10-dim numeric feature array | Reserved (not computed) |
| `memory_experiences.embeddingPlaceholder` | Future embedding model metadata | Reserved (not populated) |
| `memory_experiences.similarityMetadata` | Future k-NN lookup | Reserved (not computed) |

### What Would Be Added (Future)
1. **Supervised learning:** Use `learning_features` table as training set (outcome as label)
2. **Pattern clustering:** k-means on feature vectors to discover setup archetypes
3. **Embedding models:** Encode trade narratives as vectors for similarity search
4. **Online learning:** Update weights incrementally as new trades arrive

### What Will NOT Be Added
- Neural networks controlling live trading parameters
- Autonomous trade execution or modification
- Reinforcement learning that changes position sizing in real-time
- Any AI that operates without explicit human review of recommendations

---

## 9. Rules

The Learning Engine enforces these invariants by design:

1. **No trade execution** — routes are read-only or trigger analysis only
2. **No strategy modification** — no writes to `bot_state`, `weight_profiles`, or any live trading table
3. **Recommendations are advisory only** — `isAdvisoryOnly: true` is a type-level constant
4. **All calculations are reproducible** — pure functions, no randomness
5. **History is never overwritten** — append-only storage at every level
6. **Confidence requires evidence** — Wilson score automatically returns 0 for n < 5
7. **No neural networks** — only explainable statistical methods (Wilson score, Pearson correlation, stdDev)

---

## 10. Testing

Test coverage targets:

| Module | Tests | Coverage |
|--------|-------|---------|
| Data Validator | Input validation, edge cases, completeness scoring | ✅ |
| Feature Extractor | Normalisation, direction mapping, derived fields | ✅ |
| Metrics Calculator | All 18+ metrics, drawdown, Sharpe, Sortino | ✅ |
| Confidence Engine | Wilson score, tiers, factors, full report | ✅ |
| Statistical Analyzer | Distributions, Pearson r, skipped setup insights | ✅ |
| Pipeline | End-to-end, failure modes, stage tracking | ✅ |
| Report Generator | Recommendations, comparisons, summary text | ✅ |
| History Store | Append-only, eviction, serialisation | ✅ |

Target: institutional-grade reliability — all metrics verified against known hand-calculated values.

---

*Generated by KRYTOS V2 Learning Engine — June 2026*
