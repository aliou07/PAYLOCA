import { Readable } from "node:stream";
import { and, eq, or } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import { db, accountTypesTable, conversationsTable, funVideosTable, listingsTable, messagesTable, sellerProfilesTable, sellerShopsTable, storedImagesTable, storedMediaTable } from "@workspace/db";
import { RequestFunVideoUploadUrlBody, RequestFunVideoUploadUrlResponse, RequestUploadUrlBody, RequestUploadUrlResponse } from "@workspace/api-zod";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage";
import { requireAuth, requireUserAccount, type AuthenticatedRequest } from "../middlewares/requireAuth";
import { verifyFirebaseIdToken } from "../lib/firebaseAdmin";

const router: IRouter = Router();
const storage = new ObjectStorageService();
const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const maxImageSize = 10 * 1024 * 1024;
const allowedVideoTypes = new Set(["video/mp4", "video/webm", "video/quicktime"]);
const maxVideoSize = 80 * 1024 * 1024;

export async function isPublicSellerImage(objectPath: string, sellerProfileOwnerId: string | null): Promise<boolean> {
  if (!sellerProfileOwnerId) return false;
  const [profile] = await db.select({ userId: sellerProfilesTable.userId })
    .from(sellerProfilesTable)
    .where(and(
      eq(sellerProfilesTable.avatarUrl, objectPath),
      eq(sellerProfilesTable.userId, sellerProfileOwnerId),
    ))
    .limit(1);
  if (profile) return true;
  const [shop] = await db.select({ ownerId: sellerShopsTable.ownerId })
    .from(sellerShopsTable)
    .where(and(
      eq(sellerShopsTable.bannerUrl, objectPath),
      eq(sellerShopsTable.ownerId, sellerProfileOwnerId),
    ))
    .limit(1);
  return Boolean(shop);
}

export async function canAccessFunMedia(userId: string): Promise<boolean> {
  const [profile] = await db.select({
    accountType: accountTypesTable.accountType,
  }).from(accountTypesTable).where(eq(accountTypesTable.userId, userId)).limit(1);
  return profile?.accountType === "user";
}

router.post("/storage/uploads/request-url", requireAuth, async (req, res): Promise<void> => {
  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success || !allowedImageTypes.has(parsed.data.contentType) || parsed.data.size > maxImageSize) {
    res.status(400).json({ error: "Image invalide. Utilisez JPG, PNG, WebP ou GIF de 10 Mo maximum." });
    return;
  }
  try {
    const { name, size, contentType } = parsed.data;
    const uploadURL = await storage.getObjectEntityUploadURL();
    const objectPath = storage.normalizeObjectEntityPath(uploadURL);
    await db.insert(storedImagesTable).values({
      objectPath,
      ownerId: (req as AuthenticatedRequest).userId,
      contentType,
      size,
    });
    res.json(RequestUploadUrlResponse.parse({ uploadURL, objectPath, metadata: { name, size, contentType } }));
  } catch (error) {
    req.log.error({ err: error }, "Erreur lors de la génération de l’URL d’envoi de l’image");
    res.status(500).json({ error: "Le stockage des photos est momentanément indisponible." });
  }
});

router.post("/storage/uploads/fun-video/request-url", requireAuth, async (req, res): Promise<void> => {
  if (!requireUserAccount(req as AuthenticatedRequest, res)) return;
  const parsed = RequestFunVideoUploadUrlBody.safeParse(req.body);
  if (!parsed.success || !allowedVideoTypes.has(parsed.data.contentType) || parsed.data.size > maxVideoSize) {
    res.status(400).json({ error: "Vidéo invalide. Utilisez MP4, WebM ou QuickTime de 80 Mo maximum." });
    return;
  }
  try {
    const { name, size, contentType } = parsed.data;
    const uploadURL = await storage.getObjectEntityUploadURL();
    const objectPath = storage.normalizeObjectEntityPath(uploadURL);
    await db.insert(storedMediaTable).values({
      objectPath,
      ownerId: (req as AuthenticatedRequest).userId,
      contentType,
      size,
    });
    res.json(RequestFunVideoUploadUrlResponse.parse({ uploadURL, objectPath, metadata: { name, size, contentType } }));
  } catch (error) {
    req.log.error({ err: error }, "Erreur lors de la génération de l’URL d’envoi de la vidéo");
    res.status(500).json({ error: "Le stockage vidéo est momentanément indisponible." });
  }
});

router.get("/storage/objects/*path", async (req: Request, res: Response): Promise<void> => {
  const rawPath = req.params.path;
  const objectPath = `/objects/${Array.isArray(rawPath) ? rawPath.join("/") : rawPath}`;
  try {
    const [trackedImage] = await db.select().from(storedImagesTable)
      .where(eq(storedImagesTable.objectPath, objectPath)).limit(1);
    const [trackedMedia] = await db.select().from(storedMediaTable)
      .where(eq(storedMediaTable.objectPath, objectPath)).limit(1);
    if (!trackedImage && !trackedMedia) {
      res.status(404).json({ error: "Photo introuvable." });
      return;
    }
    const authorization = req.header("authorization");
    const token = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
    const userId = token ? (await verifyFirebaseIdToken(token))?.uid : null;
    let allowed = false;
    if (trackedMedia?.funVideoId) {
      const [video] = await db.select({ id: funVideosTable.id })
        .from(funVideosTable)
        .where(and(
          eq(funVideosTable.id, trackedMedia.funVideoId),
          eq(funVideosTable.moderationStatus, "published"),
        ))
        .limit(1);
      allowed = Boolean(video);
    } else if (trackedImage?.listingId) {
      const [listing] = await db.select({ id: listingsTable.id }).from(listingsTable)
        .where(eq(listingsTable.id, trackedImage.listingId)).limit(1);
      allowed = Boolean(listing);
    } else if (trackedImage && await isPublicSellerImage(objectPath, trackedImage.sellerProfileOwnerId)) {
      allowed = true;
    } else if (trackedImage?.conversationId && userId) {
      const [conversation] = await db.select({ id: conversationsTable.id }).from(conversationsTable)
        .where(and(
          eq(conversationsTable.id, trackedImage.conversationId),
          or(eq(conversationsTable.participantId, userId), eq(conversationsTable.ownerId, userId)),
        ))
        .limit(1);
      allowed = Boolean(conversation);
    }
    if (!allowed) {
      res.status(userId ? 403 : 401).json({ error: userId ? "Accès refusé." : "Connexion requise." });
      return;
    }
    const file = await storage.getObjectEntityFile(objectPath);
    const response = await storage.downloadObject(file);
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    if (response.body) Readable.fromWeb(response.body as ReadableStream<Uint8Array>).pipe(res);
    else res.end();
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Photo introuvable." });
      return;
    }
    req.log.error({ err: error }, "Erreur lors de la diffusion de l’image privée");
    res.status(500).json({ error: "La photo ne peut pas être affichée." });
  }
});

export default router;
