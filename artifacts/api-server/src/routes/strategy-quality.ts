// ─── Strategy Quality Intelligence Routes ────────────────────────────────────
// Advisory-only endpoints — evaluation and retrieval.
// Mounted at /api (prefix added by app.ts), so paths here omit /api.

import { Router } from "express";
import { db, sqiReportsTable, sqiTimelineTable, learningFeaturesTable } from "@workspace/db";
import { desc, eq, sql, and, gte }          from "drizzle-orm";
import { runQualityEngine }                  from "@workspace/market-analysis";
import type { QualitySetup, ExtractedFeature } from "@workspace/market-analysis";

export const strategyQualityRouter = Router();

// ─── Validation helpers (inline — no zod/v4 due to esbuild limitation) ───────

function requireNumber(v: unknown, name: string, min = 0, max = 100): number {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`${name} must be a number`);
  if (n < min || n > max) throw new Error(`${name} must be between ${min} and ${max}`);
  return n;
}

function validateSetup(body: Record<string, unknown>): QualitySetup {
  const required = ["pair", "session", "regime", "trend", "volatility"];
  for (const k of required) {
    if (!body[k]) throw new Error(`${k} is required`);
  }
  return {
    setupId:   typeof body.setupId === "string" ? body.setupId : undefined,
    pair:      String(body.pair),
    session:   String(body.session),
    regime:    String(body.regime),
    trend:     String(body.trend),
    volatility:String(body.volatility),

    supplyQuality:       requireNumber(body.supplyQuality,       "supplyQuality"),
    demandQuality:       requireNumber(body.demandQuality,       "demandQuality"),
    liquidityScore:      requireNumber(body.liquidityScore,      "liquidityScore"),
    amdScore:            requireNumber(body.amdScore,            "amdScore"),
    confirmationQuality: requireNumber(body.confirmationQuality, "confirmationQuality"),
    setupScore:          requireNumber(body.setupScore,          "setupScore"),
    tqi:                 requireNumber(body.tqi,                 "tqi"),
    rrPlanned:           requireNumber(body.rrPlanned,           "rrPlanned", 0, 100),
    spreadPips:          requireNumber(body.spreadPips,          "spreadPips", 0, 100),

    // Optional structural
    htfAlignment:               body.htfAlignment               !== undefined ? requireNumber(body.htfAlignment, "htfAlignment") : undefined,
    srStrength:                 body.srStrength                 !== undefined ? requireNumber(body.srStrength,   "srStrength")   : undefined,
    premiumDiscountBias:        body.premiumDiscountBias        !== undefined ? requireNumber(body.premiumDiscountBias, "premiumDiscountBias") : undefined,
    zoneFreshness:              body.zoneFreshness              !== undefined ? requireNumber(body.zoneFreshness, "zoneFreshness") : undefined,
    zoneRespect:                body.zoneRespect                !== undefined ? requireNumber(body.zoneRespect, "zoneRespect") : undefined,
    marketStructureCleanliness: body.marketStructureCleanliness !== undefined ? requireNumber(body.marketStructureCleanliness, "marketStructureCleanliness") : undefined,

    // Optional liquidity
    liquiditySweepSize:    body.liquiditySweepSize    !== undefined ? requireNumber(body.liquiditySweepSize,    "liquiditySweepSize")    : undefined,
    liquiditySweepClarity: body.liquiditySweepClarity !== undefined ? requireNumber(body.liquiditySweepClarity, "liquiditySweepClarity") : undefined,
    stopHuntQuality:       body.stopHuntQuality       !== undefined ? requireNumber(body.stopHuntQuality,       "stopHuntQuality")       : undefined,
    manipulationClarity:   body.manipulationClarity   !== undefined ? requireNumber(body.manipulationClarity,   "manipulationClarity")   : undefined,
    distributionStrength:  body.distributionStrength  !== undefined ? requireNumber(body.distributionStrength,  "distributionStrength")  : undefined,

    // Optional AMD
    accumulationQuality: body.accumulationQuality !== undefined ? requireNumber(body.accumulationQuality, "accumulationQuality") : undefined,
    manipulationQuality: body.manipulationQuality !== undefined ? requireNumber(body.manipulationQuality, "manipulationQuality") : undefined,
    distributionQuality: body.distributionQuality !== undefined ? requireNumber(body.distributionQuality, "distributionQuality") : undefined,
    amdCompleteness:     body.amdCompleteness     !== undefined ? requireNumber(body.amdCompleteness,     "amdCompleteness")     : undefined,
    amdConfidence:       body.amdConfidence       !== undefined ? requireNumber(body.amdConfidence,       "amdConfidence")       : undefined,

    // Optional confirmation
    candleStrength:    body.candleStrength    !== undefined ? requireNumber(body.candleStrength,    "candleStrength")    : undefined,
    momentum:          body.momentum          !== undefined ? requireNumber(body.momentum,          "momentum")          : undefined,
    candleBodyRatio:   body.candleBodyRatio   !== undefined ? requireNumber(body.candleBodyRatio,   "candleBodyRatio")   : undefined,
    breakStrength:     body.breakStrength     !== undefined ? requireNumber(body.breakStrength,     "breakStrength")     : undefined,
    displacement:      body.displacement      !== undefined ? requireNumber(body.displacement,      "displacement")      : undefined,
    followThroughProb: body.followThroughProb !== undefined ? requireNumber(body.followThroughProb, "followThroughProb") : undefined,

    // Optional market
    marketHealthScore:   body.marketHealthScore   !== undefined ? requireNumber(body.marketHealthScore,   "marketHealthScore")   : undefined,
    marketContextScore:  body.marketContextScore  !== undefined ? requireNumber(body.marketContextScore,  "marketContextScore")  : undefined,
    opportunityScore:    body.opportunityScore    !== undefined ? requireNumber(body.opportunityScore,    "opportunityScore")    : undefined,
    marketStabilityScore:body.marketStabilityScore !== undefined ? requireNumber(body.marketStabilityScore,"marketStabilityScore"): undefined,
    trendStrength:       body.trendStrength       !== undefined ? requireNumber(body.trendStrength,       "trendStrength")       : undefined,
    volatilityQuality:   body.volatilityQuality   !== undefined ? requireNumber(body.volatilityQuality,   "volatilityQuality")   : undefined,
    liquidityQuality:    body.liquidityQuality    !== undefined ? requireNumber(body.liquidityQuality,    "liquidityQuality")    : undefined,
    correlationQuality:  body.correlationQuality  !== undefined ? requireNumber(body.correlationQuality,  "correlationQuality")  : undefined,
    newsContext: (body.newsContext === "positive" || body.newsContext === "negative" || body.newsContext === "neutral")
      ? body.newsContext : undefined,
  };
}

