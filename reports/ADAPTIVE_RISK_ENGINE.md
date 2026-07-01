# Adaptive Risk Intelligence Engine

## Overview
The Adaptive Risk Intelligence Engine continuously studies historical trading performance across different market environments and automatically determines the safest risk profile for current conditions. It is **advisory only** and **never modifies the deterministic trading strategy, entry rules, exit rules, or research pipeline**.

## Architecture

### Core Components

| Component | File | Purpose |
|-----------|------|---------|
| Types | `adaptive-risk/types.ts` | All interfaces, profile definitions, safety limits |
| Stats Util | `adaptive-risk/stats-util.ts` | Win rate, expectancy, Sharpe proxy, Wilson CI |
| Regime Learner | `adaptive-risk/regime-learner.ts` | Learns perf by market regime (7 regimes) |
| Volatility Learner | `adaptive-risk/volatility-learner.ts` | Learns perf by volatility level (4 levels) |
| Session Learner | `adaptive-risk/session-learner.ts` | Learns perf by trading session (5 sessions) |
| Pair Profiler | `adaptive-risk/pair-profiler.ts` | Individual performance profiles per pair |
| Liquidity Learner | `adaptive-risk/liquidity-learner.ts` | Learns by liquidity + market condition |
| Confidence Engine | `adaptive-risk/confidence-engine.ts` | Statistical significance + reliability rating |
| Profile Engine | `adaptive-risk/profile-engine.ts` | Selects optimal risk profile from evidence |
| Recommendation Engine | `adaptive-risk/recommendation-engine.ts` | Generates parameter recommendations |
| Explainer | `adaptive-risk/explainer.ts` | Full human-readable explainability |
| Main Index | `adaptive-risk/index.ts` | Orchestrates all components |

### DB Tables

| Table | Purpose |
|-------|---------|
| `ari_profiles` | Full profile snapshots with parameters |
| `ari_recommendations` | Individual parameter recommendations |
| `ari_history` | Profile change events for replay |
| `ari_performance` | Learnt environment performance stats |

### API Routes

| Route | Purpose |
|-------|---------|
| `GET /api/adaptive-risk/profile` | Full profile recommendation |
| `GET /api/adaptive-risk/recommendations` | Individual parameter recommendations |
| `GET /api/adaptive-risk/history` | Adaptation event history |
| `GET /api/adaptive-risk/market-analysis` | Current market environment analysis |
| `GET /api/adaptive-risk/performance` | Historical performance by all dimensions |
| `GET /api/adaptive-risk/report` | Full engine report |

## Learning Methodology

The engine learns from closed trade history across 6 dimensions simultaneously:

1. **Market Regime** — trending/ranging/volatile/low_volatility/transition/expansion/compression
2. **Volatility** — low/normal/high/extreme
3. **Session** — london/new_york/asian/overlap/off_hours
4. **Pair** — EURUSD/GBPUSD/USDJPY (individual profiles)
5. **Liquidity** — high/medium/low
6. **Market Condition** — trending_high/low_momentum, ranging_stable/unstable, news_driven, normal

For each dimension, it computes: win rate, expectancy, avg R:R, profit factor, max drawdown, Sharpe proxy, volatility coefficient.

## Risk Profiles

| Profile | Max Risk/Trade | Max Trades | Daily Budget | Size Multiplier |
|---------|---------------|------------|--------------|-----------------|
| Emergency | 0.10% | 0 | 0.20% | 0.10x |
| Observation | 0.25% | 1 | 0.50% | 0.25x |
| Recovery | 0.35% | 1 | 1.00% | 0.35x |
| Conservative | 0.50% | 2 | 1.50% | 0.50x |
| Balanced | 1.00% | 3 | 3.00% | 1.00x |
| Aggressive | 1.50% | 4 | 4.50% | 1.30x |

## Statistical Validation

- **Minimum evidence**: 10 trades required before any recommendation
- **Confidence scoring**: Wilson lower bound + sample size factor + evidence breadth
- **Statistical significance**: t-test surrogate (mean/stdev × √n)
- **Reliability rating**: institutional (85+) / strong (70+) / moderate (50+) / weak (30+) / insufficient

## Safety Mechanisms

1. Absolute safety limits — hard ceiling on all parameters regardless of profile
2. Capital Protection Engine overrides always take precedence
3. Profile stepped down in extreme volatility / high news risk / low liquidity
4. All recommendations flagged with `withinSafetyLimits` bool
5. `isAdvisoryOnly: true` hard-coded on every response

## Explainability

Every recommendation includes:
- `whyThisProfile` — narrative explanation of profile selection
- `historicalSupport` — which trades and environments drove the recommendation
- `marketInfluences` — which market characteristics influenced the decision
- `expectedBenefits` — what the profile is designed to achieve
- `potentialRisks` — risks of the recommended profile in current conditions
- `safetyMechanisms` — all active safety guardrails

## Future AI Integration

The engine is designed for AI enhancement while maintaining:
- Full statistical evidence retention (stored in `ari_performance`)
- Complete adaptation history for reproducibility (`ari_history`)
- Evidence-based confidence scoring prevents AI from bypassing data requirements
- Safety limits are enforced in code, not by AI — they cannot be bypassed
