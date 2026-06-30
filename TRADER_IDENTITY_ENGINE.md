# Trader Identity & Strategy Consistency Engine

**Version:** 1.0.0  
**Phase:** 5 — Prompt 3/5  
**Classification:** Advisory Only — No Strategy Modification  
**Date:** 2026-06-30

---

## Overview

The Trader Identity Engine builds a dynamic model of the operator's trading style by starting from the deterministic strategy rules and gradually incorporating statistically verified behavioral patterns over time. It never modifies the live trading strategy. Every conclusion is observational only.

---

## Identity Learning Stages

### Stage 1 — Rule Identity (Always Active)

Before sufficient trade history exists, the identity is defined entirely by the deterministic strategy:

| Rule | Weight | Description |
|------|--------|-------------|
| Supply & Demand Zone Quality | 15% | Average supply/demand zone score |
| Premium / Discount Framework | 12% | Bias alignment to premium/discount zones |
| Liquidity Sweep Confirmation | 14% | Smart-money sweep signature |
| AMD Sequence Completeness | 15% | Accumulation/Manipulation/Distribution |
| Confirmation Signal Quality | 13% | Reversal/continuation signal strength |
| Overall Setup Score Threshold | 12% | Minimum quality threshold |
| Trade Quality Index (TQI) Gate | 12% | V2 TQI gate (≥65) |
| Risk-to-Reward Minimum | 8% | Minimum 1.5 R:R |
| Spread / Execution Cost | 9% | Spread ≤3 pips |

### Stage 2 — Adaptive Identity (Unlocks at 20 Verified Trades)

Once sufficient history exists, the engine discovers statistically significant preferences:

- **Preferred Currency Pairs** — pairs with consistent positive win-rate lift
- **Preferred Sessions** — London, New York, Overlap performance differentials
- **Preferred Market Regimes** — trending, ranging, volatile, low-volatility
- **Preferred Volatility** — low, medium, high performance patterns
- **Preferred Trend Conditions** — bullish, bearish, neutral performance
- **Zone Quality Preferences** — high-quality (≥70) vs standard zones
- **Hold Duration Preferences** — short (<1h), medium (1-4h), long (>4h)

**Adoption criteria:**
- Minimum 8 trades per sub-group
- Cohen's h effect size threshold: 0.3+ 
- Confidence score ≥65%
- Win-rate lift vs baseline ≥5pp

---

## Identity Similarity Analysis

For every setup, four scores are computed:

| Score | Weight (Stage 1) | Weight (Stage 2) |
|-------|-----------------|-----------------|
| Rule Similarity | 70% | 45% |
| Historical Similarity | 30% | 30% |
| Preference Alignment | 0% | 25% |
| **Identity Similarity** | **100%** | **100%** |

### Consistency Levels

| Level | Threshold | Description |
|-------|-----------|-------------|
| Fully Consistent | ≥85 | All major dimensions aligned |
| Mostly Consistent | ≥70 | Strong alignment, minor deviations |
| Partially Consistent | ≥55 | Mixed — notable gaps present |
| Weakly Consistent | ≥40 | Shares some characteristics only |
| Inconsistent | <40 | Diverges from established identity |

---

## Preference Discovery

Preferences are discovered automatically using:

1. **Sub-group segmentation** — trades grouped by pair, session, regime, volatility, trend
2. **Win-rate comparison** — sub-group win rate vs overall baseline
3. **Cohen's h effect size** — measures statistical significance of difference
4. **Wilson Lower Bound** — conservative win-rate estimate at 90% confidence
5. **Confidence scoring** — combined sample-size and effect-size factor

Only preferences with isSignificant=true are adopted into the identity.

---

## Drift Detection

The engine monitors long-term behavioral change by splitting trade history at the midpoint and comparing:

| Dimension | Drift Type |
|-----------|-----------|
| Win Rate | consistency_drift |
| Setup Score | consistency_drift |
| TQI | consistency_drift |
| Average R:R | learning_drift |
| Liquidity Score | consistency_drift |
| Preferred Pair | preference_drift |
| Preferred Session | preference_drift |
| Preferred Regime | market_adaptation |
| Preferred Volatility | preference_drift |
| Preferred Trend | market_adaptation |

**Severity thresholds:**

| Severity | Drift Score |
|----------|-------------|
| Critical | ≥75 |
| High | ≥55 |
| Medium | ≥35 |
| Low | <35 |

Alerts only generated for statistically significant events (effect ≥0.2, change ≥10%).

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/identity/profile` | Current identity profile (auto-saves version) |
| POST | `/api/identity/similarity` | Evaluate setup against identity |
| GET | `/api/identity/similarity` | List recent similarity reports |
| GET | `/api/identity/preferences` | Discovered preferences with stats |
| GET | `/api/identity/drift` | Drift detection report |
| GET | `/api/identity/history` | Identity version timeline |
| GET | `/api/identity/report` | Full comprehensive summary |
| GET | `/api/identity/statistics` | Aggregate statistics |

---

## Database Schema

| Table | Purpose |
|-------|---------|
| `ti_identity_profiles` | Versioned identity snapshots |
| `ti_similarity_reports` | Per-setup similarity evaluations |
| `ti_preference_discoveries` | Statistical preference evidence |
| `ti_drift_events` | Detected behavioral drift events |
| `ti_identity_versions` | Lightweight version timeline |

---

## Engine Architecture

```
lib/market-analysis/src/learning/trader-identity/
├── types.ts                  # All interfaces, constants, helpers
├── rule-identity.ts          # Stage 1 — 9 rule checks
├── preference-analyzer.ts    # Stage 2 — statistical preference discovery
├── similarity-calculator.ts  # Rule, historical, preference, composite scores
├── consistency-evaluator.ts  # Consistency verdict with evidence
├── drift-detector.ts         # Rolling-window drift analysis
├── report-generator.ts       # Identity narrative builder
├── identity-engine.ts        # Main orchestrator
└── index.ts                  # Public API exports
```

---

## Validation

- Identity consistency: Stage transitions validated against MIN_SAMPLE_FOR_ADAPTIVE
- Statistical confidence: Cohen's h + Wilson LB + sample-size factor
- Preference stability: Minimum 8 trades per sub-group required
- Drift detection: Requires 20+ trades (10 per half-window)
- Version integrity: Every profile load creates a versioned snapshot
- Historical reproducibility: Cosine similarity is deterministic for fixed inputs

---

## Advisory Guarantee

This engine is **permanently advisory only**. The codebase enforces this at multiple levels:

1. `isAdvisoryOnly: true` hardcoded on every report type
2. No route connects to paper-engine, broker-engine, or bot-state
3. No mechanism to modify strategy weights, thresholds, or rules
4. All preference adoption is observational only
5. Drift alerts are informational — no automatic action taken
