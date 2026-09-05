import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const sellerProfilesTable = pgTable("payloca_seller_profiles", {
  userId: text("user_id").primaryKey(),
  displayName: text("display_name").notNull(),
  bio: text("bio").notNull().default(""),
  city: text("city").notNull().default("Niamey"),
  avatarUrl: text("avatar_url"),
  verificationStatus: text("verification_status").notNull().default("unverified"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("seller_profiles_verification_idx").on(table.verificationStatus),
  check("seller_profiles_verification_check", sql`${table.verificationStatus} in ('unverified', 'pending', 'approved', 'rejected')`),
]);

export const sellerShopsTable = pgTable("payloca_seller_shops", {
  ownerId: text("owner_id").primaryKey().references(() => sellerProfilesTable.userId, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  bannerUrl: text("banner_url"),
  categories: text("categories").array().notNull().default(sql`ARRAY[]::text[]`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const sellerVerificationRequestsTable = pgTable("payloca_seller_verification_requests", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => sellerProfilesTable.userId, { onDelete: "cascade" }),
  details: text("details").notNull(),
  status: text("status").notNull().default("pending"),
  moderationNote: text("moderation_note"),
  reviewerId: text("reviewer_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("seller_verification_status_idx").on(table.status),
  index("seller_verification_user_idx").on(table.userId),
  uniqueIndex("seller_verification_one_pending_idx").on(table.userId).where(sql`${table.status} = 'pending'`),
  check("seller_verification_request_status_check", sql`${table.status} in ('pending', 'approved', 'rejected')`),
]);

export const sellerReportsTable = pgTable("payloca_seller_reports", {
  id: serial("id").primaryKey(),
  reporterId: text("reporter_id").notNull(),
  targetUserId: text("target_user_id").notNull().references(() => sellerProfilesTable.userId, { onDelete: "cascade" }),
  reason: text("reason").notNull(),
  details: text("details").notNull().default(""),
  status: text("status").notNull().default("pending"),
  resolution: text("resolution"),
  reviewerId: text("reviewer_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("seller_reports_reporter_target_unique").on(table.reporterId, table.targetUserId),
  index("seller_reports_status_idx").on(table.status),
  index("seller_reports_target_idx").on(table.targetUserId),
  check("seller_reports_reason_check", sql`${table.reason} in ('fraude', 'fausse_annonce', 'harcelement', 'autre')`),
  check("seller_reports_status_check", sql`${table.status} in ('pending', 'resolved', 'dismissed')`),
]);

export const insertSellerProfileSchema = createInsertSchema(sellerProfilesTable).omit({ createdAt: true, updatedAt: true });
export const insertSellerShopSchema = createInsertSchema(sellerShopsTable).omit({ createdAt: true, updatedAt: true });
export const insertSellerVerificationRequestSchema = createInsertSchema(sellerVerificationRequestsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertSellerReportSchema = createInsertSchema(sellerReportsTable).omit({ id: true, createdAt: true, updatedAt: true });

export type SellerProfile = typeof sellerProfilesTable.$inferSelect;
export type SellerShop = typeof sellerShopsTable.$inferSelect;
export type SellerVerificationRequest = typeof sellerVerificationRequestsTable.$inferSelect;
export type SellerReport = typeof sellerReportsTable.$inferSelect;
export type InsertSellerProfile = z.infer<typeof insertSellerProfileSchema>;
export type InsertSellerShop = z.infer<typeof insertSellerShopSchema>;
