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
