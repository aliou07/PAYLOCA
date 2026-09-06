import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, serial, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const funVideosTable = pgTable("payloca_fun_videos", {
  id: serial("id").primaryKey(),
  clientVideoId: uuid("client_video_id").notNull(),
  authorId: text("author_id").notNull(),
  authorName: text("author_name").notNull(),
  community: text("community").notNull(),
  city: text("city").notNull(),
  caption: text("caption").notNull(),
  videoUrl: text("video_url").notNull(),
  contentType: text("content_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  durationSeconds: integer("duration_seconds").notNull(),
  moderationStatus: text("moderation_status").notNull().default("published"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("fun_videos_author_client_unique").on(table.authorId, table.clientVideoId),
  index("fun_videos_created_at_idx").on(table.createdAt),
  index("fun_videos_author_id_idx").on(table.authorId),
  check("fun_videos_caption_length_check", sql`char_length(${table.caption}) between 1 and 500`),
  check("fun_videos_community_length_check", sql`char_length(${table.community}) between 2 and 60`),
  check("fun_videos_city_length_check", sql`char_length(${table.city}) between 2 and 80`),
  check("fun_videos_content_type_check", sql`${table.contentType} in ('video/mp4', 'video/webm', 'video/quicktime')`),
  check("fun_videos_size_check", sql`${table.sizeBytes} between 1 and 83886080`),
  check("fun_videos_duration_check", sql`${table.durationSeconds} between 1 and 60`),
  check("fun_videos_status_check", sql`${table.moderationStatus} in ('pending_review', 'published', 'rejected', 'removed')`),
]);

export const funVideoLikesTable = pgTable("payloca_fun_video_likes", {
  id: serial("id").primaryKey(),
  videoId: integer("video_id").notNull(),
  userId: text("user_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("fun_video_likes_video_user_unique").on(table.videoId, table.userId),
  index("fun_video_likes_video_idx").on(table.videoId),
]);

export const funVideoCommentsTable = pgTable("payloca_fun_video_comments", {
  id: serial("id").primaryKey(),
  videoId: integer("video_id").notNull(),
  authorId: text("author_id").notNull(),
  authorName: text("author_name").notNull(),
  body: text("body").notNull(),
  status: text("status").notNull().default("published"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("fun_video_comments_video_idx").on(table.videoId),
  check("fun_video_comments_body_length_check", sql`char_length(${table.body}) between 1 and 280`),
  check("fun_video_comments_status_check", sql`${table.status} in ('published', 'removed')`),
]);

export const funVideoReportsTable = pgTable("payloca_fun_video_reports", {
  id: serial("id").primaryKey(),
  videoId: integer("video_id").notNull(),
  reporterId: text("reporter_id").notNull(),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("fun_video_reports_video_reporter_unique").on(table.videoId, table.reporterId),
  index("fun_video_reports_status_idx").on(table.status),
  check("fun_video_reports_reason_check", sql`${table.reason} in ('harcelement', 'contenu_inapproprie', 'violence', 'autre')`),
  check("fun_video_reports_status_check", sql`${table.status} in ('pending', 'resolved', 'dismissed')`),
]);

export const insertFunVideoSchema = createInsertSchema(funVideosTable).omit({ id: true, createdAt: true });
export const insertFunVideoCommentSchema = createInsertSchema(funVideoCommentsTable).omit({ id: true, createdAt: true });
export type InsertFunVideo = z.infer<typeof insertFunVideoSchema>;
export type FunVideo = typeof funVideosTable.$inferSelect;
export type FunVideoComment = typeof funVideoCommentsTable.$inferSelect;