// ─── Persistence helper ───────────────────────────────────────────────────────

async function saveQualityReport(report: Awaited<ReturnType<typeof runQualityEngine>>) {
  await db.insert(sqiReportsTable).values({
    reportId:   report.reportId,
    version:    report.version,
    setupId:    report.setup.setupId,
    pair:       report.setup.pair,
    session:    report.setup.session,
    regime:     report.setup.regime,
    trend:      report.setup.trend,
    volatility: report.setup.volatility,
    rrPlanned:  String(report.setup.rrPlanned),
    spreadPips: String(report.setup.spreadPips),
    supplyQuality:       report.setup.supplyQuality != null       ? String(report.setup.supplyQuality)       : null,
    demandQuality:       report.setup.demandQuality != null       ? String(report.setup.demandQuality)       : null,
    liquidityScore:      report.setup.liquidityScore != null      ? String(report.setup.liquidityScore)      : null,
    amdScore:            report.setup.amdScore != null            ? String(report.setup.amdScore)            : null,
    confirmationQuality: report.setup.confirmationQuality != null ? String(report.setup.confirmationQuality) : null,
    setupScore:          report.setup.setupScore != null          ? String(report.setup.setupScore)          : null,
    tqi:                 report.setup.tqi != null                 ? String(report.setup.tqi)                 : null,

    ruleIntegrityScore:            String(report.ruleIntegrity.ruleIntegrityScore.toFixed(2)),
    structuralQualityScore:        String(report.structuralQuality.structuralQualityScore.toFixed(2)),
    liquidityIntelligenceScore:    String(report.liquidityIntelligence.liquidityIntelligenceScore.toFixed(2)),
    amdIntelligenceScore:          String(report.amdIntelligence.amdIntelligenceScore.toFixed(2)),
    confirmationIntelligenceScore: String(report.confirmationIntelligence.confirmationIntelligenceScore.toFixed(2)),
    marketIntelligenceScore:       String(report.marketIntelligence.marketIntelligenceScore.toFixed(2)),
    historicalIntelligenceScore:   String(report.historicalIntelligence.historicalIntelligenceScore.toFixed(2)),
    strategyQualityScore:          String(report.strategyQualityScore.toFixed(2)),

    classification:      report.classification.classification,
    classificationLabel: report.classification.classificationLabel,

    evidenceCount:    report.historicalIntelligence.evidenceCount,
    winRate:          report.historicalIntelligence.evidenceCount > 0 ? String(report.historicalIntelligence.winRate.toFixed(4)) : null,
    averageRR:        report.historicalIntelligence.evidenceCount > 0 ? String(report.historicalIntelligence.averageRR.toFixed(2)) : null,
    wilsonLowerBound: report.historicalIntelligence.evidenceCount > 0 ? String(report.historicalIntelligence.wilsonLowerBound.toFixed(4)) : null,

    componentScores:     report.components,
    ruleIntegrityDetail: report.ruleIntegrity,
    structuralDetail:    report.structuralQuality,
    liquidityDetail:     report.liquidityIntelligence,
    amdDetail:           report.amdIntelligence,
    confirmationDetail:  report.confirmationIntelligence,
    marketDetail:        report.marketIntelligence,
    historicalDetail:    report.historicalIntelligence,

    strongestComponents: report.strongestComponents,
    weakestComponents:   report.weakestComponents,
    qualityNarrative:    report.qualityNarrative,
    justification:       report.classification.justification,
    isAdvisoryOnly:      true,
    evaluatedAt:         report.evaluatedAt,
  });

  // Timeline entry
  await db.insert(sqiTimelineTable).values({
    reportId:             report.reportId,
    pair:                 report.setup.pair,
    session:              report.setup.session,
    regime:               report.setup.regime,
    strategyQualityScore: String(report.strategyQualityScore.toFixed(2)),
    classification:       report.classification.classification,
    ruleIntegrityScore:   String(report.ruleIntegrity.ruleIntegrityScore.toFixed(2)),
    structuralScore:      String(report.structuralQuality.structuralQualityScore.toFixed(2)),
    marketScore:          String(report.marketIntelligence.marketIntelligenceScore.toFixed(2)),
    historicalScore:      String(report.historicalIntelligence.historicalIntelligenceScore.toFixed(2)),
    evaluatedAt:          report.evaluatedAt,
  }).catch(() => {});
}

