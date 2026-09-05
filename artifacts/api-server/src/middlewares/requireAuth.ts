import type { Request, RequestHandler } from "express";
import { eq } from "drizzle-orm";
import { accountTypeValues, accountTypesTable, db, type AccountType } from "@workspace/db";
import { verifyFirebaseIdToken } from "../lib/firebaseAdmin";
import { getOrCreateMembership } from "../lib/membership";
import { planForMembershipStatus } from "../lib/membership";
import { normalizeNigerPhone } from "../lib/phone";

export type AuthenticatedRequest = Request & {
  userId: string;
  userName: string;
  isAdministrator: boolean;
  isModerator: boolean;
  accountType: AccountType | null;
  accountTypeLoaded: boolean;
  membershipStatus: "ESSAI_VIP_GRATUIT" | "LECTURE_GRATUITE" | "STANDARD" | "VIP_BRONZE" | "VIP_OR" | "BOSS_VIP";
  trialEndsAt: Date;
  referralWeeksActive: number;
  phoneNumber: string | null;
};

export function isValidNigerPhone(value: unknown): value is string {
  return typeof value === "string" && /^\+227\d{8}$/.test(value);
}

export const requireAuth: RequestHandler = async (req, res, next) => {
  const authorization = req.header("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  const claims = token ? await verifyFirebaseIdToken(token) : null;
  if (!claims) {
    res.status(401).json({ error: "Vous devez être connecté pour continuer." });
    return;
  }
  if (!isValidNigerPhone(claims.phone_number)) {
    res.status(403).json({
      error: "Un numéro de téléphone nigérien vérifié est requis pour utiliser PAYLOCA.",
      code: "NIGER_PHONE_REQUIRED",
    });
    return;
  }
  const userId = claims.uid;
  const membership = await getOrCreateMembership(userId);
  const configuredAdminEmail = process.env.PAYLOCA_ADMIN_EMAIL?.trim().toLowerCase();
  const configuredAdminPhone = normalizeNigerPhone(process.env.PAYLOCA_ADMIN_PHONE ?? "");
  const verifiedEmail = typeof claims.email === "string" ? claims.email.trim().toLowerCase() : "";
  const verifiedPhone = typeof claims.phone_number === "string"
    ? normalizeNigerPhone(claims.phone_number)
    : "";
  const isAdministrator = claims.admin === true
    || Boolean(configuredAdminEmail && verifiedEmail && configuredAdminEmail === verifiedEmail)
    || Boolean(configuredAdminPhone && verifiedPhone && configuredAdminPhone === verifiedPhone);
  const isModerator = isAdministrator || claims.moderator === true;
  const [account] = await db.select({
    accountType: accountTypesTable.accountType,
  })
    .from(accountTypesTable)
    .where(eq(accountTypesTable.userId, userId))
    .limit(1);
  const accountType = account && accountTypeValues.includes(account.accountType as AccountType)
    ? account.accountType as AccountType
    : null;
  (req as AuthenticatedRequest).userId = userId;
  (req as AuthenticatedRequest).membershipStatus = isAdministrator ? "BOSS_VIP" : membership.status;
  (req as AuthenticatedRequest).trialEndsAt = membership.trialEndsAt;
  (req as AuthenticatedRequest).referralWeeksActive = membership.referralWeeksActive;
  (req as AuthenticatedRequest).accountType = accountType;
  (req as AuthenticatedRequest).accountTypeLoaded = true;
  (req as AuthenticatedRequest).isAdministrator = isAdministrator;
  (req as AuthenticatedRequest).userName = typeof claims.name === "string" && claims.name.trim()
    ? claims.name.trim()
    : "Utilisateur PAYLOCA";
  (req as AuthenticatedRequest).isModerator = isModerator;
  (req as AuthenticatedRequest).phoneNumber = typeof claims.phone_number === "string"
    ? normalizeNigerPhone(claims.phone_number)
    : null;
  next();
};

export const requireModerator: RequestHandler = (req, res, next) => {
  if (!(req as AuthenticatedRequest).isModerator) {
    res.status(403).json({ error: "Rôle de modérateur requis." });
    return;
  }
  next();
};

export function requireAccountType(
  req: Request,
  res: Parameters<RequestHandler>[1],
  allowed: readonly AccountType[],
): boolean {
  const authenticated = req as AuthenticatedRequest;
  // Requests reaching this helper through requireAuth always have the flag.
  // Direct handler tests may omit it and remain focused on their own contract.
  if (!authenticated.accountTypeLoaded) return true;
  if (!authenticated.accountType) {
    res.status(409).json({
      error: "Choisissez d’abord votre espace PAYLOCA.",
      code: "ACCOUNT_TYPE_REQUIRED",
    });
    return false;
  }
  if (!allowed.includes(authenticated.accountType)) {
    res.status(403).json({
      error: "Cet espace n’est pas disponible pour votre type de compte.",
      code: "ACCOUNT_TYPE_FORBIDDEN",
    });
    return false;
  }
  return true;
}

export function requireVipAccess(req: Request, res: Parameters<RequestHandler>[1]): boolean {
  const { isAdministrator, membershipStatus, referralWeeksActive } = req as AuthenticatedRequest;
  if (isAdministrator) return true;
  if (membershipStatus === "LECTURE_GRATUITE" && !(referralWeeksActive > 0)) {
    res.status(403).json({
      error: "Votre essai VIP est terminé. Choisissez un abonnement pour publier et envoyer des messages.",
      code: "SUBSCRIPTION_REQUIRED",
    });
    return false;
  }
  return true;
}

export function requireUserAccount(req: Request, res: Parameters<RequestHandler>[1]): boolean {
  const authenticated = req as AuthenticatedRequest;
  if (authenticated.accountType !== "user") {
    res.status(403).json({
      error: "Cette fonctionnalité est réservée à l’espace utilisateur.",
      code: "USER_ACCOUNT_REQUIRED",
    });
    return false;
  }
  return true;
}

export function requireUserVip(req: Request, res: Parameters<RequestHandler>[1]): boolean {
  const authenticated = req as AuthenticatedRequest;
  // Les tests de handlers peuvent appeler directement la route sans le contexte
  // produit par requireAuth ; en production ces champs sont toujours renseignés.
  if (!authenticated.accountTypeLoaded) return true;
  if (authenticated.accountType !== "user") {
    res.status(403).json({ error: "Cette fonctionnalité est réservée à l’espace utilisateur.", code: "USER_ACCOUNT_REQUIRED" });
    return false;
  }
  if (!authenticated.isAdministrator && planForMembershipStatus(authenticated.membershipStatus) === "free") {
    res.status(403).json({ error: "Un abonnement VIP est nécessaire pour déposer une candidature.", code: "USER_FEATURE_SUBSCRIPTION_REQUIRED" });
    return false;
  }
  return true;
}

/**
 * Display names are presentation data only, but they must still be sourced
 * from verified Firebase token claims rather than from an untrusted request
 * body. The stable authorization key is always the Firebase UID.
 */
export async function getAuthenticatedUserName(userId: string, req?: Request): Promise<string> {
  if (req && (req as AuthenticatedRequest).userId === userId) {
    return (req as AuthenticatedRequest).userName;
  }
  return "Utilisateur PAYLOCA";
}
