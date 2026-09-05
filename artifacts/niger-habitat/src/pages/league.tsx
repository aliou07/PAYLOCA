import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { Loader2, Flame, Trophy } from "lucide-react";
import {
  getGetMyStreakQueryKey,
  getGetStreakLeaderboardQueryKey,
  useGetMyStreak,
  useGetStreakLeaderboard,
  useRecordStreakActivity,
} from "@workspace/api-client-react";
import { usePaylocaAuth } from "@/auth/firebaseAuth";
import { useQueryClient } from "@tanstack/react-query";

const leagues = [
  { name: "LÉGENDE", icon: "👑", min: 10000, color: "#e9b949" },
  { name: "DIAMANT", icon: "💎", min: 4000, color: "#72b7d9" },
  { name: "OR", icon: "🥇", min: 2000, color: "#d99a31" },
  { name: "ARGENT", icon: "🥈", min: 800, color: "#8997a6" },
  { name: "BRONZE", icon: "🥉", min: 300, color: "#b8784e" },
  { name: "ESPOIR", icon: "✨", min: 0, color: "#8b9b55" },
] as const;

const cities = ["Toutes les villes", "Niamey", "Zinder", "Maradi", "Agadez", "Tahoua"];

function leagueFor(score: number) {
  return leagues.find((league) => score >= league.min) ?? leagues[leagues.length - 1];
}

