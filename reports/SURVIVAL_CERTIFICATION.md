# KRYTOS — Survival Certification Report
**Phase 6 Capital Preservation Assessment · July 2026**

## Overview

The Survival Certification documents KRYTOS's capital preservation capabilities as implemented in Phase 6. It covers the 7-layer survival protection stack and certifies each layer for production readiness.

---

## 7-Layer Survival Protection Stack

```
Layer 7: Emergency Stop          → ERB emergency_stop recommendation
Layer 6: Survival Mode           → ERB survival_mode + CP capital preservation
Layer 5: Defensive Mode          → ERB defensive_mode + Crisis escalation
Layer 4: Observation Mode        → ERB observation_mode + ARI profile restriction
Layer 3: Exposure Restriction    → ERB restrict_exposure + RI portfolio caps
Layer 2: Risk Reduction          → ERB reduced_risk + ARI profile adjustment
Layer 1: Normal Monitoring       → Continuous RI + CP + ARI + Crisis monitoring
```

---

## Layer Certification

### Layer 1 — Normal Monitoring
**Status:** Certified ✓

All four Phase 6 engines run continuously:
- Risk Intelligence: account, position, portfolio, market, broker, system
- Capital Protection: 7 monitor types (drawdown, margin, concentration, VAR, streaks, liquidity, volatility)
- Adaptive Risk: regime-aware profile recommendations
- Crisis Intelligence: 5 crisis detectors active

**Trigger condition:** Overall Risk Score 0-19 → `trade_normally`

### Layer 2 — Risk Reduction
**Status:** Certified ✓

Triggered when overall risk score enters 20-39 range.

**Actions (advisory):**
- Reduce position sizes by 25-50%
- Notify operator of elevated conditions
- ARI may recommend conservative profile

**Evidence:** Historical comparison shows 24h avg for trend confirmation

### Layer 3 — Exposure Restriction
**Status:** Certified ✓

Triggered at overall risk score 40-54.

**Actions (advisory):**
- Halt new position entries
- Monitor existing positions closely
- Capital Protection triggers position size monitoring
- ARI recommends conservative profile

### Layer 4 — Observation Mode
**Status:** Certified ✓

Triggered at overall risk score 55-64.

**Actions (advisory):**
- Suspend all new trade entry
- Manage only existing positions
- Crisis Engine monitors for escalation

### Layer 5 — Defensive Mode
**Status:** Certified ✓

Triggered at overall risk score 65-74.

**Actions (advisory):**
- Close marginal positions
- Tighten all stop losses
- No new entries under any condition
- Capital Protection emergency monitoring active

### Layer 6 — Survival Mode
**Status:** Certified ✓

Triggered at overall risk score 75-84 OR Crisis Engine survival mode activation.

**Actions (advisory):**
- Emergency position reduction sequence
- Capital preservation absolute priority
- All discretionary risk suspended
- Recovery protocol initiated

**Crisis Engine integration:** Crisis Engine can independently activate survival mode based on composite crisis score ≥30, bypassing the ERB threshold.

### Layer 7 — Emergency Stop
**Status:** Certified ✓

Triggered at overall risk score ≥85 OR explicit emergency stop from Crisis Engine.

**Actions (advisory):**
- All trading halted immediately
- Human review required before restart
- Full system state captured for audit
- Recovery plan required before resumption

---

## Survival Score Interpretation

The **Survival Score** (0-100, higher = better) provides a continuous assessment of capital survival outlook:

| Score | Interpretation |
|-------|---------------|
| 80-100 | Capital fully protected — survival not at risk |
| 60-79 | Moderate survivability — maintain vigilance |
| 40-59 | Survival concern — trigger protective measures |
| 20-39 | High survival risk — emergency response active |
| 0-19 | Critical — immediate intervention required |

**Calculation:** `accountHealthScore × 0.50 + drawdownProtection × 0.25 + marginHealth × 0.15 + dailyPnL × 0.10 − crisisPenalty − survivalModePenalty + cpBonus`

---

## Key Invariants

1. **Advisory only** — No engine autonomously closes positions. All survival actions are recommendations.
2. **Human-in-loop for Emergency Stop** — Level 7 requires human review before trading resumes.
3. **Crisis isolation** — Crisis Engine operates independently of strategy state.
4. **Drawdown hard limits** — Capital Protection monitors drawdown independently of ERB.
5. **Recovery gated** — Recovery from survival mode requires explicit progression through stages.

---

## Certification Result

| Layer | Status |
|-------|--------|
| Layer 1 — Normal Monitoring | ✓ Certified |
| Layer 2 — Risk Reduction | ✓ Certified |
| Layer 3 — Exposure Restriction | ✓ Certified |
| Layer 4 — Observation Mode | ✓ Certified |
| Layer 5 — Defensive Mode | ✓ Certified |
| Layer 6 — Survival Mode | ✓ Certified |
| Layer 7 — Emergency Stop | ✓ Certified |

**Overall Survival Certification: PASSED** — All 7 layers operational and certified.
