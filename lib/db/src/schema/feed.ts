import { sql } from "drizzle-orm";
import { check, index, pgTable, serial, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const feedPostsTable = pgTable("payloca_feed_posts", {
  id: serial("id").primaryKey(),
  clientPostId: uuid("client_post_id").notNull(),
  authorId: text("author_id").notNull(),
  authorName: text("author_name").notNull(),
  community: text("community").notNull(),
  city: text("city").notNull(),
  caption: text("caption").notNull(),
  category: text("category").notNull().default("Tout le Niger"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("feed_posts_author_client_unique").on(table.authorId, table.clientPostId),
  index("feed_posts_created_at_idx").on(table.createdAt),
  index("feed_posts_author_id_idx").on(table.authorId),
  check("feed_posts_caption_length_check", sql`char_length(${table.caption}) between 1 and 700`),
  check("feed_posts_community_length_check", sql`char_length(${table.community}) between 2 and 60`),
  check("feed_posts_city_length_check", sql`char_length(${table.city}) between 2 and 80`),
]);

export const insertFeedPostSchema = createInsertSchema(feedPostsTable).omit({ id: true, createdAt: true });

export type InsertFeedPost = z.infer<typeof insertFeedPostSchema>;
export type FeedPost = typeof feedPostsTable.$inferSelect;
