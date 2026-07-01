// ─── Risk Intelligence — API Routes ──────────────────────────────────────────
// Advisory only. NEVER modifies positions, strategy, or risk controls.
// All routes define paths WITHOUT /api prefix (app mounts at /api).

import { Router } from "express";
import { db } from "@workspace/db";
import {
  riReportsTable,
  riTimelineTable,
  riAlertsTable,
  tradesTable,
  botStateTable,
  brokerAccountsTable,
  marketRegimeTable,
} from "@workspace/db";
import { desc, eq, gte, asc, sql } from "drizzle-orm";
import {
  runRiskIntelligence,
  gatherSystemMetrics,
  defaultAccountState,
  defaultPortfolioInput,
  defaultMarketInput,
  defaultBrokerMetrics,
  RI_ENGINE_VERSION,
  RI_RISK_VERSION,
  evaluateAccountRisk,
  evaluatePortfolioRisk,
  evaluateMarketRisk,
  evaluateBrokerRisk,
  evaluateSystemRisk,
} from "@workspace/market-analysis";
import type {
  AccountState,
  BrokerMetrics,
  MarketRiskInput,
  OpenPosition,
} from "@workspace/market-analysis";

export const riskIntelligenceRouter = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function loadAccountState(): Promise<AccountState> {
  // Load from bot_state and closed trades
  const [botRows, todayTrades, weekTrades, monthTrades, openTrades] = await Promise.all([
    db.select().from(botStateTable).limit(1),
    db.select().from(tradesTable)
      .where(gte(tradesTable.closedAt, new Date(Date.now() - 24 * 60 * 60 * 1000))),
    db.select().from(tradesTable)
      .where(gte(tradesTable.closedAt, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))),
    db.select().from(tradesTable)
      .where(gte(tradesTable.closedAt, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))),
    db.select().from(tradesTable).where(eq(tradesTable.status, "open")),
  ]);

  const bot = botRows[0];
  const balance = Number(bot?.balance ?? 10000);
  const equity  = Number(bot?.equity ?? balance);

  const dailyPnl  = todayTrades.filter(t => t.status === "closed").reduce((s, t) => s + Number(t.profit ?? 0), 0);
  const weeklyPnl = weekTrades.filter(t => t.status === "closed").reduce((s, t) => s + Number(t.profit ?? 0), 0);
  const monthlyPnl = monthTrades.filter(t => t.status === "closed").reduce((s, t) => s + Number(t.profit ?? 0), 0);

  // Open risk: sum of all open position risks as % of balance
  const openRiskUsd = openTrades.reduce((s, t) => {
    const size = Number(t.lotSize ?? 0);
    const sl   = Number(t.stopLoss ?? 0);
    const entry = Number(t.entryPrice ?? 0);
    return s + (entry > 0 && sl > 0 ? Math.abs(entry - sl) * size * 100000 : 0);
  }, 0);
  const openRiskPct = balance > 0 ? (openRiskUsd / balance) * 100 : 0;

  // Closed risk (daily loss as %)
  const closedRisk = balance > 0 ? Math.max(0, -dailyPnl / balance * 100) : 0;

  // Margin level from bot_state or estimated
  const marginLevel = Number(bot?.marginLevel ?? 0);
  const freeMargin  = Number(bot?.freeMargin  ?? balance);

  return {
    balance,
    equity,
    freeMargin,
    marginLevel,
    dailyPnl,
    weeklyPnl,
    monthlyPnl,
    openRisk:   Math.min(openRiskPct, 20),
    closedRisk: Math.min(closedRisk, 20),
  };
}

async function loadOpenPositions(accountBalance: number): Promise<OpenPosition[]> {
  const rows = await db.select().from(tradesTable).where(eq(tradesTable.status, "open"));
  return rows.map(t => {
    const size    = Number(t.lotSize ?? 0.1);
    const entry   = Number(t.entryPrice ?? 0);
    const sl      = Number(t.stopLoss ?? 0);
    const riskUsd = entry > 0 && sl > 0 ? Math.abs(entry - sl) * size * 100000 : accountBalance * 0.01;
    return {
      tradeId:   String(t.id),
      pair:      t.pair ?? "EURUSD",
      direction: (t.direction ?? "buy") as "buy" | "sell",
      sizeUsd:   size * 100000,
      riskUsd,
      pnl:       Number(t.profit ?? 0),
      openedAt:  t.openedAt ?? new Date(),
    };
  });
}

