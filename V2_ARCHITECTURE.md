# TradeClone AI — V2 Architecture

> **Version**: 2.0  
> **Stack**: Node 24 · TypeScript 5.9 · Express 5 · PostgreSQL + Drizzle ORM · React + Vite · pnpm workspaces

---

## Overview

V2 transforms the paper trading bot into an institutional-grade quantitative trading platform. All V1 strategy rules are preserved; V2 layers institutional-grade filtering, dynamic risk management, and full explainability on top.

---

## 1. Multi-Timeframe Confirmation (MTF Engine)

**File**: `artifacts/api-server/src/lib/mtf-engine.ts`

The MTF engine checks alignment across all four timeframes before allowing a trade:

| Timeframe | Role | Weight |
|---|---|---|
| Daily (1D) | Macro trend direction | 35% |
| 4-Hour (4H) | Market structure (HH/HL vs LH/LL) | 30% |
| 1-Hour (1H) | Directional bias validation | 20% |
| 15-Minute (15M) | Execution timing | 15% |

**Alignment logic**: Weighted bull/bear scores are computed across available TFs. A trade is considered MTF-aligned when ≥65% of the weighted score agrees with the signal direction.

**API**: `GET /api/v2/mtf/:pair` — returns alignment snapshot with per-TF status.

---

## 2. Trade Quality Index (TQI)

**File**: `artifacts/api-server/src/lib/tqi-engine.ts`

A 0–100 composite score computed before every trade. All 8 components must be evaluated; only trades with TQI ≥ 65 (default, configurable) are executed.

| Component | Max Score | Source |
|---|---|---|
| HTF Structure | 15 | MTF alignment score |
| Premium/Discount | 10 | Fibonacci bias (discount for buys, premium for sells) |
| Zone Quality | 15 | Zone strength + freshness from `AnalysisResult.zones` |
| Liquidity Quality | 15 | Sweep score from `AnalysisResult.sweeps` |
| AMD Quality | 15 | AMD sequence score + phase |
| Confirmation Quality | 10 | Candle confirmation score |
| Session Quality | 10 | Session timing vs peak liquidity windows |
| Market Regime | 10 | Regime type × confidence |

**Grades**: A (85+), B (70+), C (55+), D (40+), F (<40)

**API**: `GET /api/v2/tqi/:pair` — TQI for current live signals on that pair.

**DB**: `tqi`, `tqi_grade` columns on `trades` table.

---

## 3. Dynamic Position Sizing

**File**: `artifacts/api-server/src/lib/dynamic-sizing.ts`

Replaces fixed-lot calculation with a multi-factor adjusted risk model:

```
adjustedRisk = baseRisk × confFactor × volFactor × ddFactor × regimeFactor × perfFactor
```

| Factor | Range | Source |
|---|---|---|
| Confidence | 0.70–1.30× | Signal confidence 65–100% |
| Volatility | 0.45–1.00× | ATR vs pair-typical ATR |
| Drawdown | 0.45–1.00× | Current drawdown % |
| Regime | 0.55–1.10× | Market regime type |
| Performance | 0.60–1.30× | Trade memory cluster win rate |

The final risk % is always capped at the user-configured maximum.

**DB**: `dynamic_risk_pct` column on `trades` table.

---

## 4. Correlation Engine

**File**: `artifacts/api-server/src/lib/correlation-engine.ts`

Prevents overexposure when multiple signals are correlated. Uses a static historical correlation matrix:

| Pair | EURUSD | GBPUSD | USDJPY |
|---|---|---|---|
| EURUSD | 1.00 | +0.82 | −0.68 |
| GBPUSD | +0.82 | 1.00 | −0.60 |
| USDJPY | −0.68 | −0.60 | 1.00 |

**Logic**: A new signal is blocked if its effective correlation with any open position exceeds 0.70. Effective correlation accounts for direction: positive correlation + same direction = doubled exposure; negative correlation + opposite direction = doubled exposure.

---

## 5. Explainable AI

**File**: `artifacts/api-server/src/lib/explanation-engine.ts`

Every executed trade receives a full structured explanation stored as JSONB:

```typescript
{
  summary: string,                    // one-line trade description
  whyTaken: string[],                 // narrative bullet points
  rulesPassed: RuleResult[],          // all rules with scores
  rulesNearlyFailed: RuleResult[],    // rules within 12pts of threshold
  confidenceBreakdown: {factor, contribution}[], // per factor weight
  riskAssessment: {lotSize, riskPct, riskAmount, slPips, rr},
  mtfAlignment: {timeframe, role, direction, status}[],
  tqiBreakdown: {component, score, maxScore, description}[],
  tqi: number,
  tqiGrade: string,
  generatedAt: string,
}
```

**API**: `GET /api/trades/:id/explanation` — fetch explanation for any trade.

**DB**: `explanation` column (JSONB) on `trades` table.

---

## 6. Performance Analytics

**File**: `artifacts/api-server/src/routes/v2.ts`

Win rate and P&L broken down across 7 dimensions (computed on-the-fly from `trades` table):

