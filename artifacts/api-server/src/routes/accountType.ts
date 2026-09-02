import {
  and,
  eq,
  isNull,
} from "drizzle-orm";
import { Router, type IRouter } from "express";
import { ChooseAccountTypeBody } from "@workspace/api-zod";
import {
  accountTypeValues,
  accountTypesTable,
  db,
  type AccountType,
} from "@workspace/db";
import {
  calculateAgeFromBirthDate,
  isValidBirthDate,
  requireAuth,
  type AuthenticatedRequest,
} from "../middlewares/requireAuth";
const router: IRouter = Router();
function response(
  accountType: AccountType | null,
  dateOfBirth: string | null,
) {
  return {
    accountType,
    required: accountType === null,
    age: calculateAgeFromBirthDate(
      dateOfBirth,
    ),
    birthDateRequired: dateOfBirth === null,
  };
}
router.get(
  "/account-type",
  requireAuth,
  async (req, res): Promise<void> => {
    const userId =
      (req as AuthenticatedRequest).userId;
    const [account] = await db
      .select({
        accountType:
          accountTypesTable.accountType,
        dateOfBirth:
          accountTypesTable.dateOfBirth,
      })
      .from(accountTypesTable)
      .where(
        eq(accountTypesTable.userId, userId),
      )
      .limit(1);
    const accountType =
      account &&
      accountTypeValues.includes(
        account.accountType as AccountType,
      )
        ? (account.accountType as AccountType)
        : null;
    res.json(
      response(
        accountType,
        account?.dateOfBirth ?? null,
      ),
    );
  },
);
router.post(
  "/account-type",
  requireAuth,
  async (req, res): Promise<void> => {
    const parsed = ChooseAccountTypeBody.safeParse(
      req.body,
    );
    const submittedBirthDate =
      req.body?.dateOfBirth;
    if (
      !parsed.success ||
      !isValidBirthDate(submittedBirthDate)
    ) {
      res.status(400).json({
        error:
          "Choisissez un espace valide et indiquez une date de naissance réelle.",
        code: "INVALID_ACCOUNT_PROFILE",
      });
      return;
    }
    const requested = parsed.data.accountType;
    const dateOfBirth = submittedBirthDate;
    const age =
      calculateAgeFromBirthDate(dateOfBirth);
    if (age === null) {
      res.status(400).json({
        error:
          "Indiquez une date de naissance réelle.",
        code: "INVALID_BIRTH_DATE",
      });
      return;
    }
    if (age < 30 && requested !== "user") {
      res.status(403).json({
        error:
          "Avant 30 ans, choisissez l’espace utilisateur photo et vidéo.",
        code: "YOUNG_ACCOUNT_TYPE_REQUIRED",
      });
      return;
    }
    const userId =
      (req as AuthenticatedRequest).userId;
    const [existing] = await db
      .select({
        accountType:
          accountTypesTable.accountType,
        dateOfBirth:
          accountTypesTable.dateOfBirth,
      })
      .from(accountTypesTable)
      .where(
        eq(accountTypesTable.userId, userId),
      )
      .limit(1);
    if (existing) {
      if (existing.accountType !== requested) {
        res.status(409).json({
          error:
            "Le type de compte déjà choisi ne peut pas être remplacé.",
          code: "ACCOUNT_TYPE_IMMUTABLE",
        });
        return;
      }
      if (
        existing.dateOfBirth &&
        existing.dateOfBirth !== dateOfBirth
      ) {
        res.status(409).json({
          error:
            "La date de naissance de ce compte est déjà enregistrée et ne peut pas être remplacée.",
          code: "BIRTH_DATE_IMMUTABLE",
        });
        return;
      }
      if (!existing.dateOfBirth) {
        const [updated] = await db
          .update(accountTypesTable)
          .set({
            dateOfBirth,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(
                accountTypesTable.userId,
                userId,
              ),
              isNull(
                accountTypesTable.dateOfBirth,
              ),
            ),
          )
          .returning({
            dateOfBirth:
              accountTypesTable.dateOfBirth,
          });
        if (updated) {
          res.json(
            response(
              requested as AccountType,
              updated.dateOfBirth,
            ),
          );
          return;
        }
      }
      res.json(
        response(
          requested as AccountType,
          existing.dateOfBirth,
        ),
      );
      return;
    }
    const [created] = await db
      .insert(accountTypesTable)
      .values({
        userId,
        accountType: requested,
        dateOfBirth,
      })
      .onConflictDoNothing({
        target: accountTypesTable.userId,
      })
      .returning({
        accountType:
          accountTypesTable.accountType,
        dateOfBirth:
          accountTypesTable.dateOfBirth,
      });
    if (created) {
      res.status(200).json(
        response(
          created.accountType as AccountType,
          created.dateOfBirth,
        ),
      );
      return;
    }
    // A second tab may have chosen an account space at the same time.
    const [raceWinner] = await db
      .select({
        accountType:
          accountTypesTable.accountType,
        dateOfBirth:
          accountTypesTable.dateOfBirth,
      })
      .from(accountTypesTable)
      .where(
        eq(accountTypesTable.userId, userId),
      )
      .limit(1);
    if (
      raceWinner?.accountType === requested &&
      raceWinner.dateOfBirth === dateOfBirth
    ) {
      res.json(
        response(
          requested as AccountType,
          raceWinner.dateOfBirth,
        ),
      );
      return;
    }
    res.status(409).json({
      error:
        "Le type de compte déjà choisi ne peut pas être remplacé.",
      code: "ACCOUNT_TYPE_IMMUTABLE",
    });
  },
);
export default router;
