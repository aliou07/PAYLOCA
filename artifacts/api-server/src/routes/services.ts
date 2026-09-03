import {
  and,
  desc,
  eq,
  ilike,
  or,
  sql,
} from "drizzle-orm";
import {
  Router,
  type IRouter,
} from "express";
import {
  db,
  serviceOrdersTable,
  serviceProvidersTable,
  serviceReviewsTable,
} from "@workspace/db";
import {
  CreateServiceOrderBody,
  CreateServiceOrderResponse,
  CreateServiceReviewBody,
  CreateServiceReviewResponse,
  ListServiceOrdersResponse,
  ListServiceProvidersQueryParams,
  ListServiceProvidersResponse,
  CreateServiceReviewParams,
} from "@workspace/api-zod";
import {
  getAuthenticatedUserName,
  requireAuth,
  type AuthenticatedRequest,
} from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get(
  "/service-providers",
  async (req, res): Promise<void> => {
    const parsed =
      ListServiceProvidersQueryParams.safeParse(
        req.query,
      );

    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.message,
      });
      return;
    }

    const filters = [
      eq(
        serviceProvidersTable.certified,
        true,
      ),
    ];

    if (parsed.data.category) {
      filters.push(
        eq(
          serviceProvidersTable.category,
          parsed.data.category,
        ),
      );
    }

    if (parsed.data.city) {
      filters.push(
        eq(
          serviceProvidersTable.city,
          parsed.data.city,
        ),
      );
    }

    if (parsed.data.search) {
      const search = `%${parsed.data.search}%`;

      filters.push(
        or(
          ilike(
            serviceProvidersTable.name,
            search,
          ),
          ilike(
            serviceProvidersTable.category,
            search,
          ),
          ilike(
            serviceProvidersTable.description,
            search,
          ),
          ilike(
            serviceProvidersTable.neighborhood,
            search,
          ),
        )!,
      );
    }

    const providers = await db
      .select()
      .from(serviceProvidersTable)
      .where(and(...filters))
      .orderBy(
        desc(serviceProvidersTable.available),
        desc(serviceProvidersTable.rating),
        desc(
          serviceProvidersTable.reviewCount,
        ),
      );

    res.json(
      ListServiceProvidersResponse.parse(
        providers,
      ),
    );
  },
);

router.get(
  "/service-orders",
  requireAuth,
  async (req, res): Promise<void> => {
    const userId =
      (req as AuthenticatedRequest).userId;

    const orders = await db
      .select({
        id: serviceOrdersTable.id,
        providerId:
          serviceOrdersTable.providerId,
        providerName:
          serviceProvidersTable.name,
        clientId: serviceOrdersTable.clientId,
        service: serviceOrdersTable.service,
        details: serviceOrdersTable.details,
        status: serviceOrdersTable.status,
        createdAt:
          serviceOrdersTable.createdAt,
        updatedAt:
          serviceOrdersTable.updatedAt,
      })
      .from(serviceOrdersTable)
      .innerJoin(
        serviceProvidersTable,
        eq(
          serviceOrdersTable.providerId,
          serviceProvidersTable.id,
        ),
      )
      .where(
        eq(
          serviceOrdersTable.clientId,
          userId,
        ),
      )
      .orderBy(
        desc(serviceOrdersTable.createdAt),
      );

    res.json(
      ListServiceOrdersResponse.parse(
        orders,
      ),
    );
  },
);

router.post(
  "/service-orders",
  requireAuth,
  async (req, res): Promise<void> => {
    const parsed =
      CreateServiceOrderBody.safeParse(
        req.body,
      );

    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.message,
      });
      return;
    }

    const [provider] = await db
      .select()
      .from(serviceProvidersTable)
      .where(
        and(
          eq(
            serviceProvidersTable.id,
            parsed.data.providerId,
          ),
          eq(
            serviceProvidersTable.certified,
            true,
          ),
        ),
      )
      .limit(1);

    if (!provider) {
      res.status(404).json({
        error:
          "Ce prestataire certifié n'est pas disponible.",
      });
      return;
    }

    const userId =
      (req as AuthenticatedRequest).userId;

    const [order] = await db
      .insert(serviceOrdersTable)
      .values({
        providerId: provider.id,
        clientId: userId,
        service: parsed.data.service.trim(),
        details:
          parsed.data.details?.trim() ?? "",
        status: "en_attente",
      })
      .returning();

    res.status(201).json(
      CreateServiceOrderResponse.parse({
        ...order,
        providerName: provider.name,
      }),
    );
  },
);

router.post(
  "/service-providers/:id/reviews",
  requireAuth,
  async (req, res): Promise<void> => {
    const params =
      CreateServiceReviewParams.safeParse(
        req.params,
      );

    const body =
      CreateServiceReviewBody.safeParse(
        req.body,
      );

    if (!params.success || !body.success) {
      res.status(400).json({
        error: "Avis invalide.",
      });
      return;
    }

    const userId =
      (req as AuthenticatedRequest).userId;

    const [provider] = await db
      .select({
        id: serviceProvidersTable.id,
      })
      .from(serviceProvidersTable)
      .where(
        and(
          eq(
            serviceProvidersTable.id,
            params.data.id,
          ),
          eq(
            serviceProvidersTable.certified,
            true,
          ),
        ),
      )
      .limit(1);

    if (!provider) {
      res.status(404).json({
        error: "Prestataire introuvable.",
      });
      return;
    }

    const [order] = await db
      .select({
        id: serviceOrdersTable.id,
        providerId:
          serviceOrdersTable.providerId,
      })
      .from(serviceOrdersTable)
      .where(
        and(
          eq(
            serviceOrdersTable.id,
            body.data.orderId,
          ),
          eq(
            serviceOrdersTable.providerId,
            provider.id,
          ),
          eq(
            serviceOrdersTable.clientId,
            userId,
          ),
          eq(
            serviceOrdersTable.status,
            "terminee",
          ),
        ),
      )
      .limit(1);

    if (!order) {
      res.status(403).json({
        error:
          "Vous pouvez noter uniquement un prestataire que vous avez commandé.",
      });
      return;
    }

    const clientName =
      await getAuthenticatedUserName(
        userId,
        req,
      );

    try {
      const review = await db.transaction(
        async (tx) => {
          const [created] = await tx
            .insert(serviceReviewsTable)
            .values({
              providerId: provider.id,
              orderId: order.id,
              clientId: userId,
              clientName,
              rating: body.data.rating,
              comment:
                body.data.comment?.trim()
                ?? "",
            })
            .returning();

          const [stats] = await tx
            .select({
              average: sql<number>`avg(${serviceReviewsTable.rating})`,
              count: sql<number>`count(*)`,
            })
            .from(serviceReviewsTable)
            .where(
              eq(
                serviceReviewsTable.providerId,
                provider.id,
              ),
            );

          await tx
            .update(serviceProvidersTable)
            .set({
              rating: Number(
                stats?.average ?? 0,
              ),
              reviewCount: Number(
                stats?.count ?? 0,
              ),
            })
            .where(
              eq(
                serviceProvidersTable.id,
                provider.id,
              ),
            );

          return created;
        },
      );

      res.status(201).json(
        CreateServiceReviewResponse.parse(
          review,
        ),
      );
    } catch (error) {
      req.log.warn(
        {
          err: error,
        },
        "Service review rejected",
      );

      res.status(409).json({
        error:
          "Vous avez déjà noté ce prestataire.",
      });
    }
  },
);

export default router;
