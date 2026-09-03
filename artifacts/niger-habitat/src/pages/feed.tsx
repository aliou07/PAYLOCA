import {
  useEffect,
  useMemo,
  useState,
  useRef,
  useCallback,
  type FormEvent,
} from "react";
import {
  Send,
  Users,
  AlertCircle,
  Clock,
  RefreshCcw,
  Loader2,
} from "lucide-react";
import {
  usePaylocaAuth,
  authenticatedFetchForUser,
} from "@/auth/firebaseAuth";
import {
  useListFeedPosts,
  getListFeedPostsQueryKey,
} from "@workspace/api-client-react";
import {
  listQueuedFeedPosts,
  saveQueuedFeedPost,
  deleteQueuedFeedPost,
  type QueuedFeedPost,
} from "@/lib/offlineData";
import {
  createFeedQueueFlusher,
  processFeedQueueItems,
} from "@/lib/feedQueueControl";
import {
  commitAccountScopedResult,
} from "@/lib/accountScopedLocalData";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";

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

export default function FeedPage() {
  const {
    user,
    isSignedIn,
  } = usePaylocaAuth();

  const queryClient =
    useQueryClient();

  const [community, setCommunity] =
    useState("");

  const [city, setCity] =
    useState("");

  const [caption, setCaption] =
    useState("");

  const [notice, setNotice] =
    useState("");

  const [storedLocalQueue, setLocalQueue] =
    useState<QueuedFeedPost[]>([]);

  const activeUserId =
    useRef<string | null>(
      user?.id ?? null,
    );

  activeUserId.current =
    user?.id ?? null;

  const localQueue =
    storedLocalQueue.filter(
      (item) =>
        item.userId
        === activeUserId.current,
    );

  useEffect(() => {
    if (user) {
      try {
        const saved =
          JSON.parse(
            localStorage.getItem(
              `payloca-feed-prefs-${user.id}`,
            ) ?? "{}",
          );

        setCommunity(
          typeof saved.community
            === "string"
            ? saved.community
            : "",
        );

        setCity(
          typeof saved.city === "string"
            ? saved.city
            : "",
        );
      } catch {
        setCommunity("");
        setCity("");
      }
    } else {
      setCommunity("");
      setCity("");
    }
  }, [user]);

  const saveProfile = () => {
    if (
      user
      && (
        community !== ""
        || city !== ""
      )
    ) {
      localStorage.setItem(
        `payloca-feed-prefs-${user.id}`,
        JSON.stringify({
          community,
          city,
        }),
      );

      setNotice(
        "Vos préférences sont enregistrées. Le fil mettra en avant votre communauté et ville.",
      );

      setTimeout(
        () => setNotice(""),
        3000,
      );
    }
  };

  const {
    data: serverPosts,
    isLoading: postsLoading,
    isError: postsError,
  } = useListFeedPosts();

  const loadLocalQueue =
    useCallback(async () => {
      if (!user) {
        return setLocalQueue([]);
      }

      const ownerId = user.id;

      try {
        const items =
          await listQueuedFeedPosts(
            ownerId,
          );

        commitAccountScopedResult(
          ownerId,
          () => activeUserId.current,
          items,
          setLocalQueue,
        );
      } catch {
        if (
          activeUserId.current
          === ownerId
        ) {
          setNotice(
            "Le stockage hors connexion n’est pas disponible sur cet appareil.",
          );
        }
      }
    }, [user]);

  useEffect(() => {
    loadLocalQueue();
  }, [loadLocalQueue]);

  const flushQueuePass =
    useCallback(async () => {
      if (!user) {
        return;
      }

      const ownerId = user.id;

      const queued =
        await listQueuedFeedPosts(
          ownerId,
        );

      let needsRefetch = false;

      const saveAndRefresh =
        async (
          item: QueuedFeedPost,
        ) => {
          await saveQueuedFeedPost(
            item,
          );

          if (
            activeUserId.current
            === ownerId
          ) {
            await loadLocalQueue();
          }
        };

      await processFeedQueueItems({
        items: queued,
        isCurrentOwner: () =>
          activeUserId.current
          === ownerId,
        save: saveAndRefresh,
        send: async (item) => {
          try {
            const response =
              await authenticatedFetchForUser(
                ownerId,
                "/api/feed/posts",
                {
                  method: "POST",
                  headers: {
                    "Content-Type":
                      "application/json",
                  },
                  body: JSON.stringify(
                    item.input,
                  ),
                },
              );

            if (
              response.status === 201
            ) {
              await deleteQueuedFeedPost(
                item.id,
                ownerId,
              );

              needsRefetch = true;
            } else if (
              response.status >= 400
              && response.status < 500
            ) {
              const errBody =
                await response
                  .json()
                  .catch(() => ({}));

              await saveAndRefresh({
                ...item,
                status: "failed",
                lastError:
                  errBody.error
                  || "Cette publication doit être corrigée avant un nouvel essai.",
              });
            } else {
              await saveAndRefresh({
                ...item,
                status: "queued",
                lastError:
                  "Serveur indisponible, réessai automatique",
              });
            }
          } catch {
            await saveAndRefresh({
              ...item,
              status: "queued",
              lastError:
                "Hors ligne, en attente de connexion",
            });
          }
        },
      });
