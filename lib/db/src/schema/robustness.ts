import { pgTable, serial, text, numeric, integer, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const robustnessResultsTable = pgTable("robustness_results", {
  id: serial("id").primaryKey(),
  runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
  pair: text("pair").notNull().default("ALL"),
  status: text("status").notNull().default("complete"),
  overallScore: numeric("overall_score", { precision: 5, scale: 2 }),
  stabilityScore: numeric("stability_score", { precision: 5, scale: 2 }),
  generalizationScore: numeric("generalization_score", { precision: 5, scale: 2 }),
  riskResilienceScore: numeric("risk_resilience_score", { precision: 5, scale: 2 }),
  executionResilienceScore: numeric("execution_resilience_score", { precision: 5, scale: 2 }),
  dataQualityScore: numeric("data_quality_score", { precision: 5, scale: 2 }),
  parameterSensitivity: jsonb("parameter_sensitivity"),
  marketStressResults: jsonb("market_stress_results"),
  executionStressResults: jsonb("execution_stress_results"),
  riskStressResults: jsonb("risk_stress_results"),
  walkForwardSummary: jsonb("walk_forward_summary"),
  oosSummary: jsonb("oos_summary"),
  confidenceStability: jsonb("confidence_stability"),
  findings: jsonb("findings"),
  recommendations: jsonb("recommendations"),
  reportPath: text("report_path"),
  durationMs: integer("duration_ms"),
});

export const insertRobustnessResultSchema = createInsertSchema(robustnessResultsTable).omit({ id: true, runAt: true });
export type InsertRobustnessResult = z.infer<typeof insertRobustnessResultSchema>;
export type RobustnessResult = typeof robustnessResultsTable.$inferSelect;
