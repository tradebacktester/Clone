# Account Risk Report
## KRYTOS V2 — Risk Intelligence Core Engine

---

## Purpose

The Account Risk Evaluator continuously monitors the safety and health of the trading account. It is the highest-weighted risk dimension (25%) because account survival is the prerequisite for all trading activity.

---

## Inputs

| Field | Description | Source |
|-------|-------------|--------|
| balance | Account balance in USD | bot_state table |
| equity | Account equity (balance ± unrealised P&L) | bot_state table |
| freeMargin | Available margin for new trades | bot_state table |
| marginLevel | Margin level % (equity / margin used × 100) | bot_state table |
| dailyPnl | Today's realised + unrealised P&L | Closed trades + open positions |
| weeklyPnl | 7-day P&L | Closed trades |
| monthlyPnl | 30-day P&L | Closed trades |
| openRisk | Total open risk as % of balance | Sum of position risks |
| closedRisk | Realised daily drawdown % | Closed trades |

---

## Evaluation Dimensions

### 1. Margin Level Score (30% weight)

The margin level is the most critical account metric. A falling margin level signals risk of a margin call.

| Margin Level | Score | Status |
|-------------|-------|--------|
| 0 | 0 | Margin call |
| < 110% | 5 | Critical |
| < 150% | 30 | Warning |
| < 500% | 65 | Caution |
| 500%+ | 65–100 | Healthy |

### 2. Daily Loss Score (25% weight)

Enforces the industry-standard 3% daily maximum loss rule.

| Daily Loss | Score | Alert |
|-----------|-------|-------|
| ≤ 0% | 100 | — |
| 80% of limit | — | Warning |
| ≥ 3% (limit) | — | Critical |
| ≥ 4.5% (1.5× limit) | 0 | Critical |

### 3. Weekly Loss Score (15% weight)

Enforces the 6% weekly loss limit.

### 4. Open Risk Score (20% weight)

Total aggregate open position risk should not exceed 5% of account balance.

| Open Risk | Score | Alert |
|----------|-------|-------|
| 0% | 100 | — |
| > 5% | — | Warning |
| > 10% | 0 | Critical |

### 5. Equity Drawdown Score (10% weight)

Monitors the current unrealised drawdown as a % of balance.

| Drawdown | Score |
|---------|-------|
| 0% | 100 |
| 10% | — (Warning threshold) |
| 20% | 0 |

---

## Account Health Score Formula

```
accountHealthScore = 
  marginScore    × 0.30 +
  dailyScore     × 0.25 +
  weeklyScore    × 0.15 +
  openRiskScore  × 0.20 +
  equityScore    × 0.10
```

The **Account Risk Contribution** used in the overall risk score is: `100 - accountHealthScore`

---

## Risk Limits (Industry Standard)

| Limit | Value | Source |
|-------|-------|--------|
| Daily max loss | 3% | Prop firm standard |
| Weekly max loss | 6% | Prop firm standard |
| Monthly max loss | 12% | Prop firm standard |
| Max open risk | 5% | Conservative hedge fund |
| Min margin level | 150% | Broker safety margin |

---

## Alert Conditions

| Alert | Severity | Condition |
|-------|----------|-----------|
| Margin Level Critical | Critical | marginLevel < 110% |
| Margin Level Warning | Warning | marginLevel < 150% |
| Daily Loss Limit Reached | Critical | dailyLoss ≥ 3% |
| Approaching Daily Loss | Warning | dailyLoss ≥ 2.4% |
| Open Risk Elevated | Warning | openRisk ≥ 5% |
| Equity Drawdown | Warning | drawdown > 10% |

---

## Scalability

The account risk evaluator is a pure function with O(1) complexity. It can be called on every tick without performance impact. In production, it will be called:
- Before each new trade signal
- Every 60 seconds during active trading
- Immediately after each position close
