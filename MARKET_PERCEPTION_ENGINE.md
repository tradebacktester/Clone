# Market Perception Engine

**Version:** 1.0.0  
**Status:** Production  
**Module:** `lib/market-analysis/src/perception/`  
**API Mount:** `/api/market/*`  
**Dashboard:** `/market-intelligence`

---

## Overview

The Market Perception Engine gives KRYTOS V2 continuous, real-time awareness of the current market environment before any setup evaluation begins. It operates as a pure observer — it reads, classifies, and reports. It does not modify the trading strategy, risk management, decision intelligence, or learning engine.

Every future intelligence module (setup evaluator, risk layer, executive AI) receives the Market State Object as a shared, authoritative input.

---

## Architecture

```
Market Data (candles, swings, news)
          │
          ▼
  ┌───────────────────────────────────────────┐
  │         Market Perception Engine          │
  │                                           │
  │  ┌──────────┐   ┌──────────────────────┐  │
  │  │  Trend   │   │  Regime Detection    │  │
  │  │ Perceiver│   │  (5-state scoring)   │  │
  │  └──────────┘   └──────────────────────┘  │
  │  ┌──────────┐   ┌──────────────────────┐  │
  │  │Volatility│   │  Liquidity Analysis  │  │
  │  │ Analysis │   │  (session + quality) │  │
  │  └──────────┘   └──────────────────────┘  │
  │  ┌──────────┐   ┌──────────────────────┐  │
  │  │Correlation│  │  News Context        │  │
  │  │ (3 pairs)│   │  (environment aware) │  │
  │  └──────────┘   └──────────────────────┘  │
  │                                           │
  │           ▼                               │
  │   Market State Builder                    │
  │   (unified object + session + confidence) │
  └───────────────────────────────────────────┘
          │
          ▼
  ┌─────────────────────────────┐
  │  Market State Object        │  →  DB snapshot (market_state_snapshots)
  │  (MarketState)              │  →  REST API (/market/state)
  │  version: 1.0.0             │  →  Dashboard (/market-intelligence)
  └─────────────────────────────┘
```

---

## Detection Methodology

### 1. Trend Detection (`trend-perception.ts`)

Identifies and measures the current directional bias.

**Algorithm:**  
- **DMI / ADX calculation** over configurable period (default 14) using True Range decomposition into +DM and -DM components
- **Market structure scoring** from recent swing high/low sequences (last 12 swings), counting consecutive higher-highs/higher-lows (bull) or lower-lows/lower-highs (bear)
- **Trend age** measured by consecutive candle closes in the same direction

**Classifications:**

| Direction | Criteria |
|---|---|
| `strong_bullish` | ADX ≥ 35, +DI lead ≥ 15, bullish structure confirmed |
| `bullish` | ADX ≥ 18, +DI leading, structure score ≥ 20 |
| `neutral` | ADX < 18 or DI crossover zone |
| `bearish` | ADX ≥ 18, -DI leading, structure score ≥ 20 |
| `strong_bearish` | ADX ≥ 35, -DI lead ≥ 15, bearish structure confirmed |

**Metrics Produced:**
- `strength` (0–100): Composite of ADX (60%) + structure score (40%)
- `persistence` (0–100): Consecutive aligned structures × 25, capped at 100
- `age` (candles): Count of consecutive candles closing in trend direction
- `adx`, `plusDI`, `minusDI`: Raw DMI components
- `structureScore` (0–100): Market structure alignment quality
- `consecutiveStructures`: Raw count of aligned swing structures
- `confidence` (0–100): Weighted combination of ADX, structure, persistence, and directionality

---

### 2. Market Regime Detection (`regime-perception.ts`)

Identifies the current behavioral state of the market as a whole.

**Algorithm:**  
Multi-dimensional scoring across five regimes using ADX, volatility percentile, and range compression as inputs. Each regime receives a 0–100 score. Transition detection fires when the top two regime scores are within 15 points of each other.

**Regimes:**

| Regime | Detection Signal |
|---|---|
| `trending` | ADX ≥ 25 + trend strength high + vol ≥ 40th percentile |
| `ranging` | ADX < 25 + range compression active + vol 25–60th percentile |
| `expansion` | Vol ≥ 60th percentile + ADX ≥ 20 + low compression |
| `compression` | Range compression ≥ 40% + vol ≤ 30th percentile + ADX < 20 |
| `transitioning` | Top two regime scores within 15 points (ambiguity detected) |

