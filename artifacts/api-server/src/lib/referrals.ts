import crypto from "node:crypto";
import { and, eq, gt, sql } from "drizzle-orm";
import {
  db,
  referralClaimsTable,
  referralProfilesTable,
  referralRewardsTable,
} from "@workspace/db";

export const REFERRAL_MAX_WEEKS = 20;
export const REFERRAL_REWARD_EXPIRY_DAYS = 90;
export const REFERRER_REWARD_WEEKS = 2;
export const REFERRED_REWARD_WEEKS = 1;

export type ReferralStats = {
  code: string;
  shareUrl: string;
  referralCount: number;
  activeWeeks: number;
  totalWeeksEarned: number;
  maxWeeks: number;
  canClaim: boolean;
};

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function newCode(): string {
  return crypto.randomBytes(5).toString("hex").slice(0, 8).toUpperCase();
}

export async function getOrCreateReferralProfile(userId: string) {
  const [existing] = await db.select().from(referralProfilesTable)
    .where(eq(referralProfilesTable.userId, userId)).limit(1);
  if (existing) return existing;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const [created] = await db.insert(referralProfilesTable).values({
      userId,
      code: newCode(),
    }).onConflictDoNothing().returning();
    if (created) return created;
    const [afterConflict] = await db.select().from(referralProfilesTable)
      .where(eq(referralProfilesTable.userId, userId)).limit(1);
    if (afterConflict) return afterConflict;
  }
  throw new Error("Impossible de créer votre code de parrainage.");
}

async function sumWeeks(
  executor: any,
  userId: string,
  now?: Date,
): Promise<number> {
  const conditions = [eq(referralRewardsTable.userId, userId)];
  if (now) conditions.push(gt(referralRewardsTable.expiresAt, now));
  const [result] = await executor.select({
    weeks: sql<number>`coalesce(sum(${referralRewardsTable.weeksAwarded}), 0)::int`,
  }).from(referralRewardsTable).where(and(...conditions));
  return Number(result?.weeks ?? 0);
}

export async function getReferralStats(userId: string, origin = ""): Promise<ReferralStats> {
  const profile = await getOrCreateReferralProfile(userId);
  const [countResult] = await db.select({
    count: sql<number>`count(*)::int`,
  }).from(referralClaimsTable).where(eq(referralClaimsTable.referrerId, userId));
  const totalWeeksEarned = await sumWeeks(db, userId);
  const activeWeeks = await sumWeeks(db, userId, new Date());
  const shareUrl = `${origin.replace(/\/$/, "") || "https://payloca.site"}/parrainage?code=${encodeURIComponent(profile.code)}`;
  return {
    code: profile.code,
    shareUrl,
    referralCount: Number(countResult?.count ?? 0),
    activeWeeks,
    totalWeeksEarned,
    maxWeeks: REFERRAL_MAX_WEEKS,
    canClaim: !(await hasClaimedReferral(userId)),
  };
}

export async function hasClaimedReferral(userId: string, executor: any = db): Promise<boolean> {
  const [claim] = await executor.select({ id: referralClaimsTable.id })
    .from(referralClaimsTable)
    .where(eq(referralClaimsTable.referredId, userId))
    .limit(1);
  return Boolean(claim);
}

export async function claimReferralCode(userId: string, rawCode: string) {
  const code = rawCode.trim().replace(/\s/g, "").toUpperCase();
  if (!/^[A-F0-9]{8}$/.test(code)) {
    throw new Error("Code de parrainage invalide.");
  }

  const claim = await db.transaction(async (tx) => {
    const [existingClaim] = await tx.select().from(referralClaimsTable)
      .where(eq(referralClaimsTable.referredId, userId)).limit(1);
    if (existingClaim) throw new Error("Vous avez déjà utilisé un code de parrainage.");

    const [referrer] = await tx.select().from(referralProfilesTable)
      .where(eq(referralProfilesTable.code, code)).limit(1);
    if (!referrer) throw new Error("Ce code de parrainage n’existe pas.");
    if (referrer.userId === userId) throw new Error("Vous ne pouvez pas utiliser votre propre code.");

    // Serialize claims for the same referrer so concurrent filleuls cannot
    // both observe the same remaining quota.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${referrer.userId}))`);

    const [createdClaim] = await tx.insert(referralClaimsTable).values({
      referrerId: referrer.userId,
      referredId: userId,
      code,
    }).onConflictDoNothing().returning();
    if (!createdClaim) throw new Error("Vous avez déjà utilisé un code de parrainage.");

    const now = new Date();
    const expiresAt = addDays(now, REFERRAL_REWARD_EXPIRY_DAYS);
    const referrerTotal = await sumWeeks(tx, referrer.userId);
    const referredTotal = await sumWeeks(tx, userId);
    const referrerWeeks = Math.min(REFERRER_REWARD_WEEKS, Math.max(0, REFERRAL_MAX_WEEKS - referrerTotal));
    const referredWeeks = Math.min(REFERRED_REWARD_WEEKS, Math.max(0, REFERRAL_MAX_WEEKS - referredTotal));
    const rewards = [];
    if (referrerWeeks > 0) rewards.push({
      claimId: createdClaim.id,
      userId: referrer.userId,
      rewardType: "referrer" as const,
      weeksAwarded: referrerWeeks,
      expiresAt,
    });
    if (referredWeeks > 0) rewards.push({
      claimId: createdClaim.id,
      userId,
      rewardType: "referred" as const,
      weeksAwarded: referredWeeks,
      expiresAt,
    });
    if (rewards.length) await tx.insert(referralRewardsTable).values(rewards);
    return { claim: createdClaim, referrerWeeks, referredWeeks };
  });

  return {
    ...claim,
    stats: await getReferralStats(userId),
  };
}
