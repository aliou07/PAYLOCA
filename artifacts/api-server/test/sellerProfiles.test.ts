import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import {
  db,
  sellerProfilesTable,
  sellerReportsTable,
  sellerShopsTable,
  sellerVerificationRequestsTable,
  storedImagesTable,
} from "@workspace/db";
import sellerProfilesRouter from "../src/routes/sellerProfiles.ts";
import { isPublicSellerImage } from "../src/routes/storage.ts";

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
  const layer = (sellerProfilesRouter as any).stack.find(
    (entry: any) => entry.route?.path === path && entry.route.methods[method],
  );
  assert.ok(layer, `Route ${method.toUpperCase()} ${path} introuvable`);
  return layer.route.stack.at(-1).handle;
}

test("seller verification is moderator-approved and reports never auto-ban", async () => {
  const sellerId = `seller-${randomUUID()}`;
  const reporterId = `reporter-${randomUUID()}`;
  const createVerification = routeHandler("post", "/seller-verification-requests");
  const moderateVerification = routeHandler("patch", "/seller-verification-requests/:id");
  const createReport = routeHandler("post", "/seller-reports");
  const updateProfile = routeHandler("put", "/seller-profile/me");
  const publicImagePath = `/objects/${randomUUID()}`;
  const foreignImagePath = `/objects/${randomUUID()}`;

  try {
    const verificationResponse = responseCapture();
    await createVerification({
      body: { details: "Je vends des biens à Niamey et je suis disponible pour une visite." },
      userId: sellerId,
      userName: "Vendeur test",
    }, verificationResponse);
    assert.equal(verificationResponse.statusCode, 201);
    assert.equal(verificationResponse.body.status, "pending");

    const [pendingProfile] = await db.select().from(sellerProfilesTable)
      .where(eq(sellerProfilesTable.userId, sellerId));
    assert.equal(pendingProfile.verificationStatus, "pending");
    assert.equal(pendingProfile.verifiedAt, null);

    const moderationResponse = responseCapture();
    await moderateVerification({
      params: { id: String(verificationResponse.body.id) },
      body: { status: "approved" },
      userId: "firebase-moderator",
    }, moderationResponse);
    assert.equal(moderationResponse.statusCode, 200);
    assert.equal(moderationResponse.body.status, "approved");

    const [approvedProfile] = await db.select().from(sellerProfilesTable)
      .where(eq(sellerProfilesTable.userId, sellerId));
    assert.equal(approvedProfile.verificationStatus, "approved");
    assert.ok(approvedProfile.verifiedAt instanceof Date);

    const reportResponse = responseCapture();
    await createReport({
      body: { targetUserId: sellerId, reason: "fausse_annonce", details: "Annonce à vérifier manuellement." },
      userId: reporterId,
    }, reportResponse);
    assert.equal(reportResponse.statusCode, 201);
    assert.equal(reportResponse.body.status, "pending");

    const duplicateResponse = responseCapture();
    await createReport({
      body: { targetUserId: sellerId, reason: "fraude", details: "Second signalement du même compte." },
      userId: reporterId,
    }, duplicateResponse);
    assert.equal(duplicateResponse.statusCode, 409);

    const [stillApproved] = await db.select().from(sellerProfilesTable)
      .where(eq(sellerProfilesTable.userId, sellerId));
    assert.equal(stillApproved.verificationStatus, "approved");
    assert.ok(stillApproved.verifiedAt instanceof Date);

    await db.insert(storedImagesTable).values([
      { objectPath: publicImagePath, ownerId: sellerId, sellerProfileOwnerId: sellerId, contentType: "image/png", size: 100 },
      { objectPath: foreignImagePath, ownerId: "another-user", contentType: "image/png", size: 100 },
    ]);
    await db.update(sellerProfilesTable).set({ avatarUrl: publicImagePath })
      .where(eq(sellerProfilesTable.userId, sellerId));
    assert.equal(await isPublicSellerImage(publicImagePath, sellerId), true);
    assert.equal(await isPublicSellerImage(publicImagePath, "another-user"), false);
    assert.equal(await isPublicSellerImage(`/objects/${randomUUID()}`, sellerId), false);

    const foreignImageResponse = responseCapture();
    await updateProfile({
      body: {
        displayName: "Vendeur test",
        bio: "Une activité locale présentée sans coordonnées publiques.",
        city: "Niamey",
        avatarUrl: foreignImagePath,
        shopName: "Boutique test",
        shopDescription: "Une boutique locale.",
        categories: ["Maison"],
      },
      userId: sellerId,
      userName: "Vendeur test",
    }, foreignImageResponse);
    assert.equal(foreignImageResponse.statusCode, 403);
  } finally {
    await db.delete(sellerReportsTable).where(eq(sellerReportsTable.targetUserId, sellerId));
    await db.delete(sellerVerificationRequestsTable).where(eq(sellerVerificationRequestsTable.userId, sellerId));
    await db.delete(sellerShopsTable).where(eq(sellerShopsTable.ownerId, sellerId));
    await db.delete(sellerProfilesTable).where(eq(sellerProfilesTable.userId, sellerId));
    await db.delete(storedImagesTable).where(eq(storedImagesTable.objectPath, publicImagePath));
    await db.delete(storedImagesTable).where(eq(storedImagesTable.objectPath, foreignImagePath));
  }
});

