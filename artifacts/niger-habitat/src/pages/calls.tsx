import { useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { authenticatedFetch, usePaylocaAuth } from '@/auth/firebaseAuth';

type Call = { id: number; creatorId: string; creatorName: string; recipientId: string; recipientName: string; status: string; expiresAt: string; invitationLink: string | null };

export default function CallsPage() {
  const { user } = usePaylocaAuth();
  const [location, setLocation] = useLocation();
  const params = new URLSearchParams(location.split('?')[1] ?? '');
  const recipientId = params.get('recipient') ?? '';
  const recipientName = params.get('name') ?? 'ce contact';
  const [incoming, setIncoming] = useState<Call[]>([]);
  const [active, setActive] = useState<Call | null>(null);
  const [notice, setNotice] = useState('');
  const [now, setNow] = useState(Date.now());

  const load = () => {
    authenticatedFetch('/api/calls/incoming').then((r) => r.ok ? r.json() : []).then(setIncoming).catch(() => undefined);
    authenticatedFetch('/api/calls/active').then((r) => r.ok ? r.json() : null).then(setActive).catch(() => undefined);
  };
  useEffect(() => { load(); const timer = window.setInterval(() => { setNow(Date.now()); load(); }, 2500); return () => window.clearInterval(timer); }, []);
  const startCall = async () => {
    if (!recipientId || !user) { setNotice('Choisissez un contact depuis une annonce pour appeler.'); return; }
    const response = await authenticatedFetch('/api/calls', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recipientId, recipientName, creatorName: user.fullName }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { setNotice(data.error ?? 'Impossible de lancer cet appel.'); return; }
    setActive(data.call); setNotice('Invitation envoyée. Elle expire dans 60 secondes.');
  };
  const action = async (id: number, value: string) => {
    const response = await authenticatedFetch(`/api/calls/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: value }) });
    const data = await response.json().catch(() => ({}));
    setNotice(data.message ?? data.error ?? '');
    load();
    if (value === 'answer') setLocation('/appels-en-cours');
  };
  const remaining = active ? Math.max(0, Math.ceil((new Date(active.expiresAt).getTime() - now) / 1000)) : 0;
  return <div className="min-h-[100dvh] bg-[#20283c] px-5 py-10 text-[#f7edda]">
    <main className="mx-auto max-w-2xl">
      <Link href="/" className="text-sm font-bold text-[#e9b949]">← Retour à PAYLOCA</Link>
      <p className="mt-12 text-xs font-bold uppercase tracking-[.2em] text-[#e9b949]">Communication sécurisée</p>
      <h1 className="mt-2 font-display text-5xl font-bold">PAYLOCA CALLS</h1>
      <p className="mt-3 text-[#bbc0c7]">Les invitations sont limitées à 60 secondes pour respecter la disponibilité de chacun.</p>
      {notice && <p className="mt-5 rounded-xl bg-[#29334a] p-4 text-sm font-bold text-[#f7e8b4]" role="status">{notice}</p>}
      {active && active.status === 'EN_ATTENTE' && remaining > 0 && <div className="mt-8 rounded-3xl border border-[#e9b949] bg-[#29334a] p-6 text-center"><p className="text-sm text-[#bbc0c7]">Appel de {active.recipientName}...</p><p className="mt-3 font-display text-6xl font-bold text-[#e9b949]">00:{String(remaining).padStart(2, '0')}</p><button onClick={() => action(active.id, 'cancel')} className="mt-6 rounded-full border border-[#e4bbb0] px-5 py-3 text-sm font-bold text-[#f3b4a5]">Annuler l’appel</button></div>}
      {recipientId && <button onClick={startCall} disabled={Boolean(active && remaining > 0)} className="mt-8 w-full rounded-2xl bg-[#b95740] px-5 py-4 text-lg font-bold text-white disabled:opacity-50">📹 Appeler {recipientName}</button>}
      {incoming.length > 0 && <section className="mt-8 rounded-3xl bg-[#faf6ec] p-5 text-[#20283c]"><h2 className="font-display text-2xl font-bold">Appels entrants</h2>{incoming.map((call) => <div key={call.id} className="mt-4 rounded-2xl border border-[#dfd7c4] bg-[#f4efdf] p-4"><p className="font-bold">📹 {call.creatorName} vous appelle...</p><div className="mt-4 grid grid-cols-3 gap-2"><button onClick={() => action(call.id, 'answer')} className="rounded-xl bg-[#267158] px-2 py-3 text-xs font-bold text-white">Répondre 📹</button><button onClick={() => action(call.id, 'refuse')} className="rounded-xl bg-[#b95740] px-2 py-3 text-xs font-bold text-white">Refuser ❌</button><button onClick={() => action(call.id, 'remind')} className="rounded-xl border border-[#d9cfbc] px-2 py-3 text-xs font-bold">Rappeler</button></div></div>)}</section>}
      {active?.status === 'EN_COURS' && <div className="mt-8 rounded-3xl bg-[#267158] p-8 text-center"><p className="text-4xl">📹</p><h2 className="mt-3 font-display text-3xl font-bold">Appel en cours</h2><p className="mt-2 text-sm text-white/80">La liaison sécurisée est ouverte.</p><button onClick={() => action(active.id, 'cancel')} className="mt-6 rounded-full bg-white px-5 py-3 text-sm font-bold text-[#267158]">Terminer l’appel</button></div>}
      <p className="mt-8 text-center text-xs leading-5 text-[#9da3ae]">Une invitation expirée devient inutilisable. Si le destinataire est déjà en appel, vous serez informé qu’il est occupé.</p>
    </main>
  </div>;
}
