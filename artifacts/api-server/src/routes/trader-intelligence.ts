import { Router, type IRouter } from "express";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { db, tiDecisionsTable, tiScreenshotsTable } from "@workspace/db";
import { logger } from "../lib/logger.js";
import { writeFile } from "fs/promises";
import { join } from "path";

const router: IRouter = Router();

// ─── Helpers ───────────────────────────────────────────────────────────────

function toNum(v: string | null | undefined): number | null {
  if (v == null) return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

function mapDecision(d: typeof tiDecisionsTable.$inferSelect) {
  return {
    id: d.id,
    pair: d.pair,
    timeframes: d.timeframes,
    session: d.session,
    regime: d.regime,
    htfStructure: d.htfStructure,
    premiumDiscount: d.premiumDiscount,
    zoneScore: toNum(d.zoneScore),
    liquidityScore: toNum(d.liquidityScore),
    amdScore: toNum(d.amdScore),
    confirmScore: toNum(d.confirmScore),
    tqi: toNum(d.tqi),
    expectedRr: toNum(d.expectedRr),
    riskPct: toNum(d.riskPct),
    traderDecision: d.traderDecision,
    traderConfidence: d.traderConfidence,
    traderNotes: d.traderNotes,
    contextTags: d.contextTags,
    tradeId: d.tradeId,
    outcome: d.outcome,
    engineDecision: d.engineDecision,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  };
}

function mapScreenshot(s: typeof tiScreenshotsTable.$inferSelect) {
  return {
    id: s.id,
    decisionId: s.decisionId,
    url: s.url,
    label: s.label,
    notes: s.notes,
    createdAt: s.createdAt.toISOString(),
  };
}

// Euclidean distance on 5-score vector; returns 0–100 similarity (100 = identical)
function scoreVectorSimilarity(
  a: { z: number; l: number; am: number; c: number; tq: number },
  b: { z: number; l: number; am: number; c: number; tq: number },
): number {
  const d = Math.sqrt(
    Math.pow(a.z - b.z, 2) +
    Math.pow(a.l - b.l, 2) +
    Math.pow(a.am - b.am, 2) +
    Math.pow(a.c - b.c, 2) +
    Math.pow(a.tq - b.tq, 2),
  );
  // Max possible distance is sqrt(5 * 100^2) ≈ 223.6
  return Math.max(0, Math.round((1 - d / 223.6) * 100));
}

// ─── GET /ti/decisions ─────────────────────────────────────────────────────

router.get("/ti/decisions", async (req, res): Promise<void> => {
  try {
    const limit = Math.min(parseInt(String(req.query["limit"] ?? "50"), 10), 200);
    const offset = parseInt(String(req.query["offset"] ?? "0"), 10);
    const { pair, decision, outcome } = req.query;

    const conditions = [];
    if (pair) conditions.push(eq(tiDecisionsTable.pair, String(pair)));
    if (decision) conditions.push(eq(tiDecisionsTable.traderDecision, String(decision)));
    if (outcome) conditions.push(eq(tiDecisionsTable.outcome, String(outcome)));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [decisions, countResult] = await Promise.all([
      db
        .select()
        .from(tiDecisionsTable)
        .where(where)
        .orderBy(desc(tiDecisionsTable.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(tiDecisionsTable)
        .where(where),
    ]);

    res.json({ decisions: decisions.map(mapDecision), total: countResult[0]?.count ?? 0 });
  } catch (err) {
    logger.error({ err }, "GET /ti/decisions failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── POST /ti/decisions ────────────────────────────────────────────────────

router.post("/ti/decisions", async (req, res): Promise<void> => {
  try {
    const body = req.body as Record<string, unknown>;
    const required = ["pair", "traderDecision"];
    for (const field of required) {
      if (!body[field]) {
        res.status(400).json({ error: `Missing required field: ${field}` });
        return;
      }
    }

    const [inserted] = await db
      .insert(tiDecisionsTable)
      .values({
        pair: String(body["pair"]),
        timeframes: String(body["timeframes"] ?? "[]"),
        session: body["session"] != null ? String(body["session"]) : undefined,
        regime: body["regime"] != null ? String(body["regime"]) : undefined,
        htfStructure: body["htfStructure"] != null ? String(body["htfStructure"]) : undefined,
        premiumDiscount: body["premiumDiscount"] != null ? String(body["premiumDiscount"]) : undefined,
        zoneScore: body["zoneScore"] != null ? String(body["zoneScore"]) : undefined,
        liquidityScore: body["liquidityScore"] != null ? String(body["liquidityScore"]) : undefined,
        amdScore: body["amdScore"] != null ? String(body["amdScore"]) : undefined,
        confirmScore: body["confirmScore"] != null ? String(body["confirmScore"]) : undefined,
        tqi: body["tqi"] != null ? String(body["tqi"]) : undefined,
        expectedRr: body["expectedRr"] != null ? String(body["expectedRr"]) : undefined,
        riskPct: body["riskPct"] != null ? String(body["riskPct"]) : undefined,
        traderDecision: String(body["traderDecision"]),
        traderConfidence: body["traderConfidence"] != null ? Number(body["traderConfidence"]) : undefined,
        traderNotes: body["traderNotes"] != null ? String(body["traderNotes"]) : undefined,
        contextTags: String(body["contextTags"] ?? "[]"),
        tradeId: body["tradeId"] != null ? Number(body["tradeId"]) : undefined,
        engineDecision: body["engineDecision"] != null ? String(body["engineDecision"]) : undefined,
      })
      .returning();

    res.status(201).json(mapDecision(inserted!));
  } catch (err) {
    logger.error({ err }, "POST /ti/decisions failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /ti/decisions/:id ─────────────────────────────────────────────────

router.get("/ti/decisions/:id", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params["id"] ?? "0", 10);
    const [decision, screenshots] = await Promise.all([
      db.select().from(tiDecisionsTable).where(eq(tiDecisionsTable.id, id)).limit(1),
      db.select().from(tiScreenshotsTable).where(eq(tiScreenshotsTable.decisionId, id)).orderBy(tiScreenshotsTable.createdAt),
    ]);

    if (!decision[0]) {
      res.status(404).json({ error: "Decision not found" });
      return;
    }

    res.json({ ...mapDecision(decision[0]!), screenshots: screenshots.map(mapScreenshot) });
  } catch (err) {
    logger.error({ err }, "GET /ti/decisions/:id failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── PATCH /ti/decisions/:id ───────────────────────────────────────────────

router.patch("/ti/decisions/:id", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params["id"] ?? "0", 10);
    const body = req.body as Record<string, unknown>;

    const updateData: Partial<typeof tiDecisionsTable.$inferInsert> = {};
    if (body["outcome"] !== undefined) updateData.outcome = String(body["outcome"]);
    if (body["traderNotes"] !== undefined) updateData.traderNotes = String(body["traderNotes"]);
    if (body["traderConfidence"] !== undefined) updateData.traderConfidence = Number(body["traderConfidence"]);
    if (body["contextTags"] !== undefined) updateData.contextTags = String(body["contextTags"]);

    const [updated] = await db
      .update(tiDecisionsTable)
      .set(updateData)
      .where(eq(tiDecisionsTable.id, id))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Decision not found" });
      return;
    }

    res.json(mapDecision(updated));
  } catch (err) {
    logger.error({ err }, "PATCH /ti/decisions/:id failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── POST /ti/decisions/:id/screenshots ───────────────────────────────────

router.post("/ti/decisions/:id/screenshots", async (req, res): Promise<void> => {
  try {
    const decisionId = parseInt(req.params["id"] ?? "0", 10);
    const body = req.body as Record<string, unknown>;

    if (!body["url"]) {
      res.status(400).json({ error: "Missing required field: url" });
      return;
    }

    // Verify decision exists
    const [decision] = await db.select({ id: tiDecisionsTable.id }).from(tiDecisionsTable).where(eq(tiDecisionsTable.id, decisionId)).limit(1);
    if (!decision) {
      res.status(404).json({ error: "Decision not found" });
      return;
    }

    const [screenshot] = await db
      .insert(tiScreenshotsTable)
      .values({
        decisionId,
        url: String(body["url"]),
        label: body["label"] != null ? String(body["label"]) : undefined,
        notes: body["notes"] != null ? String(body["notes"]) : undefined,
      })
      .returning();

    res.status(201).json(mapScreenshot(screenshot!));
  } catch (err) {
    logger.error({ err }, "POST /ti/decisions/:id/screenshots failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /ti/similar ───────────────────────────────────────────────────────

router.get("/ti/similar", async (req, res): Promise<void> => {
  try {
    const q = req.query as Record<string, string>;
    const zoneScore = parseFloat(q["zoneScore"] ?? "0");
    const liquidityScore = parseFloat(q["liquidityScore"] ?? "0");
    const amdScore = parseFloat(q["amdScore"] ?? "0");
    const confirmScore = parseFloat(q["confirmScore"] ?? "0");
    const tqi = parseFloat(q["tqi"] ?? "0");
    const pair = q["pair"];

    const query = db
      .select()
      .from(tiDecisionsTable)
      .where(
        and(
          pair ? eq(tiDecisionsTable.pair, pair) : undefined,
          sql`${tiDecisionsTable.zoneScore} IS NOT NULL`,
          sql`${tiDecisionsTable.liquidityScore} IS NOT NULL`,
          sql`${tiDecisionsTable.amdScore} IS NOT NULL`,
          sql`${tiDecisionsTable.confirmScore} IS NOT NULL`,
          sql`${tiDecisionsTable.tqi} IS NOT NULL`,
        ),
      )
      .orderBy(desc(tiDecisionsTable.createdAt))
      .limit(500);

    const all = await query;
    const queryVec = { z: zoneScore, l: liquidityScore, am: amdScore, c: confirmScore, tq: tqi };

    const scored = all
      .map((d) => ({
        decision: mapDecision(d),
        similarityScore: scoreVectorSimilarity(queryVec, {
          z: parseFloat(d.zoneScore ?? "0"),
          l: parseFloat(d.liquidityScore ?? "0"),
          am: parseFloat(d.amdScore ?? "0"),
          c: parseFloat(d.confirmScore ?? "0"),
          tq: parseFloat(d.tqi ?? "0"),
        }),
      }))
      .sort((a, b) => b.similarityScore - a.similarityScore)
      .slice(0, 10);

    res.json({ items: scored, queryVector: queryVec });
  } catch (err) {
    logger.error({ err }, "GET /ti/similar failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /ti/recommendation ────────────────────────────────────────────────

router.get("/ti/recommendation", async (req, res): Promise<void> => {
  try {
    const q = req.query as Record<string, string>;
    const zoneScore = parseFloat(q["zoneScore"] ?? "0");
    const liquidityScore = parseFloat(q["liquidityScore"] ?? "0");
    const amdScore = parseFloat(q["amdScore"] ?? "0");
    const confirmScore = parseFloat(q["confirmScore"] ?? "0");
    const tqi = parseFloat(q["tqi"] ?? "0");
    const pair = q["pair"];

    const where = and(
      pair ? eq(tiDecisionsTable.pair, pair) : undefined,
      sql`${tiDecisionsTable.zoneScore} IS NOT NULL`,
    );

    const all = await db
      .select()
      .from(tiDecisionsTable)
      .where(where)
      .orderBy(desc(tiDecisionsTable.createdAt))
      .limit(500);

    const queryVec = { z: zoneScore, l: liquidityScore, am: amdScore, c: confirmScore, tq: tqi };

    // Use top-50 most similar as the "matching" pool (similarity >= 50)
    const matches = all
      .map((d) => ({
        d,
        sim: scoreVectorSimilarity(queryVec, {
          z: parseFloat(d.zoneScore ?? "0"),
          l: parseFloat(d.liquidityScore ?? "0"),
          am: parseFloat(d.amdScore ?? "0"),
          c: parseFloat(d.confirmScore ?? "0"),
          tq: parseFloat(d.tqi ?? "0"),
        }),
      }))
      .filter((x) => x.sim >= 50)
      .sort((a, b) => b.sim - a.sim)
      .slice(0, 50);

    if (matches.length === 0) {
      res.json({ totalMatches: 0, winRate: null, profitFactor: null, avgRr: null, avgConfidence: null, avgHoldTimeMins: null, recentComments: [], topOutcomes: {} });
      return;
    }

    const withOutcome = matches.filter((x) => x.d.outcome && x.d.outcome !== "pending");
    const wins = withOutcome.filter((x) => x.d.outcome === "win").length;
    const losses = withOutcome.filter((x) => x.d.outcome === "loss").length;
    const winRate = withOutcome.length > 0 ? wins / withOutcome.length : null;

    const rrs = matches.map((x) => parseFloat(x.d.expectedRr ?? "0")).filter((r) => r > 0);
    const avgRr = rrs.length > 0 ? rrs.reduce((a, b) => a + b, 0) / rrs.length : null;

    const confs = matches.map((x) => x.d.traderConfidence).filter((c): c is number => c != null);
    const avgConfidence = confs.length > 0 ? confs.reduce((a, b) => a + b, 0) / confs.length : null;

    const grossWin = wins * (avgRr ?? 1);
    const profitFactor = losses > 0 ? grossWin / losses : wins > 0 ? 999 : null;

    const outcomeMap: Record<string, number> = {};
    for (const x of matches) {
      const o = x.d.outcome ?? "unknown";
      outcomeMap[o] = (outcomeMap[o] ?? 0) + 1;
    }

    const recentComments = matches
      .filter((x) => x.d.traderNotes)
      .slice(0, 5)
      .map((x) => x.d.traderNotes!);

    res.json({
      totalMatches: matches.length,
      winRate,
      profitFactor,
      avgRr,
      avgConfidence,
      avgHoldTimeMins: null,
      recentComments,
      topOutcomes: outcomeMap,
    });
  } catch (err) {
    logger.error({ err }, "GET /ti/recommendation failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /ti/psychology ────────────────────────────────────────────────────

router.get("/ti/psychology", async (req, res): Promise<void> => {
  try {
    const all = await db
      .select()
      .from(tiDecisionsTable)
      .where(sql`${tiDecisionsTable.traderConfidence} IS NOT NULL`)
      .orderBy(tiDecisionsTable.createdAt);

    // Over time: daily avg confidence
    const byDate: Record<string, { sum: number; count: number }> = {};
    for (const d of all) {
      const date = d.createdAt.toISOString().slice(0, 10);
      byDate[date] ??= { sum: 0, count: 0 };
      byDate[date]!.sum += d.traderConfidence!;
      byDate[date]!.count++;
    }
    const overTime = Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, { sum, count }]) => ({ date, avgConfidence: Math.round(sum / count), count }));

    // By pair
    const byPairMap: Record<string, { sum: number; count: number }> = {};
    for (const d of all) {
      byPairMap[d.pair] ??= { sum: 0, count: 0 };
      byPairMap[d.pair]!.sum += d.traderConfidence!;
      byPairMap[d.pair]!.count++;
    }
    const byPair = Object.entries(byPairMap).map(([pair, { sum, count }]) => ({
      pair, avgConfidence: Math.round(sum / count), count,
    }));

    // By session
    const bySessionMap: Record<string, { sum: number; count: number }> = {};
    for (const d of all) {
      const sess = d.session ?? "unknown";
      bySessionMap[sess] ??= { sum: 0, count: 0 };
      bySessionMap[sess]!.sum += d.traderConfidence!;
      bySessionMap[sess]!.count++;
    }
    const bySession = Object.entries(bySessionMap).map(([session, { sum, count }]) => ({
      session, avgConfidence: Math.round(sum / count), count,
    }));

    // By regime
    const byRegimeMap: Record<string, { sum: number; count: number }> = {};
    for (const d of all) {
      const reg = d.regime ?? "unknown";
      byRegimeMap[reg] ??= { sum: 0, count: 0 };
      byRegimeMap[reg]!.sum += d.traderConfidence!;
      byRegimeMap[reg]!.count++;
    }
    const byRegime = Object.entries(byRegimeMap).map(([regime, { sum, count }]) => ({
      regime, avgConfidence: Math.round(sum / count), count,
    }));

    // By trader decision
    const byDecisionMap: Record<string, { sum: number; count: number }> = {};
    for (const d of all) {
      byDecisionMap[d.traderDecision] ??= { sum: 0, count: 0 };
      byDecisionMap[d.traderDecision]!.sum += d.traderConfidence!;
      byDecisionMap[d.traderDecision]!.count++;
    }
    const byDecision = Object.entries(byDecisionMap).map(([decision, { sum, count }]) => ({
      decision, avgConfidence: Math.round(sum / count), count,
    }));

    // Streak effect: confidence after consecutive wins vs losses
    // Look at accepted decisions with outcomes, calculate rolling streak
    const accepted = all
      .filter((d) => d.traderDecision === "accepted" && d.outcome && d.outcome !== "pending")
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    let streak = 0;
    let afterWinSum = 0, afterWinCount = 0;
    let afterLossSum = 0, afterLossCount = 0;

    for (let i = 1; i < accepted.length; i++) {
      const prev = accepted[i - 1]!;
      const curr = accepted[i]!;
      const conf = curr.traderConfidence ?? 50;

      if (streak > 0) {
        afterWinSum += conf;
        afterWinCount++;
      } else if (streak < 0) {
        afterLossSum += conf;
        afterLossCount++;
      }

      if (prev.outcome === "win") {
        streak = streak > 0 ? streak + 1 : 1;
      } else {
        streak = streak < 0 ? streak - 1 : -1;
      }
    }

    const streakEffect = {
      avgConfidenceAfterWin: afterWinCount > 0 ? Math.round(afterWinSum / afterWinCount) : null,
      avgConfidenceAfterLoss: afterLossCount > 0 ? Math.round(afterLossSum / afterLossCount) : null,
      sampleAfterWin: afterWinCount,
      sampleAfterLoss: afterLossCount,
    };

    res.json({ overTime, byPair, bySession, byRegime, byDecision, streakEffect });
  } catch (err) {
    logger.error({ err }, "GET /ti/psychology failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /ti/comparison ────────────────────────────────────────────────────

router.get("/ti/comparison", async (req, res): Promise<void> => {
  try {
    const all = await db
      .select()
      .from(tiDecisionsTable)
      .where(sql`${tiDecisionsTable.engineDecision} IS NOT NULL`)
      .orderBy(desc(tiDecisionsTable.createdAt));

    const total = all.length;

    type Category = {
      items: (typeof tiDecisionsTable.$inferSelect)[];
    };

    const categories: Record<string, Category> = {
      bothAccepted: { items: [] },
      botAcceptedTraderRejected: { items: [] },
      traderAcceptedBotRejected: { items: [] },
      bothRejected: { items: [] },
    };

    let agreementCount = 0;

    for (const d of all) {
      const traderAccepted = d.traderDecision === "accepted";
      const botAccepted = d.engineDecision === "accepted";

      if (traderAccepted && botAccepted) {
        categories["bothAccepted"]!.items.push(d);
        agreementCount++;
      } else if (!traderAccepted && !botAccepted) {
        categories["bothRejected"]!.items.push(d);
        agreementCount++;
      } else if (botAccepted && !traderAccepted) {
        categories["botAcceptedTraderRejected"]!.items.push(d);
      } else {
        categories["traderAcceptedBotRejected"]!.items.push(d);
      }
    }

    function categorySummary(items: (typeof tiDecisionsTable.$inferSelect)[]) {
      const withOutcome = items.filter((d) => d.outcome && d.outcome !== "pending");
      const wins = withOutcome.filter((d) => d.outcome === "win").length;
      const winRate = withOutcome.length > 0 ? wins / withOutcome.length : null;
      const rrs = items.map((d) => parseFloat(d.expectedRr ?? "0")).filter((r) => r > 0);
      const avgRr = rrs.length > 0 ? rrs.reduce((a, b) => a + b, 0) / rrs.length : null;
      return {
        count: items.length,
        winRate,
        avgRr,
        examples: items.slice(0, 3).map(mapDecision),
      };
    }

    res.json({
      totalDecisions: total,
      agreementRate: total > 0 ? agreementCount / total : 0,
      bothAccepted: categorySummary(categories["bothAccepted"]!.items),
      botAcceptedTraderRejected: categorySummary(categories["botAcceptedTraderRejected"]!.items),
      traderAcceptedBotRejected: categorySummary(categories["traderAcceptedBotRejected"]!.items),
      bothRejected: categorySummary(categories["bothRejected"]!.items),
    });
  } catch (err) {
    logger.error({ err }, "GET /ti/comparison failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── POST /ti/report ───────────────────────────────────────────────────────

router.post("/ti/report", async (req, res): Promise<void> => {
  try {
    const [all, withOutcome, screenshots] = await Promise.all([
      db.select().from(tiDecisionsTable).orderBy(desc(tiDecisionsTable.createdAt)),
      db
        .select()
        .from(tiDecisionsTable)
        .where(sql`${tiDecisionsTable.outcome} IS NOT NULL AND ${tiDecisionsTable.outcome} != 'pending'`),
      db.select({ count: sql<number>`count(*)::int` }).from(tiScreenshotsTable),
    ]);

    const total = all.length;
    const accepted = all.filter((d) => d.traderDecision === "accepted");
    const rejected = all.filter((d) => d.traderDecision === "rejected");
    const delayed = all.filter((d) => d.traderDecision === "delayed");

    const wins = withOutcome.filter((d) => d.outcome === "win").length;
    const losses = withOutcome.filter((d) => d.outcome === "loss").length;
    const winRate = withOutcome.length > 0 ? (wins / withOutcome.length * 100).toFixed(1) : "N/A";

    const withBoth = all.filter((d) => d.engineDecision != null);
    const agreements = withBoth.filter((d) =>
      (d.traderDecision === "accepted") === (d.engineDecision === "accepted"),
    ).length;
    const agreementRate = withBoth.length > 0 ? (agreements / withBoth.length * 100).toFixed(1) : "N/A";

    const confs = all.filter((d) => d.traderConfidence != null).map((d) => d.traderConfidence!);
    const avgConfidence = confs.length > 0 ? (confs.reduce((a, b) => a + b, 0) / confs.length).toFixed(0) : "N/A";

    // Most common context tags
    const tagCounts: Record<string, number> = {};
    for (const d of all) {
      try {
        const tags: string[] = JSON.parse(d.contextTags || "[]");
        for (const tag of tags) tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
      } catch { /* skip malformed */ }
    }
    const topTags = Object.entries(tagCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([tag, count]) => `  - ${tag}: ${count}×`);

    const generatedAt = new Date().toISOString();
    const content = `# Trader Intelligence Report
**Generated:** ${generatedAt}

---

## Overview

| Metric | Value |
|--------|-------|
| Total Decisions Logged | ${total} |
| Accepted | ${accepted.length} |
| Rejected | ${rejected.length} |
| Delayed | ${delayed.length} |
| Screenshots Attached | ${screenshots[0]?.count ?? 0} |

---

## Decision Accuracy

| Metric | Value |
|--------|-------|
| Resolved Decisions | ${withOutcome.length} |
| Win Rate (accepted) | ${winRate}% |
| Total Wins | ${wins} |
| Total Losses | ${losses} |

---

## Confidence Calibration

| Metric | Value |
|--------|-------|
| Average Confidence | ${avgConfidence} / 100 |
| Decisions with Confidence Logged | ${confs.length} |

---

## Engine vs Trader Agreement

| Metric | Value |
|--------|-------|
| Decisions with Engine Context | ${withBoth.length} |
| Agreement Rate | ${agreementRate}% |

---

## Most Common Context Tags (Rejection Reasons)

${topTags.length > 0 ? topTags.join("\n") : "  - No context tags logged yet"}

---

## Improvement Suggestions

${total < 20
  ? "- Log at least 20+ decisions to unlock meaningful pattern analysis."
  : "- Review setups where trader and engine disagreed — they reveal systematic biases."}
${accepted.length === 0
  ? "- No accepted decisions yet — start logging setups you take."
  : `- You have accepted ${accepted.length} setups. Compare win rate with engine baseline.`}
${confs.length < total * 0.5
  ? "- Confidence is missing for >50% of decisions. Fill in confidence on every log entry."
  : "- Good confidence coverage. Use psychology charts to track patterns over time."}

---

## Notes

This report is advisory only. The Trader Intelligence Layer never modifies the execution engine,
strategy rules, risk management, entry criteria, or exit criteria.
`;

    const filePath = join(process.cwd(), "TRADER_INTELLIGENCE_REPORT.md");
    await writeFile(filePath, content, "utf8");

    res.json({ path: "TRADER_INTELLIGENCE_REPORT.md", content, generatedAt });
  } catch (err) {
    logger.error({ err }, "POST /ti/report failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
