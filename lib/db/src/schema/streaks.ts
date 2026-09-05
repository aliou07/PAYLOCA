import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const userStreaksTable = pgTable("payloca_user_streaks", {
  userId: text("user_id").primaryKey(),
  streakCount: integer("streak_count").notNull().default(0),
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
  score: integer("score").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("payloca_user_streaks_score_idx").on(table.score),
  check("payloca_user_streaks_streak_check", sql`${table.streakCount} >= 0`),
  check("payloca_user_streaks_score_check", sql`${table.score} >= 0`),
]);

export type UserStreak = typeof userStreaksTable.$inferSelect;
