# Strategy Quality Intelligence Engine
## Architecture & Methodology

**Version:** 1.0.0  
**Status:** Advisory Only — No Strategy Modification  
**Classification:** KRYTOS Phase 5 — Quality Intelligence

---

## Overview

The Strategy Quality Intelligence Engine (SQI Engine) evaluates every valid trading setup using a comprehensive multi-factor scoring system across 7 intelligence components. The result is a unified **Strategy Quality Score (SQS)** from 0–100 and a **Quality Classification** from Reject to Institutional Grade.

The engine answers:
- How good is this setup?
- How complete is this setup?
- How rare is this setup?
- How reliable has this setup been historically?
- Which components make this setup stronger or weaker?

---

## Architecture

```
QualitySetup Input
    │
    ├── Rule Integrity Evaluator          (15%)
    ├── Structural Quality Analyzer       (18%)
    ├── Liquidity Intelligence Analyzer   (15%)
    ├── AMD Intelligence Analyzer         (15%)
    ├── Confirmation Intelligence Analyzer(12%)
    ├── Market Intelligence Integrator    (15%)
    └── Historical Intelligence Analyzer  (10%)
                │
                ▼
         SQS Calculator
         (Weighted composite 0–100)
                │
                ▼
         Quality Classifier
         (7-tier classification)
                │
                ▼
         StrategyQualityReport
```

---

## Component Weights (SQS_WEIGHTS)

| Component               | Weight | Rationale |
|-------------------------|--------|-----------|
| Rule Integrity          | 15%    | Foundation — rules must be satisfied before quality matters |
| Structural Quality      | 18%    | Highest weight — structure is the backbone of ICT/SMC |
| Liquidity Intelligence  | 15%    | Liquidity is the driver of institutional movement |
| AMD Intelligence        | 15%    | AMD sequence confirms institutional intent |
| Confirmation Intelligence | 12%  | Entry timing signal quality |
| Market Intelligence     | 15%    | Macro/session context affects probability |
| Historical Intelligence | 10%    | Statistical backing from past similar setups |

---

## Component Descriptions

### 1. Rule Integrity (15%)
Evaluates the completeness, strictness, and alignment of strategy rules:
- **Completeness**: What percentage of optional enrichment fields are populated
- **Strictness**: How many rules pass at exceptional vs barely-passed level
- **Alignment**: Whether rules are coherent with the current market regime
- **Confidence**: Overall confidence in rule evaluation

### 2. Structural Quality (18%)
Evaluates the market structure supporting the setup:
- HTF Alignment (20%)
- S/R Strength (15%)
- Premium/Discount Positioning (15%)
- Supply/Demand Quality (20%)
- Zone Freshness (15%)
- Zone Respect (10%)
- Market Structure Cleanliness (5%)

### 3. Liquidity Intelligence (15%)
Evaluates the institutional liquidity footprint:
- Sweep Size (20%)
- Sweep Clarity (25%)
- Stop Hunt Quality (20%)
- Manipulation Clarity (20%)
- Distribution Strength (15%)

### 4. AMD Intelligence (15%)
Evaluates the Accumulation-Manipulation-Distribution sequence:
- Accumulation Quality (20%)
- Manipulation Quality (20%)
- Distribution Quality (20%)
- AMD Sequence Completeness (25%)
- AMD Confidence (15%)

### 5. Confirmation Intelligence (12%)
Evaluates the entry signal quality:
- Candle Strength (20%)
- Momentum (18%)
- Candle Body Ratio (15%)
- Break Strength (20%)
- Displacement (17%)
- Follow-Through Probability (10%)

### 6. Market Intelligence (15%)
Synthesises all market context signals:
- Health (18%) · Context (15%) · Opportunity (18%) · Stability (12%)
- Trend Quality (15%) · Volatility Quality (10%) · Liquidity Quality (7%) · Correlation (5%)

### 7. Historical Intelligence (10%)
Statistical evidence from similar past setups:
- Similarity Score (20%)
- Win Rate Score (30%)
- RR Score (20%)
- Pattern Rank (10%)
- Feature Importance (10%)
- Evidence Volume (10%)

---

## Quality Classification

| Classification       | SQS Range | Description |
|---------------------|-----------|-------------|
| Institutional Grade  | 90–100    | All dimensions at elite quality — mirrors institutional criteria |
| Elite                | 80–89     | Outstanding multi-dimensional quality |
| Excellent            | 70–79     | High quality with minor weaknesses |
| Strong               | 60–69     | Above average with clear strengths |
| Average              | 45–59     | Meets minimum standards |
| Weak                 | 25–44     | Below standard across multiple dimensions |
| Reject               | 0–24      | Fails critical evaluation dimensions |

---

## Scoring Inference

When optional sub-scores are not provided, the engine infers component values from the available core scores using statistically grounded heuristics:
- HTF Alignment ← regime + trend coherence + TQI
- Zone Freshness ← regime + setup score + liquidity score
- Sweep Clarity ← AMD score + liquidity score + confirmation quality
- Market Health ← regime + session + spread penalty

Providing optional sub-scores always overrides inference, improving accuracy.

---

## Advisory Constraint

```
isAdvisoryOnly: true  ← hard-coded, never overridable
```

The SQI Engine:
- ✅ Evaluates setup quality objectively
- ✅ Returns transparent, explainable scores
- ✅ Stores historical quality data
- ❌ Never modifies strategy parameters
- ❌ Never adjusts risk or position sizing
- ❌ Never executes trades
- ❌ Never uses reinforcement learning or neural networks

---

## Database Schema

| Table           | Purpose |
|-----------------|---------|
| `sqi_reports`   | Full quality report per evaluated setup |
| `sqi_timeline`  | Lightweight time-series for trend analysis |

---

## API Endpoints

| Method | Path                           | Purpose |
|--------|-------------------------------|---------|
| POST   | /api/strategy/quality          | Evaluate a setup |
| GET    | /api/strategy/quality          | List recent reports |
| GET    | /api/strategy/quality/:id      | Full report by ID |
| GET    | /api/strategy/quality-history  | Timeline |
| GET    | /api/strategy/component-scores | Average component scores |
| GET    | /api/strategy/classifications  | Classification distribution |
| GET    | /api/strategy/statistics       | Aggregate statistics |
