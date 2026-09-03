import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  onIdTokenChanged,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  signOut as firebaseSignOut,
  updateProfile,
  type ConfirmationResult,
  type User,
} from "firebase/auth";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import {
  firebaseAuth,
  isFirebaseConfigured,
} from "@/lib/firebase";

export type AccountType =
  | "user"
  | "agency"
  | "ong";

export type PaylocaUser = {
  id: string;
  fullName: string;
  phoneNumber: string | null;
  city?: string | null;
  accountType?: AccountType | null;
  plan?: "free" | "vip_bronze" | "vip_or";
};

type AuthState = {
  user: PaylocaUser | null;
  accountType: AccountType | null;
  accountTypeLoading: boolean;
  accountTypeRequired: boolean;
  membership: {
    status:
      | "ESSAI_VIP_GRATUIT"
      | "LECTURE_GRATUITE"
      | "STANDARD"
      | "VIP_BRONZE"
      | "VIP_OR"
      | "BOSS_VIP";
    trialEndsAt: string | null;
    isVip: boolean;
    plan:
      | "free"
      | "vip_bronze"
      | "vip_or";
    boostsRemaining: number;
    boostLimit: number;
    referralWeeksActive: number;
  };
  membershipLoading: boolean;
  membershipError: string | null;
  membershipConfirmed: boolean;
  isLoaded: boolean;
  isSignedIn: boolean;
  isModerator: boolean;
  configured: boolean;
  requestOtp: (
    name: string,
    phone: string,
    accountType: AccountType,
    city?: string,
  ) => Promise<string>;
  confirmOtp: (
    code: string,
  ) => Promise<void>;
  resendOtp: () => Promise<string>;
  completeProfile: (
    city: string,
  ) => Promise<void>;
  signOut: () => Promise<void>;
};

const FirebaseAuthContext =
  createContext<AuthState | null>(null);

const e2eTestUserId =
  import.meta.env.DEV
    ? import.meta.env.VITE_E2E_TEST_USER_ID?.trim()
    : "";

const e2eTestUser: PaylocaUser | null =
  e2eTestUserId
    ? {
        id: e2eTestUserId,
        fullName:
          "Utilisateur test PAYLOCA",
        phoneNumber: "+22790000000",
        accountType: "user",
      }
    : null;

export function normalizeNigerPhone(
  value: string,
) {
  const compact =
    value
      .trim()
      .replace(/[\s().-]/g, "");

  const local =
    compact.startsWith("+227")
      ? compact.slice(4)
      : compact.startsWith("227")
        ? compact.slice(3)
        : compact;

  return /^\d{8}$/.test(local)
    ? `+227${local}`
    : "";
}

