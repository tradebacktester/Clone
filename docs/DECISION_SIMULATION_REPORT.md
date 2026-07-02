# Decision Simulation Report
## Phase 7.3 — Multi-Scenario Evaluation Methodology

---

## Purpose

Before every potential trade, the Decision Simulation Engine independently evaluates each of the 7 candidate decisions using a deterministic, intelligence-derived simulation model. The result is a complete multi-scenario profile of every realistic action KRYTOS could take.

---

## Simulation Inputs

The simulation context is derived from:

| Input | Source |
|-------|--------|
| `executiveScore` | Executive Strategy Brain (ESB) result |
| `strategyScore` | ESB strategy strength |
| `riskScore` | Executive Risk Brain (ERB) overall risk |
| `marketScore` | ERB market health score |
| `memoryWinRate` | Trade memory system historical win rate |
| `identityScore` | Trader Identity Engine style similarity |
| `crisisStatus` | Crisis Intelligence Engine status |
| `survivalMode` | Capital Protection Engine survival flag |

---

## Simulation Model per Candidate

### Execute Trade

The highest-upside, highest-risk action.

```
prob    = executiveScore × 0.6 + strategyScore × 0.4 × 0.8
risk    = riskScore × 0.85 + (survivalMode ? 25 : 0)
winRate = memoryWinRate × 0.95 (or strategyScore × 0.65 as fallback)
rr      = 0.5 + (executiveScore / 100) × 3.0  [range: 0.5–4.0]
```

### Wait One Candle

Defers the decision by one market candle. Expected to improve entry quality.

```
prob    = executiveScore × 0.55 + 30  (floor of 30 prevents over-pessimism)
risk    = riskScore × 0.45             (reduced by not entering yet)
rr      = 0.6 + (executiveScore / 100) × 2.5
```

### Wait for Confirmation

Waits for a secondary signal confirmation. Higher win rate expectation but smaller sample.

```
prob    = executiveScore × 0.60 + 18
risk    = riskScore × 0.38             (lower — confirmation filters false signals)
winRate = memoryWinRate × 1.12         (confirmation setups historically better)
```

### Reduce Position

Takes the trade with half the normal risk exposure.

```
prob    = (executiveScore + strategyScore) / 2 × 0.70
risk    = riskScore × 0.48             (proportional reduction)
rr      = 0.3 + (executiveScore / 100) × 1.8  (lower potential, lower downside)
```

### Observation Mode

Monitors without committing capital.

```
prob    = 52 (neutral baseline)
risk    = riskScore × 0.08 (minimal)
rr      = 0  (no position = no P&L)
winRate = marketScore × 0.5 + 30 (informational quality)
```

### Skip Trade

Declines the setup entirely.

```
prob    = 80 + (riskScore >= 65 ? 10 : 0) + (crisisStatus != "none" ? 5 : 0)
risk    = 5  (near-zero)
rr      = 0  (capital preserved)
winRate = 65 + (riskScore >= 65 ? 15 : 0)
```

### Emergency Pause

Halts all trading. Triggered automatically in crisis/survival conditions.

```
prob    = 90 + (crisisStatus == "emergency" ? 7 : 0) + (survivalMode ? 5 : 0)
risk    = 2  (near-zero)
rr      = -0.1  (opportunity cost)
```

---

## Expected Value Formula

For all candidates with a non-zero RR:

```
EV = (probability / 100) × expectedRR - (1 - probability / 100) × 1.0
```

Where `1.0` represents losing 1R (the baseline loss unit).

For `observation_mode`, `skip_trade`, and `emergency_pause`, the EV reflects capital preservation rather than P&L.

---

## Identity Advisor Adjustment

The identity advisor score modulates confidence for active-trading candidates:

```
if d == "execute_trade" or d == "wait_one_candle":
  confidence = confidence × (0.85 + (identityScore / 100) × 0.15)
```

This reduces confidence for setups that deviate from the trader's historical style.

---

## Validation

| Property | Guarantee |
|----------|-----------|
| Probabilities | 0-100 (clamped) |
| Risk scores | 0-100 (clamped) |
| Confidence | 0-100 (clamped) |
| Expected value | Finite float (-∞ not possible) |
| Emergency pause risk | Always < 15 |
| Skip trade capital at risk | Always < 10 |
| 7 candidates produced | Every run |
| No NaN propagation | All inputs validated with fallback |