async function loadMarketInput(pair: string, session: string): Promise<MarketRiskInput> {
  // Load from market regime table (most current market state per pair)
  const rows = await db.select().from(marketRegimeTable)
    .where(eq(marketRegimeTable.pair, pair))
    .limit(1);
  const row = rows[0];
  // Derive risk-relevant scores from the regime row
  const volatilityPct = Number(row?.volatilityPercentile ?? 50);
  const regime        = (row?.regime ?? "trending") as string;
  // Higher volatility percentile → higher volatility risk score
  const volatility    = Math.min(100, volatilityPct);
  // Liquidity proxy: lower volatility = better liquidity
  const liquidity     = Math.max(20, 100 - volatilityPct * 0.5);
  // Trend stability: confidence from adxEquivalent (0-100)
  const trendStability = Math.min(100, Number(row?.adxEquivalent ?? 40));
  return {
    volatility,
    liquidity,
    trendStability,
    correlation:      40,
    marketHealth:     Math.max(20, 100 - volatility * 0.4),
    opportunityScore: 60,
    newsRisk:         20,
    pair,
    session,
    regime,
  };
}

async function loadBrokerMetrics(pair: string): Promise<BrokerMetrics> {
  // Load from broker accounts (spread info)
  const rows = await db.select().from(brokerAccountsTable).limit(1);
  const account = rows[0];
  return {
    spread:               Number(account?.currentSpread ?? 1.2),
    spreadBaseline:       1.0,
    slippage:             0.3,
    executionTime:        125,
    orderRejections:      0,
    totalOrders:          50,
    connectionQuality:    account ? 99 : 85,
    priceFeedConsistency: 98,
    latency:              45,
    pair,
  };
}

async function saveRiReport(obj: Awaited<ReturnType<typeof runRiskIntelligence>>) {
  await db.insert(riReportsTable).values({
    reportId:      obj.reportId,
    engineVersion: obj.engineVersion,
    riskVersion:   obj.riskVersion,
    evaluatedAt:   obj.evaluatedAt,
    isAdvisoryOnly: true,

    tradeId:  obj.tradeId,
    pair:     obj.pair,
    session:  obj.session,
    regime:   obj.regime,
    strategyVersion: obj.strategyVersion,

    balance:     obj.accountRisk ? String(0) : null,
    equity:      null,
    freeMargin:  null,
    marginLevel: null,
    dailyPnl:    null,
    weeklyPnl:   null,
    monthlyPnl:  null,
    openRisk:    null,
    closedRisk:  null,
    accountHealthScore: String(obj.accountRisk.accountHealthScore),
    accountRiskClass:   obj.accountRisk.riskClassification,
    accountEvidence:    obj.accountRisk.evidence,

    positionRiskScore: obj.positionRisk ? String(obj.positionRisk.positionRiskScore) : null,
    positionRiskClass: obj.positionRisk?.riskClassification ?? null,
    positionEvidence:  obj.positionRisk?.evidence ?? null,

    openTrades:         obj.portfolioRisk.openTrades,
    pairExposure:       obj.portfolioRisk.pairExposure,
    currencyExposure:   obj.portfolioRisk.currencyExposure,
    correlationExposure: String(obj.portfolioRisk.correlationExposure),
    directionalBias:    String(obj.portfolioRisk.directionalBias),
    aggregateRisk:      String(obj.portfolioRisk.aggregateRisk),
    portfolioRiskScore: String(obj.portfolioRisk.portfolioRiskScore),
    portfolioRiskClass: obj.portfolioRisk.riskClassification,
    portfolioEvidence:  obj.portfolioRisk.evidence,

    volatility:      String(obj.marketRisk.metrics.volatilityRisk),
    liquidity:       String(obj.marketRisk.metrics.liquidityRisk),
    trendStability:  String(obj.marketRisk.metrics.stabilityRisk),
    marketCorrelation: String(obj.marketRisk.metrics.correlationRisk),
    marketHealth:    null,
    opportunityScore: null,
    newsRisk:        String(obj.marketRisk.metrics.newsRiskScore),
    marketRiskScore: String(obj.marketRisk.marketRiskScore),
    marketRiskClass: obj.marketRisk.riskClassification,
    marketEvidence:  obj.marketRisk.evidence,

    spread:                String(0),
    slippage:              String(0),
    executionTime:         String(0),
    orderRejections:       0,
    connectionQuality:     String(obj.brokerRisk.metrics.connectScore),
    priceFeedConsistency:  String(obj.brokerRisk.metrics.feedScore),
    latency:               String(0),
    brokerReliabilityScore: String(obj.brokerRisk.brokerReliabilityScore),
    brokerRiskClass:       obj.brokerRisk.riskClassification,
    brokerEvidence:        obj.brokerRisk.evidence,

    cpuUsage:           String(obj.systemRisk.metrics.cpuScore),
    memoryUsage:        String(obj.systemRisk.metrics.memoryScore),
    dbHealth:           String(obj.systemRisk.metrics.dbScore),
    apiHealth:          String(obj.systemRisk.metrics.apiScore),
    networkLatency:     String(obj.systemRisk.metrics.networkScore),
    dataFeedHealth:     String(obj.systemRisk.metrics.feedScore),
    backgroundServices: 0,
    storageAvailability: String(obj.systemRisk.metrics.storageScore),
    systemHealthScore:  String(obj.systemRisk.systemHealthScore),
    systemRiskClass:    obj.systemRisk.riskClassification,
    systemEvidence:     obj.systemRisk.evidence,

    overallRiskScore:   String(obj.overallRiskScore),
    riskClassification: obj.riskClassification,
    confidence:         String(obj.confidence),
    confidenceInterval: obj.confidenceInterval,
    reliabilityRating:  obj.reliabilityRating,
    supportingEvidence: {
      accountEvidence:   obj.supportingEvidence.accountEvidence,
      positionEvidence:  obj.supportingEvidence.positionEvidence,
      portfolioEvidence: obj.supportingEvidence.portfolioEvidence,
      marketEvidence:    obj.supportingEvidence.marketEvidence,
      brokerEvidence:    obj.supportingEvidence.brokerEvidence,
      systemEvidence:    obj.supportingEvidence.systemEvidence,
      alertCount:        obj.supportingEvidence.alertCount,
    },
    fullPayload: obj as unknown,
  });

  await db.insert(riTimelineTable).values({
    reportId:            obj.reportId,
    evaluatedAt:         obj.evaluatedAt,
    pair:                obj.pair,
    session:             obj.session,
    regime:              obj.regime,
    tradeId:             obj.tradeId,
    overallRiskScore:    String(obj.overallRiskScore),
    riskClassification:  obj.riskClassification,
    accountHealthScore:  String(obj.accountRisk.accountHealthScore),
    positionRiskScore:   obj.positionRisk ? String(obj.positionRisk.positionRiskScore) : null,
    portfolioRiskScore:  String(obj.portfolioRisk.portfolioRiskScore),
    marketRiskScore:     String(obj.marketRisk.marketRiskScore),
    brokerReliabilityScore: String(obj.brokerRisk.brokerReliabilityScore),
    systemHealthScore:   String(obj.systemRisk.systemHealthScore),
    strategyVersion:     obj.strategyVersion,
    riskVersion:         obj.riskVersion,
  });

  // Persist alerts
  if (obj.allAlerts.length > 0) {
    await db.insert(riAlertsTable).values(
      obj.allAlerts.map(a => ({
        alertId:  a.alertId,
        reportId: obj.reportId,
        category: a.category,
        severity: a.severity,
        title:    a.title,
        message:  a.message,
        evidence: a.evidence,
        metrics:  a.metrics as Record<string, unknown>,
        pair:     obj.pair,
        session:  obj.session,
      }))
    );
  }
}

