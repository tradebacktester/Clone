# Strategy Quality Intelligence Engine — Technical Report

## Executive Summary

The Strategy Quality Intelligence Engine (SQI Engine) is a comprehensive multi-factor advisory system that objectively measures the quality of every valid KRYTOS trading opportunity. It produces a Strategy Quality Score (SQS) from 0–100 by synthesising 7 intelligence components, each grounded in SMC/ICT trading methodology and statistical evidence.

The engine is strictly advisory: it never modifies the live strategy, adjusts risk parameters, or executes trades.

---

## Scoring Architecture

### Strategy Quality Score (SQS)

SQS = Σ(component_score × component_weight)

Where weights sum to exactly 1.00:
- Rule Integrity:            15%
- Structural Quality:        18%
- Liquidity Intelligence:    15%
- AMD Intelligence:          15%
- Confirmation Intelligence: 12%
- Market Intelligence:       15%
- Historical Intelligence:   10%

### Score Interpretation

| SQS Range | Classification       | Meaning |
|-----------|---------------------|---------|
| 90–100    | Institutional Grade  | Mirrors hedge-fund execution criteria |
| 80–89     | Elite                | Professional-grade multi-dimensional quality |
| 70–79     | Excellent            | High quality; minor weaknesses only |
| 60–69     | Strong               | Above average; one or two weak dimensions |
| 45–59     | Average              | Meets minimum thresholds; lacks conviction |
| 25–44     | Weak                 | Multiple dimensions below standard |
| 0–24      | Reject               | Fails critical evaluation criteria |

---

## Statistical Methodology

### Historical Intelligence — Cosine Similarity
Feature vector: [supplyQuality, demandQuality, liquidityScore, amdScore, confirmationQuality, setupScore, tqi, marketHealth]

Similarity threshold: 0.70 (balances precision and recall)
Maximum sample: 30 most similar trades

### Win Rate → Score
score = clamp(winRate × 100, 0, 100)
Gated on minimum evidence of 5 trades.

### Evidence Volume Score
score = clamp(n / 20 × 100, 0, 100)
Reaches 100 at 20+ comparable historical trades.

### Statistical Expectancy
E[RR] = winRate × avgWinRR - (1 - winRate) × avgLossRR

### Wilson Lower Bound
Provides a statistically conservative estimate of true win rate:
WLB = (p̂ + z²/2n - z√(p̂(1-p̂)/n + z²/4n²)) / (1 + z²/n)
where z = 1.96 (95% confidence)

---

## Component Weighting Rationale

**Structural Quality (18% — highest)**: Market structure is the foundation of ICT/SMC methodology. Without HTF alignment, zone quality, and premium/discount positioning, no entry signal has a strong probability basis.

**Rule Integrity / Liquidity Intelligence / AMD Intelligence / Market Intelligence (15% each)**: These four dimensions are equally critical and must all align for an institutional-grade setup. No single factor dominates.

**Confirmation Intelligence (12%)**: Confirmation is the final filter before entry but is slightly less predictive than structural and liquidity factors.

**Historical Intelligence (10%)**: Statistical evidence supplements but does not dominate the score. Insufficient historical data should reduce confidence, not invalidate the setup entirely.

---

## Inference Fallbacks

When optional sub-scores are not provided, the engine infers values using proven proxies:

| Missing Field | Inference Method |
|---------------|-----------------|
| HTF Alignment | regime + trend + TQI |
| Zone Freshness | regime + setupScore + liquidityScore |
| Sweep Clarity | amdScore + liquidityScore + confirmationQuality |
| Stop Hunt Quality | amdScore + liquidityScore |
| AMD Completeness | amdScore + confirmationQuality + liquidityScore |
| Follow-Through Prob | rrPlanned + regime |
| Market Health | regime + session + spread |

Inference-based scores are clearly less accurate than explicit inputs. Providing optional sub-scores always improves accuracy.

---

## Validation Criteria

| Test | Target |
|------|--------|
| Score consistency | Same inputs → identical SQS |
| Weight normalisation | SQS_WEIGHTS sum = 1.000 ± 0.001 |
| Score bounds | All component and SQS scores ∈ [0, 100] |
| Classification accuracy | 7 tiers correctly mapped |
| Strong > Weak | Strong setups always outscore equivalent weak setups |
| Advisory enforcement | isAdvisoryOnly = true, never overridable |
| Historical reproducibility | Same features → same historical score |
| Sample size flagging | Insufficient evidence (<5 trades) flagged |

---

## Production Reliability

- All numeric outputs are clamped to [0, 100] at every computation step
- Inference fallbacks ensure no null/undefined outputs on partial input
- Advisory-only invariant enforced at engine level AND route level
- DB schema uses NUMERIC precision types (not FLOAT) to avoid accumulation errors
- All DB operations are fire-and-forget (non-blocking) from the API response path
