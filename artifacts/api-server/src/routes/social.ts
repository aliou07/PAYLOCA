import {
  and,
  asc,
  desc,
  eq,
  ilike,
  or,
} from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  db,
  feedPostsTable,
  followsTable,
  sellerProfilesTable,
  userStreaksTable,
} from "@workspace/db";
import {
  CreateFollowRequestParams,
  CreateFollowRequestResponse,
  GetFollowStatusParams,
  GetFollowStatusResponse,
  GetStreakLeaderboardQueryParams,
  GetStreakLeaderboardResponse,
  SearchPaylocaQueryParams,
  SearchPaylocaResponse,
} from "@workspace/api-zod";
import {
  requireAuth,
  type AuthenticatedRequest,
} from "../middlewares/requireAuth";
import { getDatabaseErrorCode } from "../lib/databaseError";
import { recordUserActivity } from "./streaks";
const router: IRouter = Router();
function publicFeedPost(
  post: typeof feedPostsTable.$inferSelect,
) {
  return {
    id: post.id,
    clientPostId: post.clientPostId,
    authorName: post.authorName,
    community: post.community,
    city: post.city,
    caption: post.caption,
    category: post.category,
    createdAt: post.createdAt,
  };
}
router.get(
  "/search",
  async (req, res): Promise<void> => {
    const parsed = SearchPaylocaQueryParams.safeParse(
      req.query,
    );
    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.message,
      });
      return;
    }
    const rawQuery = parsed.data.q.trim();
    const type = rawQuery.startsWith("#")
      ? "hashtag"
      : rawQuery.startsWith("@")
        ? "user"
        : "all";
    const query = rawQuery
      .replace(/^[@#]/, "")
      .trim();
    if (!query) {
      res.status(400).json({
        error: "Saisissez un terme de recherche.",
      });
      return;
    }
    const search = `%${query}%`;
    const posts =
      type === "user"
        ? []
        : await db
            .select()
            .from(feedPostsTable)
            .where(
              or(
                ilike(
                  feedPostsTable.caption,
                  type === "hashtag"
                    ? `%#${query}%`
                    : search,
                ),
                ilike(
                  feedPostsTable.community,
                  search,
                ),
                ilike(
                  feedPostsTable.city,
                  search,
                ),
              ),
            )
            .orderBy(
              desc(feedPostsTable.createdAt),
            )
            .limit(50);
    const profiles =
      type === "hashtag"
        ? []
        : await db
            .select({
              userId: sellerProfilesTable.userId,
              displayName:
                sellerProfilesTable.displayName,
              bio: sellerProfilesTable.bio,
              city: sellerProfilesTable.city,
              avatarUrl:
                sellerProfilesTable.avatarUrl,
            })
            .from(sellerProfilesTable)
            .where(
              or(
                ilike(
                  sellerProfilesTable.displayName,
                  search,
                ),
                ilike(
                  sellerProfilesTable.bio,
                  search,
                ),
                ilike(
                  sellerProfilesTable.city,
                  search,
                ),
              ),
            )
            .orderBy(
              asc(sellerProfilesTable.displayName),
            )
            .limit(50);
    res.json(
      SearchPaylocaResponse.parse({
        type,
        posts: posts.map(publicFeedPost),
        profiles,
      }),
    );
  },
);
router.get(
  "/follow/:followingId",
  requireAuth,
  async (req, res): Promise<void> => {
    const parsed = GetFollowStatusParams.safeParse(
      req.params,
    );
    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.message,
      });
      return;
    }
    const followerId =
      (req as AuthenticatedRequest).userId;
    const [follow] = await db
      .select({
        status: followsTable.status,
      })
      .from(followsTable)
      .where(
        and(
          eq(followsTable.followerId, followerId),
          eq(
            followsTable.followingId,
            parsed.data.followingId,
          ),
        ),
      )
      .limit(1);
    res.json(
      GetFollowStatusResponse.parse({
        status: follow?.status ?? null,
      }),
    );
  },
);
router.post(
  "/follow/:followingId",
  requireAuth,
  async (req, res): Promise<void> => {
    const parsed =
      CreateFollowRequestParams.safeParse(
        req.params,
      );
    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.message,
      });
      return;
    }
    const followerId =
      (req as AuthenticatedRequest).userId;
    const followingId = parsed.data.followingId;
    if (followerId === followingId) {
      res.status(400).json({
        error:
          "Vous ne pouvez pas vous suivre vous-même.",
      });
      return;
    }
    const [profile] = await db
      .select({
        userId: sellerProfilesTable.userId,
      })
      .from(sellerProfilesTable)
      .where(
        eq(
          sellerProfilesTable.userId,
          followingId,
        ),
      )
      .limit(1);
    if (!profile) {
      res.status(404).json({
        error: "Ce profil public n’existe pas.",
      });
      return;
    }
    const [existing] = await db
      .select()
      .from(followsTable)
      .where(
        and(
          eq(followsTable.followerId, followerId),
          eq(
            followsTable.followingId,
            followingId,
          ),
        ),
      )
      .limit(1);
    if (existing) {
      res.status(409).json({
        error: "Une demande de suivi existe déjà.",
        status: existing.status,
      });
      return;
    }
    try {
      const [follow] = await db
        .insert(followsTable)
        .values({
          followerId,
          followingId,
          status: "pending",
        })
        .returning();
      if (!follow) {
        res.status(500).json({
          error:
            "La demande de suivi n’a pas pu être enregistrée.",
        });
        return;
      }
      res.status(201).json(
        CreateFollowRequestResponse.parse(follow),
      );
    } catch (error) {
      if (getDatabaseErrorCode(error) === "23505") {
        res.status(409).json({
          error: "Une demande de suivi existe déjà.",
        });
        return;
      }
      throw error;
    }
  },
);
router.get(
  "/streak/leaderboard",
  async (req, res): Promise<void> => {
    const parsed =
      GetStreakLeaderboardQueryParams.safeParse(
        req.query,
      );
    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.message,
      });
      return;
    }
    const filters = parsed.data.city
      ? [
          eq(
            sellerProfilesTable.city,
            parsed.data.city,
          ),
        ]
      : [];
    const rows = await db
      .select({
        userId: userStreaksTable.userId,
        displayName: sellerProfilesTable.displayName,
        city: sellerProfilesTable.city,
        avatarUrl: sellerProfilesTable.avatarUrl,
        streakCount: userStreaksTable.streakCount,
        score: userStreaksTable.score,
      })
      .from(userStreaksTable)
      .innerJoin(
        sellerProfilesTable,
        eq(
          userStreaksTable.userId,
          sellerProfilesTable.userId,
        ),
      )
      .where(
        filters.length ? and(...filters) : undefined,
      )
      .orderBy(
        desc(userStreaksTable.score),
        desc(userStreaksTable.streakCount),
        asc(sellerProfilesTable.displayName),
      )
      .limit(parsed.data.limit);
    res.json(
      GetStreakLeaderboardResponse.parse(
        rows.map((row, index) => ({
          ...row,
          rank: index + 1,
        })),
      ),
    );
  },
);
export default router;
