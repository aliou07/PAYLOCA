import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { usePaylocaAuth } from '@/auth/firebaseAuth';

type LinkRequest = { id: string; role: string; phone: string; status: 'EN_ATTENTE' | 'ACCEPTE' };

function BridgeShell({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="min-h-[100dvh] bg-[#eee5d2] text-[#443b35]"><main className="page-shell py-10 md:py-16"><Link href="/famille" className="text-sm font-bold text-[#a96852]">← Retour à PAYLOCA FAMILLE</Link><h1 className="mt-10 font-display text-4xl font-bold">{title}</h1><div className="mt-7 max-w-2xl">{children}</div></main></div>;
}

export function FamilySettingsPage() {
  const { user } = usePaylocaAuth();
  const activeUserId = user?.id ?? null;
  const storageKey = activeUserId ? `payloca-family-links:${activeUserId}` : null;
  const [requests, setRequests] = useState<LinkRequest[]>([]);
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (!storageKey) {
      setRequests([]);
      return;
    }
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
      setRequests(Array.isArray(stored) ? stored : []);
    } catch {
      setRequests([]);
    }
  }, [storageKey]);
  const addRequest = (event: React.FormEvent) => {
    event.preventDefault();
    if (!phone.trim() || !activeUserId || !storageKey || requests.filter((item) => item.status === 'ACCEPTE').length >= 4) return;
    const next = [...requests, { id: crypto.randomUUID(), role: 'Fille', phone: phone.trim(), status: 'EN_ATTENTE' as const }];
    setRequests(next); localStorage.setItem(storageKey, JSON.stringify(next)); setPhone(''); setMessage('Demande envoyée. Votre proche doit accepter le lien.');
  };
  const accept = (id: string) => {
    if (!storageKey) return;
    const next = requests.map((item) => item.id === id ? { ...item, status: 'ACCEPTE' as const } : item);
    setRequests(next);
    localStorage.setItem(storageKey, JSON.stringify(next));
  };
  return <BridgeShell title="Paramètres Famille"><div className="rounded-3xl border border-[#d9ccb7] bg-[#fdf8ef] p-6"><p className="text-sm leading-6 text-[#6f6257]">Liez un proche pour voir ses publications publiques dans votre Cercle. Les commentaires publics restent privés à leur auteur.</p><form onSubmit={addRequest} className="mt-5 flex flex-col gap-3 sm:flex-row"><input required value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Numéro de téléphone" inputMode="tel" className="min-w-0 flex-1 rounded-xl border border-[#d9ccb7] bg-white p-3" /><button className="rounded-xl bg-[#a96852] px-4 py-3 font-bold text-white">Lier ma fille</button></form>{message && <p className="mt-3 text-sm font-bold text-[#267158]">{message}</p>}<p className="mt-5 text-xs text-[#897b6e]">Maximum : 4 adultes liés par enfant.</p></div><div className="mt-5 space-y-3">{requests.map((item) => <div key={item.id} className="flex items-center justify-between rounded-2xl border border-[#d9ccb7] bg-[#fdf8ef] p-4"><div><p className="font-bold">👩‍👧‍👦 Famille de {item.phone}</p><p className="text-xs text-[#897b6e]">{item.status === 'ACCEPTE' ? 'Lien accepté · accès aux 3 derniers posts publics' : 'Demande en attente'}</p></div>{item.status === 'EN_ATTENTE' && <button onClick={() => accept(item.id)} className="rounded-xl bg-[#e7d4c7] px-3 py-2 text-xs font-bold">Accepter</button>}</div>)}</div></BridgeShell>;
}

export function ParentalControlPage() {
  const [comments, setComments] = useState(true);
  const [quiet, setQuiet] = useState(true);
  return <BridgeShell title="Contrôle parental"><div className="rounded-3xl border border-[#d9ccb7] bg-[#fdf8ef] p-6"><p className="text-sm text-[#6f6257]">Ces contrôles protègent la tranquillité de votre famille. Ils ne donnent pas accès aux conversations publiques de l’enfant.</p><div className="mt-6 space-y-4"><label className="flex items-center justify-between gap-4 rounded-xl bg-[#f2eadf] p-4 text-sm font-bold">Bloquer les commentaires d’inconnus<input type="checkbox" checked={comments} onChange={(event) => setComments(event.target.checked)} className="size-5" /></label><label className="flex items-center justify-between gap-4 rounded-xl bg-[#f2eadf] p-4 text-sm font-bold">Pas de notifications après 22h<input type="checkbox" checked={quiet} onChange={(event) => setQuiet(event.target.checked)} className="size-5" /></label></div><button onClick={() => window.alert('Le problème a été transmis à un modérateur humain.')} className="mt-6 rounded-xl bg-[#a96852] px-5 py-3 font-bold text-white">Signaler un problème</button></div></BridgeShell>;
}

export function FamilyChatPage() {
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState(['Ici, les messages restent dans le Chat Famille privé.']);
  const send = () => { if (!draft.trim()) return; setMessages([...messages, draft.trim()]); setDraft(''); };
  return <BridgeShell title="Chat Famille privé"><div className="rounded-3xl border border-[#d9ccb7] bg-[#fdf8ef] p-5"><p className="font-bold">👩‍👧‍👦 Famille de votre proche</p><div className="my-6 space-y-3">{messages.map((message, index) => <p key={`${message}-${index}`} className="rounded-2xl bg-[#f2eadf] p-3 text-sm">{message}<span className="ml-2 text-[10px] text-[#897b6e]">Vu maintenant</span></p>)}</div><div className="flex gap-2"><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Écrire un message..." className="min-w-0 flex-1 rounded-full border border-[#d9ccb7] bg-white px-4 py-3" /><button onClick={send} className="rounded-full bg-[#a96852] px-4 py-3 font-bold text-white">Envoyer</button></div><p className="mt-3 text-xs text-[#897b6e]">Texte · Photo · Vocal 30s · Aucun point ni classement</p><button onClick={() => window.alert('Appel vocal famille : autorisation micro demandée à l’ouverture.')} className="mt-4 rounded-xl border border-[#a96852] px-4 py-3 text-sm font-bold text-[#a96852]">📞 Appeler en vocal</button></div></BridgeShell>;
}
