import { eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { ChooseAccountTypeBody } from "@workspace/api-zod";
import { accountTypeValues, accountTypesTable, db, type AccountType } from "@workspace/db";
import {
  requireAuth,
  type AuthenticatedRequest,
} from "../middlewares/requireAuth";

const router: IRouter = Router();

function response(accountType: AccountType | null, city: string | null = null) {
  return {
    accountType,
    required: accountType === null || (accountType === "user" && !city),
    city,
  };
}

router.get("/account-type", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const [account] = await db.select({
    accountType: accountTypesTable.accountType,
    city: accountTypesTable.city,
  })
    .from(accountTypesTable)
    .where(eq(accountTypesTable.userId, userId))
    .limit(1);
  const accountType = account && accountTypeValues.includes(account.accountType as AccountType)
    ? account.accountType as AccountType
    : null;
  res.json(response(accountType, account?.city ?? null));
});

router.post("/account-type", requireAuth, async (req, res): Promise<void> => {
  const parsed = ChooseAccountTypeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Choisissez un espace PAYLOCA valide.",
      code: "INVALID_ACCOUNT_PROFILE",
    });
    return;
  }
  const requested = parsed.data.accountType;
  const city = parsed.data.city?.trim() || null;

  if (requested === "user" && !city) {
    res.status(400).json({
      error: "Votre ville est obligatoire pour entrer dans PAYLOCA.",
      code: "ACCOUNT_CITY_REQUIRED",
    });
    return;
  }

  const userId = (req as AuthenticatedRequest).userId;
  const [existing] = await db.select({
    accountType: accountTypesTable.accountType,
    city: accountTypesTable.city,
  })
    .from(accountTypesTable)
    .where(eq(accountTypesTable.userId, userId))
    .limit(1);

  if (existing) {
    if (existing.accountType !== requested) {
      res.status(409).json({
        error: "Le type de compte déjà choisi ne peut pas être remplacé.",
        code: "ACCOUNT_TYPE_IMMUTABLE",
      });
      return;
    }
    if (requested === "user" && existing.city !== city) {
      const [updated] = await db.update(accountTypesTable)
        .set({ city, updatedAt: new Date() })
        .where(eq(accountTypesTable.userId, userId))
        .returning({
          accountType: accountTypesTable.accountType,
          city: accountTypesTable.city,
        });
      res.json(response(requested as AccountType, updated?.city ?? city));
      return;
    }
    res.json(response(requested as AccountType, existing.city ?? null));
    return;
  }

  const [created] = await db.insert(accountTypesTable).values({
    userId,
    accountType: requested,
    city: requested === "user" ? city : null,
  }).onConflictDoNothing({ target: accountTypesTable.userId })
    .returning({
      accountType: accountTypesTable.accountType,
      city: accountTypesTable.city,
    });
  if (created) {
    res.status(200).json(response(created.accountType as AccountType, created.city ?? null));
    return;
  }

  // A second tab may have chosen an account space at the same time.
  const [raceWinner] = await db.select({
    accountType: accountTypesTable.accountType,
    city: accountTypesTable.city,
  })
    .from(accountTypesTable)
    .where(eq(accountTypesTable.userId, userId))
    .limit(1);
  if (raceWinner?.accountType === requested) {
    res.json(response(requested as AccountType, raceWinner.city ?? null));
    return;
  }
  res.status(409).json({
    error: "Le type de compte déjà choisi ne peut pas être remplacé.",
    code: "ACCOUNT_TYPE_IMMUTABLE",
  });
});

export default router;
