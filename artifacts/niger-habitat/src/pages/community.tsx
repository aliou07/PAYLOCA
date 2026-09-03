import {
  useEffect,
  useRef,
  useState,
} from "react";
import { Link } from "wouter";
import {
  authenticatedFetch,
  usePaylocaAuth,
} from "@/auth/firebaseAuth";

type ReferralStats = {
  code: string;
  shareUrl: string;
  referralCount: number;
  activeWeeks: number;
  totalWeeksEarned: number;
  maxWeeks: number;
  canClaim: boolean;
};

type ReferralClaimResponse =
  ReferralStats & {
    referrerWeeks: number;
    referredWeeks: number;
  };

export function ReferralPage() {
  const { user } =
    usePaylocaAuth();

  const [copied, setCopied] =
    useState(false);

  const [stats, setStats] =
    useState<ReferralStats | null>(
      null,
    );

  const [claimCode, setClaimCode] =
    useState(() => {
      const inviteCode =
        window.location.pathname.match(
          /\/invite\/([^/]+)/,
        )?.[1];

      return (
        inviteCode
        ?? new URLSearchParams(
          window.location.search,
        ).get("code")
        ?? ""
      );
    });

  const [loading, setLoading] =
    useState(true);

  const [submitting, setSubmitting] =
    useState(false);

  const [error, setError] =
    useState("");

  const [notice, setNotice] =
    useState("");

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    let active = true;

    setLoading(true);

    authenticatedFetch(
      "/api/referrals",
    )
      .then(async (response) => {
        const payload =
          await response
            .json()
            .catch(() => ({})) as
            ReferralStats & {
              error?: string;
            };

        if (!response.ok) {
          throw new Error(
            payload.error
              ?? "Impossible de charger votre parrainage.",
          );
        }

        if (active) {
          setStats(payload);
        }
      })
      .catch((reason) => {
        if (active) {
          setError(
            reason instanceof Error
              ? reason.message
              : "Impossible de charger votre parrainage.",
          );
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [user?.id]);

  const link =
    stats?.shareUrl ?? "";

  const copy = async () => {
    if (!link) {
      return;
    }

    await navigator.clipboard?.writeText(
      link,
    );

    setCopied(true);

    window.setTimeout(
      () => setCopied(false),
      1800,
    );
  };

  const share = () => {
    if (!link) {
      return;
    }

    if (navigator.share) {
      void navigator
        .share({
          title: "PAYLOCA",
          text: "Rejoins-moi sur PAYLOCA.",
          url: link,
        })
        .catch(() => undefined);
    } else {
      void copy();
    }
  };

  const claim = async (
    event: React.FormEvent,
  ) => {
    event.preventDefault();

    if (!claimCode.trim()) {
      setError(
        "Saisissez le code reçu.",
      );
      return;
    }

    setSubmitting(true);
    setError("");
    setNotice("");

    try {
      const response =
        await authenticatedFetch(
          "/api/referrals/claim",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              code: claimCode
                .trim()
                .toUpperCase(),
            }),
          },
        );

      const payload =
        await response
          .json()
          .catch(() => ({})) as
          ReferralClaimResponse & {
            error?: string;
          };

      if (!response.ok) {
        throw new Error(
          payload.error
            ?? "Impossible de réclamer ce code.",
        );
      }

      setStats(payload);
      setClaimCode("");

      setNotice(
        `Code accepté : vous gagnez ${
          payload.referredWeeks
        } semaine${
          payload.referredWeeks > 1
            ? "s"
            : ""
        } et le parrain gagne ${
          payload.referrerWeeks
        } semaines.`,
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Impossible de réclamer ce code.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) {
    return (
      <CommunityShell
        title="Parrainage"
        eyebrow="Une mission, un lien unique"
      >
        <div className="rounded-3xl border border-[#dfd7c4] bg-[#faf6ec] p-6">
          <h2 className="font-display text-2xl font-bold">
            Connectez-vous pour parrainer
          </h2>

          <p className="mt-3 text-sm leading-6 text-[#676b76]">
            Votre code et vos récompenses sont liés à votre compte PAYLOCA sécurisé.
          </p>

          <Link
            href="/sign-in"
            className="mt-5 inline-flex rounded-xl bg-[#b95740] px-5 py-3 font-bold text-white"
          >
            Se connecter
          </Link>
        </div>
      </CommunityShell>
    );
  }

  if (loading) {
    return (
      <CommunityShell
        title="Parrainage"
        eyebrow="Une mission, un lien unique"
      >
        <p className="rounded-2xl border border-[#dfd7c4] bg-[#faf6ec] p-6 text-sm font-semibold text-[#676b76]">
          Chargement de votre parrainage…
        </p>
      </CommunityShell>
    );
  }
