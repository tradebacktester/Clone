import { Router, type IRouter } from "express";
import { db, tradesTable, strategyHealthSnapshotTable, tiDecisionsTable } from "@workspace/db";
import { eq, sql, desc, and, gte, lte } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { writeFile } from "fs/promises";
import { join } from "path";

const router: IRouter = Router();

// GET /improvement/summary
router.get("/improvement/summary", async (_req, res): Promise<void> => {
  try {
    const [agg] = await db
      .select({
        totalClosed: sql<string>`COUNT(*) FILTER (WHERE status = 'closed')`,
        wins: sql<string>`COUNT(*) FILTER (WHERE status = 'closed' AND pnl > 0)`,
        totalPnl: sql<string>`COALESCE(SUM(pnl) FILTER (WHERE status = 'closed'), 0)`,
        grossProfit: sql<string>`COALESCE(SUM(pnl) FILTER (WHERE status = 'closed' AND pnl > 0), 0)`,
        grossLoss: sql<string>`COALESCE(ABS(SUM(pnl) FILTER (WHERE status = 'closed' AND pnl < 0)), 0)`,
        avgTqi: sql<string>`COALESCE(AVG(tqi::numeric) FILTER (WHERE status = 'closed' AND tqi IS NOT NULL), 0)`,
        avgSetupScore: sql<string>`COALESCE(AVG(setup_score::numeric) FILTER (WHERE status = 'closed'), 0)`,
      })
      .from(tradesTable);

    const total = parseInt(agg?.totalClosed ?? "0", 10);
    const wins = parseInt(agg?.wins ?? "0", 10);
    const totalPnl = parseFloat(agg?.totalPnl ?? "0");
    const grossProfit = parseFloat(agg?.grossProfit ?? "0");
    const grossLoss = parseFloat(agg?.grossLoss ?? "0");
    const winRate = total > 0 ? (wins / total) * 100 : 0;
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99 : 0;

    // Monthly breakdown for last 6 months
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const monthlyRows = await db
      .select({
        month: sql<string>`TO_CHAR(closed_at, 'YYYY-MM')`,
        pnl: sql<string>`COALESCE(SUM(pnl), 0)`,
        trades: sql<string>`COUNT(*)`,
        wins: sql<string>`COUNT(*) FILTER (WHERE pnl > 0)`,
      })
      .from(tradesTable)
      .where(
        and(
          eq(tradesTable.status, "closed"),
          gte(tradesTable.closedAt, sixMonthsAgo),
        ),
      )
      .groupBy(sql`TO_CHAR(closed_at, 'YYYY-MM')`)
      .orderBy(sql`TO_CHAR(closed_at, 'YYYY-MM')`);

    // Win rate by session
    const sessionRows = await db
      .select({
        session: tradesTable.session,
        trades: sql<string>`COUNT(*)`,
        wins: sql<string>`COUNT(*) FILTER (WHERE pnl > 0)`,
        pnl: sql<string>`COALESCE(SUM(pnl), 0)`,
      })
      .from(tradesTable)
      .where(eq(tradesTable.status, "closed"))
      .groupBy(tradesTable.session);

    // Win rate by pair
    const pairRows = await db
      .select({
        pair: tradesTable.pair,
        trades: sql<string>`COUNT(*)`,
        wins: sql<string>`COUNT(*) FILTER (WHERE pnl > 0)`,
        pnl: sql<string>`COALESCE(SUM(pnl), 0)`,
      })
      .from(tradesTable)
      .where(eq(tradesTable.status, "closed"))
      .groupBy(tradesTable.pair);

    // Win rate by amd pattern
    const setupRows = await db
      .select({
        pattern: tradesTable.amdPattern,
        trades: sql<string>`COUNT(*)`,
        wins: sql<string>`COUNT(*) FILTER (WHERE pnl > 0)`,
        pnl: sql<string>`COALESCE(SUM(pnl), 0)`,
      })
      .from(tradesTable)
      .where(eq(tradesTable.status, "closed"))
      .groupBy(tradesTable.amdPattern);

    // Win rate by regime
    const regimeRows = await db
      .select({
        regime: tradesTable.regime,
        trades: sql<string>`COUNT(*)`,
        wins: sql<string>`COUNT(*) FILTER (WHERE pnl > 0)`,
        pnl: sql<string>`COALESCE(SUM(pnl), 0)`,
      })
      .from(tradesTable)
      .where(and(eq(tradesTable.status, "closed"), sql`regime IS NOT NULL`))
      .groupBy(tradesTable.regime);

    // Rolling 10-trade win rate (last 50 trades)
    const recent50 = await db
      .select({ pnl: tradesTable.pnl, closedAt: tradesTable.closedAt })
      .from(tradesTable)
      .where(eq(tradesTable.status, "closed"))
      .orderBy(desc(tradesTable.closedAt))
      .limit(50);

    const rolling10 = recent50.slice(0, 10);
    const rolling10Wins = rolling10.filter((r) => parseFloat(r.pnl ?? "0") > 0).length;
    const rollingWinRate = rolling10.length > 0 ? (rolling10Wins / rolling10.length) * 100 : 0;

    res.json({
      overall: {
        totalTrades: total,
        winRate: Math.round(winRate * 10) / 10,
        profitFactor: Math.round(profitFactor * 100) / 100,
        totalPnl: Math.round(totalPnl * 100) / 100,
        avgTqi: Math.round(parseFloat(agg?.avgTqi ?? "0") * 10) / 10,
        avgSetupScore: Math.round(parseFloat(agg?.avgSetupScore ?? "0") * 10) / 10,
        rollingWinRate10: Math.round(rollingWinRate * 10) / 10,
      },
      monthly: monthlyRows.map((r) => ({
        month: r.month,
        pnl: Math.round(parseFloat(r.pnl) * 100) / 100,
        trades: parseInt(r.trades, 10),
        winRate: parseInt(r.trades, 10) > 0
          ? Math.round((parseInt(r.wins, 10) / parseInt(r.trades, 10)) * 1000) / 10
          : 0,
      })),
      bySession: sessionRows.map((r) => ({
        session: r.session,
        trades: parseInt(r.trades, 10),
        winRate: parseInt(r.trades, 10) > 0
          ? Math.round((parseInt(r.wins, 10) / parseInt(r.trades, 10)) * 1000) / 10
          : 0,
        pnl: Math.round(parseFloat(r.pnl) * 100) / 100,
      })),
      byPair: pairRows.map((r) => ({
        pair: r.pair,
        trades: parseInt(r.trades, 10),
        winRate: parseInt(r.trades, 10) > 0
          ? Math.round((parseInt(r.wins, 10) / parseInt(r.trades, 10)) * 1000) / 10
          : 0,
        pnl: Math.round(parseFloat(r.pnl) * 100) / 100,
      })),
      bySetup: setupRows.filter((r) => r.pattern && r.pattern !== "unknown").map((r) => ({
        pattern: r.pattern,
        trades: parseInt(r.trades, 10),
        winRate: parseInt(r.trades, 10) > 0
          ? Math.round((parseInt(r.wins, 10) / parseInt(r.trades, 10)) * 1000) / 10
          : 0,
        pnl: Math.round(parseFloat(r.pnl) * 100) / 100,
      })),
      byRegime: regimeRows.filter((r) => r.regime != null).map((r) => ({
        regime: r.regime,
        trades: parseInt(r.trades, 10),
        winRate: parseInt(r.trades, 10) > 0
          ? Math.round((parseInt(r.wins, 10) / parseInt(r.trades, 10)) * 1000) / 10
          : 0,
        pnl: Math.round(parseFloat(r.pnl) * 100) / 100,
      })),
    });
  } catch (err) {
    logger.error({ err }, "GET /improvement/summary failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /improvement/strategy-drift
router.get("/improvement/strategy-drift", async (_req, res): Promise<void> => {
  try {
    const WINDOW = 20;

    const rows = await db
      .select({
        pnl: tradesTable.pnl,
        closedAt: tradesTable.closedAt,
        tqi: tradesTable.tqi,
        setupScore: tradesTable.setupScore,
        slippagePips: tradesTable.slippagePips,
      })
      .from(tradesTable)
      .where(eq(tradesTable.status, "closed"))
      .orderBy(tradesTable.closedAt);

    if (rows.length < WINDOW) {
      res.json({
        hasEnoughData: false,
        message: `Need at least ${WINDOW} closed trades. Currently have ${rows.length}.`,
        drift: [],
      });
      return;
    }

    const snapshots: Array<{
      tradeRange: string;
      winRate: number;
      avgTqi: number;
      avgSetupScore: number;
      avgSlippage: number;
      pnl: number;
    }> = [];

    for (let i = WINDOW; i <= rows.length; i += Math.max(5, Math.floor(WINDOW / 2))) {
      const window = rows.slice(i - WINDOW, i);
      const wins = window.filter((r) => parseFloat(r.pnl ?? "0") > 0).length;
      const avgTqi = window.filter((r) => r.tqi != null).reduce((s, r) => s + parseFloat(r.tqi!), 0) / (window.filter((r) => r.tqi != null).length || 1);
      const avgSetup = window.reduce((s, r) => s + parseFloat(r.setupScore ?? "0"), 0) / window.length;
      const avgSlip = window.filter((r) => r.slippagePips != null).reduce((s, r) => s + parseFloat(r.slippagePips!), 0) / (window.filter((r) => r.slippagePips != null).length || 1);
      const totalPnl = window.reduce((s, r) => s + parseFloat(r.pnl ?? "0"), 0);
      const start = window[0]?.closedAt?.toISOString().slice(0, 10) ?? "?";
      const end = window[window.length - 1]?.closedAt?.toISOString().slice(0, 10) ?? "?";

      snapshots.push({
        tradeRange: `${start}→${end}`,
        winRate: Math.round((wins / WINDOW) * 1000) / 10,
        avgTqi: Math.round(avgTqi * 10) / 10,
        avgSetupScore: Math.round(avgSetup * 10) / 10,
        avgSlippage: Math.round(avgSlip * 10) / 10,
        pnl: Math.round(totalPnl * 100) / 100,
      });
    }

    // Detect degradation: compare first third vs last third
    const third = Math.floor(snapshots.length / 3);
    const early = snapshots.slice(0, Math.max(1, third));
    const recent = snapshots.slice(Math.max(0, snapshots.length - third));
    const earlyWR = early.reduce((s, r) => s + r.winRate, 0) / (early.length || 1);
    const recentWR = recent.reduce((s, r) => s + r.winRate, 0) / (recent.length || 1);
    const driftPct = earlyWR > 0 ? ((recentWR - earlyWR) / earlyWR) * 100 : 0;

    const alerts: string[] = [];
    if (driftPct < -15) alerts.push(`Win rate has declined ${Math.abs(Math.round(driftPct))}% compared to early performance — review recommended`);
    if (snapshots.length > 2) {
      const latestTqi = recent[recent.length - 1]?.avgTqi ?? 0;
      const earlyTqi = early[0]?.avgTqi ?? 0;
      if (earlyTqi > 0 && (latestTqi - earlyTqi) / earlyTqi < -0.1) {
        alerts.push("Average TQI score is trending down — signal quality may be degrading");
      }
    }

    res.json({
      hasEnoughData: true,
      drift: snapshots,
      driftSummary: {
        earlyWinRate: Math.round(earlyWR * 10) / 10,
        recentWinRate: Math.round(recentWR * 10) / 10,
        driftPct: Math.round(driftPct * 10) / 10,
        degraded: driftPct < -15,
      },
      alerts,
    });
  } catch (err) {
    logger.error({ err }, "GET /improvement/strategy-drift failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /improvement/recommendations
router.get("/improvement/recommendations", async (_req, res): Promise<void> => {
  try {
    const [agg] = await db
      .select({
        total: sql<string>`COUNT(*) FILTER (WHERE status = 'closed')`,
        wins: sql<string>`COUNT(*) FILTER (WHERE status = 'closed' AND pnl > 0)`,
        grossProfit: sql<string>`COALESCE(SUM(pnl) FILTER (WHERE status = 'closed' AND pnl > 0), 0)`,
        grossLoss: sql<string>`COALESCE(ABS(SUM(pnl) FILTER (WHERE status = 'closed' AND pnl < 0)), 0)`,
        avgTqi: sql<string>`COALESCE(AVG(tqi::numeric) FILTER (WHERE status = 'closed' AND tqi IS NOT NULL), 0)`,
        open: sql<string>`COUNT(*) FILTER (WHERE status = 'open')`,
      })
      .from(tradesTable);

    const total = parseInt(agg?.total ?? "0", 10);
    const wins = parseInt(agg?.wins ?? "0", 10);
    const grossProfit = parseFloat(agg?.grossProfit ?? "0");
    const grossLoss = parseFloat(agg?.grossLoss ?? "0");
    const winRate = total > 0 ? (wins / total) * 100 : 0;
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99 : 0;

    const recommendations: Array<{
      priority: "critical" | "high" | "medium" | "low";
      category: string;
      message: string;
      action: string;
    }> = [];

    if (total < 20) {
      recommendations.push({ priority: "high", category: "Data", message: `Only ${total} closed trades — insufficient for reliable analysis. Need at least 20.`, action: "Continue paper trading to build sample size." });
    }

    if (total >= 20 && winRate < 40) {
      recommendations.push({ priority: "critical", category: "Win Rate", message: `Win rate is ${winRate.toFixed(1)}% — critically below 40% minimum threshold.`, action: "Review recent losing trades for common factors. Consider pausing and re-analyzing setup criteria." });
    } else if (total >= 20 && winRate < 50) {
      recommendations.push({ priority: "high", category: "Win Rate", message: `Win rate ${winRate.toFixed(1)}% is below 50%. Monitor closely.`, action: "Run threshold optimization to identify if score filters can improve entry quality." });
    }

    if (total >= 20 && profitFactor < 1.0) {
      recommendations.push({ priority: "critical", category: "Profit Factor", message: `Profit factor is ${profitFactor.toFixed(2)} — below 1.0 means system is losing money.`, action: "Do not proceed to live trading. Analyze R:R ratios and stop loss placement." });
    } else if (total >= 20 && profitFactor < 1.5) {
      recommendations.push({ priority: "medium", category: "Profit Factor", message: `Profit factor ${profitFactor.toFixed(2)} is acceptable but room for improvement (target: 1.5+).`, action: "Consider tightening entry criteria or widening take profit targets." });
    }

    const avgTqi = parseFloat(agg?.avgTqi ?? "0");
    if (total >= 10 && avgTqi < 60) {
      recommendations.push({ priority: "medium", category: "Signal Quality", message: `Average TQI score is ${avgTqi.toFixed(1)} — below the 65 target threshold.`, action: "Review TQI component breakdown to identify weakest factor (Zone/Liquidity/AMD/MTF)." });
    }

    // Check recent health snapshots
    const latestSnapshot = await db
      .select()
      .from(strategyHealthSnapshotTable)
      .orderBy(desc(strategyHealthSnapshotTable.snapshotAt))
      .limit(1);

    if (latestSnapshot[0]) {
      const health = latestSnapshot[0];
      const healthScore = parseFloat(health.overallHealthScore ?? "0");
      if (healthScore < 50) {
        recommendations.push({ priority: "high", category: "System Health", message: `Overall system health score is ${healthScore.toFixed(0)}/100 — below 50.`, action: "Check Supervisor page for active alerts and address critical issues." });
      }
    }

    if (recommendations.length === 0 && total >= 20) {
      recommendations.push({ priority: "low", category: "Performance", message: `System is performing within acceptable parameters (WR: ${winRate.toFixed(1)}%, PF: ${profitFactor.toFixed(2)}).`, action: "Continue monitoring. Run threshold optimization after each 50 additional trades." });
    }

    res.json({
      generatedAt: new Date().toISOString(),
      recommendations,
      note: "These are advisory recommendations only. The system never changes trading rules automatically.",
    });
  } catch (err) {
    logger.error({ err }, "GET /improvement/recommendations failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /improvement/confidence-calibration
router.get("/improvement/confidence-calibration", async (_req, res): Promise<void> => {
  try {
    const decisions = await db
      .select({
        traderConfidence: tiDecisionsTable.traderConfidence,
        outcome: tiDecisionsTable.outcome,
      })
      .from(tiDecisionsTable)
      .where(
        and(
          sql`${tiDecisionsTable.traderConfidence} IS NOT NULL`,
          sql`${tiDecisionsTable.outcome} IS NOT NULL`,
          sql`${tiDecisionsTable.outcome} != 'pending'`,
        ),
      );

    const buckets: Record<string, { count: number; wins: number }> = {
      "0-40": { count: 0, wins: 0 },
      "40-60": { count: 0, wins: 0 },
      "60-75": { count: 0, wins: 0 },
      "75-90": { count: 0, wins: 0 },
      "90-100": { count: 0, wins: 0 },
    };

    for (const d of decisions) {
      const conf = d.traderConfidence ?? 50;
      const isWin = d.outcome === "win";
      let bucket: string;
      if (conf < 40) bucket = "0-40";
      else if (conf < 60) bucket = "40-60";
      else if (conf < 75) bucket = "60-75";
      else if (conf < 90) bucket = "75-90";
      else bucket = "90-100";

      buckets[bucket]!.count++;
      if (isWin) buckets[bucket]!.wins++;
    }

    const calibration = Object.entries(buckets).map(([range, { count, wins }]) => ({
      confidenceRange: range,
      count,
      winRate: count > 0 ? Math.round((wins / count) * 1000) / 10 : null,
      expectedWinRate: parseInt(range.split("-")[1] ?? "50"),
    }));

    res.json({ calibration, totalDecisions: decisions.length });
  } catch (err) {
    logger.error({ err }, "GET /improvement/confidence-calibration failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /improvement/report
router.post("/improvement/report", async (_req, res): Promise<void> => {
  try {
    const [agg] = await db
      .select({
        total: sql<string>`COUNT(*) FILTER (WHERE status = 'closed')`,
        wins: sql<string>`COUNT(*) FILTER (WHERE status = 'closed' AND pnl > 0)`,
        totalPnl: sql<string>`COALESCE(SUM(pnl) FILTER (WHERE status = 'closed'), 0)`,
        grossProfit: sql<string>`COALESCE(SUM(pnl) FILTER (WHERE status = 'closed' AND pnl > 0), 0)`,
        grossLoss: sql<string>`COALESCE(ABS(SUM(pnl) FILTER (WHERE status = 'closed' AND pnl < 0)), 0)`,
        avgTqi: sql<string>`COALESCE(AVG(tqi::numeric) FILTER (WHERE status = 'closed' AND tqi IS NOT NULL), 0)`,
      })
      .from(tradesTable);

    const total = parseInt(agg?.total ?? "0", 10);
    const wins = parseInt(agg?.wins ?? "0", 10);
    const totalPnl = parseFloat(agg?.totalPnl ?? "0");
    const grossProfit = parseFloat(agg?.grossProfit ?? "0");
    const grossLoss = parseFloat(agg?.grossLoss ?? "0");
    const winRate = total > 0 ? (wins / total) * 100 : 0;
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99 : 0;

    const generatedAt = new Date().toISOString();
    const content = `# Continuous Improvement Report
**Generated:** ${generatedAt}

---

## Performance Summary

| Metric | Value |
|--------|-------|
| Total Closed Trades | ${total} |
| Win Rate | ${winRate.toFixed(1)}% |
| Profit Factor | ${profitFactor.toFixed(2)} |
| Total P&L | $${totalPnl.toFixed(2)} |
| Avg TQI Score | ${parseFloat(agg?.avgTqi ?? "0").toFixed(1)} |

---

## Status Assessment

${winRate >= 55 && profitFactor >= 1.5
  ? "✅ System is performing within acceptable parameters."
  : winRate >= 45 && profitFactor >= 1.2
  ? "⚠️ System performance is marginal — monitor closely."
  : "🔴 System performance requires attention — review before proceeding to live trading."}

---

## Notes

This report is advisory only. **The system never changes trading rules automatically.**
All threshold changes must be manually reviewed and applied.

Review frequency recommendation:
- Every 20 trades minimum
- After any 3-trade losing streak
- Monthly regardless of performance
`;

    const filePath = join(process.cwd(), "IMPROVEMENT_REPORT.md");
    await writeFile(filePath, content, "utf8");

    res.json({ path: "IMPROVEMENT_REPORT.md", content, generatedAt });
  } catch (err) {
    logger.error({ err }, "POST /improvement/report failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
