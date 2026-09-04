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

/**
 * POST /storage/uploads/request-url
 * Génère une URL signée pour l'upload direct vers Supabase Storage
 */
router.post(
  "/storage/uploads/request-url",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      // Validation des variables d'environnement REQUISES
      const supabaseUrl = process.env["SUPABASE_URL"];
      const supabaseServiceKey =
        process.env["SUPABASE_SERVICE_ROLE_KEY"];

      if (!supabaseUrl || !supabaseServiceKey) {
        console.error(
          "Variables Supabase manquantes",
        );
        res.status(500).json({
          error:
            "Configuration serveur manquante",
        });
        return;
      }

      // Validation du body
      const parsed = RequestUploadUrlBody.safeParse(
        req.body,
      );

      if (!parsed.success) {
        res.status(400).json({
          error:
            "Données invalides. Requis: contentType, size, name",
        });
        return;
      }

      const { contentType, size, name } =
        parsed.data;

      // Validation du type d'image
      if (
        !allowedImageTypes.has(contentType)
      ) {
        res.status(400).json({
          error:
            "Image invalide. Utilisez JPG, PNG, WebP ou GIF de 10 Mo maximum.",
        });
        return;
      }

      // Validation de la taille
      if (size > maxImageSize) {
        res.status(400).json({
          error: "La photo ne doit pas dépasser 10 Mo.",
        });
        return;
      }

      // Génération du nom de fichier unique avec UUID
      const fileExt =
        name.split(".").pop() || "jpg";
      const fileName = `${req.user!.id}/${crypto.randomUUID()}.${fileExt}`;
      const bucket = "annonces";

      try {
        // Utiliser l'API Supabase REST pour générer l'URL signée
        const signedUrlResponse = await fetch(
          `${supabaseUrl}/storage/v1/object/sign/${bucket}/${fileName}`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${supabaseServiceKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              expiresIn: 3600, // URL valide 1 heure
            }),
          }
        );

        if (!signedUrlResponse.ok) {
          const errorData =
            await signedUrlResponse.json();
          console.error(
            "Erreur Supabase API:",
            errorData,
          );
          res.status(500).json({
            error:
              "Impossible de générer l'URL d'upload",
          });
          return;
        }

        const { signedURL } =
          await signedUrlResponse.json();

        // Renvoyer les URLs au frontend
        res.status(200).json({
          uploadURL: signedURL,
          objectPath: `/objects/${bucket}/${fileName}`,
          publicUrl: `${supabaseUrl}/storage/v1/object/public/${bucket}/${fileName}`,
        });
      } catch (supabaseError) {
        console.error(
          "Erreur API Supabase:",
          supabaseError,
        );
        res.status(500).json({
          error:
            "Erreur lors de la génération de l'URL",
        });
      }
    } catch (error: unknown) {
      console.error(
        "Erreur non gérée dans /storage/uploads/request-url:",
        error,
      );
      res.status(500).json({
        error: "Erreur serveur",
      });
    }
  }
);

export default router;
