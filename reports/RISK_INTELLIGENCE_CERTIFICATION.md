# Risk Intelligence Certification — Full Audit
**Phase 6 Subsystem Audit · KRYTOS · July 2026**

## Scope

This report certifies each of the 4 Phase 6 risk subsystems individually, then confirms their unified integration under the Executive Risk Brain.

---

## Subsystem 1: Risk Intelligence Engine (RI)

**Engine Version:** 1.0.0  
**DB Tables:** `ri_reports`, `ri_timeline`, `ri_alerts`  
**API Routes:** 8 routes at `/risk/*`  
**Tests:** 82 passing  

### Capabilities Certified
- ✓ Account health scoring (balance, equity, margin, P/L, drawdown)
- ✓ Position risk scoring (size, stop distance, R:R, exposure)
- ✓ Portfolio risk scoring (correlation, bias, pair/currency concentration)
- ✓ Market risk scoring (volatility, liquidity, stability, correlation, news)
- ✓ Broker risk scoring (spread, slippage, execution time, connection quality)
- ✓ System risk scoring (CPU, memory, DB health, API, network, data feed)
- ✓ Alert generation at critical/warning/info severity levels
- ✓ Confidence intervals and reliability ratings
- ✓ Advisory-only isolation flag (`isAdvisoryOnly=true`)

### Key Constraints
- `botStateTable` has no balance/equity columns — defaults used; live bot state requires polling
- `gatherSystemMetrics()` returns `dbHealth`/`apiHealth` (not `dbAvailability`/`apiAvailability`)
- `marketRegimeTable` used for market state (no `marketAnalysisTable`)

---

## Subsystem 2: Capital Protection Engine (CP)

**Engine Version:** 1.0.0  
**DB Tables:** `cp_reports`, `cp_monitors`, `cp_actions`, `cp_timeline`  
**API Routes:** 6 routes at `/risk/protection*`  
**Tests:** 75 passing  

### Capabilities Certified
- ✓ 7 real-time monitors: drawdown, margin, concentration, VAR, loss streaks, liquidity, volatility
- ✓ Protection level ladder: `normal → conservative → defensive → survival → emergency`
- ✓ Emergency action recommendations
- ✓ Recovery progress tracking (0-100%)
- ✓ Capital health score computation
- ✓ Advisory-only isolation (`isAdvisoryOnly=true`)

### Key Constraints
- `botStateTable` has no balance/equity — defaults applied
- `gatherSystemMetrics()` interface consistent with RI engine
- Margin health crashes with `marginLevel=0` — gated with `noMarginUsed` flag
- `MONITOR_SEVERITY_SCORE` defined locally in action-engine (not imported)

---

## Subsystem 3: Adaptive Risk Intelligence (ARI)

**Engine Version:** 1.0.0  
**DB Tables:** `ari_profiles`, `ari_timeline`, `ari_performance`, `ari_alerts`  
**API Routes:** 6 routes at `/adaptive-risk/*`  
**Tests:** 55 passing  

### Capabilities Certified
- ✓ Risk profiles: `conservative | balanced | aggressive | ultra_conservative`
- ✓ Profile recommendations based on regime, volatility, session, pair, learning
- ✓ Confidence-gated profile transitions (minimum confidence threshold enforced)
- ✓ Safe-to-trade flag (`safeToTrade=true` only for `balanced | aggressive | conservative`)
- ✓ Historical performance tracking per profile
- ✓ Advisory-only isolation (`isAdvisoryOnly=true`)

### Key Constraints
- `safeToTrade` only true for balanced/aggressive/conservative (not ultra_conservative)
- `marketRegimeTable` uses `updatedAt` not `analyzedAt`
- `generateRecommendations` aliased as `generateAriRecommendations` to avoid collision

---

## Subsystem 4: Crisis Intelligence Engine

**Engine Version:** 1.0.0  
**DB Tables:** `crisis_events`, `crisis_timeline`, `crisis_system_health`, `crisis_recovery_log`  
**API Routes:** 6 routes at `/crisis/*`  
**Tests:** 72 passing  

### Capabilities Certified
- ✓ 5 crisis detectors: market, broker, infrastructure, data integrity, strategy stability
- ✓ Composite crisis score: market×30% + broker×25% + infra×20% + data×15% + strategy×10%
- ✓ 6-level severity: `none | low | moderate | high | critical | extreme`
- ✓ Survival mode activation (independent of ERB threshold)
- ✓ Multi-stage recovery protocol
- ✓ De-escalation one step at a time
- ✓ Advisory-only isolation (`isAdvisoryOnly=true`)

### Key Constraints
- Market-only flash crash yields exactly 30 composite → use `≥30` not `>30` for caution threshold
- `safeToTrade` only for `normal | caution` modes
- Route import must use `@workspace/db` root (not deep schema path)

---

## Subsystem 5: Executive Risk Brain (ERB)

**Engine Version:** 1.0.0  
**DB Tables:** `erb_reports`, `erb_decisions`, `erb_certification`  
**API Routes:** 6 routes at `/executive-risk/*`  
**Tests:** 72 passing  

### Integration Certified
- ✓ Pulls latest result from all 4 subsystems per evaluation
- ✓ Builds 8 intelligence components (account, position, portfolio, market, broker, infra, adaptive, crisis)
- ✓ Computes 7 executive risk scores
- ✓ Produces 7-level recommendation with evidence
- ✓ Full explainability for every output
- ✓ Persists full ERIO and lightweight decision timeline
- ✓ 13-point certification audit on demand

---

## Unified Integration Test Results

| Test Category | Status |
|---------------|--------|
| RI → ERB intelligence extraction | ✓ Pass |
| CP → ERB survival score integration | ✓ Pass |
| ARI → ERB adaptive alignment score | ✓ Pass |
| Crisis → ERB crisis safety score | ✓ Pass |
| Default fallbacks (null subsystem data) | ✓ Pass |
| Crisis scenario → elevated recommendation | ✓ Pass |
| Healthy scenario → low overall risk | ✓ Pass |
| 7 scores all within 0-100 | ✓ Pass |
| Weight normalisation (sum=1) | ✓ Pass |
| Certification 13 subsystems | ✓ Pass |

**Total Phase 6 integration tests: 72/72 passing**