export default function LeaguePage() {
  const { user, isSignedIn } = usePaylocaAuth();
  const queryClient = useQueryClient();
  const [city, setCity] = useState("Toutes les villes");
  const recordedFor = useRef<string | null>(null);
  const streakQuery = useGetMyStreak({ query: { queryKey: getGetMyStreakQueryKey(), enabled: isSignedIn } });
  const leaderboardQuery = useGetStreakLeaderboard(
    city === "Toutes les villes" ? undefined : { city },
    { query: { queryKey: getGetStreakLeaderboardQueryKey(city === "Toutes les villes" ? undefined : { city }), staleTime: 15_000 } },
  );
  const recordActivity = useRecordStreakActivity();

  useEffect(() => {
    if (!user?.id || recordedFor.current === user.id) return;
    recordedFor.current = user.id;
    recordActivity.mutate({ data: { action: "daily_visit" } }, {
      onSuccess: (data) => {
        queryClient.setQueryData(getGetMyStreakQueryKey(), data);
        queryClient.invalidateQueries({ queryKey: ["/api/streak/leaderboard"] });
      },
    });
  }, [user?.id, recordActivity, queryClient]);

  const streak = streakQuery.data;
  const currentScore = streak?.score ?? 0;
  const currentLeague = useMemo(() => leagueFor(currentScore), [currentScore]);
  const currentIndex = leagues.indexOf(currentLeague);
  const nextLeague = currentIndex > 0 ? leagues[currentIndex - 1] : null;
  const missing = nextLeague ? Math.max(0, nextLeague.min - currentScore) : 0;
  const progress = nextLeague
    ? Math.min(100, Math.max(4, ((currentScore - currentLeague.min) / Math.max(1, nextLeague.min - currentLeague.min)) * 100))
    : 100;

  const shareRank = async () => {
    const text = `Mon score PAYLOCA : ${currentScore.toLocaleString("fr-FR")} flammes, niveau ${currentLeague.name}.`;
    if (navigator.share) await navigator.share({ title: "Mon score PAYLOCA", text }).catch(() => undefined);
    else await navigator.clipboard?.writeText(text);
  };

  return (
    <div className="min-h-[100dvh] bg-[#f4efdf] text-[#20283c]">
      <section className="bg-[#20283c] px-5 py-12 text-[#f7edda] md:py-16">
        <div className="page-shell">
          <Link href="/" className="text-sm font-bold text-[#e9b949]">← Retour à PAYLOCA</Link>
          <p className="mt-8 text-xs font-bold uppercase tracking-[.2em] text-[#e9b949]">Activité communautaire</p>
          <h1 className="mt-2 font-display text-5xl font-bold tracking-[-.05em]">Ligue PAYLOCA</h1>
          <p className="mt-3 max-w-xl text-[#bbc0c7]">Votre série et votre score de flammes sont enregistrés par le serveur, par compte Firebase.</p>
          <div className="mt-8 max-w-xl rounded-2xl border border-[#536077] bg-[#29334a] p-5">
            {streakQuery.isLoading ? <Loader2 className="animate-spin text-[#e9b949]" /> : (
              <>
                <div className="flex items-center justify-between"><span className="font-bold">Votre progression</span><span className="text-2xl">{currentLeague.icon}</span></div>
                <p className="mt-3 font-display text-2xl font-bold" style={{ color: currentLeague.color }}>{currentLeague.name}</p>
                <p className="mt-2 text-sm text-[#d5d4ce]">{currentScore.toLocaleString("fr-FR")} flammes · {streak?.streakCount ?? 0} jour{(streak?.streakCount ?? 0) === 1 ? "" : "s"} consécutif{(streak?.streakCount ?? 0) === 1 ? "" : "s"}</p>
                <div className="mt-4 h-3 overflow-hidden rounded-full bg-[#536077]"><div className="h-full rounded-full bg-[#e9b949]" style={{ width: `${progress}%` }} /></div>
                <p className="mt-3 text-sm text-[#d5d4ce]">{missing ? `Il vous manque ${missing.toLocaleString("fr-FR")} flammes pour passer ${nextLeague?.name}` : "Vous êtes dans le niveau le plus élevé."}</p>
              </>
            )}
          </div>
        </div>
      </section>

      <main className="page-shell py-10 md:py-14">
        <div className="grid gap-5 lg:grid-cols-[1.2fr_.8fr]">
          <section className="rounded-2xl border border-[#dfd7c4] bg-[#faf6ec] p-5 shadow-[0_4px_0_#e8deca]">
            <div className="flex items-center justify-between gap-3">
              <div><p className="text-xs font-bold uppercase tracking-[.18em] text-[#b95740]">Votre activité</p><h2 className="mt-1 font-display text-2xl font-bold">Un score sans données fictives</h2></div>
              <Flame className="text-[#b95740]" size={28} />
            </div>
            <p className="mt-4 text-sm leading-6 text-[#676b76]">Une visite quotidienne entretient votre série et rapporte 1 flamme. Une publication validée dans le fil rapporte 10 flammes. Les valeurs sont liées à votre compte et non à cet appareil.</p>
            {recordActivity.isError && <p className="mt-4 rounded-xl bg-[#fff1ec] p-3 text-sm font-semibold text-[#8f3e32]">La visite n’a pas pu être enregistrée. Réessayez lorsque la connexion sera rétablie.</p>}
          </section>
          <section className="rounded-2xl bg-[#20283c] p-5 text-[#f7edda]">
            <p className="text-xs font-bold uppercase tracking-[.18em] text-[#e9b949]">Série quotidienne</p>
            <p className="mt-3 font-display text-4xl font-bold">🔥 {streak?.streakCount ?? 0} jour{(streak?.streakCount ?? 0) === 1 ? "" : "s"}</p>
            <p className="mt-2 text-sm text-[#bbc0c7]">La série est calculée à partir des activités enregistrées par le serveur.</p>
            <button type="button" onClick={shareRank} className="mt-5 rounded-full bg-[#e9b949] px-4 py-2 text-sm font-bold text-[#20283c]">Partager mon score</button>
          </section>
        </div>

        <section className="mt-10">
          <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-[#b95740]">Classement réel</p><h2 className="mt-2 font-display text-3xl font-bold">Profils avec une activité enregistrée</h2></div><Trophy className="text-[#e9b949]" size={30} /></div>
          <div className="mt-5 flex flex-wrap gap-2">{cities.map((item) => <button key={item} type="button" onClick={() => setCity(item)} className={`rounded-full border px-3 py-2 text-xs font-bold ${city === item ? "border-[#b95740] bg-[#fff1eb] text-[#8f3e32]" : "border-[#d9cfbc] text-[#596071]"}`}>{item}</button>)}</div>
          {leaderboardQuery.isLoading && <div className="py-12 text-center"><Loader2 size={30} className="mx-auto animate-spin text-[#b95740]" /><p className="mt-3 text-sm font-semibold text-[#676b76]">Chargement du classement…</p></div>}
          {leaderboardQuery.isError && <p role="alert" className="mt-6 rounded-xl bg-[#fff1ec] p-4 text-sm font-semibold text-[#8f3e32]">Impossible de charger le classement.</p>}
          {!leaderboardQuery.isLoading && !leaderboardQuery.isError && leaderboardQuery.data?.length === 0 && <div className="mt-6 rounded-2xl border border-dashed border-[#d9cfbc] p-10 text-center text-[#676b76]"><Trophy size={36} className="mx-auto text-[#d9cfbc]" /><p className="mt-3 font-bold text-[#20283c]">Le classement est encore vide</p><p className="mt-1 text-sm">Les profils apparaîtront après leur première activité enregistrée.</p></div>}
          {leaderboardQuery.data && leaderboardQuery.data.length > 0 && <div className="mt-6 overflow-hidden rounded-2xl border border-[#dfd7c4] bg-[#faf6ec]"><div className="grid grid-cols-[60px_1fr_100px] border-b border-[#dfd7c4] bg-[#f0e8d8] px-4 py-3 text-xs font-bold uppercase tracking-wider text-[#777977]"><span>#</span><span>Profil</span><span className="text-right">Flammes</span></div>{leaderboardQuery.data.map((row) => { const league = leagueFor(row.score); return <Link href={`/profil/${encodeURIComponent(row.userId)}`} key={row.userId} className="grid grid-cols-[60px_1fr_100px] items-center border-b border-[#eee7d8] px-4 py-4 last:border-0 hover:bg-[#f4efdf]"><span className={`font-display text-xl font-bold ${row.rank <= 3 ? "text-[#e9b949]" : "text-[#777977]"}`}>{row.rank <= 3 ? ["🥇", "🥈", "🥉"][row.rank - 1] : row.rank}</span><span><span className="block font-bold">{row.displayName}{row.userId === user?.id ? " · vous" : ""}</span><span className="text-xs text-[#777977]">{league.icon} {league.name} · {row.city} · 🔥 {row.streakCount} j</span></span><span className="text-right font-bold text-[#b95740]">{row.score.toLocaleString("fr-FR")}</span></Link>; })}</div>}
        </section>

        <section className="mt-10 grid gap-4 md:grid-cols-3">{leagues.slice().reverse().map((league) => <div key={league.name} className="rounded-2xl border border-[#dfd7c4] bg-[#faf6ec] p-4 shadow-[0_4px_0_#e8deca]"><span className="text-2xl">{league.icon}</span><h3 className="mt-2 font-display text-xl font-bold" style={{ color: league.color }}>{league.name}</h3><p className="mt-1 text-xs font-bold uppercase tracking-widest text-[#777977]">{league.min.toLocaleString("fr-FR")} flammes et plus</p></div>)}</section>
        <p className="mx-auto mt-8 max-w-2xl text-center text-xs leading-5 text-[#8a8984]">Le classement affiche uniquement les profils publics qui disposent d’un score persistant. Il ne fabrique ni nom, ni score, ni badge.</p>
      </main>
    </div>
  );
}