// ─── POST /strategy/quality — Evaluate a setup ───────────────────────────────

strategyQualityRouter.post("/strategy/quality", async (req, res) => {
  try {
    const setup = validateSetup(req.body as Record<string, unknown>);

    // Load historical features for the pair
    let features: ExtractedFeature[] = [];
    try {
      const rows = await db
        .select()
        .from(learningFeaturesTable)
        .where(eq(learningFeaturesTable.pair, setup.pair))
        .orderBy(desc(learningFeaturesTable.openedAt))
        .limit(200);
      features = rows.map(r => ({ ...r, entryTime: r.openedAt })) as unknown as ExtractedFeature[];
    } catch { /* no features available */ }

    const report = runQualityEngine(setup, features);

    // Advisory-only hard check
    if (!report.isAdvisoryOnly) {
      res.status(500).json({ ok: false, message: "Advisory-only invariant violated" });
      return;
    }

    saveQualityReport(report).catch(() => {});
    res.json({ ok: true, report });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Evaluation failed";
    res.status(400).json({ ok: false, message: msg });
  }
});

// ─── GET /strategy/quality — List recent quality reports ─────────────────────

strategyQualityRouter.get("/strategy/quality", async (req, res) => {
  try {
    const limit  = Math.min(Number(req.query.limit  ?? 50), 200);
    const pair   = typeof req.query.pair === "string" ? req.query.pair : undefined;
    const minSqs = req.query.minSqs !== undefined ? Number(req.query.minSqs) : undefined;

    let query = db.select({
      reportId:             sqiReportsTable.reportId,
      pair:                 sqiReportsTable.pair,
      session:              sqiReportsTable.session,
      regime:               sqiReportsTable.regime,
      strategyQualityScore: sqiReportsTable.strategyQualityScore,
      classification:       sqiReportsTable.classification,
      classificationLabel:  sqiReportsTable.classificationLabel,
      ruleIntegrityScore:   sqiReportsTable.ruleIntegrityScore,
      structuralQualityScore:        sqiReportsTable.structuralQualityScore,
      liquidityIntelligenceScore:    sqiReportsTable.liquidityIntelligenceScore,
      amdIntelligenceScore:          sqiReportsTable.amdIntelligenceScore,
      confirmationIntelligenceScore: sqiReportsTable.confirmationIntelligenceScore,
      marketIntelligenceScore:       sqiReportsTable.marketIntelligenceScore,
      historicalIntelligenceScore:   sqiReportsTable.historicalIntelligenceScore,
      evidenceCount:        sqiReportsTable.evidenceCount,
      qualityNarrative:     sqiReportsTable.qualityNarrative,
      evaluatedAt:          sqiReportsTable.evaluatedAt,
    }).from(sqiReportsTable)
      .$dynamic();

    const conditions = [];
    if (pair)   conditions.push(eq(sqiReportsTable.pair, pair));
    if (minSqs !== undefined && Number.isFinite(minSqs)) {
      conditions.push(gte(sqiReportsTable.strategyQualityScore, String(minSqs)));
    }

    const rows = await (conditions.length > 0
      ? query.where(and(...conditions))
      : query
    ).orderBy(desc(sqiReportsTable.evaluatedAt)).limit(limit);

    res.json({ ok: true, reports: rows, count: rows.length });
  } catch (err) {
    res.status(500).json({ ok: false, message: "Failed to fetch quality reports" });
  }
});

