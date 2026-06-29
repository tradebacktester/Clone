# KRYTOS Strategy Reasoning Engine

**Version:** 1.0.0  
**Phase:** 5 — Strategy Reasoning  
**Status:** Advisory Only — No trade execution, no strategy modification

---

## Overview

The Strategy Reasoning Engine is the fifth and culminating advisory layer of the KRYTOS intelligence stack. It evaluates every valid trading setup using **all accumulated knowledge** from previous KRYTOS systems — rules, history, market intelligence, patterns, and context — to explain, in human-readable form, why a setup is strong, average, or weak.

The engine produces a **Strategy Strength Score (0–100)**, a **6-tier recommendation**, and a **complete reasoning report** with full explainability. Every conclusion is supported by measurable evidence and statistical confidence.

---

## Architecture

```
lib/market-analysis/src/learning/strategy-reasoning/
├── types.ts                   — All types, constants, weights, thresholds
├── rule-evaluator.ts          — 9-rule quality grader
├── historical-reasoner.ts     — Cosine similarity + evidence statistics
├── market-support-analyzer.ts — Trend/regime/volatility/liquidity/news/stability
├── pattern-strength-analyzer.ts — Zone/sweep/AMD/confirmation scoring
├── context-strength-analyzer.ts — Session/pair/opportunity/health/history
├── strength-calculator.ts     — Unified Strategy Strength Score
├── report-generator.ts        — Factors, expectancy, risks, narrative
├── reasoning-engine.ts        — Main 10-step pipeline orchestrator
├── index.ts                   — Public API
└── __tests__/
    └── strategy-reasoning.test.ts — 50+ comprehensive tests
```

### Database

```
lib/db/src/schema/strategy-reasoning.ts
├── sr_reports           — Full reasoning report per evaluated setup
├── sr_similar_trades    — Historical trades surfaced as evidence
└── sr_history           — Audit log (created, viewed, exported)
```

### API Routes

```
artifacts/api-server/src/routes/strategy-reasoning.ts
├── POST /api/strategy/reasoning         — Evaluate setup, full report
├── GET  /api/strategy/reasoning         — List recent reports
├── GET  /api/strategy/strength          — Aggregate strength summary
├── GET  /api/strategy/report/:id        — Full report by ID
├── GET  /api/strategy/history           — Reasoning timeline
├── GET  /api/strategy/similar-trades/:id — Similar trades for report
└── GET  /api/strategy/explanation       — Engine methodology doc
```

### Dashboard

```
artifacts/dashboard/src/pages/strategy-intelligence.tsx
/strategy-intelligence — Strategy Intelligence Dashboard
```

---

## Strategy Reasoning Pipeline

For every valid setup, the engine executes 10 steps:

```
1. Rule Validation
   ↓
2. Historical Pattern Lookup
   ↓
3. Market Intelligence Review
   ↓
4. Feature Importance / Pattern Analysis
   ↓
5. Historical Similarity Search
   ↓
6. Context Evaluation
   ↓
7. Strength Assessment
   ↓
8. Confidence Calculation
   ↓
9. Reasoning Report
   ↓
10. Recommendation
```

---

## Scoring Methodology

### Component Weights

| Component           | Weight | Description |
|---------------------|--------|-------------|
| Rule Quality        | 20%    | 9 strategy rules evaluated and graded |
| Historical Evidence | 25%    | Cosine similarity, win rate, profit factor |
| Market Support      | 20%    | Trend, regime, volatility, liquidity, news |
| Pattern Strength    | 20%    | Zone, sweep, AMD, confirmation |
| Context Strength    | 15%    | Session, pair, opportunity, health |

**Strategy Strength Score = Σ(component_score × weight)**

### Rule Quality (20%)

9 rules evaluated against explicit thresholds:

| Rule                   | Threshold | Exceptional |
|------------------------|-----------|-------------|
| Zone Quality (Supply)  | 60        | 80          |
| Zone Quality (Demand)  | 60        | 80          |
| Liquidity Score        | 55        | 75          |
| AMD Quality            | 55        | 75          |
| Confirmation Quality   | 60        | 80          |
| Setup Score            | 60        | 80          |
| TQI                    | 55        | 75          |
| Risk/Reward Ratio      | 1.5       | 3.0         |
| Spread (pips)          | ≤3.0      | ≤1.0        |

Each rule is graded: **failed / barely_passed / passed / exceptional**.

### Historical Evidence (25%)

- **Cosine similarity** over 7-dimensional feature vector
- Similarity threshold: 0.72
- Metrics: win rate, average RR, profit factor, Wilson lower bound
- Sample reliability: insufficient (<5) / low (<10) / moderate (<20) / high (≥20)
- Statistical expectancy: `E = winRate × avgRR − (1 − winRate) × 1`

### Market Support (20%)

