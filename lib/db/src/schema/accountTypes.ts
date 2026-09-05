import { sql } from "drizzle-orm";
import { check, date, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const accountTypeValues = ["user", "agency", "ong"] as const;
export type AccountType = (typeof accountTypeValues)[number];

export const accountTypesTable = pgTable("payloca_account_types", {
  userId: text("user_id").primaryKey(),
  accountType: text("account_type").notNull(),
  city: text("city"),
  dateOfBirth: date("date_of_birth", { mode: "string" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check("account_types_type_check", sql`${table.accountType} in ('user', 'agency', 'ong')`),
  check("account_types_city_check", sql`${table.city} is null or char_length(${table.city}) between 2 and 80`),
  check("account_types_birth_date_check", sql`${table.dateOfBirth} is null or ${table.dateOfBirth} >= date '1900-01-01'`),
]);

export const insertAccountTypeSchema = createInsertSchema(accountTypesTable).omit({
  createdAt: true,
  updatedAt: true,
});

export type AccountTypeRecord = typeof accountTypesTable.$inferSelect;
export type InsertAccountType = z.infer<typeof insertAccountTypeSchema>;
