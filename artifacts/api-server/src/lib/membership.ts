import {
  and,
  eq,
  gt,
  lt,
  lte,
  sql,
} from "drizzle-orm";
import crypto from "node:crypto";
import {
  db,
  membershipsTable,
  paymentEventsTable,
  referralRewardsTable,
} from "@workspace/db";
export type MembershipAccess = {
  status:
    | "ESSAI_VIP_GRATUIT"
    | "LECTURE_GRATUITE"
    | "STANDARD"
    | "VIP_BRONZE"
    | "VIP_OR"
    | "BOSS_VIP";
  trialEndsAt: Date;
  isVip: boolean;
  plan: "free" | "vip_bronze" | "vip_or";
  boostsRemaining: number;
  boostLimit: number;
  referralWeeksActive: number;
};
export async function getActiveReferralWeeks(
  userId: string,
  now = new Date(),
): Promise<number> {
  const [result] = await db
    .select({
      weeks: sql<number>`coalesce(sum(${referralRewardsTable.weeksAwarded}), 0)::int`,
    })
    .from(referralRewardsTable)
    .where(
      and(
        eq(referralRewardsTable.userId, userId),
        gt(referralRewardsTable.expiresAt, now),
      ),
    );
  return Number(result?.weeks ?? 0);
}
export function planForMembershipStatus(
  status: MembershipAccess["status"],
): MembershipAccess["plan"] {
  return status === "VIP_OR" ||
    status === "BOSS_VIP"
    ? "vip_or"
    : status === "VIP_BRONZE"
      ? "vip_bronze"
      : "free";
}
export function boostLimitForPlan(
  plan: MembershipAccess["plan"],
): number {
  return plan === "vip_or"
    ? 200
    : plan === "vip_bronze"
      ? 20
      : 0;
}
export function canBoost(user: {
  plan: MembershipAccess["plan"];
  boostsRemaining?: number;
}): boolean {
  return (
    boostLimitForPlan(user.plan) > 0 &&
    (user.boostsRemaining ?? 0) > 0
  );
}
export const paidPlans = {
  VIP_BRONZE: {
    amount: 500,
    durationMonths: 1,
  },
  VIP_OR: {
    amount: 1000,
    durationMonths: 1,
  },
} as const;
/** Safety default: real money is impossible until explicitly configured. */
export const PAYMENT_MODE =
  process.env.PAYMENT_MODE === "REEL"
    ? "REEL"
    : "TEST";
