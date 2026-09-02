import {
  desc,
  eq,
  and,
} from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  db,
  feedPostsTable,
} from "@workspace/db";
import {
  CreateFeedPostBody,
  CreateFeedPostResponse,
  ListFeedPostsResponse,
} from "@workspace/api-zod";
import {
  getAuthenticatedUserName,
  requireAuth,
  type AuthenticatedRequest,
} from "../middlewares/requireAuth";
import { containsUnsafeContact } from "../lib/jobSafety";
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
  "/feed/posts",
  async (_req, res): Promise<void> => {
    const posts = await db
      .select()
      .from(feedPostsTable)
      .orderBy(desc(feedPostsTable.createdAt))
      .limit(100);
    res.json(
      ListFeedPostsResponse.parse(
        posts.map(publicFeedPost),
      ),
    );
  },
);
router.post(
  "/feed/posts",
  requireAuth,
  async (req, res): Promise<void> => {
    const body = CreateFeedPostBody.safeParse(
      req.body,
    );
    if (!body.success) {
      res.status(400).json({
        error: body.error.message,
      });
      return;
    }
    const caption = body.data.caption.trim();
    const community = body.data.community.trim();
    const city = body.data.city.trim();
    if (
      caption.length < 1 ||
      caption.length > 700 ||
      community.length < 2 ||
      community.length > 60 ||
      city.length < 2 ||
      city.length > 80
    ) {
      res.status(400).json({
        error:
          "Complétez la communauté, la ville et le message avec un texte valide.",
      });
      return;
    }
    if (
      [caption, community, city].some(
        containsUnsafeContact,
      )
    ) {
      res.status(400).json({
        error:
          "Ne publiez pas de téléphone, d’e-mail ou de lien dans le fil.",
      });
      return;
    }
    const authenticated =
      req as AuthenticatedRequest;
    const authorName =
      await getAuthenticatedUserName(
        authenticated.userId,
        req,
      );
    const [created] = await db
      .insert(feedPostsTable)
      .values({
        clientPostId: body.data.clientPostId,
        authorId: authenticated.userId,
        authorName,
        community,
        city,
        caption,
        category: "Tout le Niger",
      })
      .onConflictDoNothing({
        target: [
          feedPostsTable.authorId,
          feedPostsTable.clientPostId,
        ],
      })
      .returning();
    const post =
      created ??
      (
        await db
          .select()
          .from(feedPostsTable)
          .where(
            and(
              eq(
                feedPostsTable.authorId,
                authenticated.userId,
              ),
              eq(
                feedPostsTable.clientPostId,
                body.data.clientPostId,
              ),
            ),
          )
          .limit(1)
      )[0];
    if (!post) {
      res.status(500).json({
        error:
          "La publication ne peut pas être enregistrée pour le moment.",
      });
      return;
    }
    res.status(201).json(
      CreateFeedPostResponse.parse(
        publicFeedPost(post),
      ),
    );
  },
);
export default router;
