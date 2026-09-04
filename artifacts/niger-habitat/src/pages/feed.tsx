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

  const queryClient = useQueryClient();

  const [community, setCommunity] = useState("");
  const [city, setCity] = useState("");
  const [caption, setCaption] = useState("");
  const [notice, setNotice] = useState("");
  const [storedLocalQueue, setLocalQueue] = useState<QueuedFeedPost[]>([]);

  const activeUserId = useRef<string | null>(user?.id ?? null);
  activeUserId.current = user?.id ?? null;

  const localQueue = storedLocalQueue.filter(
    (item) => item.userId === activeUserId.current,
  );

  useEffect(() => {
    if (user) {
      try {
        const saved = JSON.parse(
          localStorage.getItem(`payloca-feed-prefs-${user.id}`) ?? "{}",
        );

        setCommunity(typeof saved.community === "string" ? saved.community : "");
        setCity(typeof saved.city === "string" ? saved.city : "");
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
    if (user && (community !== "" || city !== "")) {
      localStorage.setItem(
        `payloca-feed-prefs-${user.id}`,
        JSON.stringify({ community, city }),
      );

      setNotice(
        "Vos préférences sont enregistrées. Le fil mettra en avant votre communauté et ville.",
      );

      setTimeout(() => setNotice(""), 3000);
    }
  };

  const {
    data: serverPosts,
    isLoading: postsLoading,
    isError: postsError,
  } = useListFeedPosts();

  const loadLocalQueue = useCallback(async () => {
    if (!user) return setLocalQueue([]);

    const ownerId = user.id;

    try {
      const items = await listQueuedFeedPosts(ownerId);

      commitAccountScopedResult(ownerId, () => activeUserId.current, items, setLocalQueue);
    } catch {
      if (activeUserId.current === ownerId) {
        setNotice("Le stockage hors connexion n’est pas disponible sur cet appareil.");
      }
    }
  }, [user]);

  useEffect(() => {
    void loadLocalQueue();
  }, [loadLocalQueue]);

  const flushQueuePass = useCallback(async () => {
    if (!user) return;

    const ownerId = user.id;
    const queued = await listQueuedFeedPosts(ownerId);
    let needsRefetch = false;

    const saveAndRefresh = async (item: QueuedFeedPost) => {
      await saveQueuedFeedPost(item);
      if (activeUserId.current === ownerId) {
        await loadLocalQueue();
      }
    };

    await processFeedQueueItems({
      items: queued,
      isCurrentOwner: () => activeUserId.current === ownerId,
      save: saveAndRefresh,
      send: async (item) => {
        try {
          const response = await authenticatedFetchForUser(ownerId, "/api/feed/posts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(item.input),
          });

          if (response.status === 201) {
            await deleteQueuedFeedPost(item.id, ownerId);
            needsRefetch = true;
          } else if (response.status >= 400 && response.status < 500) {
            const errBody = await response.json().catch(() => ({}));
            await saveAndRefresh({
              ...item,
              status: "failed",
              lastError: errBody.error || "Cette publication doit être corrigée avant un nouvel essai.",
            });
          } else {
            await saveAndRefresh({
              ...item,
              status: "queued",
              lastError: "Serveur indisponible, réessai automatique",
            });
          }
        } catch {
          await saveAndRefresh({
            ...item,
            status: "queued",
            lastError: "Hors ligne, en attente de connexion",
          });
        }
      },
    });

    if (activeUserId.current === ownerId) {
      await loadLocalQueue();
    }

    if (needsRefetch && activeUserId.current === ownerId) {
      queryClient.invalidateQueries({ queryKey: getListFeedPostsQueryKey() });
      setNotice("Publication synchronisée avec le fil PAYLOCA.");
    }
  }, [user, queryClient, loadLocalQueue]);

  const flushQueue = useMemo(() => createFeedQueueFlusher(flushQueuePass, () => navigator.onLine), [flushQueuePass]);

  useEffect(() => {
    if (!user) return;

    flushQueue();

    const onOnline = () => flushQueue();
    const onVisibility = () => {
      if (document.visibilityState === "visible") flushQueue();
    };

    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [user, flushQueue]);

  const publish = async (event: FormEvent) => {
    event.preventDefault();

    if (!caption.trim() || !user) return;

    const clientPostId = crypto.randomUUID();

    const input = {
      clientPostId,
      community: community || "Autre",
      city: city || "Non précisée",
      caption: caption.trim(),
    };

    const newRecord: QueuedFeedPost = {
      id: clientPostId,
      userId: user.id,
      authorName: user.fullName || "Utilisateur",
      input,
      createdAt: Date.now(),
      status: "queued",
    };

    try {
      await saveQueuedFeedPost(newRecord);
      setCaption("");

      setNotice(
        navigator.onLine
          ? "Publication enregistrée localement, synchronisation en cours."
          : "Publication enregistrée sur cet appareil. Elle sera synchronisée au retour de la connexion.",
      );

      await loadLocalQueue();
      flushQueue();
    } catch {
      setNotice("Impossible d’enregistrer cette publication sur l’appareil. Elle n’a pas été publiée.");
    }
  };

  const retryFailed = async (id: string) => {
    if (!user) return;

    const queued = await listQueuedFeedPosts(user.id);
    const item = queued.find((queueItem) => queueItem.id === id);

    if (item) {
      await saveQueuedFeedPost({ ...item, status: "queued", lastError: undefined });
      await loadLocalQueue();
      flushQueue();
    }
  };

  const serverClientPostIds = new Set(serverPosts?.map((post) => post.clientPostId) || []);

  const visibleQueue = localQueue.filter((queueItem) => !serverClientPostIds.has(queueItem.input.clientPostId));

  const orderedServerPosts = useMemo(() => {
    if (!serverPosts) return [];

    const sorted = [...serverPosts].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    if (!community && !city) return sorted;

    const sameCommunityAndCity = sorted.filter((post) => post.community === community && post.city === city);
    const sameCommunity = sorted.filter((post) => post.community === community && post.city !== city);
    const sameCity = sorted.filter((post) => post.city === city && post.community !== community);
    const rest = sorted.filter((post) => post.community !== community && post.city !== city);

    return [...sameCommunityAndCity, ...sameCommunity, ...sameCity, ...rest];
  }, [serverPosts, community, city]);

  return (
    <div className="page-shell max-w-3xl py-8 md:py-12">
      <div className="flex items-end justify-between gap-4">
        <div>
          <span className="text-xs font-bold uppercase tracking-[.18em] text-[#b95740]">Le fil PAYLOCA</span>

          <h1 className="mt-2 font-display text-4xl font-bold text-[#20283c]">Les gens, les idées, les lieux.</h1>

          <p className="mt-2 text-sm text-[#676b76]">Un fil unique, mélangé automatiquement pour découvrir le Niger.</p>
        </div>

        <Users className="text-[#b95740]" size={30} />
      </div>

      {!isSignedIn ? (
        <div className="mt-8 rounded-2xl border border-[#dfd7c4] bg-[#faf6ec] p-6 text-center shadow-sm">
          <p className="text-lg font-bold text-[#20283c]">Connectez-vous pour publier</p>

          <p className="mt-1 text-sm text-[#596071]">Rejoignez la communauté PAYLOCA pour partager vos idées.</p>

          <Link href="/sign-in" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#20283c] px-6 py-3 text-sm font-bold text-[#f7e8b4]">
            Se connecter
          </Link>
        </div>
      ) : (
        <form onSubmit={publish} className="mt-8 rounded-2xl border border-[#dfd7c4] bg-[#faf6ec] p-5 shadow-sm transition-all focus-within:border-[#b95740] focus-within:shadow-[0_4px_16px_rgba(185,87,64,0.12)]">
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <select
              aria-label="Communauté"
              value={community}
              onChange={(event) => setCommunity(event.target.value)}
              onBlur={saveProfile}
              className="rounded-xl border border-[#d9cfbc] bg-[#f4efdf] p-3 text-sm font-medium text-[#20283c] outline-none focus:border-[#b95740] focus:ring-1 focus:ring-[#b95740]"
            >
              <option value="">Votre communauté (facultatif)</option>
              {communities.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>

            <select
              aria-label="Ville"
              value={city}
              onChange={(event) => setCity(event.target.value)}
              onBlur={saveProfile}
              className="rounded-xl border border-[#d9cfbc] bg-[#f4efdf] p-3 text-sm font-medium text-[#20283c] outline-none focus:border-[#b95740] focus:ring-1 focus:ring-[#b95740]"
            >
              <option value="">Votre ville (facultatif)</option>
              {cities.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <textarea
              aria-label="Votre publication"
              value={caption}
              onChange={(event) => setCaption(event.target.value)}
              maxLength={700}
              rows={3}
              placeholder="Partagez une idée ou un conseil avec votre communauté..."
              className="min-w-0 flex-1 resize-y rounded-xl border border-[#d9cfbc] bg-white p-3 text-sm font-medium text-[#20283c] outline-none focus:border-[#b95740] focus:ring-1"
            />

            <button type="submit" disabled={!caption.trim()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#b95740] px-6 py-3 text-sm font-bold text-white shadow-sm transition-transform active:scale-95 disabled:opacity-50">
              <Send size={16} /> Publier
            </button>
          </div>
        </form>
      )}

      {notice && (
        <p role="status" className="mt-4 animate-in slide-in-from-top-2 rounded-xl border border-[#a3d9b1] bg-[#eef7ed] p-3 text-sm font-semibold text-[#267158]">
          {notice}
        </p>
      )}

      <div className="mt-10 space-y-6">
        {postsLoading && visibleQueue.length === 0 && (
          <div className="py-12 text-center text-[#596071]">
            <Loader2 size={32} className="mx-auto animate-spin text-[#d9cfbc]" />
            <p className="mt-4 font-semibold">Chargement du fil...</p>
          </div>
        )}

        {postsError && (
          <div className="rounded-2xl border border-[#dca79b] bg-[#fff1ec] p-6 text-center text-[#9d3526]">
            <AlertCircle size={32} className="mx-auto mb-3" />
            <p className="font-bold">Impossible de charger le fil</p>
            <p className="mt-1 text-sm">Vérifiez votre connexion internet.</p>
          </div>
        )}

        {!postsLoading && orderedServerPosts.length === 0 && visibleQueue.length === 0 && !postsError && (
          <div className="rounded-2xl border border-dashed border-[#d9cfbc] bg-transparent p-12 text-center text-[#596071]">
            <Users size={40} className="mx-auto mb-4 text-[#d9cfbc]" />
            <p className="text-lg font-bold text-[#20283c]">Le fil est vide</p>
            <p className="mt-1 text-sm">Soyez le premier à publier un message pour la communauté.</p>
          </div>
        )}

        {visibleQueue.map((item) => (
          <article key={item.id} className="overflow-hidden rounded-2xl border border-[#d9cfbc] bg-[#faf6ec]/60 shadow-sm transition-opacity">
            <div className="flex items-center justify-between border-b border-[#e7dfcf]/50 bg-[#f4efdf]/50 p-4">
              <div>
                <p className="font-bold text-[#20283c]">{item.authorName}</p>
                <span className="text-xs font-medium text-[#777977]">{item.input.community} · {item.input.city}</span>
              </div>

              {item.status === "sending" && (
                <span className="flex items-center gap-1.5 rounded-full bg-[#e8ddc6] px-3 py-1.5 text-xs font-bold text-[#596071]">
                  <Loader2 size={12} className="animate-spin" /> Envoi...
                </span>
              )}

              {item.status === "queued" && (
                <span className="flex items-center gap-1.5 rounded-full bg-[#f0e8d8] px-3 py-1.5 text-xs font-bold text-[#596071]"><Clock size={12} /> En attente de connexion</span>
              )}

              {item.status === "failed" && (
                <span className="flex items-center gap-1.5 rounded-full bg-[#fff1eb] px-3 py-1.5 text-xs font-bold text-[#8f3e32]"><AlertCircle size={12} /> Non publié</span>
              )}
            </div>

            <div className="bg-[#e8ddc6]/30 px-5 py-6 text-base font-medium leading-relaxed text-[#596071]">{item.input.caption}</div>

            {item.status === "failed" && (
              <div className="flex items-center justify-between border-t border-[#dca79b]/40 bg-[#fff1ec] p-4">
                <span className="text-xs font-medium text-[#9d3526]">{item.lastError}</span>
                <button type="button" onClick={() => retryFailed(item.id)} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold text-[#b95740] transition-colors hover:bg-[#f4dcd6] hover:text-[#8f3e32]">
                  <RefreshCcw size={12} /> Réessayer
                </button>
              </div>
            )}
          </article>
        ))}

        {orderedServerPosts.map((post) => (
          <article key={post.id} className="overflow-hidden rounded-2xl border border-[#dfd7c4] bg-[#faf6ec] shadow-[0_4px_0_#e8deca]">
            <div className="flex items-center justify-between border-b border-[#e7dfcf] p-4">
              <div>
                <p className="font-bold text-[#20283c]">{post.authorName}</p>
                <span className="text-xs font-medium text-[#777977]">{post.community} · {post.city}</span>
              </div>

              <span className="rounded-full bg-[#f0dfae] px-3 py-1.5 text-xs font-bold text-[#685523]">{post.category || "Communauté"}</span>
            </div>

            <div className="bg-[#e8ddc6] px-5 py-8 text-lg font-semibold leading-relaxed text-[#20283c]">{post.caption}</div>
          </article>
        ))}
      </div>
    </div>
  );
}
