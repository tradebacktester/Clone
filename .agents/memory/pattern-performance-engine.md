---
name: Pattern Performance Engine
description: Advisory pattern knowledge base — 12 categories, evidence-based stats, trend analysis, DB persistence.
---

## Architecture

```
lib/market-analysis/src/learning/pattern-performance/
├── types.ts              — PatternRecord, PatternStats, PatternEvidence, PatternTrend, PatternFilter
├── evidence-validator.ts — wilsonScore, compositeConfidence (gates on MIN_EVIDENCE_SAMPLE), validateEvidence
├── trend-analyzer.ts     — analyzeTrend (last30/100/500 windows, 5% threshold for direction)
├── pattern-analyzer.ts   — analyzePatterns (12 categories), computePatternStats, filterPatterns, rankPatterns
├── pattern-store.ts      — PatternStore class + patternStore singleton (in-process knowledge base)
├── report-generator.ts   — generatePatternReport → PatternReport + markdownContent
└── index.ts              — barrel
```

DB tables: `pattern_records` (upserted), `pattern_trend_snapshots` (append-only).

## Key Rules

- MIN_EVIDENCE_SAMPLE = 5: below → `isInsufficient=true`, confidence=0, show "Insufficient historical evidence."
- compositeConfidence must gate on n < MIN_EVIDENCE_SAMPLE first, or quality + adequacy weights give non-zero score even for n=3.
- Trend direction: 5% winRate delta between last30 and last100 triggers improving/declining.

## API Routes — CRITICAL: route ordering

Routes are in `artifacts/api-server/src/routes/pattern-performance.ts`.  
**`/learning/patterns/status` and `/learning/patterns/report` MUST be registered BEFORE `/learning/patterns/:id`** — otherwise Express treats "status" and "report" as the :id param value and routes them to the wrong handler.

Current order (correct):
1. POST /learning/patterns/analyze
2. GET /learning/patterns (list)
3. GET /learning/statistics
4. GET /learning/trends
5. GET /learning/evidence
6. GET /learning/patterns/report
7. GET /learning/patterns/status
8. GET /learning/patterns/:id  ← LAST

## 12 Pattern Categories

pair, session, regime, zone_quality, liquidity, amd, confirmation, volatility, risk_profile, pair_session, pair_regime, session_regime.

Multi-dim combos (pair_session etc.) only created when group.length >= MIN_EVIDENCE_SAMPLE.

## Tests

- `pattern-analyzer.test.ts`: 54 tests (9 suites)
- `pattern-trends.test.ts`: 27 tests (3 suites)
- Total: 81 tests, all pass.

**Why:**  
Advisory-only engine — never touches strategy execution. All stats must carry sampleSize alongside them. Wilson lower bound gives conservative confidence that scales with evidence, not raw win rate.
