import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import {
  db,
  giftsTable,
} from "@workspace/db";
import {
  CreateGiftPaymentBody,
  CreateGiftPaymentResponse,
  ListGiftsResponse,
  RedeemGiftBody,
  RedeemGiftResponse,
} from "@workspace/api-zod";
import {
  requireAuth,
  type AuthenticatedRequest,
} from "../middlewares/requireAuth";
import { hasValidPaymentSignature } from "../lib/paymentSecurity";
import {
  automaticallyRedeemGiftIfPossible,
  createGiftPaymentPayload,
  createPendingGift,
  expireGiftIfNeeded,
  giftForResponse,
  isGiftPlan,
  applyVerifiedGiftPayment,
  redeemGift,
} from "../lib/gifts";
import {
  getMynitaRedirectUrl,
  PAYMENT_MODE,
} from "../lib/membership";
import { normalizeNigerPhone } from "../lib/phone";
const router: IRouter = Router();
router.get(
  "/gifts",
  requireAuth,
  async (req, res): Promise<void> => {
    const authenticated =
      req as AuthenticatedRequest;
    const sent = await db
      .select()
      .from(giftsTable)
      .where(
        eq(
          giftsTable.fromUserId,
          authenticated.userId,
        ),
      );
    const received = authenticated.phoneNumber
      ? await db
          .select()
          .from(giftsTable)
          .where(
            eq(
              giftsTable.toPhone,
              authenticated.phoneNumber,
            ),
          )
      : [];
    const result = [
      ...(await Promise.all(
        sent.map(async (gift) =>
          giftForResponse(
            await expireGiftIfNeeded(gift),
            "sent",
          ),
        ),
      )),
      ...(await Promise.all(
        received
          .filter(
            (gift) =>
              gift.fromUserId !==
              authenticated.userId,
          )
          .map(async (gift) =>
            giftForResponse(
              await expireGiftIfNeeded(gift),
              "received",
            ),
          ),
      )),
    ];
    res.json(ListGiftsResponse.parse(result));
  },
);
router.post(
  "/gifts/payment",
  requireAuth,
  async (req, res): Promise<void> => {
    if (PAYMENT_MODE !== "REEL") {
      res.status(503).json({
        error:
          "Le paiement Mynita réel n’est pas configuré.",
      });
      return;
    }
    const parsed =
      CreateGiftPaymentBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.message,
      });
      return;
    }
    const toPhone = normalizeNigerPhone(
      parsed.data.toPhone,
    );
    if (!toPhone) {
      res.status(400).json({
        error:
          "Indiquez un numéro nigérien valide au format +227 suivi de 8 chiffres.",
      });
      return;
    }
    const paymentUrl =
      process.env.MYNITA_PAYMENT_URL;
    const apiKey = process.env.MYNITA_API_KEY;
    const callbackUrl =
      process.env.PAYLOCA_GIFT_PAYMENT_RETURN_URL;
    if (!paymentUrl || !apiKey || !callbackUrl) {
      res.status(503).json({
        error:
          "Le paiement Mynita des cadeaux n’est pas configuré.",
      });
      return;
    }
    const authenticated =
      req as AuthenticatedRequest;
    const gift = await createPendingGift({
      fromUserId: authenticated.userId,
      toPhone,
      plan: parsed.data.plan,
    });
    try {
      const providerResponse = await fetch(
        paymentUrl,
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          signal: AbortSignal.timeout(15_000),
          body: JSON.stringify(
            createGiftPaymentPayload({
              id: gift.id,
              transactionId: gift.transactionId,
              fromUserId: authenticated.userId,
              userName: authenticated.userName,
              toPhone,
              plan: parsed.data.plan,
              callbackUrl,
              cancelUrl:
                process.env.PAYLOCA_PAYMENT_CANCEL_URL,
            }),
          ),
        },
      );
      const providerBody =
        await providerResponse
          .json()
          .catch(() => ({}));
      const redirectUrl =
        getMynitaRedirectUrl(providerBody);
      if (!providerResponse.ok || !redirectUrl) {
        await db
          .delete(giftsTable)
          .where(eq(giftsTable.id, gift.id));
        res.status(502).json({
          error:
            "Mynita n’a pas pu préparer le cadeau. Aucun argent n’a été débité.",
        });
        return;
      }
      res.status(201).json(
        CreateGiftPaymentResponse.parse({
          gift: giftForResponse(gift, "sent"),
          redirectUrl,
        }),
      );
    } catch (error) {
      await db
        .delete(giftsTable)
        .where(eq(giftsTable.id, gift.id))
        .catch(() => undefined);
      req.log.error(
        {
          err: error,
          giftId: gift.id,
        },
        "Mynita gift payment request failed",
      );
      res.status(502).json({
        error:
          "Impossible de joindre Mynita. Aucun cadeau n’a été créé.",
      });
    }
  },
);
router.post(
  "/gifts/payment-return",
  async (req, res): Promise<void> => {
    if (!hasValidPaymentSignature(req)) {
      res.status(401).json({
        error: "Retour de paiement non authentifié.",
      });
      return;
    }
    const body = req.body as Record<
      string,
      unknown
    >;
    const giftId =
      typeof body.giftId === "string"
        ? body.giftId.trim()
        : undefined;
    const transactionId =
      typeof body.transactionId === "string"
        ? body.transactionId.trim()
        : "";
    const mynitaTransactionId =
      typeof body.mynitaTransactionId ===
      "string"
        ? body.mynitaTransactionId.trim()
        : typeof body.paymentId === "string"
          ? body.paymentId.trim()
          : "";
    const plan = body.plan;
    const amount =
      typeof body.amount === "number"
        ? body.amount
        : Number(body.amount);
    const status =
      typeof body.status === "string"
        ? body.status.toUpperCase()
        : "";
    const currency =
      typeof body.currency === "string"
        ? body.currency.toUpperCase()
        : "";
    if (
      !transactionId ||
      !isGiftPlan(plan) ||
      !Number.isInteger(amount) ||
      currency !== "XOF" ||
      status !== "SUCCEEDED"
    ) {
      res.status(400).json({
        error:
          "Retour de paiement cadeau incomplet ou invalide.",
      });
      return;
    }
    try {
      const result =
        await applyVerifiedGiftPayment({
          ...(giftId ? { giftId } : {}),
          transactionId,
          ...(mynitaTransactionId
            ? { mynitaTransactionId }
            : {}),
          plan,
          amount,
        });
      const automatic =
        await automaticallyRedeemGiftIfPossible(
          result.gift,
        );
      res.json({
        ok: true,
        applied: result.applied,
        recipientActivated:
          automatic.activated,
        gift: giftForResponse(
          automatic.gift,
          "sent",
        ),
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Impossible de traiter le paiement cadeau.";
      res
        .status(
          message.includes("Montant du cadeau invalide.")
            ? 400
            : 503,
        )
        .json({ error: message });
    }
  },
);
router.post(
  "/gifts/redeem",
  requireAuth,
  async (req, res): Promise<void> => {
    const parsed = RedeemGiftBody.safeParse(
      req.body,
    );
    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.message,
      });
      return;
    }
    const authenticated =
      req as AuthenticatedRequest;
    if (!authenticated.phoneNumber) {
      res.status(403).json({
        error:
          "Votre numéro Firebase vérifié est nécessaire pour utiliser un cadeau.",
      });
      return;
    }
    try {
      const result = await redeemGift({
        code: parsed.data.code
          .replace(/\s/g, "")
          .toUpperCase(),
        phoneNumber: authenticated.phoneNumber,
        userId: authenticated.userId,
      });
      res.status(200).json(
        RedeemGiftResponse.parse({
          gift: giftForResponse(
            result.gift,
            "received",
          ),
          membership: {
            ...result.membership,
            trialEndsAt:
              result.membership.trialEndsAt.toISOString(),
          },
        }),
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Impossible d’activer ce cadeau.";
      res
        .status(
          message.includes("déjà") ||
          message.includes("expiré")
            ? 409
            : 400,
        )
        .json({ error: message });
    }
  },
);
export default router;
