# Phase 7.2 — Safety Gate Reference

## Overview

The Safety Gate Validation is Stage 5 of the 5-stage Autonomous Executive Reasoning pipeline. It is the final pre-decision check before the engine commits to a recommendation. Seven gates are evaluated in sequence; critical failures prohibit trading.

**Key principle:** Safety gates can only *restrict* decisions — they never *promote* a more aggressive action.

---

## Gate Definitions

### Gate 1: Deterministic Strategy
- **Input:** `rulePassRate` (from Executive Strategy Brain)
- **Threshold:** ≥ 70%
- **Severity:** Critical
- **Logic:** The AMD/SMC rule engine must have a majority pass rate. Below 70% means the deterministic rule layer has rejected this setup.

### Gate 2: Risk Limits
- **Input:** `erbRiskScore` (from Executive Risk Brain overall risk score)
- **Threshold:** ≤ 65 (risk must be *below* this)
- **Severity:** Critical
- **Logic:** The consolidated risk brain aggregates 4 risk engines. An overall risk above 65 means the capital preservation constraint is at risk.

### Gate 3: Capital Protection
- **Input:** `capitalHealthScore` (from ERB capital health)
- **Threshold:** ≥ 40%
- **Severity:** Critical
- **Logic:** Capital health below 40% indicates the survival engine has flagged imminent capital depletion. Trading is prohibited.

### Gate 4: Emergency Mode
- **Input:** `crisisStatus`, `survivalModeActive`
- **Threshold:** `crisisStatus !== "emergency"` AND `!survivalModeActive`
- **Severity:** Critical
- **Logic:** Binary gate. Any active emergency or survival mode immediately prohibits trading regardless of other scores.

### Gate 5: Data Integrity
- **Input:** `evidenceQuality` (from Stage 1 evidence collection, 0–100)
- **Threshold:** ≥ 50%
- **Severity:** Warning
- **Logic:** If less than half of evidence items are valid, the decision is unreliable. Trading is still permitted but confidence is penalised.

### Gate 6: Broker Reliability
- **Input:** `brokerReliability` (from ERB broker reliability score)
- **Threshold:** ≥ 60%
- **Severity:** Warning
- **Logic:** A degraded broker may cause slippage, order rejection, or disconnects. Below 60% is a warning but does not prohibit trading.

### Gate 7: Executive Confidence
- **Input:** `executiveConfidence` (from EAI confidence engine overall score)
- **Threshold:** ≥ 55%
- **Severity:** Warning
- **Logic:** Low overall executive confidence means the system is uncertain about its own recommendation. Trading is permitted but noted.

---

## Trading Permission Logic

```
tradingPermitted = (criticalFailedGates.length === 0)
allPassed        = (allGates.every(g => g.passed))
```

If `tradingPermitted = false` and the deliberation engine selected "trade", the final action is overridden to "observe" — the safest non-halt override.

---

## Override Message Examples

| Scenario | Message |
|----------|---------|
| All gates pass | `null` (no override) |
| Risk gate fails | `Trade prohibited: Risk Limits gate(s) failed` |
| Emergency mode active | `Trade prohibited: Emergency Mode gate(s) failed` |
| Only warning gates fail | `Warning: Data Integrity, Broker Reliability gate(s) failed but trading permitted with caution` |

---

## Threshold Constants

```typescript
const GATE_THRESHOLDS = {
  rulePassRate:        70,
  erbRiskScore:        65,   // risk must be BELOW this
  capitalHealthScore:  40,
  evidenceQuality:     50,
  brokerReliability:   60,
  executiveConfidence: 55,
};
```

These are exported as `GATE_THRESHOLDS` from the engine for dashboard display and test assertions.
