---
name: 5-Part Audit Findings
description: Code, Security, Performance, Explainability, Production-Readiness audit — key decisions and fixes applied.
---

## Reports generated
- CODE_AUDIT_REPORT.md
- SECURITY_AUDIT_REPORT.md
- PERFORMANCE_REPORT.md
- EXPLAINABILITY_AUDIT_REPORT.md
- PRODUCTION_READINESS_AUDIT.md

## Code fixes applied during audit

**Rejection reason codes fixed in paper-engine.ts:**
- MTF gate failure → `"mtf_insufficient"` (was `"below_confidence"`)
- TQI gate failure → `"tqi_below_threshold"` (was `"below_confidence"`)
- Correlation gate → `"correlation_blocked"` (was `"pair_already_open"`)

**Why:** Wrong reason codes made the learning engine and missed-opportunity analytics unable to distinguish failure modes.

**DB indexes added to lib/db/src/schema/trades.ts:**
- `trades_status_pair_opened_idx` on `(status, pair, openedAt)`
- `trades_pair_idx` on `(pair)`
- `trades_opened_at_idx` on `(openedAt)`

**App.tsx code splitting:** All 23 pages converted from static imports to `React.lazy()` + `Suspense`. Reduces initial bundle by ~60-70%.

**Per-trade explanation API:** `GET /api/trades/:id/explanation` added to routes/trades.ts — returns the stored JSONB explanation or 404 if unavailable.

**Trades page UI:** Full expandable explanation panel in trades.tsx — every rule score, MTF alignment, TQI breakdown, confidence factors, risk assessment.

## Critical production blockers (not yet implemented)
- No authentication on any endpoint (CRITICAL — highest priority)
- Broker API keys stored in plaintext in DB (need AES-256-GCM at application layer)
- No rate limiting (express-rate-limit needed)
- O(n²) peak balance calculation in paper-engine.ts (lines 242-246) — blocks event loop at scale

## Key performance findings
- `executePaperSignals()` fetches ALL closed trades on every call (12x per 10-minute cycle)
- Analytics routes aggregate in JS instead of SQL (SUM/AVG/COUNT in Postgres needed)
- Market zones DELETE+INSERT on every analysis run causes empty-state flicker

## Security findings
- CORS wildcard: `app.use(cors())` — restrict to known origin
- `String(err)` in 500 responses: leaks internal details (historical.ts, deployment.ts etc.)
- 8 dependency vulnerabilities: 2 high (qs, @babel/core), 4 moderate, 2 low
- Yahoo Finance fallback prices used silently when feed fails — should halt new trades
