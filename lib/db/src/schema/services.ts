import { boolean, index, integer, pgTable, real, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const serviceProvidersTable = pgTable("payloca_service_providers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  photo: text("photo"),
  city: text("city").notNull(),
  neighborhood: text("neighborhood").notNull(),
  priceFrom: integer("price_from").notNull(),
  rating: real("rating").notNull().default(0),
  reviewCount: integer("review_count").notNull().default(0),
  certified: boolean("certified").notNull().default(false),
  available: boolean("available").notNull().default(false),
  description: text("description").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("service_providers_category_idx").on(table.category),
  index("service_providers_city_idx").on(table.city),
]);

export const serviceOrdersTable = pgTable("payloca_service_orders", {
  id: serial("id").primaryKey(),
  providerId: integer("provider_id").notNull(),
  clientId: text("client_id").notNull(),
  service: text("service").notNull(),
  details: text("details").notNull().default(""),
  status: text("status").notNull().default("en_attente"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("service_orders_client_id_idx").on(table.clientId),
  index("service_orders_provider_id_idx").on(table.providerId),
]);

export const serviceReviewsTable = pgTable("payloca_service_reviews", {
  id: serial("id").primaryKey(),
  providerId: integer("provider_id").notNull(),
  orderId: integer("order_id").notNull(),
  clientId: text("client_id").notNull(),
  clientName: text("client_name").notNull(),
  rating: integer("rating").notNull(),
  comment: text("comment").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("service_reviews_provider_client_unique").on(table.providerId, table.clientId),
  index("service_reviews_order_id_idx").on(table.orderId),
]);

export const insertServiceProviderSchema = createInsertSchema(serviceProvidersTable).omit({ id: true, createdAt: true });
export const insertServiceOrderSchema = createInsertSchema(serviceOrdersTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertServiceReviewSchema = createInsertSchema(serviceReviewsTable).omit({ id: true, createdAt: true });

export type InsertServiceProvider = z.infer<typeof insertServiceProviderSchema>;
export type InsertServiceOrder = z.infer<typeof insertServiceOrderSchema>;
export type InsertServiceReview = z.infer<typeof insertServiceReviewSchema>;
export type ServiceProvider = typeof serviceProvidersTable.$inferSelect;
export type ServiceOrder = typeof serviceOrdersTable.$inferSelect;
export type ServiceReview = typeof serviceReviewsTable.$inferSelect;
