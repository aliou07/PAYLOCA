import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, integer } from "drizzle-orm/pg-core";

export const sellerProfilesTable = pgTable("payloca_seller_profiles", {
  userId: text("user_id").primaryKey(),
  displayName: text("display_name").notNull(),
  bio: text("bio"),
  avatarUrl: text("avatar_url"),
  verified: text("verified").default("false"),
  rating: integer("rating").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  paylocaSellerProfilesVerifiedCheck: check("payloca_seller_profiles_verified_check", sql`${table.verified} in ('true', 'false')`),
  paylocaSellerProfilesRatingIdx: index("payloca_seller_profiles_rating_idx").on(table.rating),
}));

export const sellerDocumentsTable = pgTable("payloca_seller_documents", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  documentType: text("document_type"),
  documentUrl: text("document_url"),
  status: text("status").default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  paylocaSellerDocumentsUserIdx: index("payloca_seller_documents_user_idx").on(table.userId),
  paylocaSellerDocumentsStatusCheck: check("payloca_seller_documents_status_check", sql`${table.status} in ('pending', 'approved', 'rejected')`),
}));

export const sellerReportsTable = pgTable("payloca_seller_reports", {
  id: text("id").primaryKey(),
  reporterId: text("reporter_id").notNull(),
  sellerId: text("seller_id").notNull(),
  reason: text("reason"),
  status: text("status").default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  paylocaSellerReportsSellerIdx: index("payloca_seller_reports_seller_idx").on(table.sellerId),
  paylocaSellerReportsStatusCheck: check("payloca_seller_reports_status_check", sql`${table.status} in ('open', 'closed')`),
}));