**Metrics Produced:**
- `regime`: Current classified regime
- `confidence` (0–100): Top regime score, reduced when transitioning
- `scores`: Record of all 5 regime probability scores
- `prevRegime`: Previous regime from rolling history (last 5)
- `isTransitioning`: Boolean flag for regime ambiguity
- `volatilityPercentile`, `adx`, `rangeCompression`: Contributing inputs

---

### 3. Volatility Analysis (`volatility-perception.ts`)

Measures the intensity and character of current market movement.

**Algorithm:**
- **ATR (Average True Range):** Windowed sum of max(H-L, |H-C₋₁|, |L-C₋₁|) over 14 periods
- **Historical Volatility:** Log-return standard deviation over 50 bars
- **Realized Volatility:** Log-return standard deviation over 20 bars (shorter window, more reactive)
- **Annualized HV:** HV × √252 × 100 (expressed as percentage)
- **Volatility Percentile:** Midpoint-rank of current ATR in the 50-bar ATR distribution (avoids ties-at-100% artifact)
- **Volatility Trend:** Compare 3-bar vs 6-bar ATR average; >10% change = rising/falling
- **Range Compression:** `(1 - 5-bar avg range / 20-bar avg range) × 100`

**Classifications:**

| Class | Criteria |
|---|---|
| `very_low` | Percentile ≤ 10 or ATR% ≤ 0.15% |
| `low` | Percentile ≤ 30 or ATR% ≤ 0.30% |
| `normal` | 30th–70th percentile, ATR% 0.30–0.70% |
| `high` | Percentile ≥ 70 or ATR% ≥ 0.70% |
| `extreme` | Percentile ≥ 90 or ATR% ≥ 1.20% |

**Metrics Produced:**
- `atr`: Current ATR value (price units)
- `atrPercent`: ATR as % of average price
- `historicalVolatility`: 50-bar log-return std dev
- `realizedVolatility`: 20-bar log-return std dev
- `volatilityPercentile` (0–100)
- `volatilityTrend`: `rising | falling | stable`
- `classification`: `very_low | low | normal | high | extreme`
- `rangeCompression` (0–100)
- `annualizedHV`: Annualized HV as percentage
- `confidence` (0–100): Based on data availability

---

### 4. Liquidity Analysis (`liquidity-perception.ts`)

Measures how efficiently the market is absorbing and facilitating trading activity.

**Algorithm:**
- **Relative Volume:** Avg volume of last 5 bars ÷ avg volume of last 20 bars
- **Spread (H-L proxy):** Average high-low range of last 5 bars
- **Candle Efficiency:** Average of |body| / range across last 10 candles (0 = doji/wicks only, 1 = full body)
- **Gap Frequency:** Count of bars where open-to-prev-close gap > 30% of prior range, over last 20 bars
- **Liquidity Score:** `relVol(35%) + candleEff(35%) - gapPenalty(15%) - spreadPenalty(15%)`

**Quality Classification:**

| Quality | Score |
|---|---|
| `excellent` | ≥ 70 |
| `good` | 50–69 |
| `fair` | 30–49 |
| `poor` | < 30 |

**Session Classification:** Relative volume × 0.6 + candle efficiency × 0.4 → `high | medium | low`

**Metrics Produced:**
- `sessionLiquidity`: `high | medium | low`
- `relativeVolume`: Ratio vs 20-bar baseline
- `spread` & `spreadPercent`: H-L proxy values
- `candleEfficiency` (0–1)
- `gapFrequency` (0–1)
- `quality`: `excellent | good | fair | poor`
- `score` (0–100)
- `confidence` (0–100)

---

### 5. Correlation Analysis (`correlation-perception.ts`)

Continuously tracks the relationship between all three traded pairs.

**Algorithm:**
- **Pearson Correlation:** Computed on close-price returns aligned by bar index
- **Window:** Configurable (default 20 bars); uses aligned slices for both series
- **Rolling Correlations:** 5 overlapping sub-windows for trend detection
- **Breakdown Detection:** If |recent avg - older avg| > 0.4 across rolling windows → `breakdown`

