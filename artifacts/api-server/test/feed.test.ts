import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, feedPostsTable } from "@workspace/db";
import feedRouter from "../src/routes/feed.ts";

type ResponseCapture = {
  statusCode: number;
  body?: any;
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

function routeHandler(method: string, path: string): (req: any, res: any) => Promise<void> {
  const layer = (feedRouter as any).stack.find(
    (entry: any) => entry.route?.path === path && entry.route.methods[method],
  );
  assert.ok(layer, `Route ${method.toUpperCase()} ${path} introuvable`);
  return layer.route.stack.at(-1).handle;
}

test("feed post retries are idempotent and use the authenticated identity", async () => {
  const authorId = `feed-${randomUUID()}`;
  const clientPostId = randomUUID();
  const createPost = routeHandler("post", "/feed/posts");

  try {
    const first = responseCapture();
    const retry = responseCapture();
    await Promise.all([createPost({
      body: {
        clientPostId,
        community: "Zarma-Songhai",
        city: "Niamey",
        authorName: "Nom fourni par le client",
        caption: "Conseil local pour choisir un logement adapté à sa famille.",
      },
      userId: authorId,
      userName: "Auteur Firebase",
    }, first), createPost({
      body: {
        clientPostId,
        community: "Zarma-Songhai",
        city: "Niamey",
        caption: "Cette seconde requête ne doit pas créer un doublon.",
      },
      userId: authorId,
      userName: "Auteur Firebase",
    }, retry)]);
    assert.equal(first.statusCode, 201);
    assert.equal(retry.statusCode, 201);
    assert.equal(first.body.authorName, "Auteur Firebase");
    assert.equal("authorId" in first.body, false);
    assert.equal(retry.body.id, first.body.id);
    assert.equal(retry.body.caption, first.body.caption);

    const rows = await db.select().from(feedPostsTable)
      .where(eq(feedPostsTable.authorId, authorId));
    assert.equal(rows.length, 1);
  } finally {
    await db.delete(feedPostsTable).where(eq(feedPostsTable.authorId, authorId));
  }
});

test("feed creation requires Firebase authentication", async () => {
  const route = (feedRouter as any).stack.find(
    (entry: any) => entry.route?.path === "/feed/posts" && entry.route.methods.post,
  );
  assert.ok(route);
  const requireAuthentication = route.route.stack[0].handle;
  const response = responseCapture();
  await requireAuthentication({ header: () => undefined }, response);
  assert.equal(response.statusCode, 401);
});

test("feed rejects public contact details", async () => {
  const createPost = routeHandler("post", "/feed/posts");
  const response = responseCapture();
  await createPost({
    body: {
      clientPostId: randomUUID(),
      community: "Autre",
      city: "Niamey",
      caption: "Appelez-moi au 90123456 pour cette offre.",
    },
    userId: `feed-${randomUUID()}`,
    userName: "Auteur Firebase",
  }, response);
  assert.equal(response.statusCode, 400);
});

test("feed rejects fields that are empty after normalization", async () => {
  const createPost = routeHandler("post", "/feed/posts");
  for (const field of ["caption", "community", "city"] as const) {
    const response = responseCapture();
    await createPost({
      body: {
        clientPostId: randomUUID(),
        community: "Autre",
        city: "Niamey",
        caption: "Conseil utile pour la communauté.",
        [field]: "   ",
      },
      userId: `feed-${randomUUID()}`,
      userName: "Auteur Firebase",
    }, response);
    assert.equal(response.statusCode, 400, `${field} doit être refusé`);
  }
});
