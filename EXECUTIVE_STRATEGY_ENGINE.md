# Executive Strategy Brain — Architecture & Integration

## Overview

The Executive Strategy Brain (ESB) is the capstone of Phase 5 — Strategy Intelligence. It unifies all Strategy Intelligence components into one centralized decision-support system, generating a **Unified Strategy Intelligence Object** for every trading opportunity evaluated.

**Version:** 1.0.0  
**Advisory Only:** Yes — NEVER modifies production strategy or bypasses approval workflow.  
**Phase:** 5 (Final Module)  
**Next Phase:** Phase 6 — Risk Intelligence

---

## Architecture

### Component Map

```
┌─────────────────────────────────────────────────────────────┐
│                  EXECUTIVE STRATEGY BRAIN                    │
│                    (Advisory Only)                           │
│                                                             │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ Rule Engine │  │  SR Engine   │  │   SQI Engine     │  │
│  │  Summary    │  │  (Reasoning) │  │   (Quality)      │  │
│  └──────┬──────┘  └──────┬───────┘  └─────────┬────────┘  │
│         │                │                     │           │
│  ┌──────┴──────┐  ┌──────┴───────┐  ┌─────────┴────────┐  │
│  │  Trader     │  │  Historical  │  │  Market Intel    │  │
│  │  Identity   │  │  Intelligence│  │  Summary         │  │
│  └──────┬──────┘  └──────┬───────┘  └─────────┬────────┘  │
│         │                │                     │           │
│         └────────────────┼─────────────────────┘           │
│                          │                                  │
│              ┌───────────▼───────────┐                     │
│              │   Research Intel      │                     │
│              └───────────┬───────────┘                     │
│                          │                                  │
│              ┌───────────▼───────────┐                     │
│              │  EXECUTIVE SCORER     │                     │
│              │  (7-dimensional)      │                     │
│              └───────────┬───────────┘                     │
│                          │                                  │
│              ┌───────────▼───────────┐                     │
│              │  RECOMMENDER ENGINE   │                     │
│              │  (7-tier + rationale) │                     │
│              └───────────┬───────────┘                     │
│                          │                                  │
│              ┌───────────▼───────────┐                     │
│              │  EXPLAINABILITY ENGINE│                     │
│              │  (full evidence set)  │                     │
│              └───────────┬───────────┘                     │
│                          │                                  │
│  ┌───────────────────────▼────────────────────────────┐    │
│  │         Unified Strategy Intelligence Object       │    │
│  └────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### Module Structure

```
lib/market-analysis/src/executive-brain/
├── types.ts          — All TypeScript types, score weights, recommendation thresholds
├── scorer.ts         — Executive Score computation (7 transparent dimensions)
├── recommender.ts    — Recommendation engine (Elite → Reject) + rationale builder
├── explainer.ts      — Full explainability bundle (rules, history, market, stats)
├── certification.ts  — Institutional audit engine (11 subsystems)
└── index.ts          — Main runExecutiveBrain() + builder helpers
```

---

## Executive Strategy Score

### Dimensions & Weights (Configurable)

| Dimension            | Default Weight | Description |
|---------------------|---------------|-------------|
| Rule Quality         | 20%           | Pass rate + integrity + confidence |
| Strategy Strength    | 20%           | Dampened by confidence reliability |
| Historical Evidence  | 18%           | Win rate + PF + expectancy + RR (sample-discounted) |
| Market Intelligence  | 15%           | Health + opportunity + stability + liquidity |
| Trader Identity      | 12%           | Similarity + alignment + consistency (drift-penalised) |
| Confidence           | 10%           | Reasoning confidence + sample reliability |
| Data Quality         | 5%            | Availability of all subsystem outputs |

Weights are fully transparent and configurable via API body `weights` parameter.

### Recommendation Thresholds

| Level        | Score Range | Label        |
|-------------|-------------|--------------|
| Elite        | 90–100      | Elite Trade  |
| Very Strong  | 80–89       | Very Strong  |
| Strong       | 70–79       | Strong       |
| Acceptable   | 60–69       | Acceptable   |
| Borderline   | 50–59       | Borderline   |
| Weak         | 35–49       | Weak         |
| Reject       | 0–34        | Reject       |

---

## API Routes

All routes mount at `/api` prefix (set by the Express app).

| Method | Path | Description |
|--------|------|-------------|
| POST   | `/api/strategy/executive` | Generate a Unified Strategy Intelligence Object |
| GET    | `/api/strategy/executive` | List recent ESB reports |
| GET    | `/api/strategy/summary`   | Aggregated summary (avg scores, distribution) |
| GET    | `/api/strategy/timeline`  | Paginated timeline for replay |
| GET    | `/api/strategy/certification` | Full institutional audit |
| GET    | `/api/strategy/versions`  | Version manifest for all subsystems |
| GET    | `/api/strategy/readiness` | Quick readiness check |

---

## DB Tables

| Table              | Purpose |
|-------------------|---------|
| `esb_reports`     | Full Unified Strategy Intelligence Object per evaluation |
| `esb_timeline`    | Lightweight timeline for trend analysis and replay |
| `esb_certification` | Certification audit results |

---

## Explainability Engine

Every recommendation includes:
- **Supporting rules** — rule pass rate, integrity, exceptional rules met
- **Historical evidence** — sample size, win rate, PF, avg RR, expectancy, closest match
- **Market evidence** — health, opportunity, regime, volatility, liquidity, stability
- **Statistical evidence** — Wilson 95% CI, sample thresholds, profit factor comparison
- **Confidence interval** — lower/upper bounds using Wilson score method
- **Reliability rating** — high / moderate / low / insufficient
- **Historical references** — top-10 similar trades with similarity scores

No unexplained score is allowed.

---

## Certification Engine

Audits 11 subsystems:
1. Rule Consistency
2. Statistical Validity
3. Explainability
4. Historical Reproducibility
5. Identity Integrity
6. Learning Integrity
7. Research Isolation
8. API Stability
9. Dashboard Functionality
10. Performance
11. Scalability

Each subsystem produces a score (0–100), status (pass/conditional/fail), findings, and recommendations.

---

## Advisory Guarantees

The Executive Strategy Brain:
- ✅ Integrates all Phase 5 intelligence
- ✅ Generates transparent, explainable recommendations
- ✅ Stores every decision for full replay
- ✅ Tracks versions of all subsystems
- ❌ NEVER modifies live trading rules
- ❌ NEVER deploys research automatically
- ❌ NEVER overrides risk controls
- ❌ NEVER bypasses approval workflow
- ❌ NEVER ignores statistical validation