**Pair Relationships Tracked:**
- EUR/USD ↔ GBP/USD
- EUR/USD ↔ USD/JPY
- GBP/USD ↔ USD/JPY

**Status Classifications:**

| Status | Criteria |
|---|---|
| `high_positive` | Pearson r ≥ 0.70 |
| `normal` | -0.70 < r < 0.70, no breakdown |
| `high_negative` | Pearson r ≤ -0.70 |
| `breakdown` | Rolling correlation shift > 0.40 within window |

**Risk Levels:**
- `high`: ≥ 2 breakdowns OR ≥ 2 high correlations
- `medium`: 1 breakdown OR 2 high correlations
- `low`: Otherwise

**Metrics Produced (per pair):**
- `correlation`: Pearson r in [-1, 1]
- `status`: `high_positive | normal | high_negative | breakdown`
- `sampleSize`: Actual number of bars used
- `rollingCorrelations`: Array of sub-window correlation values

**Portfolio-level:**
- `overallCorrelationRisk`: `low | medium | high`
- `confidence` (0–100)

---

### 6. News Context (`news-context.ts`)

Tracks the upcoming and recent news environment without performing sentiment analysis.

**Algorithm:**
- Events within 0–240 minutes ahead → `upcomingHighImpact`
- Events within 0–60 minutes past → `recentEvents`
- Impact score = `baseWeight × (1 - minutesSince/60)` (linear decay)
- Pair-currency mapping: `{EUR, USD} → EURUSD`, `{GBP, USD} → GBPUSD`, `{USD, JPY} → USDJPY`

**Category Impact Weights:**

| Category | Weight |
|---|---|
| NFP | 100 |
| FOMC | 90 |
| INTEREST_RATE | 85 |
| CPI | 80 |
| GDP | 70 |
| CENTRAL_BANK_SPEECH | 65 |
| OTHER | 40 |

**Environment Classifications:**

| Environment | Criteria |
|---|---|
| `blocked` | Blocking event active or recovery phase = blocked |
| `cautious` | Recovering from recent impact OR event within 30 min |
| `safe` | No blocking, no recent impact, no imminent event |

**Recovery Phases:**
- `blocked`: isBlocking flag active
- `recovering`: High-impact event occurred within last 60 minutes (impactScore ≥ 60)
- `clear`: No blocking, no high-impact recent event

**Metrics Produced:**
- `upcomingHighImpact`: Sorted list of high-impact events in next 240 min
- `nextEventMinutes` / `nextEventTitle`: Nearest event summary
- `recentImpactScore`: Average decay-weighted impact of last-hour events
- `recentEvents`: Events from last 60 minutes
- `recoveryPhase`: `clear | recovering | blocked`
- `environment`: `safe | cautious | blocked`
- `affectedPairs`: List of pairs affected by detected events
- `confidence` (0–100)

---

### 7. Market State Builder (`market-state.ts`)

Aggregates all six perception layers into a unified, versioned Market State Object.

**Session Detection (UTC-based):**

| Session | UTC Hours |
|---|---|
| `london` | 07:00–16:00 |
| `new_york` | 13:00–22:00 (overlap with London 13–16) |
| `tokyo` | 23:00–08:00 |
| `sydney` | 21:00–06:00 |
| `off_hours` | Otherwise |

**Overall Confidence Weighting:**

| Component | Weight |
|---|---|
| Trend | 20% |
| Regime | 20% |
| Volatility | 20% |
| Liquidity | 15% |
| Correlation | 15% |
| News Context | 10% |

**Confidence Labels:**

| Label | Score |
|---|---|
| `very_high` | ≥ 80 |
| `high` | 65–79 |
| `medium` | 45–64 |
| `low` | 25–44 |
| `very_low` | < 25 |

---

## Market State Object

