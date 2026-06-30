---
name: Trader Identity Engine
description: Phase 5 P3 — 2-stage dynamic identity model with preference discovery, cosine similarity scoring, drift detection, and strategy consistency evaluation.
---

## Architecture

7-file library at `lib/market-analysis/src/learning/trader-identity/`:
- `types.ts` — all interfaces, constants (TI_ENGINE_VERSION, MIN_SAMPLE_FOR_ADAPTIVE=20, MIN_PREFERENCE_SAMPLE=8), helpers (clamp, consistencyFromScore, cosineSimilarity, featureVector, driftSeverityFromScore)
- `rule-identity.ts` — Stage 1: 9 deterministic rule checks with weighted scoring
- `preference-analyzer.ts` — Stage 2: statistical preference discovery (Wilson LB, Cohen's h, lift vs baseline)
- `similarity-calculator.ts` — Rule/historical/preference similarity + composite IdentitySimilarityScore
- `consistency-evaluator.ts` — 5-level consistency verdict with evidence array
- `drift-detector.ts` — rolling-window drift across 10 dimensions (continuous + categorical)
- `report-generator.ts` — narrative builder

## DB Tables (5 tables, all prefixed `ti_`)

- `ti_identity_profiles` — versioned snapshots (auto-saved on every profile GET)
- `ti_similarity_reports` — per-setup evaluations (saved on POST /identity/similarity)
- `ti_preference_discoveries` — statistical evidence per preference
- `ti_drift_events` — detected behavioral drift events
- `ti_identity_versions` — lightweight timeline (event+summary+confidence)

## API Routes (8 total, all at /identity/*)

Routes are at `/identity/*` not `/api/identity/*` — app mounts at /api.

- GET `/identity/profile` — current identity; auto-saves profile + version snapshots
- POST `/identity/similarity` — evaluate setup, saves to ti_similarity_reports
- GET `/identity/similarity` — list reports; supports ?pair= and ?minScore= filters
- GET `/identity/preferences` — discovered preferences with statistical evidence
- GET `/identity/drift` — drift detection, persists significant events to DB
- GET `/identity/history` — identity version timeline
- GET `/identity/report` — comprehensive summary (no DB writes)
- GET `/identity/statistics` — aggregate counts for dashboard stats bar

## Stage Transition

Stage 1 (Rule Identity) → Stage 2 (Adaptive Identity) at MIN_SAMPLE_FOR_ADAPTIVE=20 trades.
Before 20 trades: preference alignment score defaults to neutral (50/100); identity is purely rule-based.
After 20 trades: preferences are discovered; composite similarity weights shift (Rule: 70→45%, Pref: 0→25%).

## Similarity Weights

Stage 1: Rule 70%, Historical 30%, Preference 0%
Stage 2: Rule 45%, Historical 30%, Preference 25%

**Why:** Adaptive identity should not dominate until sufficient evidence; rules always anchor the identity.

## Preference Discovery Criteria

A preference is flagged isSignificant=true when:
- Sub-group size ≥ 8 trades (MIN_PREFERENCE_SAMPLE)
- Confidence ≥ 65% (combined sample_factor×0.6 + effect_factor×0.4)
- Win-rate lift vs baseline ≥ 5pp absolute
- Effect type set (positive/negative based on ≥5pp vs ≤-5pp)

## Drift Detection

Uses midpoint-split of chronological trade history.
Continuous dims (score/TQI/RR): significant if |change%|>10% AND effect>0.08
Categorical dims (pair/session/regime): uses Cohen's h; significant if h≥0.2 AND |change%|≥10%
Requires at least 20 total trades (10 per half-window).

## Advisory Guarantee

`isAdvisoryOnly: true` hardcoded on every report object AND at the DB insert level.
No route touches paper-engine, bot-state, or broker-engine. Enforced by design.
