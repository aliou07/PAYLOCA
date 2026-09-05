import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type MouseEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { useCreateListing, useGetListing, useListListings, getGetFeaturedListingsQueryKey, getGetListingQueryKey, getListListingsQueryKey } from '@workspace/api-client-react';
import type { Listing, ListingInput, ListListingsParams } from '@workspace/api-client-react';
import { ArrowRight, Bath, BriefcaseBusiness as BriefcaseIcon, Check, ChevronLeft, CircleAlert, CirclePlay, Crown, Download, Home as HomeIcon, Mail, MapPin, Menu, Phone, Play, Plus, Search, ShieldCheck, Sparkles, Store, Upload, Users, X } from 'lucide-react';
import { Link, Route, Switch, useLocation, useParams, Router as WouterRouter } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { BlueBadge } from '@/components/blue-badge';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import FunPage from '@/pages/fun';
import SosPage from '@/pages/sos';
import LeaguePage from '@/pages/league';
import CallsPage from '@/pages/calls';
import ServicesPage from '@/pages/services';
import JobsPage from '@/pages/jobs';
import SellerProfilePage from '@/pages/seller-profile';
import { HelpPage, ReferralPage, StoriesPage } from '@/pages/community';
import SearchPage from '@/pages/search';
import FamilyPage from '@/pages/family';
import { FamilyChatPage, FamilySettingsPage, ParentalControlPage } from '@/pages/familyBridge';
import { enablePushNotifications, isFirebaseMessagingConfigured } from '@/lib/firebase';
import { FirebaseAuthProvider, authenticatedFetch, normalizeNigerPhone, usePaylocaAuth, type AccountType } from '@/auth/firebaseAuth';

const queryClient = new QueryClient();
const cities = ['Niamey', 'Maradi', 'Zinder', 'Agadez', 'Tahoua'];
const FAVORITES_KEY = 'payloca-favorites';
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

function imageSource(path: string) {
  return path.startsWith('/objects/') ? `/api/storage${path}` : path;
}

async function uploadImage(file: File): Promise<string> {
  if (!IMAGE_TYPES.has(file.type)) throw new Error('Utilisez une image JPG, PNG, WebP ou GIF.');
  if (!file.size || file.size > MAX_IMAGE_SIZE) throw new Error('La photo ne doit pas dépasser 10 Mo.');
  const response = await authenticatedFetch('/api/storage/uploads/request-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
  });
  const payload = await response.json().catch(() => ({})) as { error?: string; uploadURL?: string; objectPath?: string };
  if (!response.ok || !payload.uploadURL || !payload.objectPath) {
    throw new Error(payload.error ?? 'Impossible de préparer l’envoi de cette photo.');
  }
  const upload = await fetch(payload.uploadURL, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
  if (!upload.ok) throw new Error('Impossible d’envoyer cette photo. Réessayez.');
  return payload.objectPath;
}

async function enhancePhoto(file: File): Promise<{ file: File; originalUrl: string; enhancedUrl: string; blurScore: number }> {
  const originalUrl = URL.createObjectURL(file);
  const image = new Image();
  image.src = originalUrl;
  await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('Cette image ne peut pas être analysée.')); });
   const max = 1200;
  const scale = Math.min(1, max / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Votre navigateur ne permet pas d’améliorer cette image.');
  context.drawImage(image, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height);
  const source = new Uint8ClampedArray(pixels.data);
  let edgeEnergy = 0;
  const index = (x: number, y: number) => (y * width + x) * 4;
  for (let y = 1; y < height - 1; y += 3) for (let x = 1; x < width - 1; x += 3) {
    const center = source[index(x, y)];
    edgeEnergy += Math.abs(center - source[index(x - 1, y)]) + Math.abs(center - source[index(x, y - 1)]);
  }
  const samples = Math.max(1, Math.floor(width / 3) * Math.floor(height / 3));
  const blurScore = Math.round(edgeEnergy / samples);
  const brightness = Array.from({ length: Math.floor(source.length / 4) }, (_, i) => (source[i * 4] + source[i * 4 + 1] + source[i * 4 + 2]) / 3).reduce((a, b) => a + b, 0) / Math.max(1, source.length / 4);
  const exposure = brightness < 78 ? 1.2 : brightness > 205 ? 0.88 : 1.05;
  for (let i = 0; i < pixels.data.length; i += 4) {
    const average = (source[i] + source[i + 1] + source[i + 2]) / 3;
    const contrast = 1.06;
    for (let channel = 0; channel < 3; channel++) pixels.data[i + channel] = Math.max(0, Math.min(255, ((source[i + channel] - average) * 1.08 + average) * exposure * contrast));
  }
  context.putImageData(pixels, 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
  if (!blob) throw new Error('La version Pro n’a pas pu être créée.');
  const enhancedFile = new File([blob], file.name.replace(/\.[^.]+$/, '') + '-payloca-pro.jpg', { type: 'image/jpeg' });
  return { file: enhancedFile, originalUrl, enhancedUrl: URL.createObjectURL(blob), blurScore };
}

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path;
}
function displayName(user: { fullName: string } | null) {
  return user?.fullName || 'Utilisateur PAYLOCA';
}

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

function useInstallPrompt() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(() => window.matchMedia?.('(display-mode: standalone)').matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const handleInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  const install = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice.catch(() => undefined);
    setInstallPrompt(null);
  };

  return { install, canInstall: Boolean(installPrompt), installed, isIOS };
}

function PwaInstallButton({ compact = false }: { compact?: boolean }) {
  const { install, canInstall, installed, isIOS } = useInstallPrompt();
  const [showIOSInstructions, setShowIOSInstructions] = useState(false);
  if (installed) return null;
  const handleInstall = async () => {
    if (isIOS && !canInstall) {
      setShowIOSInstructions((current) => !current);
      return;
    }
    await install();
  };
  return (
    <span className={`${compact ? 'flex w-full flex-col items-stretch' : 'hidden flex-col items-start lg:inline-flex'}`}>
      <button
        type="button"
        onClick={handleInstall}
        disabled={!canInstall && !isIOS}
        title={canInstall ? 'Installer PAYLOCA sur cet appareil' : isIOS ? 'Afficher les étapes d’installation sur iPhone' : 'L’installation sera proposée par votre navigateur'}
        data-testid="button-install-app"
        className={`${compact ? 'w-full justify-center' : ''} inline-flex items-center gap-2 rounded-full border border-[#0877d1] px-3 py-2 text-xs font-bold text-[#0877d1] transition-colors hover:bg-[#e3f3ff] disabled:cursor-not-allowed disabled:opacity-55`}
      >
        <Download size={14} /> Installer PAYLOCA
      </button>
      {showIOSInstructions && isIOS && (
        <span role="status" className="mt-2 max-w-[260px] rounded-xl border border-[#9bcff1] bg-[#edf8ff] p-3 text-xs font-semibold leading-5 text-[#075b8f]">
          Sur iPhone : ouvrez le bouton Partager, choisissez « Sur l’écran d’accueil », puis appuyez sur « Ajouter ».
        </span>
      )}
    </span>
  );
}

function NotificationBootstrap() {
  const { isSignedIn, user } = usePaylocaAuth();

  useEffect(() => {
    if (!isSignedIn || !user?.id || !isFirebaseMessagingConfigured) return;
    let disposed = false;
    let unsubscribe: (() => void) | undefined;

    const setup = async () => {
      const result = await enablePushNotifications((payload) => {
        if (document.visibilityState !== 'visible' || !('Notification' in window) || Notification.permission !== 'granted') return;
        const data = payload.data ?? {};
        new Notification(payload.notification?.title ?? 'Nouveau message PAYLOCA', {
          body: payload.notification?.body ?? data.body ?? 'Vous avez reçu un nouveau message.',
          icon: `${basePath}/payloca-app-icon-512.png`,
          data,
        });
      }).catch(() => ({ enabled: false as const, reason: 'setup-failed' as const }));

      if (disposed) {
        result.enabled && result.unsubscribe?.();
        return;
      }
      if (!result.enabled) return;
      unsubscribe = result.unsubscribe;
      await authenticatedFetch('/api/push-tokens', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: result.token }),
      }).catch(() => undefined);
    };

    setup();
    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, [isSignedIn, user?.id]);

  return null;
}

function useFavorites() {
  const [favorites, setFavorites] = useState<number[]>(() => {
    try { return JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? '[]') as number[]; } catch { return []; }
  });
  const toggle = (id: number) => setFavorites((current) => {
    const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
    return next;
  });
  return { favorites, toggle };
}

function useFirstLaunch() {
  const [show, setShow] = useState(() => localStorage.getItem('payloca-onboarding-seen') !== 'true');
  const finish = () => { localStorage.setItem('payloca-onboarding-seen', 'true'); setShow(false); };
  return { show, finish };
}

function isImportableListing(value: unknown): value is ListingInput {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return typeof item.title === 'string' && item.title.length >= 3
    && (item.type === 'house' || item.type === 'shop')
    && typeof item.city === 'string' && typeof item.neighborhood === 'string'
    && typeof item.price === 'number' && Number.isFinite(item.price) && item.price >= 0
    && typeof item.bedrooms === 'number' && Number.isFinite(item.bedrooms) && item.bedrooms >= 0
    && typeof item.imageUrl === 'string' && typeof item.description === 'string'
    && typeof item.contact === 'string' && Boolean(normalizeNigerPhone(item.contact));
}