- By **weekday** (Mon–Sun)
- By **hour** (UTC 0–23)
- By **session** (london/newyork/asian)
- By **pair** (EURUSD/GBPUSD/USDJPY)
- By **volatility regime**
- By **market regime**
- By **AMD phase** (setup type)

**API**: `GET /api/analytics/time-performance?dimension=weekday|hour|session|pair|regime|setup`

---

## 7. Reporting Engine

**File**: `artifacts/api-server/src/lib/report-engine.ts`

Generates three report types:

| Type | Period | Contents |
|---|---|---|
| Daily | UTC day | Trades, P&L, win rate, top/bottom setups |
| Weekly | Mon–Sun | All daily + regime breakdown + improvement suggestions |
| Monthly | Calendar month | All weekly + full equity curve + trade distribution |

Reports are stored as JSONB in `reportsTable` and served via:

- `GET /api/reports` — list reports (filterable by type)
- `POST /api/reports/generate` — generate report for type
- `GET /api/reports/:id` — get full report content

---

## 8. Health Monitoring (V2 Supervisor)

**File**: `artifacts/api-server/src/lib/supervisor-engine.ts`

Runs every 60 seconds, checking 9 health dimensions. V2 adds:

- **Database health**: Query latency test on startup
- **News service health**: Monitor ForexFactory fetch success rate
- **Analysis feed staleness**: Per-pair cache age monitoring

Auto-pause triggers: daily loss, weekly loss, win rate ≤25%, profit factor ≤0.7, drawdown ≥15%, price feed critical.

---

## 9. Database Schema (V2 additions)

### Modified Tables

**`trades`** — New columns:
- `tqi` NUMERIC — Trade Quality Index score
- `tqi_grade` TEXT — TQI grade (A/B/C/D/F)
- `mtf_aligned` BOOLEAN — Whether MTF was aligned at entry
- `mtf_score` NUMERIC — MTF alignment score 0–100
- `dynamic_risk_pct` NUMERIC — Actual risk % used (post dynamic sizing)
- `explanation` JSONB — Full Explainable AI output

### New Tables

**`reports`** — Generated reports:
- `id`, `type` (daily/weekly/monthly), `period_start`, `period_end`, `content` (JSONB), `generated_at`

---

## 10. API Endpoint Map (V2)

```
GET  /api/v2/mtf/:pair           — MTF alignment snapshot
GET  /api/v2/tqi/:pair           — TQI scores for current signals
GET  /api/analytics/time-performance?dimension=...  — Time-based win rate analysis
GET  /api/trades/:id/explanation — Trade explanation (Explainable AI)
GET  /api/reports                — List reports (type filter)
POST /api/reports/generate       — Generate daily/weekly/monthly report
GET  /api/reports/:id            — Get report content
```

---

## 11. Analysis Scheduler (V2)

The scheduler now runs all four timeframes for each pair:

| Pair | Timeframes scheduled |
|---|---|
| EURUSD | 15m, 1h, 4h, 1d |
| GBPUSD | 15m, 1h, 4h, 1d |
| USDJPY | 15m, 1h, 4h, 1d |

**1D and 4H** results are persisted to DB (zones, regimes, signals).  
**1H and 15M** results are cached in memory for MTF engine use only.  
Cache TTL: 30 minutes. Scheduler interval: 10 minutes.

---

## 12. Trade Execution Flow (V2)

```
Signal Generated (15M execution timeframe)
    │
    ├─ MTF Gate: Check 1D/4H/1H/15M alignment → block if < 2/4 TFs aligned
    │
    ├─ TQI Gate: Compute 8-component score → block if TQI < 65
    │
    ├─ Correlation Gate: Check open positions → block if corr > 0.70
    │
    ├─ Dynamic Sizing: Compute adjusted risk % and lot size
    │
    ├─ Execute Trade: Enter with dynamic lot, record tqi/mtf/explanation
    │
    └─ Explanation: Generate and store full AI explanation in JSONB
```

---

## 13. Testing

Unit tests cover all new V2 modules:

- `mtf-engine.test.ts` — Alignment scenarios, weighted scoring
- `tqi-engine.test.ts` — Component scoring, grade thresholds
- `dynamic-sizing.test.ts` — Factor multipliers, clamping
- `correlation-engine.test.ts` — Matrix lookups, direction logic

Run: `node --test --import tsx/esm <test-file>`

---

## 14. Module Dependency Graph

```
paper-engine.ts
    ├── mtf-engine.ts         (getCachedAnalysis)
    ├── tqi-engine.ts         (TradeSignal + AnalysisResult)
    ├── dynamic-sizing.ts     (TradeSignal + AnalysisResult)
    ├── correlation-engine.ts (open positions from DB)
    ├── explanation-engine.ts (mtf + tqi + sizing)
    └── broker-engine.ts      (execution logging)

report-engine.ts
    └── reportsTable (DB)

supervisor-engine.ts
    ├── tradesTable (DB)
    ├── botStateTable (DB)
    └── price-feed.ts / analyzer.ts (health checks)
```
