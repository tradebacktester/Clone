# KRYTOS Strategy Reasoning Report

**Engine Version:** 1.0.0  
**Generated:** Phase 5 — Strategy Reasoning Engine  
**Status:** Advisory Only

---

## Executive Summary

The Strategy Reasoning Engine provides institutional-grade setup evaluation across 5 scored dimensions with full explainability. This report documents the scoring methodology, reasoning architecture, and validation results.

---

## Reasoning Methodology

### Setup Evaluation Flow

```
Input: StrategySetup
  └── pair, session, regime, trend, volatility
  └── supplyQuality, demandQuality, liquidityScore
  └── amdScore, confirmationQuality, setupScore, tqi
  └── rrPlanned, spreadPips
  └── [optional] trendStrength, correlationScore, stabilityScore
  └── [optional] opportunityScore, marketHealthScore, newsContext

Step 1: evaluateRules(setup)
  → 9 rules × threshold grading → ruleQualityScore (0–100)

Step 2: findSimilarHistoricalTrades(setup, features)
  → cosine similarity over feature vectors → evidenceScore (0–100)

Step 3: analyzeMarketSupport(setup)
  → 7 market dimensions weighted → marketSupportScore (0–100)

Step 4: analyzePatternStrength(setup)
  → zone + sweep + AMD + confirmation → patternStrengthScore (0–100)

Step 5: analyzeContextStrength(setup, features)
  → session + pair + opportunity + health + history → contextStrengthScore (0–100)

Step 6: calculateStrategyStrength(all 5 components)
  → weighted composite → strategyStrengthScore (0–100)

Step 7: computeConfidence(evidence, rules, score)
  → evidence-adjusted → confidenceScore (0–100)

Step 8: extractSupportingFactors(...)
  → sorted factor list → strongestFactors[], weakestFactors[]

Step 9: assessRisks(setup, rules, evidence, market)
  → riskAssessment, potentialRisks[]

Step 10: buildReasoningNarrative(...)
  → Full human-readable reasoning string

Output: StrategyReasoningReport
```

---

## Score Architecture

### Unified Strategy Strength Score

```
Strategy Strength Score (0–100) =
  Rule Quality Score        × 0.20
  + Historical Evidence Score × 0.25
  + Market Support Score      × 0.20
  + Pattern Strength Score    × 0.20
  + Context Strength Score    × 0.15
```

### Why This Weighting

| Component           | Weight | Rationale |
|---------------------|--------|-----------|
| Historical Evidence | 25%    | Empirical win rate is the strongest predictor |
| Rule Quality        | 20%    | Rules encode institutional trading knowledge |
| Market Support      | 20%    | Macro context determines setup success |
| Pattern Strength    | 20%    | SMC pattern quality is directly observable |
| Context Strength    | 15%    | Session/pair/opportunity modifies probability |

Historical evidence has the highest weight because it represents **actual measured outcomes** from similar setups — it grounds the advisory score in empirical reality rather than theory.

---

## Explainability Framework

### Every Score Is Traceable

1. **Rule Quality**
   - Each of 9 rules reports its value, threshold, exceptional threshold, and status
   - Status: `failed | barely_passed | passed | exceptional`
   - Weighted average → `ruleQualityScore`

2. **Historical Evidence**
   - Each similar trade shows: tradeId, outcome, similarity (0–1), rrActual
   - Aggregated: win rate, average RR, profit factor, Wilson lower bound
   - Reliability: `insufficient | low | moderate | high`

3. **Market Support**
   - Each of 7 dimensions has its own score and explanation
   - Component weights documented (trend 25%, regime 20%, etc.)

4. **Pattern Strength**
   - Zone composite = 70% best + 30% worst zone
   - Each component (sweep, AMD, confirmation) scored separately

5. **Context Strength**
   - Session scores from lookup table (overlap 95, london 85, etc.)
   - Pair tier from documented table (EURUSD 95, XAUUSD 85, etc.)
   - Historical context = actual win rate for session+regime combination

6. **Confidence**
   - Formula documented: score × evidence_penalty − failed_rules × 5
   - Each adjustment explained

### Supporting & Weakest Factors

The engine ranks all 12 key factors by their **deviation from neutral**:
- Factors above neutral (impact > 0) → `strongestFactors[]` (top 5)
- Factors at or below neutral (impact ≤ 0) → `weakestFactors[]` (bottom 5)

This allows the user to immediately see what is driving the recommendation and what is limiting it.

---

## Statistical Expectancy

```
E = winRate × averageRR − (1 − winRate) × 1
```

Examples:
- Win rate 65%, avg RR 2.2R → E = 0.65×2.2 − 0.35×1 = 1.43 − 0.35 = **+1.08R** per trade
- Win rate 40%, avg RR 1.5R → E = 0.40×1.5 − 0.60×1 = 0.60 − 0.60 = **0.00R** per trade
- Win rate 30%, avg RR 2.0R → E = 0.30×2.0 − 0.70×1 = 0.60 − 0.70 = **−0.10R** per trade

Only computed when evidence ≥ 5 trades. Returns 0 otherwise.

---

## Risk Assessment

The engine identifies up to 8 risk categories:

