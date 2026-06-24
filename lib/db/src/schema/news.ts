import { pgTable, serial, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const newsEventsTable = pgTable("news_events", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  currency: text("currency").notNull(),
  impact: text("impact").notNull().default("high"),
  eventTime: timestamp("event_time", { withTimezone: true }).notNull(),
  forecast: text("forecast").notNull().default(""),
  previous: text("previous").notNull().default(""),
  actual: text("actual").notNull().default(""),
  source: text("source").notNull().default("forexfactory"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertNewsEventSchema = createInsertSchema(newsEventsTable).omit({ id: true, createdAt: true });
export type InsertNewsEvent = z.infer<typeof insertNewsEventSchema>;
export type NewsEventRow = typeof newsEventsTable.$inferSelect;
