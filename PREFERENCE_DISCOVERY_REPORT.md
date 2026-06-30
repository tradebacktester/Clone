# Preference Discovery Report

**Engine:** Trader Identity & Strategy Consistency Engine v1.0.0  
**Date:** 2026-06-30  
**Classification:** Observational Only — Not Execution Rules

---

## What is Preference Discovery?

Preference discovery automatically identifies recurring patterns in the operator's historical trades where a specific condition (pair, session, regime, etc.) correlates with statistically significantly better or worse performance than the overall baseline.

**These are observations — never rules.**

---

## Analyzed Dimensions

| Dimension | Sub-groups | Example Discovery |
|-----------|-----------|------------------|
| Currency Pair | EURUSD, GBPUSD, USDJPY | "Higher win rate during EURUSD trades" |
| Trading Session | London, New York, Overlap | "Better performance in London session" |
| Market Regime | Trending, Ranging, Volatile, Low Vol | "Stronger results in trending markets" |
| Volatility | Low, Medium, High | "Higher confidence after medium volatility setups" |
| Trend Condition | Bullish, Bearish, Neutral, Mixed | "Improved R:R in bullish trend conditions" |
| Zone Quality | High (≥70), Standard (<70) | "Stronger results with high-quality demand zones" |
| Hold Duration | Short (≤1h), Medium (1-4h), Long (>4h) | "Better outcomes in medium-duration trades" |

---

## Discovery Requirements

A preference is only adopted into the identity when ALL of the following are met:

| Criterion | Threshold | Purpose |
|-----------|-----------|---------|
| Sub-group sample size | ≥8 trades | Prevent noise from small samples |
| Confidence score | ≥65% | Combined effect-size + sample-size factor |
| Win-rate lift vs baseline | ≥5pp (absolute) | Meaningful practical difference |
| Statistical signaling | Cohen's h reported | Standardized effect size |

### Confidence Score Calculation

```
confidence = (sample_factor × 0.6) + (effect_factor × 0.4)

sample_factor = min(sub_group_size / 40, 1.0)
effect_factor = min(cohen_h / 0.3, 1.0)
```

This ensures both sufficient data AND meaningful effect size are required.

---

## Effect Classification

| Effect | Condition |
|--------|-----------|
| Positive | Win-rate lift vs baseline ≥ +5pp |
| Negative | Win-rate deficit vs baseline ≤ -5pp |
| Neutral | Win-rate within ±5pp of baseline |

**Important:** Negative preferences (conditions where performance is historically worse) are tracked but never used to block trades. They are informational.

---

## Wilson Lower Bound

The engine uses the Wilson Lower Bound (at 90% confidence, z=1.645) as a conservative win-rate estimate. This penalizes small sample sizes appropriately — a sub-group with 8 wins from 10 trades has a lower Wilson LB than one with 80 wins from 100 trades, even though the raw win rate is identical.

---

## Preference vs Rule

| Characteristic | Preference | Rule |
|---------------|-----------|------|
| Source | Historical trade data | Deterministic strategy |
| Adoption | Statistical evidence required | Always active |
| Effect | Advisory alignment score | Mandatory check |
| Override | Not applicable (advisory) | Cannot be overridden |
| Modification | Learned over time | Fixed |

---

## Stage 2 Activation

Preference discovery becomes active once **20 verified historical trades** exist in the learning features table. Before this threshold:

- All preference alignment scores default to neutral (50/100)
- The identity is purely rule-based (Stage 1)
- Discovery analysis still runs but cannot adopt preferences

After activation:
- Preferences are re-computed each time `/api/identity/profile` or `/api/identity/preferences` is called
- The identity profile is versioned automatically
- New significant preferences are added to `ti_preference_discoveries`

---

## Example Output

```json
{
  "type": "session",
  "value": "london",
  "label": "London Session",
  "sampleSize": 47,
  "winRate": 0.617,
  "avgRr": 2.34,
  "profitFactor": 1.89,
  "confidence": 78.2,
  "effect": "positive",
  "effectSize": 0.312,
  "baselineWinRate": 0.541,
  "liftVsBaseline": 0.076,
  "isSignificant": true,
  "explanation": "London Session: 47 trades, 61.7% win rate (+7.6pp vs baseline), avg RR 2.34 — statistically significant (confidence 78%)."
}
```

---

## Avoiding False Preferences

The engine avoids spurious discoveries by:

1. **Minimum sample gate** — 8 trades per sub-group prevents 1-trade "preferences"
2. **Both effect and sample required** — high confidence requires both large effect AND large sample
3. **Lift threshold** — 5pp minimum lift prevents noise trades from triggering adoption
4. **Conservative Wilson LB** — always uses the lower confidence bound on win rate
5. **Explicit isSignificant flag** — only flagged discoveries appear in the identity

---

*These discoveries are observational artifacts of past trade history. They may not persist into the future. They are never used to block or modify trades. The operator retains full discretion over all trading decisions.*