// ─── GET /risk/intelligence ───────────────────────────────────────────────────
// Run a full Risk Intelligence evaluation.

riskIntelligenceRouter.get("/risk/intelligence", async (req, res) => {
  try {
    const pair    = (req.query.pair    as string) ?? "EURUSD";
    const session = (req.query.session as string) ?? "london";

    const [account, systemMetrics] = await Promise.all([
      loadAccountState(),
      gatherSystemMetrics(),
    ]);
    const openPositions = await loadOpenPositions(account.balance);
    const [mktInput, brokerMetrics] = await Promise.all([
      loadMarketInput(pair, session),
      loadBrokerMetrics(pair),
    ]);

    const obj = await runRiskIntelligence({
      account,
      portfolio: {
        openPositions,
        accountBalance: account.balance,
        maxOpenTrades:  5,
      },
      market: mktInput,
      broker: brokerMetrics,
      system: systemMetrics,
      context: { pair, session, regime: mktInput.regime },
    });

    await saveRiReport(obj);

    res.json({ success: true, data: obj });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg });
  }
});

// ─── GET /risk/account ────────────────────────────────────────────────────────

riskIntelligenceRouter.get("/risk/account", async (_req, res) => {
  try {
    const account = await loadAccountState();
    const result  = evaluateAccountRisk(account);
    res.json({ success: true, data: { account, result, isAdvisoryOnly: true, engineVersion: RI_ENGINE_VERSION } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg });
  }
});

// ─── GET /risk/portfolio ──────────────────────────────────────────────────────

riskIntelligenceRouter.get("/risk/portfolio", async (_req, res) => {
  try {
    const account = await loadAccountState();
    const openPositions = await loadOpenPositions(account.balance);
    const result = evaluatePortfolioRisk({
      openPositions, accountBalance: account.balance, maxOpenTrades: 5,
    });
    res.json({ success: true, data: { openPositions, result, isAdvisoryOnly: true, engineVersion: RI_ENGINE_VERSION } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg });
  }
});

