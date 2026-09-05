import { and, count, desc, eq, inArray, isNull } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CreateFunVideoBody,
  CreateFunVideoCommentBody,
  CreateFunVideoCommentParams,
  CreateFunVideoCommentResponse,
  CreateFunVideoResponse,
  ListFunVideoCommentsParams,
  ListFunVideoCommentsResponse,
  ListFunVideosQueryParams,
  ListFunVideosResponse,
  ReportFunVideoBody,
  ReportFunVideoParams,
  ReportFunVideoResponse,
  ToggleFunVideoLikeParams,
  ToggleFunVideoLikeResponse,
} from "@workspace/api-zod";
import {
  db,
  funVideoCommentsTable,
  funVideoLikesTable,
  funVideoReportsTable,
  funVideosTable,
  storedMediaTable,
} from "@workspace/db";
import { containsUnsafeContact } from "../lib/jobSafety";
import { getAuthenticatedUserName, requireAuth, requireUserAccount, type AuthenticatedRequest } from "../middlewares/requireAuth";
import { verifyFirebaseIdToken } from "../lib/firebaseAdmin";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage";

const router: IRouter = Router();
const storage = new ObjectStorageService();

function requireFunYouth(req: Parameters<typeof requireAuth>[0], res: Parameters<typeof requireAuth>[1]): string | null {
  if (!requireUserAccount(req, res)) return null;
  return (req as AuthenticatedRequest).userId;
}

function publicVideo(
  video: typeof funVideosTable.$inferSelect,
  likedByViewer: boolean,
  commentsCount: number,
) {
  return {
    id: video.id,
    clientVideoId: video.clientVideoId,
    authorName: video.authorName,
    community: video.community,
    city: video.city,
    caption: video.caption,
    videoUrl: video.videoUrl,
    contentType: video.contentType,
    durationSeconds: video.durationSeconds,
    createdAt: video.createdAt,
    moderationStatus: "published" as const,
    likedByViewer,
    commentsCount,
  };
}

async function getPublishedVideo(id: number) {
  return (await db.select().from(funVideosTable).where(and(
    eq(funVideosTable.id, id),
    eq(funVideosTable.moderationStatus, "published"),
  )).limit(1))[0];
}

