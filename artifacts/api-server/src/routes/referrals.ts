import { Router, type IRouter } from "express";
import {
  ClaimReferralBody,
  ClaimReferralResponse,
  GetReferralStatsResponse,
} from "@workspace/api-zod";
import {
  requireAuth,
  type AuthenticatedRequest,
} from "../middlewares/requireAuth";
import {
  claimReferralCode,
  getReferralStats,
} from "../lib/referrals";
const router: IRouter = Router();
router.get(
  "/referrals",
  requireAuth,
  async (req, res): Promise<void> => {
    try {
      const authenticated =
        req as AuthenticatedRequest;
      const origin = `${req.protocol}://${req.get(
        "host",
      )}`;
      res.json(
        GetReferralStatsResponse.parse(
          await getReferralStats(
            authenticated.userId,
            origin,
          ),
        ),
      );
    } catch {
      res.status(503).json({
        error:
          "Impossible de charger votre parrainage pour le moment.",
      });
    }
  },
);
router.post(
  "/referrals/claim",
  requireAuth,
  async (req, res): Promise<void> => {
    const parsed = ClaimReferralBody.safeParse(
      req.body,
    );
    if (!parsed.success) {
      res.status(400).json({
        error:
          "Saisissez un code de parrainage valide.",
      });
      return;
    }
    try {
      const result = await claimReferralCode(
        (req as AuthenticatedRequest).userId,
        parsed.data.code,
      );
      res.status(201).json(
        ClaimReferralResponse.parse({
          ...result.stats,
          referrerWeeks: result.referrerWeeks,
          referredWeeks: result.referredWeeks,
        }),
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Impossible de réclamer ce code.";
      const status =
        message.includes("déjà") ||
        message.includes("propre")
          ? 409
          : 400;
      res.status(status).json({
        error: message,
      });
    }
  },
);
export default router;
