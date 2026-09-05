import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  pool,
  referralClaimsTable,
  referralProfilesTable,
  referralRewardsTable,
} from "@workspace/db";
import { claimReferralCode, getReferralStats } from "../src/lib/referrals.ts";

const users = [
  "referral-test-referrer",
  "referral-test-referred",
  "referral-test-cap",
  ...Array.from({ length: 10 }, (_, index) => `referral-test-cap-referred-${index}`),
  "referral-test-expired",
  "referral-test-expired-referred",
];

before(async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS payloca_referral_profiles (
      user_id text PRIMARY KEY,
      code text NOT NULL UNIQUE,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS payloca_referral_claims (
      id serial PRIMARY KEY,
      referrer_id text NOT NULL,
      referred_id text NOT NULL,
      code text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS referral_claims_referred_unique ON payloca_referral_claims (referred_id);
    CREATE TABLE IF NOT EXISTS payloca_referral_rewards (
      id serial PRIMARY KEY,
      claim_id integer NOT NULL,
      user_id text NOT NULL,
      reward_type text NOT NULL,
      weeks_awarded integer NOT NULL,
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS referral_rewards_claim_user_type_unique
      ON payloca_referral_rewards (claim_id, user_id, reward_type);
  `);
  await db.delete(referralRewardsTable).where(inArray(referralRewardsTable.userId, users));
  await db.delete(referralClaimsTable).where(
    and(
      inArray(referralClaimsTable.referrerId, users),
      inArray(referralClaimsTable.referredId, users),
    ),
  );
  await db.delete(referralProfilesTable).where(inArray(referralProfilesTable.userId, users));
});

after(async () => {
  await db.delete(referralRewardsTable).where(inArray(referralRewardsTable.userId, users));
  await db.delete(referralClaimsTable).where(
    and(
      inArray(referralClaimsTable.referrerId, users),
      inArray(referralClaimsTable.referredId, users),
    ),
  );
  await db.delete(referralProfilesTable).where(inArray(referralProfilesTable.userId, users));
  await pool.end();
});

test("une double réclamation concurrente ne verse qu’une seule fois", async () => {
  const profile = await getReferralStats(users[0], "https://payloca.site");
  const results = await Promise.allSettled([
    claimReferralCode(users[1], profile.code),
    claimReferralCode(users[1], profile.code),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);

  const claims = await db.select().from(referralClaimsTable)
    .where(eq(referralClaimsTable.referredId, users[1]));
  const rewards = await db.select().from(referralRewardsTable)
    .where(inArray(referralRewardsTable.userId, [users[0], users[1]]));
  assert.equal(claims.length, 1);
  assert.equal(rewards.length, 2);
});

test("le plafond de vingt semaines limite la récompense du parrain", async () => {
  const profile = await getReferralStats(users[2], "https://payloca.site");
  const existingClaims = await db.insert(referralClaimsTable).values(
    Array.from({ length: 10 }, (_, index) => ({
      referrerId: users[2],
      referredId: users[index + 3],
      code: profile.code,
    })),
  ).returning();
  await db.insert(referralRewardsTable).values(existingClaims.map((claim) => ({
    claimId: claim.id,
    userId: users[2],
    rewardType: "referrer" as const,
    weeksAwarded: 2,
    expiresAt: new Date(Date.now() + 86_400_000),
  })));
  const stats = await getReferralStats(users[2], "https://payloca.site");
  assert.equal(stats.totalWeeksEarned, 20);
  assert.equal(stats.activeWeeks, 20);
});

test("les semaines expirées restent historiques mais ne donnent plus accès", async () => {
  const profile = await getReferralStats("referral-test-expired", "https://payloca.site");
  const [claim] = await db.insert(referralClaimsTable).values({
    referrerId: "referral-test-expired",
    referredId: "referral-test-expired-referred",
    code: profile.code,
  }).returning();
  await db.insert(referralRewardsTable).values({
    claimId: claim.id,
    userId: "referral-test-expired",
    rewardType: "referrer",
    weeksAwarded: 2,
    expiresAt: new Date(Date.now() - 86_400_000),
  });
  const stats = await getReferralStats("referral-test-expired", "https://payloca.site");
  assert.equal(stats.totalWeeksEarned, 2);
  assert.equal(stats.activeWeeks, 0);
});