router.get("/fun/videos", async (req, res): Promise<void> => {
  const authorization = req.header("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  const userId = token ? (await verifyFirebaseIdToken(token))?.uid ?? null : null;
  const parsed = ListFunVideosQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const videos = await db.select().from(funVideosTable)
    .where(eq(funVideosTable.moderationStatus, "published"))
    .orderBy(desc(funVideosTable.createdAt))
    .limit(parsed.data.limit);
  const likedIds = userId && videos.length
    ? new Set((await db.select({ videoId: funVideoLikesTable.videoId }).from(funVideoLikesTable).where(and(
      eq(funVideoLikesTable.userId, userId),
      inArray(funVideoLikesTable.videoId, videos.map((video) => video.id)),
    ))).map((row) => row.videoId))
    : new Set<number>();
  const response = await Promise.all(videos.map(async (video) => {
    const [{ value }] = await db.select({ value: count(funVideoCommentsTable.id) })
      .from(funVideoCommentsTable)
      .where(and(eq(funVideoCommentsTable.videoId, video.id), eq(funVideoCommentsTable.status, "published")));
    return publicVideo(video, likedIds.has(video.id), Number(value));
  }));
  res.json(ListFunVideosResponse.parse(response));
});

router.post("/fun/videos", requireAuth, async (req, res): Promise<void> => {
  const userId = requireFunYouth(req, res);
  if (!userId) return;
  const body = CreateFunVideoBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const data = body.data;
  const caption = data.caption.trim();
  const community = data.community.trim();
  const city = data.city.trim();
  if (!Number.isInteger(data.sizeBytes) || !Number.isInteger(data.durationSeconds)
    || [caption, community, city].some(containsUnsafeContact)) {
    res.status(400).json({ error: "La vidéo, la légende, la communauté et la ville doivent respecter les règles de sécurité PAYLOCA." });
    return;
  }
  const existing = (await db.select().from(funVideosTable).where(and(
    eq(funVideosTable.authorId, userId),
    eq(funVideosTable.clientVideoId, data.clientVideoId),
  )).limit(1))[0];
  if (existing) {
    const [{ value }] = await db.select({ value: count(funVideoCommentsTable.id) })
      .from(funVideoCommentsTable)
      .where(and(eq(funVideoCommentsTable.videoId, existing.id), eq(funVideoCommentsTable.status, "published")));
    const liked = Boolean((await db.select({ id: funVideoLikesTable.id }).from(funVideoLikesTable).where(and(
      eq(funVideoLikesTable.videoId, existing.id),
      eq(funVideoLikesTable.userId, userId),
    )).limit(1))[0]);
    res.status(201).json(CreateFunVideoResponse.parse(publicVideo(existing, liked, Number(value))));
    return;
  }
  const [media] = await db.select().from(storedMediaTable).where(and(
    eq(storedMediaTable.objectPath, data.videoUrl),
    eq(storedMediaTable.ownerId, userId),
    isNull(storedMediaTable.funVideoId),
  )).limit(1);
  if (!media || media.contentType !== data.contentType || media.size !== data.sizeBytes) {
    res.status(400).json({ error: "Cette vidéo n’est pas un fichier PAYLOCA FUN envoyé par votre compte." });
    return;
  }
  try {
    const file = await storage.getObjectEntityFile(data.videoUrl);
    const [metadata] = await file.getMetadata();
    const actualType = String(metadata.contentType || "").toLowerCase();
    const actualSize = Number(metadata.size);
    if (actualType !== data.contentType || actualSize !== data.sizeBytes) {
      res.status(400).json({ error: "Les métadonnées de la vidéo ne correspondent pas au fichier envoyé." });
      return;
    }
    const [header] = await file.download({ start: 0, end: 31 });
    const validHeader = (data.contentType === "video/webm" && header.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])))
      || ((data.contentType === "video/mp4" || data.contentType === "video/quicktime")
        && header.subarray(4, 8).toString() === "ftyp");
    if (!validHeader) {
      res.status(400).json({ error: "Le fichier vidéo ne semble pas être un MP4, WebM ou QuickTime valide." });
      return;
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(400).json({ error: "Le fichier vidéo envoyé est introuvable." });
      return;
    }
    throw error;
  }
  const authorName = await getAuthenticatedUserName(userId, req);
  const created = await db.transaction(async (tx) => {
    const [inserted] = await tx.insert(funVideosTable).values({
      clientVideoId: data.clientVideoId,
      authorId: userId,
      authorName,
      community,
      city,
      caption,
      videoUrl: data.videoUrl,
      contentType: data.contentType,
      sizeBytes: data.sizeBytes,
      durationSeconds: data.durationSeconds,
      moderationStatus: "published",
    }).onConflictDoNothing({
      target: [funVideosTable.authorId, funVideosTable.clientVideoId],
    }).returning();
    const video = inserted ?? (await tx.select().from(funVideosTable).where(and(
      eq(funVideosTable.authorId, userId),
      eq(funVideosTable.clientVideoId, data.clientVideoId),
    )).limit(1))[0];
    if (!video) return null;
    await tx.update(storedMediaTable).set({ funVideoId: video.id }).where(and(
      eq(storedMediaTable.objectPath, data.videoUrl),
      eq(storedMediaTable.ownerId, userId),
      isNull(storedMediaTable.funVideoId),
    ));
    return video;
  });
  if (!created) {
    res.status(409).json({ error: "Cette vidéo est déjà en cours de publication." });
    return;
  }
  res.status(201).json(CreateFunVideoResponse.parse(publicVideo(created, false, 0)));
});

