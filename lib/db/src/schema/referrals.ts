import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const referralProfilesTable = pgTable("payloca_referral_profiles", {
  userId: text("user_id").primaryKey(),
  code: text("code").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const referralClaimsTable = pgTable("payloca_referral_claims", {
  id: serial("id").primaryKey(),
  referrerId: text("referrer_id").notNull(),
  referredId: text("referred_id").notNull(),
  code: text("code").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("referral_claims_referred_unique").on(table.referredId),
  index("referral_claims_referrer_idx").on(table.referrerId),
]);

export const referralRewardsTable = pgTable("payloca_referral_rewards", {
  id: serial("id").primaryKey(),
  claimId: integer("claim_id").notNull(),
  userId: text("user_id").notNull(),
  rewardType: text("reward_type").notNull(),
  weeksAwarded: integer("weeks_awarded").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("referral_rewards_claim_user_type_unique").on(table.claimId, table.userId, table.rewardType),
  index("referral_rewards_user_expiry_idx").on(table.userId, table.expiresAt),
  check("referral_rewards_type_check", sql`${table.rewardType} in ('referrer', 'referred')`),
  check("referral_rewards_weeks_check", sql`${table.weeksAwarded} between 1 and 2`),
]);

export type ReferralProfile = typeof referralProfilesTable.$inferSelect;
export type ReferralClaim = typeof referralClaimsTable.$inferSelect;
export type ReferralReward = typeof referralRewardsTable.$inferSelect;
