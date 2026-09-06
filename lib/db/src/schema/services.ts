import { index, pgTable, text, timestamp, integer } from "drizzle-orm/pg-core";

export const servicesTable = pgTable("payloca_services", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category"),
  price: integer("price"),
  providerId: text("provider_id").notNull(),
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  paylocaServicesProviderIdx: index("payloca_services_provider_idx").on(table.providerId),
  paylocaServicesCategoryIdx: index("payloca_services_category_idx").on(table.category),
}));

export const serviceBookingsTable = pgTable("payloca_service_bookings", {
  id: text("id").primaryKey(),
  providerId: text("provider_id").notNull(),
  clientId: text("client_id").notNull(),
  serviceId: text("service_id").notNull(),
  status: text("status").default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  paylocaServiceBookingsProviderIdx: index("payloca_service_bookings_provider_idx").on(table.providerId),
  paylocaServiceBookingsClientIdx: index("payloca_service_bookings_client_idx").on(table.clientId),
}));

export const serviceReviewsTable = pgTable("payloca_service_reviews", {
  id: text("id").primaryKey(),
  providerId: text("provider_id").notNull(),
  clientId: text("client_id").notNull(),
  serviceId: text("service_id").notNull(),
  rating: integer("rating").notNull(),
  comment: text("comment"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  paylocaServiceReviewsServiceIdx: index("payloca_service_reviews_service_idx").on(table.serviceId),
}));
