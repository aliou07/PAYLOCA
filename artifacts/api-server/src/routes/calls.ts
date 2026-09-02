import {
  and,
  desc,
  eq,
  gt,
  inArray,
} from "drizzle-orm";
import { Router } from "express";
import { db } from "@workspace/db";
import { callsTable } from "@workspace/db/schema";
import {
  requireAuth,
  type AuthenticatedRequest,
} from "../middlewares/requireAuth";
const router = Router();
const CALL_TIMEOUT_MS = 60_000;
const activeTimers = new Map<number, NodeJS.Timeout>();
async function expireCall(id: number) {
  activeTimers.delete(id);
  await db
    .update(callsTable)
    .set({
      status: "EXPIRÉ",
      invitationLink: null,
    })
    .where(
      and(
        eq(callsTable.id, id),
        eq(callsTable.status, "EN_ATTENTE"),
      ),
    );
}
function scheduleExpiry(id: number) {
  activeTimers.set(
    id,
    setTimeout(() => {
      void expireCall(id);
    }, CALL_TIMEOUT_MS),
  );
}
router.post(
  "/calls",
  requireAuth,
  async (req, res): Promise<void> => {
    const userId = (req as AuthenticatedRequest).userId;
    const { recipientId, recipientName } = req.body ?? {};
    if (
      !recipientId ||
      !recipientName ||
      recipientId === userId
    ) {
      res.status(400).json({
        error: "Destinataire invalide.",
      });
      return;
    }
    const now = new Date();
    const [busy] = await db
      .select({
        id: callsTable.id,
      })
      .from(callsTable)
      .where(
        and(
          inArray(callsTable.status, [
            "EN_ATTENTE",
            "EN_COURS",
          ]),
          gt(callsTable.expiresAt, now),
          inArray(callsTable.recipientId, [
            recipientId,
            userId,
          ]),
        ),
      )
      .limit(1);
    if (busy) {
      res.status(409).json({
        error: "Cette personne est occupée.",
        code: "BUSY",
      });
      return;
    }
    const expiresAt = new Date(
      now.getTime() + CALL_TIMEOUT_MS,
    );
    const [call] = await db
      .insert(callsTable)
      .values({
        creatorId: userId,
        creatorName:
          req.body.creatorName ||
          "Utilisateur PAYLOCA",
        recipientId,
        recipientName,
        status: "EN_ATTENTE",
        invitationLink: `/appels/invitation/${crypto.randomUUID()}`,
        expiresAt,
      })
      .returning();
    scheduleExpiry(call.id);
    res.status(201).json({
      call,
      message: `📹 ${call.creatorName} vous appelle...`,
    });
  },
);
router.get(
  "/calls/incoming",
  requireAuth,
  async (req, res): Promise<void> => {
    const userId = (req as AuthenticatedRequest).userId;
    const now = new Date();
    const incoming = await db
      .select()
      .from(callsTable)
      .where(
        and(
          eq(callsTable.recipientId, userId),
          eq(callsTable.status, "EN_ATTENTE"),
          gt(callsTable.expiresAt, now),
        ),
      )
      .orderBy(desc(callsTable.createdAt));
    res.json(incoming);
  },
);
router.get(
  "/calls/active",
  requireAuth,
  async (req, res): Promise<void> => {
    const userId = (req as AuthenticatedRequest).userId;
    const now = new Date();
    const [call] = await db
      .select()
      .from(callsTable)
      .where(
        and(
          inArray(callsTable.status, [
            "EN_ATTENTE",
            "EN_COURS",
          ]),
          gt(callsTable.expiresAt, now),
          inArray(callsTable.creatorId, [userId]),
        ),
      )
      .orderBy(desc(callsTable.createdAt))
      .limit(1);
    res.json(call ?? null);
  },
);
router.patch(
  "/calls/:id",
  requireAuth,
  async (req, res): Promise<void> => {
    const userId = (req as AuthenticatedRequest).userId;
    const id = Number(req.params.id);
    const action = req.body?.action;
    if (
      !Number.isInteger(id) ||
      ![
        "answer",
        "refuse",
        "cancel",
        "remind",
      ].includes(action)
    ) {
      res.status(400).json({
        error: "Action d’appel invalide.",
      });
      return;
    }
    const [call] = await db
      .select()
      .from(callsTable)
      .where(
        and(
          eq(callsTable.id, id),
          inArray(callsTable.status, [
            "EN_ATTENTE",
            "EN_COURS",
          ]),
        ),
      );
    if (
      !call ||
      (call.creatorId !== userId &&
        call.recipientId !== userId)
    ) {
      res.status(404).json({
        error: "Appel introuvable.",
      });
      return;
    }
    if (call.expiresAt <= new Date()) {
      await expireCall(id);
      res.status(410).json({
        error: "Cette invitation a expiré.",
        status: "EXPIRÉ",
      });
      return;
    }
    if (action === "remind") {
      res.json({
        call,
        message: "Vous pourrez rappeler plus tard.",
      });
      return;
    }
    const status =
      action === "answer"
        ? "EN_COURS"
        : action === "cancel"
          ? "ANNULÉ"
          : "REFUSÉ";
    activeTimers.get(id) &&
      clearTimeout(activeTimers.get(id));
    activeTimers.delete(id);
    const [updated] = await db
      .update(callsTable)
      .set({
        status,
        invitationLink:
          action === "answer"
            ? call.invitationLink
            : null,
        respondedAt: new Date(),
      })
      .where(eq(callsTable.id, id))
      .returning();
    res.json({
      call: updated,
      message:
        status === "EN_COURS"
          ? "Appel accepté."
          : status === "ANNULÉ"
            ? "Appel annulé."
            : "Appel refusé.",
    });
  },
);
export default router;
