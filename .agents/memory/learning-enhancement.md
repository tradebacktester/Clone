---
name: Learning System Enhancement (Phase 4)
description: 4-engine reliability/calibration layer — CalibrationBucket collision fix, feature loading pattern, 5 DB tables, 84 tests.
---

## What was built
- `confidence-calibrator.ts` — Brier, ECE, MCE, ACE, 10-bucket reliability diagram
- `regime-transition-detector.ts` — Hurst R/S, rolling vol, ATR, ADX proxy, CUSUM change-point
- `version-controller.ts` — semantic versioning MAJOR/MINOR/PATCH, comparison, changelog
- `quality-monitor.ts` — 8-dimension quality score, alert generation + deduplication
- 5 new DB tables in `lib/db/src/schema/learning-enhancement.ts`
- Route `artifacts/api-server/src/routes/learning-enhancement.ts` (16 endpoints)
- Dashboard page `artifacts/dashboard/src/pages/learning-enhancement.tsx` (5 tabs)

## CalibrationBucket type collision
`recommendation-tracker.ts` already exports `CalibrationBucket`. The confidence calibrator uses `ReliabilityBucket` as the canonical name; a deprecated `CalibrationBucket = ReliabilityBucket` alias is kept for backward compat. The main `index.ts` exports `ReliabilityBucket` (NOT `CalibrationBucket`) from the calibrator.

**Why:** If both are exported with the same name from `lib/market-analysis/src/index.ts`, TypeScript will error at the re-export site.

## Feature loading pattern in enhancement routes
Do NOT use `feature-extractor-bridge.js` — it does not exist as a reachable import for routes. Instead:
```ts
const trades = await db.select().from(tradesTable).where(eq(tradesTable.status, "closed"));
const features = extractFeatures(trades);  // from @workspace/market-analysis
```

**Why:** `extractFeaturesFromTrades` is not exported by any shared lib; `extractFeatures(trades[])` is the correct function signature.

## Test results
- confidence-calibrator: 20/20
- regime-transition-detector: 18/18
- version-controller: 25/25
- quality-monitor: 21/21
- Total: 84/84

## Route/nav wiring
- Route: `/learning-enhancement` (App.tsx)
- Nav: "Learn. Enhance." with Sparkles icon, placed after "Learning Health" in the Learning section
- All routes mount at `/learning/enhancement/*` (app already mounts at `/api`)
