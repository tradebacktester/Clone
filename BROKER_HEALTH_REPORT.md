# Broker Health Report
## KRYTOS V2 — Risk Intelligence Core Engine

---

## Purpose

The Broker Risk Evaluator monitors execution quality continuously. A degraded broker connection directly impacts trade profitability through higher spreads, slippage, and order rejections. The engine provides an advisory signal only — it never switches brokers or blocks orders automatically.

---

## Inputs

| Field | Description | Units |
|-------|-------------|-------|
| spread | Current bid-ask spread | pips |
| spreadBaseline | Normal/baseline spread for this pair | pips |
| slippage | Average slippage over last 10 fills | pips |
| executionTime | Average order execution time | ms |
| orderRejections | Rejected orders in last 24h | count |
| totalOrders | Total orders submitted in last 24h | count |
| connectionQuality | Broker connection uptime | % |
| priceFeedConsistency | Price feed integrity score | 0–100 |
| latency | Network round-trip to broker | ms |
| pair | Currency pair being evaluated | e.g. EURUSD |

---

## Broker Reliability Score Components

All sub-scores are reliability scores (0 = broken, 100 = perfect):

### 1. Spread Score (20% weight)

Compares current spread to the pair's normal baseline.

| Spread / Baseline | Status |
|------------------|--------|
| 1× | Perfect |
| 1–2× | Normal (slight degradation) |
| 2–4× | Warning |
| 4×+ | Critical |

### 2. Slippage Score (20% weight)

| Average Slippage | Status |
|-----------------|--------|
| < 0.3 pips | Excellent |
| 0.3–1.5 pips | Acceptable |
| 1.5–3.0 pips | Warning |
| > 3.0 pips | Critical |

### 3. Execution Time Score (15% weight)

| Execution Time | Status |
|---------------|--------|
| < 100ms | Excellent |
| 100–500ms | Good |
| 500–1500ms | Warning |
| > 1500ms | Critical |

### 4. Rejection Rate Score (15% weight)

| Rejection Rate | Status |
|---------------|--------|
| < 1% | Normal |
| 1–5% | Caution |
| 5–15% | Warning |
| > 15% | Critical |

### 5. Connection Quality Score (15% weight)

| Uptime | Score |
|-------|-------|
| ≥ 99% | 100 |
| 90–99% | 70–100 |
| 75–90% | 10–70 |
| < 75% | Critical |

### 6. Price Feed Consistency (10% weight)

Direct pass-through of the feed integrity score (0–100).

### 7. Network Latency Score (5% weight)

| Latency | Status |
|---------|--------|
| < 50ms | Excellent |
| 50–200ms | Good |
| 200–800ms | Warning |
| > 800ms | Critical |

---

## Broker Reliability Score Formula

```
brokerReliabilityScore =
  spreadScore    × 0.20 +
  slippageScore  × 0.20 +
  executionScore × 0.15 +
  rejectionScore × 0.15 +
  connectScore   × 0.15 +
  feedScore      × 0.10 +
  latencyScore   × 0.05
```

**Broker Risk Contribution** to overall score: `100 - brokerReliabilityScore` (weight: 12%)

---

## Alert Conditions

| Alert | Severity | Condition |
|-------|----------|-----------|
| Extreme Spread Widening | Critical | spread ≥ 4× baseline |
| Elevated Spread | Warning | spread ≥ 2× baseline |
| Critical Slippage | Critical | avg slippage ≥ 3 pips |
| Elevated Slippage | Warning | avg slippage ≥ 1.5 pips |
| High Order Rejection Rate | Warning | rejections ≥ 5% |
| Critical Network Latency | Critical | latency ≥ 800ms |

---

## Future AI Integration

In Phase 6 P3 (Risk Alert Engine), broker risk metrics will be cross-correlated with trade performance data to identify execution degradation patterns before they impact P&L. Historical broker health scores will be used to adjust execution timing recommendations.
