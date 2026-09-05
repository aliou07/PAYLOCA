import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const discussionRequestsTable = pgTable("discussion_requests", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  conversationId: integer("conversation_id").notNull(),
  listingId: integer("listing_id").notNull(),
  requesterId: text("requester_id").notNull(),
  recipientId: text("recipient_id").notNull(),
  initialMessage: text("initial_message").notNull(),
  status: text("status").notNull().default("PENDING"),
  refusalCount: integer("refusal_count").notNull().default(0),
  blockedUntil: timestamp("blocked_until", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
});

export type DiscussionRequest = typeof discussionRequestsTable.$inferSelect;
