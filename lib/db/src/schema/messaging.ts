import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, integer } from "drizzle-orm/pg-core";

export const conversationsTable = pgTable("payloca_conversations", {
  id: text("id").primaryKey(),
  listingId: text("listing_id"),
  buyerId: text("buyer_id").notNull(),
  sellerId: text("seller_id").notNull(),
  lastMessage: text("last_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  paylocaConversationsBuyerIdx: index("payloca_conversations_buyer_idx").on(table.buyerId),
  paylocaConversationsSellerIdx: index("payloca_conversations_seller_idx").on(table.sellerId),
}));

export const messagesTable = pgTable("payloca_messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull(),
  senderId: text("sender_id").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  paylocaMessagesConversationIdx: index("payloca_messages_conversation_idx").on(table.conversationId),
}));

export const messageAttachmentsTable = pgTable("payloca_message_attachments", {
  id: text("id").primaryKey(),
  objectPath: text("object_path").notNull(),
  messageId: text("message_id").notNull(),
  type: text("type"),
  size: integer("size"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  paylocaMessageAttachmentsMessageIdx: index("payloca_message_attachments_message_idx").on(table.messageId),
  paylocaMessageAttachmentsTypeCheck: check("payloca_message_attachments_type_check", sql`${table.type} in ('image', 'video', 'file')`),
}));

export const mediaUploadsTable = pgTable("payloca_media_uploads", {
  id: text("id").primaryKey(),
  objectPath: text("object_path").notNull(),
  userId: text("user_id").notNull(),
  type: text("type"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  paylocaMediaUploadsUserIdx: index("payloca_media_uploads_user_idx").on(table.userId),
  paylocaMediaUploadsTypeCheck: check("payloca_media_uploads_type_check", sql`${table.type} in ('image', 'video')`),
}));

export const pushTokensTable = pgTable("payloca_push_tokens", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  token: text("token").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  paylocaPushTokensUserIdx: index("payloca_push_tokens_user_idx").on(table.userId),
}));
