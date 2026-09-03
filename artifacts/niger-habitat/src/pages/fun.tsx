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
          onError={(event) => {
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

      const [selectedFile, setSelectedFile] =
    useState<File | null>(null);

  const [previewUrl, setPreviewUrl] =
    useState("");

  const [duration, setDuration] =
    useState(0);

  const [publishPending, setPublishPending] =
    useState(false);

  const [activeComments, setActiveComments] =
    useState<string | number | null>(null);

  const [comments, setComments] =
    useState<
      Record<string, FunComment[]>
    >({});

  const [commentsLoading, setCommentsLoading] =
    useState<string | number | null>(null);

  const [commentDrafts, setCommentDrafts] =
    useState<Record<string, string>>({});

  const [commentPending, setCommentPending] =
    useState<string | number | null>(null);

  const [likePending, setLikePending] =
    useState<string | number | null>(null);

  const [reportingId, setReportingId] =
    useState<string | number | null>(null);

  const [reportReason, setReportReason] =
    useState(reportReasons[0].value);

  const [reportPending, setReportPending] =
    useState<string | number | null>(null);

  const uploadInput =
    useRef<HTMLInputElement>(null);

  const isAuthorized = Boolean(
    isSignedIn
    && accountType === "user"
    && membership.plan !== "free",
  );

  const canAttemptActions =
    isAuthorized
    && !accountTypeLoading;

  const loadVideos = useCallback(
    async () => {
      setLoading(true);
      setLoadError("");

      try {
        const response =
          await authenticatedFetch(
            "/api/fun/videos",
            {
              method: "GET",
              credentials: "include",
            },
          );

        if (!response.ok) {
          throw new Error(
            await responseMessage(
              response,
              "Le fil vidéo est indisponible pour le moment.",
            ),
          );
        }

        const payload =
          await response.json() as unknown;

        const raw =
          Array.isArray(payload)
            ? payload
            : payload
              && typeof payload === "object"
              && Array.isArray(
                (
                  payload as {
                    videos?: unknown;
                  }
                ).videos,
              )
                ? (
                    payload as {
                      videos: unknown[];
                    }
                  ).videos
                : [];

        setVideos(
          raw.filter(isFunVideo),
        );
      } catch (error) {
        setLoadError(
          error instanceof Error
            ? error.message
            : "Impossible de charger PAYLOCA FUN.",
        );
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void loadVideos();
  }, [loadVideos]);

  useEffect(
    () => () => {
      if (previewUrl) {
        URL.revokeObjectURL(
          previewUrl,
        );
      }
    },
    [previewUrl],
  );

  const visibleVideos = useMemo(
    () =>
      videos.filter(
        (video) =>
          !video.moderationStatus
          || video.moderationStatus
            === "approved"
          || video.moderationStatus
            === "published",
      ),
    [videos],
  );

  const showNotice = (
    message: string,
  ) => {
    setNotice(message);

    window.setTimeout(
      () => setNotice(""),
      3500,
    );
  };

  const openFilePicker = () => {
    if (!canAttemptActions) {
      return;
    }

    uploadInput.current?.click();
  };

  const onFileChange = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file =
      event.target.files?.[0];

    event.target.value = "";

    if (!file) {
      return;
    }

    if (!file.type.startsWith("video/")) {
      showNotice(
        "Choisissez une vidéo au format MP4 ou WebM.",
      );
      return;
    }

    if (
      file.size
      > 80 * 1024 * 1024
    ) {
      showNotice(
        "La vidéo ne doit pas dépasser 80 Mo.",
      );
      return;
    }

    const localUrl =
      URL.createObjectURL(file);

    const probe =
      document.createElement("video");

    probe.preload = "metadata";
    probe.src = localUrl;

    try {
      const seconds =
        await new Promise<number>(
          (resolve, reject) => {
            probe.onloadedmetadata =
              () =>
                resolve(
                  probe.duration,
                );

            probe.onerror = () =>
              reject(
                new Error(
                  "Cette vidéo ne peut pas être lue.",
                ),
              );
          },
        );

      URL.revokeObjectURL(
        localUrl,
      );

      if (
        !Number.isFinite(seconds)
        || seconds <= 0
        || seconds > 60
      ) {
        showNotice(
          "PAYLOCA FUN accepte des vidéos de 60 secondes maximum.",
        );
        return;
      }

      if (previewUrl) {
        URL.revokeObjectURL(
          previewUrl,
        );
      }

      setSelectedFile(file);
      setDuration(seconds);
      setPreviewUrl(
        URL.createObjectURL(file),
      );
      setPublishOpen(true);
    } catch {
      URL.revokeObjectURL(
        localUrl,
      );

      showNotice(
        "Cette vidéo ne peut pas être analysée. Essayez un autre fichier.",
      );
    }
  };

  const uploadVideo = async (
    file: File,
  ) => {
    const request =
      await authenticatedFetch(
        "/api/storage/uploads/fun-video/request-url",
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            name: file.name,
            size: file.size,
            contentType: file.type,
          }),
        },
      );

    if (!request.ok) {
      throw new Error(
        await responseMessage(
          request,
          "Impossible de préparer l’envoi de la vidéo.",
        ),
      );
    }
             const payload =
      await request.json() as {
        uploadURL?: string;
        objectPath?: string;
      };

    if (
      !payload.uploadURL
      || !payload.objectPath
    ) {
      throw new Error(
        "Le stockage vidéo n’a pas répondu correctement.",
      );
    }

    const upload =
      await fetch(
        payload.uploadURL,
        {
          method: "PUT",
          headers: {
            "Content-Type":
              file.type,
          },
          body: file,
        },
      );

    if (!upload.ok) {
      throw new Error(
        "La vidéo n’a pas pu être envoyée. Réessayez.",
      );
    }

    return payload.objectPath;
  };

  const publish = async (
    event: FormEvent,
  ) => {
    event.preventDefault();

    if (
      !canAttemptActions
      || !selectedFile
      || !community
      || !city
      || !caption.trim()
    ) {
      return;
    }

    setPublishPending(true);

    try {
      const videoUrl =
        await uploadVideo(selectedFile);

      const payload = {
        clientVideoId:
          crypto.randomUUID(),
        community,
        city,
        caption: caption.trim(),
        videoUrl,
        contentType:
          selectedFile.type,
        sizeBytes:
          selectedFile.size,
        durationSeconds:
          Math.round(duration),
      };

      const response =
        await authenticatedFetch(
          "/api/fun/videos",
          {
            method: "POST",
            credentials: "include",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify(
              payload,
            ),
          },
        );

      if (!response.ok) {
        throw new Error(
          await responseMessage(
            response,
            "La publication n’a pas pu être envoyée.",
          ),
        );
      }

      const created =
        await response
          .json()
          .catch(() => null) as unknown;

      if (isFunVideo(created)) {
        setVideos((current) => [
          created,
          ...current,
        ]);
      }

      setPublishOpen(false);
      setSelectedFile(null);
      setCaption("");
      setCommunity("");
      setCity("");
      setDuration(0);

      if (previewUrl) {
        URL.revokeObjectURL(
          previewUrl,
        );
      }

      setPreviewUrl("");

      showNotice(
        "Vidéo envoyée. Elle sera visible après la vérification de sécurité.",
      );

      if (!isFunVideo(created)) {
        void loadVideos();
      }
    } catch (error) {
      showNotice(
        error instanceof Error
          ? error.message
          : "Publication impossible. Réessayez.",
      );
    } finally {
      setPublishPending(false);
    }
  };

  const likeVideo = async (
    video: FunVideo,
  ) => {
    if (
      !canAttemptActions
      || likePending === video.id
    ) {
      if (!isSignedIn) {
        showNotice(
          "Connectez-vous pour réagir à une vidéo.",
        );
      }

      return;
    }

    setLikePending(video.id);

    try {
      const response =
        await authenticatedFetch(
          `/api/fun/videos/${video.id}/like`,
          {
            method: "POST",
            credentials: "include",
          },
        );

      if (!response.ok) {
        throw new Error(
          await responseMessage(
            response,
            "Votre réaction n’a pas pu être enregistrée.",
          ),
        );
      }

      setVideos((current) =>
        current.map((item) =>
          item.id === video.id
            ? {
                ...item,
                likedByViewer:
                  !item.likedByViewer,
              }
            : item,
        ),
      );
    } catch (error) {
      showNotice(
        error instanceof Error
          ? error.message
          : "Réaction impossible.",
      );
    } finally {
      setLikePending(null);
    }
  };

  const toggleComments = async (
    video: FunVideo,
  ) => {
    if (
      activeComments === video.id
    ) {
      setActiveComments(null);
      return;
    }

    setActiveComments(video.id);

    if (comments[video.id]) {
      return;
    }

    setCommentsLoading(video.id);

    try {
      const response =
        await authenticatedFetch(
          `/api/fun/videos/${video.id}/comments`,
          {
            method: "GET",
            credentials: "include",
          },
        );

      if (!response.ok) {
        throw new Error(
          await responseMessage(
            response,
            "Les commentaires sont indisponibles.",
          ),
        );
      }

      const payload =
        await response.json() as unknown;

      const raw =
        Array.isArray(payload)
          ? payload
          : payload
            && typeof payload === "object"
            && Array.isArray(
              (
                payload as {
                  comments?: unknown;
                }
              ).comments,
            )
              ? (
                  payload as {
                    comments: unknown[];
                  }
                ).comments
              : [];

      setComments((current) => ({
        ...current,
        [video.id]:
          raw.filter(isFunComment),
      }));
    } catch (error) {
      showNotice(
        error instanceof Error
          ? error.message
          : "Impossible de charger les commentaires.",
      );

      setComments((current) => ({
        ...current,
        [video.id]: [],
      }));
    } finally {
      setCommentsLoading(null);
    }
  };

  const submitComment = async (
    event: FormEvent,
    video: FunVideo,
  ) => {
    event.preventDefault();

    const body =
      commentDrafts[video.id]?.trim();

    if (
      !canAttemptActions
      || !body
      || commentPending === video.id
    ) {
      if (!isSignedIn) {
        showNotice(
          "Connectez-vous pour commenter.",
        );
      }

      return;
    }

    setCommentPending(video.id);

    try {
      const response =
        await authenticatedFetch(
          `/api/fun/videos/${video.id}/comments`,
          {
            method: "POST",
            credentials: "include",
                      headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              body,
            }),
          },
        );

      if (!response.ok) {
        throw new Error(
          await responseMessage(
            response,
            "Le commentaire n’a pas pu être publié.",
          ),
        );
      }

      const created =
        await response
          .json()
          .catch(() => null) as unknown;

      if (isFunComment(created)) {
        setComments((current) => ({
          ...current,
          [video.id]: [
            ...(current[video.id] ?? []),
            created,
          ],
        }));
      }

      setVideos((current) =>
        current.map((item) =>
          item.id === video.id
            ? {
                ...item,
                commentsCount:
                  item.commentsCount + 1,
              }
            : item,
        ),
      );

      setCommentDrafts((current) => ({
        ...current,
        [video.id]: "",
      }));
    } catch (error) {
      showNotice(
        error instanceof Error
          ? error.message
          : "Commentaire impossible.",
      );
    } finally {
      setCommentPending(null);
    }
  };

  const submitReport = async (
    event: FormEvent,
    video: FunVideo,
  ) => {
    event.preventDefault();

    if (
      !canAttemptActions
      || reportPending === video.id
    ) {
      if (!isSignedIn) {
        showNotice(
          "Connectez-vous pour signaler une vidéo.",
        );
      }

      return;
    }

    setReportPending(video.id);

    try {
      const response =
        await authenticatedFetch(
          `/api/fun/videos/${video.id}/reports`,
          {
            method: "POST",
            credentials: "include",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              reason: reportReason,
            }),
          },
        );

      if (!response.ok) {
        throw new Error(
          await responseMessage(
            response,
            "Le signalement n’a pas pu être envoyé.",
          ),
        );
      }

      setReportingId(null);

      showNotice(
        "Merci. Votre signalement a été transmis à l’équipe de modération.",
      );
    } catch (error) {
      showNotice(
        error instanceof Error
          ? error.message
          : "Signalement impossible.",
      );
    } finally {
      setReportPending(null);
    }
  };

  const closeComposer = () => {
    if (publishPending) {
      return;
    }

    setPublishOpen(false);
    setSelectedFile(null);
    setCaption("");

    if (previewUrl) {
      URL.revokeObjectURL(
        previewUrl,
      );
    }

    setPreviewUrl("");
  };

  return (
    <div className="fun-page">
      <div className="fun-page-shell">
        <header className="fun-hero rise-in">
          <div className="fun-hero-copy">
            <div className="fun-kicker">
              <span className="fun-live-dot" />
              PAYLOCA FUN
            </div>

            <h1 data-testid="heading-payloca-fun">
              Le Niger en mouvement.
            </h1>

            <p data-testid="text-fun-intro">
              Des vidéos courtes, des voix locales, un espace qui respecte chacun.
            </p>

            <div
              className="fun-safe-note"
              data-testid="status-fun-safety"
            >
              <ShieldCheck size={16} />
              Modération active · Aucun classement · Pas d’annonces immobilières
            </div>
          </div>

          <div
            className="fun-hero-mark"
            aria-hidden="true"
          >
            <span>
              FUN
            </span>

            <Sparkles size={28} />
          </div>
        </header>

        <div
          className="fun-subnav"
          data-testid="navigation-fun-context"
        >
          <span className="fun-subnav-active">
            Fil vidéo
          </span>

          <span className="fun-subnav-muted">
            PAYLOCA immobilier reste dans Les annonces
          </span>

          <Link
            href="/stories"
            className="fun-subnav-link"
            data-testid="link-legacy-stories"
          >
            Ancien parcours Stories
          </Link>
        </div>

        {!isSignedIn ? (
          <section
            className="fun-access-card rise-in-delay"
            data-testid="status-fun-unauthenticated"
          >
            <div className="fun-access-icon">
              <ShieldCheck size={22} />
            </div>

            <div>
              <h2>
                Regarder est ouvert à tous.
              </h2>

              <p>
                Connectez-vous pour aimer, commenter, signaler ou partager une vidéo. La publication est réservée aux comptes utilisateur PAYLOCA.
              </p>
            </div>

            <Link
              href="/sign-in"
              className="fun-dark-button"
              data-testid="link-signin-fun"
            >
              Se connecter
            </Link>
          </section>
        ) : accountTypeLoading ? (
          <section
            className="fun-access-card fun-access-loading"
            data-testid="status-fun-authorisation-loading"
          >
            <div className="fun-mini-skeleton" />

            <p>
              Vérification de votre espace…
            </p>
          </section>
        ) : !isAuthorized ? (
          <section
            className="fun-access-card fun-access-restricted rise-in-delay"
            data-testid="status-fun-unauthorized"
          >
            <div className="fun-access-icon">
              <ShieldCheck size={22} />
            </div>

            <div>
              <h2>
                Cet espace est réservé aux comptes utilisateur.
              </h2>

              <p>
                {accountTypeRequired
                  ? "Terminez la configuration de votre compte pour accéder à cette fonctionnalité."
                  : "Choisissez l’espace utilisateur pour publier et interagir dans PAYLOCA FUN."}
              </p>
            </div>

            <Link
              href={
                accountTypeRequired
                  ? "/sign-in"
                  : "/"
              }
              className="fun-outline-button"
              data-testid="link-fun-authorized-space"
            >
              {accountTypeRequired
                ? "Configurer mon compte"
                : "Retour à mon espace"}
            </Link>
          </section>
        ) : (
          <section
            className="fun-publish-entry rise-in-delay"
            data-testid="panel-fun-publish-entry"
          >
            <div className="fun-publish-avatar">
              {initials(
                user?.fullName ?? "",
              )}
            </div>

            <div className="min-w-0 flex-1">
              <p className="fun-publish-label">
                Une idée à montrer ?
              </p>

              <p className="fun-publish-hint">
                Partagez une vidéo de 60 secondes maximum.
              </p>
            </div>

            <button
              type="button"
              onClick={openFilePicker}
              className="fun-publish-button"
              data-testid="button-open-fun-publisher"
            >
              <Plus size={18} />
              Publier
            </button>

            <input
              ref={uploadInput}
              type="file"
              accept="video/mp4,video/webm,video/quicktime,video/*"
              onChange={(event) =>
                void onFileChange(event)
              }
              className="hidden"
              data-testid="input-fun-video-file"
            />
          </section>
        )}

        {notice && (
          <div
            role="status"
            className="fun-toast"
            data-testid="status-fun-feedback"
          >
            <Check size={17} />
            {notice}
          </div>
        )}

        {publishOpen
          && canAttemptActions && (
            <div
              className="fun-composer-wrap rise-in"
              data-testid="panel-fun-composer"
            >
              <form
                onSubmit={publish}
                className="fun-composer"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="fun-kicker">
                      NOUVELLE VIDÉO
                    </p>

                    <h2>
                      Publier dans FUN
                    </h2>
                  </div>

                  <button
                    type="button"
                    onClick={closeComposer}
                    aria-label="Fermer la publication"
                    className="fun-icon-button"
                    data-testid="button-close-fun-composer"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="fun-composer-preview">
                  {previewUrl ? (
                    <video
                      src={previewUrl}
                      muted
                      playsInline
                      controls
                      className="fun-preview-video"
                      data-testid="video-fun-preview"
                    />
                  ) : (
                    <div className="fun-preview-empty">
                      <Upload size={22} />
                      <span>
                        Votre aperçu vidéo
                      </span>
                    </div>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="fun-field">
                    <span>
                      Communauté
                    </span>

                    <select
                      required
                      value={community}
                      onChange={(event) =>
                        setCommunity(
                          event.target.value,
                        )
                      }
                      className="fun-select"
                      data-testid="select-fun-community"
                    >
                      <option value="">
                        Choisir
                      </option>

                      {communities.map(
                        (item) => (
                          <option
                            key={item}
                            value={item}
                          >
                            {item}
                          </option>
                        ),
                      )}
                    </select>
                  </label>

                  <label className="fun-field">
                    <span>
                      Ville
                    </span>

                    <select
                      required
                      value={city}
                      onChange={(event) =>
                        setCity(
                          event.target.value,
                        )
                      }
                      className="fun-select"
                      data-testid="select-fun-city"
                    >
                      <option value="">
                        Choisir
                      </option>

                      {cities.map(
                        (item) => (
                          <option
                            key={item}
                            value={item}
                          >
                            {item}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                </div>
                                </div>

                <label className="fun-field">
                  <span>
                    Légende
                  </span>

                  <textarea
                    required
                    value={caption}
                    onChange={(event) =>
                      setCaption(
                        event.target.value,
                      )
                    }
                    maxLength={500}
                    rows={3}
                    placeholder="Dites quelque chose de vrai, utile ou joyeux."
                    className="fun-textarea"
                    data-testid="textarea-fun-caption"
                  />
                </label>

                <p className="fun-guideline">
                  <ShieldCheck size={15} />
                  Pas de coordonnées privées, de violence, ni de contenu humiliant. Les vidéos sont vérifiées avant publication.
                </p>

                <div className="flex items-center justify-between gap-3">
                  <span className="fun-file-meta">
                    {selectedFile?.name} ·{" "}
                    {formatDuration(duration)}
                  </span>

                  <button
                    type="submit"
                    disabled={
                      publishPending
                      || !selectedFile
                      || !community
                      || !city
                      || !caption.trim()
                    }
                    className="fun-dark-button"
                    data-testid="button-submit-fun-video"
                  >
                    {publishPending
                      ? "Envoi en cours…"
                      : "Envoyer pour vérification"}
                  </button>
                </div>
              </form>
            </div>
          )}

          <main
            className="fun-feed"
            data-testid="list-fun-videos"
          >
            <div className="fun-feed-heading">
              <div>
                <p className="fun-kicker">
                  À DÉCOUVRIR
                </p>

                <h2>
                  Le fil du moment
                </h2>
              </div>

              <span className="fun-feed-rule" />
            </div>

            {loading && <FunSkeleton />}

            {!loading && loadError && (
              <div
                className="fun-state fun-state-error"
                role="alert"
                data-testid="status-fun-error"
              >
                <AlertTriangle size={25} />

                <h2>
                  Le fil fait une pause.
                </h2>

                <p>
                  {loadError}
                </p>

                <button
                  type="button"
                  onClick={() =>
                    void loadVideos()
                  }
                  className="fun-outline-button"
                  data-testid="button-retry-fun-videos"
                >
                  <RefreshCcw size={15} />
                  Réessayer
                </button>
              </div>
            )}

            {!loading
              && !loadError
              && visibleVideos.length
                === 0 && (
                <div
                  className="fun-state fun-state-empty"
                  data-testid="status-fun-empty"
                >
                  <div className="fun-empty-mark">
                    <CirclePlay size={28} />
                  </div>

                  <h2>
                    Le fil commence ici.
                  </h2>

                  <p>
                    Aucune vidéo n’est encore disponible. Revenez bientôt ou soyez le premier compte jeune à partager un moment local.
                  </p>

                  {canAttemptActions && (
                    <button
                      type="button"
                      onClick={openFilePicker}
                      className="fun-dark-button"
                      data-testid="button-empty-fun-publish"
                    >
                      <Upload size={16} />
                      Ajouter une vidéo
                    </button>
                  )}
                </div>
              )}

            {!loading
              && !loadError
              && visibleVideos.map(
                (video) => (
                  <FunVideoCard
                    key={video.id}
                    video={video}
                    onLike={(item) =>
                      void likeVideo(item)
                    }
                    likePending={
                      likePending
                      === video.id
                    }
                    onComments={(item) =>
                      void toggleComments(item)
                    }
                    commentsOpen={
                      activeComments
                      === video.id
                    }
                    comments={
                      comments[video.id]
                    }
                    commentsLoading={
                      commentsLoading
                      === video.id
                    }
                    commentDraft={
                      commentDrafts[
                        video.id
                      ] ?? ""
                    }
                    onCommentDraft={(
                      value,
                    ) =>
                      setCommentDrafts(
                        (current) => ({
                          ...current,
                          [video.id]:
                            value,
                        }),
                      )
                    }
                    onCommentSubmit={(
                      event,
                    ) =>
                      void submitComment(
                        event,
                        video,
                      )
                    }
                    commentPending={
                      commentPending
                      === video.id
                    }
                    reportOpen={
                      reportingId
                      === video.id
                    }
                    reportReason={
                      reportReason
                    }
                    onReportReason={
                      setReportReason
                    }
                    onReportSubmit={(
                      event,
                    ) =>
                      void submitReport(
                        event,
                        video,
                      )
                    }
                    reportPending={
                      reportPending
                      === video.id
                    }
                    onCloseReport={() =>
                      setReportingId(null)
                    }
                    onReport={(item) => {
                      if (
                        !canAttemptActions
                      ) {
                        showNotice(
                          isSignedIn
                            ? "Votre compte ne peut pas signaler dans PAYLOCA FUN."
                            : "Connectez-vous pour signaler une vidéo.",
                        );
                        return;
                      }

                      setReportingId(
                        item.id,
                      );

                      setReportReason(
                        reportReasons[0]
                          .value,
                      );
                    }}
                  />
                ),
              )}
          </main>
        </div>
      </div>
    </div>
  );
}
