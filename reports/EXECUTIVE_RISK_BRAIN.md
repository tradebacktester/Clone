# Executive Risk Brain (ERB) — System Report
**Phase 6 Completion · July 2026**

## Executive Summary

The Executive Risk Brain (ERB) is the capstone of Phase 6 Risk Intelligence. It unifies all four Phase 6 subsystems — Risk Intelligence (RI), Capital Protection (CP), Adaptive Risk Intelligence (ARI), and Crisis Intelligence — into one centralized risk decision engine, producing a single authoritative **Executive Risk Intelligence Object** (ERIO) at every evaluation point.

**Status:** Production-ready · Advisory only · All tests passing (72/72)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                  Executive Risk Brain (ERB)                     │
│                     lib/market-analysis/src/executive-risk-brain│
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌────────────┐  ┌─────────────┐  │
│  │   RI     │  │   CP     │  │    ARI     │  │   Crisis    │  │
│  │  Engine  │  │  Engine  │  │   Engine   │  │   Engine    │  │
│  └────┬─────┘  └────┬─────┘  └─────┬──────┘  └──────┬──────┘  │
│       │              │              │                 │         │
│       └──────────────┴──────────────┴─────────────────┘         │
│                              │                                   │
│                    ┌─────────▼─────────┐                        │
│                    │  Intelligence     │                        │
│                    │  Aggregator       │                        │
│                    └─────────┬─────────┘                        │
│                              │                                   │
│              ┌───────────────┼───────────────┐                  │
│              ▼               ▼               ▼                  │
│         ┌────────┐    ┌──────────┐    ┌──────────┐             │
│         │ Scorer │    │Recommender│   │Explainer │             │
│         │7 scores│    │ 7 levels │    │full trail│             │
│         └────────┘    └──────────┘    └──────────┘             │
│              │               │               │                  │
│              └───────────────┴───────────────┘                  │
│                              │                                   │
│                    ┌─────────▼─────────┐                        │
│                    │  Executive Risk   │                        │
│                    │  Intelligence     │                        │
│                    │  Object (ERIO)    │                        │
│                    └───────────────────┘                        │
└─────────────────────────────────────────────────────────────────┘
```

---

## 7 Executive Risk Scores

| Score | Range | Direction | Description |
|-------|-------|-----------|-------------|
| **Overall Risk Score** | 0-100 | Higher = Worse | Multi-dimensional composite |
| **Survival Score** | 0-100 | Higher = Better | Capital survival outlook |
| **Capital Health Score** | 0-100 | Higher = Better | Account/margin health |
| **Infrastructure Score** | 0-100 | Higher = Better | System health |
| **Broker Reliability Score** | 0-100 | Higher = Better | Broker quality |
| **Portfolio Stability Score** | 0-100 | Higher = Better | Portfolio exposure health |
| **Recovery Confidence Score** | 0-100 | Higher = Better | Recovery outlook |

### Weight Table (Overall Risk Score Composition)

| Dimension | Weight | Rationale |
|-----------|--------|-----------|
| Account Health | 25% | Most direct capital risk indicator |
| Position Risk | 15% | Active exposure contribution |
| Portfolio Stability | 15% | Multi-position correlation/bias |
| Market Risk | 15% | External environmental risk |
| Broker Reliability | 10% | Execution quality risk |
| System Health | 8% | Infrastructure continuity |
| Crisis Score | 7% | Acute crisis state |
| Adaptive Risk | 5% | Profile alignment |

---

## 7-Level Recommendation Engine

| Level | Threshold | Label | Description |
|-------|-----------|-------|-------------|
| 1 | 0-19 | Trade Normally | All dimensions within safe parameters |
| 2 | 20-39 | Reduced Risk | Reduce position sizes 25-50% |
| 3 | 40-54 | Restrict Exposure | Limit new trades, monitor closely |
| 4 | 55-64 | Observation Mode | Pause new entries, manage existing |
| 5 | 65-74 | Defensive Mode | Close marginal positions, tighten stops |
| 6 | 75-84 | Survival Mode | Emergency position reduction |
| 7 | 85+ | Emergency Stop | Halt all trading, human review required |

---

## Explainability Layer

Every recommendation includes:
- **Why this recommendation** — natural language narrative
- **Top contributing subsystem** — which dimension drove the score
- **Triggering metrics** — specific thresholds breached
- **Active protections** — what safeguards are currently active
- **Historical context** — comparison to recent evaluations
- **Confidence interval** — `[lower, upper]` range with uncertainty
- **Reliability rating** — `high | moderate | low | insufficient`
- **Subsystem contributions** — all 8 dimensions ranked by impact

---

## Database Tables

| Table | Rows | Purpose |
|-------|------|---------|
| `erb_reports` | Full ERIO snapshots | Replay and audit |
| `erb_decisions` | Lightweight timeline | Full decision replay |
| `erb_certification` | 13-point audit results | Institutional compliance |

---

## API Endpoints

| Route | Method | Description |
|-------|--------|-------------|
| `/api/executive-risk/status` | GET | Quick status — overall risk, recommendation, key scores |
| `/api/executive-risk/object` | GET | Full Executive Risk Intelligence Object |
| `/api/executive-risk/history` | GET | Risk Decision Timeline with replay support |
| `/api/executive-risk/recommendation` | GET | Recommendation with full evidence |
| `/api/executive-risk/readiness` | GET | 13-point Risk Readiness Certification |
| `/api/executive-risk/report` | GET | Aggregated report — trends, distributions |

---

## Test Coverage

- **Total:** 72 tests across 25 suites
- **Pass rate:** 100% (72/72)
- **Suites:** clamp, scorers, survival, capital health, overall scores, recommendations, historical comparison, explainability, intelligence builders, full ERB, certification, stability
