import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, tradesTable } from "@workspace/db";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

type Trade = typeof tradesTable.$inferSelect;

// ─── Rule definitions ────────────────────────────────────────────────────────

interface Rule {
  id: string;
  name: string;
  description: string;
  check: (t: Trade) => boolean;
}

const RULES: Rule[] = [
  {
    id: "setup_score_min",
    name: "Setup Score ≥ 65",
    description: "Entry scored at least 65/100 by the signal engine",
    check: t => parseFloat(t.setupScore ?? "0") >= 65,
  },
  {
    id: "zone_direction_match",
    name: "Zone–Direction Match",
    description: "Buy only at demand zones; sell only at supply zones",
    check: t =>
      (t.direction === "buy" && t.zoneType === "demand") ||
      (t.direction === "sell" && t.zoneType === "supply"),
  },
  {
    id: "rr_minimum",
    name: "R:R ≥ 2.0",
    description: "Planned risk-reward ratio of at least 2:1",
    check: t => parseFloat(t.riskRewardRatio ?? "0") >= 2.0,
  },
  {
    id: "liquidity_sweep",
    name: "Liquidity Sweep",
    description: "Entry triggered after a liquidity sweep",
    check: t => t.liquiditySweep === true,
  },
  {
    id: "valid_session",
    name: "Valid Session",
    description: "Traded during London or New York session",
    check: t => t.session === "london" || t.session === "new_york",
  },
  {
    id: "amd_alignment",
    name: "AMD Phase Alignment",
    description: "Accumulation → buy; distribution → sell",
    check: t =>
      (t.direction === "buy"  && t.amdPattern === "accumulation") ||
      (t.direction === "sell" && t.amdPattern === "distribution") ||
      t.amdPattern === "unknown",   // unknown = no penalty
  },
  {
    id: "high_quality",
    name: "High Quality Setup ≥ 75",
    description: "Setup scored at least 75/100 (elite threshold)",
    check: t => parseFloat(t.setupScore ?? "0") >= 75,
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function winRate(wins: number, total: number): number {
  return total === 0 ? 0 : Math.round((wins / total) * 10000) / 100;
}

function avg(nums: number[]): number {
  return nums.length === 0 ? 0 : nums.reduce((a, b) => a + b, 0) / nums.length;
}

function topKey(map: Record<string, number>): string {
  const entries = Object.entries(map);
  return entries.length === 0 ? "—" : entries.sort((a, b) => b[1] - a[1])[0]![0];
}

// ─── Trade Comparison ─────────────────────────────────────────────────────────

router.get("/analytics/trade-comparison", async (_req, res): Promise<void> => {
  try {
    const trades = await db
      .select()
      .from(tradesTable)
      .where(eq(tradesTable.status, "closed"));

    if (trades.length === 0) {
      res.json({
        totalTrades: 0,
        winRate: 0,
        winners: null,
        losers: null,
        byAmdPattern: [],
        bySession: [],
        byZoneType: [],
        byRegime: [],
        byLiquiditySweep: [],
        setupScoreDistribution: [],
        rrDistribution: [],
      });
      return;
    }

    const winners = trades.filter(t => parseFloat(t.pnl ?? "0") > 0);
    const losers  = trades.filter(t => parseFloat(t.pnl ?? "0") <= 0);

    function profile(group: Trade[]) {
      if (group.length === 0) return null;
      const sessionCounts: Record<string, number> = {};
      const patternCounts: Record<string, number> = {};
      for (const t of group) {
        sessionCounts[t.session] = (sessionCounts[t.session] ?? 0) + 1;
        patternCounts[t.amdPattern] = (patternCounts[t.amdPattern] ?? 0) + 1;
      }
      return {
        count: group.length,
        avgSetupScore:       Math.round(avg(group.map(t => parseFloat(t.setupScore ?? "0"))) * 10) / 10,
        avgZoneStrength:     Math.round(avg(group.map(t => parseFloat(t.zoneStrength ?? "0"))) * 10) / 10,
        avgRr:               Math.round(avg(group.map(t => parseFloat(t.riskRewardRatio ?? "0"))) * 100) / 100,
        avgPnl:              Math.round(avg(group.map(t => parseFloat(t.pnl ?? "0"))) * 100) / 100,
        avgSlippage:         Math.round(avg(group.map(t => parseFloat(t.slippagePips ?? "0"))) * 10) / 10,
        liquiditySweepRate:  Math.round((group.filter(t => t.liquiditySweep).length / group.length) * 10000) / 100,
        avgRegimeConfidence: Math.round(avg(group.map(t => parseFloat(t.regimeConfidence ?? "0"))) * 10) / 10,
        topSession:    topKey(sessionCounts),
        topAmdPattern: topKey(patternCounts),
      };
    }

    // Breakdowns
    function breakdown(groupFn: (t: Trade) => string) {
      const map: Record<string, { wins: number; losses: number; pnls: number[] }> = {};
      for (const t of trades) {
        const key = groupFn(t);
        if (!map[key]) map[key] = { wins: 0, losses: 0, pnls: [] };
        const pnl = parseFloat(t.pnl ?? "0");
        map[key]!.pnls.push(pnl);
        if (pnl > 0) map[key]!.wins++; else map[key]!.losses++;
      }
      return Object.entries(map).map(([key, v]) => ({
        label: key,
        wins: v.wins,
        losses: v.losses,
        count: v.wins + v.losses,
        winRate: winRate(v.wins, v.wins + v.losses),
        avgPnl: Math.round(avg(v.pnls) * 100) / 100,
      })).sort((a, b) => b.count - a.count);
    }

    // Setup score buckets: <60, 60-69, 70-79, 80-89, ≥90
    const scoreBuckets = [
      { label: "<60",  min: 0,   max: 60  },
      { label: "60–69", min: 60, max: 70  },
      { label: "70–79", min: 70, max: 80  },
      { label: "80–89", min: 80, max: 90  },
      { label: "≥90",  min: 90, max: Infinity },
    ];
    const setupScoreDistribution = scoreBuckets.map(b => {
      const group = trades.filter(t => {
        const s = parseFloat(t.setupScore ?? "0");
        return s >= b.min && s < b.max;
      });
      const w = group.filter(t => parseFloat(t.pnl ?? "0") > 0).length;
      return {
        label: b.label,
        wins: w,
        losses: group.length - w,
        count: group.length,
        winRate: winRate(w, group.length),
      };
    });

    // RR buckets
    const rrBuckets = [
      { label: "<1.5", min: 0,   max: 1.5 },
      { label: "1.5–2", min: 1.5, max: 2.0 },
      { label: "2–2.5", min: 2.0, max: 2.5 },
      { label: "2.5–3", min: 2.5, max: 3.0 },
      { label: "≥3",   min: 3.0, max: Infinity },
    ];
    const rrDistribution = rrBuckets.map(b => {
      const group = trades.filter(t => {
        const rr = parseFloat(t.riskRewardRatio ?? "0");
        return rr >= b.min && rr < b.max;
      });
      const w = group.filter(t => parseFloat(t.pnl ?? "0") > 0).length;
      return {
        label: b.label,
        wins: w,
        losses: group.length - w,
        count: group.length,
        winRate: winRate(w, group.length),
      };
    });

    res.json({
      totalTrades: trades.length,
      winRate: winRate(winners.length, trades.length),
      winners: profile(winners),
      losers: profile(losers),
      byAmdPattern:    breakdown(t => t.amdPattern),
      bySession:       breakdown(t => t.session),
      byZoneType:      breakdown(t => t.zoneType),
      byRegime:        breakdown(t => t.regime ?? "unknown"),
      byLiquiditySweep: breakdown(t => t.liquiditySweep ? "with_sweep" : "no_sweep"),
      setupScoreDistribution,
      rrDistribution,
    });
  } catch (err) {
    logger.error({ err }, "trade-comparison error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Rule Adherence ───────────────────────────────────────────────────────────

router.get("/analytics/rule-adherence", async (_req, res): Promise<void> => {
  try {
    const trades = await db.select().from(tradesTable);

    const closed = trades.filter(t => t.status === "closed");

    // Per-rule stats
    const ruleStats = RULES.map(rule => {
      const followed = trades.filter(t => rule.check(t));
      const broken   = trades.filter(t => !rule.check(t));

      const followedClosed = followed.filter(t => t.status === "closed");
      const brokenClosed   = broken.filter(t => t.status === "closed");

      const followedWins = followedClosed.filter(t => parseFloat(t.pnl ?? "0") > 0).length;
      const brokenWins   = brokenClosed.filter(t => parseFloat(t.pnl ?? "0") > 0).length;

      const adherenceRate       = winRate(followed.length, trades.length);
      const winRateWithRule     = winRate(followedWins, followedClosed.length);
      const winRateWithoutRule  = winRate(brokenWins, brokenClosed.length);
      const impact = winRateWithRule - winRateWithoutRule;

      return {
        id:                 rule.id,
        name:               rule.name,
        description:        rule.description,
        adherenceRate,
        winRateWithRule,
        winRateWithoutRule,
        impact:             Math.round(impact * 100) / 100,
        followedCount:      followed.length,
        brokenCount:        broken.length,
      };
    });

    // Per-trade adherence
    const perTrade = trades.slice(-50).map(t => {  // last 50 trades
      const passedRules = RULES.filter(r => r.check(t)).map(r => r.id);
      const brokenRules = RULES.filter(r => !r.check(t)).map(r => r.id);
      const adherenceScore = Math.round((passedRules.length / RULES.length) * 100);
      const pnl = parseFloat(t.pnl ?? "0");
      return {
        tradeId:       t.id,
        pair:          t.pair,
        direction:     t.direction,
        pnl,
        outcome:       t.status === "open" ? "open" : pnl > 0 ? "win" : "loss",
        rulesFollowed: passedRules.length,
        rulesBroken:   brokenRules.length,
        adherenceScore,
        brokenRules,
        openedAt:      t.openedAt?.toISOString() ?? new Date().toISOString(),
      };
    }).reverse();

    // Summary stats (closed trades only)
    const closedWithScores = closed.map(t => {
      const passedRules = RULES.filter(r => r.check(t)).length;
      return {
        adherenceScore: Math.round((passedRules / RULES.length) * 100),
        isWin: parseFloat(t.pnl ?? "0") > 0,
      };
    });

    const avgAdherenceScore = Math.round(avg(closedWithScores.map(t => t.adherenceScore)) * 10) / 10;

    const highAdherence  = closedWithScores.filter(t => t.adherenceScore >= 80);
    const lowAdherence   = closedWithScores.filter(t => t.adherenceScore < 50);
    const perfectAdherenceWinRate = winRate(
      highAdherence.filter(t => t.isWin).length, highAdherence.length
    );
    const lowAdherenceWinRate = winRate(
      lowAdherence.filter(t => t.isWin).length, lowAdherence.length
    );

    // Most broken rule
    const brokenCounts: Record<string, number> = {};
    for (const t of trades) {
      for (const rule of RULES) {
        if (!rule.check(t)) {
          brokenCounts[rule.id] = (brokenCounts[rule.id] ?? 0) + 1;
        }
      }
    }
    const topBrokenRuleId = topKey(brokenCounts);
    const topBrokenRule = RULES.find(r => r.id === topBrokenRuleId)?.name ?? "—";

    res.json({
      rules: ruleStats,
      perTrade,
      summary: {
        avgAdherenceScore,
        perfectAdherenceWinRate,
        lowAdherenceWinRate,
        topBrokenRule,
        totalTrades: trades.length,
        closedTrades: closed.length,
      },
    });
  } catch (err) {
    logger.error({ err }, "rule-adherence error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
