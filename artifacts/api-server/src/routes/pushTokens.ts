import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, pushDevicesTable } from "@workspace/db";
import {
  DeletePushTokenBody,
  RegisterPushTokenBody,
} from "@workspace/api-zod";
import {
  requireAuth,
  type AuthenticatedRequest,
} from "../middlewares/requireAuth";
const router: IRouter = Router();
router.post(
  "/push-tokens",
  requireAuth,
  async (req, res): Promise<void> => {
    const parsed = RegisterPushTokenBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Jeton de notification invalide.",
      });
      return;
    }
    const userId = (req as AuthenticatedRequest).userId;
    await db
      .insert(pushDevicesTable)
      .values({
        userId,
        token: parsed.data.token,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: pushDevicesTable.token,
        set: {
          userId,
          updatedAt: new Date(),
        },
      });
    res.status(204).send();
  },
);
router.delete(
  "/push-tokens",
  requireAuth,
  async (req, res): Promise<void> => {
    const userId = (req as AuthenticatedRequest).userId;
    if (!req.body?.token) {
      await db
        .delete(pushDevicesTable)
        .where(eq(pushDevicesTable.userId, userId));
      res.status(204).send();
      return;
    }
    const parsed = DeletePushTokenBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Jeton de notification invalide.",
      });
      return;
    }
    await db
      .delete(pushDevicesTable)
      .where(
        and(
          eq(pushDevicesTable.userId, userId),
          eq(
            pushDevicesTable.token,
            parsed.data.token,
          ),
        ),
      );
    res.status(204).send();
  },
);
export default router;
