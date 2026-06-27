import { db } from "@workspace/db";
import { tradesTable } from "@workspace/db/schema";
import { desc } from "drizzle-orm";
import type { StageResult, Finding } from "./types.js";

interface TradeRow {
  id: number;
  pair: string;
  direction: string;
  entryPrice: string;
  stopLoss: string | null;
  takeProfit: string | null;
  lotSize: string | null;
  setupScore: string | null;
  amdPattern: string | null;
  zoneType: string | null;
  regime: string | null;
  session: string | null;
  status: string;
  openedAt: Date;
  pnl: string | null;
}

interface Violation {
  tradeId: number;
  pair: string;
  rule: string;
  severity: "critical" | "warn";
}

interface Conflict {
  pair: string;
  message: string;
}

function checkTradeRules(trade: TradeRow): Violation[] {
  const violations: Violation[] = [];

  const score = parseFloat(trade.setupScore ?? "0");
  if (score === 0 && trade.status !== "open") {
    violations.push({ tradeId: trade.id, pair: trade.pair, rule: "Missing setup score — trade taken without quality evaluation", severity: "warn" });
  }
  if (score > 0 && score < 60) {
    violations.push({ tradeId: trade.id, pair: trade.pair, rule: `Low setup score (${score}) — below minimum threshold of 60`, severity: "critical" });
  }

  const sl = parseFloat(trade.stopLoss ?? "0");
  const ep = parseFloat(trade.entryPrice ?? "0");
  const tp = parseFloat(trade.takeProfit ?? "0");
  if (sl === 0 || ep === 0) {
    violations.push({ tradeId: trade.id, pair: trade.pair, rule: "Missing stop loss or entry price", severity: "critical" });
  }

  if (sl > 0 && ep > 0 && tp > 0) {
    const risk = Math.abs(ep - sl);
    const reward = Math.abs(tp - ep);
    const rr = risk > 0 ? reward / risk : 0;
    if (rr < 1.5) {
      violations.push({ tradeId: trade.id, pair: trade.pair, rule: `Low R:R ratio (${rr.toFixed(2)}:1) — minimum is 1.5:1`, severity: "warn" });
    }
  }

  if (!trade.zoneType || trade.zoneType === "") {
    violations.push({ tradeId: trade.id, pair: trade.pair, rule: "No supply/demand zone associated with trade", severity: "warn" });
  }

  return violations;
}

function detectDuplicates(trades: TradeRow[]): Array<{ ids: number[]; pair: string; message: string }> {
  const duplicates: Array<{ ids: number[]; pair: string; message: string }> = [];
  const WINDOW_MS = 4 * 60 * 60 * 1000;

  for (let i = 0; i < trades.length; i++) {
    for (let j = i + 1; j < trades.length; j++) {
      const a = trades[i];
      const b = trades[j];
      if (a.pair !== b.pair || a.direction !== b.direction) continue;
      const timeDiff = Math.abs(a.openedAt.getTime() - b.openedAt.getTime());
      if (timeDiff < WINDOW_MS) {
        const epA = parseFloat(a.entryPrice);
        const epB = parseFloat(b.entryPrice);
        const priceDiff = Math.abs(epA - epB) / epA;
        if (priceDiff < 0.002) {
          duplicates.push({
            ids: [a.id, b.id],
            pair: a.pair,
            message: `Duplicate ${a.direction} entries on ${a.pair} within ${(timeDiff / 60000).toFixed(0)} minutes at similar price`,
          });
        }
      }
    }
  }
  return duplicates;
}

function detectConflicts(trades: TradeRow[]): Conflict[] {
  const conflicts: Conflict[] = [];
  const openTrades = trades.filter((t) => t.status === "open");
  const byPair = new Map<string, TradeRow[]>();

  for (const t of openTrades) {
    const existing = byPair.get(t.pair) ?? [];
    existing.push(t);
    byPair.set(t.pair, existing);
  }

  for (const [pair, pairTrades] of byPair) {
    const buys = pairTrades.filter((t) => t.direction === "buy");
    const sells = pairTrades.filter((t) => t.direction === "sell");
    if (buys.length > 0 && sells.length > 0) {
      conflicts.push({
        pair,
        message: `${pair}: ${buys.length} open BUY + ${sells.length} open SELL — conflicting signals active simultaneously`,
      });
    }
  }
  return conflicts;
}