| Dimension   | Weight | Scoring |
|-------------|--------|---------|
| Trend       | 25%    | Directional conviction |
| Regime      | 20%    | trending=90, ranging=65, volatile=50 |
| Volatility  | 15%    | medium=85, high=60, extreme=30 |
| Liquidity   | 15%    | From setup liquidityScore |
| Correlation | 10%    | Provided context score |
| News        | 8%     | positive=80, neutral=65, negative=30 |
| Stability   | 7%     | Provided context score |

### Pattern Strength (20%)

| Pattern         | Weight |
|-----------------|--------|
| Zone (supply/demand composite) | 30% |
| Liquidity Sweep | 25%    |
| AMD Structure   | 25%    |
| Confirmation    | 20%    |

### Context Strength (15%)

| Context           | Weight |
|-------------------|--------|
| Session timing    | 25%    |
| Pair quality      | 15%    |
| Opportunity score | 25%    |
| Market health     | 20%    |
| Historical context (session+regime WR) | 15% |

### Confidence Adjustment

Confidence penalises the score when:
- Evidence < 5 trades: ×0.65 penalty
- Evidence < 10 trades: ×0.80 penalty
- Failed rules: −5 per failed rule
- Bonus: +5 when evidence ≥ 20 and win rate ≥ 60%

---

## Recommendation Tiers

| Tier         | Score | Label |
|--------------|-------|-------|
| Exceptional  | ≥ 90  | Exceptional Opportunity |
| Very Strong  | ≥ 75  | Very Strong Setup |
| Strong       | ≥ 60  | Strong Setup |
| Average      | ≥ 45  | Average Setup |
| Weak         | ≥ 25  | Weak Setup |
| Avoid        | < 25  | Avoid — Low Quality |

**Recommendation is advisory only. It never overrides the deterministic strategy.**

---

## Explainability

Every score includes:

- **Supporting evidence**: historical trades, feature comparisons, statistical measures
- **Historical references**: trade IDs, similarity scores, session/regime breakdown
- **Statistical confidence**: Wilson lower bound, sample size, reliability rating
- **Per-rule grading**: status (failed/barely/passed/exceptional), value vs threshold
- **Weighted decomposition**: each component score and its contribution
- **Reasoning narrative**: full human-readable multi-paragraph explanation

There are **no black-box outputs**. Every number is traceable to its inputs.

---

## Validation

### Test Coverage

The test suite covers:

1. **Rule Evaluator** — passing, barely-passed, failed, exceptional; inverted rules; bounds
2. **Historical Reasoner** — empty evidence, similarity search, win rate, reliability tiers
3. **Market Support** — trend/regime scoring, news context, missing optional data
4. **Pattern Strength** — strong/weak patterns, zone composite
5. **Context Strength** — session/pair scoring, historical context from features
6. **Strength Calculator** — score bounds, recommendation tiers, confidence penalty
7. **Recommendation Thresholds** — all 6 tiers mapped correctly
8. **Statistical Expectancy** — positive/negative/zero cases
9. **Risk Assessment** — spread risk, failed rules, low-risk detection
10. **Full Pipeline** — end-to-end, reproducibility, immutability, unique IDs

### Run Tests

```bash
node_modules/.pnpm/node_modules/.bin/tsx --test \
  lib/market-analysis/src/learning/strategy-reasoning/__tests__/strategy-reasoning.test.ts
```

---

## Advisory Constraints

The Strategy Reasoning Engine:

- ✅ Evaluates setup quality
- ✅ Provides evidence-backed reasoning
- ✅ Generates human-readable reports
- ✅ Stores reasoning history
- ✅ Surfaces historical similar trades

- ❌ Does NOT modify strategy parameters
- ❌ Does NOT change risk settings
- ❌ Does NOT execute trades
- ❌ Does NOT use reinforcement learning
- ❌ Does NOT autonomously optimize the system

---

## Integration with KRYTOS Systems

| System                | Integration |
|-----------------------|-------------|
| Rule Engine           | Rule thresholds sourced from strategy definitions |
| Memory System         | Historical feature rows via `learningFeaturesTable` |
| Learning System       | Feature vectors for cosine similarity search |
| Market Intelligence   | Market support scores (trend, regime, volatility) |
| Pattern Intelligence  | Pattern strength evaluation |
| Feature Importance    | Feature vector composition |
| Decision Intelligence | Complementary advisory layer (TIS vs SRS) |
| Unified Intelligence  | Market health and opportunity scores |

---

## Future AI Expansion

The engine is designed for future enhancement without modifying its advisory-only core:

1. **Ensemble scoring** — weight components dynamically based on historical accuracy
2. **Regime-specific weights** — different component weights per market regime
3. **Adaptive similarity threshold** — auto-adjust based on feature pool size
4. **Multi-timeframe evidence** — incorporate M15/H1/H4 historical features separately
5. **Sector correlation** — cross-pair correlation impact on context strength
6. **Explainability ranking** — rank reasoning factors by accuracy contribution
7. **Report comparison** — diff two reports to show what changed between setups
