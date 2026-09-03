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
  },
    if (!stats) {
    return (
      <CommunityShell
        title="Parrainage"
        eyebrow="Une mission, un lien unique"
      >
        <p
          role="alert"
          className="rounded-2xl bg-[#fff1ec] p-5 text-sm font-semibold text-[#8f3e32]"
        >
          {error
            || "Le parrainage est momentanément indisponible."}
        </p>
      </CommunityShell>
    );
  }

  return (
    <CommunityShell
      title="Parrainage"
      eyebrow="Une mission, un lien unique"
    >
      <div className="rounded-3xl bg-[#20283c] p-6 text-[#f7edda]">
        <p className="text-xs font-bold uppercase tracking-[.18em] text-[#e9b949]">
          Parrainage PAYLOCA
        </p>

        <h2 className="mt-4 font-display text-3xl font-bold">
          Invitez votre communauté
        </h2>

        <p className="mt-2 text-[#bbc0c7]">
          Votre code est lié à votre compte vérifié. Chaque réclamation donne 2 semaines au parrain et 1 semaine au filleul, valables 90 jours.
        </p>

        <div className="mt-5 rounded-xl bg-[#29334a] p-3 text-sm font-bold tracking-[.18em]">
          {stats.code}
        </div>

        <div className="mt-4 break-all rounded-xl bg-[#29334a] p-3 text-xs text-[#d5d4ce]">
          {link}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={copy}
            className="rounded-xl bg-[#e9b949] px-4 py-3 text-sm font-bold text-[#20283c]"
          >
            {copied
              ? "Lien copié"
              : "Copier mon lien"}
          </button>

          <button
            type="button"
            onClick={share}
            className="rounded-xl border border-[#536077] px-4 py-3 text-sm font-bold"
          >
            Partager le lien
          </button>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-[#dfd7c4] bg-[#faf6ec] p-5">
          <p className="text-xs font-bold uppercase tracking-[.15em] text-[#b95740]">
            Filleuls
          </p>

          <p className="mt-2 font-display text-3xl font-bold">
            {stats.referralCount}
          </p>

          <p className="mt-1 text-xs text-[#676b76]">
            réclamation
            {stats.referralCount > 1
              ? "s"
              : ""}{" "}
            confirmée
            {stats.referralCount > 1
              ? "s"
              : ""}
          </p>
        </div>

        <div className="rounded-2xl border border-[#dfd7c4] bg-[#faf6ec] p-5">
          <p className="text-xs font-bold uppercase tracking-[.15em] text-[#b95740]">
            Actives
          </p>

          <p className="mt-2 font-display text-3xl font-bold">
            {stats.activeWeeks} sem.
          </p>

          <p className="mt-1 text-xs text-[#676b76]">
            accès privé disponible
          </p>
        </div>

        <div className="rounded-2xl border border-[#dfd7c4] bg-[#faf6ec] p-5">
          <p className="text-xs font-bold uppercase tracking-[.15em] text-[#b95740]">
            Plafond
          </p>

          <p className="mt-2 font-display text-3xl font-bold">
            {stats.totalWeeksEarned}/
            {stats.maxWeeks}
          </p>

          <p className="mt-1 text-xs text-[#676b76]">
            semaines gagnées au total
          </p>
        </div>
      </div>

      {stats.canClaim && (
        <form
          onSubmit={claim}
          className="mt-6 rounded-2xl border border-[#cfe1d0] bg-[#eef7ed] p-5"
        >
          <label className="block text-sm font-bold text-[#267158]">
            Vous avez reçu un code ?

            <input
              value={claimCode}
              onChange={(event) =>
                setClaimCode(
                  event.target.value.toUpperCase(),
                )
              }
              placeholder="A1B2C3D4"
              maxLength={8}
              className="mt-2 w-full rounded-xl border border-[#b9d4bb] bg-white p-3 font-bold tracking-[.18em] text-[#20283c] outline-none focus:border-[#267158]"
            />
          </label>

          <button
            type="submit"
            disabled={submitting}
            className="mt-3 rounded-xl bg-[#267158] px-5 py-3 text-sm font-bold text-white disabled:opacity-60"
          >
            {submitting
              ? "Activation…"
              : "Réclamer le code"}
          </button>
        </form>
      )}

      {!stats.canClaim && (
        <p className="mt-6 rounded-2xl border border-[#dfd7c4] bg-[#faf6ec] p-5 text-sm font-semibold text-[#676b76]">
          Vous avez déjà réclamé un code. Un compte ne peut recevoir qu’un seul parrainage.
        </p>
      )}

      <p className="mt-5 text-xs leading-5 text-[#676b76]">
        Les récompenses expirent après 90 jours. Le plafond est de 20 semaines gagnées par compte ; les récompenses expirées ne comptent plus dans l’accès actif. Les paiements Mynita restent totalement séparés.
      </p>

      {notice && (
        <p
          role="status"
          className="mt-4 rounded-xl bg-[#eef7ed] p-3 text-sm font-bold text-[#267158]"
        >
          {notice}
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-xl bg-[#fff1ec] p-3 text-sm font-bold text-[#8f3e32]"
        >
          {error}
        </p>
      )}
    </CommunityShell>
  );
}

export function HelpPage() {
  const [message, setMessage] =
    useState("");

  const [sent, setSent] =
    useState(false);

  const send = (
    event: React.FormEvent,
  ) => {
    event.preventDefault();

    if (!message.trim()) {
      return;
    }

    localStorage.setItem(
      "payloca-support-ticket",
      JSON.stringify({
        message,
        status: "ouvert",
      }),
    );

    setSent(true);
  };

  return (
    <CommunityShell
      title="Centre d’aide"
      eyebrow="Nous sommes là pour vous"
    >
      <div className="space-y-3">
        {[
          "Comment poster une annonce ?",
          "Comment gagner des points Ligue ?",
          "Comment fonctionne la demande de discussion ?",
          "Comment protéger mon compte ?",
          "Comment fonctionne le paiement ?",
        ].map((question) => (
          <details
            key={question}
            className="rounded-xl border border-[#dfd7c4] bg-[#faf6ec] p-4"
          >
            <summary className="cursor-pointer font-bold">
              {question}
            </summary>

            <p className="mt-3 text-sm leading-6 text-[#676b76]">
              {question
                === "Comment fonctionne le paiement ?"
                ? "PAYLOCA n’est pas une banque et ne conserve ni carte, ni solde, ni code secret. Le paiement est effectué directement chez Mynita. PAYLOCA reçoit seulement le résultat sécurisé et la référence de transaction. En cas de problème de débit, contactez le support Mynita."
                : "PAYLOCA vous accompagne avec des règles simples, un téléphone vérifié et des outils de sécurité."}
            </p>
          </details>
        ))}
      </div>

      <form
        onSubmit={send}
        className="mt-6 rounded-2xl border border-[#dfd7c4] bg-[#faf6ec] p-5"
      >
        <h2 className="font-display text-2xl font-bold">
          Contacter le support
        </h2>

        <textarea
          value={message}
          onChange={(event) =>
            setMessage(event.target.value)
          }
          placeholder="Votre question..."
          rows={4}
          className="mt-4 w-full rounded-xl border border-[#d9cfbc] bg-[#f4efdf] p-3 text-sm"
        />

        <button className="mt-3 rounded-xl bg-[#b95740] px-5 py-3 text-sm font-bold text-white">
          {sent
            ? "Message envoyé"
            : "Envoyer au support"}
        </button>
      </form>
    </CommunityShell>
  );
}

export function StoriesPage() {
  const input =
    useRef<HTMLInputElement>(null);

  const [story, setStory] =
    useState<string | null>(null);

  return (
    <CommunityShell
      title="PAYLOCA Stories"
      eyebrow="Montrez vos biens en 25 secondes"
    >
      <div className="rounded-3xl border border-[#dfd7c4] bg-[#faf6ec] p-6 text-center">
        <p className="text-xs font-bold uppercase tracking-[.18em] text-[#b95740]">
          Ancien parcours
        </p>

        <h2 className="mt-4 font-display text-2xl font-bold">
          Votre story du jour
        </h2>

        <p className="mt-2 text-sm text-[#676b76]">
          Vidéo compressée, maximum 45 secondes, visible pendant 24 heures. Ce parcours reste séparé de PAYLOCA FUN.
        </p>

        <input
          ref={input}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(event) =>
            setStory(
              event.target.files?.[0]
                ?.name ?? null,
            )
          }
        />

        <button
          onClick={() =>
            input.current?.click()
          }
          className="mt-5 rounded-xl bg-[#b95740] px-5 py-3 font-bold text-white"
        >
          {story
            ? "Story prête"
            : "Ajouter une vidéo"}
        </button>

        {story && (
          <p className="mt-3 text-sm font-bold text-[#267158]">
            {story} · Aperçu temporaire
          </p>
        )}
      </div>
    </CommunityShell>
  );
}

function CommunityShell({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-[100dvh] bg-[#f4efdf] text-[#20283c]">
      <div className="page-shell py-10 md:py-16">
        <Link
          href="/"
          className="text-sm font-bold text-[#b95740]"
        >
          ← Retour à PAYLOCA
        </Link>

        <p className="mt-10 text-xs font-bold uppercase tracking-[.18em] text-[#b95740]">
          {eyebrow}
        </p>

        <h1 className="mt-2 font-display text-5xl font-bold tracking-[-.05em]">
          {title}
        </h1>

        <div className="mt-8 max-w-2xl">
          {children}
        </div>
      </div>
    </div>
  );
}