export async function runStage2(): Promise<StageResult> {
  const t0 = Date.now();
  const findings: Finding[] = [];
  const blockers: string[] = [];

  let trades: TradeRow[] = [];
  try {
    trades = await db
      .select({
        id: tradesTable.id,
        pair: tradesTable.pair,
        direction: tradesTable.direction,
        entryPrice: tradesTable.entryPrice,
        stopLoss: tradesTable.stopLoss,
        takeProfit: tradesTable.takeProfit,
        lotSize: tradesTable.lotSize,
        setupScore: tradesTable.setupScore,
        amdPattern: tradesTable.amdPattern,
        zoneType: tradesTable.zoneType,
        regime: tradesTable.regime,
        session: tradesTable.session,
        status: tradesTable.status,
        openedAt: tradesTable.openedAt,
        pnl: tradesTable.pnl,
      })
      .from(tradesTable)
      .orderBy(desc(tradesTable.openedAt))
      .limit(500) as TradeRow[];
  } catch (err) {
    findings.push({ level: "warn", message: `Could not load trades from DB: ${String(err)}` });
  }

  if (trades.length === 0) {
    findings.push({ level: "info", message: "No trades recorded yet — strategy validation will run once the bot executes trades" });
    return {
      id: 2,
      name: "Strategy Validation",
      status: "skip",
      score: 75,
      findings,
      blockers,
      durationMs: Date.now() - t0,
      details: { tradesAnalyzed: 0, violations: [], duplicates: [], conflicts: [] },
    };
  }

  const allViolations: Violation[] = [];
  for (const trade of trades) {
    allViolations.push(...checkTradeRules(trade));
  }

  const duplicates = detectDuplicates(trades);
  const conflicts = detectConflicts(trades);

  const criticalViolations = allViolations.filter((v) => v.severity === "critical");
  const warnViolations = allViolations.filter((v) => v.severity === "warn");

  if (criticalViolations.length > 0) {
    const byRule = new Map<string, number>();
    for (const v of criticalViolations) {
      byRule.set(v.rule, (byRule.get(v.rule) ?? 0) + 1);
    }
    for (const [rule, count] of byRule) {
      findings.push({ level: "critical", message: `${count}× ${rule}` });
    }
    blockers.push(`${criticalViolations.length} critical rule violation(s) detected across ${trades.length} trades`);
  }

  if (warnViolations.length > 0) {
    const byRule = new Map<string, number>();
    for (const v of warnViolations) {
      byRule.set(v.rule, (byRule.get(v.rule) ?? 0) + 1);
    }
    for (const [rule, count] of byRule) {
      findings.push({ level: "warn", message: `${count}× ${rule}` });
    }
  }

  for (const dup of duplicates) {
    findings.push({ level: "warn", message: dup.message });
  }

  for (const conflict of conflicts) {
    findings.push({ level: "critical", message: conflict.message });
    blockers.push(`Conflicting signals on ${conflict.pair}: simultaneous BUY and SELL`);
  }

  const closedTrades = trades.filter((t) => t.status !== "open");
  const winners = closedTrades.filter((t) => parseFloat(t.pnl ?? "0") > 0);
  const winRate = closedTrades.length > 0 ? (winners.length / closedTrades.length) * 100 : 0;
  const avgScore = trades
    .filter((t) => parseFloat(t.setupScore ?? "0") > 0)
    .reduce((s, t, _, a) => s + parseFloat(t.setupScore ?? "0") / a.length, 0);

  findings.push({ level: "info", message: `${trades.length} trades analyzed: ${closedTrades.length} closed, ${trades.length - closedTrades.length} open` });
  if (closedTrades.length > 0) {
    findings.push({ level: winRate >= 50 ? "info" : "warn", message: `Win rate: ${winRate.toFixed(1)}%` });
  }
  if (avgScore > 0) {
    findings.push({ level: avgScore >= 70 ? "info" : "warn", message: `Average setup score: ${avgScore.toFixed(0)}` });
  }

  const violationRate = trades.length > 0 ? (criticalViolations.length / trades.length) * 100 : 0;
  const score = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        100 -
          criticalViolations.length * 5 -
          warnViolations.length * 1 -
          duplicates.length * 3 -
          conflicts.length * 10,
      ),
    ),
  );

  const status =
    blockers.length > 0 ? "fail" : warnViolations.length > 0 || duplicates.length > 0 ? "warn" : "pass";

  return {
    id: 2,
    name: "Strategy Validation",
    status,
    score,
    findings,
    blockers,
    durationMs: Date.now() - t0,
    details: {
      tradesAnalyzed: trades.length,
      closedTrades: closedTrades.length,
      criticalViolations: criticalViolations.length,
      warnViolations: warnViolations.length,
      duplicates: duplicates.length,
      conflicts: conflicts.length,
      winRate: Math.round(winRate * 10) / 10,
      avgSetupScore: Math.round(avgScore),
      violationRate: Math.round(violationRate * 10) / 10,
    },
  };
}
