import { pgTable, serial, text, integer, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const listingsTable = pgTable("listings", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  type: text("type").notNull(),
  city: text("city").notNull(),
  neighborhood: text("neighborhood").notNull(),
  price: integer("price").notNull(),
  bedrooms: integer("bedrooms").notNull().default(0),
  imageUrl: text("image_url").notNull(),
  verified: boolean("verified").notNull().default(false),
  description: text("description").notNull(),
  // Nullable for listings created before contact details were introduced.
  contact: text("contact"),
  // Stores the selected/enhancement label without storing a second image.
  filtre: text("filtre"),
  ownerName: text("owner_name").notNull(),
  // Nullable only for rows created before account ownership was introduced.
  // New rows always receive the Clerk id in the API route.
  ownerId: text("owner_id"),
  status: text("status").notNull().default("libre"),
  launchFreeUntil: timestamp("launch_free_until", { withTimezone: true }).notNull().defaultNow(),
  premiumUntil: timestamp("premium_until", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("listings_owner_id_idx").on(table.ownerId),
]);

export const insertListingSchema = createInsertSchema(listingsTable).omit({
  id: true,
});
export type InsertListing = z.infer<typeof insertListingSchema>;
export type Listing = typeof listingsTable.$inferSelect;
