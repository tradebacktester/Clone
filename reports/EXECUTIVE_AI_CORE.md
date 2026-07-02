# EXECUTIVE_AI_CORE.md
## KRYTOS Phase 7 — Executive AI Core Architecture

### Overview
The Executive AI Core is the highest-level decision-making system in KRYTOS. It coordinates every subsystem — Strategy, Market, Risk, Memory, Learning, Identity, and Research — and produces one unified, explainable Executive Decision.

### Guiding Principles
1. **Advisory Only** — The Executive AI recommends; it never autonomously executes.
2. **Transparency** — Every decision includes a full explainability report.
3. **Determinism** — Same inputs produce the same output.
4. **Version Control** — Every decision records engine, weights, and subsystem versions.
5. **Auditability** — All decisions stored permanently in the database.
6. **Safety First** — Risk vetoes always override strategy signals.

### Architecture: 7-Layer Intelligence Stack

```
┌──────────────────────────────────────────────────────────┐
│              Executive AI Core (Phase 7)                 │
│  ┌────────────────────────────────────────────────────┐  │
│  │            Intelligence Aggregator                  │  │
│  │  Strategy │ Market │ Risk │ Memory │ Learn │ ID │ R│  │
│  └──────────────────────┬─────────────────────────────┘  │
│                         │                                │
│  ┌──────────────────────▼─────────────────────────────┐  │
│  │              Weighting Engine v1.0.0                │  │
│  │  Strategy 30% │ Risk 25% │ Market 20% │ Memory 10% │  │
│  │  Learning 8%  │ Identity 5% │ Research 2%           │  │
│  └──────────────────────┬─────────────────────────────┘  │
│                         │                                │
│  ┌──────────────────────▼─────────────────────────────┐  │
│  │              Conflict Resolver                       │  │
│  │  Risk vs Strategy │ Market vs Strategy │ Multi-Sys  │  │
│  └──────────────────────┬─────────────────────────────┘  │
│                         │                                │
│  ┌──────────────────────▼─────────────────────────────┐  │
│  │              Decision Engine                         │  │
│  │  Weighted Composite → Veto Check → Score → Decision │  │
│  └──────────────────────┬─────────────────────────────┘  │
│                         │                                │
│  ┌──────────────────────▼─────────────────────────────┐  │
│  │         Confidence Engine + Explainability           │  │
│  └──────────────────────┬─────────────────────────────┘  │
│                         │                                │
│              Executive Decision Object                   │
│    decision │ score │ confidence │ evidence │ conflicts  │
└──────────────────────────────────────────────────────────┘
```

### Intelligence Sources

| Subsystem | Key Metrics | Source |
|-----------|-------------|--------|
| Strategy Intelligence | executiveScore, rulePassRate, strategyStrength | Executive Strategy Brain (ESB) |
| Market Intelligence | regime, volatility, liquidity, healthScore | Unified Market Intelligence |
| Risk Intelligence | overallRiskScore, survivalScore, capitalHealth | Executive Risk Brain (ERB) |
| Memory Intelligence | historicalWinRate, similarTradeCount, lessons | Memory System |
| Learning Intelligence | overallConfidence, drift, predictionReliability | Learning Engine |
| Trader Identity | identitySimilarityScore, preferenceAlignment | Identity Engine |
| Research Intelligence | researchConfidence, activeProjects | Research Lab (advisory only) |

### Decision Types

| Decision | Score Range | Meaning |
|----------|-------------|---------|
| Trade | ≥ 80 | All systems aligned — optimal entry |
| Wait | 65–79 | Good conditions but not yet optimal |
| Observe | 45–64 | Mixed signals — monitor only |
| Reduce Risk | 30–44 | Risk elevated — reduce exposure |
| Pause Trading | 15–29 | Significant concern — pause new entries |
| Emergency Halt | < 15 | Critical threshold breached — halt all |

### Database Tables
- `eai_decisions` — Full Executive Decision snapshots (JSON payload)
- `eai_timeline` — Lightweight decision history for trend analysis
- `eai_conflicts` — Per-decision conflict records

### API Endpoints
- `GET /api/executive-ai/status` — Current status and score breakdown
- `GET /api/executive-ai/decision` — Run and persist a fresh decision
- `GET /api/executive-ai/history` — Decision timeline
- `GET /api/executive-ai/conflicts` — Conflict history
- `GET /api/executive-ai/evidence` — Explainability for latest or specific decision
- `GET /api/executive-ai/report` — Aggregated analytics

### Test Coverage
- 56/56 tests passing across 11 suites
- Covers: weights, aggregators, dimension scores, vetoes, conflicts, confidence, contributions, explainability, full integration, high-frequency stability
