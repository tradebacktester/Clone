---
name: Audit Remediation — all Critical/High fixes applied
description: All Critical and High severity fixes from the 4-part audit — env vars required for production, test runner path, pre-existing TS errors to be aware of.
---

## Reports generated
- CODE_AUDIT_REPORT.md
- SECURITY_AUDIT_REPORT.md
- PERFORMANCE_REPORT.md
- EXPLAINABILITY_AUDIT_REPORT.md
- PRODUCTION_READINESS_AUDIT.md

## All Critical/High fixes now applied (FINAL_REMEDIATION_REPORT.md)

**Rejection reason codes fixed in paper-engine.ts:**
- MTF gate failure → `"mtf_insufficient"`
- TQI gate failure → `"tqi_below_threshold"`
- Correlation gate → `"correlation_blocked"`

**DB indexes added to lib/db/src/schema/trades.ts:**
- `trades_status_pair_opened_idx` on `(status, pair, openedAt)`
- `trades_pair_idx` on `(pair)`
- `trades_opened_at_idx` on `(openedAt)`

**New files:**
- `artifacts/api-server/src/lib/auth.ts` — Bearer token middleware
- `artifacts/api-server/src/lib/crypto.ts` — AES-256-GCM broker key encryption
- `artifacts/api-server/src/lib/__tests__/remediation.test.ts` — 31 tests (all pass)

**Critical fixes:**
1. Auth middleware on all `/api` routes (`API_SECRET_KEY` env var)
2. Broker key encryption at rest (`BROKER_ENCRYPTION_KEY` env var, 64 hex chars)
3. O(n)→O(n log n) `computePeakBalance()` + SQL `FILTER` aggregates for daily/weekly P&L
4. Rate limiting: 200/min global, 5/min for heavy endpoints

**High fixes:**
5. CORS restricted to `ALLOWED_ORIGIN` env var in production
6. vite updated to v8.1.0; linkify-it updated (remaining high is dev-tooling only)
7. `analytics.ts` fully rewrites all routes to Drizzle `sql<string>` aggregates
8. `getPnlSnapshot()` uses single SQL query with FILTER clauses
9. TQI gate is now mandatory (hard rejection when analysis is null)
10. Fallback price gate (refuses positions when `priceEntry.source === "fallback"`)
11. Analyzer `Promise.all` parallelization over 12 pair/tf jobs
12. `String(err)` in HTTP responses replaced with `"Internal server error"` across all routes

## CRITICAL pattern: env vars must be read dynamically
auth.ts and crypto.ts must read `process.env["KEY"]` inside each function call — NOT as a module-level `const KEY = process.env["KEY"]`. If captured at module load time, tests that modify process.env after import will fail.

## Pre-existing typecheck errors (not from our fixes)
- Dashboard: `market.tsx`, `montecarlo.tsx`, `quality.tsx`, `supervisor.tsx`, `trades.tsx`
- `replay.ts:285` BiasRow missing `futureLeakageDetected` — fixed during remediation

## Env vars required before production
- `API_SECRET_KEY` — auth token (any strong string)
- `BROKER_ENCRYPTION_KEY` — 64 hex chars for AES-256-GCM
- `ALLOWED_ORIGIN` — dashboard URL for CORS
- `DATABASE_URL` — already required

## Test runner
`/home/runner/workspace/node_modules/.pnpm/node_modules/.bin/tsx --test <test-file>`

## Medium-priority items intentionally deferred
- Market zone DELETE+INSERT → upsert (requires unique index migration on floating-point price columns — risky to add without analysis)
