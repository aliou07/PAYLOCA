import crypto from "node:crypto";
import { and, eq, gt, lte } from "drizzle-orm";
import { db, giftsTable, membershipsTable, type Gift } from "@workspace/db";
import { addMonths, getOrCreateMembership, getPaidPlanOption, paidPlans, planForMembershipStatus, boostPeriodStart, isSubscriptionDuration, type MembershipAccess, type SubscriptionDuration } from "./membership";
import { findFirebaseUserByPhoneNumber } from "./firebaseAdmin";

export const giftPlans = paidPlans;

export type GiftPlan = keyof typeof giftPlans;
export type GiftStatus = "PENDING_PAYMENT" | "PAID" | "REDEEMED" | "EXPIRED" | "CANCELLED";

export function isGiftPlan(value: unknown): value is GiftPlan {
  return typeof value === "string" && value in giftPlans;
}

export function createGiftCode(): string {
  const raw = crypto.randomBytes(6).toString("hex").toUpperCase();
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`;
}

export function giftExpiryFrom(date = new Date()): Date {
  const expiresAt = new Date(date);
  expiresAt.setDate(expiresAt.getDate() + 90);
  return expiresAt;
}

export function giftMonthEndFrom(date: Date): Date {
  return addMonths(date, 1);
}

export function createGiftPaymentPayload(input: {
  id: string;
  transactionId: string;
  fromUserId: string;
  userName: string;
  toPhone: string;
  plan: GiftPlan;
  durationMonths: SubscriptionDuration;
  callbackUrl: string;
  cancelUrl?: string;
}) {
  const callback = new URL(input.callbackUrl);
  if (callback.protocol !== "https:") throw new Error("L’URL de retour Mynita doit utiliser HTTPS.");
  if (input.cancelUrl) {
    const cancel = new URL(input.cancelUrl);
    if (cancel.protocol !== "https:") throw new Error("L’URL d’annulation Mynita doit utiliser HTTPS.");
  }
  return {
    reference: input.transactionId,
    transactionId: input.transactionId,
    giftId: input.id,
    amount: getPaidPlanOption(input.plan, input.durationMonths).amount,
    durationMonths: input.durationMonths,
    currency: "XOF" as const,
    plan: input.plan,
    userId: input.fromUserId,
    toPhone: input.toPhone,
    customer: { name: input.userName },
    callbackUrl: input.callbackUrl,
    ...(input.cancelUrl ? { cancelUrl: input.cancelUrl } : {}),
  };
}

export function giftForResponse(gift: Gift, direction: "sent" | "received") {
  const status: GiftStatus = gift.status === "PAID" && gift.expiresAt <= new Date() ? "EXPIRED" : gift.status as GiftStatus;
  return {
    id: gift.id,
    direction,
    toPhone: gift.toPhone,
    plan: gift.plan as GiftPlan,
    amount: gift.amount,
    durationMonths: gift.durationMonths,
    status,
    code: gift.status === "PENDING_PAYMENT" ? "" : gift.code,
    transactionId: gift.transactionId,
    expiresAt: gift.expiresAt,
    createdAt: gift.createdAt,
    paidAt: gift.paidAt,
    redeemedAt: gift.redeemedAt,
  };
}

export async function createPendingGift(input: {
  fromUserId: string;
  toPhone: string;
  plan: GiftPlan;
  durationMonths: SubscriptionDuration;
}) {
  const id = `GIFT_${crypto.randomUUID()}`;
  const transactionId = `PAYLOCA_GIFT_${crypto.randomUUID()}`;
  const [gift] = await db.insert(giftsTable).values({
    id,
    fromUserId: input.fromUserId,
    toPhone: input.toPhone,
    plan: input.plan,
    amount: getPaidPlanOption(input.plan, input.durationMonths).amount,
    durationMonths: input.durationMonths,
    code: createGiftCode(),
    transactionId,
    expiresAt: giftExpiryFrom(),
  }).returning();
  if (!gift) throw new Error("Impossible de créer le cadeau.");
  return gift;
}

export async function applyVerifiedGiftPayment(input: {
  giftId?: string;
  transactionId: string;
  mynitaTransactionId?: string;
  plan: GiftPlan;
  amount: number;
  durationMonths?: SubscriptionDuration;
}): Promise<{ applied: boolean; gift: Gift }> {
  return db.transaction(async (tx) => {
    const [gift] = await tx.select().from(giftsTable).where(eq(giftsTable.transactionId, input.transactionId)).limit(1);
    if (!gift || (input.giftId && gift.id !== input.giftId)
      || gift.plan !== input.plan
      || gift.amount !== input.amount
      || (input.durationMonths !== undefined && gift.durationMonths !== input.durationMonths)) {
      throw new Error("Référence de cadeau invalide.");
    }
    const durationMonths = input.durationMonths ?? gift.durationMonths;
    if (!isSubscriptionDuration(durationMonths) || input.amount !== getPaidPlanOption(input.plan, durationMonths).amount) {
      throw new Error("Montant du cadeau invalide.");
    }
    if (gift.status === "PAID" || gift.status === "REDEEMED") return { applied: false, gift };
    if (gift.status !== "PENDING_PAYMENT") throw new Error("Le cadeau ne peut plus être payé.");

    const [updated] = await tx.update(giftsTable).set({
      status: "PAID",
      ...(input.mynitaTransactionId ? { mynitaTransactionId: input.mynitaTransactionId } : {}),
      paidAt: new Date(),
    }).where(and(eq(giftsTable.id, gift.id), eq(giftsTable.status, "PENDING_PAYMENT"))).returning();
    if (!updated) {
      const [current] = await tx.select().from(giftsTable).where(eq(giftsTable.id, gift.id));
      if (!current) throw new Error("Cadeau introuvable.");
      return { applied: false, gift: current };
    }
    return { applied: true, gift: updated };
  });
}

export async function automaticallyRedeemGiftIfPossible(gift: Gift): Promise<{
  gift: Gift;
  activated: boolean;
}> {
  if (gift.status !== "PAID") return { gift, activated: false };
  const account = await findFirebaseUserByPhoneNumber(gift.toPhone);
  if (account.kind !== "found") return { gift, activated: false };
  try {
    await getOrCreateMembership(account.userId);
    const result = await redeemGift({
      code: gift.code,
      phoneNumber: gift.toPhone,
      userId: account.userId,
    });
    return { gift: result.gift, activated: true };
  } catch {
    // The payment is already confirmed. If a simultaneous claim won the
    // race, or activation is temporarily unavailable, keep the paid gift
    // claimable instead of making Mynita retry a successful payment.
    return { gift, activated: false };
  }
}

export async function redeemGift(input: {
  code: string;
  phoneNumber: string;
  userId: string;
}): Promise<{ gift: Gift; membership: MembershipAccess }> {
  return db.transaction(async (tx) => {
    const now = new Date();
    const [gift] = await tx.select().from(giftsTable)
      .where(and(eq(giftsTable.code, input.code), eq(giftsTable.toPhone, input.phoneNumber)))
      .limit(1);
    if (!gift) throw new Error("Code cadeau ou numéro bénéficiaire invalide.");
    if (gift.status === "PAID" && gift.expiresAt <= now) {
      await tx.update(giftsTable).set({ status: "EXPIRED" }).where(eq(giftsTable.id, gift.id));
      throw new Error("Ce code cadeau a expiré.");
    }
    if (gift.status !== "PAID") {
      throw new Error(gift.status === "REDEEMED" ? "Ce code cadeau a déjà été utilisé." : "Ce cadeau n’est pas encore disponible.");
    }

    const [membership] = await tx.select().from(membershipsTable).where(eq(membershipsTable.userId, input.userId)).limit(1);
    if (!membership) throw new Error("Compte bénéficiaire introuvable.");
    const status = gift.plan as "VIP_BRONZE" | "VIP_OR";
    const durationMonths = isSubscriptionDuration(gift.durationMonths) ? gift.durationMonths : 1;
    const [updatedMembership] = await tx.update(membershipsTable).set({
      status,
      trialEndsAt: addMonths(membership.trialEndsAt > now ? membership.trialEndsAt : now, durationMonths),
      boostsUsed: 0,
      boostsPeriodStartedAt: boostPeriodStart(now),
    }).where(eq(membershipsTable.userId, input.userId)).returning();
    if (!updatedMembership) throw new Error("Impossible d’activer le forfait cadeau.");
    const [redeemed] = await tx.update(giftsTable).set({
      status: "REDEEMED",
      redeemedAt: now,
      redeemedByUserId: input.userId,
    }).where(and(eq(giftsTable.id, gift.id), eq(giftsTable.status, "PAID"), gt(giftsTable.expiresAt, now))).returning();
    if (!redeemed) throw new Error("Ce code cadeau vient d’être utilisé.");
    const plan = planForMembershipStatus(status);
    const boostLimit = plan === "vip_or" ? 200 : 20;
    return {
      gift: redeemed,
      membership: {
        status,
        trialEndsAt: updatedMembership.trialEndsAt,
        isVip: true,
        plan,
        boostsRemaining: boostLimit,
        boostLimit,
        referralWeeksActive: 0,
      },
    };
  });
}

export async function expireGiftIfNeeded(gift: Gift): Promise<Gift> {
  if (gift.status !== "PAID" || gift.expiresAt > new Date()) return gift;
  const [expired] = await db.update(giftsTable).set({ status: "EXPIRED" })
    .where(and(eq(giftsTable.id, gift.id), eq(giftsTable.status, "PAID"), lte(giftsTable.expiresAt, new Date())))
    .returning();
  return expired ?? gift;
}
