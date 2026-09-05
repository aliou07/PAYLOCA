import assert from "node:assert/strict";
import test from "node:test";
import { requireUserAccount, requireUserVip } from "../src/middlewares/requireAuth.ts";

function responseCapture() {
  const response = {
    statusCode: 200,
    body: undefined as unknown,
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

test("le compte utilisateur peut accéder à FUN sans critère d’âge", () => {
  const response = responseCapture();
  assert.equal(requireUserAccount({ accountType: "user" } as any, response as any), true);
  assert.equal(response.statusCode, 200);
});

test("les autres rôles ne peuvent pas accéder aux fonctionnalités utilisateur", () => {
  for (const accountType of ["agency", "ong", null]) {
    const response = responseCapture();
    assert.equal(requireUserAccount({ accountType } as any, response as any), false);
    assert.equal(response.statusCode, 403);
    assert.equal((response.body as any).code, "USER_ACCOUNT_REQUIRED");
  }
});

test("les candidatures restent réservées à un compte utilisateur VIP", () => {
  const bronzeResponse = responseCapture();
  assert.equal(requireUserVip({
    accountTypeLoaded: true,
    accountType: "user",
    membershipStatus: "VIP_BRONZE",
  } as any, bronzeResponse as any), true);

  const standardResponse = responseCapture();
  assert.equal(requireUserVip({
    accountTypeLoaded: true,
    accountType: "user",
    membershipStatus: "STANDARD",
  } as any, standardResponse as any), false);
  assert.equal(standardResponse.statusCode, 403);
  assert.equal((standardResponse.body as any).code, "USER_FEATURE_SUBSCRIPTION_REQUIRED");
});
