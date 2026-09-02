14. artifacts/api-server/src/routes/listings.ts
import { Router, type IRouter } from "express";
import { and, eq, inArray, isNull, lte, lt, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import {
  db,
  listingsTable,
  membershipsTable,
  photoHashesTable,
  storedImagesTable,
} from "@workspace/db";
import {
  CreateListingBody,
  CreateListingResponse,
  GetFeaturedListingsResponse,
  GetListingParams,
  GetListingResponse,
  ListListingsQueryParams,
  ListListingsResponse,
  UpdateListingBody,
  UpdateListingParams,
  UpdateListingResponse,
  UpdateListingStatusBody,
  UpdateListingStatusParams,
  UpdateListingStatusResponse,
} from "@workspace/api-zod";
import {
  getAuthenticatedUserName,
  requireAdultExperience,
  requireAccountType,
  requireAuth,
  requireVipAccess,
  type AuthenticatedRequest,
} from "../middlewares/requireAuth";
import { ObjectStorageService } from "../lib/objectStorage";
import { DuplicatePhotoError, reservePhotoHash } from "../lib/photoHash";
import {
  boostLimitForPlan,
  boostPeriodStart,
  planForMembershipStatus,
} from "../lib/membership";
import { normalizeNigerPhone } from "../lib/phone";
const router: IRouter = Router();
const storage = new ObjectStorageService();
function listingForResponse<T extends { status: string }>(listing: T): T {
  return listing.status === "actif" ? { ...listing, status: "libre" } : listing;
}
async function imageHash(imagePath: string): Promise<string> {
  const file = await storage.getObjectEntityFile(imagePath);
  const [image] = await file.download();
  return createHash("sha256").update(image).digest("hex");
}
function isStoredImagePath(value: string): boolean {
  return (
    value.startsWith("/objects/uploads/") &&
    !value.includes("..") &&
    !value.includes("data:")
  );
}
export { normalizeNigerPhone };
router.get("/listings", requireAuth, async (req, res): Promise<void> => {
  if (!requireAdultExperience(req, res)) return;
  const parsed = ListListingsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({
      error: parsed.error.message,
    });
    return;
  }
  // "actif" is retained here only so older published records remain visible
  // while newly created records use the clearer "libre" status.
  const filters = [inArray(listingsTable.status, ["libre", "actif"])];
  if (parsed.data.type !== "all") {
    filters.push(eq(listingsTable.type, parsed.data.type));
  }
  if (parsed.data.city) {
    filters.push(eq(listingsTable.city, parsed.data.city));
  }
  if (parsed.data.maxPrice !== undefined) {
    filters.push(lte(listingsTable.price, parsed.data.maxPrice));
  }
  const listings = await db
    .select()
    .from(listingsTable)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(
      sql`${listingsTable.premiumUntil} desc nulls last`,
      listingsTable.id,
    );
  res.json(
    ListListingsResponse.parse(listings.map(listingForResponse)),
  );
});
router.post("/listings", requireAuth, async (req, res): Promise<void> => {
  if (!requireAdultExperience(req, res)) return;
  if (!requireAccountType(req, res, ["agency"])) return;
  if (!requireVipAccess(req, res)) return;
  const parsed = CreateListingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: parsed.error.message,
    });
    return;
  }
  if (parsed.data.propertyCondition === "empty_land") {
    res.status(422).json({
      error:
        "Désolé, PAYLOCA n'accepte que les maisons construites.",
    });
    return;
  }
  const contact = normalizeNigerPhone(parsed.data.contact);
  if (!contact) {
    res.status(400).json({
      error:
        "Indiquez un numéro nigérien valide au format +227 suivi de 8 chiffres.",
    });
    return;
  }
  if (!isStoredImagePath(parsed.data.imageUrl)) {
    res.status(400).json({
      error:
        "La photo doit être envoyée dans le stockage sécurisé de PAYLOCA.",
    });
    return;
  }
  const userId = (req as AuthenticatedRequest).userId;
  const [uploadedImage] = await db
    .select()
    .from(storedImagesTable)
    .where(
      and(
        eq(storedImagesTable.objectPath, parsed.data.imageUrl),
        eq(storedImagesTable.ownerId, userId),
        isNull(storedImagesTable.listingId),
        isNull(storedImagesTable.conversationId),
        isNull(storedImagesTable.sellerProfileOwnerId),
      ),
    )
    .limit(1);
  if (
    !uploadedImage ||
    !(await storage.verifyImage(parsed.data.imageUrl, uploadedImage))
  ) {
    res.status(403).json({
      error: "Vous pouvez uniquement utiliser vos propres photos.",
    });
    return;
  }
  const hash = await imageHash(parsed.data.imageUrl);
  const [existingHash] = await db
    .select({
      id: photoHashesTable.id,
    })
    .from(photoHashesTable)
    .where(eq(photoHashesTable.hash, hash))
    .limit(1);
  if (existingHash) {
    res.status(409).json({
      error: "Photo déjà utilisée dans une autre annonce.",
    });
    return;
  }
  const launchFreeUntil = new Date();
  launchFreeUntil.setMonth(launchFreeUntil.getMonth() + 3);
  const {
    propertyCondition: _propertyCondition,
    ...listingInput
  } = parsed.data;
  const ownerName = await getAuthenticatedUserName(userId, req);
  let listing;
  try {
    [listing] = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(listingsTable)
        .values({
          ...listingInput,
          contact,
          filtre: listingInput.filtre?.trim() || null,
          ownerName,
          ownerId: userId,
          verified: false,
          status: "libre",
          launchFreeUntil,
        })
        .returning();
      const [claimedImage] = await tx
        .update(storedImagesTable)
        .set({
          listingId: created.id,
        })
        .where(
          and(
            eq(storedImagesTable.objectPath, parsed.data.imageUrl),
            eq(storedImagesTable.ownerId, userId),
            isNull(storedImagesTable.listingId),
            isNull(storedImagesTable.conversationId),
            isNull(storedImagesTable.sellerProfileOwnerId),
          ),
        )
        .returning({
          id: storedImagesTable.id,
        });
      if (!claimedImage) {
        throw new DuplicatePhotoError();
      }
      await reservePhotoHash(hash, () =>
        tx
          .insert(photoHashesTable)
          .values({
            hash,
            listingId: created.id,
          })
          .onConflictDoNothing({
            target: photoHashesTable.hash,
          })
          .returning({
            id: photoHashesTable.id,
          }),
      );
      return [created];
    });
  } catch (error) {
    if (error instanceof DuplicatePhotoError) {
      res.status(409).json({
        error:
          "Cette photo est déjà utilisée ou ne peut pas être vérifiée.",
      });
      return;
    }
    req.log.error(
      {
        err: error,
      },
      "Erreur lors de la création de l’annonce",
    );
    res.status(500).json({
      error: "L’annonce ne peut pas être créée pour le moment.",
    });
    return;
  }
  res.status(201).json(
    CreateListingResponse.parse(listing),
  );
});
router.get(
  "/listings/featured",
  requireAuth,
  async (req, res): Promise<void> => {
    if (!requireAdultExperience(req, res)) return;
    const listings = await db
      .select()
      .from(listingsTable)
      .where(
        and(
          eq(listingsTable.verified, true),
          inArray(listingsTable.status, ["libre", "actif"]),
        ),
      )
      .orderBy(
        sql`${listingsTable.premiumUntil} desc nulls last`,
        listingsTable.id,
      )
      .limit(6);
    res.json(
      GetFeaturedListingsResponse.parse(
        listings.map(listingForResponse),
      ),
    );
  },
);
router.post(
  "/listings/:id/boost",
  requireAuth,
  async (req, res): Promise<void> => {
    if (!requireAdultExperience(req, res)) return;
    const parsed = GetListingParams.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.message,
      });
      return;
    }
    const userId = (req as AuthenticatedRequest).userId;
    const now = new Date();
    const boosted = await db.transaction(async (tx) => {
      const [listing] = await tx
        .select()
        .from(listingsTable)
        .where(
          and(
            eq(listingsTable.id, parsed.data.id),
            eq(listingsTable.ownerId, userId),
          ),
        )
        .limit(1);
      if (!listing) {
        return {
          kind: "not_found" as const,
        };
      }
      if (listing.status === "vendu" || listing.status === "loue") {
        return {
          kind: "unavailable" as const,
        };
      }
      const [membership] = await tx
        .select()
        .from(membershipsTable)
        .where(eq(membershipsTable.userId, userId))
        .limit(1);
      if (!membership) {
        return {
          kind: "no_plan" as const,
        };
      }
      const currentPeriodStart = boostPeriodStart(now);
      if (membership.boostsPeriodStartedAt < currentPeriodStart) {
        const [resetMembership] = await tx
          .update(membershipsTable)
          .set({
            boostsUsed: 0,
            boostsPeriodStartedAt: currentPeriodStart,
          })
          .where(
            and(
              eq(membershipsTable.userId, userId),
              lt(
                membershipsTable.boostsPeriodStartedAt,
                currentPeriodStart,
              ),
            ),
          )
          .returning();
        if (resetMembership) {
          Object.assign(membership, resetMembership);
        }
      }
      const plan = planForMembershipStatus(
        membership.status as Parameters<
          typeof planForMembershipStatus
        >[0],
      );
      const limit = boostLimitForPlan(plan);
      if (!limit) {
        return {
          kind: "no_plan" as const,
          plan,
        };
      }
      if (listing.premiumUntil && listing.premiumUntil > now) {
        return {
          kind: "already_active" as const,
          listingId: listing.id,
          premiumUntil: listing.premiumUntil,
          plan,
          boostsRemaining: Math.max(
            0,
            limit - membership.boostsUsed,
          ),
        };
      }
      const [updatedMembership] = await tx
        .update(membershipsTable)
        .set({
          boostsUsed: sql`${membershipsTable.boostsUsed} + 1`,
        })
        .where(
          and(
            eq(membershipsTable.userId, userId),
            eq(membershipsTable.status, membership.status),
            lt(membershipsTable.boostsUsed, limit),
          ),
        )
        .returning({
          boostsUsed: membershipsTable.boostsUsed,
        });
      if (!updatedMembership) {
        return {
          kind: "exhausted" as const,
          plan,
        };
      }
      const start =
        listing.premiumUntil &&
        listing.premiumUntil > now
          ? listing.premiumUntil
          : now;
      const premiumUntil = new Date(
        start.getTime() + 7 * 24 * 60 * 60 * 1000,
      );
      const [updatedListing] = await tx
        .update(listingsTable)
        .set({
          premiumUntil,
        })
        .where(
          and(
            eq(listingsTable.id, listing.id),
            eq(listingsTable.ownerId, userId),
          ),
        )
        .returning({
          id: listingsTable.id,
          premiumUntil: listingsTable.premiumUntil,
        });
      if (!updatedListing) {
        return {
          kind: "not_found" as const,
        };
      }
      return {
        kind: "ok" as const,
        listingId: updatedListing.id,
        premiumUntil: updatedListing.premiumUntil,
        plan,
        boostsRemaining: Math.max(
          0,
          limit - updatedMembership.boostsUsed,
        ),
      };
    });
    if (boosted.kind === "not_found") {
      res.status(404).json({
        error:
          "Annonce introuvable ou vous n’en êtes pas propriétaire.",
      });
      return;
    }
    if (boosted.kind === "unavailable") {
      res.status(403).json({
        error:
          "Une annonce vendue ou louée ne peut plus être mise en avant.",
      });
      return;
    }
    if (boosted.kind === "no_plan") {
      res.status(403).json({
        error:
          "Un abonnement VIP est nécessaire pour utiliser un boost.",
        code: "BOOST_SUBSCRIPTION_REQUIRED",
      });
      return;
    }
    if (boosted.kind === "exhausted") {
      res.status(403).json({
        error:
          "Vous avez utilisé tous vos boosts disponibles.",
        code: "BOOST_LIMIT_REACHED",
      });
      return;
    }
    if (boosted.kind === "already_active") {
      res.status(200).json({
        ...boosted,
        alreadyActive: true,
      });
      return;
    }
    res.status(201).json(boosted);
  },
);
router.get(
  "/listings/:id",
  requireAuth,
  async (req, res): Promise<void> => {
    if (!requireAdultExperience(req, res)) return;
    const parsed = GetListingParams.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.message,
      });
      return;
    }
    const [listing] = await db
      .select()
      .from(listingsTable)
      .where(eq(listingsTable.id, parsed.data.id));
    if (!listing) {
      res.status(404).json({
        error: "Annonce introuvable.",
      });
      return;
    }
    res.json(
      GetListingResponse.parse(listingForResponse(listing)),
    );
  },
);
router.patch(
  "/listings/:id",
  requireAuth,
  async (req, res): Promise<void> => {
    if (!requireAdultExperience(req, res)) return;
    if (!requireAccountType(req, res, ["agency"])) return;
    const params = UpdateListingParams.safeParse(req.params);
    const body = UpdateListingBody.safeParse(req.body);
    if (
      !params.success ||
      !body.success ||
      Object.keys(body.data).length === 0
    ) {
      res.status(400).json({
        error: "Modification invalide.",
      });
      return;
    }
    const userId = (req as AuthenticatedRequest).userId;
    const updateData = {
      ...body.data,
    };
    if (updateData.contact !== undefined) {
      const contact = normalizeNigerPhone(updateData.contact);
      if (!contact) {
        res.status(400).json({
          error:
            "Indiquez un numéro nigérien valide au format +227 suivi de 8 chiffres.",
        });
        return;
      }
      updateData.contact = contact;
    }
    if (updateData.filtre !== undefined) {
      updateData.filtre = updateData.filtre.trim() || undefined;
    }
    const [updated] = await db
      .update(listingsTable)
      .set(updateData)
      .where(
        and(
          eq(listingsTable.id, params.data.id),
          eq(listingsTable.ownerId, userId),
        ),
      )
      .returning();
    if (!updated) {
      const [listing] = await db
        .select({
          id: listingsTable.id,
        })
        .from(listingsTable)
        .where(eq(listingsTable.id, params.data.id));
      res.status(listing ? 403 : 404).json({
        error: listing
          ? "Seul le propriétaire peut modifier cette annonce."
          : "Annonce introuvable.",
      });
      return;
    }
    res.json(
      UpdateListingResponse.parse(updated),
    );
  },
);
router.patch(
  "/listings/:id/status",
  requireAuth,
  async (req, res): Promise<void> => {
    if (!requireAdultExperience(req, res)) return;
    if (!requireAccountType(req, res, ["agency"])) return;
    const params = UpdateListingStatusParams.safeParse(req.params);
    const body = UpdateListingStatusBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({
        error: "Statut invalide.",
      });
      return;
    }
    const [listing] = await db
      .select()
      .from(listingsTable)
      .where(eq(listingsTable.id, params.data.id));
    if (!listing) {
      res.status(404).json({
        error: "Annonce introuvable.",
      });
      return;
    }
    if (
      !listing.ownerId ||
      listing.ownerId !==
        (req as AuthenticatedRequest).userId
    ) {
      res.status(403).json({
        error: "Seul le propriétaire peut modifier cette annonce.",
      });
      return;
    }
    const [updated] = await db
      .update(listingsTable)
      .set({
        status: body.data.status,
      })
      .where(eq(listingsTable.id, listing.id))
      .returning();
    res.json(
      UpdateListingStatusResponse.parse(updated),
    );
  },
);
router.delete(
  "/listings/:id",
  requireAuth,
  async (req, res): Promise<void> => {
    if (!requireAdultExperience(req, res)) return;
    if (!requireAccountType(req, res, ["agency"])) return;
    const params = UpdateListingParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({
        error: "Annonce invalide.",
      });
      return;
    }
    const userId = (req as AuthenticatedRequest).userId;
    const deleted = await db.transaction(async (tx) => {
      const [listing] = await tx
        .delete(listingsTable)
        .where(
          and(
            eq(listingsTable.id, params.data.id),
            eq(listingsTable.ownerId, userId),
          ),
        )
        .returning({
          id: listingsTable.id,
        });
      if (!listing) {
        return null;
      }
      await tx
        .delete(photoHashesTable)
        .where(eq(photoHashesTable.listingId, listing.id));
      return listing;
    });
    if (!deleted) {
      const [listing] = await db
        .select({
          id: listingsTable.id,
        })
        .from(listingsTable)
        .where(eq(listingsTable.id, params.data.id));
      res.status(listing ? 403 : 404).json({
        error: listing
          ? "Seul le propriétaire peut supprimer cette annonce."
          : "Annonce introuvable.",
      });
      return;
    }
    res.status(204).end();
  },
);
export default router;
