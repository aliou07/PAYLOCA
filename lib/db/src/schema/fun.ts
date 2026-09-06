import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, integer } from "drizzle-orm/pg-core";

export const funVideosTable = pgTable("payloca_fun_videos", {
  id: text("id").primaryKey(),
  clientVideoId: text("client_video_id").notNull(),
  userId: text("user_id").notNull(),
  videoUrl: text("video_url").notNull(),
  description: text("description"),
  likes: integer("likes").default(0),
  views: integer("views").default(0),
  status: text("status").default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  paylocaFunVideosUserIdx: index("payloca_fun_videos_user_idx").on(table.userId),
  paylocaFunVideosStatusCheck: check("payloca_fun_videos_status_check", sql`${table.status} in ('active', 'banned')`),
}));

export const funVideoLikesTable = pgTable("payloca_fun_video_likes", {
  id: text("id").primaryKey(),
  videoId: text("video_id").notNull(),
  userId: text("user_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  paylocaFunVideoLikesUnique: index("payloca_fun_video_likes_unique").on(table.videoId, table.userId),
}));

export const funVideoCommentsTable = pgTable("payloca_fun_video_comments", {
  id: text("id").primaryKey(),
  videoId: text("video_id").notNull(),
  userId: text("user_id").notNull(),
  comment: text("comment").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  paylocaFunVideoCommentsVideoIdx: index("payloca_fun_video_comments_video_idx").on(table.videoId),
  paylocaFunVideoCommentsUserIdx: index("payloca_fun_video_comments_user_idx").on(table.userId),
}));

export const funVideoReportsTable = pgTable("payloca_fun_video_reports", {
  id: text("id").primaryKey(),
  videoId: text("video_id").notNull(),
  reporterId: text("reporter_id").notNull(),
  reason: text("reason").notNull(),
  status: text("status").default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  paylocaFunVideoReportsStatusCheck: check("payloca_fun_video_reports_status_check", sql`${table.status} in ('pending', 'reviewed')`),
  paylocaFunVideoReportsVideoIdx: index("payloca_fun_video_reports_video_idx").on(table.videoId),
}));
