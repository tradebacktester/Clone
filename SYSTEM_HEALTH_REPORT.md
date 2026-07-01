# System Health Report
## KRYTOS V2 — Risk Intelligence Core Engine

---

## Purpose

The System Risk Evaluator monitors the health of the computational infrastructure supporting all trading operations. System degradation (high CPU, memory exhaustion, slow DB, API errors) introduces latency and data inconsistency risks into every other risk calculation. System health is the foundation on which all other risk signals depend.

---

## Inputs

| Field | Description | Units |
|-------|-------------|-------|
| cpuUsage | CPU utilisation | % |
| memoryUsage | Heap memory utilisation | % |
| dbHealth | Database query response score | 0–100 |
| apiHealth | API error rate inverse score | 0–100 |
| networkLatency | Internal network round-trip time | ms |
| dataFeedHealth | Price feed integrity score | 0–100 |
| backgroundServices | Count of healthy background services | count |
| totalServices | Total expected background services | count |
| storageAvailability | Available storage | % |
| dbQueryMs | Average DB query time | ms |
| apiErrorRate | API error rate | 0–1 |

---

## System Health Score Components

All sub-scores are health scores (0 = failed, 100 = perfect):

### 1. CPU Score (20% weight)

| CPU Usage | Score |
|----------|-------|
| ≤ 50% | 100 |
| 50–70% | 80–100 |
| 70–90% | 20–80 |
| > 90% | 20 |

Alert: Warning at 70%, Critical at 90%

### 2. Memory Score (20% weight)

| Memory Usage | Score |
|-------------|-------|
| ≤ 50% | 100 |
| 50–75% | 80–100 |
| 75–90% | 20–80 |
| > 90% | 20 |

Alert: Warning at 75%, Critical at 90%

### 3. Database Score (20% weight)

Based on average query time measured against thresholds.

| DB Query Time | Score |
|--------------|-------|
| ≤ 50ms | 100 |
| 50–200ms | 80–100 |
| 200–1000ms | 20–80 |
| > 1000ms | 20 |

Alert: Warning at 200ms, Critical at 1000ms

### 4. API Score (15% weight)

Based on observed error rate:

| Error Rate | Score |
|-----------|-------|
| ≤ 1% | 100 |
| 1–5% | 80–100 |
| 5–15% | 20–80 |
| > 15% | 20 |

### 5. Network Score (10% weight)

| Latency | Score |
|---------|-------|
| ≤ 20ms | 100 |
| 20–100ms | 80–100 |
| 100–500ms | 20–80 |
| > 500ms | 20 |

### 6. Data Feed Score (5% weight)

Direct pass-through of price feed integrity score.

### 7. Services Score (5% weight)

| Healthy / Total | Score |
|----------------|-------|
| 100% | 100 |
| 90%+ | 80 |
| 75%+ | 60 |
| 50%+ | 30 |
| < 50% | 10 |

### 8. Storage Score (5% weight)

| Available Storage | Score |
|------------------|-------|
| ≥ 50% | 100 |
| 20–50% | 80–100 |
| 10–20% | 20–80 |
| < 10% | 10 |

Alert: Warning at 20%, Critical at 10%

---

## System Health Score Formula

```
systemHealthScore =
  cpuScore      × 0.20 +
  memoryScore   × 0.20 +
  dbScore       × 0.20 +
  apiScore      × 0.15 +
  networkScore  × 0.10 +
  feedScore     × 0.05 +
  servicesScore × 0.05 +
  storageScore  × 0.05
```

**System Risk Contribution** to overall score: `100 - systemHealthScore` (weight: 8%)

---

## Alert Conditions

| Alert | Severity | Condition |
|-------|----------|-----------|
| Critical CPU Usage | Critical | cpuUsage ≥ 90% |
| High CPU Usage | Warning | cpuUsage ≥ 70% |
| Critical Memory Usage | Critical | memoryUsage ≥ 90% |
| Database Performance Critical | Critical | dbQueryMs ≥ 1000ms |
| Critical API Error Rate | Critical | apiErrorRate ≥ 15% |
| Elevated API Errors | Warning | apiErrorRate ≥ 5% |
| Background Services Degraded | Warning | Any service offline |
| Critical Storage Shortage | Critical | storageAvailability ≤ 10% |

---

## Production Monitoring Integration

In production, the system metrics feed will be connected to:
- **Node.js `os` module**: CPU cores utilisation average
- **`process.memoryUsage()`**: Heap used / heap total
- **Drizzle ORM query instrumentation**: Average query duration
- **Express middleware**: Error rate tracking via request logger
- **Disk space API**: Storage availability monitoring
- **Service registry**: Background service health ping

Currently, the `gatherSystemMetrics()` function uses Node.js process memory as a real metric, with sensible defaults for CPU and storage until production monitoring hooks are connected.
