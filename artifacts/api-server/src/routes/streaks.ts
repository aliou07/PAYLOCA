import { eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  db,
  userStreaksTable,
} from "@workspace/db";
import {
  GetMyStreakResponse,
  RecordStreakActivityBody,
  RecordStreakActivityResponse,
} from "@workspace/api-zod";
import {
  requireAuth,
  type AuthenticatedRequest,
} from "../middlewares/requireAuth";
const router: IRouter = Router();
const DAY_MS = 24 * 60 * 60 * 1000;
const ACTION_POINTS = {
  daily_visit: 1,
  feed_post: 10,
} as const;
function dayNumber(date: Date): number {
  return Math.floor(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
    ) / DAY_MS,
  );
}
function publicStreak(
  userId: string,
  streak?: typeof userStreaksTable.$inferSelect,
) {
  return {
    userId,
    streakCount: streak?.streakCount ?? 0,
    lastActiveAt: streak?.lastActiveAt ?? null,
    score: streak?.score ?? 0,
    updatedAt: streak?.updatedAt ?? new Date(),
  };
}
export async function recordUserActivity(
  userId: string,
  action: keyof typeof ACTION_POINTS,
): Promise<ReturnType<typeof publicStreak>> {
  const now = new Date();
  const [current] = await db
    .select()
    .from(userStreaksTable)
    .where(eq(userStreaksTable.userId, userId))
    .limit(1);
  const previousDay = current?.lastActiveAt
    ? dayNumber(current.lastActiveAt)
    : null;
  const today = dayNumber(now);
  const streakCount =
    previousDay === null
      ? 1
      : previousDay === today
        ? current.streakCount
        : previousDay === today - 1
          ? current.streakCount + 1
          : 1;
  const shouldAwardPoints =
    action !== "daily_visit" ||
    previousDay !== today;
  const score =
    (current?.score ?? 0) +
    (shouldAwardPoints
      ? ACTION_POINTS[action]
      : 0);
  if (!current) {
    const [created] = await db
      .insert(userStreaksTable)
      .values({
        userId,
        streakCount,
        lastActiveAt: now,
        score,
      })
      .returning();
    return publicStreak(userId, created);
  }
  const [updated] = await db
    .update(userStreaksTable)
    .set({
      streakCount,
      lastActiveAt: now,
      score,
      updatedAt: now,
    })
    .where(
      eq(userStreaksTable.userId, userId),
    )
    .returning();
  return publicStreak(
    userId,
    updated ?? current,
  );
}
router.get(
  "/streak",
  requireAuth,
  async (req, res): Promise<void> => {
    const userId =
      (req as AuthenticatedRequest).userId;
    const [streak] = await db
      .select()
      .from(userStreaksTable)
      .where(
        eq(userStreaksTable.userId, userId),
      )
      .limit(1);
    res.json(
      GetMyStreakResponse.parse(
        publicStreak(userId, streak),
      ),
    );
  },
);
router.post(
  "/streak/activity",
  requireAuth,
  async (req, res): Promise<void> => {
    const parsed =
      RecordStreakActivityBody.safeParse(
        req.body,
      );
    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.message,
      });
      return;
    }
    const userId =
      (req as AuthenticatedRequest).userId;
    const streak = await recordUserActivity(
      userId,
      parsed.data.action,
    );
    res.json(
      RecordStreakActivityResponse.parse(streak),
    );
  },
);
export default router;
