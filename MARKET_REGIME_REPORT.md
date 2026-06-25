# Market Regime Detection and Adaptive Weighting Engine

## Overview

The Market Regime Detection and Adaptive Weighting Engine automatically identifies the current market environment and dynamically adjusts the confidence scoring weights for each Smart Money component accordingly.

## Regime Types

| Regime | Symbol | Detection Criteria |
|--------|--------|-------------------|
| **Trending** | ↗ | ADX ≥ 25 OR Trend Strength ≥ 50 | 
| **Ranging** | ↔ | Low ADX (< 25), moderate volatility, compressed ranges |
| **High Volatility** | ⚡ | Volatility Percentile ≥ 75% OR ATR% ≥ 0.8% |
| **Low Volatility** | ○ | Volatility Percentile ≤ 25% AND ATR% < 0.35% |

## Architecture

### Module Structure

```
lib/market-analysis/src/market_regime/
├── volatility_analyzer.ts    — ATR, volatility percentile, range compression
├── trend_analyzer.ts         — ADX (+DI/-DI), market structure score
├── regime_detector.ts        — Regime classification + confidence scoring
├── adaptive_weights.ts       — Per-regime weight profiles + learning engine
└── __tests__/
    └── regime.test.ts        — Comprehensive test suite (30+ test cases)
```

### Data Flow

```
Candles + Swing Points
        │
        ├─→ volatility_analyzer  →  VolatilityAnalysis (ATR, percentile, compression)
        │
        └─→ trend_analyzer       →  TrendAnalysis (ADX, DI, structure score)
                    │
                    └─→ regime_detector  →  DetailedRegimeResult
                                │
                                ├─→ regime: trending | ranging | volatile | low_volatility
                                └─→ regimeConfidence: 0–100
```

## Confidence Scoring

Each regime type has its own confidence scoring formula:

**Trending Confidence:**
```
confidence = ADX_score × 0.45 + structure_score × 0.35 + DI_divergence × 0.20 + 25
```

**Ranging Confidence:**
```
confidence = (25 − ADX) × 2.5 × 0.45 + range_compression × 0.30 + mid_percentile × 0.25 + 15
```

**High Volatility Confidence:**
```
confidence = percentile_score × 0.50 + ATR_percent_score × 0.30 + 30
```

**Low Volatility Confidence:**
```
confidence = (30 − percentile) × 3.3 × 0.50 + range_compression × 0.30 + 20
```

## Adaptive Weight Profiles

### Base Weights (overall defaults)

| Component    | Weight |
|-------------|--------|
| Zone        | 30%    |
| Liquidity   | 25%    |
| AMD         | 25%    |
| Confirmation | 20%   |

### Default Per-Regime Weights

| Regime          | Zone | Liquidity | AMD  | Confirmation |
|----------------|------|-----------|------|-------------|
| Trending        | 25%  | 32%       | 21%  | 22%         |
| Ranging         | 33%  | 21%       | 32%  | 14%         |
| High Volatility | 33%  | 20%       | 20%  | 27%         |
| Low Volatility  | 32%  | 23%       | 28%  | 17%         |

*Rationale: In trending markets, liquidity sweeps (inducement levels) are the most reliable signal. In ranging markets, zone confluence and AMD manipulation patterns dominate. In high volatility, confirmation candles are critical to avoid fakeouts. In low volatility, zones and AMD accumulation patterns are most predictive.*

### Weight Adaptation Rules

- **Minimum samples required**: 30 trades per regime before adaptation begins
- **Learning rate**: 10% (conservative, avoids overfitting small samples)
- **Min/max constraint**: 5%–60% per category (enforced after blending)
- **Normalization**: Weights always sum to 100% after adaptation

**Adaptation formula:**
```
new_weight[k] = current[k] × 0.90 + performance_normalized[k] × 0.10
```

Where `performance_normalized[k]` is each category's win rate, normalized to sum to 1.

## Core Rules (Never Modified by Adaptive System)

1. **Entry requirements** — Zone validity, session timing, AMD pattern requirements
2. **Risk management** — Stop loss placement, position sizing, max drawdown
3. **Strategy rules** — Liquidity sweep confirmation, OB retest requirements
4. Only **confidence scoring weights** are adjusted by the adaptive engine.

## Database Schema

### `market_regime` table (enhanced)

| Column                | Type    | Description |
|-----------------------|---------|-------------|
| `regime`              | text    | Current regime: trending/ranging/volatile/low_volatility |
| `adx_equivalent`      | numeric | ADX value (0–100) |
| `regime_confidence`   | numeric | Regime confidence score (0–100) |
| `volatility_percentile` | numeric | Where current ATR sits in 50-bar history |
| `range_compression`   | numeric | How compressed recent ranges are vs 20-bar average |

### `trades` table (enhanced)

| Column              | Type    | Description |
|---------------------|---------|-------------|
| `regime`            | text    | Regime at trade entry |
| `regime_confidence` | numeric | Confidence score at trade entry |

### `regime_performance` table (new)

Stores aggregated performance stats per regime: total trades, win rate, profit factor, max drawdown, avg setup score, and per-component win rates.

### `regime_weights` table (new)

Stores current adaptive weight profile per regime, updated after each analysis cycle when enough trade data exists.

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/regime/analytics` | GET | Full regime performance stats + current regimes per pair |
| `/api/regime/weights`   | GET | Current adaptive weights per regime |
| `/api/regime/current`   | GET | Current regime detection for each pair |

## Dashboard

A dedicated **Regimes** page is accessible from the sidebar (↗ icon). It shows:

1. **Live regime badges** for each active pair (top-right)
2. **Best Performing Regime** highlighted banner
3. **Per-regime stat cards** (win rate, profit factor, drawdown, trades)
4. **Win Rate by Regime** bar chart
5. **Component Win Rate per Regime** grouped bar chart (Zone / Liquidity / AMD / Confirmation)
6. **Adaptive Weight Profiles** with visual progress bars for each regime
7. **Detailed performance table** with all metrics and best-performing component

## Tests

Tests are located in `lib/market-analysis/src/market_regime/__tests__/regime.test.ts`.

Run with:
```bash
pnpm --filter @workspace/market-analysis test
```

### Coverage

| Module              | Tests |
|--------------------|-------|
| volatility_analyzer | 6     |
| trend_analyzer      | 5     |
| regime_detector     | 6     |
| adaptive_weights    | 12    |
| **Total**           | **29** |

Test scenarios include: edge cases (empty/insufficient candles), correct regime detection, boundary conditions (min/max weights), weight adaptation, performance calculation, and best-regime selection.

## Integration

The regime engine is fully integrated into the analysis cycle:

1. `runFullAnalysis()` calls `detectRegime()` → populates enhanced `MarketRegimeResult`
2. `persistAnalysis()` stores all new regime fields to the `market_regime` table
3. `updateRegimeAnalytics()` runs after every analysis cycle to:
   - Compute `regime_performance` from closed trades
   - Compute and save `regime_weights` via `adaptRegimeWeights()`
   - Log the best-performing regime
