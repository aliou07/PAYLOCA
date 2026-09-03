import { useState, useMemo, useEffect, useRef, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useListServiceProviders,
  useListServiceOrders,
  useCreateServiceOrder,
  useCreateServiceReview,
  getListServiceProvidersQueryKey,
  getListServiceOrdersQueryKey
} from '@workspace/api-client-react';
import type { ServiceProvider, ServiceOrder } from '@workspace/api-client-react';
import { usePaylocaAuth } from '@/auth/firebaseAuth';
import { Link } from 'wouter';
import {
  ShieldCheck, Star, MapPin, Search, X, Loader2,
  CheckCircle2, AlertCircle
} from 'lucide-react';

function imageSource(path: string) {
  return path.startsWith('/objects/') ? `/api/storage${path}` : path;
}

function PageHeader() {
  return (
    <section className="home-hero ambient-grid relative overflow-hidden bg-muted">
      <div className="page-shell relative z-10 grid min-h-[320px] items-center gap-10 py-12 lg:py-16">
        <div className="max-w-2xl rise-in">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-bold uppercase tracking-[.15em] text-primary">
            <ShieldCheck size={14} /> Nouveau sur PAYLOCA
          </span>
          <h1 className="mt-5 font-display text-[clamp(2.5rem,5vw,4rem)] font-bold leading-[1.05] tracking-[-.04em] text-foreground">
            Services à domicile <span className="text-primary">certifiés.</span>
          </h1>
          <p className="mt-4 text-base leading-7 text-muted-foreground md:text-lg">
            Plomberie, électricité, ménage... Trouvez des professionnels certifiés près de chez vous, selon les informations vérifiées par PAYLOCA.
          </p>
        </div>
      </div>
    </section>
  );
}

function BaseModal({
  isOpen,
  onClose,
  title,
  children
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    if (isOpen) document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm transition-all duration-200">
      <div
        className="relative w-full max-w-lg overflow-hidden rounded-[22px] border border-border bg-card shadow-2xl rise-in"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border p-5">
          <h2 className="font-display text-lg font-bold text-foreground">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X size={18} />
          </button>
        </div>
        <div className="p-5">
          {children}
        </div>
      </div>
    </div>
  );
}

function OrderModal({
  provider,
  isOpen,
  onClose,
  isSignedIn
}: {
  provider: ServiceProvider | null;
  isOpen: boolean;
  onClose: () => void;
  isSignedIn: boolean;}) {
  const queryClient = useQueryClient();
  const createOrder = useCreateServiceOrder();

  const [service, setService] = useState('');
  const [details, setDetails] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setService('');
      setDetails('');
      setIsSuccess(false);
      createOrder.reset();
    }
  }, [isOpen]);

  if (!provider) return null;

  if (!isSignedIn) {
    return (
      <BaseModal isOpen={isOpen} onClose={onClose} title="Connexion requise">
        <div className="flex flex-col items-center text-center py-6 gap-4">
          <div className="grid size-16 place-items-center rounded-full bg-primary/10 text-primary mb-2">
            <ShieldCheck size={32} />
          </div>
          <p className="text-muted-foreground mb-4 text-sm leading-relaxed max-w-[280px]">
            Pour demander un service en toute sécurité, veuillez vous connecter à votre compte PAYLOCA.
          </p>
          <Link href="/sign-in" onClick={onClose} className="payloca-button w-full block text-center rounded-xl bg-primary px-6 py-3 font-bold text-primary-foreground">
            Se connecter
          </Link>
          <button onClick={onClose} className="mt-2 text-sm font-semibold text-muted-foreground hover:text-foreground">
            Annuler
          </button>
        </div>
      </BaseModal>
    );
  }

  if (isSuccess) {
    return (
      <BaseModal isOpen={isOpen} onClose={onClose} title="Demande envoyée">
        <div className="flex flex-col items-center text-center py-6 gap-4">
          <div className="grid size-16 place-items-center rounded-full bg-secondary/10 text-secondary mb-2">
            <CheckCircle2 size={32} />
          </div>
          <h3 className="font-display text-xl font-bold text-foreground">C'est noté !</h3>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Votre demande a été envoyée à <strong className="text-foreground">{provider.name}</strong>. Le prestataire vous contactera sous peu.
          </p>
          <button onClick={onClose} className="mt-4 w-full rounded-xl bg-foreground px-6 py-3 font-bold text-background">
            Terminer
          </button>
        </div>
      </BaseModal>
    );
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!service.trim() || createOrder.isPending) return;

    createOrder.mutate({
      data: {
        providerId: provider.id,
        service: service.trim(),
        details: details.trim() || undefined
      }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListServiceOrdersQueryKey() });
        setIsSuccess(true);
      }
    });
  };

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} title={`Demander à ${provider.name}`}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 flex gap-3 text-sm">
          <ShieldCheck size={20} className="text-primary shrink-0" />
          <p className="text-muted-foreground">
            Ce prestataire est affiché avec un statut certifié PAYLOCA. Les modalités et le prix final sont à convenir avant toute intervention.
          </p>
        </div>

        <div className="space-y-2">
          <label htmlFor="service-type" className="text-sm font-semibold text-foreground flex items-center gap-1.5">
            De quoi avez-vous besoin ? <span className="text-destructive">*</span>
          </label>
          <input
            id="service-type"
            type="text"
            required
            placeholder="Ex: Réparation d'une fuite d'eau"
            className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:border-primary"
            value={service}
            onChange={e => setService(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="service-details" className="text-sm font-semibold text-foreground">
            Détails supplémentaires <span className="text-muted-foreground font-normal">(Optionnel)</span>
          </label>
          <textarea
            id="service-details"
            rows={3}
            placeholder="Décrivez brièvement le problème..."
            className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:border-primary resize-none"
            value={details}
            onChange={e => setDetails(e.target.value)}
          />
        </div>

        {createOrder.isError && (
          <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive flex items-start gap-2">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <span>Une erreur est survenue lors de l'envoi de la demande. Veuillez réessayer.</span>
          </div>
        )}

        <button
          type="submit"
          disabled={!service.trim() || createOrder.isPending}
          className="payloca-button mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 font-bold text-primary-foreground disabled:opacity-50 disabled:pointer-events-none"
        >
          {createOrder.isPending ? <Loader2 size={18} className="animate-spin" /> : "Envoyer la demande"}
        </button>
      </form>
    </BaseModal>
  );
}

