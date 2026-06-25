---
name: Trade Memory Engine
description: Architecture, formulas, and hook points for the trade memory and self-improvement system.
---

## Cluster Key Format
`z:<bucket>|l:<bucket>|a:<bucket>|c:<bucket>|s:<session>`
Buckets: `<70` | `70-79` | `80-89` | `90+`

## Dynamic Confidence Adjustment
Only when cluster has ≥10 closed trades:
- base = (winRate - 55) × 0.5
- rolling penalty: if last 10 WR < 40% → additional −10
- capped: [−30, +30]

**Why:** Needs minimum sample to be statistically meaningful; 55% is the target baseline; rolling window catches sudden deterioration.

## Ranking Composite
`WR×0.4 + (PF×10)×0.3 + (avgRR×10)×0.2 + sampleBonus×0.1`
- PF capped at 5, avgRR capped at 4, sampleBonus = min(trades/50,1)×10

## DB Tables
- `trade_memory` — 1 row per executed trade, linked to tradesTable by tradeId (unique)
- `missed_opportunities` — 1 row per rejected signal, aftermath updated async via price feed
- `setup_confidence_profiles` — 1 row per cluster key (unique index), rank column recomputed after every close

## Hook Points in paper-engine.ts
- Signal selected BEFORE rejection checks so missed opportunities can reference the specific signal
- `db.insert(tradesTable).returning({ id })` → feeds tradeId to `recordTradeMemory()`
- After `db.update(tradesTable)` on close → `closeTradeMemory()` + async `updateClusterProfile()`
- Three rejection reasons recorded: `max_open_trades`, `pair_already_open`, `below_confidence`

## API Routes (all GET)
`/analytics/memory/summary` | `/analytics/memory/trades` | `/analytics/memory/missed`
`/analytics/memory/confidence-profiles` | `/analytics/memory/top-setups`

## Frontend Import Pattern
Uses `@workspace/api-client-react` (not `@workspace/api-spec/generated`)
