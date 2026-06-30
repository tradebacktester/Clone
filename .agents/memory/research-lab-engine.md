---
name: Research Lab Engine
description: Phase 5 P4 — Autonomous Research & Self-Evolution Laboratory; sandboxed 17-stage pipeline; human approval gate; production fully isolated.
---

## Key Design Rules

- `isSandboxed: true` and `isAdvisoryOnly: true` are hardcoded on ALL outputs — never omit.
- `affectsProduction: false` hardcoded on ALL code change artifacts.
- No route in research-lab.ts connects to bot_state, paper_engine, broker_engine, or any live table.
- Approval gate: no deployment without explicit POST /research/approve.

## DB Tables (8, prefix rl_)

| Table | Purpose |
|-------|---------|
| `rl_projects` | Research project registry |
| `rl_hypotheses` | Improvement hypotheses |
| `rl_experiments` | Sandboxed experimental versions |
| `rl_code_changes` | Research code change artifacts |
| `rl_comparisons` | Production vs experimental comparison |
| `rl_recommendations` | Deployment recommendations |
| `rl_approval_queue` | Human approval workflow |
| `rl_history` | Full audit log |

## API Routes (13 at /research/*)

GET projects, hypotheses, experiments, code-changes, comparisons, recommendations, approval-queue, history, weaknesses, statistics  
POST run-cycle, approve, reject

## Engine Files

```
lib/market-analysis/src/learning/research-lab/
├── types.ts                   (constants, interfaces, helpers)
├── weakness-detector.ts       (7 weakness checks)
├── hypothesis-generator.ts    (template-driven, 1–5 per cycle)
├── experiment-builder.ts      (sandboxed experiment + code artifacts)
├── validation-pipeline.ts     (10-stage, fail-fast)
├── comparison-engine.ts       (two-proportion z-test, verdict scoring)
├── recommendation-generator.ts(evidence builder, rollback plan)
├── approval-workflow.ts       (approval/reject/degrade detection)
├── research-engine.ts         (runResearchCycle orchestrator)
└── index.ts
```

## Validation Pipeline (10 stages, fail-fast)

historical_backtest → walk_forward → monte_carlo → out_of_sample → cross_pair → regime_validation → drawdown_analysis → robustness → stress_test → paper_simulation

**Why fail-fast:** expensive stages (stress, paper) only run after cheap stages pass. Saves compute and prevents noise data from distorting results.

## Verdict Scoring

```
verdictScore = 50 + sum(min(|pct|,20) for improvements) - sum(min(|pct|,20) for regressions)
≥60 → SUPERIOR  |  45-59 → EQUIVALENT  |  <45 → INFERIOR
```

Recommendation type:
- SUPERIOR + p<0.05 → deploy
- SUPERIOR + p≥0.05 → continue_testing
- EQUIVALENT → continue_testing
- INFERIOR / failed validation → archive

## Import Gotcha

Deep `@workspace/db/schema/*` imports fail in esbuild — always import from `@workspace/db` root only. Research-lab routes already follow this pattern.
