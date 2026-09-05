import { createInsertSchema } from "drizzle-zod";
import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const giftsTable = pgTable("payloca_gifts", {
  id: text("id").primaryKey(),
  fromUserId: text("from_user_id").notNull(),
  toPhone: text("to_phone").notNull(),
  plan: text("plan").notNull(),
  amount: integer("amount").notNull(),
  durationMonths: integer("duration_months").notNull().default(1),
  status: text("status").notNull().default("PENDING_PAYMENT"),
  code: text("code").notNull().unique(),
  transactionId: text("transaction_id").notNull().unique(),
  mynitaTransactionId: text("mynita_transaction_id"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  redeemedAt: timestamp("redeemed_at", { withTimezone: true }),
  redeemedByUserId: text("redeemed_by_user_id"),
});

export const insertGiftSchema = createInsertSchema(giftsTable).omit({ createdAt: true });
export type InsertGift = z.infer<typeof insertGiftSchema>;
export type Gift = typeof giftsTable.$inferSelect;
