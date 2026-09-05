import { pgTable, serial, integer, text, boolean, timestamp, index, check, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";

export const conversationsTable = pgTable("conversations", {
  id: serial("id").primaryKey(),
  listingId: integer("listing_id").notNull(),
  participantName: text("participant_name").notNull(),
  // Nullable only for legacy conversations; new conversations use Clerk ids.
  participantId: text("participant_id"),
  ownerName: text("owner_name").notNull(),
  // Nullable only for legacy conversations; missing identities are never
  // inferred from display names.
  ownerId: text("owner_id"),
  lastMessage: text("last_message").notNull().default("Nouvelle conversation"),
  unread: boolean("unread").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("conversations_participant_id_idx").on(table.participantId),
  index("conversations_owner_id_idx").on(table.ownerId),
]);

export const messagesTable = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull(),
  senderName: text("sender_name").notNull(),
  // Nullable only for legacy messages; new messages use Clerk ids.
  senderId: text("sender_id"),
  body: text("body").notNull().default(""),
  // App Storage object path only (never base64 or raw image bytes).
  imageUrl: text("image_url"),
  status: text("status").notNull().default("Envoyé"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("messages_conversation_id_idx").on(table.conversationId),
]);

export const storedImagesTable = pgTable("stored_images", {
  id: serial("id").primaryKey(),
  objectPath: text("object_path").notNull().unique(),
  ownerId: text("owner_id").notNull(),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull(),
  // An image is permanently bound to one visibility scope when attached.
  listingId: integer("listing_id"),
  conversationId: integer("conversation_id"),
  sellerProfileOwnerId: text("seller_profile_owner_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("stored_images_owner_id_idx").on(table.ownerId),
  index("stored_images_listing_id_idx").on(table.listingId),
  index("stored_images_conversation_id_idx").on(table.conversationId),
  index("stored_images_seller_profile_owner_idx").on(table.sellerProfileOwnerId),
  check(
    "stored_images_single_scope_check",
    sql`num_nonnulls(${table.listingId}, ${table.conversationId}, ${table.sellerProfileOwnerId}) <= 1`,
  ),
  check(
    "stored_images_content_type_check",
    sql`${table.contentType} in ('image/jpeg', 'image/png', 'image/webp', 'image/gif')`,
  ),
  check(
    "stored_images_size_check",
    sql`${table.size} between 1 and 10485760`,
  ),
]);

export const storedMediaTable = pgTable("stored_media", {
  id: serial("id").primaryKey(),
  objectPath: text("object_path").notNull().unique(),
  ownerId: text("owner_id").notNull(),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull(),
  funVideoId: integer("fun_video_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("stored_media_owner_id_idx").on(table.ownerId),
  index("stored_media_fun_video_id_idx").on(table.funVideoId),
  check("stored_media_content_type_check", sql`${table.contentType} in ('video/mp4', 'video/webm', 'video/quicktime')`),
  check("stored_media_size_check", sql`${table.size} between 1 and 83886080`),
]);

export const insertConversationSchema = createInsertSchema(conversationsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertMessageSchema = createInsertSchema(messagesTable).omit({ id: true, createdAt: true });
export const insertStoredImageSchema = createInsertSchema(storedImagesTable).omit({ id: true, createdAt: true });
export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type Conversation = typeof conversationsTable.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messagesTable.$inferSelect;
export type InsertStoredImage = z.infer<typeof insertStoredImageSchema>;
export type StoredImage = typeof storedImagesTable.$inferSelect;
export const insertStoredMediaSchema = createInsertSchema(storedMediaTable).omit({ id: true, createdAt: true });
export type InsertStoredMedia = z.infer<typeof insertStoredMediaSchema>;
export type StoredMedia = typeof storedMediaTable.$inferSelect;

export const photoHashesTable = pgTable("photo_hashes", {
  id: serial("id").primaryKey(),
  hash: text("hash").notNull().unique(),
  listingId: integer("listing_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPhotoHashSchema = createInsertSchema(photoHashesTable).omit({ id: true, createdAt: true });
export type InsertPhotoHash = z.infer<typeof insertPhotoHashSchema>;
export type PhotoHash = typeof photoHashesTable.$inferSelect;

export const pushDevicesTable = pgTable("push_devices", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  token: text("token").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("push_devices_user_id_idx").on(table.userId),
  uniqueIndex("push_devices_token_unique").on(table.token),
]);

export const insertPushDeviceSchema = createInsertSchema(pushDevicesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPushDevice = z.infer<typeof insertPushDeviceSchema>;
export type PushDevice = typeof pushDevicesTable.$inferSelect;