export function FirebaseAuthProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [firebaseUser, setFirebaseUser] =
    useState<User | null>(null);

  const [isLoaded, setIsLoaded] =
    useState(!isFirebaseConfigured);

  const [membership, setMembership] =
    useState<AuthState["membership"]>({
      status: "LECTURE_GRATUITE",
      trialEndsAt: null,
      isVip: false,
      plan: "free",
      boostsRemaining: 0,
      boostLimit: 0,
      referralWeeksActive: 0,
    });

  const [membershipLoading, setMembershipLoading] =
    useState(false);

  const [membershipError, setMembershipError] =
    useState<string | null>(null);

  const [membershipConfirmed, setMembershipConfirmed] =
    useState(false);

  const [isModerator, setIsModerator] =
    useState(false);

  const [accountType, setAccountType] =
    useState<AccountType | null>(
      e2eTestUser ? "user" : null,
    );

  const [accountTypeLoading, setAccountTypeLoading] =
    useState(false);

  const [accountTypeRequired, setAccountTypeRequired] =
    useState(false);

  const [profileCity, setProfileCity] =
    useState<string | null>(null);

  const confirmation =
    useRef<ConfirmationResult | null>(null);

  const recaptcha =
    useRef<RecaptchaVerifier | null>(null);

  const pending =
    useRef<{
      name: string;
      phone: string;
      accountType: AccountType;
      city: string;
    } | null>(null);

  const membershipRequest =
    useRef(0);

  const membershipUserId =
    useRef<string | null>(null);

  const accountTypeRequest =
    useRef(0);

  const refreshMembership =
    useCallback(async () => {
      const currentUser =
        firebaseAuth?.currentUser;

      if (!currentUser) {
        return;
      }

      const requestId =
        ++membershipRequest.current;

      setMembershipLoading(true);
      setMembershipError(null);

      try {
        const response =
          await authenticatedFetch(
            "/api/membership",
          );

        const payload =
          await response
            .json()
            .catch(() => ({})) as Partial<
              AuthState["membership"]
            > & {
              error?: string;
            };

        if (!response.ok) {
          throw new Error(
            payload.error
              ?? "Impossible de charger votre abonnement.",
          );
        }

        if (
          (
            payload.status
              !== "ESSAI_VIP_GRATUIT"
            && payload.status
              !== "LECTURE_GRATUITE"
            && payload.status
              !== "STANDARD"
            && payload.status
              !== "VIP_BRONZE"
            && payload.status
              !== "VIP_OR"
            && payload.status
              !== "BOSS_VIP"
          )
          || typeof payload.isVip
            !== "boolean"
          || (
            payload.plan !== "free"
            && payload.plan
              !== "vip_bronze"
            && payload.plan
              !== "vip_or"
          )
          || typeof payload.boostsRemaining
            !== "number"
          || typeof payload.boostLimit
            !== "number"
          || typeof payload.referralWeeksActive
            !== "number"
        ) {
          throw new Error(
            "Réponse d’abonnement invalide.",
          );
        }

        const serverMembership = {
          status: payload.status,
          trialEndsAt:
            typeof payload.trialEndsAt
              === "string"
              ? payload.trialEndsAt
              : null,
          isVip: payload.isVip,
          plan: payload.plan,
          boostsRemaining:
            payload.boostsRemaining,
          boostLimit:
            payload.boostLimit,
          referralWeeksActive:
            payload.referralWeeksActive,
        } as AuthState["membership"];

        if (
          requestId
            === membershipRequest.current
          && firebaseAuth?.currentUser?.uid
            === currentUser.uid
        ) {
          setMembership(serverMembership);
          setMembershipConfirmed(true);
        }
      } catch (error: unknown) {
        if (
          requestId
            === membershipRequest.current
        ) {
          setMembershipError(
            error instanceof Error
              ? error.message
              : "Impossible de charger votre abonnement.",
          );
        }
      } finally {
        if (
          requestId
            === membershipRequest.current
        ) {
          setMembershipLoading(false);
        }
      }
    }, []);

  const refreshAccountType =
    useCallback(async () => {
      const currentUser =
        firebaseAuth?.currentUser;

      if (!currentUser) {
        return;
      }

      const requestId =
        ++accountTypeRequest.current;

      setAccountTypeLoading(true);

      try {
        const response =
          await authenticatedFetch(
            "/api/account-type",
          );

        const payload =
          await response
            .json()
            .catch(() => ({})) as {
              accountType?: unknown;
              required?: unknown;
              city?: unknown;
              error?: string;
            };

        if (!response.ok) {
          throw new Error(
            payload.error
              ?? "Impossible de charger votre espace.",
          );
        }

        const nextType =
          payload.accountType === "user"
          || payload.accountType === "agency"
          || payload.accountType === "ong"
            ? payload.accountType
            : null;

        const nextCity =
          typeof payload.city === "string"
          && payload.city.trim()
            ? payload.city.trim()
            : null;

        if (
          requestId
            === accountTypeRequest.current
          && firebaseAuth?.currentUser?.uid
            === currentUser.uid
        ) {
          setAccountType(nextType);
          setProfileCity(nextCity);
          setAccountTypeRequired(
            nextType === null
            || payload.required === true
            || (
              nextType === "user"
              && !nextCity
            ),
          );
        }
      } catch {
        if (
          requestId
            === accountTypeRequest.current
        ) {
          setAccountTypeRequired(false);
        }
      } finally {
        if (
          requestId
            === accountTypeRequest.current
        ) {
          setAccountTypeLoading(false);
        }
      }
    }, []);

  useEffect(() => {
    if (!firebaseAuth) {
      setAuthTokenGetter(null);
      return;
    }

    return onIdTokenChanged(
      firebaseAuth,
      (nextUser) => {
        setFirebaseUser(nextUser);

        setAuthTokenGetter(
          nextUser
            ? () => nextUser.getIdToken()
            : null,
        );

        setIsLoaded(true);

        if (!nextUser) {
          setIsModerator(false);
          membershipUserId.current = null;
          ++membershipRequest.current;

          setMembership({
            status: "LECTURE_GRATUITE",
            trialEndsAt: null,
            isVip: false,
            plan: "free",
            boostsRemaining: 0,
            boostLimit: 0,
            referralWeeksActive: 0,
          });

          setMembershipLoading(false);
          setMembershipError(null);
          setMembershipConfirmed(false);
          setAccountType(null);
          setProfileCity(null);
          setAccountTypeRequired(false);
          setAccountTypeLoading(false);
          ++accountTypeRequest.current;

          return;
        }

        setIsModerator(false);

        void nextUser
          .getIdTokenResult()
          .then((result) => {
            if (
              firebaseAuth?.currentUser?.uid
                === nextUser.uid
            ) {
              setIsModerator(
                result.claims.admin === true
                || result.claims.moderator
                  === true,
              );
            }
          })
          .catch(() => {
            setIsModerator(false);
          });

        if (
          membershipUserId.current
            !== nextUser.uid
        ) {
          membershipUserId.current =
            nextUser.uid;

          setMembership({
            status: "LECTURE_GRATUITE",
            trialEndsAt: null,
            isVip: false,
            plan: "free",
            boostsRemaining: 0,
            boostLimit: 0,
            referralWeeksActive: 0,
          });

          setMembershipConfirmed(false);
          setAccountType(
            e2eTestUser ? "user" : null,
          );
          setProfileCity(null);
          setAccountTypeRequired(
            !e2eTestUser,
          );
        }
      },
    );
  }, []);

  useEffect(() => {
    if (!firebaseUser) {
      return;
    }

    void refreshMembership();
    void refreshAccountType();

    const interval =
      window.setInterval(
        () => void refreshMembership(),
        5 * 60 * 1000,
      );

    const handleVisibilityChange =
      () => {
        if (
          document.visibilityState
            === "visible"
        ) {
          void refreshMembership();
        }
      };

    document.addEventListener(
      "visibilitychange",
      handleVisibilityChange,
    );

    return () => {
      window.clearInterval(interval);

      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange,
      );
    };
  }, [
    firebaseUser,
    refreshAccountType,
    refreshMembership,
  ]);

  const ensureRecaptcha = () => {
    if (!firebaseAuth) {
      throw new Error(
        "Firebase n’est pas configuré.",
      );
    }

    if (!recaptcha.current) {
      recaptcha.current =
        new RecaptchaVerifier(
          firebaseAuth,
          "firebase-recaptcha",
          {
            size: "invisible",
          },
        );
    }

    return recaptcha.current;
  };

  const sendCode = async (
    name: string,
    phone: string,
    selectedAccountType: AccountType,
    city = "",
  ) => {
    if (!firebaseAuth) {
      throw new Error(
        "Firebase n’est pas configuré. Ajoutez les variables Firebase avant d’envoyer un SMS.",
      );
    }

    const normalized =
      normalizeNigerPhone(phone);

    if (!name.trim()) {
      throw new Error(
        "Votre nom complet est obligatoire.",
      );
    }

    if (
      selectedAccountType === "user"
      && city.trim().length < 2
    ) {
      throw new Error(
        "Votre ville est obligatoire.",
      );
    }

    if (!normalized) {
      throw new Error(
        "Saisissez un numéro nigérien valide à 8 chiffres après +227.",
      );
    }

    const verifier =
      ensureRecaptcha();

    try {
      confirmation.current =
        await signInWithPhoneNumber(
          firebaseAuth,
          normalized,
          verifier,
        );
    } catch (error) {
      recaptcha.current?.clear();
      recaptcha.current = null;
      throw error;
    }

    pending.current = {
      name: name.trim(),
      phone: normalized,
      accountType:
        selectedAccountType,
      city: city.trim(),
    };

    return normalized;
  };

  const confirmOtp = async (
    code: string,
  ) => {
    if (
      !confirmation.current
      || !pending.current
    ) {
      throw new Error(
        "Demandez un nouveau code SMS.",
      );
    }

    const requestedAccountType =
      pending.current.accountType;

    const requestedCity =
      pending.current.city;

    const result =
      await confirmation.current.confirm(
        code,
      );

    if (
      result.user.displayName
        !== pending.current.name
    ) {
      await updateProfile(
        result.user,
        {
          displayName:
            pending.current.name,
        },
      );

      await result.user.getIdToken(true);
    }

    const response =
      await authenticatedFetch(
        "/api/account-type",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            accountType:
              requestedAccountType,
            city:
              requestedCity || undefined,
          }),
        },
      );

    const payload =
      await response
        .json()
        .catch(() => ({})) as {
          accountType?: AccountType;
          city?: string | null;
          error?: string;
        };

    if (!response.ok) {
      await firebaseSignOut(
        firebaseAuth!,
      );

      throw new Error(
        payload.error
          ?? "Ce type de compte ne peut pas être sélectionné.",
      );
    }

    setAccountType(
      payload.accountType === "user"
      || payload.accountType === "agency"
      || payload.accountType === "ong"
        ? payload.accountType
        : requestedAccountType,
    );

    setProfileCity(
      payload.city?.trim()
        || requestedCity
        || null,
    );

    setAccountTypeRequired(false);
    confirmation.current = null;
    pending.current = null;
  };

  const completeProfile = async (
    city: string,
  ) => {
    const normalizedCity =
      city.trim();

    if (
      normalizedCity.length < 2
    ) {
      throw new Error(
        "Votre ville est obligatoire.",
      );
    }

    const response =
      await authenticatedFetch(
        "/api/account-type",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            accountType: "user",
            city: normalizedCity,
          }),
        },
      );

    const payload =
      await response
        .json()
        .catch(() => ({})) as {
          accountType?: AccountType;
          city?: string | null;
          error?: string;
        };

    if (!response.ok) {
      throw new Error(
        payload.error
          ?? "Impossible d’enregistrer votre ville.",
      );
    }

    setAccountType("user");

    setProfileCity(
      payload.city?.trim()
        || normalizedCity,
    );

    setAccountTypeRequired(false);
  };

  const value =
    useMemo<AuthState>(() => ({
      user:
        e2eTestUser
        ?? (
          firebaseUser
            ? {
                id: firebaseUser.uid,
                fullName:
                  firebaseUser.displayName
                    ?.trim()
                  || firebaseUser.phoneNumber
                  || "Utilisateur PAYLOCA",
                phoneNumber:
                  firebaseUser.phoneNumber,
                accountType,
                city: profileCity,
                plan: membership.plan,
              }
            : null
        ),

      accountType,
      accountTypeLoading,
      accountTypeRequired,
      completeProfile,
      membership,
      membershipLoading,
      membershipError,
      membershipConfirmed,
      isLoaded,
      isSignedIn:
        Boolean(
          e2eTestUser || firebaseUser,
        ),
      isModerator,
      configured:
        isFirebaseConfigured,
      requestOtp: sendCode,

      resendOtp: async () => {
        if (!pending.current) {
          throw new Error(
            "Saisissez votre nom et votre numéro pour recevoir un code.",
          );
        }

        return sendCode(
          pending.current.name,
          pending.current.phone,
          pending.current.accountType,
          pending.current.city,
        );
      },

      confirmOtp,
      signOut: async () => {
        if (firebaseAuth) {
          await firebaseSignOut(
            firebaseAuth,
          );
        }

        setAuthTokenGetter(null);
      },
    }), [
      accountType,
      accountTypeLoading,
      accountTypeRequired,
      completeProfile,
      firebaseUser,
      isLoaded,
      isModerator,
      membership,
      membershipLoading,
      membershipError,
      membershipConfirmed,
      profileCity,
    ]);

  return (
    <FirebaseAuthContext.Provider
      value={value}
    >
      {children}
    </FirebaseAuthContext.Provider>
  );
}

