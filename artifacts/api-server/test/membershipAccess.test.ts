import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { randomUUID } from "node:crypto";
import { db, giftsTable, listingsTable, membershipsTable, paymentEventsTable, pool } from "@workspace/db";
import { eq } from "drizzle-orm";
import { createHmac } from "node:crypto";
import { buildMynitaPaymentPayload, getMynitaRedirectUrl, getOrCreateMembership, paidPlans } from "../src/lib/membership.ts";
import { applyVerifiedGiftPayment, giftPlans, redeemGift } from "../src/lib/gifts.ts";
import listingsRouter, { normalizeNigerPhone } from "../src/routes/listings.ts";
import { isValidNigerPhone } from "../src/middlewares/requireAuth.ts";
import messagingRouter from "../src/routes/messaging.ts";
import membershipRouter from "../src/routes/membership.ts";

type ResponseCapture = {
  statusCode: number;
  body?: unknown;
  status: (code: number) => ResponseCapture;
  json: (body: unknown) => ResponseCapture;
  end: () => ResponseCapture;
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
    end() {
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
  // Protected routes have requireAuth before the handler; public routes do not.
  return (layer.route.stack[1] ?? layer.route.stack[0]).handle;
}

function membershipRoute(method: string, path: string) {
  return routeHandler(membershipRouter, method, path);
}

const paymentRequest = {
  body: { plan: "VIP_BRONZE", durationMonths: 1 },
  userId: "payment-start-user",
  userName: "Client test",
  log: { warn() {}, error() {} },
};

function expiredRequest() {
  return {
    body: {},
    params: { id: "1" },
    membershipStatus: "LECTURE_GRATUITE",
    userId: "expired-user",
    userName: "Utilisateur expiré",
    age: 30,
  };
}

before(async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS payloca_memberships (
      user_id text PRIMARY KEY,
      registered_at timestamptz NOT NULL DEFAULT now(),
      trial_ends_at timestamptz NOT NULL,
      status text NOT NULL DEFAULT 'ESSAI_VIP_GRATUIT'
    )
  `);
  await pool.query(`ALTER TABLE payloca_memberships ADD COLUMN IF NOT EXISTS boosts_used integer NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE payloca_memberships ADD COLUMN IF NOT EXISTS boosts_period_started_at timestamptz NOT NULL DEFAULT now()`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS listings (
      id serial PRIMARY KEY,
      title text NOT NULL,
      type text NOT NULL,
      city text NOT NULL,
      neighborhood text NOT NULL,
      price integer NOT NULL,
      bedrooms integer NOT NULL DEFAULT 0,
      image_url text NOT NULL,
      verified boolean NOT NULL DEFAULT false,
      description text NOT NULL,
      contact text,
      filtre text,
      owner_name text NOT NULL,
      owner_id text,
      status text NOT NULL DEFAULT 'libre',
      launch_free_until timestamptz NOT NULL DEFAULT now(),
      premium_until timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`ALTER TABLE listings ADD COLUMN IF NOT EXISTS contact text`);
  await pool.query(`ALTER TABLE listings ADD COLUMN IF NOT EXISTS filtre text`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS payloca_payment_events (
      transaction_id text PRIMARY KEY,
      mynita_transaction_id text,
      user_id text NOT NULL,
      plan text NOT NULL,
      amount integer NOT NULL,
      status text NOT NULL,
      processed_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    ALTER TABLE payloca_payment_events
    ADD COLUMN IF NOT EXISTS mynita_transaction_id text
  `);
  await pool.query(`ALTER TABLE payloca_payment_events ADD COLUMN IF NOT EXISTS duration_months integer NOT NULL DEFAULT 1`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS payloca_gifts (
      id text PRIMARY KEY,
      from_user_id text NOT NULL,
      to_phone text NOT NULL,
      plan text NOT NULL,
      amount integer NOT NULL,
      duration_months integer NOT NULL DEFAULT 1,
      status text NOT NULL DEFAULT 'PENDING_PAYMENT',
      code text NOT NULL UNIQUE,
      transaction_id text NOT NULL UNIQUE,
      mynita_transaction_id text,
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      paid_at timestamptz,
      redeemed_at timestamptz,
      redeemed_by_user_id text
    )
  `);
});

test("construit le payload Mynita avec montant, référence, devise et retour HTTPS", () => {
  const payload = buildMynitaPaymentPayload({
    transactionId: "PAYLOCA_test-reference",
    userId: "user-test",
    userName: "Client test",
    plan: "VIP_BRONZE",
    durationMonths: 1,
    callbackUrl: "https://payloca.example/api/membership/payment-return",
    cancelUrl: "https://payloca.example/paiement-annule",
  });
  assert.deepEqual(payload, {
    reference: "PAYLOCA_test-reference",
    transactionId: "PAYLOCA_test-reference",
    amount: paidPlans.VIP_BRONZE.options[1].amount,
    currency: "XOF",
    durationMonths: 1,
    plan: "VIP_BRONZE",
    userId: "user-test",
    customer: { name: "Client test" },
    callbackUrl: "https://payloca.example/api/membership/payment-return",
    cancelUrl: "https://payloca.example/paiement-annule",
  });
  assert.throws(() => buildMynitaPaymentPayload({
    transactionId: "PAYLOCA_bad",
    userId: "user-test",
    userName: "Client test",
    plan: "VIP_BRONZE",
    callbackUrl: "http://payloca.example/return",
  }), /HTTPS/);
});

test("reconnaît les caisses Mynita directes et dans data, mais refuse une URL invalide", () => {
  assert.equal(getMynitaRedirectUrl({ redirectUrl: "https://mynita.example/checkout/1" }), "https://mynita.example/checkout/1");
  assert.equal(getMynitaRedirectUrl({ data: { checkoutUrl: "https://mynita.example/checkout/2" } }), "https://mynita.example/checkout/2");
  assert.equal(getMynitaRedirectUrl({ checkoutUrl: "javascript:alert(1)" }), undefined);
});

test("accepte une caisse Mynita, mais refuse un refus ou une réponse sans URL", async () => {
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;
  process.env.PAYMENT_MODE = "REEL";
  process.env.MYNITA_PAYMENT_URL = "https://mynita.example/api/payments";
  process.env.MYNITA_API_KEY = "test-api-key";
  process.env.PAYLOCA_PAYMENT_RETURN_URL = "https://payloca.example/api/membership/payment-return";
  const requests: any[] = [];
  globalThis.fetch = async (_url, init) => {
    requests.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ data: { checkoutUrl: "https://mynita.example/checkout/test" } }), { status: 201 });
  };
  try {
    const success = responseCapture();
    await membershipRoute("post", "/membership/payment")({ ...paymentRequest }, success);
    assert.equal(success.statusCode, 201);
    assert.match((success.body as any).redirectUrl, /^https:\/\//);
    assert.equal(requests[0].amount, 500);
    assert.equal(requests[0].currency, "XOF");
    assert.equal(requests[0].reference, requests[0].transactionId);
    assert.equal(requests[0].callbackUrl, process.env.PAYLOCA_PAYMENT_RETURN_URL);

    globalThis.fetch = async () => new Response(JSON.stringify({ error: "declined" }), { status: 402 });
    const refused = responseCapture();
    await membershipRoute("post", "/membership/payment")({ ...paymentRequest }, refused);
    assert.equal(refused.statusCode, 502);
    assert.match((refused.body as any).error, /Aucun droit/);

    globalThis.fetch = async () => new Response(JSON.stringify({ status: "created" }), { status: 201 });
    const missingUrl = responseCapture();
    await membershipRoute("post", "/membership/payment")({ ...paymentRequest }, missingUrl);
    assert.equal(missingUrl.statusCode, 502);
    assert.match((missingUrl.body as any).error, /Aucun droit/);
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
  }
});

test("un retour Mynita non signé ne peut pas activer l’abonnement", async () => {
  const userId = `payment-unsigned-${randomUUID()}`;
  const transactionId = `PAYLOCA_${randomUUID()}`;
  try {
    await db.insert(membershipsTable).values({ userId, trialEndsAt: new Date(Date.now() + 86400000), status: "LECTURE_GRATUITE" });
    const response = responseCapture();
    await membershipRoute("post", "/membership/payment-return")({
       body: { userId, transactionId, plan: "VIP_BRONZE", amount: 500, durationMonths: 1, status: "SUCCEEDED", currency: "XOF" },
      header: () => undefined,
    }, response);
    assert.equal(response.statusCode, 401);
    const [membership] = await db.select().from(membershipsTable).where(eq(membershipsTable.userId, userId));
    assert.equal(membership?.status, "LECTURE_GRATUITE");
  } finally {
    await db.delete(paymentEventsTable).where(eq(paymentEventsTable.transactionId, transactionId));
    await db.delete(membershipsTable).where(eq(membershipsTable.userId, userId));
  }
});

test("un retour Mynita signé active le forfait et reste idempotent", async () => {
  const userId = `payment-signed-${randomUUID()}`;
  const transactionId = `PAYLOCA_${randomUUID()}`;
  const body = { userId, transactionId, plan: "VIP_BRONZE", amount: 500, durationMonths: 1, status: "SUCCEEDED", currency: "XOF" };
  const rawBody = Buffer.from(JSON.stringify(body));
  const secret = "test-webhook-secret";
  const signature = createHmac("sha256", secret).update(rawBody).digest("hex");
  const request = () => ({ body, rawBody, header: (name: string) => name === "x-payment-signature" ? signature : undefined });
  process.env.PAYLOCA_PAYMENT_WEBHOOK_SECRET = secret;
  try {
    await db.insert(membershipsTable).values({ userId, trialEndsAt: new Date(Date.now() + 86400000), status: "LECTURE_GRATUITE" });
    const first = responseCapture();
    await membershipRoute("post", "/membership/payment-return")(request(), first);
    assert.equal(first.statusCode, 200);
    assert.equal((first.body as any).applied, true);
    const second = responseCapture();
    await membershipRoute("post", "/membership/payment-return")(request(), second);
    assert.equal(second.statusCode, 200);
    assert.equal((second.body as any).applied, false);
    const [membership] = await db.select().from(membershipsTable).where(eq(membershipsTable.userId, userId));
    assert.equal(membership?.status, "VIP_BRONZE");
  } finally {
    delete process.env.PAYLOCA_PAYMENT_WEBHOOK_SECRET;
    await db.delete(paymentEventsTable).where(eq(paymentEventsTable.transactionId, transactionId));
    await db.delete(membershipsTable).where(eq(membershipsTable.userId, userId));
  }
});

test("un retour signé dans une autre devise est refusé sans activation", async () => {
  const userId = `payment-currency-${randomUUID()}`;
  const transactionId = `PAYLOCA_${randomUUID()}`;
  const body = { userId, transactionId, plan: "VIP_BRONZE", amount: 500, durationMonths: 1, status: "SUCCEEDED", currency: "EUR" };
  const rawBody = Buffer.from(JSON.stringify(body));
  process.env.PAYLOCA_PAYMENT_WEBHOOK_SECRET = "test-webhook-secret";
  const signature = createHmac("sha256", process.env.PAYLOCA_PAYMENT_WEBHOOK_SECRET).update(rawBody).digest("hex");
  try {
    await db.insert(membershipsTable).values({ userId, trialEndsAt: new Date(Date.now() + 86400000), status: "LECTURE_GRATUITE" });
    const response = responseCapture();
    await membershipRoute("post", "/membership/payment-return")({
      body, rawBody, header: () => signature,
    }, response);
    assert.equal(response.statusCode, 400);
    const [membership] = await db.select().from(membershipsTable).where(eq(membershipsTable.userId, userId));
    assert.equal(membership?.status, "LECTURE_GRATUITE");
  } finally {
    delete process.env.PAYLOCA_PAYMENT_WEBHOOK_SECRET;
    await db.delete(paymentEventsTable).where(eq(paymentEventsTable.transactionId, transactionId));
    await db.delete(membershipsTable).where(eq(membershipsTable.userId, userId));
  }
});

test("crée un compte avec les trois valeurs d'abonnement persistées", async () => {
  const userId = `membership-${randomUUID()}`;
  try {
    const membership = await getOrCreateMembership(userId);
    assert.equal(membership.status, "ESSAI_VIP_GRATUIT");
    assert.equal(membership.isVip, true);
    assert.ok(membership.trialEndsAt instanceof Date);
    assert.ok(membership.trialEndsAt.getTime() > Date.now());

    const [persisted] = await db.select().from(membershipsTable).where(eq(membershipsTable.userId, userId));
    assert.ok(persisted);
    assert.ok(persisted.registeredAt instanceof Date);
    assert.equal(persisted.status, "ESSAI_VIP_GRATUIT");
    assert.equal(persisted.trialEndsAt.getTime(), membership.trialEndsAt.getTime());
  } finally {
    await db.delete(membershipsTable).where(eq(membershipsTable.userId, userId));
  }
});

test("bascule côté serveur un essai expiré vers LECTURE_GRATUITE", async () => {
  const userId = `expired-${randomUUID()}`;
  const expiredAt = new Date(Date.now() - 60_000);
  try {
    await db.insert(membershipsTable).values({
      userId,
      trialEndsAt: expiredAt,
      status: "ESSAI_VIP_GRATUIT",
    });

    const membership = await getOrCreateMembership(userId);
    assert.equal(membership.status, "LECTURE_GRATUITE");
    assert.equal(membership.isVip, false);
    assert.equal(membership.trialEndsAt.getTime(), expiredAt.getTime());

    const [persisted] = await db.select().from(membershipsTable).where(eq(membershipsTable.userId, userId));
    assert.equal(persisted?.status, "LECTURE_GRATUITE");
  } finally {
    await db.delete(membershipsTable).where(eq(membershipsTable.userId, userId));
  }
});

test("deux lectures concurrentes d'un essai expiré restent en LECTURE_GRATUITE", async () => {
  const userId = `concurrent-expired-${randomUUID()}`;
  const expiredAt = new Date(Date.now() - 60_000);
  try {
    await db.insert(membershipsTable).values({
      userId,
      trialEndsAt: expiredAt,
      status: "ESSAI_VIP_GRATUIT",
    });

    const memberships = await Promise.all([
      getOrCreateMembership(userId),
      getOrCreateMembership(userId),
    ]);

    assert.deepEqual(
      memberships.map(({ status, isVip }) => ({ status, isVip })),
      [
        { status: "LECTURE_GRATUITE", isVip: false },
        { status: "LECTURE_GRATUITE", isVip: false },
      ],
    );
    const [persisted] = await db.select().from(membershipsTable).where(eq(membershipsTable.userId, userId));
    assert.equal(persisted?.status, "LECTURE_GRATUITE");
  } finally {
    await db.delete(membershipsTable).where(eq(membershipsTable.userId, userId));
  }
});

test("retourne 403 pour publier, ouvrir une conversation et envoyer un message après expiration", async () => {
  const cases = [
    [listingsRouter, "post", "/listings", "publication"],
    [messagingRouter, "post", "/conversations", "ouverture de conversation"],
    [messagingRouter, "post", "/conversations/:id/messages", "envoi de message"],
  ] as const;

  for (const [router, method, path, label] of cases) {
    const response = responseCapture();
    await routeHandler(router, method, path)(expiredRequest(), response);
    assert.equal(response.statusCode, 403, `Le ${label} doit être bloqué`);
    assert.deepEqual(response.body, {
      error: "Votre essai VIP est terminé. Choisissez un abonnement pour publier et envoyer des messages.",
      code: "SUBSCRIPTION_REQUIRED",
    });
  }
});

test("la lecture publique conserve les annonces historiques", async () => {
  const [listing] = await db.insert(listingsTable).values({
    title: "Annonce historique de test",
    type: "house",
    city: `TestVille-${randomUUID()}`,
    neighborhood: "Test",
    price: 100000,
    imageUrl: "/objects/uploads/historical-test.jpg",
    verified: true,
    description: "Annonce conservée après expiration.",
    ownerName: "Ancien membre",
    ownerId: `owner-${randomUUID()}`,
    status: "actif",
  }).returning();
  assert.ok(listing);

  try {
    const response = responseCapture();
    await routeHandler(listingsRouter, "get", "/listings")(
      { query: { type: "all", city: listing.city }, age: 30 },
      response,
    );
    assert.equal(response.statusCode, 200);
    assert.ok(Array.isArray(response.body));
    assert.ok((response.body as any[]).some((item) => item.id === listing.id));
  } finally {
    await db.delete(listingsTable).where(eq(listingsTable.id, listing.id));
  }
});

test("un boost répété pendant les 7 jours actifs ne consomme pas un crédit", async () => {
  const userId = `boost-idempotent-${randomUUID()}`;
  const [membership] = await db.insert(membershipsTable).values({
    userId,
    trialEndsAt: new Date(Date.now() + 86_400_000),
    status: "VIP_BRONZE",
    boostsUsed: 0,
  }).returning();
  const [listing] = await db.insert(listingsTable).values({
    title: "Annonce déjà mise en avant",
    type: "house",
    city: `TestVille-${randomUUID()}`,
    neighborhood: "Test",
    price: 100000,
    bedrooms: 2,
    imageUrl: "/objects/uploads/boost-idempotent.jpg",
    verified: true,
    description: "Annonce pour vérifier qu’un double clic ne consomme pas deux crédits.",
    ownerName: "Propriétaire test",
    ownerId: userId,
    status: "actif",
    premiumUntil: new Date(Date.now() + 3 * 86_400_000),
  }).returning();
  assert.ok(membership && listing);
  try {
    const response = responseCapture();
    await routeHandler(listingsRouter, "post", "/listings/:id/boost")({
      params: { id: String(listing.id) },
      userId,
      age: 30,
    }, response);
    assert.equal(response.statusCode, 200);
    assert.equal((response.body as any).alreadyActive, true);
    assert.equal((response.body as any).boostsRemaining, 20);
    const [persistedMembership] = await db.select().from(membershipsTable).where(eq(membershipsTable.userId, userId));
    assert.equal(persistedMembership.boostsUsed, 0);
  } finally {
    await db.delete(listingsTable).where(eq(listingsTable.id, listing.id));
    await db.delete(membershipsTable).where(eq(membershipsTable.userId, userId));
  }
});

test("normalise uniquement les numéros nigériens", () => {
  assert.equal(normalizeNigerPhone("+227 90 12 34 56"), "+22790123456");
  assert.equal(normalizeNigerPhone("90-12-34-56"), "+22790123456");
  assert.equal(normalizeNigerPhone("+225 90 12 34 56"), "");
  assert.equal(normalizeNigerPhone("90 12 34"), "");
  assert.equal(normalizeNigerPhone("abc90123456"), "");
});

test("n’autorise côté authentification que les téléphones nigériens vérifiés", () => {
  assert.equal(isValidNigerPhone("+22790123456"), true);
  assert.equal(isValidNigerPhone("+22590123456"), false);
  assert.equal(isValidNigerPhone("90123456"), false);
  assert.equal(isValidNigerPhone(undefined), false);
});

test("refuse un contact invalide avant toute tentative de stockage de photo", async () => {
  const request = {
    body: {
      title: "Maison de validation",
      type: "house",
      city: "Niamey",
      neighborhood: "Test",
      price: 100000,
      bedrooms: 2,
      imageUrl: "/objects/uploads/not-used.jpg",
      description: "Description de validation.",
      contact: "+225 90 12 34 56",
    },
    userId: `user-${randomUUID()}`,
    userName: "Membre test",
    membershipStatus: "BOSS_VIP",
    age: 30,
  };
  const response = responseCapture();
  await routeHandler(listingsRouter, "post", "/listings")(request, response);
  assert.equal(response.statusCode, 400);
  assert.match(String((response.body as any).error), /numéro nigérien valide/);
});

test("refuse un contact invalide lors de la modification", async () => {
  const response = responseCapture();
  await routeHandler(listingsRouter, "patch", "/listings/:id")({
    body: { contact: "12345" },
    params: { id: "1" },
    userId: `user-${randomUUID()}`,
    membershipStatus: "BOSS_VIP",
    age: 30,
  }, response);
  assert.equal(response.statusCode, 400);
  assert.match(String((response.body as any).error), /numéro nigérien valide/);
});

test("la lecture publique expose contact et filtre sans casser les annonces historiques", async () => {
  const [listing] = await db.insert(listingsTable).values({
    title: "Annonce contact test",
    type: "house",
    city: `TestVille-${randomUUID()}`,
    neighborhood: "Test",
    price: 100000,
    imageUrl: "/objects/uploads/contact-test.jpg",
    verified: false,
    description: "Annonce avec contact.",
    contact: "+22790123456",
    filtre: "pro",
    ownerName: "Membre test",
    ownerId: `owner-${randomUUID()}`,
    status: "libre",
  }).returning();
  assert.ok(listing);

  try {
    const response = responseCapture();
    await routeHandler(listingsRouter, "get", "/listings/:id")(
      { params: { id: String(listing.id) }, age: 30 },
      response,
    );
    assert.equal(response.statusCode, 200);
    assert.equal((response.body as any).contact, "+22790123456");
    assert.equal((response.body as any).filtre, "pro");
  } finally {
    await db.delete(listingsTable).where(eq(listingsTable.id, listing.id));
  }
});

test("les cadeaux VIP appliquent les tarifs et durées annoncés", () => {
  assert.deepEqual(giftPlans, {
    VIP_BRONZE: {
      monthlyAmount: 500,
      options: {
        1: { amount: 500, durationMonths: 1 },
        2: { amount: 1000, durationMonths: 2 },
        4: { amount: 2000, durationMonths: 4 },
      },
    },
    VIP_OR: {
      monthlyAmount: 1000,
      options: {
        1: { amount: 1000, durationMonths: 1 },
        2: { amount: 2000, durationMonths: 2 },
        4: { amount: 4000, durationMonths: 4 },
      },
    },
  });
});

test("un paiement cadeau signé est idempotent et crée un code activable", async () => {
  const giftId = `GIFT_${randomUUID()}`;
  const transactionId = `PAYLOCA_GIFT_${randomUUID()}`;
  const toPhone = "+22790123456";
  try {
    await db.insert(giftsTable).values({
      id: giftId,
      fromUserId: `sender-${randomUUID()}`,
      toPhone,
      plan: "VIP_BRONZE",
      amount: 500,
      durationMonths: 1,
      status: "PENDING_PAYMENT",
      code: `ABCD-${randomUUID().slice(0, 4).toUpperCase()}-${randomUUID().slice(0, 4).toUpperCase()}`,
      transactionId,
      expiresAt: new Date(Date.now() + 86400000),
    });
    const first = await applyVerifiedGiftPayment({
      giftId,
      transactionId,
      plan: "VIP_BRONZE",
      amount: 500,
      mynitaTransactionId: "mynita-gift-1",
    });
    const second = await applyVerifiedGiftPayment({
      giftId,
      transactionId,
      plan: "VIP_BRONZE",
      amount: 500,
      mynitaTransactionId: "mynita-gift-1",
    });
    assert.equal(first.applied, true);
    assert.equal(second.applied, false);
    assert.equal(first.gift.status, "PAID");
    assert.equal(first.gift.mynitaTransactionId, "mynita-gift-1");
    assert.match(first.gift.code, /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  } finally {
    await db.delete(giftsTable).where(eq(giftsTable.id, giftId));
  }
});

test("un cadeau ne peut être activé que par son numéro vérifié et une seule fois", async () => {
  const giftId = `GIFT_${randomUUID()}`;
  const beneficiaryId = `gift-beneficiary-${randomUUID()}`;
  const senderId = `gift-sender-${randomUUID()}`;
  const code = `WXYZ-${randomUUID().slice(0, 8).toUpperCase()}`;
  try {
    await db.insert(membershipsTable).values({
      userId: beneficiaryId,
      trialEndsAt: new Date(Date.now() - 86400000),
      status: "LECTURE_GRATUITE",
    });
    await db.insert(giftsTable).values({
      id: giftId,
      fromUserId: senderId,
      toPhone: "+22790123456",
      plan: "VIP_OR",
      amount: 500,
      durationMonths: 1,
      status: "PAID",
      code,
      transactionId: `PAYLOCA_GIFT_${randomUUID()}`,
      expiresAt: new Date(Date.now() + 86400000),
      paidAt: new Date(),
    });
    await assert.rejects(
      redeemGift({ code, phoneNumber: "+22790123457", userId: beneficiaryId }),
      /Code cadeau ou numéro bénéficiaire invalide/,
    );
    const redeemed = await redeemGift({ code, phoneNumber: "+22790123456", userId: beneficiaryId });
    assert.equal(redeemed.gift.status, "REDEEMED");
    assert.equal(redeemed.membership.status, "VIP_OR");
    assert.equal(redeemed.membership.plan, "vip_or");
    assert.ok(redeemed.membership.trialEndsAt.getTime() > Date.now());
    await assert.rejects(
      redeemGift({ code, phoneNumber: "+22790123456", userId: beneficiaryId }),
      /déjà été utilisé/,
    );
  } finally {
    await db.delete(giftsTable).where(eq(giftsTable.id, giftId));
    await db.delete(membershipsTable).where(eq(membershipsTable.userId, beneficiaryId));
  }
});

test("un cadeau payé reste disponible jusqu’à l’inscription du bénéficiaire", async () => {
  const giftId = `GIFT_${randomUUID()}`;
  const beneficiaryId = `gift-new-account-${randomUUID()}`;
  const code = `NEW1-${randomUUID().slice(0, 4).toUpperCase()}-${randomUUID().slice(0, 4).toUpperCase()}`;
  try {
    await db.insert(giftsTable).values({
      id: giftId,
      fromUserId: `gift-sender-${randomUUID()}`,
      toPhone: "+22790123456",
      plan: "VIP_BRONZE",
      amount: 500,
      durationMonths: 1,
      status: "PAID",
      code,
      transactionId: `PAYLOCA_GIFT_${randomUUID()}`,
      expiresAt: new Date(Date.now() + 86400000),
      paidAt: new Date(),
    });
    await assert.rejects(
      redeemGift({ code, phoneNumber: "+22790123456", userId: beneficiaryId }),
      /Compte bénéficiaire introuvable/,
    );
    await db.insert(membershipsTable).values({
      userId: beneficiaryId,
      trialEndsAt: new Date(Date.now() - 86400000),
      status: "LECTURE_GRATUITE",
    });
    const result = await redeemGift({ code, phoneNumber: "+22790123456", userId: beneficiaryId });
    assert.equal(result.gift.status, "REDEEMED");
    assert.equal(result.membership.status, "VIP_BRONZE");
  } finally {
    await db.delete(giftsTable).where(eq(giftsTable.id, giftId));
    await db.delete(membershipsTable).where(eq(membershipsTable.userId, beneficiaryId));
  }
});

test("deux réclamations concurrentes d’un même cadeau n’activent qu’un seul mois", async () => {
  const giftId = `GIFT_${randomUUID()}`;
  const beneficiaryId = `gift-race-${randomUUID()}`;
  const code = `RACE-${randomUUID().slice(0, 4).toUpperCase()}-${randomUUID().slice(0, 4).toUpperCase()}`;
  try {
    await db.insert(membershipsTable).values({
      userId: beneficiaryId,
      trialEndsAt: new Date(Date.now() - 86400000),
      status: "LECTURE_GRATUITE",
    });
    await db.insert(giftsTable).values({
      id: giftId,
      fromUserId: `gift-sender-${randomUUID()}`,
      toPhone: "+22790123456",
      plan: "VIP_OR",
      amount: 500,
      durationMonths: 1,
      status: "PAID",
      code,
      transactionId: `PAYLOCA_GIFT_${randomUUID()}`,
      expiresAt: new Date(Date.now() + 86400000),
      paidAt: new Date(),
    });
    const results = await Promise.allSettled([
      redeemGift({ code, phoneNumber: "+22790123456", userId: beneficiaryId }),
      redeemGift({ code, phoneNumber: "+22790123456", userId: beneficiaryId }),
    ]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(results.filter((result) => result.status === "rejected").length, 1);
    const [membership] = await db.select().from(membershipsTable).where(eq(membershipsTable.userId, beneficiaryId));
    assert.equal(membership?.status, "VIP_OR");
  } finally {
    await db.delete(giftsTable).where(eq(giftsTable.id, giftId));
    await db.delete(membershipsTable).where(eq(membershipsTable.userId, beneficiaryId));
  }
});

after(async () => {
  await pool.end();
});