function ReviewModal({
  provider,
  isOpen,
  onClose,
  orders,
  isSignedIn
}: {
  provider: ServiceProvider | null;
  isOpen: boolean;
  onClose: () => void;
  orders: ServiceOrder[] | undefined;
  isSignedIn: boolean;
}) {
  const queryClient = useQueryClient();
  const createReview = useCreateServiceReview();

  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setRating(5);
      setComment('');
      setIsSuccess(false);
      createReview.reset();
    }
  }, [isOpen]);

  const pastOrder = useMemo(() => {
    if (!orders || !provider) return null;
    const providerOrders = orders.filter(o => o.providerId === provider.id && o.status === 'terminee');
    return providerOrders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  }, [orders, provider]);

  if (!provider || !isSignedIn) return null;

  if (isSuccess) {
    return (
      <BaseModal isOpen={isOpen} onClose={onClose} title="Avis publié">
        <div className="flex flex-col items-center text-center py-6 gap-4">
          <div className="grid size-16 place-items-center rounded-full bg-secondary/10 text-secondary mb-2">
            <Star size={32} className="fill-secondary" />
          </div>
          <h3 className="font-display text-xl font-bold text-foreground">Merci pour votre retour !</h3>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Votre avis aidera d'autres familles à trouver des professionnels de confiance sur PAYLOCA.
          </p>
          <button onClick={onClose} className="mt-4 w-full rounded-xl bg-foreground px-6 py-3 font-bold text-background">
            Fermer
          </button>
        </div>
      </BaseModal>
    );
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!pastOrder || createReview.isPending) return;

    createReview.mutate({
      id: provider.id,
      data: {
        orderId: pastOrder.id,
        rating,        comment: comment.trim() || undefined
      }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListServiceProvidersQueryKey() });
        setIsSuccess(true);
      }
    });
  };

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} title={`Évaluer ${provider.name}`}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <p className="text-sm text-muted-foreground">
          Vous avez récemment fait appel à ce prestataire pour : <strong className="text-foreground">{pastOrder?.service}</strong>. Comment s'est passée l'intervention ?
        </p>

        <div className="flex flex-col items-center gap-3">
          <span className="text-sm font-bold text-foreground">Votre note globale</span>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => setRating(star)}
                className="transition-transform hover:scale-110 active:scale-95"
              >
                <Star
                  size={36}
                  className={star <= rating ? "fill-secondary text-secondary" : "fill-transparent text-muted-foreground/30"}
                />
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor="review-comment" className="text-sm font-semibold text-foreground">
            Votre commentaire <span className="text-muted-foreground font-normal">(Optionnel)</span>
          </label>
          <textarea
            id="review-comment"
            rows={4}
            placeholder="Partagez votre expérience avec la communauté PAYLOCA..."
            className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:border-primary resize-none"
            value={comment}
            onChange={e => setComment(e.target.value)}
          />
        </div>

        {createReview.isError && (
          <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive flex items-start gap-2">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <span>Une erreur est survenue lors de l'envoi de l'avis.</span>
          </div>
        )}

        <button
          type="submit"
          disabled={createReview.isPending}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-foreground py-3.5 font-bold text-background disabled:opacity-50 disabled:pointer-events-none"
        >
          {createReview.isPending ? <Loader2 size={18} className="animate-spin" /> : "Publier l'avis"}
        </button>
      </form>
    </BaseModal>
  );
}