```typescript
interface MarketState {
  pair: string;                    // "EURUSD" | "GBPUSD" | "USDJPY"
  timestamp: string;               // ISO-8601
  version: string;                 // "1.0.0"
  session: TradingSession;         // "london" | "new_york" | "tokyo" | "sydney" | "off_hours"
  trend: TrendPerception;          // direction, strength, persistence, age, ADX, DI, confidence
  regime: RegimePerception;        // regime, confidence, scores[5], isTransitioning, ADX
  volatility: VolatilityPerception; // ATR, HV, RV, percentile, trend, classification
  liquidity: LiquidityPerception;  // quality, score, relVol, spread, efficiency, session
  correlation: CorrelationPerception; // 3 pair relationships + risk level
  newsContext: NewsContext;        // environment, upcoming, recent, recovery, affected pairs
  overallConfidence: OverallConfidence; // "very_low" | "low" | "medium" | "high" | "very_high"
  confidenceScore: number;         // 0–100 weighted composite
  summary: string;                 // human-readable one-liner
}
```

### Persistence

Every Market State is optionally persisted to `market_state_snapshots` table with:
- Key numeric fields stored as individual columns for queryability
- Full state serialized as `jsonb` in `full_state` column
- History queryable via `GET /market/state/history?pair=EURUSD&limit=20`

---

## API Endpoints

All endpoints are mounted at `/api` prefix.

### `GET /api/market/state`

Returns the complete Market State for a given pair.

**Query Params:**
- `pair` — `EURUSD | GBPUSD | USDJPY` (default: `EURUSD`)
- `save` — `true | false` (default: `true`) — whether to persist snapshot

**Response:**
```json
{
  "ok": true,
  "data": { /* MarketState */ }
}
```

---

### `GET /api/market/trend`

Returns isolated trend perception for a pair.

**Query Params:** `pair`

**Response:**
```json
{
  "ok": true,
  "data": {
    "pair": "EURUSD",
    "trend": { /* TrendPerception */ },
    "timestamp": "..."
  }
}
```

---

### `GET /api/market/regime/perception`

Returns regime perception (5-state scoring with confidence).

> Note: `/api/market/regime` (without `/perception`) returns legacy regime data from the trade analytics system. Use `/perception` for the Market Perception Engine output.

**Query Params:** `pair`

---

### `GET /api/market/volatility`

Returns full volatility perception including ATR, HV, RV, percentile, and classification.

**Query Params:** `pair`

Also available at `/api/market/volatility/detail` (backward-compatible alias).

---

### `GET /api/market/liquidity`

Returns liquidity perception including score, quality, relative volume, and session tier.

**Query Params:** `pair`

---

### `GET /api/market/correlation`

Returns all three pair-wise correlations and overall portfolio correlation risk.

No pair query param (always computes all three relationships simultaneously).

---

### `GET /api/market/news-context`

Returns current news environment: upcoming events, recent events, affected pairs, and environment classification.

---

### `GET /api/market/state/history`

Returns persisted historical market state snapshots.

**Query Params:**
- `pair` — filter by pair
- `limit` — max records (default 20, max 50)

---

## Dashboard — `/market-intelligence`

The dashboard is accessible at `/market-intelligence` in the KRYTOS V2 interface.

### Layout

**Pair Selector Row:** Three pair cards (EURUSD, GBPUSD, USDJPY) — each shows current trend direction, regime, volatility classification, and confidence score. Clicking selects the active pair for all detail tabs.

**Tab Navigation (7 tabs):**

| Tab | Content |
|---|---|
| **Overview** | Live Market State card: session badge, summary, trend/regime/vol/liquidity badges, confidence rings (6 sub-components), news environment status |
| **Trend** | Direction badge with ADX, strength/persistence/age metric cards, +DI/-DI/structure/confidence progress bars |
| **Regime** | Regime badge, transitioning indicator, radar chart of all 5 regime scores, ADX/volatility percentile/compression detail |
| **Volatility** | Classification + trend arrow, ATR / annualized HV / HV / RV cards, vol percentile and range compression bars |
| **Liquidity** | Quality + session tier badges, relative volume / efficiency / spread / gap frequency cards, liquidity score bar |
| **Correlation** | Portfolio risk badge, 3-pair correlation table with color-coded r values and status labels, rolling correlation mini-charts |
| **News** | Environment badge + next event countdown, recovery phase / recent impact / upcoming count cards, upcoming events timeline, recent events list, affected pairs |

**Refresh:** Global refresh button invalidates all 7 query keys simultaneously. Each section auto-refetches on its own interval (60s for pair data, 90s for correlation, 120s for news).

---

## Metrics Summary

