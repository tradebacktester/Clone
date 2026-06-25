# Trade Memory & Self-Improvement Engine — Implementation Report

## Overview

The Trade Memory Engine gives TradeClone AI the ability to learn from its own history. Every executed trade is recorded with full component scores, every rejected signal is captured as a missed opportunity, and setups are automatically clustered into performance groups that receive dynamic confidence adjustments over time.

---

## Objective 1 — Record Every Trade with Component Scores

**Schema:** `trade_memory` table (PostgreSQL via Drizzle ORM)

Every paper trade is recorded on open with the following component scores from the `TradeSignal` interface:

| Column | Description |
|---|---|
| `zone_score` | Supply/demand zone quality (0–100) |
| `liquidity_score` | Liquidity sweep strength (0–100) |
| `amd_score` | Accumulation/Manipulation/Distribution phase score (0–100) |
| `confirmation_score` | Entry confirmation strength (0–100) |
| `final_score` | Weighted composite of all four components |
| `confidence` | Final signal confidence passed to execution |

Additional fields captured: pair, direction, session, regime, zone type, AMD pattern, Fibonacci level, confluence factors, planned R:R, slippage pips, cluster key.

On trade close, the record is updated with: outcome (win/loss), PnL, PnL%, actual R:R, exit slippage, time in trade (minutes), and close reason.

**Hook point:** `artifacts/api-server/src/lib/paper-engine.ts`
- `recordTradeMemory()` called after `db.insert(tradesTable).returning()` on trade open
- `closeTradeMemory()` called after `db.update(tradesTable)` on trade close

---

## Objective 2 — Record Missed Opportunities

**Schema:** `missed_opportunities` table

Every signal rejected by the execution engine is recorded with full component scores and the specific rejection reason:

| Rejection Reason | Description |
|---|---|
| `below_confidence` | Signal confidence < 65% threshold |
| `max_open_trades` | 3 simultaneous trades limit reached |
| `pair_already_open` | A trade for this pair is already open |
| `daily_loss_limit` | Daily drawdown limit breached |
| `weekly_loss_limit` | Weekly drawdown limit breached |
| `bot_halted` | Risk halt active |

**Aftermath tracking** (background update): Prices are sampled at 1h, 4h, and 24h after rejection. At 4h, estimated pips and `outcome_if_taken` (`would_win` / `would_lose`) are computed using directional price movement from the entry price.

---

## Objective 3 — Setup Clustering

Trades are automatically grouped into **cluster keys** based on score buckets:

```
z:<bucket>|l:<bucket>|a:<bucket>|c:<bucket>|s:<session>
```

Score buckets: `<70` | `70-79` | `80-89` | `90+`

Example cluster key:
```
z:80-89|l:70-79|a:90+|c:80-89|s:London
```

Each cluster accumulates: total trades, wins, losses, total PnL, gross profit/loss, win rate, profit factor, average R:R, average final score.

---

## Objective 4 — Confidence Profiles

**Schema:** `setup_confidence_profiles` table (one row per unique cluster key)

Each profile is updated after every trade close with rolling statistics including last-10-trade win rate and PnL.

---

## Objective 5 — Dynamic Confidence Adjustment

Applied on top of the raw signal confidence for any cluster with ≥ 10 closed trades:

```
base_adjustment = (win_rate - 55) * 0.5
```

| Win Rate | Adjustment |
|---|---|
| 75% | +10 pts |
| 65% | +5 pts |
| 55% | 0 pts (neutral) |
| 45% | −5 pts |
| 35% | −10 pts |

**Rolling deterioration penalty:** If the cluster's last 10 trades have win rate < 40%, an additional −10 pts penalty is applied.

**Cap:** Adjustment is clamped to [−30, +30].

The `confidence_adjustment` column in `setup_confidence_profiles` holds this value. A future integration point can read this to raise or lower the effective signal threshold dynamically per cluster.

---

## Objective 6 — Setup Ranking

All cluster profiles are ranked by a composite score:

```
composite = WR × 0.4 + (PF × 10) × 0.3 + (avgRR × 10) × 0.2 + sampleBonus × 0.1
```

- `WR` = win rate (%)
- `PF` = profit factor (capped at 5 for weighting)
- `avgRR` = average R:R (capped at 4)
- `sampleBonus` = min(totalTrades / 50, 1) × 10 — rewards statistical significance

Rankings are recomputed globally after every trade close. The `rank` column in `setup_confidence_profiles` holds the result (1 = best).

---

## Objective 7 — Trade Journal Dashboard (`/memory`)

A new **Memory** page has been added to the dashboard at `/memory`, accessible from the nav sidebar.

### Tabs

| Tab | Content |
|---|---|
| **Overview** | Summary stats strip (total recorded, win rate, clusters, missed opps), best cluster key display, avg confidence adjustment |
| **Trade Records** | Full table of all trade memory records with per-row component score badges (color-coded: green ≥80, amber ≥70, red <70), outcome pill, PnL, actual R:R, time in trade |
| **Missed Opportunities** | Table of rejected signals with rejection reason pill, component scores, estimated aftermath pips, and outcome-if-taken badge |
| **Confidence Profiles** | Card list of all cluster profiles showing score buckets, win rate, profit factor, confidence adjustment, rolling 10-trade WR |
| **Top/Worst Clusters** | Side-by-side view of the 10 best and 10 worst ranked clusters |

---

## Objective 8 — Architecture Summary

```
TradeSignal (market-analysis)
       │
       ▼
paper-engine.ts (executePaperSignals)
  ├── [rejected] → recordMissedOpportunity() → missed_opportunities table
  └── [executed] → recordTradeMemory()        → trade_memory table
                         │
                    [on close]
                         │
                    closeTradeMemory()
                         │
                    updateClusterProfile()    → setup_confidence_profiles table
                         │
                    recomputeRankings()       → rank column updated

API Routes (Express 5):
  GET /analytics/memory/summary
  GET /analytics/memory/trades
  GET /analytics/memory/missed
  GET /analytics/memory/confidence-profiles
  GET /analytics/memory/top-setups

Frontend:
  /memory — Brain icon in nav, 5-tab layout
```

---

## Database Tables Created

| Table | Rows | Purpose |
|---|---|---|
| `trade_memory` | 1 per executed trade | Full component score archive |
| `missed_opportunities` | 1 per rejected signal | Counterfactual learning |
| `setup_confidence_profiles` | 1 per cluster | Dynamic confidence state |

---

## Files Changed

| File | Change |
|---|---|
| `lib/db/src/schema/memory.ts` | New — 3 table schemas |
| `lib/db/src/schema/index.ts` | +1 export line |
| `artifacts/api-server/src/lib/memory-engine.ts` | New — full engine service |
| `artifacts/api-server/src/lib/paper-engine.ts` | +memory hooks on open/close/miss |
| `artifacts/api-server/src/routes/memory.ts` | New — 5 GET endpoints |
| `artifacts/api-server/src/routes/index.ts` | +memoryRouter registration |
| `lib/api-spec/openapi.yaml` | +5 paths, +5 schemas |
| `artifacts/dashboard/src/pages/memory.tsx` | New — 5-tab Memory page |
| `artifacts/dashboard/src/App.tsx` | +/memory route |
| `artifacts/dashboard/src/components/nav-sidebar.tsx` | +Memory nav item |
