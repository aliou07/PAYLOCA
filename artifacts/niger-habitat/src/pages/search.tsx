import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Loader2, Search as SearchIcon, UserPlus, Check, Hash } from "lucide-react";
import { getSearchPaylocaQueryKey, useSearchPayloca, type SearchProfile } from "@workspace/api-client-react";
import { authenticatedFetch, usePaylocaAuth } from "@/auth/firebaseAuth";

function imageSource(path: string | null) {
  if (!path) return "";
  return path.startsWith("/objects/") ? `/api/storage${path}` : path;
}

function FollowButton({ profile }: { profile: SearchProfile }) {
  const { user, isSignedIn } = usePaylocaAuth();
  const [status, setStatus] = useState<"pending" | "accepted" | "rejected" | null>(null);
  const [loading, setLoading] = useState(false);
  const isOwner = user?.id === profile.userId;

  useEffect(() => {
    if (!isSignedIn || isOwner) return;
    let active = true;
    authenticatedFetch(`/api/follow/${encodeURIComponent(profile.userId)}`)
      .then(async (response) => response.ok ? response.json() as Promise<{ status: typeof status }> : null)
      .then((payload) => { if (active && payload) setStatus(payload.status); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [isSignedIn, isOwner, profile.userId]);

  const requestFollow = async () => {
    if (!isSignedIn || loading || status || isOwner) return;
    setLoading(true);
    try {
      const response = await authenticatedFetch(`/api/follow/${encodeURIComponent(profile.userId)}`, { method: "POST" });
      if (response.ok) {
        const payload = await response.json() as { status: "pending" | "accepted" | "rejected" };
        setStatus(payload.status);
      }
    } finally {
      setLoading(false);
    }
  };

  if (isOwner) return <span className="text-xs font-bold text-[#777977]">Votre profil</span>;
  if (!isSignedIn) return <Link href="/sign-in" className="rounded-full border border-[#d9cfbc] px-3 py-2 text-xs font-bold text-[#20283c]">Se connecter</Link>;
  if (status === "pending") return <span className="inline-flex items-center gap-1 rounded-full bg-[#f0e8d8] px-3 py-2 text-xs font-bold text-[#685523]">Demande envoyée</span>;
  if (status === "accepted") return <span className="inline-flex items-center gap-1 rounded-full bg-[#eef7ed] px-3 py-2 text-xs font-bold text-[#267158]"><Check size={14} /> Suivi</span>;
  if (status === "rejected") return <span className="inline-flex items-center gap-1 rounded-full bg-[#fff1ec] px-3 py-2 text-xs font-bold text-[#8f3e32]">Demande refusée</span>;
  return <button type="button" onClick={requestFollow} disabled={loading} className="inline-flex items-center gap-1 rounded-full bg-[#b95740] px-3 py-2 text-xs font-bold text-white disabled:opacity-60"><UserPlus size={14} /> {loading ? "Envoi…" : "Suivre"}</button>;
}

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const trimmedQuery = query.trim();
  const search = useSearchPayloca(
    { q: trimmedQuery || "a" },
    { query: { queryKey: getSearchPaylocaQueryKey({ q: trimmedQuery || "a" }), enabled: trimmedQuery.length > 0, staleTime: 15_000 } },
  );
  const result = trimmedQuery ? search.data : undefined;

  return (
    <div className="page-shell max-w-5xl py-10 md:py-16">
      <Link href="/" className="text-sm font-bold text-[#b95740]">← Retour à PAYLOCA</Link>
      <div className="mt-8 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.18em] text-[#b95740]">Recherche PAYLOCA</p>
          <h1 className="mt-2 font-display text-5xl font-bold tracking-[-.05em]">Trouver une personne ou une idée.</h1>
          <p className="mt-3 max-w-xl text-[#676b76]">Recherchez dans les publications et les profils publics déjà créés. Utilisez # pour un hashtag ou @ pour un profil.</p>
        </div>
        <SearchIcon className="mt-2 text-[#b95740]" size={32} />
      </div>

      <label className="mt-8 flex items-center gap-3 rounded-2xl border border-[#d9cfbc] bg-[#faf6ec] px-4 py-3 shadow-sm focus-within:border-[#b95740]">
        <SearchIcon size={20} className="shrink-0 text-[#777977]" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Ex. #maison, @Amina, Niamey…"
          className="min-w-0 flex-1 bg-transparent text-base font-medium outline-none placeholder:text-[#9b9a92]"
          aria-label="Rechercher dans PAYLOCA"
          data-testid="input-social-search"
        />
      </label>

      {!trimmedQuery && (
        <div className="mt-8 rounded-2xl border border-dashed border-[#d9cfbc] p-10 text-center text-[#676b76]">
          <SearchIcon size={36} className="mx-auto text-[#d9cfbc]" />
          <p className="mt-3 font-bold text-[#20283c]">Votre recherche apparaîtra ici</p>
        </div>
      )}
      {search.isLoading && <div className="py-12 text-center text-[#596071]"><Loader2 size={32} className="mx-auto animate-spin text-[#b95740]" /><p className="mt-3 font-semibold">Recherche en cours…</p></div>}
      {search.isError && <p role="alert" className="mt-6 rounded-xl bg-[#fff1ec] p-4 text-sm font-semibold text-[#8f3e32]">Impossible d’effectuer la recherche. Vérifiez votre connexion.</p>}

      {result && !search.isLoading && (
        <div className="mt-8 space-y-8">
          <section>
            <div className="flex items-center gap-2"><UserPlus size={18} className="text-[#b95740]" /><h2 className="font-display text-2xl font-bold">Profils publics</h2><span className="text-sm text-[#777977]">({result.profiles.length})</span></div>
            {result.profiles.length > 0 ? (
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {result.profiles.map((profile) => (
                  <article key={profile.userId} className="flex items-center gap-4 rounded-2xl border border-[#dfd7c4] bg-[#faf6ec] p-4 shadow-[0_3px_0_#e8deca]">
                    <Link href={`/profil/${encodeURIComponent(profile.userId)}`} className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-2xl bg-[#e8ddc6] text-lg font-bold text-[#596071]">