| Engine | Input | Output Fields | Complexity |
|---|---|---|---|
| Trend | Candles + Swings | 10 fields | O(n) DMI + swing scan |
| Regime | Candles + Swings | 8 fields + 5 scores | O(n) via volatility + trend |
| Volatility | Candles | 10 fields | O(n) ATR series + log returns |
| Liquidity | Candles | 8 fields | O(n) sliding window |
| Correlation | 3× Candle arrays | 4 per pair + risk | O(n×3) Pearson |
| News Context | Event list | 9 fields | O(events) linear scan |
| Market State | All above | 13 top-level + nested | Aggregate + session detect |

All engines run in O(n) time on candle count. Typical latency for a full `buildMarketState()` call on 60 candles per pair: **< 5ms**.

---

## Validation

### Test Coverage

All seven perception modules have comprehensive test suites:

| Test File | Tests | Coverage |
|---|---|---|
| `trend-perception.test.ts` | 10 | Direction, strength, persistence, age, ADX, all fields |
| `regime-perception.test.ts` | 8 | All 5 regimes, score bounds, transition detection |
| `volatility-perception.test.ts` | 12 | ATR, HV, RV, percentile, classification, trend |
| `liquidity-perception.test.ts` | 11 | Quality, score, session, all fields |
| `correlation-perception.test.ts` | 8 | Pearson bounds, status, pair labels, risk levels |
| `news-context.test.ts` | 10 | Environment states, event timing, affected pairs |
| `market-state.test.ts` | 12 | Full state structure, session detection, integration |
| `api-integration.test.ts` | 60+ | End-to-end pipeline, cross-component consistency, all 6 API paths |

**Total: 130+ assertions across 8 test files.**

### Validation Properties

- All numeric metrics are bounded (0–100 for scores/percentiles/confidence)
- All enum fields have exhaustive valid value sets
- Empty/insufficient data returns safe defaults (no throws)
- Session detection is deterministic for fixed timestamps
- Confidence score formula is verified as weighted sum of sub-components
- High-correlation pairs produce `high_positive` status (structural test)
- Volatile candles classify ≥ flat candles on volatility scale

---

## Performance

| Operation | Typical Latency | Data Size |
|---|---|---|
| `perceiveTrend` | < 1ms | 60 candles |
| `perceiveRegime` | < 2ms | 60 candles |
| `perceiveVolatility` | < 1ms | 60 candles |
| `perceiveLiquidity` | < 1ms | 60 candles |
| `perceiveCorrelation` | < 2ms | 60 candles × 3 pairs |
| `perceiveNewsContext` | < 0.5ms | < 50 events |
| `buildMarketState` (full) | < 5ms | All above |
| DB snapshot write | < 20ms | 1 row |

Memory usage: ~0 persistent state outside the 5-entry regime history ring buffer (module-level). Each invocation is stateless except for regime transition history.

---

## Future AI Integration Points

The Market State Object is designed as a shared context payload for every downstream intelligence layer:

### 1. Setup Evaluator
Receives the full `MarketState` to gate setup quality — e.g., reject setups during `newsContext.environment === "blocked"`, down-weight during `regime.regime === "transitioning"`.

### 2. Risk Management Layer
Uses `volatility.classification` for dynamic stop-loss sizing, `liquidity.quality` for position size adjustment, `correlation.overallCorrelationRisk` to block correlated concurrent trades.

### 3. Executive AI
Receives the Market State as the primary environmental context for trade authorization decisions. The `overallConfidence` score serves as a quality gate.

### 4. Reinforcement Learning Agent
Market State features (trend direction, regime, vol percentile, session, news environment) become state-space inputs for the RL agent's observation vector.

### 5. Learning Engine (Pattern Performance)
Uses `session` and `regime.regime` to segment pattern performance statistics — enabling regime-conditional win rate tracking.

### 6. Decision Intelligence Engine
Integrates Market State as an environmental enrichment layer for the Trader Intelligence Score — regime and volatility context improve decision recommendation quality.

---

## Design Rules

The Market Perception Engine is a **read-only observer**:

- It does NOT issue trade signals
- It does NOT modify any risk parameters
- It does NOT alter learning weights or model state
- It does NOT block or approve trades (that is the risk layer's job)
- It ONLY reads market data and produces a structured description of current conditions

This separation ensures the perception layer can be updated, retrained, or recalibrated independently without affecting the execution pipeline.