function BackupControls() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState('');
  const allListings = useListListings({ type: 'all' }, { query: { queryKey: getListListingsQueryKey({ type: 'all' }), enabled: false } });
  const createListing = useCreateListing();
  const client = useQueryClient();

  const exportBackup = async () => {
    setMessage('Préparation de la sauvegarde...');
    const result = await allListings.refetch();
    if (result.isError || !result.data) {
      setMessage('Impossible de charger les annonces pour la sauvegarde.');
      return;
    }
    const backup = {
      app: 'PAYLOCA',
      exportedAt: new Date().toISOString(),
      listings: result.data,
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `payloca-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setMessage(`${backup.listings.length} annonce${backup.listings.length === 1 ? '' : 's'} exportée${backup.listings.length === 1 ? '' : 's'}.`);
  };

  const importBackup = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      const rawListings = Array.isArray(parsed) ? parsed : (parsed && typeof parsed === 'object' && Array.isArray((parsed as { listings?: unknown }).listings) ? (parsed as { listings: unknown[] }).listings : []);
      const listings = rawListings.filter(isImportableListing).map((item) => ({
        ...item,
        contact: normalizeNigerPhone(item.contact),
        price: Math.round(item.price),
        bedrooms: Math.round(item.bedrooms),
      }));
      if (!listings.length) {
        setMessage('Aucune annonce valide trouvée dans ce fichier.');
        return;
      }
      for (const listing of listings) await createListing.mutateAsync({ data: listing });
      await client.invalidateQueries({ queryKey: getListListingsQueryKey() });
      await client.invalidateQueries({ queryKey: getGetFeaturedListingsQueryKey() });
      setMessage(`${listings.length} annonce${listings.length === 1 ? '' : 's'} importée${listings.length === 1 ? '' : 's'} avec succès.`);
    } catch {
      setMessage('Impossible de lire ce fichier. Utilisez une sauvegarde PAYLOCA au format JSON.');
    }
  };

  return (
    <div className="mt-5">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={exportBackup} disabled={allListings.isLoading} data-testid="button-export-backup" className="inline-flex items-center gap-2 rounded-full border border-[#536077] px-3 py-2 text-xs font-bold text-[#f7e8b4] transition-colors hover:bg-[#30394d] disabled:opacity-50">
          <Download size={14} /> Exporter vers mon disque
        </button>
        <button type="button" onClick={() => fileRef.current?.click()} disabled={createListing.isPending} data-testid="button-import-backup" className="inline-flex items-center gap-2 rounded-full border border-[#536077] px-3 py-2 text-xs font-bold text-[#f7e8b4] transition-colors hover:bg-[#30394d] disabled:opacity-50">
          <Upload size={14} /> Importer une sauvegarde
        </button>
        <input ref={fileRef} type="file" accept="application/json,.json" onChange={importBackup} className="hidden" data-testid="input-import-backup" />
      </div>
      {message && <p className="mt-3 text-xs text-[#bbc0c7]" role="status">{message}</p>}
    </div>
  );
}

function formatPrice(price: number) {
  return `${new Intl.NumberFormat('fr-FR').format(price)} F CFA`;
}

function Header() {
  const [open, setOpen] = useState(false);
  const [signOutError, setSignOutError] = useState('');
  const [revokingPushAccess, setRevokingPushAccess] = useState(false);
  const [location, setLocation] = useLocation();
  const { isSignedIn, user, accountType, membership, signOut } = usePaylocaAuth();
  const handleSignOut = async () => {
    if (!user?.id || revokingPushAccess) return;
    setSignOutError('');
    setRevokingPushAccess(true);
    const response = await authenticatedFetch('/api/push-tokens', {
      method: 'DELETE',
      credentials: 'include',
    }).catch(() => null);
    if (!response?.ok) {
      setSignOutError('Impossible de sécuriser vos notifications. Vérifiez votre connexion puis réessayez avant de vous déconnecter.');
      setRevokingPushAccess(false);
      return;
    }
    await signOut();
  };
  const adultNav = [
    { href: '/', label: 'Accueil' },
    { href: '/annonces', label: 'Les annonces' },
    { href: '/services', label: 'Services à domicile' },
    { href: '/emplois', label: 'Emploi' },
    { href: '/boutique', label: 'Ma boutique' },
    { href: '/recherche', label: 'Rechercher' },
    { href: '/sos', label: 'SOS' },
    { href: '/ligue-payloca', label: 'Ligue PAYLOCA' },
    { href: '/appels', label: 'PAYLOCA CALLS' },
    { href: '/parrainage', label: 'Parrainage' },
    { href: '/aide', label: 'Aide' },
     { href: '/famille', label: 'Espace Famille' },
    { href: '/messages', label: 'Messages' },
    { href: '/abonnement', label: 'Mon abonnement' },
    { href: '/publier', label: 'Publier' },
  ];
  const userNav = [
    ...adultNav.filter((item) => !['/boutique', '/publier'].includes(item.href)),
    { href: '/fil', label: 'PAYLOCA FUN' },
  ];
  const agencyNav = adultNav;
  const ongNav = [
    { href: '/espace-ong', label: 'Espace ONG' },
    { href: '/recherche', label: 'Rechercher' },
    { href: '/fil', label: 'Fil communautaire' },
    { href: '/messages', label: 'Messages' },
    { href: '/aide', label: 'Aide' },
  ];
  const nav = (accountType === 'agency' ? agencyNav : accountType === 'ong' ? ongNav : userNav)
    .filter((item) => !(isSignedIn && membership.status === 'ESSAI_VIP_GRATUIT' && item.href === '/abonnement'));
  const accountHome = accountType === 'agency' ? '/espace-agence' : accountType === 'ong' ? '/espace-ong' : '/';
  return (
     <header className="sticky top-0 z-40 border-b border-[#dfd7c4] bg-[#f4efdf]/95 backdrop-blur-md">
        <div className="page-shell flex h-[72px] min-w-0 items-center justify-between gap-4">
         <Link href="/" className="group flex min-w-0 items-center gap-3" data-testid="link-logo">
           <span className="relative grid size-10 place-items-center rounded-[13px] bg-[#20283c] text-[#f7e8b4] shadow-[0_0_26px_rgba(255,78,174,.28)]">
            <HomeIcon size={21} strokeWidth={2.4} />
             <span className="absolute -right-1 -top-1 size-2 rounded-full bg-[#b95740] shadow-[0_0_10px_rgba(255,78,174,.8)]" />
          </span>
          <span>
            <span className="block font-display text-[21px] font-bold leading-none tracking-[-.03em] text-[#20283c]">PAYLOCA</span>
             <span className="site-brand-tagline mt-1 block text-[10px] font-bold uppercase tracking-[.18em] text-[#b95740]">Trouver son chez-soi</span>
          </span>
        </Link>
          <nav className="hidden items-center gap-5 xl:gap-7 lg:flex" aria-label="Navigation principale">
          {nav.map((item) => (
             <Link key={item.href} href={item.href} data-testid={`link-nav-${item.label.toLowerCase().replaceAll(' ', '-')}`} className={`relative py-2 text-xs font-semibold transition-colors ${location === item.href ? 'text-[#b95740]' : 'text-[#596071] hover:text-[#20283c]'}`}>
              {item.label}
              {location === item.href && <span className="absolute inset-x-0 -bottom-[1px] mx-auto h-0.5 w-5 rounded-full bg-[#e9b949]" />}
            </Link>
          ))}
        </nav>
         <PwaInstallButton />
          {accountType === 'agency' && <Link href="/publier" data-testid="link-header-publish" className="hidden items-center gap-2 rounded-full bg-[#b95740] px-4 py-2.5 text-sm font-bold text-[#fff7e8] shadow-[0_0_24px_rgba(255,78,174,.2)] transition-transform hover:-translate-y-0.5 active:translate-y-0 lg:flex">
           <Plus size={16} /> Publier une annonce
         </Link>}
         {isSignedIn ? <div className="hidden items-center gap-2 lg:flex">{membership.plan === 'vip_or' && <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-[#e9b949] to-[#c9921f] px-2 py-1 text-[10px] font-extrabold text-[#20283c]" data-testid="badge-vip-or"><Crown size={12} /> VIP OR</span>}{membership.plan === 'vip_bronze' && <span className="inline-flex items-center gap-1 rounded-full bg-[#9da3ae] px-2 py-1 text-[10px] font-extrabold text-white" data-testid="badge-vip-bronze"><Crown size={12} /> VIP BRONZE</span>}<span className="max-w-28 truncate text-xs font-bold text-[#596071]">{displayName(user)}</span><button type="button" onClick={handleSignOut} disabled={revokingPushAccess} className="rounded-full border border-[#d9cfbc] px-3 py-2 text-xs font-bold text-[#596071] hover:bg-[#ece3d0] disabled:opacity-60">{revokingPushAccess ? 'Sécurisation...' : 'Déconnexion'}</button></div> : <Link href="/sign-in" className="hidden rounded-full border border-[#20283c] px-4 py-2 text-sm font-bold text-[#20283c] hover:bg-[#ece3d0] lg:block">Connexion</Link>}
          <button type="button" aria-label="Ouvrir le menu" data-testid="button-mobile-menu" onClick={() => setOpen(!open)} className="rounded-xl border border-[#d9cfbc] p-2 text-[#20283c] lg:hidden">
          {open ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>
      {open && (
         <div className="border-t border-[#dfd7c4] bg-[#f8f3e6] px-4 py-4 lg:hidden">
       <nav className="page-shell flex min-w-0 flex-col gap-1">
            {nav.map((item) => <Link key={item.href} href={item.href} onClick={() => setOpen(false)} data-testid={`link-mobile-${item.label.toLowerCase().replaceAll(' ', '-')}`} className="rounded-xl px-4 py-3 font-semibold text-[#20283c] hover:bg-[#ece3d0]">{item.label}</Link>)}
            <PwaInstallButton compact />
            {isSignedIn && <button type="button" onClick={handleSignOut} disabled={revokingPushAccess} className="rounded-xl px-4 py-3 text-left font-semibold text-[#b95740] hover:bg-[#ece3d0] disabled:opacity-60">{revokingPushAccess ? 'Sécurisation...' : 'Déconnexion'}</button>}
          </nav>
        </div>
      )}
      {signOutError && <div role="alert" data-testid="push-revocation-error" className="border-t border-[#dca79b] bg-[#fff1ec] px-4 py-3 text-center text-sm font-semibold text-[#9d3526]">{signOutError}</div>}
     </header>
  );
}

function Footer() {
  return (
    <footer className="mt-20 bg-[#20283c] text-[#f6edda]">
      <div className="page-shell grid gap-10 py-12 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-[#e9b949] text-[#20283c]"><HomeIcon size={18} /></span><span className="font-display text-xl font-bold">PAYLOCA</span></div>
          <p className="mt-4 max-w-xs text-sm leading-6 text-[#bbc0c7]">Des adresses fiables pour les familles et les commerçants du Niger.</p>
          <p className="mt-5 text-xs font-bold uppercase tracking-[.16em] text-[#e9b949]">Mes sauvegardes</p>
          <BackupControls />
        </div>
        <div><p className="text-xs font-bold uppercase tracking-[.18em] text-[#e9b949]">Explorer</p><div className="mt-4 flex flex-col gap-3 text-sm text-[#d5d4ce]"><Link href="/annonces" data-testid="link-footer-listings">Voir les annonces</Link><Link href="/services" data-testid="link-footer-services">Services à domicile</Link><Link href="/emplois" data-testid="link-footer-jobs">Offres d’emploi</Link><Link href="/boutique" data-testid="link-footer-shop">Ma boutique</Link><Link href="/publier" data-testid="link-footer-publish">Publier un bien</Link></div></div>
         <div><p className="text-xs font-bold uppercase tracking-[.18em] text-[#e9b949]">Notre promesse</p><p className="mt-4 text-sm leading-6 text-[#bbc0c7]">Une plateforme simple, locale et vérifiée, pensée pour votre quotidien.</p><div className="mt-6 flex flex-col gap-2 text-xs text-[#d5d4ce]"><Link href="/confidentialite">Politique de confidentialité</Link><Link href="/conditions">Conditions d'utilisation</Link><Link href="/a-propos">À propos</Link><Link href="/sos">Préparation SOS</Link><Link href="/favoris">Mes Favoris</Link><Link href="/parametres">Paramètres</Link></div></div>
      </div>
      <div className="border-t border-[#3b4354]"><div className="page-shell py-4 text-xs text-[#9da3ae]">© 2024 PAYLOCA · Fait avec soin au Niger</div></div>
    </footer>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return <div className="noise-overlay min-h-[100dvh] bg-[#f4efdf] text-[#20283c]"><Header /><main>{children}</main><Footer /></div>;
}

function ListingImage({ listing, className = '' }: { listing: Listing; className?: string }) {
  return (
    <div className={`relative overflow-hidden bg-[#d8c89f] ${className}`}>
      <img src={imageSource(listing.imageUrl)} alt={listing.title} className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" onError={(event) => { event.currentTarget.style.display = 'none'; }} />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#20283c]/35 via-transparent to-transparent" />
       {listing.verified && <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-[#f8f3e6]/95 px-2.5 py-1 text-[11px] font-bold text-[#0877d1]"><BlueBadge size={14} /> Vérifié</span>}
       <span className="absolute bottom-3 left-3 rounded-full bg-[#20283c]/90 px-2.5 py-1 text-[10px] font-bold text-[#f7e8b4]">Gratuit jusqu’au {new Date(listing.launchFreeUntil).toLocaleDateString('fr-FR')}</span>
    </div>
  );
}

function ListingCard({ listing, featured = false }: { listing: Listing; featured?: boolean }) {
  const { favorites, toggle } = useFavorites();
  const isFavorite = favorites.includes(listing.id);
  const share = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const url = `${window.location.origin}/annonces/${listing.id}`;
    if (navigator.share) {
      void navigator.share({ title: listing.title, text: 'Découvrez cette annonce sur PAYLOCA.', url }).catch(() => undefined);
    } else {
      void navigator.clipboard?.writeText(url).then(() => window.alert('Lien de l’annonce copié.')).catch(() => window.alert(url));
    }
  };
  const report = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    window.alert('Merci, votre signalement a été pris en compte.');
  };
  return (
    <Link href={`/annonces/${listing.id}`} data-testid={`card-listing-${listing.id}`} className={`group block overflow-hidden rounded-[22px] border border-[#dfd7c4] bg-[#faf6ec] shadow-[0_5px_0_#e8deca] transition-all hover:-translate-y-1 hover:shadow-[0_9px_0_#e8deca] ${featured ? 'md:grid md:grid-cols-[1.04fr_1fr]' : ''}`}>
      <ListingImage listing={listing} className={featured ? 'h-64 md:h-full' : 'h-52'} />
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div><span className="text-[11px] font-bold uppercase tracking-[.16em] text-[#b95740]">{listing.type === 'house' ? 'Maison à louer' : 'Boutique à louer'}</span><h3 className="mt-1 font-display text-[22px] font-bold leading-tight text-[#20283c]">{listing.title}</h3></div>
          <span className="mt-1 rounded-full bg-[#f0dfae] px-2 py-1 text-[11px] font-bold text-[#685523]">{listing.city}</span>
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-sm text-[#687080]"><MapPin size={15} className="text-[#b95740]" /> {listing.neighborhood}</p>
         <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-[#e7dfcf] pt-4"><span className="text-lg font-bold text-[#20283c]">{formatPrice(listing.price)}<small className="ml-1 text-xs font-medium text-[#7a7f87]">/mois</small></span><span className="grid size-8 place-items-center rounded-full bg-[#20283c] text-[#f7e8b4] transition-transform group-hover:translate-x-1"><ArrowRight size={16} /></span></div>
         <div className="mt-3 flex flex-wrap gap-2">
           <button type="button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); toggle(listing.id); }} className={`rounded-full px-3 py-1.5 text-xs font-bold ${isFavorite ? 'bg-[#f0dfae] text-[#685523]' : 'border border-[#d9cfbc] text-[#656878]'}`}>{isFavorite ? '♥ Enregistrée' : '♡ Favoris'}</button>
           <button type="button" onClick={share} className="rounded-full border border-[#d9cfbc] px-3 py-1.5 text-xs font-bold text-[#656878]">Partager</button>
           <button type="button" onClick={report} className="rounded-full border border-[#d9cfbc] px-3 py-1.5 text-xs font-bold text-[#656878]">Signaler</button>
         </div>
      </div>
    </Link>
  );
}

function ListingSkeleton({ featured = false }: { featured?: boolean }) {
  return <div className={`overflow-hidden rounded-[22px] border border-[#dfd7c4] bg-[#faf6ec] ${featured ? 'md:grid md:grid-cols-2' : ''}`}><div className={`animate-pulse bg-[#e5ddcd] ${featured ? 'h-64 md:h-full' : 'h-52'}`} /><div className="space-y-4 p-5"><div className="h-3 w-24 animate-pulse rounded bg-[#e5ddcd]" /><div className="h-7 w-3/4 animate-pulse rounded bg-[#e5ddcd]" /><div className="h-4 w-1/2 animate-pulse rounded bg-[#e5ddcd]" /><div className="h-5 w-2/3 animate-pulse rounded bg-[#e5ddcd]" /></div></div>;
}

function QueryError({ label, onRetry }: { label: string; onRetry: () => void }) {
  return <div className="col-span-full rounded-[22px] border border-[#e4bbb0] bg-[#fff1eb] p-8 text-center"><CircleAlert className="mx-auto text-[#b95740]" size={30} /><h3 className="mt-3 font-display text-xl font-bold text-[#20283c]">Impossible de charger {label}</h3><p className="mt-1 text-sm text-[#6e6c70]">Vérifiez votre connexion puis réessayez.</p><button type="button" onClick={onRetry} data-testid="button-retry" className="mt-5 rounded-full bg-[#b95740] px-5 py-2.5 text-sm font-bold text-[#fff7e8] transition-transform hover:-translate-y-0.5">Réessayer</button></div>;
}

function EmptyListings({ compact = false }: { compact?: boolean }) {
  return <div className={`${compact ? '' : 'col-span-full'} rounded-[22px] border border-dashed border-[#cfc4ae] bg-[#f8f3e6] p-10 text-center`}><span className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#f0dfae] text-[#8d7431]"><HomeIcon size={22} /></span><h3 className="mt-4 font-display text-xl font-bold">Pas encore d’annonce ici</h3><p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-[#727583]">Les nouvelles adresses arrivent bientôt. Vous pouvez être le premier à publier.</p><Link href="/publier" data-testid="link-empty-publish" className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#20283c] px-5 py-2.5 text-sm font-bold text-[#f7e8b4]">Publier une annonce <ArrowRight size={15} /></Link></div>;
}

type PublicFunPreviewVideo = {
  id: number | string;
  authorName: string;
  city: string;
  caption: string;
  videoUrl: string;
};

function PublicFunPreview() {
  const [videos, setVideos] = useState<PublicFunPreviewVideo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void authenticatedFetch('/api/fun/videos?limit=3')
      .then(async (response) => {
        if (!response.ok) throw new Error('Fil indisponible');
        return response.json() as Promise<unknown>;
      })
      .then((payload) => {
        if (!active) return;
        const raw = Array.isArray(payload) ? payload : [];
        setVideos(raw.filter((item): item is PublicFunPreviewVideo => {
          if (!item || typeof item !== 'object') return false;
          const value = item as Record<string, unknown>;
          return (typeof value.id === 'number' || typeof value.id === 'string')
            && typeof value.authorName === 'string'
            && typeof value.city === 'string'
            && typeof value.caption === 'string'
            && typeof value.videoUrl === 'string';
        }));
      })
      .catch(() => {
        if (active) setVideos([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  return (
    <div className="relative z-10 rounded-[28px] border border-[#45516b] bg-[#151b2b]/90 p-3 shadow-[0_8px_0_#0d1220]">
      <div className="flex items-center justify-between px-3 pb-3 text-[#f7edda]">
        <div><span className="text-[10px] font-bold uppercase tracking-[.18em] text-[#e9b949]">À l’ouverture</span><h2 className="mt-1 font-display text-2xl font-bold">Le Niger en mouvement</h2></div>
        <span className="grid size-10 place-items-center rounded-2xl bg-[#b95740] text-white"><CirclePlay size={20} /></span>
      </div>
      {loading ? (
        <div className="grid grid-cols-3 gap-2" aria-label="Chargement du fil public">
          {[1, 2, 3].map((item) => <div key={item} className="aspect-[3/4] rounded-2xl bg-[#2b3850]" />)}
        </div>
      ) : videos.length ? (
        <div className="grid grid-cols-3 gap-2">
          {videos.map((video) => <Link key={video.id} href="/fil" className="group relative aspect-[3/4] overflow-hidden rounded-2xl bg-[#2b3850]" data-testid={`link-home-fun-${video.id}`}>
            <video src={video.videoUrl.startsWith('/objects/') ? `/api/storage${video.videoUrl}` : video.videoUrl} muted playsInline preload="metadata" className="size-full object-cover opacity-85 transition-transform duration-500 group-hover:scale-105" aria-hidden="true" />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#0d1220] via-[#0d1220]/70 to-transparent p-3 pt-10 text-white"><p className="truncate text-xs font-bold">{video.authorName}</p><p className="truncate text-[10px] text-[#d5d4ce]">{video.city} · {video.caption}</p></div>
            <span className="absolute right-2 top-2 grid size-7 place-items-center rounded-full bg-[#20283c]/75 text-white"><Play size={12} fill="currentColor" /></span>
          </Link>)}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {[
            ['Culture', 'bg-[#0877d1]'],
            ['Vie locale', 'bg-[#b95740]'],
            ['Créativité', 'bg-[#6d3f92]'],
          ].map(([label, color]) => <Link key={label} href="/fil" className={`group relative grid aspect-[3/4] place-items-center overflow-hidden rounded-2xl ${color} p-3 text-center text-white`} data-testid={`link-home-fun-empty-${label.toLowerCase().replaceAll(' ', '-')}`}>
            <span className="absolute -right-5 -top-5 size-20 rounded-full border-[10px] border-white/15 transition-transform group-hover:scale-125" />
            <span className="relative font-display text-lg font-bold">{label}</span>
          </Link>)}
        </div>
      )}
      <div className="flex items-center justify-between gap-3 px-2 pt-3 text-xs"><span className="text-[#bbc0c7]">Vidéos et moments locaux, sans annonces immobilières.</span><Link href="/fil" className="shrink-0 font-bold text-[#e9b949]">Voir le fil <ArrowRight size={13} className="ml-1 inline" /></Link></div>
    </div>
  );
}

function Home() {
  return (
    <Shell>
       <section className="home-hero ambient-grid relative overflow-hidden bg-[#20283c] text-[#f7edda]">
         <div className="page-shell relative grid min-h-[560px] items-center gap-10 py-12 lg:grid-cols-[.9fr_1.1fr] lg:py-16">
           <div className="relative z-10">
            <span className="inline-flex items-center gap-2 rounded-full border border-[#536077] bg-[#2b3850] px-3 py-1.5 text-xs font-bold uppercase tracking-[.15em] text-[#f7e8b4]"><span className="size-1.5 rounded-full bg-[#e9b949] shadow-[0_0_12px_rgba(233,185,73,.9)]" /> Bienvenue chez vous</span>
            <h1 className="mt-5 max-w-[650px] font-display text-[clamp(3rem,7vw,5.8rem)] font-bold leading-[.94] tracking-[-.055em] text-[#f7edda]">Découvrez le Niger,<br /><span className="text-[#d87854]">à votre façon.</span></h1>
             <p className="mt-6 max-w-lg text-base leading-7 text-[#bbc0c7] md:text-lg">Commencez par les voix, les images et les idées du pays. Explorez le quotidien du Niger avant d’ouvrir les espaces spécialisés.</p>
          </div>
           <div><PublicFunPreview /></div>
        </div>
        <div className="absolute -bottom-12 -left-10 size-32 rounded-full border-[18px] border-[#e5cb7e]/50" />
      </section>
       <section className="page-shell py-12 md:py-16">
        <div className="grid gap-4 md:grid-cols-2">
          <Link href="/fil" data-testid="link-home-youth" className="group relative overflow-hidden rounded-[24px] bg-[#0877d1] p-6 text-white shadow-[0_5px_0_#075b8f] transition-transform hover:-translate-y-1"><Users className="absolute -right-2 -top-3 size-28 rotate-12 text-white/15" /><span className="text-xs font-bold uppercase tracking-[.18em] text-[#bde8ff]">Espace jeunes</span><h2 className="mt-3 max-w-sm font-display text-3xl font-bold">Voir, partager, découvrir.</h2><p className="mt-2 max-w-sm text-sm leading-6 text-white/80">Le fil PAYLOCA FUN pour les vidéos et les moments locaux.</p><span className="mt-5 inline-flex items-center gap-2 text-sm font-bold">Entrer dans FUN <ArrowRight size={16} /></span></Link>
          <Link href="/annonces" data-testid="link-home-rentals" className="group relative overflow-hidden rounded-[24px] bg-[#b95740] p-6 text-[#fff7e8] shadow-[0_5px_0_#8f3e32] transition-transform hover:-translate-y-1"><Store className="absolute -right-2 -top-3 size-28 -rotate-12 text-white/15" /><span className="text-xs font-bold uppercase tracking-[.18em] text-[#ffd0bd]">Locations et boutiques</span><h2 className="mt-3 max-w-sm font-display text-3xl font-bold">Chercher un lieu précis.</h2><p className="mt-2 max-w-sm text-sm leading-6 text-white/80">Maisons et boutiques restent dans un espace de recherche dédié.</p><span className="mt-5 inline-flex items-center gap-2 text-sm font-bold">Rechercher un bien <ArrowRight size={16} /></span></Link>
        </div>
         <div className="mt-12 border-t border-[#dfd7c4] pt-8"><span className="text-xs font-bold uppercase tracking-[.18em] text-[#b95740]">Autres espaces</span><div className="mt-6 grid gap-4 md:grid-cols-3"><Link href="/services" className="rounded-[20px] border border-[#dfd7c4] bg-[#faf6ec] p-5 shadow-[0_4px_0_#e8deca]"><Search className="text-[#0877d1]" size={22} /><h3 className="mt-4 font-display text-xl font-bold">Services certifiés</h3><p className="mt-2 text-sm leading-6 text-[#676b76]">Trouver une aide utile près de chez vous.</p></Link><Link href="/emplois" className="rounded-[20px] border border-[#dfd7c4] bg-[#faf6ec] p-5 shadow-[0_4px_0_#e8deca]"><BriefcaseIcon className="text-[#b95740]" size={22} /><h3 className="mt-4 font-display text-xl font-bold">Emploi local</h3><p className="mt-2 text-sm leading-6 text-[#676b76]">Consulter les opportunités et les métiers.</p></Link><Link href="/recherche" className="rounded-[20px] border border-[#dfd7c4] bg-[#faf6ec] p-5 shadow-[0_4px_0_#e8deca]"><Users className="text-[#6d3f92]" size={22} /><h3 className="mt-4 font-display text-xl font-bold">Rechercher un profil</h3><p className="mt-2 text-sm leading-6 text-[#676b76]">Retrouver une publication ou une personne.</p></Link></div></div>
      </section>
       <section className="trust-section bg-[#20283c] py-16 text-[#f7edda]"><div className="page-shell"><div className="max-w-xl"><span className="text-xs font-bold uppercase tracking-[.18em] text-[#e9b949]">Pourquoi PAYLOCA</span><h2 className="mt-3 font-display text-4xl font-bold tracking-[-.04em]">Chercher un lieu.<br /><span className="text-[#d87854]">Trouver sa place.</span></h2></div><div className="mt-10 grid gap-8 md:grid-cols-3"><div className="border-t border-[#4b5364] pt-5"><ShieldCheck className="text-[#e9b949]" size={24} /><h3 className="mt-4 font-display text-xl font-bold">Des annonces claires</h3><p className="mt-2 text-sm leading-6 text-[#bbc0c7]">Des informations essentielles pour décider sans perdre de temps.</p></div><div className="border-t border-[#4b5364] pt-5"><MapPin className="text-[#e9b949]" size={24} /><h3 className="mt-4 font-display text-xl font-bold">Pensé pour le Niger</h3><p className="mt-2 text-sm leading-6 text-[#bbc0c7]">Niamey, Maradi, Zinder et les quartiers que vous connaissez.</p></div><div className="border-t border-[#4b5364] pt-5"><Phone className="text-[#e9b949]" size={24} /><h3 className="mt-4 font-display text-xl font-bold">Un contact direct</h3><p className="mt-2 text-sm leading-6 text-[#bbc0c7]">Échangez directement avec le propriétaire pour avancer sereinement.</p></div></div></div></section>
    </Shell>
  );
}

function ListingsPage() {
  const [location, setLocation] = useLocation();
  const initial = useMemo(() => new URLSearchParams(location.split('?')[1] ?? ''), [location]);
  const [type, setType] = useState<'all' | 'house' | 'shop'>((initial.get('type') as 'all' | 'house' | 'shop') || 'all');
  const [city, setCity] = useState(initial.get('city') || '');
  const [maxPrice, setMaxPrice] = useState(initial.get('maxPrice') || '');
  const params = useMemo<ListListingsParams>(() => ({ ...(type !== 'all' ? { type } : {}), ...(city ? { city } : {}), ...(maxPrice ? { maxPrice: Number(maxPrice) } : {}) }), [type, city, maxPrice]);
  const query = useListListings(params, { query: { queryKey: getListListingsQueryKey(params) } });
  const applyFilters = (event: FormEvent) => { event.preventDefault(); const next = new URLSearchParams(); if (type !== 'all') next.set('type', type); if (city) next.set('city', city); if (maxPrice) next.set('maxPrice', maxPrice); setLocation(`/annonces${next.toString() ? `?${next.toString()}` : ''}`); };
  const clearFilters = () => { setType('all'); setCity(''); setMaxPrice(''); setLocation('/annonces'); };
  return <Shell><section className="border-b border-[#dfd7c4] bg-[#e8ddc6] py-12 md:py-16"><div className="page-shell"><span className="text-xs font-bold uppercase tracking-[.18em] text-[#b95740]">Le carnet des adresses</span><h1 className="mt-2 font-display text-5xl font-bold tracking-[-.05em] text-[#20283c]">Toutes les annonces</h1><p className="mt-3 max-w-lg text-[#676b76]">Une maison pour vivre, une boutique pour entreprendre. À vous de choisir.</p></div></section><section className="page-shell py-8"><form onSubmit={applyFilters} className="rounded-[20px] border border-[#dfd7c4] bg-[#faf6ec] p-4 shadow-[0_4px_0_#e8deca]"><div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]"><label className="text-xs font-bold uppercase tracking-wider text-[#747272]">Je cherche<select value={type} onChange={(event) => setType(event.target.value as 'all' | 'house' | 'shop')} data-testid="select-filter-type" className="mt-2 w-full rounded-xl border border-[#d9cfbc] bg-[#f4efdf] p-3 text-sm font-semibold normal-case tracking-normal text-[#20283c] outline-none focus:border-[#b95740]"><option value="all">Tout type de bien</option><option value="house">Une maison</option><option value="shop">Une boutique</option></select></label><label className="text-xs font-bold uppercase tracking-wider text-[#747272]">Ville<select value={city} onChange={(event) => setCity(event.target.value)} data-testid="select-filter-city" className="mt-2 w-full rounded-xl border border-[#d9cfbc] bg-[#f4efdf] p-3 text-sm font-semibold normal-case tracking-normal text-[#20283c] outline-none focus:border-[#b95740]"><option value="">Toutes les villes</option>{cities.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label className="text-xs font-bold uppercase tracking-wider text-[#747272]">Budget maximum<input type="number" min="0" value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} data-testid="input-filter-max-price" placeholder="Ex. 250 000" className="mt-2 w-full rounded-xl border border-[#d9cfbc] bg-[#f4efdf] p-3 text-sm font-semibold normal-case tracking-normal text-[#20283c] outline-none placeholder:text-[#99958d] focus:border-[#b95740]" /></label><div className="flex items-end gap-2"><button type="submit" data-testid="button-apply-filters" className="flex-1 rounded-xl bg-[#b95740] px-5 py-3 font-bold text-[#fff7e8] transition-colors hover:bg-[#a74d3a] md:flex-none">Filtrer</button><button type="button" onClick={clearFilters} data-testid="button-clear-filters" className="rounded-xl border border-[#d9cfbc] px-4 py-3 text-sm font-bold text-[#656878] hover:bg-[#f0e8d8]">Effacer</button></div></div></form><div className="mt-10 flex items-end justify-between gap-3"><div><span className="text-xs font-bold uppercase tracking-[.18em] text-[#b95740]">Résultats</span><h2 className="mt-1 font-display text-3xl font-bold">{query.isLoading ? 'Recherche en cours' : `${query.data?.length ?? 0} adresse${query.data?.length === 1 ? '' : 's'}`}</h2></div>{(type !== 'all' || city || maxPrice) && <span className="rounded-full bg-[#f0dfae] px-3 py-1 text-xs font-bold text-[#685523]">Filtres actifs</span>}</div><div className="mt-6 grid gap-5 md:grid-cols-2 lg:grid-cols-3">{query.isLoading ? [1, 2, 3].map((item) => <ListingSkeleton key={item} />) : query.isError ? <QueryError label="les résultats" onRetry={() => query.refetch()} /> : query.data?.length ? query.data.map((listing) => <ListingCard key={listing.id} listing={listing} />) : <EmptyListings />}</div></section></Shell>;
}

function DetailPage() {
  const { id: rawId } = useParams<{ id: string }>();
  const id = Number(rawId);
  const valid = Number.isFinite(id) && id > 0;
  const [, setLocation] = useLocation();
  const client = useQueryClient();
  const [paymentNotice, setPaymentNotice] = useState('');
  const { user, membership } = usePaylocaAuth();
  const query = useGetListing(id, { query: { enabled: valid, queryKey: getGetListingQueryKey(id) } });
  useEffect(() => {
    if (!query.data) return;
    const contact = document.querySelector<HTMLAnchorElement>(`[data-testid="link-contact-owner-${id}"]`);
    if (!contact) return;
    contact.href = `/messages?annonce=${id}`;
    contact.textContent = "Discuter avec le propriétaire";
    const openChat = (event: Event) => {
      event.preventDefault();
      setLocation(`/messages?annonce=${id}`);
    };
    contact.addEventListener("click", openChat);
    const callButton = document.createElement('a');
    callButton.href = listing.ownerId ? `/appels?recipient=${encodeURIComponent(listing.ownerId)}&name=${encodeURIComponent(listing.ownerName)}` : '#';
    callButton.textContent = `Appeler ${listing.ownerName}`;
    callButton.className = 'mt-3 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-[#20283c] px-5 py-3.5 text-sm font-bold text-[#20283c] hover:bg-[#ece3d0]';
    callButton.dataset.callOwner = 'true';
    contact.after(callButton);
    return () => { contact.removeEventListener("click", openChat); callButton.remove(); };
  }, [id, query.data, setLocation]);
  useEffect(() => {
    const listing = query.data;
    if (!listing || !user || !listing.ownerId || listing.ownerId !== user.id) return;
    const contact = document.querySelector<HTMLAnchorElement>(`[data-testid="link-contact-owner-${id}"]`);
    if (!contact || contact.parentElement?.querySelector('[data-owner-status-controls]')) return;
    const controls = document.createElement('div');
    controls.dataset.ownerStatusControls = 'true';
    controls.className = 'mt-3 grid gap-2';
    ([
      ['vendu', 'Marquer vendu'],
      ['loue', 'Marquer loué'],
    ] as const).forEach(([status, label]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.className = 'rounded-xl border border-[#d9cfbc] px-3 py-2.5 text-xs font-bold text-[#5e6370] hover:bg-[#f0e8d8]';
      button.addEventListener('click', async () => {
        if (button.disabled) return;
        button.disabled = true;
        button.textContent = 'Chargement...';
        try {
          const response = await authenticatedFetch(`/api/listings/${id}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
          if (!response.ok) throw new Error();
          window.alert(`Annonce marquée comme ${status === 'vendu' ? 'vendue' : 'louée'}. Elle n’apparaîtra plus dans les recherches.`);
          client.invalidateQueries({ queryKey: getListListingsQueryKey() });
          client.invalidateQueries({ queryKey: getGetFeaturedListingsQueryKey() });
          setLocation('/annonces');
        } catch {
          button.disabled = false;
          button.textContent = label;
          window.alert('Impossible de modifier le statut de cette annonce.');
        }
      });
      controls.append(button);
    });
    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.textContent = 'Modifier la description';
    editButton.className = 'rounded-xl border border-[#d9cfbc] px-3 py-2.5 text-xs font-bold text-[#5e6370] hover:bg-[#f0e8d8]';
    editButton.addEventListener('click', async () => {
      const description = window.prompt('Modifiez la description de votre annonce.', listing.description);
      if (description === null || !description.trim()) return;
      editButton.disabled = true;
      try {
          const response = await authenticatedFetch(`/api/listings/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ description: description.trim() }),
        });
        if (!response.ok) throw new Error();
        await client.invalidateQueries({ queryKey: getGetListingQueryKey(id) });
        await client.invalidateQueries({ queryKey: getListListingsQueryKey() });
      } catch {
        window.alert('Impossible de modifier cette annonce.');
      } finally {
        editButton.disabled = false;
      }
    });
    controls.append(editButton);
    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.textContent = 'Supprimer mon annonce';
    deleteButton.className = 'rounded-xl border border-[#e4bbb0] bg-[#fff1eb] px-3 py-2.5 text-xs font-bold text-[#8f3e32] hover:bg-[#fde4da]';
    deleteButton.addEventListener('click', async () => {
      if (!window.confirm('Supprimer définitivement cette annonce ?')) return;
      deleteButton.disabled = true;
      try {
        const response = await authenticatedFetch(`/api/listings/${id}`, { method: 'DELETE' });
        if (!response.ok) throw new Error();
        await client.invalidateQueries({ queryKey: getListListingsQueryKey() });
        await client.invalidateQueries({ queryKey: getGetFeaturedListingsQueryKey() });
        setLocation('/annonces');
      } catch {
        deleteButton.disabled = false;
        window.alert('Impossible de supprimer cette annonce.');
      }
    });
    controls.append(deleteButton);
    const boostButton = document.createElement('button');
    boostButton.type = 'button';
    const boostAlreadyActive = Boolean(query.data?.premiumUntil && new Date(query.data.premiumUntil).getTime() > Date.now());
    boostButton.textContent = boostAlreadyActive
      ? `Déjà mise en avant · ${membership.boostsRemaining} restant${membership.boostsRemaining > 1 ? 's' : ''}`
      : membership.boostsRemaining > 0
        ? `Mettre en avant · ${membership.boostsRemaining} restant${membership.boostsRemaining > 1 ? 's' : ''}`
      : 'Mettre en avant avec un abonnement VIP';
    boostButton.disabled = boostAlreadyActive;
    boostButton.className = 'rounded-xl border border-[#e9b949] bg-[#fff8df] px-3 py-2.5 text-xs font-bold text-[#685523] hover:bg-[#f9edbe] disabled:cursor-wait disabled:opacity-60';
    boostButton.dataset.boostListing = 'true';
    boostButton.addEventListener('click', async () => {
      if (boostButton.disabled) return;
      boostButton.disabled = true;
      boostButton.textContent = 'Mise en avant…';
      try {
        const response = await authenticatedFetch(`/api/listings/${id}/boost`, { method: 'POST' });
        const payload = await response.json().catch(() => ({})) as { error?: string; boostsRemaining?: number; premiumUntil?: string };
        if (!response.ok) throw new Error(payload.error ?? 'Impossible d’utiliser ce boost.');
        boostButton.textContent = `Annonce mise en avant · ${payload.boostsRemaining ?? 0} restant${(payload.boostsRemaining ?? 0) > 1 ? 's' : ''}`;
        await client.invalidateQueries({ queryKey: getGetListingQueryKey(id) });
        await client.invalidateQueries({ queryKey: getListListingsQueryKey() });
        await client.invalidateQueries({ queryKey: getGetFeaturedListingsQueryKey() });
      } catch (error) {
        boostButton.disabled = false;
        boostButton.textContent = error instanceof Error ? error.message : 'Boost indisponible';
      }
    });
    controls.append(boostButton);
    contact.after(controls);
    return () => controls.remove();
  }, [client, id, membership.boostsRemaining, query.data, setLocation, user]);
  if (!valid || query.isError) return <Shell><div className="page-shell flex min-h-[55vh] flex-col items-center justify-center text-center"><CircleAlert className="text-[#b95740]" size={34} /><h1 className="mt-4 font-display text-3xl font-bold">Cette adresse est introuvable</h1><p className="mt-2 text-[#6d7078]">L'annonce a peut-être été retirée ou le lien est incorrect.</p><Link href="/annonces" data-testid="link-back-listings-error" className="mt-6 rounded-full bg-[#20283c] px-5 py-3 text-sm font-bold text-[#f7e8b4]">Retour aux annonces</Link></div></Shell>;
  if (query.isLoading || !query.data) return <Shell><div className="page-shell py-12"><div className="h-5 w-28 animate-pulse rounded bg-[#e5ddcd]" /><div className="mt-6 grid gap-6 lg:grid-cols-[1.15fr_.85fr]"><div className="h-[430px] animate-pulse rounded-[25px] bg-[#e5ddcd]" /><div className="h-[430px] animate-pulse rounded-[25px] bg-[#e5ddcd]" /></div></div></Shell>;
  const listing = query.data;
  const isUnavailable = listing.status === 'vendu' || listing.status === 'loue';
  const statusLabel = listing.status === 'vendu' ? 'Vendue' : 'Louée';
  const requestMynitaPayment = () => setPaymentNotice('Le paiement MyNita n’est pas encore configuré avec l’API marchande officielle. Aucune transaction n’a été créée.');
  return <Shell><div className="page-shell py-8 md:py-12"><Link href="/annonces" data-testid="link-back-listings" className="inline-flex items-center gap-1 text-sm font-bold text-[#676b76] hover:text-[#b95740]"><ChevronLeft size={17} /> Toutes les annonces</Link><div className="mt-6 grid gap-8 lg:grid-cols-[1.1fr_.9fr]"><div><ListingImage listing={listing} className="h-[330px] rounded-[25px] sm:h-[470px]" />{listing.filtre && <p className="mt-3 text-xs font-semibold text-[#777977]">Photo : {listing.filtre === 'pro' ? 'améliorée par PAYLOCA' : listing.filtre}</p>}<div className="mt-7"><span className="text-xs font-bold uppercase tracking-[.18em] text-[#b95740]">{listing.type === 'house' ? 'Maison à louer' : 'Boutique à louer'}</span><h1 className="mt-2 font-display text-4xl font-bold tracking-[-.04em] md:text-5xl">{listing.title}</h1><p className="mt-3 flex items-center gap-2 text-[#686d79]"><MapPin size={17} className="text-[#b95740]" /> {listing.neighborhood}, {listing.city}</p></div></div><aside className="self-start rounded-[24px] border border-[#dfd7c4] bg-[#faf6ec] p-6 shadow-[0_5px_0_#e8deca] md:p-8">{isUnavailable && <div className="mb-5 rounded-2xl bg-[#b95740] px-5 py-4 text-center text-lg font-extrabold uppercase tracking-wide text-white" role="status">Annonce {statusLabel}</div>}<div className="flex items-start justify-between gap-4"><div><span className="text-xs font-bold uppercase tracking-[.16em] text-[#777977]">Loyer mensuel</span><p className="mt-1 font-display text-3xl font-bold text-[#20283c]">{formatPrice(listing.price)}</p></div>{listing.verified && <span className="grid size-11 place-items-center rounded-2xl bg-[#dcecdf] text-[#267158]"><ShieldCheck size={23} /></span>}</div><div className="mt-7 grid grid-cols-2 gap-3">{listing.type === 'house' && <div className="rounded-xl bg-[#f0e8d8] p-3"><Bath size={18} className="text-[#b95740]" /><p className="mt-2 text-xs text-[#777977]">Chambres</p><p className="font-bold">{listing.bedrooms}</p></div>}<div className="rounded-xl bg-[#f0e8d8] p-3"><MapPin size={18} className="text-[#b95740]" /><p className="mt-2 text-xs text-[#777977]">Localisation</p><p className="font-bold">{listing.city}</p></div></div><div className="mt-7 border-t border-[#e4dccd] pt-6"><p className="text-xs font-bold uppercase tracking-[.16em] text-[#777977]">À propos de ce bien</p><p className="mt-3 text-sm leading-7 text-[#5e6370]">{listing.description}</p></div><div className="mt-7 rounded-xl bg-[#e8ddc6] p-4"><p className="text-xs text-[#777977]">Proposé par</p><p className="mt-1 font-bold">{listing.ownerName}</p></div>{listing.contact && <a href={`tel:${listing.contact}`} data-testid={`link-call-owner-${listing.id}`} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-[#b95740] px-5 py-3.5 text-sm font-bold text-[#b95740] transition-transform hover:-translate-y-0.5"><Phone size={17} /> Appeler le propriétaire</a>}<a href={`mailto:bonjour@nigerhabitat.ne?subject=${encodeURIComponent(`Question pour ${listing.title}`)}`} data-testid={`link-contact-owner-${listing.id}`} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[#b95740] px-5 py-3.5 text-sm font-bold text-[#fff7e8] transition-transform hover:-translate-y-0.5"><Mail size={17} /> Contacter le propriétaire</a><div className="mt-3 grid grid-cols-2 gap-3"><button type="button" disabled={isUnavailable} onClick={requestMynitaPayment} data-testid={`button-buy-mynita-${listing.id}`} className="rounded-xl bg-[#20283c] px-3 py-3 text-sm font-bold text-[#f7e8b4] disabled:cursor-not-allowed disabled:bg-[#9da3ae] disabled:text-white">Acheter</button><button type="button" disabled={isUnavailable} onClick={requestMynitaPayment} data-testid={`button-rent-mynita-${listing.id}`} className="rounded-xl border-2 border-[#b95740] px-3 py-3 text-sm font-bold text-[#b95740] disabled:cursor-not-allowed disabled:border-[#c5c4c0] disabled:text-[#8a8984]">Louer avec Mynita</button></div>{paymentNotice && <p className="mt-3 rounded-xl border border-[#e4bbb0] bg-[#fff1eb] p-3 text-sm font-semibold text-[#8f3e32]" role="alert">{paymentNotice}</p>}<p className="mt-3 text-center text-xs text-[#8a8984]">Un message sera préparé avec la référence de cette annonce.</p></aside></div></div></Shell>;
}

function PublishPage() {
   const [form, setForm] = useState<ListingInput>({ title: '', type: 'house', city: 'Niamey', neighborhood: '', price: 0, bedrooms: 1, imageUrl: '', description: '', contact: '' });
  const [propertyCondition, setPropertyCondition] = useState<'built_house' | 'empty_land'>('built_house');
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [photoError, setPhotoError] = useState('');
  const [formError, setFormError] = useState('');
  const [done, setDone] = useState<Listing | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [enhancedPhoto, setEnhancedPhoto] = useState<{ file: File; originalUrl: string; enhancedUrl: string; blurScore: number } | null>(null);
  const [useProPhoto, setUseProPhoto] = useState(true);
  const createListing = useCreateListing();
  const client = useQueryClient();
  useEffect(() => {
    if (!createListing.isError) return;
    const error = createListing.error as { data?: { error?: string } } | null;
    setPhotoError(error?.data?.error ?? 'Votre annonce n’a pas pu être publiée. Vérifiez les informations et réessayez.');
  }, [createListing.error, createListing.isError]);
  useEffect(() => () => {
    photoPreviews.forEach((preview) => URL.revokeObjectURL(preview));
    if (enhancedPhoto) { URL.revokeObjectURL(enhancedPhoto.originalUrl); URL.revokeObjectURL(enhancedPhoto.enhancedUrl); }
  }, [photoPreviews, enhancedPhoto]);
  const selectPhotos = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []).filter((file) => IMAGE_TYPES.has(file.type) && file.size <= MAX_IMAGE_SIZE).slice(0, 6);
    if (!files.length) {
      setPhotoError('Choisissez une image JPG, PNG, WebP ou GIF de 10 Mo maximum.');
      return;
    }
    setPhotoFiles(files);
    setEnhancedPhoto(null);
    setUseProPhoto(true);
    setPhotoPreviews(files.map((file) => URL.createObjectURL(file)));
    setForm((current) => ({ ...current, imageUrl: '' }));
    setPhotoError('');
    enhancePhoto(files[0]).then(setEnhancedPhoto).catch((error) => setPhotoError(error instanceof Error ? error.message : 'La photo n’a pas pu être améliorée.'));
  };
  const update = (key: keyof ListingInput, value: string) => setForm((current) => ({ ...current, [key]: key === 'price' || key === 'bedrooms' ? Number(value) : value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (uploadingPhoto || createListing.isPending) return;
    if (propertyCondition === 'empty_land') {
      setFormError('Désolé, PAYLOCA n’accepte que les maisons construites.');
      return;
    }
    if (!form.title.trim() || !form.neighborhood.trim() || !form.description.trim() || form.price <= 0) {
      window.alert('Veuillez remplir tous les champs');
      return;
    }
    const contact = normalizeNigerPhone(form.contact);
    if (!contact) {
      setFormError('Indiquez un numéro nigérien valide au format +227 suivi de 8 chiffres.');
      return;
    }
    if (!photoFiles.length) {
      setPhotoError('Photo refusée. Veuillez choisir une photo claire de votre bien.');
      return;
    }
    setUploadingPhoto(true);
    setPhotoError('');
    try {
      if (enhancedPhoto?.blurScore !== undefined && enhancedPhoto.blurScore < 5) {
        const retry = window.confirm('Votre photo est floue. Voulez-vous réessayer ?');
        if (retry) return;
      }
      const imageUrl = await uploadImage(useProPhoto && enhancedPhoto ? enhancedPhoto.file : photoFiles[0]);
       createListing.mutate({ data: { ...form, contact, imageUrl, filtre: useProPhoto ? 'pro' : 'original', propertyCondition } }, {
        onSuccess: (listing) => {
          setDone(listing);
          client.invalidateQueries({ queryKey: getListListingsQueryKey() });
          client.invalidateQueries({ queryKey: getGetFeaturedListingsQueryKey() });
        },
        onSettled: () => setUploadingPhoto(false),
      });
    } catch (error) {
      setUploadingPhoto(false);
      setPhotoError(error instanceof Error ? error.message : 'Votre photo n’a pas pu être envoyée.');
    }
  };
  if (!done) return <Shell><section className="page-shell max-w-[900px] py-10 md:py-14"><div className="mb-8"><span className="text-xs font-bold uppercase tracking-[.18em] text-[#b95740]">Votre espace, votre annonce</span><h1 className="mt-2 font-display text-4xl font-bold">Publier un bien</h1><p className="mt-2 text-[#676b76]">Ajoutez une photo : PAYLOCA prépare automatiquement une version Pro.</p></div><form onSubmit={submit} className="rounded-[25px] border border-[#dfd7c4] bg-[#faf6ec] p-5 shadow-[0_5px_0_#e8deca] md:p-8"><div className="grid gap-4 md:grid-cols-2"><label className="block text-sm font-bold">Type de bien<select value={propertyCondition} onChange={(event) => { setPropertyCondition(event.target.value as 'built_house' | 'empty_land'); setFormError(''); }} data-testid="select-publish-property-condition" className="mt-2 w-full rounded-xl border border-[#d9cfbc] bg-[#f4efdf] p-3"><option value="built_house">Maison construite</option><option value="empty_land">Terrain vide</option></select></label><label className="block text-sm font-bold">Catégorie<select value={form.type} onChange={(event) => update('type', event.target.value)} data-testid="select-publish-type" className="mt-2 w-full rounded-xl border border-[#d9cfbc] bg-[#f4efdf] p-3"><option value="house">Maison</option><option value="shop">Boutique</option></select></label><label className="block text-sm font-bold md:col-span-2">Titre de l’annonce<input required minLength={3} value={form.title} onChange={(event) => update('title', event.target.value)} data-testid="input-publish-title" className="mt-2 w-full rounded-xl border border-[#d9cfbc] bg-[#f4efdf] p-3" /></label><label className="block text-sm font-bold">Ville<select value={form.city} onChange={(event) => update('city', event.target.value)} data-testid="select-publish-city" className="mt-2 w-full rounded-xl border border-[#d9cfbc] bg-[#f4efdf] p-3">{cities.map((city) => <option key={city}>{city}</option>)}</select></label><label className="block text-sm font-bold">Quartier<input required value={form.neighborhood} onChange={(event) => update('neighborhood', event.target.value)} data-testid="input-publish-neighborhood" className="mt-2 w-full rounded-xl border border-[#d9cfbc] bg-[#f4efdf] p-3" /></label><label className="block text-sm font-bold">Loyer mensuel<input required type="number" min="1" value={form.price || ''} onChange={(event) => update('price', event.target.value)} data-testid="input-publish-price" className="mt-2 w-full rounded-xl border border-[#d9cfbc] bg-[#f4efdf] p-3" /></label><label className="block text-sm font-bold">Chambres<input required type="number" min="0" value={form.bedrooms} onChange={(event) => update('bedrooms', event.target.value)} data-testid="input-publish-bedrooms" className="mt-2 w-full rounded-xl border border-[#d9cfbc] bg-[#f4efdf] p-3" /></label><label className="block text-sm font-bold md:col-span-2">Téléphone de contact<input required inputMode="tel" value={form.contact} onChange={(event) => update('contact', event.target.value)} data-testid="input-publish-contact" placeholder="+227 90 00 00 00" className="mt-2 w-full rounded-xl border border-[#d9cfbc] bg-[#f4efdf] p-3" /><span className="mt-1 block text-xs font-normal text-[#777977]">Numéro nigérien uniquement, au format +227 suivi de 8 chiffres.</span></label><label className="block text-sm font-bold md:col-span-2">Photos du bien<input required type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={selectPhotos} data-testid="input-publish-image" className="mt-2 block w-full rounded-xl border border-dashed border-[#cdbd9f] bg-[#f4efdf] p-3" /></label>{photoPreviews.length > 0 && <div className="grid grid-cols-3 gap-3 md:col-span-2">{photoPreviews.map((preview, index) => <img key={preview} src={preview} alt={`Avant ${index + 1}`} data-testid={`img-publish-preview-${index}`} className="aspect-square rounded-xl border border-[#dfd7c4] object-cover" />)}{enhancedPhoto && <div className="col-span-3 rounded-2xl border border-[#e9b949] bg-[#fff8df] p-3 md:col-span-2"><div className="flex items-center gap-2 text-sm font-bold text-[#685523]"><Sparkles size={17} /> Nous avons amélioré votre photo</div><div className="mt-3 grid grid-cols-2 gap-3"><button type="button" onClick={() => setUseProPhoto(false)} className={`overflow-hidden rounded-xl border-2 ${!useProPhoto ? 'border-[#b95740]' : 'border-transparent'}`}><img src={enhancedPhoto.originalUrl} alt="Avant" className="aspect-video w-full object-cover" /><span className="block p-2 text-xs font-bold">Avant</span></button><button type="button" onClick={() => setUseProPhoto(true)} className={`overflow-hidden rounded-xl border-2 ${useProPhoto ? 'border-[#b95740]' : 'border-transparent'}`}><img src={enhancedPhoto.enhancedUrl} alt="Après - Pro" className="aspect-video w-full object-cover" /><span className="block p-2 text-xs font-bold">Après - Pro</span></button></div><p className="mt-3 text-xs text-[#777977]">Lumière, couleurs et netteté améliorées. Aucun filtre beauté et aucun changement du visage.</p></div>}</div>}<label className="block text-sm font-bold md:col-span-2">Description<textarea required rows={4} value={form.description} onChange={(event) => update('description', event.target.value)} data-testid="textarea-publish-description" className="mt-2 w-full resize-none rounded-xl border border-[#d9cfbc] bg-[#f4efdf] p-3" /></label></div>{formError && <p className="mt-5 rounded-xl bg-[#fff1eb] p-3 text-sm font-semibold text-[#8f3e32]" role="alert">{formError}</p>}{photoError && <p className="mt-5 rounded-xl bg-[#fff1eb] p-3 text-sm font-semibold text-[#8f3e32]" role="alert">{photoError}</p>}<div className="mt-8 flex justify-end border-t border-[#e4dccd] pt-6"><button type="submit" disabled={createListing.isPending || uploadingPhoto} data-testid="button-submit-publish" className="rounded-xl bg-[#b95740] px-6 py-3.5 font-bold text-sm text-[#fff7e8] disabled:opacity-60">{createListing.isPending || uploadingPhoto ? 'Publication en cours…' : 'Publier mon annonce'}</button></div></form></section></Shell>;
  if (done) return <Shell><div className="page-shell flex min-h-[65vh] items-center justify-center py-16"><div className="w-full max-w-xl rounded-[28px] border border-[#cfe1d0] bg-[#eef7ed] p-8 text-center md:p-12"><span className="mx-auto grid size-16 place-items-center rounded-full bg-[#267158] text-[#f4f0df]"><Check size={30} /></span><span className="mt-6 block text-xs font-bold uppercase tracking-[.18em] text-[#267158]">Annonce publiée</span><h1 className="mt-2 font-display text-4xl font-bold">Votre bien est maintenant visible.</h1><p className="mt-3 text-sm leading-6 text-[#5e7062]">Merci pour votre confiance. Les personnes à la recherche d’un lieu peuvent vous contacter.</p><div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row"><Link href={`/annonces/${done.id}`} data-testid="link-success-listing" className="rounded-full bg-[#20283c] px-5 py-3 text-sm font-bold text-[#f7e8b4]">Voir mon annonce</Link><Link href="/publier" data-testid="link-publish-another" className="rounded-full border border-[#b8cfb8] px-5 py-3 text-sm font-bold text-[#267158]">Publier un autre bien</Link></div></div></div></Shell>;
  return <Shell><section className="border-b border-[#dfd7c4] bg-[#e8ddc6] py-12 md:py-16"><div className="page-shell"><span className="text-xs font-bold uppercase tracking-[.18em] text-[#b95740]">Votre espace, votre annonce</span><h1 className="mt-2 max-w-2xl font-display text-5xl font-bold tracking-[-.05em]">Vous avez un bien à louer ?</h1><p className="mt-3 max-w-lg text-[#676b76]">Partagez-le avec des personnes qui cherchent vraiment. C’est simple et gratuit.</p></div></section><section className="page-shell max-w-[900px] py-10 md:py-14"><form onSubmit={submit} className="rounded-[25px] border border-[#dfd7c4] bg-[#faf6ec] p-5 shadow-[0_5px_0_#e8deca] md:p-8"><div className="grid gap-8 md:grid-cols-[1fr_1.2fr]"><div><p className="text-xs font-bold uppercase tracking-[.17em] text-[#b95740]">01 · Le bien</p><h2 className="mt-2 font-display text-2xl font-bold">Parlez-nous de votre lieu</h2><p className="mt-2 text-sm leading-6 text-[#727583]">Quelques informations suffisent pour commencer.</p><div className="mt-6 space-y-4"><label className="block text-sm font-bold">Type de bien<select value={propertyCondition} onChange={(event) => { setPropertyCondition(event.target.value as 'built_house' | 'empty_land'); setFormError(''); }} data-testid="select-publish-property-condition" className="mt-2 w-full rounded-xl border border-[#d9cfbc] bg-[#f4efdf] p-3 font-medium outline-none focus:border-[#b95740]"><option value="built_house">Maison construite</option><option value="empty_land">Terrain vide</option></select></label>{formError && <div className="rounded-xl border border-[#e4bbb0] bg-[#fff1eb] p-4 text-sm font-bold text-[#8f3e32]" role="alert">{formError}</div>}<label className="block text-sm font-bold">Catégorie<select value={form.type} onChange={(event) => update('type', event.target.value)} data-testid="select-publish-type" className="mt-2 w-full rounded-xl border border-[#d9cfbc] bg-[#f4efdf] p-3 font-medium outline-none focus:border-[#b95740]"><option value="house">Maison</option><option value="shop">Boutique</option></select></label><label className="block text-sm font-bold">Titre de l’annonce<input required minLength={3} value={form.title} onChange={(event) => update('title', event.target.value)} data-testid="input-publish-title" placeholder="Ex. Maison familiale à Yantala" className="mt-2 w-full rounded-xl border border-[#d9cfbc] bg-[#f4efdf] p-3 font-medium outline-none placeholder:text-[#9c978d] focus:border-[#b95740]" /></label><div className="grid grid-cols-2 gap-3"><label className="block text-sm font-bold">Ville<select value={form.city} onChange={(event) => update('city', event.target.value)} data-testid="select-publish-city" className="mt-2 w-full rounded-xl border border-[#d9cfbc] bg-[#f4efdf] p-3 font-medium outline-none focus:border-[#b95740]">{cities.map((city) => <option key={city}>{city}</option>)}</select></label><label className="block text-sm font-bold">Quartier<input required value={form.neighborhood} onChange={(event) => update('neighborhood', event.target.value)} data-testid="input-publish-neighborhood" className="mt-2 w-full rounded-xl border border-[#d9cfbc] bg-[#f4efdf] p-3 font-medium outline-none focus:border-[#b95740]" /></label></div></div></div><div><p className="text-xs font-bold uppercase tracking-[.17em] text-[#b95740]">02 · Les détails</p><h2 className="mt-2 font-display text-2xl font-bold">Aidez les bons locataires à vous trouver</h2><div className="mt-6 space-y-4"><div className="grid grid-cols-2 gap-3"><label className="block text-sm font-bold">Loyer mensuel<input required type="number" min="0" value={form.price || ''} onChange={(event) => update('price', event.target.value)} data-testid="input-publish-price" placeholder="150000" className="mt-2 w-full rounded-xl border border-[#d9cfbc] bg-[#f4efdf] p-3 font-medium outline-none placeholder:text-[#9c978d] focus:border-[#b95740]" /></label><label className="block text-sm font-bold">Chambres<input required type="number" min="0" value={form.bedrooms} onChange={(event) => update('bedrooms', event.target.value)} data-testid="input-publish-bedrooms" className="mt-2 w-full rounded-xl border border-[#d9cfbc] bg-[#f4efdf] p-3 font-medium outline-none focus:border-[#b95740]" /></label></div><label className="block text-sm font-bold">Photos du bien<input required type="url" value={form.imageUrl} onChange={(event) => update('imageUrl', event.target.value)} data-testid="input-publish-image" placeholder="Choisir une image" className="mt-2 w-full rounded-xl border border-[#d9cfbc] bg-[#f4efdf] p-3 font-medium outline-none placeholder:text-[#9c978d] focus:border-[#b95740]" /></label><label className="block text-sm font-bold">Description<textarea required rows={4} value={form.description} onChange={(event) => update('description', event.target.value)} data-testid="textarea-publish-description" placeholder="Décrivez ce qui rend ce lieu agréable..." className="mt-2 w-full resize-none rounded-xl border border-[#d9cfbc] bg-[#f4efdf] p-3 font-medium outline-none placeholder:text-[#9c978d] focus:border-[#b95740]" /></label></div></div></div>{createListing.isError && <div className="mt-7 flex items-start gap-3 rounded-xl border border-[#e4bbb0] bg-[#fff1eb] p-4 text-sm text-[#8f3e32]"><CircleAlert size={18} className="mt-0.5 shrink-0" /><p>Votre annonce n’a pas pu être publiée. Vérifiez les informations et réessayez.</p></div>}<div className="mt-8 flex flex-col items-center justify-between gap-4 border-t border-[#e4dccd] pt-6 sm:flex-row"><p className="text-xs text-[#85847e]">Votre compte sécurise cette annonce.</p><button type="submit" disabled={createListing.isPending || uploadingPhoto} data-testid="button-submit-publish" className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#b95740] px-6 py-3.5 text-sm font-bold text-[#fff7e8] transition-transform hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-60 sm:w-auto">{createListing.isPending || uploadingPhoto ? 'Publication en cours…' : <>Publier mon annonce <ArrowRight size={16} /></>}</button></div></form></section></Shell>;
}

function InfoPage({ title, eyebrow, children }: { title: string; eyebrow: string; children: ReactNode }) {
  return <Shell><section className="page-shell max-w-3xl py-16 md:py-24"><span className="text-xs font-bold uppercase tracking-[.18em] text-[#b95740]">{eyebrow}</span><h1 className="mt-3 font-display text-5xl font-bold tracking-[-.05em]">{title}</h1><div className="mt-8 rounded-[24px] border border-[#dfd7c4] bg-[#faf6ec] p-6 text-base leading-8 text-[#5e6370] shadow-[0_5px_0_#e8deca] md:p-10">{children}</div></section></Shell>;
}

function AboutPage() {
  return <Shell><section id="about" data-testid="section-about" className="relative overflow-hidden bg-gradient-to-br from-[#0877d1] via-[#098fdb] to-[#12c7e6] px-5 py-16 text-white md:py-24"><div className="pointer-events-none absolute -right-24 -top-28 size-80 rounded-full bg-white/10 blur-3xl" /><div className="pointer-events-none absolute -bottom-40 -left-24 size-96 rounded-full bg-[#e9b949]/15 blur-3xl" /><div className="relative mx-auto max-w-[900px] text-center"><div className="about-logo"><h1 className="font-display text-5xl font-bold tracking-[-.06em] md:text-6xl">PAY<span className="text-[#ffe06a]">LOCA</span></h1><p className="mt-2 text-sm font-semibold uppercase tracking-[.18em] text-white/90">Votre marché, Votre confiance</p></div><p className="mx-auto mt-7 max-w-2xl text-base leading-8 text-white/90 md:text-lg">PAYLOCA est la première plateforme d’annonces au Niger.<br className="hidden md:block" /> Achetez, vendez et louez en toute sécurité : maisons et boutiques.</p><div className="mt-10 grid gap-5 text-left md:grid-cols-3"><div className="about-card rounded-[20px] bg-white p-6 text-[#333] shadow-[0_12px_30px_rgba(0,0,0,.18)] transition-transform duration-300 hover:-translate-y-1"><h3 className="text-lg font-bold text-[#0877d1]">📧 Support PAYLOCA</h3><p className="mt-3 text-base font-bold">Messagerie interne</p><small className="mt-2 block text-sm text-[#777]">Les échanges passent par votre compte PAYLOCA.</small></div><div className="about-card rounded-[20px] bg-white p-6 text-[#333] shadow-[0_12px_30px_rgba(0,0,0,.18)] transition-transform duration-300 hover:-translate-y-1"><h3 className="text-lg font-bold text-[#0877d1]">📱 Téléphone nigérien</h3><p className="mt-3 text-base font-bold">+227 96 34 45 93</p><small className="mt-2 block text-sm text-[#777]">Numéro réservé à l’assistance PAYLOCA.</small></div><div className="about-card rounded-[20px] bg-white p-6 text-[#333] shadow-[0_12px_30px_rgba(0,0,0,.18)] transition-transform duration-300 hover:-translate-y-1"><h3 className="text-lg font-bold text-[#0877d1]">👨‍💻 Réalisateur</h3><p className="mt-3 text-lg font-bold">Agali Achabaye</p></div></div></div></section></Shell>;
}

function FavoritesPage() {
  const { favorites } = useFavorites();
  const query = useListListings({ type: 'all' }, { query: { queryKey: getListListingsQueryKey({ type: 'all' }) } });
  const listings = (query.data ?? []).filter((listing) => favorites.includes(listing.id));
  return <Shell><section className="page-shell py-12 md:py-16"><span className="text-xs font-bold uppercase tracking-[.18em] text-[#b95740]">Votre sélection</span><h1 className="mt-2 font-display text-5xl font-bold tracking-[-.05em]">Mes Favoris</h1><p className="mt-3 text-[#676b76]">Retrouvez les adresses que vous souhaitez garder sous la main.</p><div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">{query.isLoading ? <p>Chargement...</p> : listings.length ? listings.map((listing) => <ListingCard key={listing.id} listing={listing} />) : <EmptyListings compact />}</div></section></Shell>;
}

function SettingsPage() {
  const [deleted, setDeleted] = useState(false);
  const clearLocalPreferences = () => {
    localStorage.clear();
    setDeleted(true);
  };
  return <Shell><section className="page-shell max-w-2xl py-12 md:py-16"><span className="text-xs font-bold uppercase tracking-[.18em] text-[#b95740]">Votre espace</span><h1 className="mt-2 font-display text-5xl font-bold tracking-[-.05em]">Paramètres</h1><div className="mt-8 rounded-[24px] border border-[#dfd7c4] bg-[#faf6ec] p-6 shadow-[0_5px_0_#e8deca]"><h2 className="font-display text-2xl font-bold">Effacer mes préférences locales</h2><p className="mt-3 text-sm leading-6 text-[#676b76]">Cette action efface les préférences enregistrées par PAYLOCA dans ce navigateur. Elle ne supprime ni votre compte, ni vos annonces, ni vos photos.</p>{deleted ? <p className="mt-5 rounded-xl bg-[#eef7ed] p-4 text-sm font-bold text-[#267158]">Les préférences locales de ce navigateur ont été effacées.</p> : <button type="button" onClick={clearLocalPreferences} className="mt-6 rounded-xl bg-[#8f3e32] px-5 py-3 text-sm font-bold text-white">Effacer mes préférences locales</button>}</div></section></Shell>;
}

type ChatConversation = { id: number; listingId: number; participantName: string; participantId: string | null; ownerName: string; ownerId: string | null; lastMessage: string; unread: boolean; createdAt: string; updatedAt: string };
type ChatMessage = { id: number; conversationId: number; senderName: string; senderId: string | null; body: string; imageUrl: string | null; status: 'Envoyé' | 'Vu'; createdAt: string };
const unsafeChatContent = /(?:https?:\/\/|www\.|(?:\+?\d[\d\s().-]{7,}\d))/i;

function MessagesPage() {
  const [location, setLocation] = useLocation();
  const query = new URLSearchParams(location.split('?')[1] ?? '');
  const listingId = Number(query.get('annonce'));
  const conversationId = Number(query.get('conversation'));
  const { user, membership, membershipLoading, membershipError, membershipConfirmed } = usePaylocaAuth();
  const profileName = displayName(user);
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [selected, setSelected] = useState<ChatConversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [warning, setWarning] = useState('');
  const [recording, setRecording] = useState(false);
  const [audioPreview, setAudioPreview] = useState<string | null>(null);
  const [chatPhoto, setChatPhoto] = useState<File | null>(null);
  const [chatPhotoPreview, setChatPhotoPreview] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    authenticatedFetch('/api/conversations')
      .then((response) => response.ok ? response.json() : [])
      .then((data) => {
        const received = Array.isArray(data) ? data as ChatConversation[] : [];
        setConversations(received);
        setSelected((current) => received.find((conversation) => conversation.id === conversationId) ?? current ?? received[0] ?? null);
      })
      .catch(() => setWarning('Impossible de charger les conversations pour le moment.'));
  }, [conversationId]);

  useEffect(() => {
    if (conversationId > 0 || !Number.isFinite(listingId) || listingId <= 0) return;
    authenticatedFetch('/api/conversations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ listingId }) })
      .then(async (response) => ({ ok: response.ok, data: await response.json() }))
      .then(({ ok, data }) => {
        if (!ok) { setWarning(data.error ?? 'Cette annonce n’est plus disponible.'); return; }
        setSelected(data);
        setConversations((current) => current.some((item) => item.id === data.id) ? current : [data, ...current]);
        setLocation('/messages');
      })
      .catch(() => setWarning('Impossible de démarrer cette discussion.'));
  }, [conversationId, listingId, profileName, setLocation]);

  useEffect(() => {
    if (!selected) return;
    const load = () => authenticatedFetch(`/api/conversations/${selected.id}/messages`)
      .then((response) => response.ok ? response.json() : [])
      .then((data) => {
        const received = Array.isArray(data) ? data as ChatMessage[] : [];
        setMessages(received);
        received.filter((message) => message.senderId !== user?.id && message.status === 'Envoyé')
          .forEach((message) => authenticatedFetch(`/api/messages/${message.id}/read`, { method: 'PATCH' }).catch(() => undefined));
      })
      .catch(() => setWarning('Impossible de charger les messages.'));
    load();
    const timer = window.setInterval(load, 5000);
    return () => window.clearInterval(timer);
  }, [selected, user?.id]);

  useEffect(() => {
    const messageInput = document.querySelector<HTMLInputElement>('input[placeholder="Écrivez un message…"]');
    const form = messageInput?.closest('form');
    if (!messageInput || !form) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp,image/gif';
    input.className = 'hidden';
    input.dataset.testid = 'input-chat-photo';
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Photo';
    button.dataset.testid = 'button-add-chat-photo';
    button.className = 'rounded-full border border-[#d9cfbc] px-3 py-3 text-xs font-bold text-[#596071] hover:bg-[#f0e8d8]';
    const choose = () => input.click();
    const select = () => {
      const file = input.files?.[0];
      input.value = '';
      if (!file) return;
      if (!IMAGE_TYPES.has(file.type) || !file.size || file.size > MAX_IMAGE_SIZE) {
        setWarning('Choisissez une image JPG, PNG, WebP ou GIF de 10 Mo maximum.');
        return;
      }
      setChatPhoto(file);
      setChatPhotoPreview((current) => {
        if (current) URL.revokeObjectURL(current);
        return URL.createObjectURL(file);
      });
      setWarning('');
    };
    button.addEventListener('click', choose);
    input.addEventListener('change', select);
    messageInput.before(button, input);
    return () => {
      button.removeEventListener('click', choose);
      input.removeEventListener('change', select);
      button.remove();
      input.remove();
    };
  }, [selected]);

  useEffect(() => {
    const form = document.querySelector<HTMLInputElement>('input[placeholder="Écrivez un message…"]')?.closest('form');
    form?.querySelector('[data-chat-photo-preview]')?.remove();
    if (!form || !chatPhotoPreview) return;
    const preview = document.createElement('div');
    preview.dataset.chatPhotoPreview = 'true';
    preview.className = 'mb-3 flex items-center gap-3 rounded-xl bg-[#f0e8d8] p-3';
    const image = document.createElement('img');
    image.src = chatPhotoPreview;
    image.alt = 'Aperçu de la photo';
    image.className = 'size-16 rounded-lg object-cover';
    const label = document.createElement('span');
    label.className = 'min-w-0 flex-1 truncate text-xs font-semibold text-[#596071]';
    label.textContent = chatPhoto?.name ?? 'Photo sélectionnée';
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'Supprimer';
    remove.className = 'text-xs font-bold text-[#b95740]';
    remove.addEventListener('click', () => {
      URL.revokeObjectURL(chatPhotoPreview);
      setChatPhoto(null);
      setChatPhotoPreview(null);
    });
    preview.append(image, label, remove);
    form.prepend(preview);
    return () => {
      remove.removeEventListener('click', () => undefined);
      preview.remove();
    };
  }, [chatPhoto, chatPhotoPreview]);

  useEffect(() => {
    const imageMessages = messages.filter((message) => message.imageUrl);
    const labels = Array.from(document.querySelectorAll('p')).filter((element) => element.textContent === 'Photo jointe');
    const pendingMessages = imageMessages.filter((message) => !document.querySelector(`[data-testid="img-chat-photo-${message.id}"]`));
    labels.forEach((label, index) => {
      const message = pendingMessages[index];
      if (!message?.imageUrl) return;
      const image = document.createElement('img');
      image.src = imageSource(message.imageUrl);
      image.alt = 'Photo jointe';
      image.dataset.testid = `img-chat-photo-${message.id}`;
      image.className = 'mt-2 max-h-64 w-full rounded-lg object-cover';
      label.replaceWith(image);
    });
  }, [messages]);

  useEffect(() => {
    const submit = document.querySelector<HTMLInputElement>('input[placeholder="Écrivez un message…"]')?.closest('form')?.querySelector<HTMLButtonElement>('button[type="submit"]');
    const input = document.querySelector<HTMLInputElement>('input[placeholder="Écrivez un message…"]');
    const hasSubscription = membership.isVip || membership.status === 'STANDARD';
    if (!submit || !input) return;
    if (!hasSubscription) {
      input.disabled = true;
      input.placeholder = 'Abonnement requis pour écrire';
      submit.type = 'button';
      submit.textContent = 'Choisir un abonnement';
      submit.disabled = false;
      submit.onclick = () => {
         const wantsPlan = window.confirm('Passez à l’action\n\nVotre essai VIP de 3 mois est terminé. Pour envoyer un message, choisissez un abonnement.\n\nOK : voir Standard gratuit, VIP Bronze dès 500 F CFA / mois et VIP Or dès 1 000 F CFA / mois, avec des formules de 1, 2 ou 4 mois\nAnnuler : continuer à regarder gratuitement');
        if (wantsPlan) window.location.href = `${basePath}/abonnement`;
      };
      return;
    }
    input.disabled = false;
    input.placeholder = 'Écrivez un message…';
    submit.type = 'submit';
    submit.textContent = sending ? 'Envoi…' : 'Envoyer';
    submit.disabled = sending || (!draft.trim() && !chatPhoto);
    submit.onclick = null;
  }, [chatPhoto, draft, sending, selected, membership.status, membership.isVip]);

  useEffect(() => {
    const form = document.querySelector<HTMLInputElement>('input[placeholder="Écrivez un message…"]')?.closest('form');
    if (!form || form.querySelector('[data-respect-note]')) return;
    const note = document.createElement('p');
    note.dataset.respectNote = 'true';
    note.className = 'mt-2 text-center text-xs text-[#8a8984]';
    note.textContent = 'Soyez respectueux. Votre 1er message doit parler de l’annonce ou être poli.';
    form.append(note);
    return () => note.remove();
  }, [selected]);

  useEffect(() => {
    let disposed = false;
    authenticatedFetch('/api/discussion-requests').then((response) => response.ok ? response.json() : []).then((requests) => {
      if (disposed || !Array.isArray(requests) || !requests.length) return;
      const section = document.querySelector('h1')?.closest('section');
      if (!section || section.querySelector('[data-discussion-requests]')) return;
      const panel = document.createElement('div');
      panel.dataset.discussionRequests = 'true';
      panel.className = 'mb-5 rounded-2xl border border-[#e9b949] bg-[#fff8df] p-4';
      const title = document.createElement('p');
      title.className = 'font-bold text-[#685523]';
      title.textContent = 'Demandes de discussion';
      panel.append(title);
      requests.forEach((request: { id: number; initialMessage: string }) => {
        const card = document.createElement('div');
        card.className = 'mt-3 rounded-xl bg-[#faf6ec] p-3';
        const text = document.createElement('p');
        text.className = 'text-sm text-[#424855]';
        text.textContent = `Utilisateur PAYLOCA souhaite discuter : ${request.initialMessage}`;
        const actions = document.createElement('div');
        actions.className = 'mt-3 flex flex-wrap gap-2';
        [['accept', 'Accepter'], ['refuse', 'Refuser'], ['block', 'Signaler et Bloquer']].forEach(([action, label]) => {
          const button = document.createElement('button');
          button.type = 'button'; button.textContent = label;
          button.className = 'rounded-lg border border-[#d9cfbc] px-3 py-2 text-xs font-bold text-[#596071]';
          button.onclick = async () => {
            button.disabled = true;
            await authenticatedFetch(`/api/discussion-requests/${request.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
            window.location.reload();
          };
          actions.append(button);
        });
        card.append(text, actions); panel.append(card);
      });
      section.prepend(panel);
    }).catch(() => undefined);
    return () => { disposed = true; document.querySelector('[data-discussion-requests]')?.remove(); };
  }, [selected]);

  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected || sending) return;
    const body = draft.trim();
    if (!body && !chatPhoto) return;
    if (unsafeChatContent.test(body)) {
      setWarning('Pour votre sécurité, restez dans le chat Payloca.');
      return;
    }
    setSending(true);
    setWarning('');
    try {
      const imageUrl = chatPhoto ? await uploadImage(chatPhoto) : null;
      const response = await authenticatedFetch(`/api/conversations/${selected.id}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body, imageUrl }) });
      const data = await response.json();
      if (response.status === 202 && data.requestPending) {
        setWarning('Demande envoyée. En attente d’acceptation');
        return;
      }
      if (!response.ok) { setWarning(data.error ?? 'Votre message n’a pas pu être envoyé.'); return; }
      setMessages((current) => [...current, data]);
      setDraft('');
      if (chatPhotoPreview) URL.revokeObjectURL(chatPhotoPreview);
      setChatPhoto(null);
      setChatPhotoPreview(null);
      setConversations((current) => current.map((item) => item.id === selected.id ? { ...item, lastMessage: body || 'Photo envoyée', unread: false } : item));
    } catch {
      setWarning('Votre message n’a pas pu être envoyé. Vérifiez votre connexion.');
    } finally {
      setSending(false);
    }
  };

  const toggleRecording = async () => {
    if (recording && recorderRef.current) {
      recorderRef.current.stop();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setWarning('Les messages vocaux ne sont pas pris en charge par ce navigateur.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size) audioChunksRef.current.push(event.data); };
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        setAudioPreview(URL.createObjectURL(blob));
        stream.getTracks().forEach((track) => track.stop());
        setRecording(false);
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      setWarning('');
    } catch {
      setWarning('Autorisez le microphone pour enregistrer un message vocal.');
    }
  };

  if (membershipLoading && !membershipConfirmed) {
    return <Shell><section className="page-shell py-20 text-center text-sm text-[#676b76]">Vérification de vos droits d’abonnement…</section></Shell>;
  }
  if (membershipError && !membershipConfirmed) {
    return <Shell><section className="page-shell py-20 text-center text-sm text-[#8f3e32]">{membershipError}</section></Shell>;
  }
  return <Shell><section className="page-shell py-8 md:py-12"><div className="mb-7"><span className="text-xs font-bold uppercase tracking-[.18em] text-[#b95740]">Vos échanges</span><h1 className="mt-2 font-display text-4xl font-bold tracking-[-.04em]">Messages</h1></div><div className="grid min-h-[620px] overflow-hidden rounded-[24px] border border-[#dfd7c4] bg-[#faf6ec] shadow-[0_5px_0_#e8deca] lg:grid-cols-[330px_1fr]"><aside className="border-b border-[#e3dccd] bg-[#f4efdf] lg:border-b-0 lg:border-r"><div className="border-b border-[#dfd7c4] p-4"><p className="text-xs font-bold uppercase tracking-[.14em] text-[#777977]">Connecté comme</p><p className="mt-1 font-bold">{profileName}</p></div>{conversations.length ? conversations.map((conversation) => <button key={conversation.id} type="button" onClick={() => { setSelected(conversation); setWarning(''); }} className={`w-full border-b border-[#e3dccd] px-4 py-4 text-left transition-colors ${selected?.id === conversation.id ? 'bg-[#f0dfae]' : 'hover:bg-[#ece3d0]'}`}><div className="flex items-center justify-between gap-2"><span className={conversation.unread ? 'font-bold text-[#20283c]' : 'font-semibold text-[#4f5564]'}>{conversation.ownerId === user?.id ? conversation.participantName : conversation.ownerName}</span>{conversation.unread && <span className="size-2 rounded-full bg-[#b95740]" />}</div><p className="mt-1 truncate text-xs text-[#777977]">{conversation.lastMessage}</p></button>) : <p className="p-5 text-sm leading-6 text-[#777977]">Aucune discussion pour le moment. Utilisez le bouton Discuter d’une annonce.</p>}</aside><div className="flex min-h-[500px] flex-col">{selected ? <><div className="border-b border-[#e3dccd] bg-[#20283c] px-5 py-4 text-[#f7edda]"><p className="font-bold">{selected.ownerId === user?.id ? selected.participantName : selected.ownerName}</p><p className="text-xs text-[#bbc0c7]">Discussion PAYLOCA sécurisée</p></div><div className="flex-1 space-y-4 bg-[#ece3d0]/50 p-5">{messages.map((message) => <div key={message.id} className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm shadow-sm ${message.senderId === user?.id ? 'ml-auto rounded-br-sm bg-[#cfe1d0] text-[#234c3a]' : 'rounded-bl-sm bg-white text-[#424855]'}`}><p>{message.body}</p>{message.imageUrl && <p className="mt-2 rounded-lg bg-white/60 p-2 text-xs">Photo jointe</p>}<p className="mt-1 text-right text-[10px] opacity-70">{new Date(message.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} · {message.status}</p></div>)}{!messages.length && <p className="py-20 text-center text-sm text-[#777977]">Dites bonjour pour commencer la discussion.</p>}</div><form onSubmit={send} className="border-t border-[#e3dccd] bg-[#faf6ec] p-4">{audioPreview && <div className="mb-3 flex items-center gap-3 rounded-xl bg-[#f0e8d8] p-3"><audio controls src={audioPreview} className="min-w-0 flex-1" /><button type="button" onClick={() => { URL.revokeObjectURL(audioPreview); setAudioPreview(null); }} className="text-xs font-bold text-[#b95740]">Supprimer</button></div>}<div className="flex gap-2"><button type="button" onClick={toggleRecording} aria-label={recording ? 'Arrêter l’enregistrement' : 'Enregistrer un message vocal'} className={`rounded-full px-4 py-3 text-sm font-bold text-white ${recording ? 'recording bg-red-600' : 'bg-[#20283c]'}`}>{recording ? 'Arrêter' : '🎤'}</button><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Écrivez un message…" className="min-w-0 flex-1 rounded-full border border-[#d9cfbc] bg-[#f4efdf] px-4 py-3 text-sm outline-none focus:border-[#b95740]" /><button type="submit" disabled={sending || !draft.trim()} className="rounded-full bg-[#b95740] px-5 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60">{sending ? 'Envoi…' : 'Envoyer'}</button></div><p className="mt-2 text-center text-xs text-[#8a8984]">Enregistrement vocal local disponible en prévisualisation. L’envoi permanent sera activé avec App Storage.</p><p className="mt-1 text-center text-xs text-[#8a8984]">Pour votre sécurité, restez dans le chat Payloca. Les liens et numéros sont bloqués.</p></form></> : <div className="grid flex-1 place-items-center p-8 text-center"><div><span className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#f0dfae] text-xl">💬</span><h2 className="mt-4 font-display text-2xl font-bold">Vos conversations, au même endroit</h2><p className="mt-2 max-w-sm text-sm leading-6 text-[#777977]">Choisissez une discussion ou ouvrez une annonce pour contacter son propriétaire.</p></div></div>}{warning && <p className="border-t border-[#f0c3b8] bg-[#fff1eb] px-5 py-3 text-center text-sm font-semibold text-[#8f3e32]" role="alert">{warning}</p>}</div></div></section></Shell>;
}

function SubscriptionPage() {
  const [saved, setSaved] = useState(false);
  const [alertSaved, setAlertSaved] = useState(false);
  const saveAlert = (event: FormEvent) => {
    event.preventDefault();
    localStorage.setItem('payloca-alert', 'active');
    setAlertSaved(true);
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => undefined);
  };
  return <Shell><section className="page-shell max-w-4xl py-10 md:py-16"><span className="text-xs font-bold uppercase tracking-[.18em] text-[#b95740]">Votre accès PAYLOCA</span><h1 className="mt-2 font-display text-5xl font-bold tracking-[-.05em]">Mon abonnement</h1><div className="mt-8 grid gap-5 md:grid-cols-2"><div className="rounded-[24px] border border-[#dfd7c4] bg-[#faf6ec] p-6 shadow-[0_5px_0_#e8deca]"><span className="rounded-full bg-[#dcecdf] px-3 py-1 text-xs font-bold text-[#267158]">Accès gratuit</span><h2 className="mt-4 font-display text-2xl font-bold">Standard · Gratuit</h2><p className="mt-3 text-sm leading-6 text-[#676b76]">Accès aux fonctions gratuites de PAYLOCA, sans boost. Les annonces déjà publiées restent visibles.</p><p className="mt-5 text-sm font-bold text-[#20283c]">Aucun paiement requis</p><button type="button" onClick={() => setSaved(true)} className="mt-5 w-full rounded-xl bg-[#b95740] px-5 py-3 text-sm font-bold text-white">{saved ? 'Statut conservé' : 'Garder Standard'}</button>{saved && <p className="mt-3 text-xs leading-5 text-[#8a6e31]">Aucun paiement n’a été déclenché.</p>}</div><div className="rounded-[24px] border border-[#dfd7c4] bg-[#20283c] p-6 text-[#f7edda] shadow-[0_5px_0_#151b2b]"><span className="rounded-full bg-[#e9b949] px-3 py-1 text-xs font-bold text-[#20283c]">VIP Bronze ou Or</span><h2 className="mt-4 font-display text-2xl font-bold">Mettre en avant vos annonces</h2><p className="mt-3 text-sm leading-6 text-[#bbc0c7]">Choisissez un abonnement VIP pour obtenir votre quota mensuel de boosts et accéder aux fonctions 20+.</p><button type="button" onClick={() => window.location.href = `${basePath}/abonnement`} className="mt-5 w-full rounded-xl bg-[#e9b949] px-5 py-3 text-sm font-bold text-[#20283c]">Voir les abonnements VIP</button></div></div><form onSubmit={saveAlert} className="mt-8 rounded-[24px] border border-[#dfd7c4] bg-[#faf6ec] p-6 shadow-[0_5px_0_#e8deca]"><span className="text-xs font-bold uppercase tracking-[.18em] text-[#b95740]">Alertes intelligentes</span><h2 className="mt-2 font-display text-2xl font-bold">Ne ratez pas la bonne annonce</h2><div className="mt-5 grid gap-3 md:grid-cols-3"><input required placeholder="Quartier" className="rounded-xl border border-[#d9cfbc] bg-[#f4efdf] p-3 text-sm outline-none focus:border-[#b95740]" /><input required type="number" min="0" placeholder="Budget maximum" className="rounded-xl border border-[#d9cfbc] bg-[#f4efdf] p-3 text-sm outline-none focus:border-[#b95740]" /><select className="rounded-xl border border-[#d9cfbc] bg-[#f4efdf] p-3 text-sm outline-none focus:border-[#b95740]"><option>Maison ou boutique</option><option>Maison</option><option>Boutique</option></select></div><button type="submit" className="mt-4 rounded-xl bg-[#20283c] px-5 py-3 text-sm font-bold text-[#f7e8b4]">{alertSaved ? 'Alerte enregistrée' : 'Créer une alerte'}</button>{alertSaved && <p className="mt-3 text-sm text-[#267158]">Votre alerte est enregistrée sur cet appareil. Les notifications seront activées avec le service prévu.</p>}</form></section></Shell>;
}

type GiftItem = {
  id: string;
  direction: 'sent' | 'received';
  toPhone: string;
  plan: 'VIP_BRONZE' | 'VIP_OR';
  amount: number;
  durationMonths: number;
  status: 'PENDING_PAYMENT' | 'PAID' | 'REDEEMED' | 'EXPIRED' | 'CANCELLED';
  code: string;
  transactionId: string;
  expiresAt: string;
  createdAt: string;
  paidAt: string | null;
  redeemedAt: string | null;
};

function giftStatusLabel(status: GiftItem['status']) {
  return {
    PENDING_PAYMENT: 'Paiement en attente',
    PAID: 'Prêt à être utilisé',
    REDEEMED: 'Activé par le bénéficiaire',
    EXPIRED: 'Expiré',
    CANCELLED: 'Annulé',
  }[status];
}

function GiftPanel() {
  const { user } = usePaylocaAuth();
  const [gifts, setGifts] = useState<GiftItem[]>([]);
  const [toPhone, setToPhone] = useState('');
  const [giftPlan, setGiftPlan] = useState<'VIP_BRONZE' | 'VIP_OR'>('VIP_BRONZE');
  const [giftDuration, setGiftDuration] = useState<1 | 2 | 4>(1);
  const [redeemCode, setRedeemCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingGifts, setLoadingGifts] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const loadGifts = async () => {
    if (!user) return;
    setLoadingGifts(true);
    try {
      const response = await authenticatedFetch('/api/gifts');
      const payload = await response.json().catch(() => []);
      if (!response.ok || !Array.isArray(payload)) throw new Error('Impossible de charger vos cadeaux.');
      setGifts(payload as GiftItem[]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Impossible de charger vos cadeaux.');
    } finally {
      setLoadingGifts(false);
    }
  };

  useEffect(() => { void loadGifts(); }, [user?.id]);

  const startGiftPayment = async (event: FormEvent) => {
    event.preventDefault();
    const normalizedPhone = normalizeNigerPhone(toPhone);
    if (!normalizedPhone) {
      setError('Saisissez un numéro nigérien valide à 8 chiffres.');
      return;
    }
    setLoading(true); setError(''); setNotice('Préparation du paiement Mynita…');
    try {
      const response = await authenticatedFetch('/api/gifts/payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toPhone: normalizedPhone, plan: giftPlan, durationMonths: giftDuration }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string; redirectUrl?: string };
      if (!response.ok) throw new Error(payload.error ?? 'Impossible de préparer le cadeau.');
      if (!payload.redirectUrl) throw new Error('Mynita n’a pas fourni de lien de paiement.');
      window.location.assign(payload.redirectUrl);
    } catch (reason) {
      setNotice('');
      setError(reason instanceof Error ? reason.message : 'Paiement échoué. Aucun cadeau n’a été créé.');
    } finally {
      setLoading(false);
    }
  };

  const redeem = async (event: FormEvent) => {
    event.preventDefault();
    if (redeemCode.trim().length < 6) {
      setError('Saisissez le code reçu après le paiement.');
      return;
    }
    setLoading(true); setError(''); setNotice('Activation de votre cadeau…');
    try {
      const response = await authenticatedFetch('/api/gifts/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: redeemCode.trim().toUpperCase() }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string; membership?: { plan?: string; trialEndsAt?: string } };
      if (!response.ok) throw new Error(payload.error ?? 'Impossible d’activer ce cadeau.');
      setRedeemCode('');
      setNotice(`Cadeau activé : ${payload.membership?.plan === 'vip_or' ? 'VIP Or' : 'VIP Bronze'} jusqu’au ${payload.membership?.trialEndsAt ? new Date(payload.membership.trialEndsAt).toLocaleDateString('fr-FR') : 'la fin de votre période'}.`);
      await loadGifts();
    } catch (reason) {
      setNotice('');
      setError(reason instanceof Error ? reason.message : 'Impossible d’activer ce cadeau.');
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
     return <section className="mt-8 rounded-[24px] border border-[#dfd7c4] bg-[#faf6ec] p-6 shadow-[0_5px_0_#e8deca]"><span className="text-xs font-bold uppercase tracking-[.18em] text-[#b95740]">Cadeau VIP</span><h2 className="mt-2 font-display text-2xl font-bold">Offrir un abonnement VIP</h2><p className="mt-3 text-sm leading-6 text-[#676b76]">Connectez-vous pour offrir une formule Bronze ou Or de 1, 2 ou 4 mois à un proche, ou utiliser un code reçu.</p><Link href="/sign-in" className="mt-5 inline-flex rounded-xl bg-[#b95740] px-5 py-3 text-sm font-bold text-white">Se connecter</Link></section>;
  }

  return <section className="mt-8 rounded-[24px] border border-[#dfd7c4] bg-[#faf6ec] p-6 shadow-[0_5px_0_#e8deca]">
     <div className="flex flex-wrap items-start justify-between gap-4"><div><span className="text-xs font-bold uppercase tracking-[.18em] text-[#b95740]">Cadeau VIP</span><h2 className="mt-2 font-display text-2xl font-bold">Offrir un abonnement VIP</h2><p className="mt-2 max-w-xl text-sm leading-6 text-[#676b76]">Choisissez Bronze ou Or et une durée de 1, 2 ou 4 mois, indiquez le numéro +227 du bénéficiaire et payez avec Mynita. Si ce numéro a déjà un compte PAYLOCA, l’abonnement sera activé automatiquement. Sinon, un code permettra de le réclamer après inscription.</p></div><span className="rounded-full bg-[#f0dfae] px-3 py-1 text-xs font-bold text-[#685523]">{giftPlan === 'VIP_OR' ? giftDuration * 1000 : giftDuration * 500} F CFA · {giftDuration} mois</span></div>
    <form onSubmit={startGiftPayment} className="mt-6 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
      <label className="text-sm font-bold">Numéro du bénéficiaire<input required inputMode="tel" value={toPhone} onChange={(event) => setToPhone(event.target.value)} placeholder="+227 90 12 34 56" data-testid="input-gift-phone" className="mt-2 w-full rounded-xl border border-[#d9cfbc] bg-[#f4efdf] p-3 font-medium outline-none focus:border-[#b95740]" /><span className="mt-1 block text-xs font-normal text-[#777977]">Le bénéficiaire devra se connecter avec ce même numéro.</span></label>
       <label className="text-sm font-bold">Forfait offert<select value={giftPlan} onChange={(event) => setGiftPlan(event.target.value as 'VIP_BRONZE' | 'VIP_OR')} data-testid="select-gift-plan" className="mt-2 w-full rounded-xl border border-[#d9cfbc] bg-[#f4efdf] p-3 font-medium outline-none focus:border-[#b95740]"><option value="VIP_BRONZE">VIP Bronze · 500 F/mois</option><option value="VIP_OR">VIP Or · 1 000 F/mois</option></select></label>
       <label className="text-sm font-bold">Durée<select value={giftDuration} onChange={(event) => setGiftDuration(Number(event.target.value) as 1 | 2 | 4)} data-testid="select-gift-duration" className="mt-2 w-full rounded-xl border border-[#d9cfbc] bg-[#f4efdf] p-3 font-medium outline-none focus:border-[#b95740]"><option value="1">1 mois · {giftPlan === 'VIP_OR' ? '1 000' : '500'} F</option><option value="2">2 mois · {giftPlan === 'VIP_OR' ? '2 000' : '1 000'} F</option><option value="4">4 mois · {giftPlan === 'VIP_OR' ? '4 000' : '2 000'} F</option></select></label>
      <button type="submit" disabled={loading} data-testid="button-gift-payment" className="self-end rounded-xl bg-[#9333ea] px-5 py-3 font-bold text-white disabled:opacity-60">{loading ? 'Préparation…' : 'Payer avec Mynita'}</button>
    </form>
    <form onSubmit={redeem} className="mt-6 rounded-2xl border border-[#cfe1d0] bg-[#eef7ed] p-4">
      <label className="block text-sm font-bold text-[#267158]">Vous avez reçu un code cadeau ?<div className="mt-2 flex flex-col gap-2 sm:flex-row"><input required value={redeemCode} onChange={(event) => setRedeemCode(event.target.value.toUpperCase())} placeholder="AB12-CD34-EF56" data-testid="input-redeem-gift-code" className="min-w-0 flex-1 rounded-xl border border-[#b9d4bb] bg-white p-3 font-bold tracking-[.12em] outline-none focus:border-[#267158]" /><button type="submit" disabled={loading} data-testid="button-redeem-gift" className="rounded-xl bg-[#267158] px-5 py-3 font-bold text-white disabled:opacity-60">Activer le cadeau</button></div></label>
    </form>
    {notice && <p role="status" className="mt-4 rounded-xl bg-[#eef7ed] p-3 text-sm font-bold text-[#267158]">{notice}</p>}
    {error && <p role="alert" className="mt-4 rounded-xl bg-[#fff1eb] p-3 text-sm font-bold text-[#8f3e32]">{error}</p>}
    <div className="mt-6 border-t border-[#e7dfcf] pt-5"><div className="flex items-center justify-between gap-3"><h3 className="font-display text-xl font-bold">Mes cadeaux</h3><button type="button" onClick={() => void loadGifts()} disabled={loadingGifts} className="text-xs font-bold text-[#b95740] disabled:opacity-50">{loadingGifts ? 'Actualisation…' : 'Actualiser'}</button></div>{loadingGifts && !gifts.length ? <p className="mt-3 text-sm text-[#777977]">Chargement de vos cadeaux…</p> : !gifts.length ? <p className="mt-3 text-sm leading-6 text-[#777977]">Aucun cadeau envoyé ou reçu pour le moment.</p> : <div className="mt-3 space-y-2">{gifts.map((gift) => <div key={`${gift.direction}-${gift.id}`} className="rounded-xl border border-[#e3dccd] bg-[#f4efdf] p-3 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-bold">{gift.direction === 'sent' ? `Offert à ${gift.toPhone}` : 'Reçu sur votre numéro'} · {gift.plan === 'VIP_OR' ? 'VIP Or' : 'VIP Bronze'}</span><span className="rounded-full bg-white px-2 py-1 text-xs font-bold text-[#596071]">{giftStatusLabel(gift.status)}</span></div>{gift.code && gift.status === 'PAID' && <p className="mt-2 font-mono text-sm font-bold tracking-[.12em] text-[#267158]">Code : {gift.code}</p>}{gift.status === 'PENDING_PAYMENT' && <p className="mt-2 text-xs text-[#777977]">Le code apparaîtra après la confirmation Mynita.</p>}<p className="mt-1 text-xs text-[#777977]">Valable jusqu’au {new Date(gift.expiresAt).toLocaleDateString('fr-FR')}</p></div>)}</div>}</div>
  </section>;
}

function PaylocaPlansPage() {
  const { user, membership, membershipLoading, membershipError, membershipConfirmed } = usePaylocaAuth();
  const [processing, setProcessing] = useState(false);
  const [notice, setNotice] = useState('');
  const [payments, setPayments] = useState<Array<{
    transactionId: string;
    mynitaTransactionId: string | null;
    plan: 'VIP_BRONZE' | 'VIP_OR';
    amount: number;
    durationMonths: 1 | 2 | 4;
    status: 'PENDING' | 'SUCCEEDED' | 'SIMULATION' | 'FAILED' | 'CANCELLED';
    processedAt: string;
  }>>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [paymentsError, setPaymentsError] = useState('');
  const [selectedDurations, setSelectedDurations] = useState<{ vip_bronze: 1 | 2 | 4; vip_or: 1 | 2 | 4 }>({
    vip_bronze: 1,
    vip_or: 1,
  });
  const durationOptions = [
    { months: 1 as const, bronze: 500, or: 1000 },
    { months: 2 as const, bronze: 1000, or: 2000 },
    { months: 4 as const, bronze: 2000, or: 4000 },
  ];
  const startPayment = async (plan: 'vip_bronze' | 'vip_or', durationMonths: 1 | 2 | 4) => {
    if (!user) { setNotice('Connectez-vous pour lancer un paiement Mynita.'); return; }
    setProcessing(true); setNotice('Préparation de votre paiement Mynita…');
    try {
      const response = await authenticatedFetch('/api/membership/payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan: plan === 'vip_bronze' ? 'VIP_BRONZE' : 'VIP_OR',
          durationMonths,
        }),
      });
      const data = await response.json().catch(() => ({})) as { error?: string; redirectUrl?: string };
      if (!response.ok) throw new Error(data.error ?? 'Paiement échoué. Aucun argent n’a été débité.');
      if (!data.redirectUrl) throw new Error('Mynita n’a pas fourni de lien de paiement.');
      window.location.assign(data.redirectUrl);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Paiement échoué. Aucun argent n’a été débité.');
    } finally { setProcessing(false); }
  };
  const formatAmount = (amount: number) => `${amount.toLocaleString('fr-FR')} F`;
  const paymentStatusLabel = (status: typeof payments[number]['status']) => ({
    PENDING: 'En attente',
    SUCCEEDED: 'Réussi',
    SIMULATION: 'Simulation',
    FAILED: 'Échoué',
    CANCELLED: 'Annulé',
  }[status]);
  const loadPayments = async () => {
    if (!user) {
      setPayments([]);
      return;
    }
    setPaymentsLoading(true);
    setPaymentsError('');
    try {
      const response = await authenticatedFetch('/api/membership/payments');
      const payload = await response.json().catch(() => []);
      if (!response.ok) {
        throw new Error((payload as { error?: string }).error ?? 'Impossible de charger votre historique de paiements.');
      }
      if (!Array.isArray(payload)) throw new Error('Réponse d’historique invalide.');
      setPayments(payload as typeof payments);
    } catch (error) {
      setPaymentsError(error instanceof Error ? error.message : 'Impossible de charger votre historique de paiements.');
    } finally {
      setPaymentsLoading(false);
    }
  };
  useEffect(() => {
    void loadPayments();
  }, [user?.id]);
  if (membershipLoading && !membershipConfirmed) return <Shell><section className="page-shell py-20 text-center text-sm text-[#676b76]">Vérification de votre abonnement…</section></Shell>;
  if (membershipError && !membershipConfirmed) return <Shell><section className="page-shell py-20 text-center text-sm text-[#8f3e32]">{membershipError}</section></Shell>;
  const currentPlan = membership.plan === 'vip_bronze' ? 'VIP Bronze actif' : membership.plan === 'vip_or' ? 'VIP Or actif' : membership.status === 'ESSAI_VIP_GRATUIT' ? `Essai gratuit${membership.trialEndsAt ? ` jusqu’au ${new Date(membership.trialEndsAt).toLocaleDateString('fr-FR')}` : ''}` : 'STANDARD gratuit';
  if (membership.status === 'ESSAI_VIP_GRATUIT') return <Shell><section className="page-shell flex min-h-[65vh] items-center justify-center py-12"><div className="w-full max-w-lg rounded-[26px] border border-[#cfe1d0] bg-[#eef7ed] p-8 text-center shadow-[0_5px_0_#d7e8d5]"><span className="inline-flex rounded-full bg-[#cfe1d0] px-3 py-1 text-xs font-bold uppercase tracking-[.14em] text-[#267158]">Accès VIP actif</span><h1 className="mt-4 font-display text-4xl font-bold text-[#20283c]">Votre essai est en cours.</h1><p className="mt-3 text-sm leading-6 text-[#4f6659]">Vous profitez déjà des fonctions VIP gratuitement{membership.trialEndsAt ? ` jusqu’au ${new Date(membership.trialEndsAt).toLocaleDateString('fr-FR')}` : ''}. Les formules payantes apparaîtront à la fin de l’essai.</p><Link href="/" className="mt-6 inline-flex rounded-xl bg-[#267158] px-5 py-3 text-sm font-bold text-white">Continuer sur PAYLOCA</Link></div></section></Shell>;
  const renderDurationChoices = (plan: 'vip_bronze' | 'vip_or') => (
    <div className="mt-5 grid grid-cols-3 gap-2">
      {durationOptions.map((option) => {
        const amount = plan === 'vip_bronze' ? option.bronze : option.or;
        const selected = selectedDurations[plan] === option.months;
        return <button key={option.months} type="button" aria-pressed={selected} onClick={() => setSelectedDurations((current) => ({ ...current, [plan]: option.months }))} className={`rounded-xl border px-2 py-3 text-center transition-colors ${selected ? 'border-[#b95740] bg-[#f0dfae] text-[#20283c]' : 'border-[#dfd7c4] bg-white/60 text-[#676b76] hover:border-[#b95740]'}`}><span className="block text-sm font-extrabold">{option.months} mois</span><span className="mt-1 block text-xs font-bold">{formatAmount(amount)}</span></button>;
      })}
    </div>
  );
  return <Shell><section className="page-shell max-w-5xl py-10 md:py-16"><span className="text-xs font-bold uppercase tracking-[.18em] text-[#b95740]">Votre accès PAYLOCA</span><h1 className="mt-2 font-display text-5xl font-bold tracking-[-.05em]">Choisissez votre abonnement</h1><p className="mt-3 max-w-xl text-[#676b76]">Statut confirmé par le serveur : <strong>{currentPlan}</strong>. Les annonces restent visibles même après expiration.</p><div className="mt-6 rounded-2xl border border-[#cfe1d0] bg-[#eef7ed] p-4 text-sm leading-6 text-[#267158]"><p className="font-extrabold">Paiement sécurisé par Mynita</p><p className="mt-1">Choisissez une durée de 1, 2 ou 4 mois. Vos droits ne changent qu’après confirmation sécurisée du paiement.</p></div>{notice && <p role="status" className="mt-5 rounded-xl bg-[#eef7ed] p-4 text-sm font-bold text-[#267158]">{notice}</p>}<div className="mt-8 grid gap-5 lg:grid-cols-3"><div className="rounded-[24px] border border-[#dfd7c4] bg-[#faf6ec] p-6 shadow-[0_5px_0_#e8deca]"><span className="rounded-full bg-[#dcecdf] px-3 py-1 text-xs font-bold text-[#267158]">STANDARD</span><h2 className="mt-4 font-display text-2xl font-bold">Gratuit</h2><p className="mt-3 text-sm leading-6 text-[#676b76]">30 annonces, messagerie interne, consultation des emplois et accès aux services essentiels.</p><ul className="mt-4 space-y-2 text-sm text-[#676b76]"><li>• Liste normale, sans boost</li><li>• 30 vidéos par mois</li><li>• 10 cours gratuits par mois</li><li>• Jusqu’à 10 groupes de tontine</li></ul><span className="mt-6 block w-full rounded-xl border border-[#cfe1d0] bg-[#eef7ed] px-5 py-3 text-center text-sm font-bold text-[#267158]">Accès gratuit</span></div><div className="rounded-[24px] border border-[#c9b7d9] bg-[#f7f1fb] p-6 shadow-[0_5px_0_#e4d8eb]"><span className="rounded-full bg-[#e8d8f4] px-3 py-1 text-xs font-bold text-[#6f3197]">VIP BRONZE</span><h2 className="mt-4 font-display text-2xl font-bold">500 F CFA / mois</h2><p className="mt-3 text-sm leading-6 text-[#676b76]">Un accès renforcé pour publier davantage et développer votre activité.</p><ul className="mt-4 space-y-2 text-sm text-[#676b76]"><li>• 200 annonces et 20 boosts par mois</li><li>• Badge VIP et légère priorité</li><li>• 150 vidéos et 50 cours par mois</li><li>• 30 candidatures emploi et 200 courses</li></ul>{renderDurationChoices('vip_bronze')}<button type="button" disabled={processing} onClick={() => startPayment('vip_bronze', selectedDurations.vip_bronze)} className="mt-4 w-full rounded-xl bg-[#9333ea] px-5 py-3 font-bold text-white disabled:opacity-60">{processing ? 'Préparation…' : `Payer ${formatAmount(durationOptions.find((option) => option.months === selectedDurations.vip_bronze)?.bronze ?? 500)} avec Mynita`}</button></div><div className="rounded-[24px] border border-[#e9b949] bg-[#20283c] p-6 text-[#f7edda] shadow-[0_5px_0_#151b2b]"><span className="rounded-full bg-[#e9b949] px-3 py-1 text-xs font-bold text-[#20283c]">VIP OR</span><h2 className="mt-4 font-display text-2xl font-bold">1 000 F CFA / mois</h2><p className="mt-3 text-sm leading-6 text-[#bbc0c7]">L’offre complète pour une visibilité et des usages sans plafond métier.</p><ul className="mt-4 space-y-2 text-sm text-[#bbc0c7]"><li>• Annonces illimitées et 200 boosts par mois</li><li>• Badge Or et priorité dans la recherche</li><li>• Vidéos et candidatures emploi illimitées</li><li>• Formations et livraisons illimitées</li></ul>{renderDurationChoices('vip_or')}<button type="button" disabled={processing} onClick={() => startPayment('vip_or', selectedDurations.vip_or)} className="mt-4 w-full rounded-xl bg-[#e9b949] px-5 py-3 font-bold text-[#20283c] disabled:opacity-60">{processing ? 'Préparation…' : `Payer ${formatAmount(durationOptions.find((option) => option.months === selectedDurations.vip_or)?.or ?? 1000)} avec Mynita`}</button></div></div><p className="mt-6 text-center text-xs text-[#8a8984]">Formules disponibles : 1 mois, 2 mois ou 4 mois. Il n’y a plus de forfait annuel.</p><section className="mt-10 rounded-[24px] border border-[#dfd7c4] bg-[#faf6ec] p-6 shadow-[0_5px_0_#e8deca]" data-testid="section-payment-history"><div className="flex flex-wrap items-start justify-between gap-3"><div><span className="text-xs font-bold uppercase tracking-[.18em] text-[#b95740]">Suivi</span><h2 className="mt-2 font-display text-2xl font-bold">Mes paiements et renouvellements</h2><p className="mt-2 text-sm leading-6 text-[#676b76]">Retrouvez les paiements liés à ce compte, du plus récent au plus ancien.</p></div>{user && <button type="button" onClick={() => void loadPayments()} disabled={paymentsLoading} className="rounded-xl border border-[#d9cfbc] px-3 py-2 text-xs font-bold text-[#596071] disabled:opacity-50">{paymentsLoading ? 'Actualisation…' : 'Actualiser'}</button>}</div>{!user ? <p className="mt-5 rounded-xl bg-[#f4efdf] p-4 text-sm leading-6 text-[#676b76]">Connectez-vous pour consulter votre historique personnel.</p> : paymentsLoading && !payments.length ? <p className="mt-5 text-sm text-[#777977]">Chargement de votre historique…</p> : paymentsError ? <div className="mt-5 rounded-xl bg-[#fff1eb] p-4 text-sm font-bold text-[#8f3e32]"><p>{paymentsError}</p><button type="button" onClick={() => void loadPayments()} className="mt-3 underline">Réessayer</button></div> : !payments.length ? <p className="mt-5 rounded-xl bg-[#f4efdf] p-4 text-sm leading-6 text-[#676b76]">Aucun paiement ou renouvellement enregistré pour le moment.</p> : <div className="mt-5 space-y-3">{payments.map((payment) => <article key={payment.transactionId} className="rounded-2xl border border-[#e7dfcf] bg-[#f4efdf] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-bold">{payment.plan === 'VIP_OR' ? 'VIP Or' : 'VIP Bronze'} · {payment.durationMonths} mois</h3><p className="mt-1 text-sm text-[#676b76]">{payment.amount.toLocaleString('fr-FR')} F CFA · {new Date(payment.processedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}</p></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${payment.status === 'SUCCEEDED' || payment.status === 'SIMULATION' ? 'bg-[#dcecdf] text-[#267158]' : payment.status === 'PENDING' ? 'bg-[#f0dfae] text-[#685523]' : 'bg-[#fff1eb] text-[#8f3e32]'}`}>{paymentStatusLabel(payment.status)}</span></div><p className="mt-3 break-all font-mono text-xs text-[#777977]">Référence : {payment.transactionId}</p>{payment.mynitaTransactionId && <p className="mt-1 break-all font-mono text-xs text-[#777977]">Référence Mynita : {payment.mynitaTransactionId}</p>}</article>)}</div>}</section><GiftPanel /></section></Shell>;
}

function Onboarding() {
  const { show, finish } = useFirstLaunch();
  const [step, setStep] = useState(0);
  const pages = [
    ['Bienvenue sur Payloca', 'Trouvez votre maison ou boutique'],
    ['Publiez en 2 minutes', 'Ajoutez vos photos et prix'],
    ['Paiement Sécurisé', 'Louer en toute confiance avec Mynita'],
  ];
  if (!show) return null;
  return <div className="onboarding-shell fixed inset-0 z-[70] grid place-items-center bg-[#20283c]/80 p-5"><div className="onboarding-card w-full max-w-md rounded-[28px] bg-[#f8f3e6] p-8 text-center shadow-2xl"><span className="mx-auto grid size-16 place-items-center rounded-2xl bg-[#20283c] text-[#f7e8b4]"><HomeIcon size={30} /></span><p className="mt-8 text-xs font-bold uppercase tracking-[.18em] text-[#b95740]">PAYLOCA · {step + 1}/3</p><h1 className="mt-3 font-display text-3xl font-bold">{pages[step][0]}</h1><p className="mt-3 text-[#676b76]">{pages[step][1]}</p><div className="mt-8 flex justify-center gap-2">{pages.map((_, index) => <span key={index} className={`h-2 rounded-full ${index === step ? 'w-8 bg-[#b95740]' : 'w-2 bg-[#d8c89f]'}`} />)}</div><button type="button" onClick={() => step === 2 ? finish() : setStep(step + 1)} className="payloca-button mt-8 w-full rounded-xl bg-[#b95740] px-5 py-3.5 font-bold text-white">{step === 2 ? 'Commencer' : 'Continuer'}</button></div></div>;
}

function AuthGate({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, accountType, accountTypeLoading, accountTypeRequired } = usePaylocaAuth();
  if (!isLoaded) return <Shell><section className="page-shell py-20 text-center text-sm text-[#676b76]">Chargement de votre session…</section></Shell>;
  if (!isSignedIn) return <Shell><section className="page-shell flex min-h-[55vh] items-center justify-center py-12"><div className="w-full max-w-md rounded-[24px] border border-[#dfd7c4] bg-[#faf6ec] p-8 text-center shadow-[0_5px_0_#e8deca]"><span className="text-xs font-bold uppercase tracking-[.18em] text-[#b95740]">Compte PAYLOCA requis</span><h1 className="mt-3 font-display text-3xl font-bold">Connectez-vous pour continuer</h1><p className="mt-3 text-sm leading-6 text-[#676b76]">Votre compte sécurise vos annonces et vos échanges.</p><Link href="/sign-in" className="mt-7 inline-flex rounded-xl bg-[#b95740] px-5 py-3 font-bold text-white">Se connecter</Link></div></section></Shell>;
  if (accountTypeLoading && accountType === null) return <Shell><section className="page-shell py-20 text-center text-sm text-[#676b76]">Chargement de votre espace…</section></Shell>;
  if (accountType === null || accountTypeRequired) return <SignInPage />;
  if (isSignedIn) return <>{children}</>;
  return <Shell><section className="page-shell flex min-h-[55vh] items-center justify-center py-12"><div className="w-full max-w-md rounded-[24px] border border-[#dfd7c4] bg-[#faf6ec] p-8 text-center shadow-[0_5px_0_#e8deca]"><span className="text-xs font-bold uppercase tracking-[.18em] text-[#b95740]">Compte PAYLOCA requis</span><h1 className="mt-3 font-display text-3xl font-bold">Connectez-vous pour continuer</h1><p className="mt-3 text-sm leading-6 text-[#676b76]">Votre compte sécurise vos annonces et vos échanges.</p><Link href="/sign-in" className="mt-7 inline-flex rounded-xl bg-[#b95740] px-5 py-3 font-bold text-white">Se connecter</Link></div></section></Shell>;
}

const accountSpaces: Array<{ type: AccountType; title: string; description: string; icon: string }> = [
  { type: 'user', title: 'Utilisateur', description: 'Consulter les annonces, échanger et participer à la communauté PAYLOCA.', icon: '⌂' },
];

function AccountTypeChooser() {
  return <div className="auth-shell flex min-h-[100dvh] items-center justify-center bg-[#e8ddc6] p-4"><div className="auth-card w-full max-w-xl rounded-[28px] bg-[#faf6ec] p-6 shadow-[0_5px_0_#e8deca] md:p-10"><span className="text-xs font-bold uppercase tracking-[.18em] text-[#b95740]">Accès obligatoire par SMS</span><h1 className="mt-3 font-display text-4xl font-bold tracking-[-.04em]">Entrez dans PAYLOCA</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-[#676b76]">Pour protéger votre compte, nous vous demanderons votre nom, votre ville et votre numéro nigérien avant l’accès à l’application.</p><div className="mt-8">{accountSpaces.map((space) => <Link key={space.type} href="/sign-in/user" data-testid="link-account-type-user" className="group block rounded-[22px] border border-[#dfd7c4] bg-[#f4efdf] p-5 transition-transform hover:-translate-y-1 hover:border-[#b95740] hover:shadow-[0_5px_0_#e8deca]"><span className="grid size-12 place-items-center rounded-2xl bg-[#20283c] font-display text-2xl font-bold text-[#f7e8b4]">{space.icon}</span><h2 className="mt-5 font-display text-2xl font-bold">{space.title}</h2><p className="mt-2 text-sm leading-6 text-[#676b76]">{space.description}</p><span className="mt-5 inline-flex text-sm font-bold text-[#b95740]">Continuer <ArrowRight size={16} className="ml-1 transition-transform group-hover:translate-x-1" /></span></Link>)}</div></div></div>;
}

function AccountTypeGate({ allowed, children }: { allowed: readonly AccountType[]; children: ReactNode }) {
  const { isLoaded, isSignedIn, accountType, accountTypeLoading, accountTypeRequired } = usePaylocaAuth();
  if (!isLoaded) return <Shell><section className="page-shell py-20 text-center text-sm text-[#676b76]">Chargement de votre session…</section></Shell>;
  if (!isSignedIn) return <AuthGate>{children}</AuthGate>;
  if (accountTypeLoading && accountType === null) return <Shell><section className="page-shell py-20 text-center text-sm text-[#676b76]">Chargement de votre espace…</section></Shell>;
  if (accountType === null || accountTypeRequired) return <SignInPage />;
  if (!allowed.includes(accountType)) return <Shell><section className="page-shell flex min-h-[55vh] items-center justify-center py-12"><div className="max-w-md rounded-[25px] border border-[#e4bbb0] bg-[#fff1eb] p-7 text-center"><h1 className="font-display text-3xl font-bold text-[#8f3e32]">Accès réservé</h1><p className="mt-3 text-sm leading-6 text-[#8f3e32]">Cette fonctionnalité appartient à un autre espace PAYLOCA.</p><Link href={accountType === 'agency' ? '/espace-agence' : accountType === 'ong' ? '/espace-ong' : '/'} className="mt-6 inline-flex rounded-xl bg-[#b95740] px-4 py-3 text-sm font-bold text-white">Retour à mon espace</Link></div></section></Shell>;
  return <>{children}</>;
}

function UserFunPanel() {
  const { user } = usePaylocaAuth();
  if (user?.accountType !== 'user') return null;
  return <section className="mt-8 rounded-2xl border border-purple-200 bg-purple-100 p-5 text-purple-950 shadow-sm" data-testid="panel-user-fun"><p className="text-xs font-bold uppercase tracking-[.16em] text-purple-700">Espace utilisateur</p><h2 className="mt-2 font-display text-2xl font-bold">Créez, regardez et partagez.</h2><p className="mt-2 text-sm leading-6 text-purple-900/80">Retrouvez les vidéos courtes de la communauté dans PAYLOCA FUN.</p><Link href="/fil" className="mt-4 block rounded-xl bg-white px-4 py-3 text-center text-sm font-bold text-purple-900 shadow-sm transition hover:bg-purple-50" data-testid="button-user-fun">Ouvrir PAYLOCA FUN</Link></section>;
}

function SignInPage() {
  const {
    configured,
    isSignedIn,
    accountType,
    accountTypeRequired,
    user,
    requestOtp,
    confirmOtp,
    resendOtp,
    completeProfile,
  } = usePaylocaAuth();
  const [location, setLocation] = useLocation();
  const validType = location === '/sign-in/user' || location === '/sign-up/user' ? 'user' as const : null;
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('+227');
  const [city, setCity] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [profileCity, setProfileCity] = useState('');
  const completingProfile = Boolean(isSignedIn && accountType === 'user' && accountTypeRequired);

  useEffect(() => {
    if (!isSignedIn || !accountType || accountTypeRequired) return;
    setLocation(accountType === 'agency' ? '/espace-agence' : accountType === 'ong' ? '/espace-ong' : '/');
  }, [accountType, accountTypeRequired, isSignedIn, setLocation]);

  const send = async (event: FormEvent) => {
    event.preventDefault(); setLoading(true); setError('');
    if (!validType) return;
    try { setSentTo(await requestOtp(name, phone, validType, city)); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Impossible d’envoyer le code SMS.'); } finally { setLoading(false); }
  };

  const verify = async (event: FormEvent) => {
    event.preventDefault(); setLoading(true); setError('');
    try { await confirmOtp(code.replace(/\D/g, '')); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Code incorrect. Renvoyer le code'); } finally { setLoading(false); }
  };

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault(); setLoading(true); setError('');
    try { await completeProfile(profileCity); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Impossible d’enregistrer votre ville.'); } finally { setLoading(false); }
  };

  if (completingProfile) return <div className="auth-shell flex min-h-[100dvh] items-center justify-center bg-[#e8ddc6] p-4"><div className="auth-card w-full max-w-md rounded-[24px] bg-[#faf6ec] p-8 shadow-[0_5px_0_#e8deca]"><span className="text-xs font-bold uppercase tracking-[.18em] text-[#b95740]">Dernière étape</span><h1 className="mt-3 font-display text-3xl font-bold">Complétez votre profil</h1><p className="mt-3 text-sm leading-6 text-[#676b76]">Indiquez votre ville pour continuer vers l’application.</p><form onSubmit={saveProfile} className="mt-7 space-y-4"><label className="block text-sm font-bold">Ville<input required minLength={2} maxLength={80} value={profileCity} onChange={(event) => setProfileCity(event.target.value)} data-testid="input-profile-city" className="mt-2 w-full rounded-xl border border-[#d9cfbc] bg-[#f4efdf] p-3" /></label><button disabled={loading || profileCity.trim().length < 2} data-testid="button-save-profile" className="payloca-button w-full rounded-xl bg-[#b95740] px-5 py-3.5 font-bold text-white disabled:opacity-60">{loading ? 'Enregistrement…' : 'Continuer vers PAYLOCA'}</button></form>{error && <p role="alert" className="mt-5 rounded-xl bg-[#fff1eb] p-3 text-center text-sm font-semibold text-[#8f3e32]">{error}</p>}</div></div>;
  if (!validType && !isSignedIn) return <AccountTypeChooser />;
  if (isSignedIn) return <div className="auth-shell flex min-h-[100dvh] items-center justify-center bg-[#e8ddc6] p-4"><div className="auth-card w-full max-w-md rounded-[24px] bg-[#faf6ec] p-8 text-center shadow-[0_5px_0_#e8deca]"><h1 className="font-display text-3xl font-bold">Votre espace est déjà ouvert</h1><p className="mt-3 text-sm leading-6 text-[#676b76]">Vous êtes déjà connecté à PAYLOCA.</p><Link href="/" className="mt-6 inline-flex rounded-xl bg-[#b95740] px-5 py-3 font-bold text-white">Accéder à PAYLOCA</Link></div></div>;
  if (!configured) return <div className="auth-shell flex min-h-[100dvh] items-center justify-center bg-[#e8ddc6] p-4"><div className="auth-card w-full max-w-md rounded-[24px] bg-[#faf6ec] p-8 text-center shadow-[0_5px_0_#e8deca]"><h1 className="font-display text-3xl font-bold">Créer votre compte PAYLOCA</h1><p className="mt-4 text-sm leading-6 text-[#676b76]">La connexion par SMS n’est pas encore configurée. Ajoutez les variables Firebase pour activer l’envoi de code.</p></div></div>;
  return <div className="auth-shell flex min-h-[100dvh] items-center justify-center bg-[#e8ddc6] p-4"><div className="auth-card w-full max-w-md rounded-[24px] bg-[#faf6ec] p-8 shadow-[0_5px_0_#e8deca]"><Link href="/sign-in" className="text-xs font-bold text-[#b95740]">← Retour</Link><p className="mt-5 text-xs font-bold uppercase tracking-[.18em] text-[#b95740]">Espace utilisateur</p><span className="mx-auto mt-4 grid size-14 place-items-center rounded-2xl bg-[#20283c] text-[#f7e8b4]"><Phone /></span><h1 className="mt-6 text-center font-display text-3xl font-bold">Créer ou retrouver mon compte</h1><p className="mt-3 text-center text-sm leading-6 text-[#676b76]">Votre numéro nigérien vérifié sécurise l’accès à PAYLOCA.</p>{!sentTo ? <form onSubmit={send} className="mt-7 space-y-4"><label className="block text-sm font-bold">Nom ou prénom<input required value={name} onChange={(event) => setName(event.target.value)} data-testid="input-auth-name" className="mt-2 w-full rounded-xl border border-[#d9cfbc] bg-[#f4efdf] p-3" /></label><label className="block text-sm font-bold">Ville<input required minLength={2} maxLength={80} value={city} onChange={(event) => setCity(event.target.value)} data-testid="input-auth-city" className="mt-2 w-full rounded-xl border border-[#d9cfbc] bg-[#f4efdf] p-3" /></label><label className="block text-sm font-bold">Numéro de téléphone<input required inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} data-testid="input-auth-phone" className="mt-2 w-full rounded-xl border border-[#d9cfbc] bg-[#f4efdf] p-3" /></label><p className="text-xs text-[#777977]">Format attendu : +227 suivi de 8 chiffres.</p><button disabled={loading || !normalizeNigerPhone(phone) || !name.trim() || city.trim().length < 2} data-testid="button-send-otp" className="payloca-button w-full rounded-xl bg-[#b95740] px-5 py-3.5 font-bold text-white disabled:opacity-60">{loading ? 'Envoi…' : 'Recevoir le code par SMS'}</button></form> : <form onSubmit={verify} className="mt-7"><p className="text-center text-sm text-[#676b76]">Entrez le code reçu au {sentTo}</p><input value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" data-testid="input-otp-code" className="mt-6 w-full rounded-xl border border-[#d9cfbc] bg-[#f4efdf] p-4 text-center text-2xl font-bold tracking-[.8em]" placeholder="000000" /><p className="mt-2 text-center text-xs text-[#777977]">Six chiffres</p><button disabled={loading || code.length !== 6} data-testid="button-confirm-otp" className="payloca-button mt-5 w-full rounded-xl bg-[#b95740] px-5 py-3.5 font-bold text-white disabled:opacity-60">{loading ? 'Vérification…' : 'Valider le code'}</button><button type="button" onClick={() => resendOtp().catch(() => setError('Impossible de renvoyer le code.'))} className="mt-4 w-full text-sm font-bold text-[#b95740]">Renvoyer le code</button></form>}{error && <p role="alert" className="mt-5 rounded-xl bg-[#fff1eb] p-3 text-center text-sm font-semibold text-[#8f3e32]">{error}</p>}<div id="firebase-recaptcha" /></div></div>;
}

function ProtectedMessagesPage() {
  return <AuthGate><MessagesPage /></AuthGate>;
}

function ProtectedPublishPage() {
  const { membership, membershipLoading, membershipError, membershipConfirmed, accountType } = usePaylocaAuth();
  if (accountType === null) return <AuthGate><PublishPage /></AuthGate>;
  if (accountType !== 'agency') return <Shell><section className="page-shell flex min-h-[60vh] items-center justify-center py-12"><div className="max-w-md rounded-[25px] border border-[#e4bbb0] bg-[#fff1eb] p-7 text-center shadow-[0_5px_0_#e8deca]"><h1 className="font-display text-3xl font-bold text-[#8f3e32]">Espace agence requis</h1><p className="mt-3 text-sm leading-6 text-[#8f3e32]">La publication et la gestion des annonces sont réservées aux agences et propriétaires.</p><Link href="/espace-agence" className="mt-6 inline-flex rounded-xl bg-[#b95740] px-4 py-3 text-sm font-bold text-white">Voir l’espace agence</Link></div></section></Shell>;
  if (membershipLoading && !membershipConfirmed) return <Shell><section className="page-shell py-20 text-center text-sm text-[#676b76]">Vérification de vos droits d’accès…</section></Shell>;
  if (membershipError && !membershipConfirmed) return <Shell><section className="page-shell py-20 text-center text-sm text-[#8f3e32]">{membershipError}</section></Shell>;
  if (membership.status === 'LECTURE_GRATUITE') return <Shell><section className="page-shell flex min-h-[60vh] items-center justify-center py-12"><div className="max-w-md rounded-[25px] border border-[#e4bbb0] bg-[#fff1eb] p-7 text-center shadow-[0_5px_0_#e8deca]"><h1 className="font-display text-3xl font-bold text-[#8f3e32]">Passez à l’action</h1><p className="mt-3 text-sm leading-6 text-[#8f3e32]">Votre essai VIP est terminé. Pour publier, choisissez un abonnement.</p><div className="mt-6 grid gap-2"><Link href="/abonnement" className="rounded-xl bg-[#b95740] px-4 py-3 text-sm font-bold text-white">Standard gratuit</Link><Link href="/abonnement" className="rounded-xl bg-[#20283c] px-4 py-3 text-sm font-bold text-[#f7e8b4]">VIP Bronze ou VIP Or</Link><Link href="/annonces" className="rounded-xl border border-[#d9cfbc] px-4 py-3 text-sm font-bold text-[#596071]">Continuer à regarder gratuitement</Link></div></div></section></Shell>;
  return <AuthGate><PublishPage /></AuthGate>;
}

function AccountSpacePage({ expected }: { expected: AccountType }) {
  const { isLoaded, isSignedIn, accountType, accountTypeLoading, accountTypeRequired } = usePaylocaAuth();
  if (!isLoaded) return <Shell><section className="page-shell py-20 text-center text-sm text-[#676b76]">Chargement de votre session…</section></Shell>;
  if (!isSignedIn) return <AuthGate><AccountSpacePage expected={expected} /></AuthGate>;
  if (accountTypeLoading && accountType === null) return <Shell><section className="page-shell py-20 text-center text-sm text-[#676b76]">Chargement de votre espace…</section></Shell>;
  if (accountType === null || accountTypeRequired) return <SignInPage />;
  if (accountType !== expected) return <Shell><section className="page-shell flex min-h-[60vh] items-center justify-center py-12"><div className="max-w-md rounded-[25px] border border-[#e4bbb0] bg-[#fff1eb] p-7 text-center shadow-[0_5px_0_#e8deca]"><h1 className="font-display text-3xl font-bold text-[#8f3e32]">Cet espace n’est pas le vôtre</h1><p className="mt-3 text-sm leading-6 text-[#8f3e32]">Votre compte est configuré comme {accountType === 'agency' ? 'agence / propriétaire' : accountType === 'ong' ? 'ONG' : 'utilisateur'}.</p><Link href={accountType === 'agency' ? '/espace-agence' : accountType === 'ong' ? '/espace-ong' : '/'} className="mt-6 inline-flex rounded-xl bg-[#b95740] px-4 py-3 text-sm font-bold text-white">Ouvrir mon espace</Link></div></section></Shell>;
  if (expected === 'agency') return <Shell><section className="page-shell py-10 md:py-16"><span className="text-xs font-bold uppercase tracking-[.18em] text-[#b95740]">Espace agence / propriétaire</span><h1 className="mt-2 font-display text-5xl font-bold tracking-[-.05em]">Gérez vos biens avec clarté.</h1><p className="mt-4 max-w-2xl text-base leading-7 text-[#676b76]">Publiez vos maisons et boutiques, présentez votre profil professionnel et suivez uniquement les données disponibles sur votre compte.</p><div className="mt-9 grid gap-4 md:grid-cols-3"><Link href="/publier" className="rounded-[22px] border border-[#dfd7c4] bg-[#faf6ec] p-5 shadow-[0_5px_0_#e8deca] transition-transform hover:-translate-y-1"><span className="text-2xl">＋</span><h2 className="mt-4 font-display text-2xl font-bold">Publier un bien</h2><p className="mt-2 text-sm leading-6 text-[#676b76]">Ajoutez une annonce avec photo et contact nigérien validés.</p></Link><Link href="/boutique" className="rounded-[22px] border border-[#dfd7c4] bg-[#faf6ec] p-5 shadow-[0_5px_0_#e8deca] transition-transform hover:-translate-y-1"><span className="text-2xl">▦</span><h2 className="mt-4 font-display text-2xl font-bold">Profil professionnel</h2><p className="mt-2 text-sm leading-6 text-[#676b76]">Présentez votre agence ou votre activité sans faux badge ni chiffre inventé.</p></Link><Link href="/emplois" className="rounded-[22px] border border-[#dfd7c4] bg-[#faf6ec] p-5 shadow-[0_5px_0_#e8deca] transition-transform hover:-translate-y-1"><span className="text-2xl">⌁</span><h2 className="mt-4 font-display text-2xl font-bold">Emploi</h2><p className="mt-2 text-sm leading-6 text-[#676b76]">Gérez vos offres et consultez les candidatures de vos offres.</p></Link></div><div className="mt-8 rounded-[22px] border border-[#cfe1d0] bg-[#eef7ed] p-5 text-sm leading-6 text-[#267158]"><strong>Données réelles uniquement.</strong> Les statistiques et vérifications s’afficheront lorsqu’elles seront disponibles sur votre compte.</div></section></Shell>;
  if (expected === 'ong') return <Shell><section className="page-shell py-10 md:py-16"><span className="text-xs font-bold uppercase tracking-[.18em] text-[#267158]">Espace ONG</span><h1 className="mt-2 font-display text-5xl font-bold tracking-[-.05em]">Votre action, sans chiffres inventés.</h1><p className="mt-4 max-w-2xl text-base leading-7 text-[#676b76]">Présentez votre organisation et vos activités après validation. PAYLOCA n’affiche aucun impact ou badge tant qu’une donnée n’a pas été vérifiée.</p><div className="mt-9 rounded-[24px] border border-[#dfd7c4] bg-[#faf6ec] p-6 shadow-[0_5px_0_#e8deca]"><h2 className="font-display text-2xl font-bold">Activités validées</h2><p className="mt-3 text-sm leading-6 text-[#676b76]">Aucune activité validée n’est encore disponible pour ce compte.</p><button type="button" disabled className="mt-6 rounded-xl border border-[#d9cfbc] px-5 py-3 text-sm font-bold text-[#8a8984]">Créer une activité · validation requise</button></div></section></Shell>;
    return <Shell><section className="page-shell py-10 md:py-16"><span className="text-xs font-bold uppercase tracking-[.18em] text-[#b95740]">Espace utilisateur</span><h1 className="mt-2 font-display text-5xl font-bold tracking-[-.05em]">Tout PAYLOCA au même endroit.</h1><p className="mt-4 max-w-2xl text-base leading-7 text-[#676b76]">Recherchez des annonces, gardez vos favoris, échangez avec les propriétaires et participez à la communauté.</p><div className="mt-9 grid gap-4 md:grid-cols-3"><Link href="/annonces" className="rounded-[22px] border border-[#dfd7c4] bg-[#faf6ec] p-5 shadow-[0_5px_0_#e8deca]"><h2 className="font-display text-2xl font-bold">Les annonces</h2><p className="mt-2 text-sm leading-6 text-[#676b76]">Voir les biens actuellement disponibles.</p></Link><Link href="/favoris" className="rounded-[22px] border border-[#dfd7c4] bg-[#faf6ec] p-5 shadow-[0_5px_0_#e8deca]"><h2 className="font-display text-2xl font-bold">Mes favoris</h2><p className="mt-2 text-sm leading-6 text-[#676b76]">Retrouver vos sélections sur cet appareil.</p></Link><Link href="/messages" className="rounded-[22px] border border-[#dfd7c4] bg-[#faf6ec] p-5 shadow-[0_5px_0_#e8deca]"><h2 className="font-display text-2xl font-bold">Messages</h2><p className="mt-2 text-sm leading-6 text-[#676b76]">Échanger sans sortir de PAYLOCA.</p></Link></div><UserFunPanel /></section></Shell>;
}

function Router() {
  const [location] = useLocation();
  const { isLoaded, isSignedIn, accountTypeRequired } = usePaylocaAuth();
  const isAuthRoute = location.startsWith('/sign-in') || location.startsWith('/sign-up');
  if (location.startsWith('/sign-in')) return <SignInPage />;
  if (location.startsWith('/sign-up')) return <SignInPage />;
  if (!isLoaded) return <div className="auth-shell flex min-h-[100dvh] items-center justify-center bg-[#e8ddc6] p-5"><div className="w-full max-w-md rounded-[28px] bg-[#faf6ec] p-8 text-center shadow-[0_5px_0_#e8deca]"><p className="text-xs font-bold uppercase tracking-[.18em] text-[#b95740]">PAYLOCA</p><h1 className="mt-3 font-display text-3xl font-bold">Préparation de votre compte…</h1><p className="mt-3 text-sm leading-6 text-[#676b76]">Vérification de votre session sécurisée.</p></div></div>;
  if (isSignedIn && accountTypeRequired && !isAuthRoute) return <SignInPage />;
  if (location.startsWith('/espace-agence')) return <ErrorBoundary resetKey={location}><AccountSpacePage expected="agency" /></ErrorBoundary>;
  if (location.startsWith('/espace-ong')) return <ErrorBoundary resetKey={location}><AccountSpacePage expected="ong" /></ErrorBoundary>;
  if (location.startsWith('/espace-utilisateur')) return <ErrorBoundary resetKey={location}><AccountSpacePage expected="user" /></ErrorBoundary>;
  if (location.startsWith('/messages')) return <ErrorBoundary resetKey={location}><ProtectedMessagesPage /></ErrorBoundary>;
  if (location.startsWith('/services')) return <ErrorBoundary resetKey={location}><Shell><ServicesPage /></Shell></ErrorBoundary>;
  if (location.startsWith('/emplois')) return <ErrorBoundary resetKey={location}><Shell><JobsPage /></Shell></ErrorBoundary>;
  if (location === '/boutique' || location.startsWith('/boutique?')) return <ErrorBoundary resetKey={location}><AccountTypeGate allowed={['agency']}><Shell><SellerProfilePage /></Shell></AccountTypeGate></ErrorBoundary>;
  if (location.startsWith('/profil/')) {
    const userId = decodeURIComponent(location.slice('/profil/'.length).split(/[/?#]/)[0] ?? '');
    return <ErrorBoundary resetKey={location}><Shell><SellerProfilePage userId={userId} /></Shell></ErrorBoundary>;
  }
  if (location.startsWith('/fil')) return <ErrorBoundary resetKey={location}><Shell><FunPage /></Shell></ErrorBoundary>;
  if (location.startsWith('/recherche')) return <ErrorBoundary resetKey={location}><Shell><SearchPage /></Shell></ErrorBoundary>;
  if (location.startsWith('/sos')) return <ErrorBoundary resetKey={location}><Shell><SosPage /></Shell></ErrorBoundary>;
  if (location.startsWith('/ligue-payloca')) return <ErrorBoundary resetKey={location}><LeaguePage /></ErrorBoundary>;
  if (location.startsWith('/appels')) return <ErrorBoundary resetKey={location}><AuthGate><CallsPage /></AuthGate></ErrorBoundary>;
  if (location.startsWith('/parrainage') || location.startsWith('/invite/')) return <ErrorBoundary resetKey={location}><ReferralPage /></ErrorBoundary>;
  if (location.startsWith('/aide')) return <ErrorBoundary resetKey={location}><HelpPage /></ErrorBoundary>;
  if (location.startsWith('/stories')) return <ErrorBoundary resetKey={location}><AuthGate><StoriesPage /></AuthGate></ErrorBoundary>;
  if (location.startsWith('/famille')) return <ErrorBoundary resetKey={location}><AuthGate><FamilyPage /></AuthGate></ErrorBoundary>;
  if (location.startsWith('/parametres-famille')) return <ErrorBoundary resetKey={location}><AuthGate><FamilySettingsPage /></AuthGate></ErrorBoundary>;
  if (location.startsWith('/controle-parental')) return <ErrorBoundary resetKey={location}><AuthGate><ParentalControlPage /></AuthGate></ErrorBoundary>;
  if (location.startsWith('/chat-famille')) return <ErrorBoundary resetKey={location}><AuthGate><FamilyChatPage /></AuthGate></ErrorBoundary>;
  if (location.startsWith('/abonnement')) return <ErrorBoundary resetKey={location}><PaylocaPlansPage /></ErrorBoundary>;
   if (location === '/') return <ErrorBoundary resetKey={location}><Home /></ErrorBoundary>;
   if (location === '/annonces') return <ErrorBoundary resetKey={location}><ListingsPage /></ErrorBoundary>;
   if (location.startsWith('/annonces/')) return <ErrorBoundary resetKey={location}><DetailPage /></ErrorBoundary>;
  if (location.startsWith('/favoris')) return <ErrorBoundary resetKey={location}><AuthGate><FavoritesPage /></AuthGate></ErrorBoundary>;
  if (location.startsWith('/publier')) return <ErrorBoundary resetKey={location}><AuthGate><ProtectedPublishPage /></AuthGate></ErrorBoundary>;
  if (location.startsWith('/confidentialite')) return <ErrorBoundary resetKey={location}><InfoPage title="Politique de confidentialité" eyebrow="Vos données, votre confiance"><p>PAYLOCA utilise les informations nécessaires à votre compte et à vos annonces. Les publications du fil, leur auteur, leur communauté et leur ville sont publiques.</p><p className="mt-4">Vos contacts SOS restent uniquement dans le stockage local de cet appareil, séparés par compte connecté. PAYLOCA ne les envoie pas à son serveur. Votre position n’est demandée qu’après votre consentement lors de la préparation d’un message SOS.</p><p className="mt-6 font-semibold text-[#20283c]">Dernière mise à jour 28 août 2026.</p></InfoPage></ErrorBoundary>;
  return <ErrorBoundary resetKey={location}><Switch><Route path="/" component={Home} /><Route path="/annonces" component={ListingsPage} /><Route path="/annonces/:id" component={DetailPage} /><Route path="/publier" component={ProtectedPublishPage} /><Route path="/favoris" component={FavoritesPage} /><Route path="/parametres" component={SettingsPage} /><Route path="/confidentialite"><InfoPage title="Politique de confidentialité" eyebrow="Vos données, votre confiance"><p>PAYLOCA utilise les informations nécessaires à votre compte et à vos annonces. Les publications du fil, leur auteur, leur communauté et leur ville sont publiques. Vos contacts SOS restent uniquement dans le stockage local de cet appareil, séparés par compte connecté. PAYLOCA ne les envoie pas à son serveur.</p><p className="mt-4">Votre position n’est demandée qu’après votre consentement lors de la préparation d’un message SOS. Elle sert alors à préparer un lien dans le SMS ; PAYLOCA n’envoie pas le message automatiquement et ne contacte pas les secours.</p><p className="mt-6 font-semibold text-[#20283c]">Dernière mise à jour 26 août 2026.</p></InfoPage></Route><Route path="/conditions"><InfoPage title="Conditions d'utilisation" eyebrow="Les règles de Payloca"><p>En utilisant PAYLOCA, vous acceptez de publier uniquement des contenus et des biens légaux.</p><p>PAYLOCA n’est pas responsable des transactions conclues entre utilisateurs.</p><p>Tout litige doit être réglé entre les parties concernées.</p></InfoPage></Route><Route path="/a-propos" component={AboutPage} /><Route component={NotFound} /></Switch></ErrorBoundary>;
}

function LaunchScreen({ onEnter }: { onEnter: () => void }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const timeout = window.setTimeout(() => setReady(true), 2000);
    return () => window.clearTimeout(timeout);
  }, []);

  return <main className="launch-screen" aria-label="PAYLOCA">
    <div className="launch-glow launch-glow-left" />
    <div className="launch-glow launch-glow-right" />
    <div className="launch-minimal-shell">
      <div className="launch-minimal-art" aria-hidden="true">
        <span className="launch-minimal-ring launch-minimal-ring-one" />
        <span className="launch-minimal-ring launch-minimal-ring-two" />
        <span className="launch-minimal-star launch-minimal-star-one">✦</span>
        <span className="launch-minimal-star launch-minimal-star-two">+</span>
      </div>
      <div className="launch-minimal-center">
        <div className="launch-brand">
          <span className="launch-brand-name">PAYLOCA</span>
        </div>
        <button type="button" className="launch-minimal-enter" onClick={onEnter} disabled={!ready} aria-label={ready ? 'Entrer dans PAYLOCA' : 'Préparation de PAYLOCA'}>
          {ready ? <ArrowRight size={18} /> : <span className="launch-minimal-loader" aria-hidden="true" />}
        </button>
      </div>
    </div>
  </main>;
}

function AppContent() {
  const [location, setLocation] = useLocation();
  const { isSignedIn } = usePaylocaAuth();
  const [showLaunchScreen, setShowLaunchScreen] = useState(true);
  useEffect(() => {
    const handleOnline = () => document.body.dataset.offline = 'false';
    const handleOffline = () => document.body.dataset.offline = 'true';
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => { window.removeEventListener('online', handleOnline); window.removeEventListener('offline', handleOffline); };
  }, []);
  const isAuthRoute = location.startsWith('/sign-in') || location.startsWith('/sign-up');
  return <QueryClientProvider client={queryClient}><TooltipProvider>{showLaunchScreen ? <LaunchScreen onEnter={() => { setShowLaunchScreen(false); setLocation('/fil'); }} /> : <><Router /><NotificationBootstrap />{isSignedIn && !isAuthRoute && <Onboarding />}<Toaster /></>}</TooltipProvider></QueryClientProvider>;
}

function App() {
  return <WouterRouter base={basePath}><FirebaseAuthProvider><AppContent /></FirebaseAuthProvider></WouterRouter>;
}

export default App;
