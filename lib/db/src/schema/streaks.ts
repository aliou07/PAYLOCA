import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, integer } from "drizzle-orm/pg-core";

export const streaksTable = pgTable("payloca_streaks", {
  userId: text("user_id").primaryKey(),
  streakCount: integer("streak_count").default(0),
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
  score: integer("score").default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  paylocaStreaksScoreIdx: index("payloca_streaks_score_idx").on(table.score),
  paylocaStreaksCountCheck: check("payloca_streaks_count_check", sql`${table.streakCount} >= 0`),
}));
