import {
  pgTable,
  serial,
  text,
  numeric,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ─── Trader Decisions ──────────────────────────────────────────────────────
// Every setup the trader evaluated: accepted, rejected, or delayed.
// Completely separate from the execution engine — advisory/learning only.

export const tiDecisionsTable = pgTable(
  "ti_decisions",
  {
    id: serial("id").primaryKey(),

    // Setup identifiers
    pair:             text("pair").notNull(),
    timeframes:       text("timeframes").notNull().default("[]"),        // JSON string array
    session:          text("session"),                                    // 'london'|'new_york'
    regime:           text("regime"),                                     // 'trending'|'ranging'|'volatile'|'low_volatility'
    htfStructure:     text("htf_structure"),                             // 'bullish'|'bearish'|'ranging'
    premiumDiscount:  text("premium_discount"),                          // 'premium'|'discount'|'equilibrium'

    // Component scores at decision time (mirrors engine scores)
    zoneScore:        numeric("zone_score",        { precision: 5, scale: 2 }),
    liquidityScore:   numeric("liquidity_score",   { precision: 5, scale: 2 }),
    amdScore:         numeric("amd_score",         { precision: 5, scale: 2 }),
    confirmScore:     numeric("confirm_score",     { precision: 5, scale: 2 }),
    tqi:              numeric("tqi",               { precision: 5, scale: 2 }),
    expectedRr:       numeric("expected_rr",       { precision: 6, scale: 2 }),
    riskPct:          numeric("risk_pct",          { precision: 5, scale: 2 }),

    // Trader's call
    traderDecision:   text("trader_decision").notNull(),                 // 'accepted'|'rejected'|'delayed'
    traderConfidence: integer("trader_confidence"),                      // 0–100
    traderNotes:      text("trader_notes"),
    contextTags:      text("context_tags").notNull().default("[]"),      // JSON string array

    // Link to the actual trade if decision was 'accepted' and engine also took it
    tradeId:          integer("trade_id"),

    // Outcome — filled in after the setup plays out
    outcome:          text("outcome"),                                   // 'win'|'loss'|'missed'|'pending'

    // What the engine decided at the same time (for comparison)
    engineDecision:   text("engine_decision"),                          // 'accepted'|'rejected'|'no_signal'

    createdAt:        timestamp("created_at",  { withTimezone: true }).notNull().defaultNow(),
    updatedAt:        timestamp("updated_at",  { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    index("ti_decisions_pair_idx").on(t.pair),
    index("ti_decisions_decision_idx").on(t.traderDecision),
    index("ti_decisions_created_idx").on(t.createdAt),
    index("ti_decisions_outcome_idx").on(t.outcome),
  ],
);

export const insertTiDecisionSchema = createInsertSchema(tiDecisionsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTiDecision = z.infer<typeof insertTiDecisionSchema>;
export type TiDecision = typeof tiDecisionsTable.$inferSelect;

// ─── Screenshots ───────────────────────────────────────────────────────────
// Screenshot files/URLs attached to decisions.
// Architecture is ready for vector embeddings (embedding column can be added
// when an AI model is wired up).

export const tiScreenshotsTable = pgTable(
  "ti_screenshots",
  {
    id:         serial("id").primaryKey(),
    decisionId: integer("decision_id").notNull(),
    url:        text("url").notNull(),              // relative path or external URL
    label:      text("label"),                      // 'entry'|'context'|'outcome'|'analysis'
    notes:      text("notes"),
    createdAt:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("ti_screenshots_decision_idx").on(t.decisionId),
  ],
);

export const insertTiScreenshotSchema = createInsertSchema(tiScreenshotsTable).omit({ id: true, createdAt: true });
export type InsertTiScreenshot = z.infer<typeof insertTiScreenshotSchema>;
export type TiScreenshot = typeof tiScreenshotsTable.$inferSelect;
