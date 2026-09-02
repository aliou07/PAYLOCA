import { and, desc, eq, isNull, or } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  db,
  listingsTable,
  sellerProfilesTable,
  sellerReportsTable,
  sellerShopsTable,
  sellerVerificationRequestsTable,
  storedImagesTable,
} from "@workspace/db";
import {
  CreateSellerReportBody,
  CreateSellerReportResponse,
  CreateSellerVerificationRequestBody,
  CreateSellerVerificationRequestResponse,
  GetMySellerProfileResponse,
  GetMySellerVerificationRequestResponse,
  GetSellerProfileParams,
  GetSellerProfileResponse,
  ListSellerReportsQueryParams,
  ListSellerReportsResponse,
  ListSellerVerificationRequestsQueryParams,
  ListSellerVerificationRequestsResponse,
  ModerateSellerReportBody,
  ModerateSellerReportParams,
  ModerateSellerReportResponse,
  ModerateSellerVerificationRequestBody,
  ModerateSellerVerificationRequestParams,
  ModerateSellerVerificationRequestResponse,
  UpdateMySellerProfileBody,
  UpdateMySellerProfileResponse,
} from "@workspace/api-zod";
import { containsUnsafeContact } from "../lib/jobSafety";
import { getDatabaseErrorCode } from "../lib/databaseError";
import {
  getAuthenticatedUserName,
  requireAccountType,
  requireAuth,
  requireModerator,
  type AuthenticatedRequest,
} from "../middlewares/requireAuth";
import { ObjectStorageService } from "../lib/objectStorage";
const router: IRouter = Router();
const storage = new ObjectStorageService();
function validStoragePath(
  value?: string,
): string | null {
  if (!value) return null;
  return value.startsWith("/objects/")
    ? value
    : "";
}
async function getPublicSellerProfile(
  userId: string,
) {
  const [profile] = await db
    .select()
    .from(sellerProfilesTable)
    .where(eq(sellerProfilesTable.userId, userId))
    .limit(1);
  if (!profile) return null;
  const [shop] = await db
    .select()
    .from(sellerShopsTable)
    .where(eq(sellerShopsTable.ownerId, userId))
    .limit(1);
  const listings = await db
    .select()
    .from(listingsTable)
    .where(
      and(
        eq(listingsTable.ownerId, userId),
        eq(listingsTable.status, "libre"),
      ),
    )
    .orderBy(desc(listingsTable.createdAt));
  return {
    profile,
    shop: shop
      ? {
          name: shop.name,
          description: shop.description,
          bannerUrl: shop.bannerUrl,
          categories: shop.categories,
        }
      : {
          name: profile.displayName,
          description: "",
          bannerUrl: null,
          categories: [],
        },
    listings,
  };
}
async function isOwnedImage(
  userId: string,
  objectPath: string | null,
): Promise<boolean> {
  if (!objectPath) return true;
  const [image] = await db
    .select()
    .from(storedImagesTable)
    .where(
      and(
        eq(storedImagesTable.objectPath, objectPath),
        eq(storedImagesTable.ownerId, userId),
        isNull(storedImagesTable.listingId),
        isNull(storedImagesTable.conversationId),
        or(
          isNull(
            storedImagesTable.sellerProfileOwnerId,
          ),
          eq(
            storedImagesTable.sellerProfileOwnerId,
            userId,
          ),
        ),
      ),
    )
    .limit(1);
  return Boolean(
    image &&
      (await storage.verifyImage(objectPath, image)),
  );
}
async function ensureSellerProfile(
  req: AuthenticatedRequest,
) {
  const userId = req.userId;
  const displayName =
    await getAuthenticatedUserName(userId, req);
  await db
    .insert(sellerProfilesTable)
    .values({
      userId,
      displayName,
      bio: "",
      city: "Niamey",
      verificationStatus: "unverified",
    })
    .onConflictDoNothing();
  await db
    .insert(sellerShopsTable)
    .values({
      ownerId: userId,
      name: displayName,
      description: "",
      categories: [],
    })
    .onConflictDoNothing();
}
router.get(
  "/seller-profiles/:userId",
  async (req, res): Promise<void> => {
    const params = GetSellerProfileParams.safeParse(
      req.params,
    );
    if (!params.success) {
      res.status(400).json({
        error: "Profil invalide.",
      });
      return;
    }
    const result = await getPublicSellerProfile(
      params.data.userId,
    );
    if (!result) {
      res.status(404).json({
        error: "Profil vendeur introuvable.",
      });
      return;
    }
    res.json(
      GetSellerProfileResponse.parse(result),
    );
  },
);
router.get(
  "/seller-profile/me",
  requireAuth,
  async (req, res): Promise<void> => {
    if (!requireAccountType(req, res, ["agency"])) {
      return;
    }
    const authenticated =
      req as AuthenticatedRequest;
    await ensureSellerProfile(authenticated);
    const result = await getPublicSellerProfile(
      authenticated.userId,
    );
    res.json(
      GetMySellerProfileResponse.parse(result),
    );
  },
);
router.put(
  "/seller-profile/me",
  requireAuth,
  async (req, res): Promise<void> => {
    if (!requireAccountType(req, res, ["agency"])) {
      return;
    }
    const body =
      UpdateMySellerProfileBody.safeParse(
        req.body,
      );
    if (!body.success) {
      res.status(400).json({
        error: body.error.message,
      });
      return;
    }
    const avatarUrl = validStoragePath(
      body.data.avatarUrl,
    );
    const bannerUrl = validStoragePath(
      body.data.bannerUrl,
    );
    if (avatarUrl === "" || bannerUrl === "") {
      res.status(400).json({
        error:
          "Les images doivent être téléversées dans le stockage PAYLOCA.",
      });
      return;
    }
    const publicText = [
      body.data.displayName,
      body.data.bio,
      body.data.city,
      body.data.shopName,
      body.data.shopDescription,
      ...body.data.categories,
    ];
    if (publicText.some(containsUnsafeContact)) {
      res.status(400).json({
        error:
          "Ne publiez pas de téléphone, e-mail ou lien dans votre profil.",
      });
      return;
    }
    const categories = [
      ...new Set(
        body.data.categories
          .map((category) => category.trim())
          .filter(Boolean),
      ),
    ];
    const authenticated =
      req as AuthenticatedRequest;
    await ensureSellerProfile(authenticated);
    if (
      !(await isOwnedImage(
        authenticated.userId,
        avatarUrl,
      )) ||
      !(await isOwnedImage(
        authenticated.userId,
        bannerUrl,
      ))
    ) {
      res.status(403).json({
        error:
          "Vous pouvez uniquement utiliser vos propres images.",
      });
      return;
    }
    try {
      await db.transaction(async (tx) => {
        for (const objectPath of new Set(
          [avatarUrl, bannerUrl].filter(
            (path): path is string =>
              Boolean(path),
          ),
        )) {
          const [claimed] = await tx
            .update(storedImagesTable)
            .set({
              sellerProfileOwnerId:
                authenticated.userId,
            })
            .where(
              and(
                eq(
                  storedImagesTable.objectPath,
                  objectPath,
                ),
                eq(
                  storedImagesTable.ownerId,
                  authenticated.userId,
                ),
                isNull(
                  storedImagesTable.listingId,
                ),
                isNull(
                  storedImagesTable.conversationId,
                ),
                or(
                  isNull(
                    storedImagesTable.sellerProfileOwnerId,
                  ),
                  eq(
                    storedImagesTable.sellerProfileOwnerId,
                    authenticated.userId,
                  ),
                ),
              ),
            )
            .returning({
              id: storedImagesTable.id,
            });
          if (!claimed) {
            throw new SellerImageClaimError();
          }
        }
        await tx
          .update(sellerProfilesTable)
          .set({
            displayName:
              body.data.displayName.trim(),
            bio: body.data.bio.trim(),
            city: body.data.city.trim(),
            avatarUrl,
            updatedAt: new Date(),
          })
          .where(
            eq(
              sellerProfilesTable.userId,
              authenticated.userId,
            ),
          );
        await tx
          .update(sellerShopsTable)
          .set({
            name: body.data.shopName.trim(),
            description:
              body.data.shopDescription.trim(),
            bannerUrl,
            categories,
            updatedAt: new Date(),
          })
          .where(
            eq(
              sellerShopsTable.ownerId,
              authenticated.userId,
            ),
          );
      });
    } catch (error) {
      if (!(error instanceof SellerImageClaimError)) {
        throw error;
      }
      res.status(409).json({
        error:
          "Cette image est déjà utilisée dans un autre espace.",
      });
      return;
    }
    const result = await getPublicSellerProfile(
      authenticated.userId,
    );
    res.json(
      UpdateMySellerProfileResponse.parse(result),
    );
  },
);
router.post(
  "/seller-verification-requests",
  requireAuth,
  async (req, res): Promise<void> => {
    if (!requireAccountType(req, res, ["agency"])) {
      return;
    }
    const body =
      CreateSellerVerificationRequestBody.safeParse(
        req.body,
      );
    if (!body.success) {
      res.status(400).json({
        error: body.error.message,
      });
      return;
    }
    const authenticated =
      req as AuthenticatedRequest;
    await ensureSellerProfile(authenticated);
    const [pending] = await db
      .select({
        id: sellerVerificationRequestsTable.id,
      })
      .from(sellerVerificationRequestsTable)
      .where(
        and(
          eq(
            sellerVerificationRequestsTable.userId,
            authenticated.userId,
          ),
          eq(
            sellerVerificationRequestsTable.status,
            "pending",
          ),
        ),
      )
      .limit(1);
    if (pending) {
      res.status(409).json({
        error:
          "Une demande de vérification est déjà en cours.",
      });
      return;
    }
    let request;
    try {
      [request] = await db.transaction(
        async (tx) => {
          const inserted = await tx
            .insert(
              sellerVerificationRequestsTable,
            )
            .values({
              userId: authenticated.userId,
              details: body.data.details.trim(),
              status: "pending",
            })
            .returning();
          await tx
            .update(sellerProfilesTable)
            .set({
              verificationStatus: "pending",
              updatedAt: new Date(),
            })
            .where(
              eq(
                sellerProfilesTable.userId,
                authenticated.userId,
              ),
            );
          return inserted;
        },
      );
    } catch (error) {
      if (getDatabaseErrorCode(error) !== "23505") {
        throw error;
      }
      res.status(409).json({
        error:
          "Une demande de vérification est déjà en cours.",
      });
      return;
    }
    res.status(201).json(
      CreateSellerVerificationRequestResponse.parse(
        request,
      ),
    );
  },
);
router.get(
  "/seller-verification-requests/mine",
  requireAuth,
  async (req, res): Promise<void> => {
    if (!requireAccountType(req, res, ["agency"])) {
      return;
    }
    const userId =
      (req as AuthenticatedRequest).userId;
    const [request] = await db
      .select()
      .from(sellerVerificationRequestsTable)
      .where(
        eq(
          sellerVerificationRequestsTable.userId,
          userId,
        ),
      )
      .orderBy(
        desc(
          sellerVerificationRequestsTable.createdAt,
        ),
      )
      .limit(1);
    res.json(
      GetMySellerVerificationRequestResponse.parse(
        request ?? null,
      ),
    );
  },
);
router.get(
  "/seller-verification-requests/moderation",
  requireAuth,
  requireModerator,
  async (req, res): Promise<void> => {
    const query =
      ListSellerVerificationRequestsQueryParams.safeParse(
        req.query,
      );
    if (!query.success) {
      res.status(400).json({
        error: query.error.message,
      });
      return;
    }
    const requests = await db
      .select()
      .from(sellerVerificationRequestsTable)
      .where(
        eq(
          sellerVerificationRequestsTable.status,
          query.data.status ?? "pending",
        ),
      )
      .orderBy(
        desc(
          sellerVerificationRequestsTable.createdAt,
        ),
      );
    res.json(
      ListSellerVerificationRequestsResponse.parse(
        requests,
      ),
    );
  },
);
router.patch(
  "/seller-verification-requests/:id",
  requireAuth,
  requireModerator,
  async (req, res): Promise<void> => {
    const params =
      ModerateSellerVerificationRequestParams.safeParse(
        req.params,
      );
    const body =
      ModerateSellerVerificationRequestBody.safeParse(
        req.body,
      );
    if (!params.success || !body.success) {
      res.status(400).json({
        error: "Décision invalide.",
      });
      return;
    }
    const note =
      body.data.moderationNote?.trim() || null;
    if (body.data.status === "rejected" && !note) {
      res.status(400).json({
        error:
          "Un motif est requis pour refuser la demande.",
      });
      return;
    }
    const reviewerId =
      (req as AuthenticatedRequest).userId;
    const [existing] = await db
      .select()
      .from(sellerVerificationRequestsTable)
      .where(
        eq(
          sellerVerificationRequestsTable.id,
          params.data.id,
        ),
      )
      .limit(1);
    if (!existing) {
      res.status(404).json({
        error: "Demande introuvable.",
      });
      return;
    }
    let updated;
    try {
      [updated] = await db.transaction(
        async (tx) => {
          const [request] = await tx
            .update(sellerVerificationRequestsTable)
            .set({
              status: body.data.status,
              moderationNote: note,
              reviewerId,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(
                  sellerVerificationRequestsTable.id,
                  existing.id,
                ),
                eq(
                  sellerVerificationRequestsTable.status,
                  "pending",
                ),
              ),
            )
            .returning();
          if (!request) {
            throw new VerificationAlreadyModeratedError();
          }
          await tx
            .update(sellerProfilesTable)
            .set({
              verificationStatus: body.data.status,
              verifiedAt:
                body.data.status === "approved"
                  ? new Date()
                  : null,
              updatedAt: new Date(),
            })
            .where(
              eq(
                sellerProfilesTable.userId,
                request.userId,
              ),
            );
          return [request];
        },
      );
    } catch (error) {
      if (
        !(error instanceof VerificationAlreadyModeratedError)
      ) {
        throw error;
      }
      res.status(409).json({
        error:
          "Cette demande a déjà été traitée.",
      });
      return;
    }
    res.json(
      ModerateSellerVerificationRequestResponse.parse(
        updated,
      ),
    );
  },
);
router.post(
  "/seller-reports",
  requireAuth,
  async (req, res): Promise<void> => {
    const body = CreateSellerReportBody.safeParse(
      req.body,
    );
    if (!body.success) {
      res.status(400).json({
        error: body.error.message,
      });
      return;
    }
    const reporterId =
      (req as AuthenticatedRequest).userId;
    if (reporterId === body.data.targetUserId) {
      res.status(400).json({
        error:
          "Vous ne pouvez pas signaler votre propre profil.",
      });
      return;
    }
    const [target] = await db
      .select({
        userId: sellerProfilesTable.userId,
      })
      .from(sellerProfilesTable)
      .where(
        eq(
          sellerProfilesTable.userId,
          body.data.targetUserId,
        ),
      )
      .limit(1);
    if (!target) {
      res.status(404).json({
        error: "Profil vendeur introuvable.",
      });
      return;
    }
    try {
      const [report] = await db
        .insert(sellerReportsTable)
        .values({
          reporterId,
          targetUserId: target.userId,
          reason: body.data.reason,
          details: body.data.details?.trim() ?? "",
          status: "pending",
        })
        .returning();
      res.status(201).json(
        CreateSellerReportResponse.parse({
          id: report.id,
          status: "pending",
          createdAt: report.createdAt,
        }),
      );
    } catch (error) {
      if (getDatabaseErrorCode(error) !== "23505") {
        throw error;
      }
      res.status(409).json({
        error: "Vous avez déjà signalé ce profil.",
      });
    }
  },
);
router.get(
  "/seller-reports/moderation",
  requireAuth,
  requireModerator,
  async (req, res): Promise<void> => {
    const query =
      ListSellerReportsQueryParams.safeParse(
        req.query,
      );
    if (!query.success) {
      res.status(400).json({
        error: query.error.message,
      });
      return;
    }
    const reports = await db
      .select()
      .from(sellerReportsTable)
      .where(
        eq(
          sellerReportsTable.status,
          query.data.status ?? "pending",
        ),
      )
      .orderBy(
        desc(sellerReportsTable.createdAt),
      );
    res.json(
      ListSellerReportsResponse.parse(reports),
    );
  },
);
router.patch(
  "/seller-reports/:id",
  requireAuth,
  requireModerator,
  async (req, res): Promise<void> => {
    const params =
      ModerateSellerReportParams.safeParse(
        req.params,
      );
    const body =
      ModerateSellerReportBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({
        error: "Décision invalide.",
      });
      return;
    }
    const [updated] = await db
      .update(sellerReportsTable)
      .set({
        status: body.data.status,
        resolution: body.data.resolution.trim(),
        reviewerId:
          (req as AuthenticatedRequest).userId,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(
            sellerReportsTable.id,
            params.data.id,
          ),
          eq(
            sellerReportsTable.status,
            "pending",
          ),
        ),
      )
      .returning();
    if (!updated) {
      res.status(404).json({
        error: "Signalement introuvable.",
      });
      return;
    }
    res.json(
      ModerateSellerReportResponse.parse(updated),
    );
  },
);
export default router;
class VerificationAlreadyModeratedError extends Error {}
class SellerImageClaimError extends Error {}