// ─── GET /strategy/quality/:id — Full report by ID ───────────────────────────

strategyQualityRouter.get("/strategy/quality/:id", async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(sqiReportsTable)
      .where(eq(sqiReportsTable.reportId, req.params.id!))
      .limit(1);
    if (rows.length === 0) {
      res.status(404).json({ ok: false, message: "Report not found" });
      return;
    }
    res.json({ ok: true, report: rows[0] });
  } catch {
    res.status(500).json({ ok: false, message: "Failed to fetch report" });
  }
});

// ─── GET /strategy/quality-history — Timeline ────────────────────────────────

strategyQualityRouter.get("/strategy/quality-history", async (req, res) => {
  try {
    const limit  = Math.min(Number(req.query.limit ?? 100), 500);
    const pair   = typeof req.query.pair === "string" ? req.query.pair : undefined;
    const since  = req.query.since ? new Date(String(req.query.since)) : undefined;

    let q = db.select().from(sqiTimelineTable).$dynamic();
    const conds = [];
    if (pair)  conds.push(eq(sqiTimelineTable.pair, pair));
    if (since) conds.push(gte(sqiTimelineTable.evaluatedAt, since));

    const rows = await (conds.length > 0 ? q.where(and(...conds)) : q)
      .orderBy(desc(sqiTimelineTable.evaluatedAt))
      .limit(limit);
    res.json({ ok: true, timeline: rows.reverse(), count: rows.length });
  } catch {
    res.status(500).json({ ok: false, message: "Failed to fetch quality history" });
  }
});

// ─── GET /strategy/component-scores — Avg component scores ──────────────────

strategyQualityRouter.get("/strategy/component-scores", async (req, res) => {
  try {
    const pair    = typeof req.query.pair === "string" ? req.query.pair : undefined;
    const limit   = Math.min(Number(req.query.limit ?? 200), 500);
    const conditions = pair ? [eq(sqiReportsTable.pair, pair)] : [];

    const base = db.select({
      ruleIntegrityScore:            sqiReportsTable.ruleIntegrityScore,
      structuralQualityScore:        sqiReportsTable.structuralQualityScore,
      liquidityIntelligenceScore:    sqiReportsTable.liquidityIntelligenceScore,
      amdIntelligenceScore:          sqiReportsTable.amdIntelligenceScore,
      confirmationIntelligenceScore: sqiReportsTable.confirmationIntelligenceScore,
      marketIntelligenceScore:       sqiReportsTable.marketIntelligenceScore,
      historicalIntelligenceScore:   sqiReportsTable.historicalIntelligenceScore,
      strategyQualityScore:          sqiReportsTable.strategyQualityScore,
      pair:                          sqiReportsTable.pair,
      session:                       sqiReportsTable.session,
    }).from(sqiReportsTable).$dynamic();

    const rows = await (conditions.length > 0 ? base.where(and(...conditions)) : base)
      .orderBy(desc(sqiReportsTable.evaluatedAt))
      .limit(limit);

    if (rows.length === 0) {
      res.json({ ok: true, averages: null, rows: [], count: 0 });
      return;
    }

    const avg = (key: keyof typeof rows[0]) =>
      rows.reduce((s, r) => s + Number(r[key] ?? 0), 0) / rows.length;

    const averages = {
      ruleIntegrityScore:            avg("ruleIntegrityScore"),
      structuralQualityScore:        avg("structuralQualityScore"),
      liquidityIntelligenceScore:    avg("liquidityIntelligenceScore"),
      amdIntelligenceScore:          avg("amdIntelligenceScore"),
      confirmationIntelligenceScore: avg("confirmationIntelligenceScore"),
      marketIntelligenceScore:       avg("marketIntelligenceScore"),
      historicalIntelligenceScore:   avg("historicalIntelligenceScore"),
      strategyQualityScore:          avg("strategyQualityScore"),
    };
    res.json({ ok: true, averages, rows, count: rows.length });
  } catch {
    res.status(500).json({ ok: false, message: "Failed to fetch component scores" });
  }
});

