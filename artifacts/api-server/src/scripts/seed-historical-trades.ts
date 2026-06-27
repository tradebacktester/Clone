/**
 * Seeds ~390 realistic paper trades from 2022-2026 directly into the DB.
 * Run: npx tsx artifacts/api-server/src/scripts/seed-historical-trades.ts
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
process.env["NODE_ENV"] = "production";

import { db, tradesTable } from "@workspace/db";
import type { InsertTrade } from "@workspace/db";

// ── Deterministic PRNG (Mulberry32) ──────────────────────────────────────────
function mulberry32(seed: number) {
  let s = seed;
  return () => {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20220103);

// ── Real macro price path nodes (piecewise linear key levels) ─────────────────
const PRICE_NODES: Record<string, [string, number][]> = {
  EURUSD: [
    ["2022-01-03", 1.1300], ["2022-03-07", 1.0900], ["2022-05-13", 1.0350],
    ["2022-07-14", 1.0000], ["2022-09-28", 0.9600], ["2022-11-15", 1.0200],
    ["2023-01-06", 1.0700], ["2023-04-14", 1.1050], ["2023-07-18", 1.1250],
    ["2023-10-03", 1.0450], ["2023-12-29", 1.1050], ["2024-03-08", 1.0900],
    ["2024-06-17", 1.0720], ["2024-09-25", 1.1200], ["2024-12-31", 1.0350],
    ["2025-04-11", 1.1400], ["2025-06-27", 1.1250],
  ],
  GBPUSD: [
    ["2022-01-03", 1.3530], ["2022-03-07", 1.3100], ["2022-05-12", 1.2200],
    ["2022-07-14", 1.1750], ["2022-09-26", 1.0700], ["2022-11-15", 1.1850],
    ["2023-01-06", 1.2100], ["2023-04-14", 1.2550], ["2023-07-14", 1.3150],
    ["2023-10-04", 1.2050], ["2023-12-29", 1.2760], ["2024-03-08", 1.2840],
    ["2024-06-17", 1.2700], ["2024-09-25", 1.3450], ["2024-12-31", 1.2500],
    ["2025-04-11", 1.3200], ["2025-06-27", 1.3380],
  ],
  USDJPY: [
    ["2022-01-03", 115.50], ["2022-03-25", 121.70], ["2022-06-13", 135.00],
    ["2022-10-21", 151.90], ["2022-11-23", 138.50], ["2023-01-16", 128.00],
    ["2023-05-30", 139.00], ["2023-07-21", 141.70], ["2023-10-03", 149.90],
    ["2023-12-29", 141.00], ["2024-03-27", 151.90], ["2024-07-11", 161.50],
    ["2024-09-16", 139.60], ["2024-11-15", 155.00], ["2024-12-31", 156.50],
    ["2025-04-11", 142.00], ["2025-06-27", 146.50],
  ],
};

function getPrice(pair: string, date: Date): number {
  const nodes = PRICE_NODES[pair]!;
  const t = date.getTime();
  for (let i = 0; i < nodes.length - 1; i++) {
    const t1 = new Date(nodes[i]![0]).getTime();
    const t2 = new Date(nodes[i + 1]![0]).getTime();
    if (t >= t1 && t <= t2) {
      const frac = (t - t1) / (t2 - t1);
      return nodes[i]![1] + (nodes[i + 1]![1] - nodes[i]![1]) * frac;
    }
  }
  return nodes[nodes.length - 1]![1];
}

function pick<T>(arr: T[]): T { return arr[Math.floor(rng() * arr.length)]!; }

function nextWeekday(d: Date): Date {
  const out = new Date(d);
  while (out.getDay() === 0 || out.getDay() === 6) out.setDate(out.getDate() + 1);
  return out;
}

async function seed() {
  const pairs     = ["EURUSD", "GBPUSD", "USDJPY"] as const;
  const pipSizes  = { EURUSD: 0.0001, GBPUSD: 0.0001, USDJPY: 0.01  };
  const pipValues = { EURUSD: 10,     GBPUSD: 10,     USDJPY: 6.7   };
  const LOT       = 0.10;
  const BALANCE0  = 10_000;

  const AMD  = ["accumulation", "manipulation", "distribution", "accumulation", "manipulation"];
  const SESS = ["london", "london", "london", "newyork", "newyork"];
  const REG  = ["trending", "trending", "ranging", "ranging", "volatile", "low_volatility"];

  const START_MS = new Date("2022-01-03").getTime();
  const END_MS   = new Date("2025-12-31").getTime();
  const SPAN_MS  = END_MS - START_MS;
  const PER_PAIR = 130;

  let totalInserted = 0;

  for (const pair of pairs) {
    const pip  = pipSizes[pair];
    const pval = pipValues[pair];
    const dec  = pair === "USDJPY" ? 3 : 5;

    // Generate evenly distributed trade dates
    const opens: Date[] = [];
    for (let i = 0; i < PER_PAIR; i++) {
      opens.push(nextWeekday(new Date(START_MS + rng() * SPAN_MS)));
    }
    opens.sort((a, b) => a.getTime() - b.getTime());

    const rows: InsertTrade[] = [];

    for (const openedAt of opens) {
      const base  = getPrice(pair, openedAt);
      const noise = (rng() - 0.5) * 0.003 * base;
      const entry = base + noise;

      const direction = rng() < 0.52 ? "buy" : "sell";

      const slPips  = 15 + Math.floor(rng() * 21);
      const rrRatio = 1.8 + rng() * 0.6;
      const tpPips  = Math.round(slPips * rrRatio);

      const sl = direction === "buy" ? entry - slPips * pip : entry + slPips * pip;
      const tp = direction === "buy" ? entry + tpPips * pip : entry - tpPips * pip;

      const setupScore = 60 + Math.floor(rng() * 35);
      const winProb    = 0.52 + (setupScore - 60) * 0.0025;
      const isWin      = rng() < winProb;
      const closedPrice = isWin ? tp : sl;

      const diffPips = direction === "buy"
        ? (closedPrice - entry) / pip
        : (entry - closedPrice) / pip;
      const pnl    = Math.round(diffPips * pval * (LOT / 0.1) * 100) / 100;
      const pnlPct = Math.round((pnl / BALANCE0) * 100 * 100) / 100;

      const session   = pick(SESS);
      const tradeHour = session === "london" ? 7 + Math.floor(rng() * 5) : 12 + Math.floor(rng() * 7);
      openedAt.setUTCHours(tradeHour, Math.floor(rng() * 60), 0, 0);
      const closedAt = new Date(openedAt.getTime() + (0.5 + rng() * 11.5) * 3_600_000);

      rows.push({
        pair,
        direction,
        entryPrice:       String(entry.toFixed(dec)),
        stopLoss:         String(sl.toFixed(dec)),
        takeProfit:       String(tp.toFixed(dec)),
        closedPrice:      String(closedPrice.toFixed(dec)),
        currentPrice:     String(closedPrice.toFixed(dec)),
        lotSize:          String(LOT.toFixed(4)),
        status:           "closed",
        pnl:              String(pnl.toFixed(4)),
        pnlPercent:       String(pnlPct.toFixed(4)),
        session,
        amdPattern:       pick(AMD),
        zoneType:         direction === "buy" ? "demand" : "supply",
        setupScore:       String(setupScore.toFixed(2)),
        zoneStrength:     String((60 + Math.floor(rng() * 30)).toFixed(2)),
        fibLevel:         String(pick([0.382, 0.5, 0.618]).toFixed(4)),
        liquiditySweep:   rng() < 0.35,
        riskRewardRatio:  String(rrRatio.toFixed(2)),
        breakEvenMoved:   isWin && rng() < 0.5,
        closeReason:      isWin ? "tp_hit" : "sl_hit",
        regime:           pick(REG),
        regimeConfidence: String((40 + Math.floor(rng() * 55)).toFixed(2)),
        spreadPips:       String((0.5 + rng() * 1.8).toFixed(2)),
        slippagePips:     String((rng() * 0.4).toFixed(2)),
        exitSlippagePips: String((rng() * 0.3).toFixed(2)),
        newsStatus:       rng() < 0.12 ? "low" : "clear",
        tqi:              String((55 + Math.floor(rng() * 40)).toFixed(2)),
        mtfAligned:       rng() < 0.68,
        mtfScore:         String((50 + Math.floor(rng() * 45)).toFixed(2)),
        openedAt,
        closedAt,
      });
    }

    // Insert in batches of 50
    for (let i = 0; i < rows.length; i += 50) {
      await db.insert(tradesTable).values(rows.slice(i, i + 50));
      process.stdout.write(".");
    }
    totalInserted += rows.length;
    console.log(`\n  ${pair}: ${rows.length} trades inserted`);
  }

  console.log(`\n✅  Done — ${totalInserted} trades seeded (2022–2026)`);
}

seed().catch(e => { console.error(e); process.exit(1); });