export function usePaylocaAuth() {
  const context =
    useContext(
      FirebaseAuthContext,
    );

  if (!context) {
    throw new Error(
      "FirebaseAuthProvider is required.",
    );
  }

  return context;
}

export async function authenticatedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
) {
  const token =
    await firebaseAuth
      ?.currentUser
      ?.getIdToken();

  const headers =
    new Headers(init.headers);

  if (token) {
    headers.set(
      "Authorization",
      `Bearer ${token}`,
    );
  }

  return fetch(input, {
    ...init,
    headers,
  });
}

export async function authenticatedFetchForUser(
  expectedUserId: string,
  input: RequestInfo | URL,
  init: RequestInit = {},
) {
  if (
    e2eTestUser?.id
      === expectedUserId
  ) {
    return fetch(input, init);
  }

  const currentUser =
    firebaseAuth?.currentUser;

  if (
    !currentUser
    || currentUser.uid
      !== expectedUserId
  ) {
    throw new Error(
      "Le compte actif a changé avant la synchronisation.",
    );
  }

  const token =
    await currentUser.getIdToken();

  if (
    firebaseAuth?.currentUser?.uid
      !== expectedUserId
  ) {
    throw new Error(
      "Le compte actif a changé pendant la synchronisation.",
    );
  }

  const headers =
    new Headers(init.headers);

  headers.set(
    "Authorization",
    `Bearer ${token}`,
  );

  return fetch(input, {
    ...init,
    headers,
  });
}