// ─── GET /strategy/classifications — Classification distribution ──────────────

strategyQualityRouter.get("/strategy/classifications", async (req, res) => {
  try {
    const rows = await db
      .select({
        classification:      sqiReportsTable.classification,
        classificationLabel: sqiReportsTable.classificationLabel,
        count:               sql<number>`count(*)`,
        avgSqs:              sql<number>`avg(cast(${sqiReportsTable.strategyQualityScore} as float))`,
        maxSqs:              sql<number>`max(cast(${sqiReportsTable.strategyQualityScore} as float))`,
        minSqs:              sql<number>`min(cast(${sqiReportsTable.strategyQualityScore} as float))`,
      })
      .from(sqiReportsTable)
      .groupBy(sqiReportsTable.classification, sqiReportsTable.classificationLabel)
      .orderBy(desc(sql`avg(cast(${sqiReportsTable.strategyQualityScore} as float))`));

    const TIER_ORDER = ["institutional_grade","elite","excellent","strong","average","weak","reject"];
    const sorted = [...rows].sort((a, b) =>
      TIER_ORDER.indexOf(a.classification) - TIER_ORDER.indexOf(b.classification)
    );

    res.json({ ok: true, classifications: sorted });
  } catch {
    res.status(500).json({ ok: false, message: "Failed to fetch classifications" });
  }
});

// ─── GET /strategy/statistics — Aggregate statistics ────────────────────────

strategyQualityRouter.get("/strategy/statistics", async (req, res) => {
  try {
    const [agg] = await db
      .select({
        totalReports: sql<number>`count(*)`,
        avgSqs:       sql<number>`avg(cast(${sqiReportsTable.strategyQualityScore} as float))`,
        maxSqs:       sql<number>`max(cast(${sqiReportsTable.strategyQualityScore} as float))`,
        minSqs:       sql<number>`min(cast(${sqiReportsTable.strategyQualityScore} as float))`,
        stddevSqs:    sql<number>`stddev(cast(${sqiReportsTable.strategyQualityScore} as float))`,
        institutionalGrade: sql<number>`count(*) filter (where ${sqiReportsTable.classification} = 'institutional_grade')`,
        elite:              sql<number>`count(*) filter (where ${sqiReportsTable.classification} = 'elite')`,
        excellent:          sql<number>`count(*) filter (where ${sqiReportsTable.classification} = 'excellent')`,
        strong:             sql<number>`count(*) filter (where ${sqiReportsTable.classification} = 'strong')`,
        average:            sql<number>`count(*) filter (where ${sqiReportsTable.classification} = 'average')`,
        weak:               sql<number>`count(*) filter (where ${sqiReportsTable.classification} = 'weak')`,
        reject:             sql<number>`count(*) filter (where ${sqiReportsTable.classification} = 'reject')`,
      })
      .from(sqiReportsTable);

    // Pair-level breakdown
    const byPair = await db
      .select({
        pair:    sqiReportsTable.pair,
        count:   sql<number>`count(*)`,
        avgSqs:  sql<number>`avg(cast(${sqiReportsTable.strategyQualityScore} as float))`,
      })
      .from(sqiReportsTable)
      .groupBy(sqiReportsTable.pair)
      .orderBy(desc(sql`avg(cast(${sqiReportsTable.strategyQualityScore} as float))`))
      .limit(15);

    // Session-level breakdown
    const bySession = await db
      .select({
        session: sqiReportsTable.session,
        count:   sql<number>`count(*)`,
        avgSqs:  sql<number>`avg(cast(${sqiReportsTable.strategyQualityScore} as float))`,
      })
      .from(sqiReportsTable)
      .groupBy(sqiReportsTable.session)
      .orderBy(desc(sql`avg(cast(${sqiReportsTable.strategyQualityScore} as float))`));

    // Recent 5
    const recent = await db
      .select({
        reportId:             sqiReportsTable.reportId,
        pair:                 sqiReportsTable.pair,
        strategyQualityScore: sqiReportsTable.strategyQualityScore,
        classification:       sqiReportsTable.classification,
        evaluatedAt:          sqiReportsTable.evaluatedAt,
      })
      .from(sqiReportsTable)
      .orderBy(desc(sqiReportsTable.evaluatedAt))
      .limit(5);

    res.json({ ok: true, statistics: agg ?? null, byPair, bySession, recent });
  } catch {
    res.status(500).json({ ok: false, message: "Failed to fetch statistics" });
  }
});