// ─── GET /risk/market ─────────────────────────────────────────────────────────

riskIntelligenceRouter.get("/risk/market", async (req, res) => {
  try {
    const pair    = (req.query.pair    as string) ?? "EURUSD";
    const session = (req.query.session as string) ?? "london";
    const mktInput = await loadMarketInput(pair, session);
    const result = evaluateMarketRisk(mktInput);
    res.json({ success: true, data: { market: mktInput, result, isAdvisoryOnly: true, engineVersion: RI_ENGINE_VERSION } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg });
  }
});

// ─── GET /risk/broker ─────────────────────────────────────────────────────────

riskIntelligenceRouter.get("/risk/broker", async (req, res) => {
  try {
    const pair   = (req.query.pair as string) ?? "EURUSD";
    const broker = await loadBrokerMetrics(pair);
    const result = evaluateBrokerRisk(broker);
    res.json({ success: true, data: { broker, result, isAdvisoryOnly: true, engineVersion: RI_ENGINE_VERSION } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg });
  }
});

// ─── GET /risk/system ─────────────────────────────────────────────────────────

riskIntelligenceRouter.get("/risk/system", async (_req, res) => {
  try {
    const system = await gatherSystemMetrics();
    const result = evaluateSystemRisk(system);
    res.json({ success: true, data: { system, result, isAdvisoryOnly: true, engineVersion: RI_ENGINE_VERSION } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg });
  }
});

// ─── GET /risk/history ────────────────────────────────────────────────────────

riskIntelligenceRouter.get("/risk/history", async (req, res) => {
  try {
    const limit  = Math.min(200, Number(req.query.limit  ?? 50));
    const offset = Number(req.query.offset ?? 0);
    const pair   = req.query.pair as string | undefined;

    let q = db.select().from(riTimelineTable).orderBy(desc(riTimelineTable.evaluatedAt));
    if (pair) q = q.where(eq(riTimelineTable.pair, pair)) as typeof q;
    const rows = await q.limit(limit).offset(offset);

    res.json({ success: true, data: rows, meta: { count: rows.length, limit, offset } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg });
  }
});

// ─── GET /risk/report ─────────────────────────────────────────────────────────
// Aggregated risk report with historical comparison.

riskIntelligenceRouter.get("/risk/report", async (_req, res) => {
  try {
    const [recent, latest, alertRows] = await Promise.all([
      db.select().from(riTimelineTable).orderBy(desc(riTimelineTable.evaluatedAt)).limit(100),
      db.select().from(riReportsTable).orderBy(desc(riReportsTable.evaluatedAt)).limit(1),
      db.select().from(riAlertsTable)
        .where(eq(riAlertsTable.isResolved, false))
        .orderBy(desc(riAlertsTable.createdAt))
        .limit(50),
    ]);

    if (recent.length === 0) {
      return res.json({
        success: true,
        data: {
          totalEvaluations: 0,
          avgRiskScore: 0,
          latestRisk: null,
          riskDistribution: {},
          recentTrend: [],
          activeAlerts: [],
          engineVersion: RI_ENGINE_VERSION,
          riskVersion:   RI_RISK_VERSION,
          isAdvisoryOnly: true,
        },
      });
    }

    const avg = (fn: (r: typeof recent[0]) => number | string | null) =>
      recent.reduce((s, r) => s + Number(fn(r) ?? 0), 0) / recent.length;

    const dist: Record<string, number> = {};
    for (const r of recent) dist[r.riskClassification] = (dist[r.riskClassification] ?? 0) + 1;

    const recentTrend = recent.slice(0, 30).reverse().map(r => ({
      evaluatedAt:     r.evaluatedAt,
      overallRiskScore: Number(r.overallRiskScore),
      riskClassification: r.riskClassification,
      pair: r.pair,
    }));

    res.json({
      success: true,
      data: {
        totalEvaluations:    recent.length,
        avgRiskScore:        Math.round(avg(r => r.overallRiskScore) * 10) / 10,
        avgAccountHealth:    Math.round(avg(r => r.accountHealthScore) * 10) / 10,
        avgPortfolioRisk:    Math.round(avg(r => r.portfolioRiskScore) * 10) / 10,
        avgMarketRisk:       Math.round(avg(r => r.marketRiskScore) * 10) / 10,
        avgBrokerReliability: Math.round(avg(r => r.brokerReliabilityScore) * 10) / 10,
        avgSystemHealth:     Math.round(avg(r => r.systemHealthScore) * 10) / 10,
        latestRisk:          latest[0] ?? null,
        riskDistribution:    dist,
        recentTrend,
        activeAlerts:        alertRows,
        engineVersion:       RI_ENGINE_VERSION,
        riskVersion:         RI_RISK_VERSION,
        isAdvisoryOnly:      true,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg });
  }
});
