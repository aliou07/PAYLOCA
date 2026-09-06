import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const feedTable = pgTable("payloca_feed", {
  id: text("id").primaryKey(),
  clientPostId: text("client_post_id").notNull(),
  userId: text("user_id").notNull(),
  content: text("content"),
  imageUrl: text("image_url"),
  likes: integer("likes").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  paylocaFeedUserIdx: index("payloca_feed_user_idx").on(table.userId),
  paylocaFeedCreatedIdx: index("payloca_feed_created_idx").on(table.createdAt),
}));
