import {
  Router,
  type IRouter,
} from "express";
import {
  and,
  desc,
  eq,
  inArray,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import {
  db,
  conversationsTable,
  discussionRequestsTable,
  listingsTable,
  messagesTable,
  storedImagesTable,
} from "@workspace/db";
import {
  CreateConversationBody,
  CreateConversationResponse,
  CreateMessageBody,
  CreateMessageParams,
  CreateMessageResponse,
  ListConversationsResponse,
  ListMessagesParams,
  ListMessagesResponse,
  MarkMessageReadParams,
  MarkMessageReadResponse,
} from "@workspace/api-zod";
import {
  getAuthenticatedUserName,
  requireAuth,
  requireVipAccess,
  type AuthenticatedRequest,
} from "../middlewares/requireAuth";
import { ObjectStorageService } from "../lib/objectStorage";
import { notifyPushRecipient } from "../lib/firebaseAdmin";
const router: IRouter = Router();
const storage = new ObjectStorageService();
const unsafeMessage =
  /(?:https?:\/\/|www\.|(?:\+?\d[\d\s().-]{7,}\d))/i;
const isStoredImagePath = (value: string) =>
  value.startsWith("/objects/uploads/")
  && !value.includes("..")
  && !value.includes("data:");
router.get(
  "/conversations",
  requireAuth,
  async (req, res): Promise<void> => {
    const userId =
      (req as AuthenticatedRequest).userId;
    const conversations = await db
      .select()
      .from(conversationsTable)
      .where(
        or(
          eq(
            conversationsTable.participantId,
            userId,
          ),
          eq(
            conversationsTable.ownerId,
            userId,
          ),
        ),
      )
      .orderBy(
        desc(conversationsTable.updatedAt),
      );
    res.json(
      ListConversationsResponse.parse(
        conversations,
      ),
    );
  },
);
router.get(
  "/discussion-requests",
  requireAuth,
  async (req, res): Promise<void> => {
    const userId =
      (req as AuthenticatedRequest).userId;
    const requests = await db
      .select({
        id: discussionRequestsTable.id,
        conversationId:
          discussionRequestsTable.conversationId,
        listingId:
          discussionRequestsTable.listingId,
        requesterId:
          discussionRequestsTable.requesterId,
        initialMessage:
          discussionRequestsTable.initialMessage,
        status:
          discussionRequestsTable.status,
        refusalCount:
          discussionRequestsTable.refusalCount,
        createdAt:
          discussionRequestsTable.createdAt,
      })
      .from(discussionRequestsTable)
      .where(
        and(
          eq(
            discussionRequestsTable.recipientId,
            userId,
          ),
          eq(
            discussionRequestsTable.status,
            "PENDING",
          ),
        ),
      )
      .orderBy(
        desc(
          discussionRequestsTable.createdAt,
        ),
      );
    res.json(requests);
  },
);
router.patch(
  "/discussion-requests/:id",
  requireAuth,
  async (req, res): Promise<void> => {
    const userId =
      (req as AuthenticatedRequest).userId;
    const id = Number(req.params.id);
    const action = req.body?.action;
    if (
      !Number.isInteger(id)
      || ![
        "accept",
        "refuse",
        "block",
      ].includes(action)
    ) {
      res.status(400).json({
        error:
          "Décision de demande invalide.",
      });
      return;
    }
    const [request] = await db
      .select()
      .from(discussionRequestsTable)
      .where(
        and(
          eq(
            discussionRequestsTable.id,
            id,
          ),
          eq(
            discussionRequestsTable.recipientId,
            userId,
          ),
          eq(
            discussionRequestsTable.status,
            "PENDING",
          ),
        ),
      );
    if (!request) {
      res.status(404).json({
        error:
          "Demande introuvable ou déjà traitée.",
      });
      return;
    }
    if (action === "accept") {
      const [updated] = await db
        .update(discussionRequestsTable)
        .set({
          status: "ACCEPTED",
          decidedAt: new Date(),
        })
        .where(
          eq(
            discussionRequestsTable.id,
            id,
          ),
        )
        .returning();
      const [message] = await db
        .insert(messagesTable)
        .values({
          conversationId:
            request.conversationId,
          senderId:
            request.requesterId,
          senderName:
            "Utilisateur PAYLOCA",
          body: request.initialMessage,
          status: "Envoyé",
        })
        .returning();
      await db
        .update(conversationsTable)
        .set({
          lastMessage:
            request.initialMessage,
          unread: true,
          updatedAt: new Date(),
        })
        .where(
          eq(
            conversationsTable.id,
            request.conversationId,
          ),
        );
      res.json({
        request: updated,
        message,
        accepted: true,
      });
      return;
    }
    const [{ count: previousRefusals }] =
      await db
        .select({
          count: sql<number>`count(*)`,
        })
        .from(discussionRequestsTable)
        .where(
          and(
            eq(
              discussionRequestsTable.requesterId,
              request.requesterId,
            ),
            eq(
              discussionRequestsTable.recipientId,
              userId,
            ),
            or(
              eq(
                discussionRequestsTable.status,
                "REFUSED",
              ),
              eq(
                discussionRequestsTable.status,
                "BLOCKED",
              ),
            ),
          ),
        );
    const nextCount =
      Number(previousRefusals) + 1;
    const blockedUntil =
      action === "block"
      || nextCount >= 3
        ? new Date(
            Date.now()
            + 7 * 24 * 60 * 60 * 1000,
          )
        : null;
    const [updated] = await db
      .update(discussionRequestsTable)
      .set({
        status:
          action === "block"
            ? "BLOCKED"
            : "REFUSED",
        refusalCount: nextCount,
        blockedUntil,
        decidedAt: new Date(),
      })
      .where(
        eq(
          discussionRequestsTable.id,
          id,
        ),
      )
      .returning();
    res.json({
      request: updated,
      accepted: false,
      blockedUntil,
    });
  },
);
router.post(
  "/conversations",
  requireAuth,
  async (req, res): Promise<void> => {
    if (!requireVipAccess(req, res)) {
      return;
    }
    const parsed =
      CreateConversationBody.safeParse(
        req.body,
      );
    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.message,
      });
      return;
    }
    const [listing] = await db
      .select()
      .from(listingsTable)
      .where(
        and(
          eq(
            listingsTable.id,
            parsed.data.listingId,
          ),
          inArray(listingsTable.status, [
            "libre",
            "actif",
          ]),
        ),
      );
    if (!listing) {
      res.status(404).json({
        error: "Annonce indisponible.",
      });
      return;
    }
    const userId =
      (req as AuthenticatedRequest).userId;
    if (!listing.ownerId) {
      res.status(409).json({
        error:
          "Cette annonce doit être rattachée à un compte sécurisé avant de recevoir des messages.",
      });
      return;
    }
    if (listing.ownerId === userId) {
      res.status(400).json({
        error:
          "Vous ne pouvez pas ouvrir une conversation avec votre propre annonce.",
      });
      return;
    }
    const participantName =
      await getAuthenticatedUserName(
        userId,
        req,
      );
    const [existing] = await db
      .select()
      .from(conversationsTable)
      .where(
        and(
          eq(
            conversationsTable.listingId,
            listing.id,
          ),
          eq(
            conversationsTable.participantId,
            userId,
          ),
        ),
      );
    if (existing) {
      res.status(201).json(
        CreateConversationResponse.parse(
          existing,
        ),
      );
      return;
    }
    const [conversation] = await db
      .insert(conversationsTable)
      .values({
        listingId: listing.id,
        participantName,
        participantId: userId,
        ownerName: listing.ownerName,
        ownerId: listing.ownerId,
      })
      .returning();
    res.status(201).json(
      CreateConversationResponse.parse(
        conversation,
      ),
    );
  },
);
router.get(
  "/conversations/:id/messages",
  requireAuth,
  async (req, res): Promise<void> => {
    const parsed =
      ListMessagesParams.safeParse(
        req.params,
      );
    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.message,
      });
      return;
    }
    const userId =
      (req as AuthenticatedRequest).userId;
    const [conversation] = await db
      .select()
      .from(conversationsTable)
      .where(
        and(
          eq(
            conversationsTable.id,
            parsed.data.id,
          ),
          or(
            eq(
              conversationsTable.participantId,
              userId,
            ),
            eq(
              conversationsTable.ownerId,
              userId,
            ),
          ),
        ),
      );
    if (!conversation) {
      res.status(404).json({
        error: "Conversation introuvable.",
      });
      return;
    }
    const messages = await db
      .select()
      .from(messagesTable)
      .where(
        eq(
          messagesTable.conversationId,
          conversation.id,
        ),
      )
      .orderBy(messagesTable.createdAt);
    res.json(
      ListMessagesResponse.parse(messages),
    );
  },
);
router.post(
  "/conversations/:id/messages",
  requireAuth,
  async (req, res): Promise<void> => {
    if (!requireVipAccess(req, res)) {
      return;
    }
    const params =
      CreateMessageParams.safeParse(
        req.params,
      );
    const body =
      CreateMessageBody.safeParse(
        req.body,
      );
    if (!params.success || !body.success) {
      res.status(400).json({
        error: "Message invalide.",
      });
      return;
    }
    const message = body.data.body.trim();
    if (!message && !body.data.imageUrl) {
      res.status(400).json({
        error: "Votre message est vide.",
      });
      return;
    }
    if (unsafeMessage.test(message)) {
      res.status(400).json({
        error:
          "Pour votre sécurité, restez dans le chat Payloca.",
      });
      return;
    }
    if (
      body.data.imageUrl
      && !isStoredImagePath(
        body.data.imageUrl,
      )
    ) {
      res.status(400).json({
        error:
          "La photo doit être envoyée dans le stockage sécurisé de PAYLOCA.",
      });
      return;
    }
    const userId =
      (req as AuthenticatedRequest).userId;
    const senderName =
      await getAuthenticatedUserName(
        userId,
        req,
      );
    const [conversation] = await db
      .select()
      .from(conversationsTable)
      .where(
        and(
          eq(
            conversationsTable.id,
            params.data.id,
          ),
          or(
            eq(
              conversationsTable.participantId,
              userId,
            ),
            eq(
              conversationsTable.ownerId,
              userId,
            ),
          ),
        ),
      );
    if (!conversation) {
      res.status(404).json({
        error: "Conversation introuvable.",
      });
      return;
    }
    const recipientId =
      conversation.ownerId === userId
        ? conversation.participantId
        : conversation.ownerId;
    if (recipientId) {
      const [{ count }] = await db
        .select({
          count: sql<number>`count(*)`,
        })
        .from(messagesTable)
        .where(
          eq(
            messagesTable.conversationId,
            conversation.id,
          ),
        );
      const [latestRequest] = await db
        .select()
        .from(discussionRequestsTable)
        .where(
          eq(
            discussionRequestsTable.conversationId,
            conversation.id,
          ),
        )
        .orderBy(
          desc(
            discussionRequestsTable.createdAt,
          ),
        )
        .limit(1);
      if (
        Number(count) === 0
        && latestRequest?.status !== "ACCEPTED"
      ) {
        if (
          latestRequest?.blockedUntil
          && latestRequest.blockedUntil
            > new Date()
        ) {
          res.status(403).json({
            error:
              "Cette personne n'accepte pas les nouvelles discussions.",
            code: "DISCUSSION_BLOCKED",
          });
          return;
        }
        if (
          latestRequest?.status === "PENDING"
        ) {
          res.status(409).json({
            error:
              "Demande envoyée. En attente d'acceptation",
            code: "DISCUSSION_PENDING",
          });
          return;
        }
        const [request] = await db
          .insert(discussionRequestsTable)
          .values({
            conversationId:
              conversation.id,
            listingId:
              conversation.listingId,
            requesterId: userId,
            recipientId,
            initialMessage: message,
            status: "PENDING",
          })
          .returning();
        res.status(202).json({
          requestPending: true,
          requestId: request.id,
          message:
            "Demande envoyée. En attente d'acceptation",
        });
        return;
      }
    }
    if (body.data.imageUrl) {
      const [uploadedImage] = await db
        .select()
        .from(storedImagesTable)
        .where(
          and(
            eq(
              storedImagesTable.objectPath,
              body.data.imageUrl,
            ),
            eq(
              storedImagesTable.ownerId,
              userId,
            ),
            isNull(
              storedImagesTable.listingId,
            ),
            isNull(
              storedImagesTable.conversationId,
            ),
            isNull(
              storedImagesTable.sellerProfileOwnerId,
            ),
          ),
        )
        .limit(1);
      if (
        !uploadedImage
        || !await storage.verifyImage(
          body.data.imageUrl,
          uploadedImage,
        )
      ) {
        res.status(403).json({
          error:
            "La photo doit être envoyée et vérifiée avant d’être jointe.",
        });
        return;
      }
    }
    let created;
    try {
      [created] = await db.transaction(
        async (tx) => {
          if (body.data.imageUrl) {
            const [claimedImage] =
              await tx
                .update(storedImagesTable)
                .set({
                  conversationId:
                    conversation.id,
                })
                .where(
                  and(
                    eq(
                      storedImagesTable.objectPath,
                      body.data.imageUrl,
                    ),
                    eq(
                      storedImagesTable.ownerId,
                      userId,
                    ),
                    isNull(
                      storedImagesTable.listingId,
                    ),
                    isNull(
                      storedImagesTable.conversationId,
                    ),
                    isNull(
                      storedImagesTable.sellerProfileOwnerId,
                    ),
                  ),
                )
                .returning({
                  id: storedImagesTable.id,
                });
            if (!claimedImage) {
              throw new Error(
                "Cette image est déjà rattachée.",
              );
            }
          }
          const [newMessage] = await tx
            .insert(messagesTable)
            .values({
              conversationId:
                conversation.id,
              senderName,
              senderId: userId,
              body: message,
              imageUrl:
                body.data.imageUrl ?? null,
              status: "Envoyé",
            })
            .returning();
          await tx
            .update(conversationsTable)
            .set({
              lastMessage:
                message || "Photo envoyée",
              unread: true,
              updatedAt: new Date(),
            })
            .where(
              eq(
                conversationsTable.id,
                conversation.id,
              ),
            );
          return [newMessage];
        },
      );
    } catch {
      res.status(409).json({
        error:
          "Cette photo est déjà utilisée ou ne peut pas être jointe.",
      });
      return;
    }
    if (recipientId) {
      await notifyPushRecipient({
        recipientId,
        senderName,
        body: message,
        conversationId: conversation.id,
        listingId: conversation.listingId,
      }).catch(() => undefined);
    }
    res.status(201).json(
      CreateMessageResponse.parse(created),
    );
  },
);
router.patch(
  "/messages/:id/read",
  requireAuth,
  async (req, res): Promise<void> => {
    const parsed =
      MarkMessageReadParams.safeParse(
        req.params,
      );
    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.message,
      });
      return;
    }
    const userId =
      (req as AuthenticatedRequest).userId;
    const [message] = await db
      .select()
      .from(messagesTable)
      .innerJoin(
        conversationsTable,
        eq(
          messagesTable.conversationId,
          conversationsTable.id,
        ),
      )
      .where(
        and(
          eq(
            messagesTable.id,
            parsed.data.id,
          ),
          or(
            eq(
              conversationsTable.participantId,
              userId,
            ),
            eq(
              conversationsTable.ownerId,
              userId,
            ),
          ),
        ),
      );
    if (!message) {
      res.status(404).json({
        error: "Message introuvable.",
      });
      return;
    }
    const [updated] = await db
      .update(messagesTable)
      .set({
        status: "Vu",
      })
      .where(
        eq(
          messagesTable.id,
          message.messages.id,
        ),
      )
      .returning();
    res.json(
      MarkMessageReadResponse.parse(
        updated,
      ),
    );
  },
);
export default router;
