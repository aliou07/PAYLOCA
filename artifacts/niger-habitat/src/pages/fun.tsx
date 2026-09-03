import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  CirclePlay,
  Heart,
  MapPin,
  MessageCircle,
  Pause,
  Plus,
  RefreshCcw,
  Send,
  ShieldCheck,
  Sparkles,
  Upload,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { Link } from "wouter";
import {
  authenticatedFetch,
  usePaylocaAuth,
} from "@/auth/firebaseAuth";

type FunVideo = {
  id: number | string;
  clientVideoId: string;
  authorName: string;
  community: string;
  city: string;
  caption: string;
  videoUrl: string;
  contentType: string;
  durationSeconds: number;
  createdAt: string;
  moderationStatus: string;
  likedByViewer: boolean;
  commentsCount: number;
};

type FunComment = {
  id: number | string;
  authorName: string;
  body: string;
  createdAt: string;
};

const communities = [
  "Touareg",
  "Haoussa",
  "Zarma-Songhai",
  "Peul",
  "Kanouri",
  "Arabe",
  "Autre",
];

const cities = [
  "Niamey",
  "Maradi",
  "Zinder",
  "Agadez",
  "Tahoua",
  "Dosso",
  "Tillabéri",
  "Diffa",
];

const reportReasons = [
  {
    value: "harcelement",
    label: "Harcèlement ou intimidation",
  },
  {
    value: "contenu_inapproprie",
    label: "Contenu inapproprié",
  },
  {
    value: "violence",
    label: "Violence ou danger",
  },
  {
    value: "autre",
    label: "Autre raison",
  },
];

function isFunVideo(
  value: unknown,
): value is FunVideo {
  if (
    !value
    || typeof value !== "object"
  ) {
    return false;
  }

  const item =
    value as Record<string, unknown>;

  return (
    (
      typeof item.id === "number"
      || typeof item.id === "string"
    )
    && typeof item.clientVideoId
      === "string"
    && typeof item.videoUrl
      === "string"
    && typeof item.authorName
      === "string"
    && typeof item.caption
      === "string"
  );
}

function isFunComment(
  value: unknown,
): value is FunComment {
  if (
    !value
    || typeof value !== "object"
  ) {
    return false;
  }

  const item =
    value as Record<string, unknown>;

  return (
    (
      typeof item.id === "number"
      || typeof item.id === "string"
    )
    && typeof item.authorName
      === "string"
    && typeof item.body
      === "string"
  );
}

function storageSource(path: string) {
  return path.startsWith("/objects/")
    ? `/api/storage${path}`
    : path;
}

async function responseMessage(
  response: Response,
  fallback: string,
) {
  const payload =
    await response
      .json()
      .catch(() => ({})) as {
        error?: unknown;
        message?: unknown;
      };

  return typeof payload.error
    === "string"
    ? payload.error
    : typeof payload.message
      === "string"
      ? payload.message
      : fallback;
}

function formatAge(date: string) {
  const timestamp =
    new Date(date).getTime();

  if (!Number.isFinite(timestamp)) {
    return "à l’instant";
  }

  const minutes = Math.max(
    0,
    Math.floor(
      (Date.now() - timestamp)
      / 60000,
    ),
  );

  if (minutes < 1) {
    return "à l’instant";
  }

  if (minutes < 60) {
    return `il y a ${minutes} min`;
  }

  if (minutes < 1440) {
    return `il y a ${Math.floor(
      minutes / 60,
    )} h`;
  }

  return new Intl.DateTimeFormat(
    "fr-FR",
    {
      day: "numeric",
      month: "short",
    },
  ).format(
    new Date(timestamp),
  );
}

function formatDuration(
  seconds: number,
) {
  if (!Number.isFinite(seconds)) {
    return "vidéo";
  }

  const whole = Math.max(
    0,
    Math.round(seconds),
  );

  return `${Math.floor(
    whole / 60,
  )}:${String(
    whole % 60,
  ).padStart(2, "0")}`;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) =>
      part[0]?.toUpperCase(),
    )
    .join("")
    || "P";
}

function FunSkeleton() {
  return (
    <div
      className="fun-skeleton-list"
      aria-label="Chargement des vidéos"
      data-testid="loading-fun-videos"
    >
      {[1, 2].map((item) => (
        <div
          key={item}
          className="fun-skeleton-card"
        >
          <div className="fun-skeleton-video" />

          <div className="fun-skeleton-line fun-skeleton-line-wide" />

          <div className="fun-skeleton-line" />
        </div>
      ))}
    </div>
  );
}

function FunVideoCard({
  video,
}: {
  video: FunVideo;
}) {
