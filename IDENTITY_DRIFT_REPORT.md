# Identity Drift Report

**Engine:** Trader Identity & Strategy Consistency Engine v1.0.0  
**Date:** 2026-06-30  
**Classification:** Advisory Only

---

## What is Identity Drift?

Identity drift occurs when the operator's observable trading behavior systematically shifts away from previously established patterns. The drift detector monitors this by comparing the first half of trade history against the second half.

---

## Drift Categories

### Preference Drift
Changes in the categorical patterns of where trades are taken:
- **Pair drift** — shift in which currency pairs dominate the trade book
- **Session drift** — shift from one session preference to another
- **Volatility drift** — changing volatility regime preference over time

### Market Adaptation
Changes that may reflect the market environment rather than operator decisions:
- **Regime drift** — trading more in ranging markets when trending was previously dominant (may be market-driven)
- **Trend drift** — shift in the trend conditions being traded

### Consistency Drift
Degradation in how closely trades follow the core strategy rules:
- **Win rate drift** — systematic change in win rate (positive or negative)
- **Setup score drift** — trades being taken at consistently higher or lower quality
- **TQI drift** — trade quality index changing systematically
- **Liquidity score drift** — changes in liquidity sweep quality

### Learning Drift
Changes that suggest the operator is adjusting their execution approach:
- **R:R drift** — systematic change in realized risk-to-reward

---

## Detection Methodology

The detector requires at least **20 trades** (10 per window) before analysis.

### Continuous Dimensions (Setup Score, TQI, R:R, etc.)
1. Compute mean for each half of history
2. Calculate percentage change between means
3. Calculate normalized effect size (|delta| / normalizer)
4. Flag as significant if: |change%| > 10% AND effect > 0.08

### Categorical Dimensions (Pair, Session, Regime, etc.)
1. Find the modal value in each half of history
2. If modal value changed, compute win rates for each half
3. Calculate Cohen's h effect size between the win rates
4. Flag as significant if: Cohen's h ≥ 0.2 AND |change%| ≥ 10%

### Win Rate Drift
Special check using Cohen's h between the two halves:
- Statistically significant if: Cohen's h ≥ 0.2

---

## Severity Classification

| Severity | Drift Score | Meaning |
|----------|------------|---------|
| Low | <35 | Minor variation within normal range |
| Medium | 35–54 | Noticeable shift worth monitoring |
| High | 55–74 | Significant behavioral change |
| Critical | ≥75 | Major identity shift requiring review |

---

## Interpreting Drift Alerts

### "Preference drift detected — Pair shift"
The dominant pair in recent trades has changed. This may be intentional (operator focus shift) or market-driven (reduced liquidity in previous pair). Not necessarily negative.

### "Consistency drift detected — Win rate"
The win rate has changed significantly between the early and recent trade windows. Positive drift (improving) suggests refinement. Negative drift warrants strategy review.

### "Market adaptation — Regime shift"
The market environment itself may have changed, causing the operator to naturally trade different regimes. Often benign — distinguish from deliberate strategy changes.

### "Learning drift — R:R shift"
The realized R:R is changing. This could reflect better trade management (positive) or premature exits / wider stops (requires investigation).

---

## Important Limitations

1. **Requires sufficient history** — fewer than 20 trades cannot be reliably analyzed
2. **Not causative** — drift detection does not explain WHY behavior changed
3. **Not prescriptive** — drift alerts do not trigger any automatic changes
4. **Midpoint split** — the detection uses a simple chronological midpoint; early trade history may be less representative
5. **Observational only** — all findings are informational for the operator's own review
