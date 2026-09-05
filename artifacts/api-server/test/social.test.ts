import assert from "node:assert/strict";
import test, { before } from "node:test";
import { randomUUID } from "node:crypto";
import { db, feedPostsTable, followsTable, pool, sellerProfilesTable, userStreaksTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import socialRouter from "../src/routes/social.ts";
import { recordUserActivity } from "../src/routes/streaks.ts";

type ResponseCapture = {
  statusCode: number;
  body?: unknown;
  status: (code: number) => ResponseCapture;
  json: (body: unknown) => ResponseCapture;
};

function responseCapture(): ResponseCapture {
  const response: ResponseCapture = {
    statusCode: 200,
    status(code) {
      response.statusCode = code;
      return response;
    },
    json(body) {
      response.body = body;
      return response;
    },
  };
  return response;
}

function routeHandler(router: unknown, method: string, path: string): (req: any, res: any) => unknown {
  const layer = (router as any).stack.find(
    (entry: any) => entry.route?.path === path && entry.route.methods[method],
  );
  assert.ok(layer, `Route ${method.toUpperCase()} ${path} introuvable`);
  return (layer.route.stack[1] ?? layer.route.stack[0]).handle;
}

before(async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS payloca_follows (
      id serial PRIMARY KEY,
      follower_id text NOT NULL,
      following_id text NOT NULL,
      status text NOT NULL DEFAULT 'pending',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (follower_id, following_id),
      CHECK (follower_id <> following_id),
      CHECK (status in ('pending', 'accepted', 'rejected'))
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS payloca_user_streaks (
      user_id text PRIMARY KEY,
      streak_count integer NOT NULL DEFAULT 0,
      last_active_at timestamptz,
      score integer NOT NULL DEFAULT 0,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
});

test("la recherche renvoie uniquement les publications et profils existants", async () => {
  const userId = `social-search-${randomUUID()}`;
  const [profile] = await db.insert(sellerProfilesTable).values({
    userId,
    displayName: "Profil Recherche Niger",
    bio: "Une bio de recherche",
    city: "Niamey",
  }).returning();
  const [post] = await db.insert(feedPostsTable).values({
    clientPostId: randomUUID(),
    authorId: userId,
    authorName: profile.displayName,
    community: "Zarma-Songhai",
    city: "Niamey",
    caption: "Conseil maison à Niamey",
    category: "Tout le Niger",
  }).returning();

  try {
    const response = responseCapture();
    await routeHandler(socialRouter, "get", "/search")({ query: { q: "Recherche Niger" } }, response);
    assert.equal(response.statusCode, 200);
    assert.equal((response.body as any).profiles[0].userId, userId);
    assert.equal((response.body as any).posts.length, 0);
  } finally {
    await db.delete(feedPostsTable).where(eq(feedPostsTable.id, post.id));
    await db.delete(sellerProfilesTable).where(eq(sellerProfilesTable.userId, userId));
  }
});

test("une demande de suivi reste en attente et les doublons sont refusés", async () => {
  const followerId = `social-follower-${randomUUID()}`;
  const followingId = `social-following-${randomUUID()}`;
  await db.insert(sellerProfilesTable).values({
    userId: followingId,
    displayName: "Profil Suivi Niger",
    city: "Niamey",
  });

  try {
    const first = responseCapture();
    await routeHandler(socialRouter, "post", "/follow/:followingId")(
      { params: { followingId }, userId: followerId },
      first,
    );
    assert.equal(first.statusCode, 201);
    assert.equal((first.body as any).status, "pending");

    const duplicate = responseCapture();
    await routeHandler(socialRouter, "post", "/follow/:followingId")(
      { params: { followingId }, userId: followerId },
      duplicate,
    );
    assert.equal(duplicate.statusCode, 409);
  } finally {
    await db.delete(followsTable).where(eq(followsTable.followerId, followerId));
    await db.delete(sellerProfilesTable).where(eq(sellerProfilesTable.userId, followingId));
  }
});

test("la série et le score sont persistants et idempotents pour une même journée", async () => {
  const userId = `social-streak-${randomUUID()}`;
  try {
    const first = await recordUserActivity(userId, "daily_visit");
    const second = await recordUserActivity(userId, "daily_visit");
    assert.equal(first.streakCount, 1);
    assert.equal(second.streakCount, 1);
    assert.equal(second.score, 1);
    const [stored] = await db.select().from(userStreaksTable).where(eq(userStreaksTable.userId, userId));
    assert.equal(stored?.score, 1);
  } finally {
    await db.delete(userStreaksTable).where(eq(userStreaksTable.userId, userId));
  }
});
