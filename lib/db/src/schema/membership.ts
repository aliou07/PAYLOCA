import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const membershipsTable = pgTable("payloca_memberships", {
  userId: text("user_id").primaryKey(),
  registeredAt: timestamp("registered_at", { withTimezone: true }).notNull().defaultNow(),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }).notNull(),
  status: text("status").notNull().default("ESSAI_VIP_GRATUIT"),
  boostsUsed: integer("boosts_used").notNull().default(0),
  boostsPeriodStartedAt: timestamp("boosts_period_started_at", { withTimezone: true }).notNull().defaultNow(),
});

export const paymentEventsTable = pgTable("payloca_payment_events", {
  transactionId: text("transaction_id").primaryKey(),
  mynitaTransactionId: text("mynita_transaction_id"),
  userId: text("user_id").notNull(),
  plan: text("plan").notNull(),
  amount: integer("amount").notNull(),
  durationMonths: integer("duration_months").notNull().default(1),
  status: text("status").notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertMembershipSchema = createInsertSchema(membershipsTable).omit({ registeredAt: true });
export type InsertMembership = z.infer<typeof insertMembershipSchema>;
export type Membership = typeof membershipsTable.$inferSelect;
export type PaymentEvent = typeof paymentEventsTable.$inferSelect;