export type PaidPlan = keyof typeof paidPlans;
export type MynitaPaymentPayload = {
  reference: string;
  transactionId: string;
  amount: number;
  currency: "XOF";
  plan: PaidPlan;
  userId: string;
  customer: {
    name: string;
  };
  callbackUrl: string;
  cancelUrl?: string;
};
export function buildMynitaPaymentPayload(
  input: {
    transactionId: string;
    userId: string;
    userName: string;
    plan: PaidPlan;
    callbackUrl: string;
    cancelUrl?: string;
  },
): MynitaPaymentPayload {
  const callback = new URL(input.callbackUrl);
  if (callback.protocol !== "https:") {
    throw new Error(
      "L’URL de retour Mynita doit utiliser HTTPS.",
    );
  }
  if (input.cancelUrl) {
    const cancel = new URL(input.cancelUrl);
    if (cancel.protocol !== "https:") {
      throw new Error(
        "L’URL d’annulation Mynita doit utiliser HTTPS.",
      );
    }
  }
  const amount = paidPlans[input.plan].amount;
  return {
    reference: input.transactionId,
    transactionId: input.transactionId,
    amount,
    currency: "XOF",
    plan: input.plan,
    userId: input.userId,
    customer: {
      name: input.userName,
    },
    callbackUrl: input.callbackUrl,
    ...(input.cancelUrl
      ? {
          cancelUrl: input.cancelUrl,
        }
      : {}),
  };
}
export function getMynitaRedirectUrl(
  body: unknown,
): string | undefined {
  if (!body || typeof body !== "object") {
    return undefined;
  }
  const root = body as Record<
    string,
    unknown
  >;
  const nested =
    root.data &&
    typeof root.data === "object"
      ? (root.data as Record<string, unknown>)
      : undefined;
  return [
    root.redirectUrl,
    root.paymentUrl,
    root.checkoutUrl,
    root.url,
    nested?.redirectUrl,
    nested?.paymentUrl,
    nested?.checkoutUrl,
    nested?.url,
  ].find((value): value is string => {
    if (typeof value !== "string") {
      return false;
    }
    try {
      const parsed = new URL(value);
      return parsed.protocol === "https:";
    } catch {
      return false;
    }
  });
}
export type PendingPayment = {
  transactionId: string;
  userId: string;
  plan: PaidPlan;
  amount: number;
};
export function createPaymentReference() {
  return `PAYLOCA_${crypto.randomUUID()}`;
}
export function isPaidPlan(
  value: unknown,
): value is PaidPlan {
  return (
    typeof value === "string" &&
    value in paidPlans
  );
}
export async function applyVerifiedPayment(
  input: {
    userId: string;
    transactionId: string;
    mynitaTransactionId?: string;
    plan: PaidPlan;
    amount: number;
  },
): Promise<{
  applied: boolean;
  membership: MembershipAccess;
}> {
  const expectedAmount =
    paidPlans[input.plan].amount;
  if (input.amount !== expectedAmount) {
    throw new Error(
      "Montant du forfait invalide.",
    );
  }
  return db.transaction(async (tx) => {
    const [existingEvent] = await tx
      .select()
      .from(paymentEventsTable)
      .where(
        eq(
          paymentEventsTable.transactionId,
          input.transactionId,
        ),
      );
    if (
      existingEvent &&
      (
        existingEvent.userId !== input.userId ||
        existingEvent.plan !== input.plan ||
        existingEvent.amount !== input.amount ||
        (
          existingEvent.status !== "PENDING" &&
          existingEvent.status !== "SUCCEEDED"
        )
      )
    ) {
      throw new Error(
        "Référence de paiement invalide.",
      );
    }
    const [event] = existingEvent
      ? await tx
          .update(paymentEventsTable)
          .set({
            status: "SUCCEEDED",
            ...(input.mynitaTransactionId
              ? {
                  mynitaTransactionId:
                    input.mynitaTransactionId,
                }
              : {}),
          })
          .where(
            eq(
              paymentEventsTable.transactionId,
              input.transactionId,
            ),
          )
          .returning()
      : await tx
          .insert(paymentEventsTable)
          .values({
            transactionId: input.transactionId,
            userId: input.userId,
            plan: input.plan,
            amount: input.amount,
            status: "SUCCEEDED",
          })
          .onConflictDoNothing()
          .returning();
    const [membership] = await tx
      .select()
      .from(membershipsTable)
      .where(
        eq(
          membershipsTable.userId,
          input.userId,
        ),
      );
    if (!membership) {
      throw new Error("Compte introuvable.");
    }
    if (
      event?.status === "SUCCEEDED" &&
      existingEvent?.status !== "SUCCEEDED"
    ) {
      const [updated] = await tx
        .update(membershipsTable)
        .set({
          status: input.plan,
          boostsUsed: 0,
          boostsPeriodStartedAt:
            boostPeriodStart(new Date()),
        })
        .where(
          eq(
            membershipsTable.userId,
            input.userId,
          ),
        )
        .returning();
      if (!updated) {
        throw new Error(
          "Impossible de mettre à jour le statut d’abonnement.",
        );
      }
      return {
        applied: true,
        membership: {
          status:
            updated.status as MembershipAccess["status"],
          trialEndsAt: updated.trialEndsAt,
          isVip:
            updated.status === "VIP_BRONZE" ||
            updated.status === "VIP_OR",
          plan: planForMembershipStatus(
            updated.status as MembershipAccess["status"],
          ),
          boostsRemaining: boostLimitForPlan(
            planForMembershipStatus(
              updated.status as MembershipAccess["status"],
            ),
          ),
          boostLimit: boostLimitForPlan(
            planForMembershipStatus(
              updated.status as MembershipAccess["status"],
            ),
          ),
          referralWeeksActive: 0,
        },
      };
    }
    return {
      applied: false,
      membership: {
        status:
          membership.status as MembershipAccess["status"],
        trialEndsAt: membership.trialEndsAt,
        isVip:
          membership.status === "VIP_BRONZE" ||
          membership.status === "VIP_OR" ||
          membership.status === "BOSS_VIP",
        plan: planForMembershipStatus(
          membership.status as MembershipAccess["status"],
        ),
        boostsRemaining: Math.max(
          0,
          boostLimitForPlan(
            planForMembershipStatus(
              membership.status as MembershipAccess["status"],
            ),
          ) - membership.boostsUsed,
        ),
        boostLimit: boostLimitForPlan(
          planForMembershipStatus(
            membership.status as MembershipAccess["status"],
          ),
        ),
        referralWeeksActive: 0,
      },
    };
  });
}
export async function savePendingPayment(
  payment: PendingPayment,
) {
  const [event] = await db
    .insert(paymentEventsTable)
    .values({
      transactionId: payment.transactionId,
      userId: payment.userId,
      plan: payment.plan,
      amount: payment.amount,
      status: "PENDING",
    })
    .returning();
  return event;
}
export async function applySimulationPayment(
  userId: string,
  plan: PaidPlan = "VIP_OR",
) {
  if (PAYMENT_MODE !== "TEST") {
    throw new Error(
      "Le Mode Test est désactivé.",
    );
  }
  const transactionId = `SIMULATION_${crypto.randomUUID()}`;
  return db.transaction(async (tx) => {
    const [event] = await tx
      .insert(paymentEventsTable)
      .values({
        transactionId,
        userId,
        plan,
        amount: paidPlans[plan].amount,
        status: "SIMULATION",
      })
      .returning();
    const dateFin = new Date();
    dateFin.setMonth(
      dateFin.getMonth() +
        paidPlans[plan].durationMonths,
    );
    const [updated] = await tx
      .update(membershipsTable)
      .set({
        status: plan,
        trialEndsAt: dateFin,
        boostsUsed: 0,
        boostsPeriodStartedAt:
          boostPeriodStart(new Date()),
      })
      .where(
        eq(
          membershipsTable.userId,
          userId,
        ),
      )
      .returning();
    if (!updated) {
      throw new Error("Compte introuvable.");
    }
    return {
      event,
      membership: {
        status: plan,
        trialEndsAt: updated.trialEndsAt,
        isVip: true,
        plan: planForMembershipStatus(plan),
        boostsRemaining: boostLimitForPlan(
          planForMembershipStatus(plan),
        ),
        boostLimit: boostLimitForPlan(
          planForMembershipStatus(plan),
        ),
        referralWeeksActive: 0,
      },
    };
  });
}
export async function getOrCreateMembership(
  userId: string,
): Promise<MembershipAccess> {
  let [membership] = await db
    .select()
    .from(membershipsTable)
    .where(
      eq(membershipsTable.userId, userId),
    );
  if (!membership) {
    const trialEndsAt = new Date();
    trialEndsAt.setMonth(
      trialEndsAt.getMonth() + 3,
    );
    [membership] = await db
      .insert(membershipsTable)
      .values({
        userId,
        trialEndsAt,
        status: "ESSAI_VIP_GRATUIT",
      })
      .onConflictDoNothing()
      .returning();
    if (!membership) {
      [membership] = await db
        .select()
        .from(membershipsTable)
        .where(
          eq(
            membershipsTable.userId,
            userId,
          ),
        );
    }
  }
  if (!membership) {
    throw new Error(
      "Impossible de créer le statut d’abonnement.",
    );
  }
  const now = new Date();
  if (
    membership.status === "ESSAI_VIP_GRATUIT" &&
    now >= membership.trialEndsAt
  ) {
    const [expiredMembership] = await db
      .update(membershipsTable)
      .set({
        status: "LECTURE_GRATUITE",
      })
      .where(
        and(
          eq(
            membershipsTable.userId,
            userId,
          ),
          eq(
            membershipsTable.status,
            "ESSAI_VIP_GRATUIT",
          ),
          lte(
            membershipsTable.trialEndsAt,
            now,
          ),
        ),
      )
      .returning();
    // Une autre requête peut avoir effectué la transition entre la lecture
    // initiale et cet UPDATE. Dans ce cas, ne jamais retourner l'essai obsolète.
    if (expiredMembership) {
      membership = expiredMembership;
    } else {
      [membership] = await db
        .select()
        .from(membershipsTable)
        .where(
          eq(
            membershipsTable.userId,
            userId,
          ),
        );
    }
  }
  const currentPeriodStart =
    boostPeriodStart(now);
  if (
    membership.boostsPeriodStartedAt <
    currentPeriodStart
  ) {
    const [resetMembership] = await db
      .update(membershipsTable)
      .set({
        boostsUsed: 0,
        boostsPeriodStartedAt:
          currentPeriodStart,
      })
      .where(
        and(
          eq(
            membershipsTable.userId,
            userId,
          ),
          lt(
            membershipsTable.boostsPeriodStartedAt,
            currentPeriodStart,
          ),
        ),
      )
      .returning();
    if (resetMembership) {
      membership = resetMembership;
    } else {
      [membership] = await db
        .select()
        .from(membershipsTable)
        .where(
          eq(
            membershipsTable.userId,
            userId,
          ),
        );
    }
  }
  if (!membership) {
    throw new Error(
      "Impossible de relire le statut d’abonnement.",
    );
  }
  const status =
    membership.status as MembershipAccess["status"];
  const plan = planForMembershipStatus(status);
  const boostLimit = boostLimitForPlan(plan);
  const referralWeeksActive =
    await getActiveReferralWeeks(userId, now);
  return {
    status,
    trialEndsAt: membership.trialEndsAt,
    isVip:
      status === "ESSAI_VIP_GRATUIT" ||
      status === "VIP_BRONZE" ||
      status === "VIP_OR" ||
      status === "BOSS_VIP",
    plan,
    boostsRemaining: Math.max(
      0,
      boostLimit - membership.boostsUsed,
    ),
    boostLimit,
    referralWeeksActive,
  };
}
/** Les boosts sont un quota calendaire : ils repartent le premier jour de chaque mois UTC. */
export function boostPeriodStart(
  now = new Date(),
): Date {
  return new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      1,
    ),
  );
}
