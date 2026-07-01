// ─── Risk Intelligence — DB Schema ───────────────────────────────────────────
// Advisory only. NEVER modifies production strategy or executes trades.

import { pgTable, serial, text, numeric, integer, boolean, timestamp, jsonb, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

// ─── Risk Intelligence Reports ────────────────────────────────────────────────

export const riReportsTable = pgTable("ri_reports", {
  id:            serial("id").primaryKey(),
  reportId:      uuid("report_id").notNull().unique().defaultRandom(),
  engineVersion: text("engine_version").notNull().default("1.0.0"),
  riskVersion:   text("risk_version").notNull().default("1.0.0"),
  evaluatedAt:   timestamp("evaluated_at").notNull().defaultNow(),
  isAdvisoryOnly: boolean("is_advisory_only").notNull().default(true),

  // Context
  tradeId:    text("trade_id"),
  pair:       text("pair"),
  session:    text("session"),
  regime:     text("regime"),
  strategyVersion: text("strategy_version"),

  // ── Account Risk ───────────────────────────────────────────────────────────
  balance:        numeric("balance"),
  equity:         numeric("equity"),
  freeMargin:     numeric("free_margin"),
  marginLevel:    numeric("margin_level"),
  dailyPnl:       numeric("daily_pnl"),
  weeklyPnl:      numeric("weekly_pnl"),
  monthlyPnl:     numeric("monthly_pnl"),
  openRisk:       numeric("open_risk"),
  closedRisk:     numeric("closed_risk"),
  accountHealthScore: numeric("account_health_score"),
  accountRiskClass:   text("account_risk_class"),
  accountEvidence:    jsonb("account_evidence"),

  // ── Position Risk ──────────────────────────────────────────────────────────
  positionSize:     numeric("position_size"),
  stopLossDistance: numeric("stop_loss_distance"),
  riskPercentage:   numeric("risk_percentage"),
  expectedRR:       numeric("expected_rr"),
  maxLoss:          numeric("max_loss"),
  tradeExposure:    numeric("trade_exposure"),
  positionDuration: integer("position_duration"),
  positionRiskScore: numeric("position_risk_score"),
  positionRiskClass: text("position_risk_class"),
  positionEvidence:  jsonb("position_evidence"),

  // ── Portfolio Risk ─────────────────────────────────────────────────────────
  openTrades:          integer("open_trades"),
  pairExposure:        jsonb("pair_exposure"),
  currencyExposure:    jsonb("currency_exposure"),
  correlationExposure: numeric("correlation_exposure"),
  directionalBias:     numeric("directional_bias"),
  aggregateRisk:       numeric("aggregate_risk"),
  portfolioRiskScore:  numeric("portfolio_risk_score"),
  portfolioRiskClass:  text("portfolio_risk_class"),
  portfolioEvidence:   jsonb("portfolio_evidence"),

  // ── Market Risk ────────────────────────────────────────────────────────────
  volatility:      numeric("volatility"),
  liquidity:       numeric("liquidity"),
  trendStability:  numeric("trend_stability"),
  marketCorrelation: numeric("market_correlation"),
  marketHealth:    numeric("market_health"),
  opportunityScore: numeric("opportunity_score"),
  newsRisk:        numeric("news_risk"),
  marketRiskScore: numeric("market_risk_score"),
  marketRiskClass: text("market_risk_class"),
  marketEvidence:  jsonb("market_evidence"),

  // ── Broker Risk ────────────────────────────────────────────────────────────
  spread:                numeric("spread"),
  slippage:              numeric("slippage"),
  executionTime:         numeric("execution_time"),
  orderRejections:       integer("order_rejections"),
  connectionQuality:     numeric("connection_quality"),
  priceFeedConsistency:  numeric("price_feed_consistency"),
  latency:               numeric("latency"),
  brokerReliabilityScore: numeric("broker_reliability_score"),
  brokerRiskClass:       text("broker_risk_class"),
  brokerEvidence:        jsonb("broker_evidence"),

  // ── System Risk ────────────────────────────────────────────────────────────
  cpuUsage:           numeric("cpu_usage"),
  memoryUsage:        numeric("memory_usage"),
  dbHealth:           numeric("db_health"),
  apiHealth:          numeric("api_health"),
  networkLatency:     numeric("network_latency"),
  dataFeedHealth:     numeric("data_feed_health"),
  backgroundServices: integer("background_services"),
  storageAvailability: numeric("storage_availability"),
  systemHealthScore:  numeric("system_health_score"),
  systemRiskClass:    text("system_risk_class"),
  systemEvidence:     jsonb("system_evidence"),

  // ── Overall ────────────────────────────────────────────────────────────────
  overallRiskScore:    numeric("overall_risk_score").notNull(),
  riskClassification:  text("risk_classification").notNull(),
  confidence:          numeric("confidence").notNull(),
  confidenceInterval:  jsonb("confidence_interval"),
  reliabilityRating:   text("reliability_rating"),
  supportingEvidence:  jsonb("supporting_evidence"),
  fullPayload:         jsonb("full_payload"),
});

export const insertRiReportSchema = createInsertSchema(riReportsTable).omit({ id: true });
export type RiReport = typeof riReportsTable.$inferSelect;

// ─── Risk Timeline ────────────────────────────────────────────────────────────

export const riTimelineTable = pgTable("ri_timeline", {
  id:            serial("id").primaryKey(),
  reportId:      text("report_id").notNull(),
  evaluatedAt:   timestamp("evaluated_at").notNull().defaultNow(),

  pair:    text("pair"),
  session: text("session"),
  regime:  text("regime"),
  tradeId: text("trade_id"),

  overallRiskScore:    numeric("overall_risk_score").notNull(),
  riskClassification:  text("risk_classification").notNull(),
  accountHealthScore:  numeric("account_health_score"),
  positionRiskScore:   numeric("position_risk_score"),
  portfolioRiskScore:  numeric("portfolio_risk_score"),
  marketRiskScore:     numeric("market_risk_score"),
  brokerReliabilityScore: numeric("broker_reliability_score"),
  systemHealthScore:   numeric("system_health_score"),

  strategyVersion: text("strategy_version"),
  riskVersion:     text("risk_version"),
});

export const insertRiTimelineSchema = createInsertSchema(riTimelineTable).omit({ id: true });
export type RiTimeline = typeof riTimelineTable.$inferSelect;

// ─── Risk Alerts ──────────────────────────────────────────────────────────────

export const riAlertsTable = pgTable("ri_alerts", {
  id:       serial("id").primaryKey(),
  alertId:  uuid("alert_id").notNull().unique().defaultRandom(),
  reportId: text("report_id"),

  category:  text("category").notNull(), // account|position|portfolio|market|broker|system
  severity:  text("severity").notNull(), // info|warning|critical
  title:     text("title").notNull(),
  message:   text("message").notNull(),
  evidence:  jsonb("evidence"),
  metrics:   jsonb("metrics"),

  pair:    text("pair"),
  session: text("session"),

  isResolved:  boolean("is_resolved").notNull().default(false),
  resolvedAt:  timestamp("resolved_at"),
  resolvedBy:  text("resolved_by"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertRiAlertSchema = createInsertSchema(riAlertsTable).omit({ id: true });
export type RiAlert = typeof riAlertsTable.$inferSelect;
