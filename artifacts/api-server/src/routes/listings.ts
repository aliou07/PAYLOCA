import { Readable } from "node:stream";
import { and, eq, or } from "drizzle-orm";
import {
  Router,
  type IRouter,
  type Request,
  type Response,
} from "express";
import {
  db,
  accountTypesTable,
  conversationsTable,
  funVideosTable,
  listingsTable,
  messagesTable,
  sellerProfilesTable,
  sellerShopsTable,
  storedImagesTable,
  storedMediaTable,
} from "@workspace/db";
import {
  RequestFunVideoUploadUrlBody,
  RequestFunVideoUploadUrlResponse,
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from "@workspace/api-zod";
import {
  ObjectNotFoundError,
  ObjectStorageService,
} from "../lib/objectStorage";
import {
  requireAuth,
  requireUserAccount,
  type AuthenticatedRequest,
} from "../middlewares/requireAuth";
import { verifyFirebaseIdToken } from "../lib/firebaseAdmin";
const router: IRouter = Router();
const storage = new ObjectStorageService();
const allowedImageTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const maxImageSize = 10 * 1024 * 1024;
const allowedVideoTypes = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);
const maxVideoSize = 80 * 1024 * 1024;
export async function isPublicSellerImage(
  objectPath: string,
  sellerProfileOwnerId: string | null,
): Promise<boolean> {
  if (!sellerProfileOwnerId) {
    return false;
  }
  const [profile] = await db
    .select({
      userId: sellerProfilesTable.userId,
    })
    .from(sellerProfilesTable)
    .where(
      and(
        eq(
          sellerProfilesTable.avatarUrl,
          objectPath,
        ),
        eq(
          sellerProfilesTable.userId,
          sellerProfileOwnerId,
        ),
      ),
    )
    .limit(1);
  if (profile) {
    return true;
  }
  const [shop] = await db
    .select({
      ownerId: sellerShopsTable.ownerId,
    })
    .from(sellerShopsTable)
    .where(
      and(
        eq(
          sellerShopsTable.bannerUrl,
          objectPath,
        ),
        eq(
          sellerShopsTable.ownerId,
          sellerProfileOwnerId,
        ),
      ),
    )
    .limit(1);
  return Boolean(shop);
}
export async function canAccessFunMedia(
  userId: string,
): Promise<boolean> {
  const [profile] = await db
    .select({
      accountType:
        accountTypesTable.accountType,
    })
    .from(accountTypesTable)
    .where(
      eq(
        accountTypesTable.userId,
        userId,
      ),
    )
    .limit(1);
  return profile?.accountType === "user";
}
router.post(
  "/storage/uploads/request-url",
  requireAuth,
  async (req, res): Promise<void> => {
    const parsed =
      RequestUploadUrlBody.safeParse(
        req.body,
      );
    if (
     !parsed.success ||
      !allowedImageTypes.has(
        parsed.data.contentType,
      ) ||
      parsed.data.size > maxImageSize
    ) {
      res.status(400).json({
        error:
          "Image invalide. Utilisez JPG, PNG, WebP ou GIF de 10 Mo maximum.",
      });
      return;
    }
    
    try {
      const {
        name,
        size,
        contentType
      } = parsed.data

      // 1. Générer un nom de fichier unique
      const fileExt = name.split('.').pop()
      const fileName = `${req.user.id}/${crypto.randomUUID()}.${fileExt}`
      const bucket = 'annonces' // crée ce bucket sur Supabase

      // 2. Demander une URL signée à Supabase pour upload direct
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUploadUrl(fileName)

      if (error) {
        throw error
      }

      // 3. Renvoyer l'URL au frontend
      res.json({
        uploadUrl: data.signedUrl,
        path: data.path,
        publicUrl: `${process.env.SUPABASE_URL}/storage/v1/object/public/${bucket}/${fileName}`
      })
      
    } catch (error: any) {
      console.error(error)
      res.status(500).json({ error: "Erreur génération URL upload" })
    }
  }
) 
