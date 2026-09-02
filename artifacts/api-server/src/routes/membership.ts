import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import {
  requireAuth,
  type AuthenticatedRequest,
} from "../middlewares/requireAuth";
import {
  applySimulationPayment,
  applyVerifiedPayment,
  buildMynitaPaymentPayload,
  createPaymentReference,
  getMynitaRedirectUrl,
  getOrCreateMembership,
  isPaidPlan,
  paidPlans,
  PAYMENT_MODE,
  savePendingPayment,
} from "../lib/membership";
import { db, paymentEventsTable } from "@workspace/db";
import { hasValidPaymentSignature } from "../lib/paymentSecurity";
const router: IRouter = Router();
router.get(
  "/membership",
  requireAuth,
  async (req, res): Promise<void> => {
    try {
      const membership = await getOrCreateMembership(
        (req as AuthenticatedRequest).userId,
      );
      res.json({
        ...membership,
        trialEndsAt: membership.trialEndsAt.toISOString(),
      });
    } catch {
      res.status(503).json({
        error:
          "Le statut d’abonnement est momentanément indisponible.",
      });
    }
  },
);
router.post(
  "/membership/simulation",
  requireAuth,
  async (req, res): Promise<void> => {
    if (PAYMENT_MODE !== "TEST") {
      res.status(503).json({
        error:
          "Le Mode Mynita Réel n’est pas encore configuré.",
      });
      return;
    }
    const plan = req.body?.plan;
    if (plan !== "VIP_BRONZE" && plan !== "VIP_OR") {
      res.status(400).json({
        error: "Forfait de simulation invalide.",
      });
      return;
    }
    try {
      const result = await applySimulationPayment(
        (req as AuthenticatedRequest).userId,
        plan,
      );
      res.status(201).json({
        mode: "TEST",
        message: "✅ Paiement Simulation Réussi! Merci",
        transactionId: result.event.transactionId,
        membership: {
          ...result.membership,
          trialEndsAt:
            result.membership.trialEndsAt.toISOString(),
        },
      });
    } catch {
      res.status(503).json({
        error:
          "❌ Paiement échoué. Aucun argent n'a été débité.",
      });
    }
  },
);
router.post(
  "/membership/payment",
  requireAuth,
  async (req, res): Promise<void> => {
    if (process.env.PAYMENT_MODE !== "REEL") {
      res.status(503).json({
        error: "Le paiement Mynita réel n’est pas configuré.",
      });
      return;
    }
    const plan = req.body?.plan;
    if (!isPaidPlan(plan)) {
      res.status(400).json({
        error: "Forfait de paiement invalide.",
      });
      return;
    }
    const paymentUrl = process.env.MYNITA_PAYMENT_URL;
    const apiKey = process.env.MYNITA_API_KEY;
    const returnUrl =
      process.env.PAYLOCA_PAYMENT_RETURN_URL;
    if (!paymentUrl || !apiKey || !returnUrl) {
      res.status(503).json({
        error: "Le paiement Mynita réel n’est pas configuré.",
      });
      return;
    }
    const authenticated = req as AuthenticatedRequest;
    const transactionId = createPaymentReference();
    try {
      await savePendingPayment({
        transactionId,
        userId: authenticated.userId,
        plan,
        amount: paidPlans[plan].amount,
      });
      const providerResponse = await fetch(paymentUrl, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        signal: AbortSignal.timeout(15_000),
        body: JSON.stringify(
          buildMynitaPaymentPayload({
            transactionId,
            userId: authenticated.userId,
            userName: authenticated.userName,
            plan,
            callbackUrl: returnUrl,
            cancelUrl:
              process.env.PAYLOCA_PAYMENT_CANCEL_URL,
          }),
        ),
      });
      const providerBody =
        (await providerResponse
          .json()
          .catch(() => ({}))) as Record<
          string,
          unknown
        >;
      const redirectUrl =
        getMynitaRedirectUrl(providerBody);
      if (!providerResponse.ok || !redirectUrl) {
        await db
          .delete(paymentEventsTable)
          .where(
            eq(
              paymentEventsTable.transactionId,
              transactionId,
            ),
          );
        req.log.warn(
          {
            statusCode: providerResponse.status,
            transactionId,
          },
          "Mynita payment request rejected",
        );
        res.status(502).json({
          error:
            "Mynita n’a pas pu préparer le paiement. Aucun droit n’a été modifié.",
        });
        return;
      }
      res.status(201).json({
        transactionId,
        plan,
        amount: paidPlans[plan].amount,
        redirectUrl,
      });
    } catch (error) {
      await db
        .delete(paymentEventsTable)
        .where(
          eq(
            paymentEventsTable.transactionId,
            transactionId,
          ),
        )
        .catch(() => undefined);
      req.log.error(
        {
          err: error,
          transactionId,
        },
        "Mynita payment request failed",
      );
      res.status(502).json({
        error:
          "Impossible de joindre Mynita. Aucun droit n’a été modifié.",
      });
    }
  },
);
/**
 * Mynita calls this route after a successful payment. It is deliberately not
 * authenticated with the Firebase token: the provider has no user session.
 * The HMAC is the authority; fields sent by the browser alone are rejected.
 */
router.post(
  "/membership/payment-return",
  async (req, res): Promise<void> => {
    if (!hasValidPaymentSignature(req)) {
      res.status(401).json({
        error: "Retour de paiement non authentifié.",
      });
      return;
    }
    const body = req.body as Record<string, unknown>;
    const userId =
      typeof body.userId === "string"
        ? body.userId.trim()
        : "";
    const transactionId =
      typeof body.transactionId === "string"
        ? body.transactionId.trim()
        : "";
    const mynitaTransactionId =
      typeof body.mynitaTransactionId === "string"
        ? body.mynitaTransactionId.trim()
        : typeof body.paymentId === "string"
          ? body.paymentId.trim()
          : "";
    const plan = body.plan;
    const amount =
      typeof body.amount === "number"
        ? body.amount
        : Number(body.amount);
    const paymentStatus =
      typeof body.status === "string"
        ? body.status.toUpperCase()
        : "";
    const currency =
      typeof body.currency === "string"
        ? body.currency.toUpperCase()
        : "";
    if (
      !userId ||
      !transactionId ||
      !isPaidPlan(plan) ||
      !Number.isInteger(amount) ||
      currency !== "XOF" ||
      paymentStatus !== "SUCCEEDED"
    ) {
      res.status(400).json({
        error:
          "Retour de paiement incomplet ou invalide.",
      });
      return;
    }
    try {
      const result = await applyVerifiedPayment({
        userId,
        transactionId,
        ...(mynitaTransactionId
          ? { mynitaTransactionId }
          : {}),
        plan,
        amount,
      });
      res.status(200).json({
        ok: true,
        applied: result.applied,
        membership: {
          ...result.membership,
          trialEndsAt:
            result.membership.trialEndsAt.toISOString(),
        },
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Impossible de traiter le paiement.";
      res
        .status(
          message === "Montant du forfait invalide."
            ? 400
            : 503,
        )
        .json({ error: message });
    }
  },
);
export default router;
