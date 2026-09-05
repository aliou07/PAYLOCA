import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { eq } from "drizzle-orm";
import { accountTypesTable, db } from "@workspace/db";
import storageRouter, { canAccessFunMedia } from "../src/routes/storage.ts";

function responseCapture() {
  const response = {
    statusCode: 200,
    body: undefined as any,
    status(code: number) {
      response.statusCode = code;
      return response;
    },
    json(body: unknown) {
      response.body = body;
      return response;
    },
  };
  return response;
}

test("les fichiers FUN restent réservés aux comptes utilisateur", async () => {
  const userWithBirthDateId = `user-media-${randomUUID()}`;
  const userWithoutBirthDateId = `user-no-birth-media-${randomUUID()}`;
  const agencyId = `agency-media-${randomUUID()}`;
  const ids = [userWithBirthDateId, userWithoutBirthDateId, agencyId];
  try {
    await db.insert(accountTypesTable).values([
      { userId: userWithBirthDateId, accountType: "user", dateOfBirth: "2000-01-01" },
      { userId: userWithoutBirthDateId, accountType: "user", dateOfBirth: null },
      { userId: agencyId, accountType: "agency", dateOfBirth: "2000-01-01" },
    ]);
    assert.equal(await canAccessFunMedia(userWithBirthDateId), true);
    assert.equal(await canAccessFunMedia(userWithoutBirthDateId), true);
    assert.equal(await canAccessFunMedia(agencyId), false);
    assert.equal(await canAccessFunMedia(`unknown-${randomUUID()}`), false);
  } finally {
    for (const userId of ids) {
      await db.delete(accountTypesTable).where(eq(accountTypesTable.userId, userId));
    }
  }
});

test("un compte agence ne peut pas demander une URL d’envoi vidéo FUN", async () => {
  const layer = (storageRouter as any).stack.find(
    (entry: any) => entry.route?.path === "/storage/uploads/fun-video/request-url" && entry.route.methods.post,
  );
  assert.ok(layer);
  const response = responseCapture();
  await layer.route.stack.at(-1).handle({
    accountType: "agency",
    body: { name: "test.mp4", contentType: "video/mp4", size: 1024 },
  }, response);
  assert.equal(response.statusCode, 403);
  assert.equal(response.body.code, "USER_ACCOUNT_REQUIRED");
});
