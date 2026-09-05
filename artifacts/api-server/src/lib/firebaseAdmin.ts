import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getMessaging, type Messaging } from "firebase-admin/messaging";
import { getAuth, type DecodedIdToken } from "firebase-admin/auth";
import { and, eq, inArray } from "drizzle-orm";
import { db, pushDevicesTable } from "@workspace/db";

function getFirebaseAdminApp(): App | null {
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) return null;
  return getApps()[0] ?? initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
  });
}

function getFirebaseMessaging(): Messaging | null {
  const app = getFirebaseAdminApp();
  return app ? getMessaging(app) : null;
}

export async function verifyFirebaseIdToken(token: string): Promise<DecodedIdToken | null> {
  const app = getFirebaseAdminApp();
  if (!app) return null;
  try {
    return await getAuth(app).verifyIdToken(token);
  } catch {
    return null;
  }
}

export async function findFirebaseUserByPhoneNumber(phoneNumber: string): Promise<
  { kind: "found"; userId: string } | { kind: "not_found" } | { kind: "unavailable" }
> {
  const app = getFirebaseAdminApp();
  if (!app) return { kind: "unavailable" };
  try {
    const user = await getAuth(app).getUserByPhoneNumber(phoneNumber);
    return { kind: "found", userId: user.uid };
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error
      && (error as { code?: unknown }).code === "auth/user-not-found") {
      return { kind: "not_found" };
    }
    return { kind: "unavailable" };
  }
}

export async function notifyPushRecipient(input: {
  recipientId: string;
  senderName: string;
  body: string;
  conversationId: number;
  listingId: number;
}) {
  const messaging = getFirebaseMessaging();
  if (!messaging) return { configured: false as const, sent: 0 };

  const devices = await db.select().from(pushDevicesTable)
    .where(eq(pushDevicesTable.userId, input.recipientId));
  if (!devices.length) return { configured: true as const, sent: 0 };

  const preview = (input.body || "Photo envoyée").replace(/\s+/g, " ").trim().slice(0, 160);
  const response = await messaging.sendEachForMulticast({
    tokens: devices.map((device) => device.token),
    data: {
      title: "Nouveau message PAYLOCA",
      conversationId: String(input.conversationId),
      listingId: String(input.listingId),
      senderName: input.senderName,
      body: `${input.senderName}: ${preview}`,
      url: `/messages?conversation=${input.conversationId}&annonce=${input.listingId}`,
    },
  });

  const invalidTokens = devices
    .filter((_device, index) => {
      const errorCode = response.responses[index]?.error?.code;
      return errorCode === "messaging/registration-token-not-registered"
        || errorCode === "messaging/invalid-registration-token";
    })
    .map((device) => device.token);
  if (invalidTokens.length) {
    await db.delete(pushDevicesTable).where(and(
      eq(pushDevicesTable.userId, input.recipientId),
      inArray(pushDevicesTable.token, invalidTokens),
    ));
  }

  return { configured: true as const, sent: response.successCount };
}
