---
name: Decision Intelligence Engine
description: Phase 3 Prompt 4 — 15-component TIS, 6 recommendation levels, cosine similarity, 3 DB tables, 8 API routes, dashboard at /decision-intelligence; 62 tests pass.
---

## Architecture

- **Library**: `lib/market-analysis/src/learning/decision-intelligence/` — 8 files
  - `types.ts` — TIS_WEIGHTS (15 components sum=1.0), 6 RecommendationLevel, constants
  - `historical-matcher.ts` — 12-dim normalized feature vectors, cosine similarity; vectors stored in DB for future vector search upgrade
  - `setup-scorer.ts` — computeTis() builds all 15 TisComponent scores
  - `factor-analyzer.ts` — extractFactors() returns positive/negative EvidenceFactor[]
  - `confidence-calculator.ts` — 5-factor confidence model (evidence 30%, stability 25%, agreement 20%, consistency 15%, RR 10%)
  - `recommendation-engine.ts` — evaluateSetup() full pipeline orchestrator
  - `di-store.ts` — in-memory singleton; recordOutcome() tracks accuracy
  - `report-generator.ts` — generateMarkdownReport() → DECISION_INTELLIGENCE_REPORT.md

- **DB**: 3 tables — `di_recommendations`, `di_similar_experiences`, `di_recommendation_history`
- **Routes**: `artifacts/api-server/src/routes/decision-intelligence.ts` — named export `decisionIntelligenceRouter`
- **Dashboard**: `artifacts/dashboard/src/pages/decision-intelligence.tsx` — 5-tab view (Overview, TIS Components, Evidence, Factors, Flags)
- **Nav**: "Decision Intel." in AI Engine group at `/decision-intelligence`

## Key Design Decisions

**Why `@workspace/db` and `@workspace/market-analysis` root imports (not deep paths):** esbuild bundles from package roots only. Deep path imports like `@workspace/market-analysis/learning/decision-intelligence` cause esbuild "not exported" errors. Always use root barrel exports in route files.

**Why cosine similarity on 12-dim normalized vectors:** Placeholder for future embedding-based similarity. Vectors are persisted in `di_similar_experiences.feature_vector` (JSONB) so the upgrade to pgvector/Pinecone requires only a query change, not a schema change.

**Why confidence ≠ TIS:** TIS = "how good does this setup look?" Confidence = "how certain are we about that TIS?" A high-TIS setup with 0 similar historical trades still gets low confidence. Both are always reported separately.

**Advisory enforcement:** `isAdvisoryOnly: true` is a compile-time constant on every report. No code path in the engine modifies trades, signals, or strategy parameters.

## TIS Component Weights (verified sum = 1.0)
patternPerformance(0.10) + historicalWinRate(0.10) + sampleSize(0.05) + featureImportance(0.10) + confidenceScore(0.08) + marketRegimeMatch(0.08) + sessionPerformance(0.07) + pairPerformance(0.06) + zoneQuality(0.08) + liquidityQuality(0.06) + amdQuality(0.06) + confirmationQuality(0.05) + volatility(0.04) + spread(0.03) + dataQuality(0.04) = 1.00

## Recommendation Levels (TIS thresholds)
- exceptional ≥ 80 | high_quality ≥ 65 | good_opportunity ≥ 50 | neutral ≥ 35 | low_quality ≥ 20 | avoid < 20

## API Routes
- POST /learning/recommendations/evaluate — main entry point
- GET /learning/recommendations — list with memory fallback
- GET /learning/recommendations/:id — single by uuid
- GET /learning/trade-intelligence — status + last report
- GET /learning/similar-experiences — wins/losses by recommendationId
- GET /learning/recommendation-history — audit log
- POST /learning/recommendations/:id/outcome — record trade outcome + accuracy
- GET /learning/decision-report — generate DECISION_INTELLIGENCE_REPORT.md

## Tests

62 tests, 10 suites. Run: `node_modules/.pnpm/node_modules/.bin/tsx --test lib/market-analysis/src/learning/decision-intelligence/tests/decision-intelligence.test.ts`

No `require()` in test files — ESM only. Use `buildVectorFromSetup()` instead of `buildVectorFromExtracted()` when converting ExtractedFeature to a vector in tests.
