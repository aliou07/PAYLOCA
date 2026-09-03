import { useEffect, useState, useRef, useCallback, type FormEvent, type PointerEvent, type KeyboardEvent } from 'react';
import { AlertTriangle, Plus, Trash2, MapPin, Navigation, Smartphone, CheckCircle, ShieldAlert } from 'lucide-react';
import { usePaylocaAuth, normalizeNigerPhone } from '@/auth/firebaseAuth';
import { listSosContacts, saveSosContact, deleteSosContact, SOS_CONTACT_LIMIT_ERROR, type SosContact } from '@/lib/offlineData';
import { commitAccountScopedResult } from '@/lib/accountScopedLocalData';
import { Link } from 'wouter';

export default function SosPage() {
  const { user, isSignedIn } = usePaylocaAuth();

  const [storedContacts, setContacts] = useState<SosContact[]>([]);
  const activeUserId = useRef<string | null>(user?.id ?? null);
  activeUserId.current = user?.id ?? null;
  const contacts = storedContacts.filter((contact) => contact.userId === activeUserId.current);
  const [newContactName, setNewContactName] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');
  const [contactError, setContactError] = useState('');
  const [isAddingContact, setIsAddingContact] = useState(false);

  const loadContacts = useCallback(async () => {
    if (!user) return setContacts([]);
    const ownerId = user.id;
    const items = await listSosContacts(ownerId);
    commitAccountScopedResult(ownerId, () => activeUserId.current, items, setContacts);
  }, [user]);

  useEffect(() => { loadContacts(); }, [loadContacts]);

  useEffect(() => {
    setContacts([]);
    setSelectedContacts([]);
    setAllowGeo(false);
    setPreparedMessage('');
    setLocationError('');
    setSosState('idle');
    setPressProgress(0);
  }, [user?.id]);

  const addContact = async (e: FormEvent) => {
    e.preventDefault();
    setContactError('');
    if (!user) return;
    if (contacts.length >= 5) {
      setContactError('Vous ne pouvez ajouter que 5 contacts maximum.');
      return;
    }
    if (!newContactName.trim()) {
      setContactError('Le nom du contact est obligatoire.');
      return;
    }
    const phone = normalizeNigerPhone(newContactPhone);
    if (!phone) {
      setContactError('Numéro invalide. Saisissez 8 chiffres (Niger).');
      return;
    }
    const newContact: SosContact = {
      id: crypto.randomUUID(),
      userId: user.id,
      name: newContactName.trim(),
      phone,
      createdAt: Date.now()
    };
    setIsAddingContact(true);
    try {
      await saveSosContact(newContact);
      setNewContactName('');
      setNewContactPhone('');
      await loadContacts();
    } catch (error) {
      setContactError(error instanceof Error && error.message === SOS_CONTACT_LIMIT_ERROR
        ? 'Vous ne pouvez ajouter que 5 contacts maximum.'
        : 'Impossible d’enregistrer ce contact sur cet appareil.');
    } finally {
      setIsAddingContact(false);
    }
  };

  const removeContact = async (id: string) => {
    if (!user) return;
    await deleteSosContact(id, user.id);
    setSelectedContacts(prev => prev.filter(cId => cId !== id));
    await loadContacts();
  };

  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [allowGeo, setAllowGeo] = useState(false);

  const [pressProgress, setPressProgress] = useState(0);
  const [sosState, setSosState] = useState<'idle' | 'locating' | 'prepared'>('idle');
  const [preparedMessage, setPreparedMessage] = useState('');
  const [locationError, setLocationError] = useState('');

  const pressTimer = useRef<number | null>(null);
  const startTime = useRef<number>(0);
  const animationFrame = useRef<number | null>(null);
  const isPressing = useRef(false);

  const stopPress = useCallback(() => {
    isPressing.current = false;
    if (pressTimer.current) window.clearTimeout(pressTimer.current);
    if (animationFrame.current) cancelAnimationFrame(animationFrame.current);
    pressTimer.current = null;
    animationFrame.current = null;
    if (sosState === 'idle') setPressProgress(0);
  }, [sosState]);

  const prepareWithoutLocation = useCallback(() => {
    const time = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const msg = `URGENCE. J'ai besoin d'aide.\nHeure locale : ${time}\n(Position non disponible)\n\nMessage préparé avec PAYLOCA.`;
    setPreparedMessage(msg);
    setSosState('prepared');
    setLocationError('');
  }, []);

  const executeSos = useCallback(() => {
    stopPress();
    if (selectedContacts.length === 0) return;

    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try { navigator.vibrate([200, 100, 200]); } catch { /* ignore */ }
    }

    if (allowGeo && 'geolocation' in navigator) {
      setSosState('locating');
      setLocationError('');
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          const time = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
          const msg = `URGENCE. J'ai besoin d'aide.\nHeure locale : ${time}\nPosition : https://www.google.com/maps?q=${latitude},${longitude}\n\nMessage préparé avec PAYLOCA.`;
          setPreparedMessage(msg);
          setSosState('prepared');
        },
        (err) => {
          setLocationError('Position introuvable ou refusée par votre appareil.');
          setSosState('idle');
        },
        { timeout: 10000, maximumAge: 0, enableHighAccuracy: true }
      );
    } else {
      prepareWithoutLocation();
    }
  }, [selectedContacts, allowGeo, stopPress, prepareWithoutLocation]);

  const startPress = useCallback(() => {
    if (sosState !== 'idle' || selectedContacts.length === 0) return;
    stopPress();
    isPressing.current = true;
    startTime.current = Date.now();

    const updateProgress = () => {
      const elapsed = Date.now() - startTime.current;
      const progress = Math.min(100, (elapsed / 3000) * 100);
      setPressProgress(progress);
      if (progress < 100) {
        animationFrame.current = requestAnimationFrame(updateProgress);
      }
    };
    animationFrame.current = requestAnimationFrame(updateProgress);

    pressTimer.current = window.setTimeout(() => {
      if (!isPressing.current || Date.now() - startTime.current < 3000) return;
      executeSos();
    }, 3000);
  }, [sosState, selectedContacts, executeSos, stopPress]);

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    startPress();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (!pressTimer.current) startPress();
    }
  };

  const onKeyUp = (e: KeyboardEvent) => {
    if (e.key === ' ' || e.key === 'Enter') stopPress();
  };

  useEffect(() => stopPress, [stopPress]);

  return (
    <div className="page-shell max-w-2xl py-8 md:py-12">
      <div className="flex items-center gap-4">
        <span className="grid size-14 place-items-center rounded-2xl bg-[#fff1ec] text-[#d93f2c] shadow-sm">
          <ShieldAlert size={30} strokeWidth={2.5} />
        </span>
        <div>
          <h1 className="font-display text-3xl font-bold text-[#20283c]">Préparation SOS</h1>
          <p className="mt-1 text-sm font-medium text-[#596071]">Vos contacts d'urgence locaux hors ligne.</p>
        </div>
      </div>

      <div className="mt-8 rounded-2xl border border-[#dca79b] bg-[#fff1ec] p-5 shadow-sm">
        <div className="flex gap-4 text-[#9d3526]">
          <AlertTriangle size={24} className="shrink-0 mt-0.5" />
          <div className="text-sm font-medium leading-relaxed">
            <p className="font-bold text-base mb-2">Informations importantes :</p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>PAYLOCA <strong>n'envoie pas</strong> de SMS automatiquement.</li>
              <li>PAYLOCA <strong>ne contacte pas</strong> les services d'urgence.</li>
              <li>Vous devrez <strong>confirmer l'envoi</strong> de chaque message dans votre application SMS habituelle.</li>
            </ul>
          </div>
        </div>
      </div>

      {!isSignedIn ? (
        <div className="mt-8 rounded-2xl border border-[#dfd7c4] bg-[#faf6ec] p-8 text-center shadow-sm">
          <p className="font-bold text-lg text-[#20283c]">Connectez-vous pour configurer vos contacts</p>
          <p className="mt-2 text-sm text-[#596071]">Cette fonctionnalité nécessite un compte pour sauvegarder vos données en toute sécurité, uniquement sur cet appareil.</p>
          <Link href="/sign-in" className="mt-6 inline-flex items-center justify-center rounded-xl bg-[#20283c] px-6 py-3 text-sm font-bold text-[#f7e8b4] transition-transform active:scale-95">Se connecter</Link>
        </div>
      ) : (
        <div className="mt-10 space-y-10">
          <section>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xl font-bold text-[#20283c]">1. Vos contacts</h2>
              <span className="rounded-full bg-[#f4efdf] px-3 py-1 text-xs font-bold text-[#596071] border border-[#d9cfbc]">{contacts.length}/5</span>
            </div>

            <div className="space-y-3">
              {contacts.map(c => (
                <div key={c.id} className="flex items-center justify-between rounded-xl border border-[#d9cfbc] bg-[#faf6ec] p-4 shadow-sm">
                  <div>
                    <p className="font-bold text-[#20283c]">{c.name}</p>
                    <p className="mt-0.5 text-sm font-medium text-[#596071]">{c.phone}</p>
                  </div>
                  <button type="button" onClick={() => removeContact(c.id)} className="p-2.5 text-[#d93f2c] hover:bg-[#fff1ec] rounded-xl transition-colors" aria-label={`Supprimer ${c.name}`}>
                    <Trash2 size={18} />
                  </button>
                </div>
              ))}

              {contacts.length === 0 && (
                <div className="rounded-2xl border-2 border-dashed border-[#d9cfbc] p-8 text-center text-[#596071]">
                  <p className="font-medium text-sm">Aucun contact enregistré.</p>
                  <p className="mt-1 text-xs">Ajoutez des proches pour pouvoir les prévenir rapidement.</p>
                </div>
              )}
            </div>

            {contactError && <p role="alert" className="mt-3 text-sm font-bold text-[#d93f2c] flex items-center gap-1.5"><AlertTriangle size={14} />{contactError}</p>}

            {contacts.length < 5 && (
              <form onSubmit={addContact} className="mt-5 rounded-2xl border border-[#d9cfbc] bg-[#f4efdf]/60 p-5 shadow-sm">
                <p className="text-sm font-bold text-[#20283c] mb-4">Ajouter un nouveau contact</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="contact-name" className="sr-only">Nom complet</label>
                    <input id="contact-name" value={newContactName} onChange={e => setNewContactName(e.target.value)} placeholder="Nom complet" className="w-full rounded-xl border border-[#d9cfbc] bg-white p-3.5 text-sm font-medium text-[#20283c] outline-none focus:border-[#b95740] focus:ring-1 focus:ring-[#b95740] transition-shadow" />
                  </div>
                  <div>
                    <label htmlFor="contact-phone" className="sr-only">Numéro de téléphone</label>
                    <input id="contact-phone" value={newContactPhone} onChange={e => setNewContactPhone(e.target.value)} placeholder="Numéro (ex: 90123456)" type="tel" className="w-full rounded-xl border border-[#d9cfbc] bg-white p-3.5 text-sm font-medium text-[#20283c] outline-none focus:border-[#b95740] focus:ring-1 focus:ring-[#b95740] transition-shadow" />
                  </div>
                </div>
                <button type="submit" disabled={isAddingContact || !newContactName.trim() || !newContactPhone.trim()} className="mt-4 inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-[#20283c] px-6 py-3 text-sm font-bold text-[#f7e8b4] transition-transform active:scale-95 disabled:opacity-50 disabled:active:scale-100"><Plus size={16} /> {isAddingContact ? 'Ajout en cours…' : 'Ajouter le contact'}</button>
              </form>
            )}
          </section>

          <section className="border-t border-[#dfd7c4] pt-10">
            <h2 className="text-xl font-bold text-[#20283c] mb-6">2. Préparer l'alerte</h2>

            {sosState === 'idle' && (
              <div className="space-y-6">
                <div className="rounded-2xl border border-[#d9cfbc] bg-[#faf6ec] p-5 shadow-sm">
                  <p className="text-sm font-bold text-[#20283c] mb-4">Sélectionnez les destinataires :</p>
                  <div className="space-y-3">
                    {contacts.map(c => (
                      <label key={c.id} className="flex items-center gap-4 rounded-xl border border-[#e7dfcf] bg-white p-4 cursor-pointer hover:border-[#b95740] transition-colors focus-within:ring-2 focus-within:ring-[#b95740] focus-within:ring-offset-2 focus-within:ring-offset-[#faf6ec]">
                        <input type="checkbox" checked={selectedContacts.includes(c.id)} onChange={e => {
                          if (e.target.checked) setSelectedContacts([...selectedContacts, c.id]);
                          else setSelectedContacts(selectedContacts.filter(id => id !== c.id));
                        }} className="size-5 rounded border-[#d9cfbc] text-[#b95740] focus:ring-[#b95740] focus:ring-offset-0" />
                        <span className="font-bold text-[#20283c] select-none">{c.name}</span>
                      </label>
                    ))}
                    {contacts.length === 0 && <p className="text-sm font-medium text-[#8f3e32] py-2">Vous devez d'abord ajouter des contacts ci-dessus.</p>}
                  </div>
                </div>

                <div className="rounded-2xl border border-[#d9cfbc] bg-[#faf6ec] p-5 shadow-sm">
                  <label className="flex items-start gap-4 cursor-pointer focus-within:ring-2 focus-within:ring-[#b95740] focus-within:ring-offset-4 focus-within:ring-offset-[#faf6ec] rounded-lg">
                    <input type="checkbox" checked={allowGeo} onChange={e => setAllowGeo(e.target.checked)} className="mt-1 size-5 rounded border-[#d9cfbc] text-[#b95740] focus:ring-[#b95740] focus:ring-offset-0" />
                    <div className="text-sm font-medium text-[#596071] select-none">
                      <p className="font-bold text-base text-[#20283c]">J’autorise temporairement l’accès à ma position GPS</p>
                      <p className="mt-1.5 leading-relaxed">Si vous cochez cette case, votre navigateur demandera l'autorisation d'accéder à votre position. Elle sera convertie en lien Google Maps dans le SMS.</p>
                    </div>
                  </label>
                </div>

                {locationError && (
                  <div role="alert" className="rounded-2xl border border-[#dca79b] bg-[#fff1ec] p-5 shadow-sm animate-in slide-in-from-top-2">
                    <p className="text-sm font-bold text-[#9d3526] flex items-center gap-2"><AlertTriangle size={18} /> {locationError}</p>
                    <button type="button" onClick={prepareWithoutLocation} className="mt-4 rounded-xl bg-[#9d3526] px-5 py-2.5 text-sm font-bold text-white transition-transform active:scale-95">Continuer sans la position</button>                  </div>
                )}

                <div className="pt-4 pb-8">
                  <button
                    type="button"
                    disabled={selectedContacts.length === 0}
                    onPointerDown={onPointerDown}
                    onPointerUp={stopPress}
                    onPointerLeave={stopPress}
                    onPointerCancel={stopPress}
                    onKeyDown={onKeyDown}
                    onKeyUp={onKeyUp}
                    style={{ touchAction: 'none' }}
                    className="group relative w-full overflow-hidden rounded-[24px] bg-[#d93f2c] p-7 text-center font-bold text-white shadow-lg transition-transform active:scale-[0.97] disabled:opacity-50 disabled:active:scale-100 disabled:shadow-none select-none focus:outline-none focus-visible:ring-4 focus-visible:ring-[#d93f2c] focus-visible:ring-offset-4 focus-visible:ring-offset-[#f4efdf]"
                    aria-label="Maintenir appuyé pendant 3 secondes pour préparer les messages SOS"
                  >
                    <div className="absolute inset-0 bg-[#b32b1a] origin-left transition-none" style={{ transform: `scaleX(${pressProgress / 100})` }} />
                    <span className="relative z-10 text-lg sm:text-xl flex items-center justify-center gap-3">
                      <Navigation size={24} className={pressProgress > 0 ? "animate-pulse" : ""} />
                      {pressProgress > 0 ? 'Préparation en cours...' : 'Maintenez 3 secondes pour préparer'}
                    </span>
                  </button>
                  <div aria-live="polite" className="mt-4 text-center text-sm font-medium text-[#596071]">
                    {pressProgress > 0 ? `${Math.round(pressProgress)}%` : 'Un appui long évite les déclenchements accidentels.'}
                  </div>
                </div>
              </div>
            )}

            {sosState === 'locating' && (
              <div className="rounded-3xl border border-[#dfd7c4] bg-[#faf6ec] p-10 text-center shadow-sm">
                <MapPin size={40} className="mx-auto mb-5 animate-bounce text-[#b95740]" />
                <p className="font-bold text-xl text-[#20283c]">Recherche de votre position...</p>
                <p className="mt-3 text-sm font-medium text-[#596071]">Veuillez autoriser l'accès GPS si votre navigateur vous le demande.</p>
              </div>
            )}

            {sosState === 'prepared' && (
              <div className="space-y-8 animate-in zoom-in-95 duration-300">
                <div className="rounded-2xl border border-[#a3d9b1] bg-[#eef7ed] p-6 shadow-sm">
                  <div className="flex items-center gap-2.5 text-[#267158] font-bold text-lg mb-4">
                    <CheckCircle size={24} /> Message préparé avec succès
                  </div>
                  <div className="bg-white p-5 rounded-xl border border-[#c6e6cf] text-sm font-medium text-[#20283c] whitespace-pre-wrap leading-relaxed shadow-sm">
                    {preparedMessage}
                  </div>
                </div>

                <div className="rounded-2xl border border-[#d9cfbc] bg-[#faf6ec] p-6 shadow-sm">
                  <p className="text-base font-bold text-[#20283c] mb-4">Cliquez sur chaque contact pour ouvrir votre application SMS :</p>
                  <div className="space-y-3">
                    {contacts.filter(c => selectedContacts.includes(c.id)).map(c => {
                      const isIOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent || '');
                      const separator = isIOS ? '&' : '?';
                      const href = `sms:${c.phone}${separator}body=${encodeURIComponent(preparedMessage)}`;

                      return (
                        <a key={c.id} href={href} className="group flex items-center justify-between rounded-xl bg-[#20283c] p-4 sm:p-5 text-white shadow-md hover:bg-[#323c52] transition-all active:scale-[0.98] focus:outline-none focus-visible:ring-4 focus-visible:ring-[#20283c] focus-visible:ring-offset-2 focus-visible:ring-offset-[#faf6ec]">
                          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
                            <span className="font-bold text-base">Ouvrir le SMS pour {c.name}</span>
                            <span className="text-xs font-medium text-[#8c96ab] sm:before:content-['•'] sm:before:mr-3">{c.phone}</span>
                          </div>
                          <span className="flex size-10 items-center justify-center rounded-full bg-white/10 group-hover:bg-white/20 transition-colors">
                            <Smartphone size={20} />
                          </span>
                        </a>
                      );
                    })}
                  </div>
                  <div className="mt-5 rounded-xl bg-[#fff1ec] p-4 border border-[#dca79b]">
                     <p className="text-sm font-bold text-[#9d3526] text-center">N'oubliez pas d'appuyer sur "Envoyer" dans votre application SMS pour chaque contact.</p>
                  </div>
                </div>

                <button type="button" onClick={() => {
                  setSosState('idle');
                  setPressProgress(0);
                  setPreparedMessage('');
                }} className="w-full rounded-2xl border border-[#d9cfbc] bg-white p-5 text-sm font-bold text-[#596071] hover:bg-[#f4efdf] hover:text-[#20283c] transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-[#d9cfbc] focus-visible:ring-offset-2">
                  Annuler et revenir au début
                </button>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}export function usePaylocaAuth() {
  const context = useContext(FirebaseAuthContext);
  if (!context) throw new Error('FirebaseAuthProvider is required.');
  return context;
}

export async function authenticatedFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const token = await firebaseAuth?.currentUser?.getIdToken();
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}

export async function authenticatedFetchForUser(
  expectedUserId: string,
  input: RequestInfo | URL,
  init: RequestInit = {},
) {
  if (e2eTestUser?.id === expectedUserId) {
    return fetch(input, init);
  }
  const currentUser = firebaseAuth?.currentUser;
  if (!currentUser || currentUser.uid !== expectedUserId) {
    throw new Error('Le compte actif a changé avant la synchronisation.');
  }
  const token = await currentUser.getIdToken();
  if (firebaseAuth?.currentUser?.uid !== expectedUserId) {
    throw new Error('Le compte actif a changé pendant la synchronisation.');
  }
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}
