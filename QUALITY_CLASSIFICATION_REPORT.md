# Quality Classification Report
## KRYTOS Strategy Quality Intelligence Engine

---

## Classification System

The Strategy Quality Intelligence Engine classifies every evaluated setup into one of 7 tiers based on the Strategy Quality Score (SQS, 0–100).

### Classification Tiers

| Tier                | SQS Range | Threshold | Description |
|---------------------|-----------|-----------|-------------|
| Institutional Grade | 90–100    | ≥90       | Mirrors institutional execution criteria. All 7 evaluation dimensions reach elite quality. Rare — requires exceptional structural alignment, clear AMD, institutional liquidity footprint, and strong historical evidence. |
| Elite               | 80–89     | ≥80       | Professional-grade setup. Multi-dimensional quality is outstanding with no significant weaknesses. Suitable for maximum confidence entries. |
| Excellent           | 70–79     | ≥70       | High quality setup with only minor weaknesses across evaluation dimensions. Strong risk-adjusted entry candidate. |
| Strong              | 60–69     | ≥60       | Above-average quality. Clear strengths in multiple dimensions; one or two components below ideal. Reliable entry candidate with standard position sizing. |
| Average             | 45–59     | ≥45       | Meets minimum standards across core dimensions. Lacks the multi-dimensional conviction required for high-confidence entries. Use reduced size. |
| Weak                | 25–44     | ≥25       | Multiple evaluation dimensions underperform. Setup does not meet quality standards. Approach with significant caution or pass. |
| Reject              | 0–24      | <25       | Fails across critical evaluation dimensions. Do not consider for execution. |

---

## Measurable Justification Requirements

Every classification includes:

1. **SQS value** — precise score that triggered the classification
2. **Component breakdown** — which of the 7 components are strong (≥70), moderate (45–69), or weak (<45)
3. **Threshold met** — exact SQS threshold at or above which the classification applies
4. **Next threshold** — points needed to reach the next higher tier
5. **Classification justification** — narrative explaining why this tier was assigned

### Example — Institutional Grade

```
SQS: 92.4 / 100
Classification: Institutional Grade (threshold ≥90)
Strong components (≥70): Structural Quality: 94, AMD Intelligence: 91, Rule Integrity: 88
Moderate components: Historical Intelligence: 67 (limited evidence)
Weak components: none
Gap to next tier: none (top tier)
Justification: SQS of 92.4 exceeds the institutional threshold (90). All or nearly all evaluation 
dimensions reach elite quality. This setup mirrors institutional trade criteria.
```

### Example — Strong

```
SQS: 63.8 / 100
Classification: Strong Setup (threshold ≥60)
Strong components (≥70): Market Intelligence: 78, Structural Quality: 71
Moderate components: Rule Integrity: 65, AMD Intelligence: 62, Confirmation Intelligence: 58
Weak components: Historical Intelligence: 38 (limited similar trades)
Gap to next tier: 6.2 SQS points to Excellent (threshold ≥70)
Justification: SQS of 63.8 qualifies as Strong (60–69). Solid setup with clear strengths; 
one or two dimensions below ideal but overall above average.
```

---

## Classification Distribution Guidance

Based on the SMC/ICT methodology and market statistics, the expected long-run distribution of evaluated setups:

| Tier                | Expected Frequency |
|---------------------|-------------------|
| Institutional Grade | ~2–5%             |
| Elite               | ~8–12%            |
| Excellent           | ~15–20%           |
| Strong              | ~20–25%           |
| Average             | ~20–25%           |
| Weak                | ~10–15%           |
| Reject              | ~5–10%            |

If the actual distribution shows significantly more Institutional Grade or Elite classifications than expected, the optional sub-scores may be systematically over-stated, or the input quality thresholds should be reviewed.

---

## Historical Comparison

For each evaluated setup, the engine surfaces historical evidence:
- Number of similar past trades (cosine similarity ≥ 0.70 on the 8D feature vector)
- Win rate of those similar trades
- Average RR of those similar trades
- Wilson Lower Bound (conservative estimate of true win rate at 95% confidence)
- Sample reliability: insufficient (<5 trades), low (5–9), moderate (10–19), high (≥20)

A Strong classification with poor historical evidence (sampleReliability: "insufficient") should be treated with more caution than one with high historical evidence.

---

## Advisory Guarantee

The classification system is strictly advisory:
- No classification triggers automatic trade execution
- No classification modifies strategy parameters
- No classification adjusts position sizing or risk
- All classifications are advisory-only observations for the human trader

```typescript
isAdvisoryOnly: true  // hard-coded invariant, enforced at engine + route level
```
