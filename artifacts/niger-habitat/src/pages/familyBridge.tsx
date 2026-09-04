import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'wouter';
import { usePaylocaAuth } from '@/auth/firebaseAuth';

type FamilyPost = { id: string; author: string; text: string; createdAt: number; liked?: boolean; comments: number };

const starterPosts: FamilyPost[] = [
  { id: 'family-1', author: 'Aïcha Maman', text: "Le repas d'aujourd'hui 😍", createdAt: Date.now() - 3600000, comments: 2 },
  { id: 'family-2', author: 'Tante Zara', text: 'Bon courage à toute la famille pour cette nouvelle semaine.', createdAt: Date.now() - 7200000, comments: 4 },
];

export default function FamilyPage() {
  const { user } = usePaylocaAuth();
  const activeUserId = user?.id ?? null;
  const storageKey = activeUserId ? `payloca-family-posts:${activeUserId}` : null;
  const [posts, setPosts] = useState<FamilyPost[]>([]);
  const [draft, setDraft] = useState('');
  const [audience, setAudience] = useState('Toute ma famille');
  const [view, setView] = useState<'feed' | 'write' | 'invite'>('feed');
  const photoInput = useRef<HTMLInputElement>(null);
  const sortedPosts = useMemo(() => [...posts].sort((a, b) => b.createdAt - a.createdAt), [posts]);

  useEffect(() => {
    if (!storageKey) {
      setPosts([]);
      return;
    }

    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
      setPosts(Array.isArray(stored) ? stored : starterPosts);
    } catch {
      setPosts(starterPosts);
    }
  }, [storageKey]);

  const publish = () => {
    if (!draft.trim() || !activeUserId || !storageKey) return;

    const next = [
      {
        id: crypto.randomUUID(),
        author: user?.fullName ?? 'Moi',
        text: draft.trim(),
        createdAt: Date.now(),
        comments: 0,
      },
      ...posts,
    ];

    setPosts(next);
    localStorage.setItem(storageKey, JSON.stringify(next));
    setDraft('');
    setView('feed');
  };

  const invite = (relative: string) => {
    const text = `Rejoins mon Cercle Famille sur PAYLOCA. Ici c'est entre nous : ${window.location.origin}/famille`;

    if (navigator.share) {
      void navigator.share({
        title: 'PAYLOCA Famille',
        text: `${relative} — ${text}`,
      }).catch(() => undefined);
    } else {
      void navigator.clipboard
        ?.writeText(`${relative} — ${text}`)
        .then(() => window.alert('Message copié.'))
        .catch(() => window.alert(`${relative} — ${text}`));
    }
  };

  const toggleLike = (id: string) => {
    if (!storageKey) return;

    const next = posts.map((post) =>
      post.id === id ? { ...post, liked: !post.liked } : post,
    );

    setPosts(next);
    localStorage.setItem(storageKey, JSON.stringify(next));
  };

  return (
    <div className="min-h-[100dvh] bg-[#eee5d2] text-[#443b35]">
      <header className="border-b border-[#d9ccb7] bg-[#f5eddf]">
        <div className="page-shell flex min-h-[76px] flex-wrap items-center justify-between gap-3 py-3">
          <Link href="/" className="font-display text-2xl font-bold text-[#5a493e]">
            PAYLOCA <span className="text-[#a96852]">FAMILLE</span>
          </Link>

          <div className="flex rounded-full border border-[#cdbda6] bg-[#eee5d2] p-1 text-xs font-bold">
            <Link href="/" className="rounded-full px-3 py-2 text-[#776b60]">
              🌍 PUBLIC
            </Link>
            <span className="rounded-full bg-[#a96852] px-3 py-2 text-white">
              🏠 FAMILLE
            </span>
          </div>
        </div>
      </header>

      <main className="page-shell py-8 md:py-12">
        <section className="rounded-3xl bg-[#5a493e] p-6 text-[#fff8ed] shadow-[0_5px_0_#cdbda6] md:p-8">
          <p className="text-xs font-bold uppercase tracking-[.18em] text-[#f2cf9d]">
            Un espace pour les parents
          </p>
          <h1 className="mt-2 font-display text-4xl font-bold md:text-5xl">
            PAYLOCA FAMILLE
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-[#eadfd1]">
            Un endroit sûr pour partager les moments de famille. Aucune publicité.
            Aucune compétition. Vos données restent privées.
          </p>
          <p className="mt-4 text-sm font-bold text-[#f2cf9d]">
            Ici c’est entre nous. Respect et amour seulement.
          </p>
        </section>

        <nav className="mt-6 grid grid-cols-3 gap-2 rounded-2xl border border-[#d9ccb7] bg-[#f8f1e5] p-2 text-center text-sm font-bold">
          <button
            onClick={() => setView('feed')}
            className={`rounded-xl px-2 py-3 ${view === 'feed' ? 'bg-[#a96852] text-white' : ''}`}
          >
            Cercle
          </button>
          <button
            onClick={() => setView('write')}
            className={`rounded-xl px-2 py-3 ${view === 'write' ? 'bg-[#a96852] text-white' : ''}`}
          >
            ✍️ Publier
          </button>
          <button
            onClick={() => setView('invite')}
            className={`rounded-xl px-2 py-3 ${view === 'invite' ? 'bg-[#a96852] text-white' : ''}`}
          >
            👩‍👧‍👦 Inviter
          </button>
        </nav>

        {view === 'feed' && (
          <section className="mx-auto mt-6 max-w-2xl space-y-4">
            {sortedPosts.map((post) => (
              <article
                key={post.id}
                className="rounded-3xl border border-[#d9ccb7] bg-[#fdf8ef] p-5 shadow-[0_4px_0_#ded0bb]"
              >
                <div className="flex items-center gap-3">
                  <span className="grid size-12 place-items-center rounded-full bg-[#e5c9bc] text-xl">
                    👩
                  </span>
                  <div>
                    <p className="font-bold">{post.author}</p>
                    <p className="text-xs text-[#897b6e]">
                      👩‍👧‍👦 Famille · {new Date(post.createdAt).toLocaleDateString('fr-FR')}
                    </p>
                  </div>
                </div>

                <p className="mt-4 text-lg leading-7">{post.text}</p>

                <div className="mt-4 flex gap-2 border-t border-[#eadfce] pt-3">
                  <button
                    onClick={() => toggleLike(post.id)}
                    className={`rounded-full px-4 py-2 text-sm font-bold ${
                      post.liked ? 'bg-[#f1d4cd] text-[#a96852]' : 'bg-[#f2eadf]'
                    }`}
                  >
                    ❤️ {post.liked ? 'Aimé' : 'J’aime'}
                  </button>
                  <button className="rounded-full bg-[#f2eadf] px-4 py-2 text-sm font-bold">
                    💬 Commenter ({post.comments})
                  </button>
                  <button className="rounded-full bg-[#f2eadf] px-4 py-2 text-sm font-bold">
                    📤 Envoyer en privé
                  </button>
                </div>

                <p className="mt-2 text-[11px] text-[#9a8d80]">
                  Le cœur est juste un signe d’affection. Il n’augmente aucun point.
                </p>
              </article>
            ))}
          </section>
        )}

        {view === 'write' && (
          <section className="mx-auto mt-6 max-w-2xl rounded-3xl border border-[#d9ccb7] bg-[#fdf8ef] p-6">
            <h2 className="font-display text-3xl font-bold">Partager entre nous</h2>
            <p className="mt-2 text-sm text-[#897b6e]">
              Aucun point, aucune classe, juste votre famille.
            </p>

            <div className="mt-6 grid gap-3">
              <button
                onClick={() => photoInput.current?.click()}
                className="rounded-2xl border-2 border-dashed border-[#cdbda6] px-5 py-6 text-lg font-bold"
              >
                📸 Prendre Photo
              </button>

              <input
                ref={photoInput}
                type="file"
                accept="image/*"
                capture="user"
                className="hidden"
              />

              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                rows={5}
                placeholder="Écrire un message..."
                className="rounded-2xl border border-[#d9ccb7] bg-white p-4 text-lg outline-none focus:border-[#a96852]"
              />

              <label className="text-sm font-bold">
                Qui peut voir ?
                <select
                  value={audience}
                  onChange={(event) => setAudience(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-[#d9ccb7] bg-white p-3 text-base"
                >
                  <option>Toute ma famille</option>
                  <option>Mes sœurs seulement</option>
                </select>
              </label>

              <button
                onClick={publish}
                className="rounded-2xl bg-[#a96852] px-5 py-4 text-lg font-bold text-white"
              >
                Publier dans ton Cercle
              </button>
            </div>
          </section>
        )}

        {view === 'invite' && (
          <section className="mx-auto mt-6 max-w-2xl rounded-3xl border border-[#d9ccb7] bg-[#fdf8ef] p-6">
            <h2 className="font-display text-3xl font-bold">Inviter ma famille</h2>
            <p className="mt-2 text-sm leading-6 text-[#897b6e]">
              Les personnes qui acceptent arrivent directement dans votre Cercle Famille.
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {['Maman', 'Tante', 'Sœur'].map((relative) => (
                <button
                  key={relative}
                  onClick={() => invite(relative)}
                  className="rounded-2xl bg-[#e7d4c7] px-4 py-5 text-base font-bold text-[#5a493e]"
                >
                  👩 Inviter {relative}
                </button>
              ))}
            </div>

            <p className="mt-6 rounded-xl bg-[#f2eadf] p-4 text-sm text-[#6f6257]">
              Votre cercle peut accueillir jusqu’à 150 personnes.
            </p>
          </section>
        )}
      </main>
    </div>
  );
}