router.post("/fun/videos/:id/like", requireAuth, async (req, res): Promise<void> => {
  const userId = requireFunYouth(req, res);
  if (!userId) return;
  const params = ToggleFunVideoLikeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const video = await getPublishedVideo(params.data.id);
  if (!video) {
    res.status(404).json({ error: "Vidéo introuvable." });
    return;
  }
  const [existing] = await db.select({ id: funVideoLikesTable.id }).from(funVideoLikesTable).where(and(
    eq(funVideoLikesTable.videoId, video.id),
    eq(funVideoLikesTable.userId, userId),
  )).limit(1);
  if (existing) {
    await db.delete(funVideoLikesTable).where(eq(funVideoLikesTable.id, existing.id));
    res.json(ToggleFunVideoLikeResponse.parse({ liked: false }));
    return;
  }
  await db.insert(funVideoLikesTable).values({ videoId: video.id, userId }).onConflictDoNothing();
  res.json(ToggleFunVideoLikeResponse.parse({ liked: true }));
});

router.get("/fun/videos/:id/comments", requireAuth, async (req, res): Promise<void> => {
  if (!requireFunYouth(req, res)) return;
  const params = ListFunVideoCommentsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const video = await getPublishedVideo(params.data.id);
  if (!video) {
    res.status(404).json({ error: "Vidéo introuvable." });
    return;
  }
  const comments = await db.select({
    id: funVideoCommentsTable.id,
    authorName: funVideoCommentsTable.authorName,
    body: funVideoCommentsTable.body,
    createdAt: funVideoCommentsTable.createdAt,
  }).from(funVideoCommentsTable).where(and(
    eq(funVideoCommentsTable.videoId, video.id),
    eq(funVideoCommentsTable.status, "published"),
  )).orderBy(desc(funVideoCommentsTable.createdAt)).limit(100);
  res.json(ListFunVideoCommentsResponse.parse(comments));
});

router.post("/fun/videos/:id/comments", requireAuth, async (req, res): Promise<void> => {
  const userId = requireFunYouth(req, res);
  if (!userId) return;
  const params = CreateFunVideoCommentParams.safeParse(req.params);
  const body = CreateFunVideoCommentBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Commentaire invalide." });
    return;
  }
  const video = await getPublishedVideo(params.data.id);
  if (!video) {
    res.status(404).json({ error: "Vidéo introuvable." });
    return;
  }
  const comment = body.data.body.trim();
  if (!comment || containsUnsafeContact(comment)) {
    res.status(400).json({ error: "Les numéros, e-mails et liens ne sont pas autorisés dans les commentaires." });
    return;
  }
  const [created] = await db.insert(funVideoCommentsTable).values({
    videoId: video.id,
    authorId: userId,
    authorName: await getAuthenticatedUserName(userId, req),
    body: comment,
    status: "published",
  }).returning();
  if (!created) {
    res.status(500).json({ error: "Le commentaire n’a pas pu être enregistré." });
    return;
  }
  res.status(201).json(CreateFunVideoCommentResponse.parse(created));
});

router.post("/fun/videos/:id/reports", requireAuth, async (req, res): Promise<void> => {
  const userId = requireFunYouth(req, res);
  if (!userId) return;
  const params = ReportFunVideoParams.safeParse(req.params);
  const body = ReportFunVideoBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Motif de signalement invalide." });
    return;
  }
  const video = await getPublishedVideo(params.data.id);
  if (!video) {
    res.status(404).json({ error: "Vidéo introuvable." });
    return;
  }
  const [created] = await db.insert(funVideoReportsTable).values({
    videoId: video.id,
    reporterId: userId,
    reason: body.data.reason,
  }).onConflictDoNothing({
    target: [funVideoReportsTable.videoId, funVideoReportsTable.reporterId],
  }).returning();
  if (!created) {
    res.status(409).json({ error: "Vous avez déjà signalé cette vidéo." });
    return;
  }
  res.status(201).json(ReportFunVideoResponse.parse(created));
});

export default router;
