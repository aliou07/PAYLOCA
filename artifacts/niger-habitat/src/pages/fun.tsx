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
},
  onLike,
  likePending,
  onComments,
  commentsOpen,
  comments,
  commentsLoading,
  commentDraft,
  onCommentDraft,
  onCommentSubmit,
  commentPending,
  reportOpen,
  reportReason,
  onReportReason,
  onReportSubmit,
  reportPending,
  onCloseReport,
}: {
  video: FunVideo;
  onLike: (video: FunVideo) => void;
  likePending: boolean;
  onComments: (video: FunVideo) => void;
  commentsOpen: boolean;
  comments?: FunComment[];
  commentsLoading: boolean;
  commentDraft: string;
  onCommentDraft: (value: string) => void;
  onCommentSubmit: (
    event: FormEvent,
  ) => void;
  commentPending: boolean;
  reportOpen: boolean;
  reportReason: string;
  onReportReason: (value: string) => void;
  onReportSubmit: (
    event: FormEvent,
  ) => void;
  reportPending: boolean;
  onCloseReport: () => void;
  onReport: (video: FunVideo) => void;
}) {
  const [paused, setPaused] =
    useState(false);

  const [muted, setMuted] =
    useState(true);

  const playerRef =
    useRef<HTMLVideoElement>(null);

  const [source, setSource] =
    useState(() =>
      video.videoUrl.startsWith(
        "/objects/",
      )
        ? ""
        : video.videoUrl,
    );

  useEffect(() => {
    if (
      !video.videoUrl.startsWith(
        "/objects/",
      )
    ) {
      setSource(video.videoUrl);
      return;
    }

    let active = true;
    let objectUrl = "";

    void authenticatedFetch(
      storageSource(video.videoUrl),
    )
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(
            await responseMessage(
              response,
              "Vidéo inaccessible.",
            ),
          );
        }

        return response.blob();
      })
      .then((blob) => {
        if (!active) {
          return;
        }

        objectUrl =
          URL.createObjectURL(blob);

        setSource(objectUrl);
      })
      .catch(() => {
        if (active) {
          setSource("");
        }
      });

    return () => {
      active = false;

      if (objectUrl) {
        URL.revokeObjectURL(
          objectUrl,
        );
      }
    };
  }, [video.videoUrl]);

  const togglePlayback = () => {
    const player =
      playerRef.current;

    if (!player) {
      return;
    }

    if (player.paused) {
      void player
        .play()
        .catch(() => undefined);

      setPaused(false);
    } else {
      player.pause();
      setPaused(true);
    }
  };

  const toggleMute = () => {
    const player =
      playerRef.current;

    if (!player) {
      return;
    }

    player.muted = !player.muted;
    setMuted(player.muted);
  };

  return (
    <article
      className="fun-video-card"
      data-testid={`card-fun-video-${video.id}`}
    >
      <div className="fun-video-stage">
        <video
          ref={playerRef}
          src={source}
          className="fun-video-player"
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          onClick={togglePlayback}

function FunVideoCard({
  video,
}: {
  video: FunVideo;
}) {          onError={(event) => {
            event.currentTarget.poster = "";
          }}
          data-testid={`video-fun-${video.id}`}
        />

        <div className="fun-video-wash" />

        <div className="fun-video-topline">
          <span className="fun-content-pill">
            <Sparkles size={13} />
            PAYLOCA FUN
          </span>

          <span
            className="fun-duration"
            data-testid={`text-fun-duration-${video.id}`}
          >
            {formatDuration(
              video.durationSeconds,
            )}
          </span>
        </div>

        <button
          type="button"
          onClick={togglePlayback}
          aria-label={
            paused
              ? "Lire la vidéo"
              : "Mettre la vidéo en pause"
          }
          className={`fun-play-button ${
            paused ? "is-visible" : ""
          }`}
          data-testid={`button-toggle-play-${video.id}`}
        >
          {paused ? (
            <CirclePlay
              size={28}
              fill="currentColor"
            />
          ) : (
            <Pause size={22} />
          )}
        </button>

        <button
          type="button"
          onClick={toggleMute}
          aria-label={
            muted
              ? "Activer le son"
              : "Couper le son"
          }
          className="fun-sound-button"
          data-testid={`button-toggle-sound-${video.id}`}
        >
          {muted ? (
            <VolumeX size={17} />
          ) : (
            <Volume2 size={17} />
          )}
        </button>

        <div className="fun-video-caption">
          <div className="fun-author-row">
            <span
              className="fun-avatar"
              data-testid={`avatar-fun-author-${video.id}`}
            >
              {initials(video.authorName)}
            </span>

            <div>
              <p
                className="fun-author-name"
                data-testid={`text-fun-author-${video.id}`}
              >
                {video.authorName}
              </p>

              <p
                className="fun-meta"
                data-testid={`text-fun-location-${video.id}`}
              >
                <MapPin size={12} />
                {video.city} ·{" "}
                {video.community}
              </p>
            </div>
          </div>

          <p
            className="fun-caption"
            data-testid={`text-fun-caption-${video.id}`}
          >
            {video.caption}
          </p>

          <p
            className="fun-posted"
            data-testid={`text-fun-created-${video.id}`}
          >
            {formatAge(video.createdAt)}
          </p>
        </div>

        <div
          className="fun-action-rail"
          aria-label="Actions sur la vidéo"
        >
          <button
            type="button"
            onClick={() => onLike(video)}
            disabled={likePending}
            className={`fun-action-button ${
              video.likedByViewer
                ? "is-liked"
                : ""
            }`}
            aria-label={
              video.likedByViewer
                ? "Retirer la mention J’aime"
                : "Aimer cette vidéo"
            }
            data-testid={`button-like-fun-${video.id}`}
          >
            <Heart
              size={23}
              fill={
                video.likedByViewer
                  ? "currentColor"
                  : "none"
              }
            />
          </button>

          <button
            type="button"
            onClick={() => onComments(video)}
            className="fun-action-button"
            aria-label="Voir les commentaires"
            data-testid={`button-comments-fun-${video.id}`}
          >
            <MessageCircle size={23} />

            <span
              className="fun-action-count"
              data-testid={`text-fun-comments-count-${video.id}`}
            >
              {video.commentsCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => onReport(video)}
            className="fun-action-button fun-report-button"
            aria-label="Signaler cette vidéo"
            data-testid={`button-report-fun-${video.id}`}
          >
            <AlertTriangle size={20} />
          </button>
        </div>
      </div>

      {reportOpen && (
        <form
          onSubmit={onReportSubmit}
          className="fun-report-panel"
          data-testid={`form-report-fun-${video.id}`}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="fun-panel-title">
                Signaler cette vidéo
              </p>

              <p className="fun-panel-copy">
                Votre signalement reste confidentiel et sera examiné par PAYLOCA.
              </p>
            </div>

            <button
              type="button"
              onClick={onCloseReport}
              aria-label="Fermer le signalement"
              className="fun-icon-button"
              data-testid={`button-close-report-fun-${video.id}`}
            >
              <X size={17} />
            </button>
          </div>

          <label className="fun-select-wrap">
            <span className="sr-only">
              Motif du signalement
            </span>

            <select
              value={reportReason}
              onChange={(event) =>
                onReportReason(
                  event.target.value,
                )
              }
              className="fun-select"
              data-testid={`select-report-reason-fun-${video.id}`}
            >
              {reportReasons.map(
                (reason) => (
                  <option
                    key={reason.value}
                    value={reason.value}
                  >
                    {reason.label}
                  </option>
                ),
              )}
            </select>

            <ChevronDown size={16} />
          </label>

          <button
            type="submit"
            disabled={reportPending}
            className="fun-dark-button mt-3 w-full"
            data-testid={`button-submit-report-fun-${video.id}`}
          >
            {reportPending
              ? "Envoi du signalement…"
              : "Envoyer le signalement"}
          </button>
        </form>
      )}

      {commentsOpen && (
        <section
          className="fun-comments-panel"
          data-testid={`panel-comments-fun-${video.id}`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="fun-panel-title">
                Les réactions de la communauté
              </p>

              <p className="fun-panel-copy">
                Restez bienveillants. Les commentaires ne sont pas un espace d’annonces.
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                onComments(video)
              }
              aria-label="Fermer les commentaires"
              className="fun-icon-button"
              data-testid={`button-close-comments-fun-${video.id}`}
            >
              <X size={17} />
            </button>
          </div>

          {commentsLoading ? (
            <div
              className="fun-comment-loading"
              data-testid={`loading-fun-comments-${video.id}`}
            >
              <span />
              <span />
              <span />
            </div>
          ) : comments
            && comments.length > 0 ? (
            <div
              className="fun-comments-list"
              data-testid={`list-fun-comments-${video.id}`}
            >
              {comments.map((comment) => (
                <div
                  className="fun-comment"
                  key={comment.id}
                  data-testid={`comment-fun-${comment.id}`}
                >
                  <span className="fun-comment-avatar">
                    {initials(
                      comment.authorName,
                    )}
                  </span>

                  <div>
                    <p className="fun-comment-author">
                      {comment.authorName}
                    </p>

                    <p className="fun-comment-body">
                      {comment.body}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p
              className="fun-empty-comments"
              data-testid={`empty-fun-comments-${video.id}`}
            >
              Pas encore de commentaire. Lancez la conversation.
            </p>
          )}

          <form
            onSubmit={onCommentSubmit}
            className="fun-comment-form"
          >
            <input
              value={commentDraft}
              onChange={(event) =>
                onCommentDraft(
                  event.target.value,
                )
              }
              maxLength={280}
              placeholder="Écrire un commentaire respectueux"
              aria-label="Nouveau commentaire"
              className="fun-comment-input"
              data-testid={`input-fun-comment-${video.id}`}
            />

            <button
              type="submit"
              disabled={
                !commentDraft.trim()
                || commentPending
              }
              aria-label="Publier le commentaire"
              className="fun-send-button"
              data-testid={`button-submit-comment-fun-${video.id}`}
            >
              <Send size={16} />
            </button>
          </form>
        </section>
      )}
    </article>
  );
}

export default function FunPage() {
  const {
    user,
    isSignedIn,
    accountType,
    accountTypeLoading,
    accountTypeRequired,
    membership,
  } = usePaylocaAuth();

  const [videos, setVideos] =
    useState<FunVideo[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [loadError, setLoadError] =
    useState("");

  const [notice, setNotice] =
    useState("");

  const [publishOpen, setPublishOpen] =
    useState(false);

  const [community, setCommunity] =
    useState("");

  const [city, setCity] =
    useState("");

  const [caption, setCaption] =
    useState("");
