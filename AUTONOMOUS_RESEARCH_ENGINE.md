# Autonomous Research & Self-Evolution Engine

**Version:** 1.0.0  
**Phase:** 5 — Prompt 4/5  
**Classification:** Advisory Only — Sandboxed Research Environment  
**Date:** 2026-06-30

---

## Overview

The Autonomous Research & Self-Evolution Laboratory gives KRYTOS the ability to continuously analyze its own performance, generate hypotheses, build experimental strategy versions, validate improvements with institutional-grade statistical testing, and present evidence-based deployment recommendations for human approval.

**The production trading engine is never touched.** Every experiment runs inside a fully isolated research sandbox.

---

## Two-System Architecture

### Production KRYTOS
- Executes trades
- Manages positions
- Follows approved strategies
- Never modifies itself
- Never executes experimental code

### Research KRYTOS (This Engine)
- Analyzes performance
- Detects weaknesses
- Generates hypotheses
- Modifies research code artifacts
- Creates experimental strategy versions
- Runs simulations and validation
- Presents deployment requests for approval

---

## Self-Evolution Pipeline

Every improvement cycles through 17 stages:

```
1.  Observe Live Performance
2.  Detect Weakness
3.  Generate Hypothesis
4.  Modify Research Code
5.  Build Experimental Strategy
6.  Offline Training
7.  Historical Backtest
8.  Walk-Forward Validation
9.  Monte Carlo Simulation
10. Sensitivity Analysis
11. Cross-Pair Validation
12. Market Regime Validation
13. Drawdown Analysis
14. Robustness Testing
15. Stress Testing
16. Paper Trading Simulation
17. Compare with Production → Evidence → Recommendation → Human Approval
```

---

## Weakness Detection Categories

| Category | Target | Detection Method |
|----------|--------|-----------------|
| win_rate | ≥45% | Overall win rate check |
| avg_rr | ≥1.5 | Average realized R:R |
| profit_factor | ≥1.3 | Gross profit / gross loss |
| setup_quality | ≥45% WR on low-score trades | Sub-threshold trade analysis |
| regime_performance | ≥40% per regime | Regime-segmented win rate |
| session_performance | ≥40% per session | Session-segmented win rate |
| tqi_gate | Win rate gap <10pp | High-TQI vs low-TQI comparison |

---

## Hypothesis Types

| Type | Description |
|------|-------------|
| rule_change | Modifies a core strategy rule |
| threshold_change | Adjusts a numeric threshold |
| feature_addition | Adds a new input feature |
| model_change | Changes a scoring model |
| filter_change | Adds or tightens a filter |

---

## Validation Pipeline (10 Stages)

| Stage | Method | Pass Criteria |
|-------|--------|--------------|
| historical_backtest | Filtered backtest | WR≥40%, PF≥1.1 |
| walk_forward | 5-fold chronological | Avg WR≥38%, StdDev<15pp |
| monte_carlo | 10k simulations | Ruin prob<10%, WR≥38% |
| out_of_sample | Last 20% OOS set | OOS WR≥38% |
| cross_pair | Per-pair validation | No pair fails WR<35% |
| regime_validation | Per-regime check | No regime fails WR<30% |
| drawdown_analysis | Rolling equity curve | Max drawdown <25% |
| robustness | ±5% perturbation test | WR≥38% under stress |
| stress_test | 30% spread, 50% slippage shock | Stressed WR≥35% |
| paper_simulation | Last-30 simulated trades | Paper WR≥38%, RR≥1.2 |

Failure at any stage immediately halts the pipeline and marks the experiment as failed.

---

## Code Change Validation Requirements

Every research code change artifact must pass:
- Automated tests (testsPassed: true)
- Static analysis (staticAnalysis: true)
- Security check (securityCheck: true)
- Performance benchmark (perfBenchmark: true)
- affectsProduction: always false
- isResearchOnly: always true

---

## Comparison Statistics

The performance comparison engine uses:

| Test | Method |
|------|--------|
| Win rate significance | Two-proportion z-test |
| Sharpe improvement | Percentage delta |
| Overall verdict | Scoring rubric (improvements minus regressions) |
| Effect threshold | p<0.05 for statistical significance |

---

## Database Schema

| Table | Purpose |
|-------|---------|
| `rl_projects` | Research project registry |
| `rl_hypotheses` | Improvement hypotheses |
| `rl_experiments` | Experimental strategy versions |
| `rl_code_changes` | Research code change artifacts |
| `rl_comparisons` | Production vs experimental metrics |
| `rl_recommendations` | Deployment recommendations |
| `rl_approval_queue` | Human approval workflow |
| `rl_history` | Full reproducible audit log |

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/research/projects` | List research projects |
| GET | `/api/research/hypotheses` | List hypotheses |
| GET | `/api/research/experiments` | List experiments |
| GET | `/api/research/code-changes` | List code change artifacts |
| GET | `/api/research/comparisons` | Performance comparisons |
| GET | `/api/research/recommendations` | Deployment recommendations |
| GET | `/api/research/approval-queue` | Pending approvals |
| POST | `/api/research/approve` | Approve a recommendation |
| POST | `/api/research/reject` | Reject/defer a recommendation |
| GET | `/api/research/history` | Full audit log |
| POST | `/api/research/run-cycle` | Trigger full research cycle |
| GET | `/api/research/weaknesses` | Detect current weaknesses |
| GET | `/api/research/statistics` | Aggregate statistics |

---

## Engine Architecture

```
lib/market-analysis/src/learning/research-lab/
├── types.ts                   # All interfaces, constants, helpers
├── weakness-detector.ts       # 7 weakness checks
├── hypothesis-generator.ts    # Template-based hypothesis generation
├── experiment-builder.ts      # Sandbox experiment creation
├── validation-pipeline.ts     # 10-stage validation
├── comparison-engine.ts       # Statistical production comparison
├── recommendation-generator.ts# Evidence-based recommendations
├── approval-workflow.ts       # Human approval + rollback detection
├── research-engine.ts         # Main orchestrator (run-cycle)
└── index.ts                   # Public API exports
```

---

## Advisory Guarantee

This engine is permanently advisory only:
1. `isAdvisoryOnly: true` hardcoded on all outputs
2. `isSandboxed: true` hardcoded on all experiments
3. `affectsProduction: false` hardcoded on all code change artifacts
4. No route connects to paper-engine, broker-engine, or bot-state
5. No automatic deployment — human approval required at every step
6. Rollbacks also require approval — never automatic
