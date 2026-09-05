import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const callsTable = pgTable("payloca_calls", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  creatorId: text("creator_id").notNull(),
  creatorName: text("creator_name").notNull(),
  recipientId: text("recipient_id").notNull(),
  recipientName: text("recipient_name").notNull(),
  status: text("status").notNull().default("EN_ATTENTE"),
  invitationLink: text("invitation_link"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  respondedAt: timestamp("responded_at", { withTimezone: true }),
}, (table) => [
  index("payloca_calls_creator_idx").on(table.creatorId),
  index("payloca_calls_recipient_idx").on(table.recipientId),
  index("payloca_calls_status_idx").on(table.status),
]);

export type Call = typeof callsTable.$inferSelect;
