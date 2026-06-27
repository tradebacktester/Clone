import type { TradeResult } from "./metrics.js";
import { computeExtendedMetrics } from "./metrics.js";

export interface BreakdownRow {
  label: string;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  netPips: number;
  profitFactor: number;
  avgRR: number;
  expectancy: number;
  sharpe: number;
  maxDD: number;
}

export interface Breakdowns {
  byPair: BreakdownRow[];
  byYear: BreakdownRow[];
  byMonth: BreakdownRow[];
  bySession: BreakdownRow[];
  byRegime: BreakdownRow[];
  byZoneQuality: BreakdownRow[];
  byLiquidityScore: BreakdownRow[];
  byAMDScore: BreakdownRow[];
  byConfirmationScore: BreakdownRow[];
}

function rowFromGroup(label: string, trades: TradeResult[]): BreakdownRow {
  if (trades.length === 0) {
    return { label, trades: 0, wins: 0, losses: 0, winRate: 0, netPips: 0, profitFactor: 0, avgRR: 0, expectancy: 0, sharpe: 0, maxDD: 0 };
  }
  const m = computeExtendedMetrics(trades);
  return {
    label,
    trades: m.totalTrades,
    wins: m.wins,
    losses: m.losses,
    winRate: m.winRate,
    netPips: parseFloat(m.netProfitPips.toFixed(2)),
    profitFactor: m.profitFactor,
    avgRR: m.avgPlannedRR,
    expectancy: m.expectancyPips,
    sharpe: m.sharpeRatio,
    maxDD: m.maxDrawdownPips,
  };
}

function groupBy<K extends string>(
  trades: TradeResult[],
  key: (t: TradeResult) => K,
  labels: K[],
): Map<K, TradeResult[]> {
  const map = new Map<K, TradeResult[]>(labels.map((l) => [l, []]));
  for (const t of trades) {
    const k = key(t);
    const bucket = map.get(k);
    if (bucket) bucket.push(t);
    else map.set(k, [t]);
  }
  return map;
}

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function computeBreakdowns(trades: TradeResult[]): Breakdowns {
  if (trades.length === 0) {
    const empty: BreakdownRow[] = [];
    return { byPair: empty, byYear: empty, byMonth: empty, bySession: empty, byRegime: empty, byZoneQuality: empty, byLiquidityScore: empty, byAMDScore: empty, byConfirmationScore: empty };
  }

  // ── By Pair ───────────────────────────────────────────────────────────────
  const pairs = [...new Set(trades.map((t) => t.pair))].sort();
  const byPair = pairs.map((p) =>
    rowFromGroup(p, trades.filter((t) => t.pair === p)),
  );

  // ── By Year ───────────────────────────────────────────────────────────────
  const years = [...new Set(trades.map((t) => t.time.getUTCFullYear()))].sort();
  const byYear = years.map((y) =>
    rowFromGroup(String(y), trades.filter((t) => t.time.getUTCFullYear() === y)),
  );

  // ── By Month ──────────────────────────────────────────────────────────────
  const usedMonths = [...new Set(trades.map((t) => t.time.getUTCMonth()))].sort((a, b) => a - b);
  const byMonth = usedMonths.map((m) =>
    rowFromGroup(MONTH_LABELS[m] ?? String(m), trades.filter((t) => t.time.getUTCMonth() === m)),
  );

  // ── By Session ────────────────────────────────────────────────────────────
  const sessionLabels = ["london", "new_york", "tokyo", "off_hours"] as const;
  const sessionMap = groupBy(trades, (t) => t.session as typeof sessionLabels[number], sessionLabels as unknown as Array<typeof sessionLabels[number]>);
  const bySession = sessionLabels
    .map((s) => rowFromGroup(s.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase()), sessionMap.get(s) ?? []))
    .filter((r) => r.trades > 0);

  // ── By Market Regime ──────────────────────────────────────────────────────
  const regimes = [...new Set(trades.map((t) => t.regime))].sort();
  const byRegime = regimes.map((r) =>
    rowFromGroup(r.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase()), trades.filter((t) => t.regime === r)),
  );

  // ── By Zone Quality ───────────────────────────────────────────────────────
  const zoneQualityBucket = (t: TradeResult): string =>
    t.zoneStrength >= 85 ? "Premium (≥85)" : t.zoneStrength >= 70 ? "Strong (70–84)" : t.zoneStrength >= 55 ? "Moderate (55–69)" : "Weak (<55)";
  const zqLabels = ["Premium (≥85)", "Strong (70–84)", "Moderate (55–69)", "Weak (<55)"];
  const byZoneQuality = zqLabels.map((l) =>
    rowFromGroup(l, trades.filter((t) => zoneQualityBucket(t) === l)),
  ).filter((r) => r.trades > 0);

  // ── By Liquidity Score ────────────────────────────────────────────────────
  const liqBucket = (t: TradeResult): string =>
    t.liquidityScore >= 70 ? "High (≥70)" : t.liquidityScore >= 40 ? "Medium (40–69)" : "Low (<40)";
  const liqLabels = ["High (≥70)", "Medium (40–69)", "Low (<40)"];
  const byLiquidityScore = liqLabels.map((l) =>
    rowFromGroup(l, trades.filter((t) => liqBucket(t) === l)),
  ).filter((r) => r.trades > 0);

  // ── By AMD Score ──────────────────────────────────────────────────────────
  const amdBucket = (t: TradeResult): string =>
    t.amdScore >= 70 ? "High (≥70)" : t.amdScore >= 40 ? "Medium (40–69)" : "Low (<40)";
  const byAMDScore = liqLabels.map((l) =>
    rowFromGroup(l, trades.filter((t) => amdBucket(t) === l)),
  ).filter((r) => r.trades > 0);

  // ── By Confirmation Score ─────────────────────────────────────────────────
  const confBucket = (t: TradeResult): string =>
    t.confirmationScore >= 70 ? "Strong (≥70)" : t.confirmationScore >= 40 ? "Moderate (40–69)" : "Weak (<40)";
  const confLabels = ["Strong (≥70)", "Moderate (40–69)", "Weak (<40)"];
  const byConfirmationScore = confLabels.map((l) =>
    rowFromGroup(l, trades.filter((t) => confBucket(t) === l)),
  ).filter((r) => r.trades > 0);

  return { byPair, byYear, byMonth, bySession, byRegime, byZoneQuality, byLiquidityScore, byAMDScore, byConfirmationScore };
}

/** Render a breakdown table as Markdown */
export function formatBreakdownTable(rows: BreakdownRow[], title: string): string {
  if (rows.length === 0) return `### ${title}\n*No data.*\n`;
  const header = `### ${title}
| Label | Trades | Win% | Net Pips | PF | Avg R:R | Expectancy | Sharpe | Max DD |
|-------|--------|------|----------|----|---------|------------|--------|--------|`;
  const body = rows
    .map(
      (r) =>
        `| ${r.label} | ${r.trades} | ${r.winRate.toFixed(1)}% | ${r.netPips.toFixed(1)} | ${r.profitFactor.toFixed(2)} | ${r.avgRR.toFixed(2)} | ${r.expectancy.toFixed(2)} | ${r.sharpe.toFixed(2)} | ${r.maxDD.toFixed(1)} |`,
    )
    .join("\n");
  return `${header}\n${body}\n`;
}
