import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, integer } from "drizzle-orm/pg-core";

export const referralsTable = pgTable("payloca_referrals", {
  id: text("id").primaryKey(),
  referrerId: text("referrer_id").notNull(),
  referredId: text("referred_id").notNull(),
  code: text("code").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  paylocaReferralsReferrerIdx: index("payloca_referrals_referrer_idx").on(table.referrerId),
  paylocaReferralsCodeIdx: index("payloca_referrals_code_idx").on(table.code),
}));

export const referralClaimsTable = pgTable("payloca_referral_claims", {
  id: text("id").primaryKey(),
  claimId: text("claim_id").notNull(),
  userId: text("user_id").notNull(),
  reward: integer("reward"),
  status: text("status").default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  paylocaReferralClaimsUserIdx: index("payloca_referral_claims_user_idx").on(table.userId),
  paylocaReferralClaimsStatusCheck: check("payloca_referral_claims_status_check", sql`${table.status} in ('pending', 'claimed')`),
}));
