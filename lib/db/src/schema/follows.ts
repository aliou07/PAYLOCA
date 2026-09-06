import { sql } from "drizzle-orm";
import { check, index, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const followsTable = pgTable("payloca_follows", {
  id: serial("id").primaryKey(),
  followerId: text("follower_id").notNull(),
  followingId: text("following_id").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  paylocaFollowsPairUnique: uniqueIndex("payloca_follows_pair_unique").on(table.followerId, table.followingId),
  paylocaFollowsFollowerIdx: index("payloca_follows_follower_idx").on(table.followerId),
  paylocaFollowsFollowingIdx: index("payloca_follows_following_idx").on(table.followingId),
  paylocaFollowsNoSelfCheck: check("payloca_follows_no_self_check", sql`${table.followerId} <> ${table.followingId}`),
  paylocaFollowsStatusCheck: check("payloca_follows_status_check", sql`${table.status} in ('pending', 'accepted', 'rejected')`),
}));

export const insertFollowSchema = createInsertSchema(followsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertFollow = z.infer<typeof insertFollowSchema>;
export type Follow = typeof followsTable.$inferSelect;
