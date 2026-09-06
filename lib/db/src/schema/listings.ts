import { index, pgTable, text, timestamp, integer } from "drizzle-orm/pg-core";

export const listingsTable = pgTable("payloca_listings", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  price: integer("price"),
  category: text("category"),
  location: text("location"),
  userId: text("user_id").notNull(),
  imageUrl: text("image_url"),
  status: text("status").default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  paylocaListingsUserIdx: index("payloca_listings_user_idx").on(table.userId),
  paylocaListingsCategoryIdx: index("payloca_listings_category_idx").on(table.category),
  paylocaListingsLocationIdx: index("payloca_listings_location_idx").on(table.location),
}));
