---
name: Trader Intelligence Layer (Vasu Decision Model)
description: Advisory-only learning system that records discretionary decisions and learns trader behavior. Never touches execution engine.
---

## Rule
This layer is READ-ONLY with respect to the execution engine. It NEVER modifies strategy rules, risk management, entries, or exits.

## Architecture
- DB: `ti_decisions` (all setup evaluations) + `ti_screenshots` (screenshot attachments)
- API routes: `artifacts/api-server/src/routes/trader-intelligence.ts` — all under `/ti/*`
- Dashboard: `artifacts/dashboard/src/pages/trader-intelligence.tsx` — route `/trader-intelligence`
- Nav icon: `Lightbulb` from lucide-react

## Key Design Decisions

**Similarity Engine:** Uses Euclidean distance on 5-score vector (zone, liquidity, AMD, confirm, TQI). Max possible distance is sqrt(5 × 100²) ≈ 223.6; similarity = round((1 - dist/223.6) × 100). Returns 0–100. Architecture is ready for vector embeddings (pgvector) when an AI model is wired up — just add an `embedding` column to `ti_decisions`.

**Why score-based similarity:** Full image embedding (CLIP/OpenAI) requires external API. Score vector similarity gives meaningful results immediately and is O(n) on any reasonable number of decisions.

**Context tags:** Stored as JSON string array in `contextTags` column (not a normalized join table). Fast for display, fine for filtering at application layer. If tag-based analytics become important, a separate `ti_context_tags` table with a FK can be added without breaking existing data.

**Screenshots:** `ti_screenshots` stores URL/path + label + notes. The advisory system doesn't need to actually host or embed images — the trader just pastes a path reference. Embedding vectors can be added as a nullable column when vision API is available.

## API Endpoints
- `GET/POST /ti/decisions` — list / create decisions
- `GET/PATCH /ti/decisions/:id` — detail / update outcome+notes
- `POST /ti/decisions/:id/screenshots` — attach screenshot
- `GET /ti/similar` — top-10 most similar by score vector (requires all 5 scores as query params)
- `GET /ti/recommendation` — stats for similar setups (totalMatches, winRate, profitFactor, avgRr, avgConfidence, recentComments)
- `GET /ti/psychology` — confidence analytics (overTime, byPair, bySession, byRegime, byDecision, streakEffect)
- `GET /ti/comparison` — engine vs trader agreement (bothAccepted, bothRejected, botAcceptedTraderRejected, traderAcceptedBotRejected)
- `POST /ti/report` — generates TRADER_INTELLIGENCE_REPORT.md

## Dashboard Tabs
Timeline | Log Decision | Similar Setups | Recommendation | Psychology | Engine vs Me

## Tests
46 tests in `artifacts/api-server/src/lib/__tests__/trader-intelligence.test.ts` — all pure logic (no DB), covering: similarity engine (7), decision validation (11), context tag parsing (5), psychology confidence (3), engine vs trader comparison (10), recommendation stats (7), report generation (2).