function ProviderSkeleton() {
  return (
    <div className="overflow-hidden rounded-[22px] border border-border bg-card">
      <div className="p-5 flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="size-14 shrink-0 animate-pulse rounded-xl bg-muted" />
          <div className="space-y-2 flex-1">
            <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
          </div>
        </div>
        <div className="h-6 w-1/3 animate-pulse rounded-full bg-muted" />
        <div className="space-y-2 mt-2">
          <div className="h-3 w-full animate-pulse rounded bg-muted" />
          <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
        </div>
      </div>
      <div className="border-t border-border p-4 space-y-3">
        <div className="flex justify-between">
          <div className="h-3 w-1/4 animate-pulse rounded bg-muted" />
          <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
        </div>
        <div className="h-10 w-full animate-pulse rounded-xl bg-muted" />
      </div>
    </div>
  );
}

function ProviderCard({
  provider,
  onOrder,
  onReview,
  canReview
}: {
  provider: ServiceProvider;
  onOrder: () => void;
  onReview: () => void;
  canReview: boolean;
}) {
  const photoUrl = provider.photo ? imageSource(provider.photo) : null;
  const initials = provider.name.substring(0, 2).toUpperCase();

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-[22px] border border-border bg-card/80 shadow-sm backdrop-blur-md transition-all hover:border-primary/50 hover:shadow-md">
      <div className="p-5 flex-1 flex flex-col gap-4">

        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            {photoUrl ? (
              <img src={photoUrl} alt={provider.name} className="size-14 rounded-xl object-cover bg-muted shrink-0" />
            ) : (
              <div className="grid size-14 shrink-0 place-items-center rounded-xl bg-muted font-display text-lg font-bold text-muted-foreground">
                {initials}
              </div>
            )}
            <div>
              <h3 className="font-display font-bold text-base text-foreground line-clamp-1">{provider.name}</h3>
              <p className="text-sm font-semibold text-secondary">{provider.category}</p>
            </div>
          </div>
        </div>

        {provider.certified && (
          <div className="inline-flex w-fit items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary border border-primary/20">
            <ShieldCheck size={14} /> PAYLOCA Certifié
          </div>
        )}

        <div className="text-sm text-muted-foreground flex flex-col gap-2">
          <div className="flex items-center gap-1.5">
            <MapPin size={15} className="text-primary shrink-0" /> <span className="line-clamp-1">{provider.city}, {provider.neighborhood}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Star size={15} className={`shrink-0 ${provider.rating > 0 ? "fill-secondary text-secondary" : "text-muted-foreground"}`} />
            {provider.rating > 0 ? (
              <span className="font-semibold text-foreground">{provider.rating.toFixed(1)} <span className="text-muted-foreground font-normal">({provider.reviewCount} avis)</span></span>
            ) : (
              <span>Nouveau</span>
            )}
          </div>
        </div>

        <p className="text-xs text-muted-foreground line-clamp-2 mt-auto">
          {provider.description}
        </p>
      </div>

      <div className="border-t border-border bg-muted/30 p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Tarif indicatif</span>
          <span className="font-bold text-foreground">{provider.priceFrom.toLocaleString('fr-FR')} FCFA</span>
        </div>

        <div className="flex flex-col gap-2">
          <button
            onClick={onOrder}
            disabled={!provider.available}
            className="payloca-button w-full rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50 disabled:pointer-events-none"
          >
            {provider.available ? "Demander ce service" : "Indisponible"}
          </button>

          {canReview && (
            <button
              onClick={onReview}
              className="w-full rounded-xl border border-border bg-transparent py-2 text-xs font-bold text-foreground hover:bg-muted transition-colors"
            >
              Laisser un avis
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ServicesPage() {
  const auth = usePaylocaAuth();
  const isSignedIn = auth?.isSignedIn ?? false;
  const isLoaded = auth?.isLoaded ?? true;

  const [searchCategory, setSearchCategory] = useState('');
  const [searchCity, setSearchCity] = useState('');

  const { data: providers, isLoading: providersLoading, isError: providersError, refetch: refetchProviders } = useListServiceProviders();

  const { data: orders } = useListServiceOrders({
    query: { queryKey: getListServiceOrdersQueryKey(), enabled: !!isSignedIn && isLoaded }
  });

  const filteredProviders = useMemo(() => {
    if (!providers) return [];
    return providers.filter(p => {
      const matchCat = searchCategory ? p.category.toLowerCase().includes(searchCategory.toLowerCase()) : true;
      const matchCity = searchCity ? p.city.toLowerCase() === searchCity.toLowerCase() : true;
      return matchCat && matchCity;
    });
  }, [providers, searchCategory, searchCity]);

  const [selectedProvider, setSelectedProvider] = useState<ServiceProvider | null>(null);
  const [activeModal, setActiveModal] = useState<'order' | 'review' | null>(null);

  const closeModals = () => {
    setActiveModal(null);
    setTimeout(() => setSelectedProvider(null), 200);
  };

  return (
    <>
      <PageHeader />

      <div className="page-shell py-12 md:py-16">
        <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Quelle catégorie de service recherchez-vous ? (ex: Plomberie)"
              className="w-full rounded-xl border border-border bg-card py-3 pl-11 pr-4 text-sm font-semibold text-foreground outline-none focus-visible:border-primary"
              value={searchCategory}
              onChange={(e) => setSearchCategory(e.target.value)}
            />
          </div>
          <div className="relative sm:w-64">
            <MapPin size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <select
              className="w-full rounded-xl border border-border bg-card py-3 pl-11 pr-4 text-sm font-semibold text-foreground outline-none focus-visible:border-primary appearance-none"
              value={searchCity}
              onChange={(e) => setSearchCity(e.target.value)}
            >
              <option value="">Toutes les villes</option>
              <option value="Niamey">Niamey</option>
              <option value="Maradi">Maradi</option>
              <option value="Zinder">Zinder</option>
              <option value="Agadez">Agadez</option>
              <option value="Tahoua">Tahoua</option>
            </select>
          </div>
        </div>

        {providersLoading ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => <ProviderSkeleton key={i} />)}
          </div>
        ) : providersError ? (
          <div className="rounded-[22px] border border-destructive/30 bg-destructive/10 p-8 text-center">
            <AlertCircle className="mx-auto text-destructive" size={30} />
            <h3 className="mt-3 font-display text-xl font-bold text-foreground">Erreur de chargement</h3>
            <p className="mt-1 text-sm text-muted-foreground">Impossible de charger les prestataires.</p>
            <button onClick={() => refetchProviders()} className="mt-5 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground">
              Réessayer
            </button>
          </div>
        ) : filteredProviders.length === 0 ? (
          <div className="rounded-[22px] border border-dashed border-border bg-card/50 p-10 text-center">
            <div className="mx-auto grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
              <Search size={24} />
            </div>
            <h3 className="mt-4 font-display text-xl font-bold text-foreground">Aucun résultat</h3>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              Nous n'avons trouvé aucun prestataire correspondant à votre recherche.
            </p>
            {(searchCategory || searchCity) && (
              <button onClick={() => { setSearchCategory(''); setSearchCity(''); }} className="mt-5 rounded-full border border-border px-5 py-2.5 text-sm font-bold text-foreground hover:bg-muted transition-colors">
                Réinitialiser les filtres
              </button>
            )}
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredProviders.map(provider => (
              <ProviderCard
                key={provider.id}
                provider={provider}
                onOrder={() => { setSelectedProvider(provider); setActiveModal('order'); }}
                onReview={() => { setSelectedProvider(provider); setActiveModal('review'); }}
                canReview={!!orders?.some(o => o.providerId === provider.id && o.status === 'terminee')}
              />
            ))}
          </div>
        )}
      </div>

      <OrderModal
        provider={activeModal === 'order' ? selectedProvider : null}
        isOpen={activeModal === 'order'}
        onClose={closeModals}
        isSignedIn={isSignedIn}
      />

      <ReviewModal        provider={activeModal === 'review' ? selectedProvider : null}
        isOpen={activeModal === 'review'}
        onClose={closeModals}
        orders={orders}
        isSignedIn={isSignedIn}
      />
    </>
  );
}
