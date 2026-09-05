import assert from "node:assert/strict";
import test from "node:test";
import { requireAccountType } from "../src/middlewares/requireAuth.ts";

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

test("seule une agence peut utiliser les permissions de publication", () => {
  const agencyResponse = responseCapture();
  assert.equal(requireAccountType({ accountTypeLoaded: true, accountType: "agency" } as any, agencyResponse as any, ["agency"]), true);
  assert.equal(agencyResponse.statusCode, 200);

  for (const accountType of ["user", "ong"] as const) {
    const response = responseCapture();
    assert.equal(requireAccountType({ accountTypeLoaded: true, accountType } as any, response as any, ["agency"]), false);
    assert.equal(response.statusCode, 403);
    assert.deepEqual(response.body, {
      error: "Cet espace n’est pas disponible pour votre type de compte.",
      code: "ACCOUNT_TYPE_FORBIDDEN",
    });
  }
});

test("un compte existant sans espace doit le choisir avant une action protégée", () => {
  const response = responseCapture();
  assert.equal(requireAccountType({ accountTypeLoaded: true, accountType: null } as any, response as any, ["agency"]), false);
  assert.equal(response.statusCode, 409);
  assert.deepEqual(response.body, {
    error: "Choisissez d’abord votre espace PAYLOCA.",
    code: "ACCOUNT_TYPE_REQUIRED",
  });
});
