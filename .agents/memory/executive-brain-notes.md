---
name: Executive Strategy Brain
description: Phase 5 capstone — unifies all Strategy Intelligence components into one advisory decision-support system with transparent scoring.
---

## Rule

The Executive Strategy Brain (ESB) is the final Phase 5 module. It integrates SR + SQI + TI + Research + Market Intelligence into a single Unified Strategy Intelligence Object (USIO) with a 7-dimensional weighted score (0–100), 7-tier recommendation, full explainability, replay timeline, and 11-subsystem certification audit.

**Why:** All Phase 5 components needed a unified entry point before Phase 6 Risk Intelligence can be built on top.

**How to apply:** When building Phase 6, pull data from `esb_reports` table — the USIO is the canonical advisory signal. Never call individual SR/SQI/TI routes from risk engine; always go through ESB.

## Key architecture

- `lib/market-analysis/src/executive-brain/`: types.ts / scorer.ts / recommender.ts / explainer.ts / certification.ts / index.ts
- `lib/db/src/schema/executive-brain.ts`: 3 tables — esb_reports, esb_timeline, esb_certification
- Routes: POST /strategy/executive, GET /strategy/executive, /summary, /timeline, /certification, /versions, /readiness
- Dashboard: /strategy-command-center (6 tabs: Executive Score, Timeline, Quality & Identity, Research Status, Certification, Version Explorer)
- Nav link: "Command Center" in nav-sidebar.tsx

## Score weights (default, configurable via API `weights` param)

ruleQuality 20%, strategyStrength 20%, historicalEvidence 18%, marketIntelligence 15%, traderIdentity 12%, confidence 10%, dataQuality 5%

## Recommendation thresholds

elite≥90, very_strong≥80, strong≥70, acceptable≥60, borderline≥50, weak≥35, reject<35

## Gotchas

- `computeExecutiveScore` returns `{ executiveScore, weights, breakdown }` — the key is `breakdown`, NOT `scoreBreakdown`
- All routes at /strategy/* — existing SR routes also use /strategy/* so no conflict, ESB uses /strategy/executive|summary|timeline|certification|versions|readiness
- isAdvisoryOnly is hardcoded true everywhere — enforced at engine + route + DB schema level
- Certification grade C (score 70) on fresh install is expected — improves as reports accumulate
- 70 tests pass; tsx runner: node_modules/.pnpm/node_modules/.bin/tsx