test("only one concurrent moderator decision can change a verification badge", async () => {
  const sellerId = `seller-race-${randomUUID()}`;
  const createVerification = routeHandler("post", "/seller-verification-requests");
  const moderateVerification = routeHandler("patch", "/seller-verification-requests/:id");

  try {
    const verificationResponse = responseCapture();
    await createVerification({
      body: { details: "Activité présentée pour un examen manuel du profil à Niamey." },
      userId: sellerId,
      userName: "Vendeur concurrence",
    }, verificationResponse);

    const approved = responseCapture();
    const rejected = responseCapture();
    await Promise.all([
      moderateVerification({
        params: { id: String(verificationResponse.body.id) },
        body: { status: "approved" },
        userId: "moderator-one",
      }, approved),
      moderateVerification({
        params: { id: String(verificationResponse.body.id) },
        body: { status: "rejected", moderationNote: "Informations insuffisantes." },
        userId: "moderator-two",
      }, rejected),
    ]);
    assert.deepEqual([approved.statusCode, rejected.statusCode].sort(), [200, 409]);

    const [request] = await db.select().from(sellerVerificationRequestsTable)
      .where(eq(sellerVerificationRequestsTable.id, verificationResponse.body.id));
    const [profile] = await db.select().from(sellerProfilesTable)
      .where(eq(sellerProfilesTable.userId, sellerId));
    assert.equal(profile.verificationStatus, request.status);
    assert.equal(Boolean(profile.verifiedAt), request.status === "approved");
  } finally {
    await db.delete(sellerVerificationRequestsTable).where(eq(sellerVerificationRequestsTable.userId, sellerId));
    await db.delete(sellerShopsTable).where(eq(sellerShopsTable.ownerId, sellerId));
    await db.delete(sellerProfilesTable).where(eq(sellerProfilesTable.userId, sellerId));
  }
});

test("seller verification copy does not claim identity proof or an in-person review", () => {
  const page = readFileSync(resolve(process.cwd(), "../niger-habitat/src/pages/seller-profile.tsx"), "utf8");
  const openApi = readFileSync(resolve(process.cwd(), "../../lib/api-spec/openapi.yaml"), "utf8");
  const forbidden = /validation manuelle de votre identité|contrôle sur place|nous rencontrer|in-person seller verification/i;
  assert.doesNotMatch(page, forbidden);
  assert.doesNotMatch(openApi, forbidden);
});
