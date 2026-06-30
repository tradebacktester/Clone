# Strategy Consistency Report

**Engine:** Trader Identity & Strategy Consistency Engine v1.0.0  
**Date:** 2026-06-30  
**Classification:** Advisory Only

---

## Consistency Framework

### What is Strategy Consistency?

Strategy consistency measures how closely each valid setup aligns with the established trader identity. A consistent setup follows the core rules AND matches patterns that have historically worked for this specific operator.

### Consistency Levels

#### Fully Consistent (≥85/100)
All major identity dimensions are aligned:
- All 9 core rules satisfied (or very minor deviations)
- Historical cosine similarity to similar winning trades is high
- Preferred pairs, sessions, and regimes all match identity

#### Mostly Consistent (≥70/100)
Strong alignment with minor deviations:
- 7-8 of 9 core rules satisfied
- Good historical similarity
- Most preferences aligned, 1-2 mismatches

#### Partially Consistent (≥55/100)
Mixed identity alignment:
- 5-6 of 9 core rules satisfied
- Moderate historical similarity
- Notable gaps in preference alignment

#### Weakly Consistent (≥40/100)
Setup shares some characteristics but diverges significantly:
- 3-4 of 9 core rules satisfied
- Low historical similarity to established patterns
- Multiple preference mismatches

#### Inconsistent (<40/100)
Not consistent with established trader identity:
- Fewer than 3 core rules satisfied
- Little or no historical similarity
- Setup pattern not seen in operator's trade history

---

## Rule Adherence Scoring

Each of the 9 rules is scored 0–100 with weighted contribution to the Rule Similarity Score:

| Rule | Passing Threshold | High Score Criteria |
|------|------------------|-------------------|
| Supply & Demand Zone Quality | 60 | Avg zone quality ≥70 |
| Premium / Discount Framework | 60 | Strong zone bias alignment |
| Liquidity Sweep Confirmation | 60 | Liquidity score ≥75 |
| AMD Sequence Completeness | 60 | AMD score ≥75 |
| Confirmation Signal Quality | 60 | Confirmation ≥70 |
| Overall Setup Score Threshold | 60 | Setup score ≥70 |
| TQI Gate | 60 | TQI ≥65 |
| R:R Minimum | 60 | R:R ≥1.5 (optimal ≥2.0) |
| Spread / Execution Cost | 60 | Spread ≤1.5 pips |

---

## Historical Similarity

The engine finds the top-8 most similar historical trades using **cosine similarity** on a 7-dimensional feature vector:

```
[supplyQuality, demandQuality, liquidityScore, amdScore, 
 confirmationQuality, setupScore, tqi]
```

The Historical Similarity Score combines:
- Average cosine similarity of top-8 matches (85% weight)
- Winner ratio among top-8 matches (15% bonus)

This means a setup that closely resembles historically profitable trades scores higher than an equally similar setup where the matches were losses.

---

## Preference Alignment

When Stage 2 is active, each preference dimension contributes to the Preference Alignment Score:

| Dimension | Aligned Score | Misaligned Score |
|-----------|-------------|-----------------|
| Currency Pair | 90 | 35 |
| Trading Session | 90 | 40 |
| Market Regime | 85 | 45 |
| Volatility | 85 | 45 |
| Trend Condition | 85 | 45 |
| Setup Score vs Average | Dynamic | Dynamic |

---

## Evidence Explorer

Every consistency verdict is supported by:

1. **Rule evidence** — specific scores for each of 9 rules with plain-English explanation
2. **Historical evidence** — similar trade count, win rate among matches, top-K trade list
3. **Preference evidence** — dimension-by-dimension alignment breakdown
4. **Failed rules** — explicitly named for transparency

---

## Practical Interpretation

### For the Operator

A **Fully Consistent** setup means:
- It follows all core strategy rules
- It closely resembles trades that worked historically
- It aligns with your established trading preferences
- The identity engine sees this as "your kind of trade"

A **Partially Consistent** setup means:
- It follows most rules but has notable gaps
- It may be in a non-preferred regime or session
- Worth reviewing the specific failing dimensions before proceeding

An **Inconsistent** setup means:
- Multiple core rules are violated
- Little resemblance to historical trade patterns
- The strategy fundamentals are not clearly present

### What Consistency Does NOT Mean

- A fully consistent setup is **not guaranteed to win** — markets are probabilistic
- An inconsistent setup is **not forbidden** — consistency is advisory only
- Consistency scores **do not modify** position sizing, stops, or entries
- All conclusions are **observational** — the operator makes all decisions
