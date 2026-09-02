import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type MouseEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { useCreateListing, useGetFeaturedListings, useGetListing, useListListings, getGetFeaturedListingsQueryKey, getGetListingQueryKey, getListListingsQueryKey } from '@workspace/api-client-react';
import type { Listing, ListingInput, ListListingsParams } from '@workspace/api-client-react';
import { ArrowRight, Bath, Check, ChevronLeft, CircleAlert, Crown, Download, Home as HomeIcon, Mail, MapPin, Menu, Phone, Plus, Search, ShieldCheck, Sparkles, Upload, X } from 'lucide-react';
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
  if (!IMAGE_TYPES.has(file.type)) {
    throw new Error('Utilisez une image JPG, PNG, WebP ou GIF.');
  }
  if (!file.size || file.size > MAX_IMAGE_SIZE) {
    throw new Error('La photo ne doit pas dépasser 10 Mo.');
  }
  const response = await authenticatedFetch('/api/storage/uploads/request-url', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: file.name,
      size: file.size,
      contentType: file.type,
    }),
  });
  const payload = await response.json().catch(() => ({})) as {
    error?: string;
    uploadURL?: string;
    objectPath?: string;
  };
  if (!response.ok || !payload.uploadURL || !payload.objectPath) {
    throw new Error(
      payload.error ?? 'Impossible de préparer l’envoi de cette photo.',
    );
  }
  const upload = await fetch(payload.uploadURL, {
    method: 'PUT',
    headers: {
      'Content-Type': file.type,
    },
    body: file,
  });
  if (!upload.ok) {
    throw new Error('Impossible d’envoyer cette photo. Réessayez.');
  }
  return payload.objectPath;
}
async function enhancePhoto(file: File): Promise<{
  file: File;
  originalUrl: string;
  enhancedUrl: string;
  blurScore: number;
}> {
  const originalUrl = URL.createObjectURL(file);
  const image = new Image();
  image.src = originalUrl;
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () =>
      reject(new Error('Cette image ne peut pas être analysée.'));
  });
  const max = 1200;
  const scale = Math.min(
    1,
    max / Math.max(image.naturalWidth, image.naturalHeight),
  );
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', {
    willReadFrequently: true,
  });
  if (!context) {
    throw new Error(
      'Votre navigateur ne permet pas d’améliorer cette image.',
    );
  }
  context.drawImage(image, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height);
  const source = new Uint8ClampedArray(pixels.data);
  let edgeEnergy = 0;
  const index = (x: number, y: number) => (y * width + x) * 4;
  for (let y = 1; y < height - 1; y += 3) {
    for (let x = 1; x < width - 1; x += 3) {
      const center = source[index(x, y)];
      edgeEnergy +=
        Math.abs(center - source[index(x - 1, y)])
        + Math.abs(center - source[index(x, y - 1)]);
    }
  }
  const samples = Math.max(
    1,
    Math.floor(width / 3) * Math.floor(height / 3),
  );
  const blurScore = Math.round(edgeEnergy / samples);
  const brightness = Array.from(
    {
      length: Math.floor(source.length / 4),
    },
    (_, i) =>
      (source[i * 4] + source[i * 4 + 1] + source[i * 4 + 2]) / 3,
  ).reduce((a, b) => a + b, 0) / Math.max(1, source.length / 4);
  const exposure = brightness < 78
    ? 1.2
    : brightness > 205
      ? 0.88
      : 1.05;
  for (let i = 0; i < pixels.data.length; i += 4) {
    const average =
      (source[i] + source[i + 1] + source[i + 2]) / 3;
    const contrast = 1.06;
    for (let channel = 0; channel < 3; channel++) {
      pixels.data[i + channel] = Math.max(
        0,
        Math.min(
          255,
          ((source[i + channel] - average) * 1.08 + average)
            * exposure
            * contrast,
        ),
      );
    }
  }
  context.putImageData(pixels, 0, 0);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.9),
  );
  if (!blob) {
    throw new Error('La version Pro n’a pas pu être créée.');
  }
  const enhancedFile = new File(
    [blob],
    file.name.replace(/\.[^.]+$/, '') + '-payloca-pro.jpg',
    {
      type: 'image/jpeg',
    },
  );
  return {
    file: enhancedFile,
    originalUrl,
    enhancedUrl: URL.createObjectURL(blob),
    blurScore,
  };
}
function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || '/'
    : path;
}
function displayName(user: { fullName: string } | null) {
  return user?.fullName || 'Utilisateur PAYLOCA';
}
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
  }>;
};
function useInstallPrompt() {
  const [installPrompt, setInstallPrompt] =
    useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(
    () =>
      window.matchMedia?.('(display-mode: standalone)').matches
      || Boolean(
        (navigator as Navigator & {
          standalone?: boolean;
        }).standalone,
      ),
  );
  const isIOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (
      navigator.platform === 'MacIntel'
      && navigator.maxTouchPoints > 1
    );
  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const handleInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
    };
    window.addEventListener(
      'beforeinstallprompt',
      handleBeforeInstallPrompt,
    );
    window.addEventListener('appinstalled', handleInstalled);
    return () => {
      window.removeEventListener(
        'beforeinstallprompt',
        handleBeforeInstallPrompt,
      );
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);
  const install = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice.catch(() => undefined);
    setInstallPrompt(null);
  };
  return {
    install,
    canInstall: Boolean(installPrompt),
    installed,
    isIOS,
  };
}
function PwaInstallButton({ compact = false }: { compact?: boolean }) {
  const {
    install,
    canInstall,
    installed,
    isIOS,
  } = useInstallPrompt();
  const [showIOSInstructions, setShowIOSInstructions] =
    useState(false);
  if (installed) return null;
  const handleInstall = async () => {
    if (isIOS && !canInstall) {
      setShowIOSInstructions((current) => !current);
      return;
    }
    await install();
  };
  return (
    <span
      className={
        compact
          ? 'flex w-full flex-col items-stretch'
          : 'inline-flex flex-col items-start'
      }
    >
      <button
        type="button"
        onClick={handleInstall}
        disabled={!canInstall && !isIOS}
        title={
          canInstall
            ? 'Installer PAYLOCA sur cet appareil'
            : isIOS
              ? 'Afficher les étapes d’installation sur iPhone'
              : 'L’installation sera proposée par votre navigateur'
        }
        data-testid="button-install-app"
        className={`${
          compact ? 'w-full justify-center' : ''
        } inline-flex items-center gap-2 rounded-full border border-[#0877d1] px-3 py-2 text-xs font-bold text-[#0877d1] transition-colors hover:bg-[#e3f3ff] disabled:cursor-not-allowed disabled:opacity-55`}
      >
        <Download size={14} /> Installer PAYLOCA
      </button>
      {showIOSInstructions && isIOS && (
        <span
          role="status"
          className="mt-2 max-w-[260px] rounded-xl border border-[#9bcff1] bg-[#edf8ff] p-3 text-xs font-semibold leading-5 text-[#075b8f]"
        >
          Sur iPhone : ouvrez le bouton Partager, choisissez
          « Sur l’écran d’accueil », puis appuyez sur « Ajouter ».
        </span>
      )}
    </span>
  );
}
function NotificationBootstrap() {
  const { isSignedIn, user } = usePaylocaAuth();
  useEffect(() => {
    if (
      !isSignedIn
      || !user?.id
      || !isFirebaseMessagingConfigured
    ) {
      return;
    }
    let disposed = false;
    let unsubscribe: (() => void) | undefined;
    const setup = async () => {
      const result = await enablePushNotifications((payload) => {
        if (
          document.visibilityState !== 'visible'
          || !('Notification' in window)
          || Notification.permission !== 'granted'
        ) {
          return;
        }
        const data = payload.data ?? {};
        new Notification(
          payload.notification?.title ?? 'Nouveau message PAYLOCA',
          {
            body:
              payload.notification?.body
              ?? data.body
              ?? 'Vous avez reçu un nouveau message.',
            icon: `${basePath}/payloca-app-icon-512.png`,
            data,
          },
        );
      }).catch(() => ({
        enabled: false as const,
        reason: 'setup-failed' as const,
      }));
      if (disposed) {
        if (result.enabled) {
          result.unsubscribe?.();
        }
        return;
      }
      if (!result.enabled) return;
      unsubscribe = result.unsubscribe;
      await authenticatedFetch('/api/push-tokens', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token: result.token,
        }),
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
    try {
      return JSON.parse(
        localStorage.getItem(FAVORITES_KEY) ?? '[]',
      ) as number[];
    } catch {
      return [];
    }
  });
  const toggle = (id: number) =>
    setFavorites((current) => {
      const next = current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id];
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
      return next;
    });
  return {
    favorites,
    toggle,
  };
}
function useFirstLaunch() {
  const [show, setShow] = useState(
    () => localStorage.getItem('payloca-onboarding-seen') !== 'true',
  );
  const finish = () => {
    localStorage.setItem('payloca-onboarding-seen', 'true');
    setShow(false);
  };
  return {
    show,
    finish,
  };
}
function isImportableListing(value: unknown): value is ListingInput {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.title === 'string'
    && item.title.length >= 3
    && (item.type === 'house' || item.type === 'shop')
    && typeof item.city === 'string'
    && typeof item.neighborhood === 'string'
    && typeof item.price === 'number'
    && Number.isFinite(item.price)
    && item.price >= 0
    && typeof item.bedrooms === 'number'
    && Number.isFinite(item.bedrooms)
    && item.bedrooms >= 0
    && typeof item.imageUrl === 'string'
    && typeof item.description === 'string'
    && typeof item.contact === 'string'
    && Boolean(normalizeNigerPhone(item.contact))
  );
}
function BackupControls() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState('');
  const allListings = useListListings(
    { type: 'all' },
    {
      query: {
        queryKey: getListListingsQueryKey({ type: 'all' }),
      },
    },
  );
  const createListing = useCreateListing();
  const client = useQueryClient();
  const exportBackup = () => {
    const backup = {
      app: 'PAYLOCA',
      exportedAt: new Date().toISOString(),
      listings: allListings.data ?? [],
    };
    const blob = new Blob(
      [JSON.stringify(backup, null, 2)],
      {
        type: 'application/json',
      },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `payloca-sauvegarde-${
      new Date().toISOString().slice(0, 10)
    }.json`;
    link.click();
    URL.revokeObjectURL(url);
    setMessage(
      `${backup.listings.length} annonce${
        backup.listings.length === 1 ? '' : 's'
      } exportée${
        backup.listings.length === 1 ? '' : 's'
      }.`,
    );
  };
  const importBackup = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      const rawListings = Array.isArray(parsed)
        ? parsed
        : (
          parsed
          && typeof parsed === 'object'
          && Array.isArray(
            (parsed as { listings?: unknown }).listings,
          )
            ? (parsed as { listings: unknown[] }).listings
            : []
        );
      const listings = rawListings
        .filter(isImportableListing)
        .map((item) => ({
          ...item,
          contact: normalizeNigerPhone(item.contact),
          price: Math.round(item.price),
          bedrooms: Math.round(item.bedrooms),
        }));
      if (!listings.length) {
        setMessage('Aucune annonce valide trouvée dans ce fichier.');
        return;
      }
      for (const listing of listings) {
        await createListing.mutateAsync({
          data: listing,
        });
      }
      await client.invalidateQueries({
        queryKey: getListListingsQueryKey(),
      });
      await client.invalidateQueries({
        queryKey: getGetFeaturedListingsQueryKey(),
      });
      setMessage(
        `${listings.length} annonce${
          listings.length === 1 ? '' : 's'
        } importée${
          listings.length === 1 ? '' : 's'
        } avec succès.`,
      );
    } catch {
      setMessage(
        'Impossible de lire ce fichier. Utilisez une sauvegarde PAYLOCA au format JSON.',
      );
    }
  };
  return (
    <div className="mt-5">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={exportBackup}
          disabled={allListings.isLoading}
          data-testid="button-export-backup"
          className="inline-flex items-center gap-2 rounded-full border border-[#536077] px-3 py-2 text-xs font-bold text-[#f7e8b4] transition-colors hover:bg-[#30394d] disabled:opacity-50"
        >
          <Download size={14} /> Exporter vers mon disque
        </button>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={createListing.isPending}
          data-testid="button-import-backup"
          className="inline-flex items-center gap-2 rounded-full border border-[#536077] px-3 py-2 text-xs font-bold text-[#f7e8b4] transition-colors hover:bg-[#30394d] disabled:opacity-50"
        >
          <Upload size={14} /> Importer une sauvegarde
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          onChange={importBackup}
          className="hidden"
          data-testid="input-import-backup"
        />
      </div>
      {message && (
        <p
          className="mt-3 text-xs text-[#bbc0c7]"
          role="status"
        >
          {message}
        </p>
      )}
    </div>
  );
}
function formatPrice(price: number) {
  return `${new Intl.NumberFormat('fr-FR').format(price)} F CFA`;
}
function Header() {
  const [open, setOpen] = useState(false);
  const [signOutError, setSignOutError] = useState('');
  const [revokingPushAccess, setRevokingPushAccess] =
    useState(false);
  const [location, setLocation] = useLocation();
  const {
    isSignedIn,
    user,
    accountType,
    membership,
    signOut,
  } = usePaylocaAuth();
  const handleSignOut = async () => {
    if (!user?.id || revokingPushAccess) return;
    setSignOutError('');
    setRevokingPushAccess(true);
    const response = await authenticatedFetch('/api/push-tokens', {
      method: 'DELETE',
      credentials: 'include',
    }).catch(() => null);
    if (!response?.ok) {
      setSignOutError(
        'Impossible de sécuriser vos notifications. Vérifiez votre connexion puis réessayez avant de vous déconnecter.',
      );
      setRevokingPushAccess(false);
      return;
    }
    await signOut();
  };
  const adultNav = [
    {
      href: '/',
      label: 'Accueil',
    },
    {
      href: '/annonces',
      label: 'Les annonces',
    },
    {
      href: '/services',
      label: 'Services à domicile',
    },
    {
      href: '/emplois',
      label: 'Emploi',
    },
    {
      href: '/boutique',
      label: 'Ma boutique',
    },
    {
      href: '/recherche',
      label: 'Rechercher',
    },
    {
      href: '/sos',
      label: 'SOS',
    },
    {
      href: '/ligue-payloca',
      label: 'Ligue PAYLOCA',
    },
    {
      href: '/appels',
      label: 'PAYLOCA CALLS',
    },
    {
      href: '/parrainage',
      label: 'Parrainage',
    },
    {
      href: '/aide',
      label: 'Aide',
    },
    {
      href: '/famille',
      label: 'Espace Famille',
    },
    {
      href: '/messages',
      label: 'Messages',
    },
    {
      href: '/abonnement',
      label: 'Mon abonnement',
    },
    {
      href: '/publier',
      label: 'Publier',
    },
  ];
  const userNav = [
    ...adultNav.filter(
      (item) => !['/boutique', '/publier'].includes(item.href),
    ),
    {
      href: '/fil',
      label: 'PAYLOCA FUN',
    },
  ];
  const agencyNav = adultNav;
  const ongNav = [
    {
      href: '/espace-ong',
      label: 'Espace ONG',
    },
    {
      href: '/recherche',
      label: 'Rechercher',
    },
    {
      href: '/fil',
      label: 'Fil communautaire',
    },
    {
      href: '/messages',
      label: 'Messages',
    },
    {
      href: '/aide',
      label: 'Aide',
    },
  ];
  const nav =
    accountType === 'agency'
      ? agencyNav
      : accountType === 'ong'
        ? ongNav
        : userNav;
   const accountHome =
    accountType === 'agency'
      ? '/espace-agence'
      : accountType === 'ong'
        ? '/espace-ong'
        : '/';
  return (
    <header className="sticky top-0 z-40 border-b border-[#dfd7c4] bg-[#f4efdf]/95 backdrop-blur-md">
      <div className="page-shell flex h-[72px] items-center justify-between gap-4">
        <Link
          href="/"
          className="group flex items-center gap-3"
          data-testid="link-logo"
        >
          <span className="relative grid size-10 place-items-center rounded-[13px] bg-[#20283c] text-[#f7e8b4] shadow-[0_0_26px_rgba(255,78,174,.28)]">
            <HomeIcon size={21} strokeWidth={2.4} />
            <span className="absolute -right-1 -top-1 size-2 rounded-full bg-[#b95740] shadow-[0_0_10px_rgba(255,78,174,.8)]" />
          </span>
          <span>
            <span className="block font-display text-[21px] font-bold leading-none tracking-[-.03em] text-[#20283c]">
              PAYLOCA
            </span>
            <span className="mt-1 block text-[10px] font-bold uppercase tracking-[.18em] text-[#b95740]">
              Trouver son chez-soi
            </span>
          </span>
        </Link>
        <nav
          className="hidden items-center gap-5 xl:gap-7 md:flex"
          aria-label="Navigation principale"
        >
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              data-testid={`link-nav-${item.label.toLowerCase().replaceAll(' ', '-')}`}
              className={`relative py-2 text-xs font-semibold transition-colors ${
                location === item.href
                  ? 'text-[#b95740]'
                  : 'text-[#596071] hover:text-[#20283c]'
              }`}
            >
              {item.label}
              {location === item.href && (
                <span className="absolute inset-x-0 -bottom-[1px] mx-auto h-0.5 w-5 rounded-full bg-[#e9b949]" />
              )}
            </Link>
          ))}
        </nav>
        <PwaInstallButton />
        {accountType === 'agency' && (
          <Link
            href="/publier"
            data-testid="link-header-publish"
            className="hidden items-center gap-2 rounded-full bg-[#b95740] px-4 py-2.5 text-sm font-bold text-[#fff7e8] shadow-[0_0_24px_rgba(255,78,174,.2)] transition-transform hover:-translate-y-0.5 active:translate-y-0 lg:flex"
          >
            <Plus size={16} /> Publier une annonce
          </Link>
        )}
        {isSignedIn ? (
          <div className="hidden items-center gap-2 lg:flex">
            {membership.plan === 'vip_or' && (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-[#e9b949] to-[#c9921f] px-2 py-1 text-[10px] font-extrabold text-[#20283c]"
                data-testid="badge-vip-or"
              >
                <Crown size={12} /> VIP OR
              </span>
            )}
            {membership.plan === 'vip_bronze' && (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-[#9da3ae] px-2 py-1 text-[10px] font-extrabold text-white"
                data-testid="badge-vip-bronze"
              >
                <Crown size={12} /> VIP BRONZE
              </span>
            )}
            <span className="max-w-28 truncate text-xs font-bold text-[#596071]">
              {displayName(user)}
            </span>
            <button
              type="button"
              onClick={handleSignOut}
              disabled={revokingPushAccess}
              className="rounded-full border border-[#d9cfbc] px-3 py-2 text-xs font-bold text-[#596071] hover:bg-[#ece3d0] disabled:opacity-60"
            >
              {revokingPushAccess
                ? 'Sécurisation...'
                : 'Déconnexion'}
            </button>
          </div>
        ) : (
          <Link
            href="/sign-in"
            className="hidden rounded-full border border-[#20283c] px-4 py-2 text-sm font-bold text-[#20283c] hover:bg-[#ece3d0] lg:block"
          >
            Connexion
          </Link>
        )}
        <button
          type="button"
          aria-label="Ouvrir le menu"
          data-testid="button-mobile-menu"
          onClick={() => setOpen(!open)}
          className="rounded-xl border border-[#d9cfbc] p-2 text-[#20283c] md:hidden"
        >
          {open ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>
      {open && (
        <div className="border-t border-[#dfd7c4] bg-[#f8f3e6] px-4 py-4 md:hidden">
          <nav className="page-shell flex flex-col gap-1">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                data-testid={`link-mobile-${item.label.toLowerCase().replaceAll(' ', '-')}`}
                className="rounded-xl px-4 py-3 font-semibold text-[#20283c] hover:bg-[#ece3d0]"
              >
                {item.label}
              </Link>
            ))}
            <PwaInstallButton compact />
            {isSignedIn && (
              <button
                type="button"
                onClick={handleSignOut}
                disabled={revokingPushAccess}
                className="rounded-xl px-4 py-3 text-left font-semibold text-[#b95740] hover:bg-[#ece3d0] disabled:opacity-60"
              >
                {revokingPushAccess
                  ? 'Sécurisation...'
                  : 'Déconnexion'}
              </button>
            )}
          </nav>
        </div>
      )}
      {signOutError && (
        <div
          role="alert"
          data-testid="push-revocation-error"
          className="border-t border-[#dca79b] bg-[#fff1ec] px-4 py-3 text-center text-sm font-semibold text-[#9d3526]"
        >
          {signOutError}
        </div>
      )}
    </header>
  );
}
function Footer() {
  return (
    <footer className="mt-20 bg-[#20283c] text-[#f6edda]">
      <div className="page-shell grid gap-10 py-12 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-xl bg-[#e9b949] text-[#20283c]">
              <HomeIcon size={18} />
            </span>
            <span className="font-display text-xl font-bold">
              PAYLOCA
            </span>
          </div>
          <p className="mt-4 max-w-xs text-sm leading-6 text-[#bbc0c7]">
            Des adresses fiables pour les familles et les commerçants du Niger.
          </p>
          <p className="mt-5 text-xs font-bold uppercase tracking-[.16em] text-[#e9b949]">
            Mes sauvegardes
          </p>
          <BackupControls />
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[.18em] text-[#e9b949]">
            Explorer
          </p>
          <div className="mt-4 flex flex-col gap-3 text-sm text-[#d5d4ce]">
            <Link href="/annonces" data-testid="link-footer-listings">
              Voir les annonces
            </Link>
            <Link href="/services" data-testid="link-footer-services">
              Services à domicile
            </Link>
            <Link href="/emplois" data-testid="link-footer-jobs">
              Offres d’emploi
            </Link>
            <Link href="/boutique" data-testid="link-footer-shop">
              Ma boutique
            </Link>
            <Link href="/publier" data-testid="link-footer-publish">
              Publier un bien
            </Link>
          </div>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[.18em] text-[#e9b949]">
            Notre promesse
          </p>
          <p className="mt-4 text-sm leading-6 text-[#bbc0c7]">
            Une plateforme simple, locale et vérifiée, pensée pour votre quotidien.
          </p>
          <div className="mt-6 flex flex-col gap-2 text-xs text-[#d5d4ce]">
            <Link href="/confidentialite">
              Politique de confidentialité
            </Link>
            <Link href="/conditions">
              Conditions d'utilisation
            </Link>
            <Link href="/a-propos">
              À propos
            </Link>
            <Link href="/sos">
              Préparation SOS
            </Link>
            <Link href="/favoris">
              Mes Favoris
            </Link>
            <Link href="/parametres">
              Paramètres
            </Link>
          </div>
        </div>
      </div>
      <div className="border-t border-[#3b4354]">
        <div className="page-shell py-4 text-xs text-[#9da3ae]">
          © 2024 PAYLOCA · Fait avec soin au Niger
        </div>
      </div>
    </footer>
  );
}
function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="noise-overlay min-h-[100dvh] bg-[#f4efdf] text-[#20283c]">
      <Header />
      <main>{children}</main>
      <Footer />
    </div>
  );
}
function ListingImage({
  listing,
  className = '',
}: {
  listing: Listing;
  className?: string;
}) {
  return (
    <div
      className={`relative overflow-hidden bg-[#d8c89f] ${className}`}
    >
      <img
        src={imageSource(listing.imageUrl)}
        alt={listing.title}
        className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
        onError={(event) => {
          event.currentTarget.style.display = 'none';
        }}
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#20283c]/35 via-transparent to-transparent" />
      {listing.verified && (
        <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-[#f8f3e6]/95 px-2.5 py-1 text-[11px] font-bold text-[#0877d1]">
          <BlueBadge size={14} /> Vérifié
        </span>
      )}
      <span className="absolute bottom-3 left-3 rounded-full bg-[#20283c]/90 px-2.5 py-1 text-[10px] font-bold text-[#f7e8b4]">
        Gratuit jusqu’au{' '}
        {new Date(listing.launchFreeUntil).toLocaleDateString('fr-FR')}
      </span>
    </div>
  );
}
function ListingCard({
  listing,
  featured = false,
}: {
  listing: Listing;
  featured?: boolean;
}) {
  const { favorites, toggle } = useFavorites();
  const isFavorite = favorites.includes(listing.id);
  const share = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const url = `${window.location.origin}/annonces/${listing.id}`;
    if (navigator.share) {
      void navigator.share({
        title: listing.title,
        text: 'Découvrez cette annonce sur PAYLOCA.',
        url,
      }).catch(() => undefined);
    } else {
      void navigator.clipboard?.writeText(url)
        .then(() => window.alert('Lien de l’annonce copié.'))
        .catch(() => window.alert(url));
    }
  };
  const report = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    window.alert('Merci, votre signalement a été pris en compte.');
  };
  return (
    <Link
      href={`/annonces/${listing.id}`}
      data-testid={`card-listing-${listing.id}`}
      className={`group block overflow-hidden rounded-[22px] border border-[#dfd7c4] bg-[#faf6ec] shadow-[0_5px_0_#e8deca] transition-all hover:-translate-y-1 hover:shadow-[0_9px_0_#e8deca] ${
        featured ? 'md:grid md:grid-cols-[1.04fr_1fr]' : ''
      }`}
    >
      <ListingImage
        listing={listing}
        className={featured ? 'h-64 md:h-full' : 'h-52'}
      />
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-[.16em] text-[#b95740]">
              {listing.type === 'house'
                ? 'Maison à louer'
                : 'Boutique à louer'}
            </span>
            <h3 className="mt-1 font-display text-[22px] font-bold leading-tight text-[#20283c]">
              {listing.title}
            </h3>
          </div>
          <span className="mt-1 rounded-full bg-[#f0dfae] px-2 py-1 text-[11px] font-bold text-[#685523]">
            {listing.city}
          </span>
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-sm text-[#687080]">
          <MapPin size={15} className="text-[#b95740]" />
          {listing.neighborhood}
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-[#e7dfcf] pt-4">
          <span className="text-lg font-bold text-[#20283c]">
            {formatPrice(listing.price)}
            <small className="ml-1 text-xs font-medium text-[#7a7f87]">
              /mois
            </small>
          </span>
          <span className="grid size-8 place-items-center rounded-full bg-[#20283c] text-[#f7e8b4] transition-transform group-hover:translate-x-1">
            <ArrowRight size={16} />
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              toggle(listing.id);
            }}
            className={`rounded-full px-3 py-1.5 text-xs font-bold ${
              isFavorite
                ? 'bg-[#f0dfae] text-[#685523]'
                : 'border border-[#d9cfbc] text-[#656878]'
            }`}
          >
            {isFavorite ? '♥ Enregistrée' : '♡ Favoris'}
          </button>
          <button
            type="button"
            onClick={share}
            className="rounded-full border border-[#d9cfbc] px-3 py-1.5 text-xs font-bold text-[#656878]"
          >
            Partager
          </button>
          <button
            type="button"
            onClick={report}
            className="rounded-full border border-[#d9cfbc] px-3 py-1.5 text-xs font-bold text-[#656878]"
          >
            Signaler
          </button>
        </div>
      </div>
    </Link>
  );
}
function ListingSkeleton({ featured = false }: { featured?: boolean }) {
  return (
    <div
      className={`overflow-hidden rounded-[22px] border border-[#dfd7c4] bg-[#faf6ec] ${
        featured ? 'md:grid md:grid-cols-2' : ''
      }`}
    >
      <div
        className={`animate-pulse bg-[#e5ddcd] ${
          featured ? 'h-64 md:h-full' : 'h-52'
        }`}
      />
      <div className="space-y-4 p-5">
        <div className="h-3 w-24 animate-pulse rounded bg-[#e5ddcd]" />
        <div className="h-7 w-3/4 animate-pulse rounded bg-[#e5ddcd]" />
        <div className="h-4 w-1/2 animate-pulse rounded bg-[#e5ddcd]" />
        <div className="h-5 w-2/3 animate-pulse rounded bg-[#e5ddcd]" />
      </div>
    </div>
  );
}
function QueryError({
  label,
  onRetry,
}: {
  label: string;
  onRetry: () => void;
}) {
  return (
    <div className="col-span-full rounded-[22px] border border-[#e4bbb0] bg-[#fff1eb] p-8 text-center">
      <CircleAlert
        className="mx-auto text-[#b95740]"
        size={30}
      />
      <h3 className="mt-3 font-display text-xl font-bold text-[#20283c]">
        Impossible de charger {label}
      </h3>
      <p className="mt-1 text-sm text-[#6e6c70]">
        Vérifiez votre connexion puis réessayez.
      </p>
      <button
        type="button"
        onClick={onRetry}
        data-testid="button-retry"
        className="mt-5 rounded-full bg-[#b95740] px-5 py-2.5 text-sm font-bold text-[#fff7e8] transition-transform hover:-translate-y-0.5"
      >
        Réessayer
      </button>
    </div>
  );
}
function EmptyListings({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`${
        compact ? '' : 'col-span-full'
      } rounded-[22px] border border-dashed border-[#cfc4ae] bg-[#f8f3e6] p-10 text-center`}
    >
      <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#f0dfae] text-[#8d7431]">
        <HomeIcon size={22} />
      </span>
      <h3 className="mt-4 font-display text-xl font-bold">
        Pas encore d’annonce ici
      </h3>
      <p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-[#727583]">
        Les nouvelles adresses arrivent bientôt. Vous pouvez être le premier à publier.
      </p>
      <Link
        href="/publier"
        data-testid="link-empty-publish"
        className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#20283c] px-5 py-2.5 text-sm font-bold text-[#f7e8b4]"
      >
        Publier une annonce <ArrowRight size={15} />
      </Link>
    </div>
  );
}
function Home() {
  const featuredQuery = useGetFeaturedListings({
    query: {
      queryKey: getGetFeaturedListingsQueryKey(),
    },
  });
  const featured = featuredQuery.data ?? [];
  const [searchType, setSearchType] =
    useState<'all' | 'house' | 'shop'>('all');
  const [searchCity, setSearchCity] = useState('');
  const [, setLocation] = useLocation();
  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    const params = new URLSearchParams();
    if (searchType !== 'all') {
      params.set('type', searchType);
    }
    if (searchCity) {
      params.set('city', searchCity);
    }
    setLocation(
      `/annonces${
        params.toString()
          ? `?${params.toString()}`
          : ''
      }`,
    );
  };
  return (
    <Shell>
      <section className="home-hero ambient-grid relative overflow-hidden bg-[#e8ddc6]">
        <div className="page-shell relative grid min-h-[520px] items-center gap-10 py-16 lg:grid-cols-[1.05fr_.95fr] lg:py-20">
          <div className="relative z-10 rise-in">
            <span className="inline-flex items-center gap-2 rounded-full border border-[#c9b987] bg-[#f7edcf]/70 px-3 py-1.5 text-xs font-bold uppercase tracking-[.15em] text-[#7b6530]">
              <span className="size-1.5 rounded-full bg-[#b95740] shadow-[0_0_12px_rgba(255,78,174,.9)]" />
              Bienvenue chez vous
            </span>
            <h1 className="mt-5 max-w-[650px] font-display text-[clamp(3rem,7vw,5.8rem)] font-bold leading-[.94] tracking-[-.055em] text-[#20283c]">
              Un bon toit,
              <br />
              <span className="text-[#b95740]">
                ça change tout.
              </span>
            </h1>
            <p className="mt-6 max-w-lg text-base leading-7 text-[#5f6370] md:text-lg">
              Trouvez une maison pour votre famille ou une boutique pour faire grandir votre activité, simplement.
            </p>
            <form
              onSubmit={submitSearch}
              className="search-panel mt-8 flex max-w-xl flex-col gap-2 rounded-[18px] border border-[#d1c4a5] bg-[#faf6ec] p-2 shadow-[0_6px_0_#d4c6a6] sm:flex-row"
            >
              <label className="flex flex-1 items-center gap-2 rounded-xl px-3 text-sm text-[#777776]">
                <Search size={18} className="text-[#b95740]" />
                <select
                  value={searchType}
                  onChange={(event) =>
                    setSearchType(
                      event.target.value as
                        | 'all'
                        | 'house'
                        | 'shop',
                    )
                  }
                  data-testid="select-home-type"
                  className="w-full bg-transparent py-3 font-semibold text-[#20283c] outline-none"
                >
                  <option value="all">
                    Maison ou boutique
                  </option>
                  <option value="house">
                    Maison
                  </option>
                  <option value="shop">
                    Boutique
                  </option>
                </select>
              </label>
              <label className="flex flex-1 items-center gap-2 rounded-xl border-t border-[#e5dccb] px-3 text-sm text-[#777776] sm:border-l sm:border-t-0">
                <MapPin size={17} className="text-[#b95740]" />
                <select
                  value={searchCity}
                  onChange={(event) =>
                    setSearchCity(event.target.value)
                  }
                  data-testid="select-home-city"
                  className="w-full bg-transparent py-3 font-semibold text-[#20283c] outline-none"
                >
                  <option value="">
                    Toute la ville
                  </option>
                  {cities.map((city) => (
                    <option key={city} value={city}>
                      {city}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="submit"
                data-testid="button-home-search"
                className="payloca-button rounded-xl bg-[#b95740] px-5 py-3 text-sm font-bold text-[#fff7e8] transition-colors hover:bg-[#a74d3a]"
              >
                Rechercher
              </button>
            </form>
          </div>
          <div className="hero-visual relative hidden min-h-[340px] lg:block rise-in-delay">
            <div className="absolute right-6 top-2 size-[330px] rounded-[46%_54%_50%_50%] bg-[#dfb65b]/45" />
            <div className="sahel-pattern absolute bottom-0 right-0 h-[285px] w-[380px] rounded-[44%_12%_12%_12%] bg-[#b95740] shadow-[14px_14px_0_#20283c]" />
            <div className="absolute bottom-[138px] right-[75px] h-[160px] w-[245px] rotate-[-2deg] border-[8px] border-b-0 border-[#f3d893] bg-[#d87854]">
              <div className="absolute -left-5 -top-[68px] border-x-[134px] border-b-[72px] border-x-transparent border-b-[#20283c]" />
              <div className="absolute left-[21px] top-[58px] h-[102px] w-[65px] border-[7px] border-b-0 border-[#20283c] bg-[#e8ddc6]" />
              <div className="absolute right-[22px] top-[73px] size-[45px] border-[6px] border-[#20283c] bg-[#f3d893]" />
            </div>
            <span className="absolute right-0 top-8 rotate-3 rounded-xl bg-[#20283c] px-4 py-3 font-display text-base text-[#f7e8b4] shadow-[5px_5px_0_#e9b949]">
              La maison qu'il vous faut.
            </span>
          </div>
        </div>
        <div className="absolute -bottom-12 -left-10 size-32 rounded-full border-[18px] border-[#e5cb7e]/50" />
      </section>
      <section className="page-shell py-16 md:py-20">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <span className="text-xs font-bold uppercase tracking-[.18em] text-[#b95740]">
              À découvrir maintenant
            </span>
            <h2 className="mt-2 font-display text-4xl font-bold tracking-[-.04em] text-[#20283c]">
              Des adresses qui ont du sens.
            </h2>
          </div>
          <Link
            href="/annonces"
            data-testid="link-view-all"
            className="inline-flex items-center gap-2 text-sm font-bold text-[#b95740]"
          >
            Voir toutes les annonces <ArrowRight size={16} />
          </Link>
        </div>
        <div className="mt-8 grid gap-5 md:grid-cols-2">
          {featuredQuery.isLoading ? (
            <>
              <ListingSkeleton featured />
              <ListingSkeleton />
            </>
          ) : featuredQuery.isError ? (
            <QueryError
              label="les annonces"
              onRetry={() => featuredQuery.refetch()}
            />
          ) : featured.length === 0 ? (
            <EmptyListings />
          ) : (
            featured
              .slice(0, 3)
              .map((listing, index) => (
                <ListingCard
                  key={listing.id}
                  listing={listing}
                  featured={index === 0}
                />
              ))
          )}
        </div>
      </section>
      <section className="trust-section bg-[#20283c] py-16 text-[#f7edda]">
        <div className="page-shell">
          <div className="max-w-xl">
            <span className="text-xs font-bold uppercase tracking-[.18em] text-[#e9b949]">
              Pourquoi PAYLOCA
            </span>
            <h2 className="mt-3 font-display text-4xl font-bold tracking-[-.04em]">
              Chercher un lieu.
              <br />
              <span className="text-[#d87854]">
                Trouver sa place.
              </span>
            </h2>
          </div>
          <div className="mt-10 grid gap-8 md:grid-cols-3">
            <div className="border-t border-[#4b5364] pt-5">
              <ShieldCheck
                className="text-[#e9b949]"
                size={24}
              />
              <h3 className="mt-4 font-display text-xl font-bold">
                Des annonces claires
              </h3>
              <p className="mt-2 text-sm leading-6 text-[#bbc0c7]">
                Des informations essentielles pour décider sans perdre de temps.
              </p>
            </div>
            <div className="border-t border-[#4b5364] pt-5">
              <MapPin
                className="text-[#e9b949]"
                size={24}
              />
              <h3 className="mt-4 font-display text-xl font-bold">
                Pensé pour le Niger
              </h3>
              <p className="mt-2 text-sm leading-6 text-[#bbc0c7]">
                Niamey, Maradi, Zinder et les quartiers que vous connaissez.
              </p>
            </div>
            <div className="border-t border-[#4b5364] pt-5">
              <Phone
                className="text-[#e9b949]"
                size={24}
              />
              <h3 className="mt-4 font-display text-xl font-bold">
                Un contact direct
              </h3>
              <p className="mt-2 text-sm leading-6 text-[#bbc0c7]">
                Échangez directement avec le propriétaire pour avancer sereinement.
              </p>
            </div>
          </div>
        </div>
      </section>
    </Shell>
  );
}
function ListingsPage() {
  const [location, setLocation] = useLocation();
  const initial = useMemo(
    () =>
      new URLSearchParams(
        location.split('?')[1] ?? '',
      ),
    [location],
  );
  const [type, setType] = useState<
    'all' | 'house' | 'shop'
  >(
    (initial.get('type') as
      | 'all'
      | 'house'
      | 'shop')
      || 'all',
  );
  const [city, setCity] = useState(
    initial.get('city') || '',
  );
  const [maxPrice, setMaxPrice] = useState(
    initial.get('maxPrice') || '',
  );
  const params = useMemo<ListListingsParams>(
    () => ({
      ...(type !== 'all' ? { type } : {}),
      ...(city ? { city } : {}),
      ...(maxPrice
        ? { maxPrice: Number(maxPrice) }
        : {}),
    }),
    [type, city, maxPrice],
  );
  const query = useListListings(params, {
    query: {
      queryKey: getListListingsQueryKey(params),
    },
  });
  const applyFilters = (event: FormEvent) => {
    event.preventDefault();
    const next = new URLSearchParams();
    if (type !== 'all') {
      next.set('type', type);
    }
    if (city) {
      next.set('city', city);
    }
    if (maxPrice) {
      next.set('maxPrice', maxPrice);
    }
    setLocation(
      `/annonces${
        next.toString()
          ? `?${next.toString()}`
          : ''
      }`,
    );
  };
  const clearFilters = () => {
    setType('all');
    setCity('');
    setMaxPrice('');
    setLocation('/annonces');
  };
  return (
    <Shell>
      <section className="border-b border-[#dfd7c4] bg-[#e8ddc6] py-12 md:py-16">
        <div className="page-shell">
          <span className="text-xs font-bold uppercase tracking-[.18em] text-[#b95740]">
            Le carnet des adresses
          </span>
          <h1 className="mt-2 font-display text-5xl font-bold tracking-[-.05em] text-[#20283c]">
            Toutes les annonces
          </h1>
          <p className="mt-3 max-w-lg text-[#676b76]">
            Une maison pour vivre, une boutique pour entreprendre. À vous de choisir.
          </p>
        </div>
      </section>
      <section className="page-shell py-8">
        <form
          onSubmit={applyFilters}
          className="rounded-[20px] border border-[#dfd7c4] bg-[#faf6ec] p-4 shadow-[0_4px_0_#e8deca]"
        >
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]">
            <label className="text-xs font-bold uppercase tracking-wider text-[#747272]">
              Je cherche
              <select
                value={type}
                onChange={(event) =>
                  setType(
                    event.target.value as
                      | 'all'
                      | 'house'
                      | 'shop',
                  )
                }
                data-testid="select-filter-type"
                className="mt-2 w-full rounded-xl border border-[#d9cfbc] bg-[#f4efdf] p-3 text-sm font-semibold normal-case tracking-normal text-[#20283c] outline-none focus:border-[#b95740]"
              >
                <option value="all">
                  Tout type de bien
                </option>
                <option value="house">
                  Une maison
                </option>
                <option value="shop">
                  Une boutique
                </option>
              </select>
            </label>
            <label className="text-xs font-bold uppercase tracking-wider text-[#747272]">
              Ville
              <select
                value={city}
                onChange={(event) =>
                  setCity(event.target.value)
                }
                data-testid="select-filter-city"
                className="mt-2 w-full rounded-xl border border-[#d9cfbc] bg-[#f4efdf] p-3 text-sm font-semibold normal-case tracking-normal text-[#20283c] outline-none focus:border-[#b95740]"
              >
                <option value="">
                  Toutes les villes
                </option>
                {cities.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-bold uppercase tracking-wider text-[#747272]">
              Budget maximum
              <input
                type="number"
                min="0"
                value={maxPrice}
                onChange={(event) =>
                  setMaxPrice(event.target.value)
                }
                data-testid="input-filter-max-price"
                placeholder="Ex. 250 000"
                className="mt-2 w-full rounded-xl border border-[#d9cfbc] bg-[#f4efdf] p-3 text-sm font-semibold normal-case tracking-normal text-[#20283c] outline-none placeholder:text-[#99958d] focus:border-[#b95740]"
              />
            </label>
            <div className="flex items-end gap-2">
              <button
                type="submit"
                data-testid="button-apply-filters"
                className="flex-1 rounded-xl bg-[#b95740] px-5 py-3 font-bold text-[#fff7e8] transition-colors hover:bg-[#a74d3a] md:flex-none"
              >
                Filtrer
              </button>
              <button
                type="button"
                onClick={clearFilters}
                data-testid="button-clear-filters"
                className="rounded-xl border border-[#d9cfbc] px-4 py-3 text-sm font-bold text-[#656878] hover:bg-[#f0e8d8]"
              >
                Effacer
              </button>
            </div>
          </div>
        </form>
        <div className="mt-10 flex items-end justify-between gap-3">
          <div>
            <span className="text-xs font-bold uppercase tracking-[.18em] text-[#b95740]">
              Résultats
            </span>
            <h2 className="mt-1 font-display text-3xl font-bold">
              {query.isLoading
                ? 'Recherche en cours'
                : `${query.data?.length ?? 0} adresse${
                    query.data?.length === 1
                      ? ''
                      : 's'
                  }`}
            </h2>
          </div>
          {(type !== 'all' || city || maxPrice) && (
            <span className="rounded-full bg-[#f0dfae] px-3 py-1 text-xs font-bold text-[#685523]">
              Filtres actifs
            </span>
          )}
        </div>
        <div className="mt-6 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {query.isLoading ? (
            [1, 2, 3].map((item) => (
              <ListingSkeleton key={item} />
            ))
          ) : query.isError ? (
            <QueryError
              label="les résultats"
              onRetry={() => query.refetch()}
            />
          ) : query.data?.length ? (
            query.data.map((listing) => (
              <ListingCard
                key={listing.id}
                listing={listing}
              />
            ))
          ) : (
            <EmptyListings />
          )}
        </div>
      </section>
    </Shell>
  );
}
function DetailPage() {
  const { id: rawId } = useParams<{ id: string }>();
  const id = Number(rawId);
  const valid = Number.isFinite(id) && id > 0;
  const [, setLocation] = useLocation();
  const client = useQueryClient();
  const [paymentNotice, setPaymentNotice] = useState('');
  const { user, membership } = usePaylocaAuth();
  const query = useGetListing(id, {
    query: {
      enabled: valid,
      queryKey: getGetListingQueryKey(id),
    },
  });
  useEffect(() => {
    if (!query.data) return;
    const contact = document.querySelector<HTMLAnchorElement>(
      `[data-testid="link-contact-owner-${id}"]`,
    );
    if (!contact) return;
    contact.href = `/messages?annonce=${id}`;
    contact.textContent = 'Discuter avec le propriétaire';
    const openChat = (event: Event) => {
      event.preventDefault();
      setLocation(`/messages?annonce=${id}`);
    };
    contact.addEventListener('click', openChat);
    const callButton = document.createElement('a');
    callButton.href = query.data.ownerId
      ? `/appels?recipient=${encodeURIComponent(
          query.data.ownerId,
        )}&name=${encodeURIComponent(
          query.data.ownerName,
        )}`
      : '#';
    callButton.textContent =
      `Appeler ${query.data.ownerName}`;
    callButton.className =
      'mt-3 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-[#20283c] px-5 py-3.5 text-sm font-bold text-[#20283c] hover:bg-[#ece3d0]';
    callButton.dataset.callOwner = 'true';
    contact.after(callButton);
    return () => {
      contact.removeEventListener('click', openChat);
      callButton.remove();
    };
  }, [id, query.data, setLocation]);
  useEffect(() => {
    const listing = query.data;
    if (
      !listing
      || !user
      || !listing.ownerId
      || listing.ownerId !== user.id
    ) {
      return;
    }
    const contact = document.querySelector<HTMLAnchorElement>(
      `[data-testid="link-contact-owner-${id}"]`,
    );
    if (
      !contact
      || contact.parentElement?.querySelector(
        '[data-owner-status-controls]',
      )
    ) {
      return;
    }
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
      button.className =
        'rounded-xl border border-[#d9cfbc] px-3 py-2.5 text-xs font-bold text-[#5e6370] hover:bg-[#f0e8d8]';
      button.addEventListener('click', async () => {
        if (button.disabled) return;
        button.disabled = true;
        button.textContent = 'Chargement...';
        try {
          const response = await authenticatedFetch(
            `/api/listings/${id}/status`,
            {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ status }),
            },
          );
          if (!response.ok) {
            throw new Error();
          }
          window.alert(
            `Annonce marquée comme ${
              status === 'vendu'
                ? 'vendue'
                : 'louée'
            }. Elle n’apparaîtra plus dans les recherches.`,
          );
          client.invalidateQueries({
            queryKey: getListListingsQueryKey(),
          });
          client.invalidateQueries({
            queryKey: getGetFeaturedListingsQueryKey(),
          });
          setLocation('/annonces');
        } catch {
          button.disabled = false;
          button.textContent = label;
          window.alert(
            'Impossible de modifier le statut de cette annonce.',
          );
        }
      });
      controls.append(button);
    });
    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.textContent = 'Modifier la description';
    editButton.className =
      'rounded-xl border border-[#d9cfbc] px-3 py-2.5 text-xs font-bold text-[#5e6370] hover:bg-[#f0e8d8]';
    editButton.addEventListener('click', async () => {
      const description = window.prompt(
        'Modifiez la description de votre annonce.',
        listing.description,
      );
      if (description === null || !description.trim()) {
        return;
      }
      editButton.disabled = true;
      try {
        const response = await authenticatedFetch(
          `/api/listings/${id}`,
          {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              description: description.trim(),
            }),
          },
        );
        if (!response.ok) {
          throw new Error();
        }
        await client.invalidateQueries({
          queryKey: getGetListingQueryKey(id), **…**
_This response is too long to display in full._