| Risk Factor              | Trigger |
|--------------------------|---------|
| Failed rules             | ruleResult.failedRules > 0 |
| Barely-passed rules      | barelyPassed ≥ 3 |
| Insufficient evidence    | evidenceCount < 5 |
| Poor historical win rate | winRate < 40% |
| High spread              | spreadPips > 2.5 |
| Extreme volatility       | volatilityScore < 45 |
| Adverse news             | newsScore < 40 |
| Low planned RR           | rrPlanned < 2.0 |
| Unfavourable regime      | regimeScore < 45 |

Risk tiers:
- 0 risks → "Low — no significant risk factors identified"
- 1–2 risks → "Moderate — minor risk factors present"
- 3–4 risks → "Elevated — multiple risk factors require attention"
- 5+ risks → "High — significant risk factors compromise setup quality"

---

## Validation Results

### Test Coverage Summary

```
Rule Evaluator Tests         — 7 tests
Historical Reasoner Tests    — 7 tests
Market Support Tests         — 7 tests
Pattern Strength Tests       — 5 tests
Context Strength Tests       — 5 tests
Strength Calculator Tests    — 6 tests
Recommendation Thresholds    — 2 tests
Statistical Expectancy       — 3 tests
Risk Assessment              — 3 tests
Full Reasoning Pipeline      — 10 tests
Pair Scoring                 — 3 tests
Supporting Factor Extraction — 1 test
─────────────────────────────────────
Total                        — 59 tests
```

### Key Validation Properties

| Property              | Test | Result |
|-----------------------|------|--------|
| Score bounds (0–100)  | ✅    | All component and composite scores clamp to 0–100 |
| Reproducibility       | ✅    | Same setup + same data → identical score |
| Immutability          | ✅    | Input setup never mutated |
| Unique report IDs     | ✅    | UUID per evaluation |
| isAdvisoryOnly=true   | ✅    | Hardcoded, always true |
| Strong > weak         | ✅    | High-quality setup outscores low-quality |
| Empty evidence        | ✅    | Graceful degradation, no crash |
| Missing optional data | ✅    | Neutral fallbacks for all optional fields |
| Weight sum = 1.0      | ✅    | STRENGTH_WEIGHTS sum to exactly 1.0 |

---

## Recommendation Rationale

The final recommendation rationale is built from 4 parts:

1. **Score statement** — "Score 74.2/100 with 68.5% confidence"
2. **Evidence statement** — Win rate, profit factor from historical trades
3. **Rule qualifier** — Failed rules or exceptional rule count
4. **Tier narrative** — Tier-specific plain English explanation

The recommendation **never overrides** the deterministic strategy. It is purely advisory and will never be connected to trade execution.

---

## API Reference

### POST /api/strategy/reasoning

**Input** (all optional except required fields):
```json
{
  "pair": "EURUSD",
  "session": "london",
  "regime": "trending",
  "trend": "bullish",
  "volatility": "medium",
  "supplyQuality": 75,
  "demandQuality": 70,
  "liquidityScore": 68,
  "amdScore": 65,
  "confirmationQuality": 72,
  "setupScore": 70,
  "tqi": 65,
  "rrPlanned": 2.5,
  "spreadPips": 1.2,
  "trendStrength": 70,
  "correlationScore": 65,
  "stabilityScore": 70,
  "opportunityScore": 68,
  "marketHealthScore": 72,
  "newsContext": "neutral"
}
```

**Output**:
```json
{
  "ok": true,
  "report": {
    "reportId": "uuid",
    "version": "1.0.0",
    "strategyStrength": {
      "strategyStrengthScore": 67.4,
      "confidenceScore": 62.1,
      "recommendation": "strong",
      "recommendationLabel": "Strong Setup",
      "components": [...]
    },
    "ruleEvaluation": { "ruleQualityScore": 71.2, "rules": [...] },
    "historicalEvidence": { "evidenceScore": 65.3, "winRate": 0.62, ... },
    "marketSupport": { "marketSupportScore": 68.1, ... },
    "patternStrength": { "patternStrengthScore": 69.5, ... },
    "contextStrength": { "contextStrengthScore": 72.0, ... },
    "strongestFactors": [...],
    "weakestFactors": [...],
    "statisticalExpectancy": 0.87,
    "riskAssessment": "Low — no significant risk factors identified",
    "potentialRisks": [],
    "reasoning": "KRYTOS Strategy Reasoning Engine v1.0 — Strong Setup\n...",
    "recommendation": "strong",
    "recommendationLabel": "Strong Setup",
    "recommendationRationale": "Score 67.4/100 with 62.1% confidence...",
    "isAdvisoryOnly": true
  }
}
```

---

## Deterministic Strategy Preservation

The Strategy Reasoning Engine is architecturally isolated from the trading strategy:

- **No imports** from paper-engine, live-engine, or bot controllers
- **No writes** to signal tables, position tables, or risk configuration
- **No callbacks** into any execution pathway
- **Advisory flag** (`isAdvisoryOnly: true`) is hardcoded and cannot be changed
- **Read-only** access to historical feature data

The engine exists solely to **explain and evaluate** — never to execute or modify.
