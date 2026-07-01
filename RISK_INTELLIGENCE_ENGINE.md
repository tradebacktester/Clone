# KRYTOS V2 — Risk Intelligence Core Engine
## Phase 6 — Architecture & Methodology

---

## Overview

The Risk Intelligence Core Engine continuously monitors every source of trading risk — account, position, portfolio, market, broker, and system — and produces a **Unified Risk Intelligence Object (URIO)**. It answers six fundamental questions before, during, and after every trade:

1. Is this trade appropriately sized?
2. Is account risk acceptable?
3. Is market risk unusually high?
4. Is broker execution reliable?
5. Is exposure becoming excessive?
6. Is the system entering a dangerous period?

**Advisory only. This engine NEVER modifies positions, executes orders, changes strategy, or applies risk controls automatically.**

---

## Architecture

```
RunRiInput
├── AccountState           → evaluateAccountRisk()   → AccountRiskResult
├── PositionInput?         → evaluatePositionRisk()  → PositionRiskResult
├── PortfolioInput         → evaluatePortfolioRisk() → PortfolioRiskResult
├── MarketRiskInput        → evaluateMarketRisk()    → MarketRiskResult
├── BrokerMetrics          → evaluateBrokerRisk()    → BrokerRiskResult
└── SystemMetrics          → evaluateSystemRisk()    → SystemRiskResult
                                        ↓
                           computeOverallRisk()
                                        ↓
                    UnifiedRiskIntelligenceObject (URIO)
                                        ↓
                    Stored in ri_reports + ri_timeline
                    Alerts persisted in ri_alerts
```

---

## Risk Score Design

All risk scores run from **0 (very_low) to 100 (critical)**.

Health scores (account, broker reliability, system) are internally 0–100 where 100 = healthy. They are **inverted** before weighting to produce a risk contribution score.

Risk scores (portfolio risk, market risk, position risk) are directly 0–100 where 100 = maximum risk.

### Risk Classification Thresholds

| Classification | Score Range |
|---------------|------------|
| Very Low      | 0 – 19.9   |
| Low           | 20 – 39.9  |
| Moderate      | 40 – 59.9  |
| Elevated      | 60 – 74.9  |
| High          | 75 – 87.9  |
| Critical      | 88 – 100   |

---

## Score Weights (Default)

| Dimension          | Weight | Rationale |
|-------------------|--------|-----------|
| Account Health    | 25%    | Primary survival metric — margin and balance |
| Position Risk     | 20%    | Per-trade risk sizing and RR |
| Portfolio Risk    | 20%    | Aggregate exposure and concentration |
| Market Risk       | 15%    | External market conditions |
| Broker Reliability| 12%    | Execution quality |
| System Health     | 8%     | Infrastructure stability |
| **Total**         | **100%** | |

Weights are normalised and configurable per evaluation call.

---

## Component Scoring Methodologies

### Account Risk

Evaluates six dimensions:
- **Margin Level**: Critical <110%, Warning <150%, Healthy >500%
- **Daily Loss**: Critical >4.5% (1.5× 3% limit), scaled linearly
- **Weekly Loss**: Critical >9% (1.5× 6% limit)
- **Open Risk**: Critical >10% total open position risk
- **Equity Drawdown**: Scaled against balance

Health formula: `0.30×margin + 0.25×daily + 0.15×weekly + 0.20×openRisk + 0.10×equity`

### Position Risk

Evaluates individual trade characteristics:
- **Size Score**: Penalises risk >2% per trade
- **RR Score**: Ideal ≥2.0, acceptable ≥1.5, poor <1.0
- **Exposure Score**: Notional >15% of balance flagged
- **Duration Score**: Penalises positions open >48 hours

Risk formula: `1 - (0.30×size + 0.30×rr + 0.20×exposure + 0.10×duration + 0.10×riskPct)`

### Portfolio Risk

Evaluates collective position characteristics:
- **Concentration**: Max pair exposure as % of total
- **Correlation**: Average cross-pair correlation
- **Directional Bias**: Ratio of long to short positions (-100 to +100)
- **Capacity**: Current vs maximum allowed positions
- **Aggregate Risk**: Total open risk % of account balance

### Market Risk

Integrates Market Intelligence outputs:
- **Volatility**: Direct risk contributor (high volatility = high risk)
- **Liquidity**: Inverted (low liquidity = high risk)
- **Trend Stability**: Inverted (low stability = high risk)
- **Correlation**: Direct (high cross-pair correlation = high risk)
- **News Risk**: Event-driven risk factor

### Broker Risk

Evaluates execution quality:
- **Spread Ratio**: Current vs baseline spread (×2 = warning, ×4 = critical)
- **Slippage**: Warning >1.5 pips, Critical >3.0 pips
- **Execution Time**: Warning >500ms, Critical >1500ms
- **Rejection Rate**: Warning >5%, Critical >15%
- **Latency**: Warning >200ms, Critical >800ms

### System Risk

Evaluates infrastructure health:
- **CPU/Memory**: Warning >70%, Critical >90%
- **DB Query Time**: Warning >200ms, Critical >1000ms
- **API Error Rate**: Warning >5%, Critical >15%
- **Storage**: Warning <20% free, Critical <10% free

---

## Explainability

Every URIO includes:

1. **Score Breakdown**: Per-dimension raw score, inverted risk score, weight, and weighted contribution
2. **Confidence Interval**: Uncertainty band proportional to data completeness and system health
3. **Reliability Rating**: high/moderate/low/insufficient based on confidence and system state
4. **Supporting Evidence**: Array of factual strings per dimension
5. **Alert List**: All alerts sorted by severity (critical first)

No score is produced without a full evidence chain.

---

## Database Schema

### ri_reports
Full URIO snapshot per evaluation. Stores all component scores, evidence, and the full JSON payload.

### ri_timeline
Lightweight timeline entries for trend analysis. One row per evaluation — used for chart rendering.

### ri_alerts
Persistent alert storage. Unresolved alerts tracked across evaluations.

---

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/risk/intelligence` | Run full risk evaluation + persist |
| `GET /api/risk/account` | Account risk only |
| `GET /api/risk/portfolio` | Portfolio risk only |
| `GET /api/risk/market` | Market risk only |
| `GET /api/risk/broker` | Broker risk only |
| `GET /api/risk/system` | System health only |
| `GET /api/risk/history` | Risk timeline (paginated) |
| `GET /api/risk/report` | Aggregated risk report with historical comparison |

---

## Future AI Integration

The URIO is designed as the primary input to Phase 6 Prompts 2–5:
- **Risk Decision Engine** (Phase 6 P2): uses URIO to produce risk-aware position sizing recommendations
- **Risk Alert Engine** (Phase 6 P3): monitors URIO history for anomaly detection
- **Risk Visualisation** (Phase 6 P4): trend forecasting from URIO timeline
- **Risk Certification** (Phase 6 P5): institutional-grade risk certification using URIO history

The `fullPayload` JSONB column stores the complete URIO, making the engine forward-compatible with all future risk analytics.

---

## Validation

- **Score consistency**: All scores validated to 0–100 range at computation and clamped
- **Historical reproducibility**: Same inputs always produce same output (deterministic)
- **Risk classification stability**: Classification thresholds are static constants
- **Data integrity**: All DB writes are atomic; partial failures don't corrupt timeline
- **Confidence calibration**: Data completeness × system health × availability → confidence
