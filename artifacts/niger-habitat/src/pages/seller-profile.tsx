import { useState, useMemo, useEffect, useRef, type FormEvent, type ChangeEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetSellerProfile, getGetSellerProfileQueryKey,
  useGetMySellerProfile, getGetMySellerProfileQueryKey,
  useUpdateMySellerProfile,
  useGetMySellerVerificationRequest, getGetMySellerVerificationRequestQueryKey,
  useCreateSellerVerificationRequest,
  useCreateSellerReport,
  useListSellerVerificationRequests, getListSellerVerificationRequestsQueryKey,
  useModerateSellerVerificationRequest,
  useListSellerReports, getListSellerReportsQueryKey,
  useModerateSellerReport,
} from '@workspace/api-client-react';
import type { 
  Listing, 
  PublicSellerProfile, 
  SellerVerificationRequest, 
  SellerReport 
} from '@workspace/api-client-react';
import { usePaylocaAuth, authenticatedFetch } from '@/auth/firebaseAuth';
import { Link, useLocation } from 'wouter';
import { 
  ShieldCheck, MapPin, Store, AlertTriangle, CheckCircle, 
  X, Loader2, Image as ImageIcon, Camera, Flag, Edit3
} from 'lucide-react';

function imageSource(path: string | null | undefined) {
  if (!path) return '';
  return path.startsWith('/objects/') ? `/api/storage${path}` : path;
}

async function uploadImageFile(file: File): Promise<string> {
  const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
  const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
  if (!IMAGE_TYPES.has(file.type)) throw new Error('Utilisez une image JPG, PNG ou WebP.');
  if (file.size > MAX_IMAGE_SIZE) throw new Error('La photo ne doit pas dépasser 10 Mo.');
  const response = await authenticatedFetch('/api/storage/uploads/request-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.uploadURL || !payload.objectPath) {
    throw new Error(payload.error ?? 'Impossible de préparer l’envoi de cette photo.');
  }
  const upload = await fetch(payload.uploadURL, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
  if (!upload.ok) throw new Error('Impossible d’envoyer cette photo. Réessayez.');
  return payload.objectPath;
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
        className="relative w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden rounded-[22px] border border-border bg-card shadow-2xl rise-in"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border p-5 shrink-0">
          <h2 className="font-display text-lg font-bold text-foreground">{title}</h2>
          <button 
            type="button"
            onClick={onClose} 
            className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X size={18} />
          </button>
        </div>
        <div className="p-5 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}

function ImageUpload({ label, value, onChange, className }: { label: string, value?: string, onChange: (url: string) => void, className?: string }) {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  
  const handleFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setIsUploading(true);
    try {
      const path = await uploadImageFile(file);
      onChange(path);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  return (
    <div className={`relative flex flex-col items-center justify-center border border-dashed border-border rounded-xl bg-card overflow-hidden transition-colors hover:border-primary/50 hover:bg-muted/30 ${className}`}>
      {value ? (
        <>
          <img src={imageSource(value)} alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
            <label className="cursor-pointer payloca-button bg-primary/80 backdrop-blur-sm px-4 py-2 rounded-xl text-sm font-bold text-white flex items-center gap-2">
              <Camera size={16} /> Changer
              <input type="file" className="hidden" accept="image/jpeg,image/png,image/webp" onChange={handleFile} disabled={isUploading} />
            </label>
          </div>
        </>
      ) : (
        <label className="cursor-pointer flex flex-col items-center justify-center w-full h-full p-6 text-muted-foreground hover:text-foreground">
          {isUploading ? <Loader2 size={24} className="animate-spin mb-2 text-primary" /> : <ImageIcon size={24} className="mb-2" />}
          <span className="text-sm font-semibold text-center">{isUploading ? 'Envoi...' : label}</span>
          <input type="file" className="hidden" accept="image/jpeg,image/png,image/webp" onChange={handleFile} disabled={isUploading} />
        </label>
      )}
      {error && <div className="absolute bottom-2 left-2 right-2 bg-destructive/90 text-destructive-foreground text-xs p-1.5 rounded text-center">{error}</div>}
    </div>
  );
}

function ListingCard({ listing }: { listing: Listing & { photos?: { path: string }[] } }) {
  const photo = listing.imageUrl;
  return (
    <Link href={`/annonces/${listing.id}`} className="group block overflow-hidden rounded-[22px] border border-border bg-card hover:border-primary/50 transition-colors shadow-sm hover:shadow-md">
      <div className="aspect-square bg-muted relative">
        {photo ? (
          <img src={imageSource(photo)} alt={listing.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground"><ImageIcon size={32} /></div>
        )}
      </div>
      <div className="p-4">
        <h3 className="font-display font-bold text-foreground line-clamp-1">{listing.title}</h3>
        {listing.price !== null && (
          <p className="font-bold text-primary mt-1">{listing.price.toLocaleString('fr-FR')} FCFA</p>
        )}
        <p className="text-sm text-muted-foreground mt-2 flex items-center gap-1">
          <MapPin size={14} /> {listing.city}
        </p>
      </div>
    </Link>
  )
}

function ReportModal({ targetUserId, isOpen, onClose, isSignedIn }: { targetUserId: string, isOpen: boolean, onClose: () => void, isSignedIn: boolean }) {
  const createReport = useCreateSellerReport();
  const [reason, setReason] = useState<string>('fraude');
  const [details, setDetails] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setReason('fraude');
      setDetails('');
      setSuccess(false);
      createReport.reset();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  if (!isSignedIn) {
    return (
      <BaseModal isOpen={isOpen} onClose={onClose} title="Connexion requise">
         <div className="py-6 text-center flex flex-col items-center">
            <div className="size-16 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-4"><Flag size={32} /></div>
            <p className="text-muted-foreground mb-6">Vous devez être connecté pour signaler un vendeur.</p>
            <Link href="/sign-in" onClick={onClose} className="payloca-button px-6 py-3 rounded-xl bg-primary text-primary-foreground font-bold w-full text-center block">Se connecter</Link>
         </div>
      </BaseModal>
    );
  }

  if (success) {
    return (
      <BaseModal isOpen={isOpen} onClose={onClose} title="Signalement envoyé">
         <div className="py-6 text-center flex flex-col items-center">
            <div className="size-16 rounded-full bg-green-500/10 text-green-500 flex items-center justify-center mb-4"><CheckCircle size={32} /></div>
            <p className="text-foreground font-bold text-lg mb-2">Merci pour votre vigilance.</p>
            <p className="text-muted-foreground text-sm mb-6">Notre équipe de modération va examiner ce profil dans les plus brefs délais.</p>
            <button onClick={onClose} className="px-6 py-3 rounded-xl bg-foreground text-background font-bold w-full">Fermer</button>
         </div>
      </BaseModal>
    );
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (createReport.isPending) return;
    createReport.mutate({
      data: {
        targetUserId,
        reason: reason as any,
        details: details.trim() || undefined
      }
    }, {
      onSuccess: () => {
         setSuccess(true);
      }
    });
  }

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} title="Signaler ce vendeur">
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
         <div className="p-4 rounded-xl border border-destructive/20 bg-destructive/5 text-sm text-destructive flex gap-3">
           <AlertTriangle size={20} className="shrink-0 mt-0.5" />
           <p>Un signalement abusif peut entraîner la suspension de votre propre compte. Ne signalez que les comportements répréhensibles.</p>
         </div>
         
         <div className="space-y-2">
           <label className="text-sm font-semibold text-foreground">Raison du signalement</label>
           <select 
             value={reason} 
             onChange={e => setReason(e.target.value)}
             className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:border-primary appearance-none"
           >
             <option value="fraude">Fraude ou Arnaque</option>
             <option value="fausse_annonce">Fausse annonce / Usurpation</option>
             <option value="harcelement">Harcèlement / Comportement abusif</option>
             <option value="autre">Autre</option>
           </select>
         </div>
         
         <div className="space-y-2">
           <label className="text-sm font-semibold text-foreground flex justify-between">
             <span>Détails (Optionnel)</span>
             <span className="text-xs text-muted-foreground">{details.length}/1000</span>
           </label>
           <textarea 
             value={details} 
             onChange={e => setDetails(e.target.value)}
             maxLength={1000}
             rows={4}
             placeholder="Veuillez décrire le problème..."
             className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:border-primary resize-none"
           />
         </div>

         {createReport.isError && (
           <p className="text-sm text-destructive">Une erreur est survenue. Veuillez réessayer.</p>
         )}

         <button type="submit" disabled={createReport.isPending} className="mt-2 w-full bg-destructive text-destructive-foreground font-bold rounded-xl py-3.5 flex justify-center items-center border border-destructive/50 transition-colors hover:brightness-110 disabled:opacity-50">
           {createReport.isPending ? <Loader2 size={18} className="animate-spin" /> : 'Envoyer le signalement'}
         </button>
      </form>
    </BaseModal>
  )
}

function PublicProfile({ userId }: { userId: string }) {
  const { data, isLoading, isError } = useGetSellerProfile(userId);
  const auth = usePaylocaAuth();
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [, setLocation] = useLocation();

  if (isLoading) return <div className="py-32 text-center"><Loader2 size={40} className="animate-spin mx-auto text-primary" /></div>;
  if (isError || !data) return (
    <div className="page-shell py-32 text-center">
      <AlertTriangle size={64} className="mx-auto text-destructive mb-6" />
      <h2 className="text-2xl font-display font-bold text-foreground mb-4">Profil introuvable</h2>
      <p className="text-muted-foreground mb-8">Ce vendeur n'existe pas ou a été suspendu.</p>
      <button onClick={() => setLocation('/')} className="payloca-button px-8 py-3 rounded-xl bg-primary text-primary-foreground font-bold inline-block">Retour à l'accueil</button>
    </div>
  );

  const { profile, shop, listings } = data;
  const isOwner = auth.user?.id === userId;

  return (
    <div className="pb-20">
      <div className="h-56 md:h-[340px] bg-muted relative">
        {shop.bannerUrl ? (
          <img src={imageSource(shop.bannerUrl)} alt="Bannière" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full ambient-grid bg-gradient-to-r from-primary/10 to-secondary/10" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
      </div>

      <div className="page-shell relative -mt-32 md:-mt-40 z-10">
        <div className="glass-panel p-6 md:p-10 rounded-[32px] flex flex-col md:flex-row gap-8 items-start">
          <div className="size-28 md:size-40 rounded-[28px] bg-card border border-border overflow-hidden shrink-0 shadow-sm">
            {profile.avatarUrl ? (
              <img src={imageSource(profile.avatarUrl)} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-muted text-muted-foreground text-4xl font-display font-bold uppercase">
                {profile.displayName.substring(0, 2)}
              </div>
            )}
          </div>
          
          <div className="flex-1 min-w-0 pt-2 md:pt-4">
            <h1 className="font-display text-3xl md:text-5xl font-bold text-foreground truncate tracking-tight">{shop.name || profile.displayName}</h1>
            <p className="text-lg md:text-xl text-secondary font-semibold mt-2">{profile.displayName}</p>
            
            <div className="flex flex-wrap items-center gap-4 mt-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5"><MapPin size={18} className="text-primary" /> {profile.city}</span>
              {shop.categories?.length > 0 && (
                 <span className="flex flex-wrap gap-2">
                   {shop.categories.map((c: string) => (
                     <span key={c} className="px-3 py-1 rounded-full border border-border bg-muted/50 text-xs font-bold text-foreground">{c}</span>
                   ))}
                 </span>
              )}
            </div>

            {profile.verificationStatus === 'approved' && (
              <div className="mt-6 p-5 rounded-2xl border border-primary/30 bg-primary/10 flex items-start gap-4 rise-in">
                <ShieldCheck size={24} className="text-primary shrink-0 mt-0.5" />
                <p className="text-sm text-primary-foreground/80 leading-relaxed dark:text-muted-foreground">
                  <strong className="text-primary dark:text-foreground block mb-1">Profil vérifié par PAYLOCA</strong>
                  Notre équipe a examiné manuellement ce profil et l’a approuvé. Ce n’est pas une garantie de paiement : restez vigilant lors de vos transactions.
                </p>
              </div>
            )}

            <div className="mt-8">
              <h3 className="text-sm font-bold text-foreground mb-3 uppercase tracking-wider text-muted-foreground">À propos de la boutique</h3>
              <p className="text-foreground text-base whitespace-pre-wrap leading-relaxed max-w-3xl">
                {shop.description || profile.bio || "Aucune description fournie."}
              </p>
            </div>
          </div>
          
          <div className="w-full md:w-auto flex flex-col gap-3 shrink-0 pt-2 md:pt-4">
             {isOwner ? (
                <Link href="/vendeur" className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl border border-border bg-card font-bold text-foreground hover:bg-muted transition-colors">
                  <Edit3 size={18} /> Modifier le profil
                </Link>
             ) : (
                <button onClick={() => setReportModalOpen(true)} className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl border border-destructive/30 bg-destructive/10 text-destructive font-bold hover:bg-destructive/20 transition-colors">
                  <Flag size={18} /> Signaler
                </button>
             )}
          </div>
        </div>
        
        <div className="mt-16">
           <h2 className="font-display text-2xl md:text-3xl font-bold text-foreground mb-8 flex items-center gap-3">
             <Store className="text-primary" size={28} /> Annonces actives <span className="text-muted-foreground text-xl">({listings?.length || 0})</span>
           </h2>
           {listings && listings.length > 0 ? (
             <div className="grid gap-6 grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
               {listings.map(l => <ListingCard key={l.id} listing={l} />)}
             </div>
           ) : (
             <div className="py-24 text-center border border-dashed border-border rounded-3xl bg-card/30">
               <Store size={48} className="mx-auto text-muted-foreground mb-4" />
               <p className="text-muted-foreground text-lg">Aucune annonce active pour le moment.</p>
             </div>
           )}
        </div>
      </div>
      
      <ReportModal 
        targetUserId={userId} 
        isOpen={reportModalOpen} 
        onClose={() => setReportModalOpen(false)} 
        isSignedIn={auth.isSignedIn} 
      />
    </div>
  )
}

function OwnerProfileEditor() {
  const auth = usePaylocaAuth();
  const userId = auth.user?.id ?? 'anonymous';
  const myProfileQueryKey = [...getGetMySellerProfileQueryKey(), userId];
  const { data, isLoading } = useGetMySellerProfile({
    query: { queryKey: myProfileQueryKey },
  });
  const updateProfile = useUpdateMySellerProfile();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    displayName: '',
    bio: '',
    city: 'Niamey',
    avatarUrl: '',
    shopName: '',
    shopDescription: '',
    bannerUrl: '',
    categories: [] as string[]
  });
  
  const [catInput, setCatInput] = useState('');
  const initializedForId = useRef<string | null>(null);

  useEffect(() => {
    if (data && initializedForId.current !== data.profile.userId) {
      initializedForId.current = data.profile.userId;
      setFormData({
        displayName: data.profile.displayName || '',
        bio: data.profile.bio || '',
        city: data.profile.city || 'Niamey',
        avatarUrl: data.profile.avatarUrl || '',
        shopName: data.shop.name || '',
        shopDescription: data.shop.description || '',
        bannerUrl: data.shop.bannerUrl || '',
        categories: data.shop.categories || []
      });
    }
  }, [data]);

  if (isLoading) return <div className="py-20 text-center"><Loader2 size={32} className="animate-spin mx-auto text-primary" /></div>;

  const handleAddCat = (e: React.KeyboardEvent | React.FocusEvent) => {
    if ('key' in e && e.key !== 'Enter') return;
    e.preventDefault();
    const val = catInput.trim();
    if (val && val.length >= 2 && val.length <= 40 && formData.categories.length < 6 && !formData.categories.includes(val)) {
      setFormData(prev => ({ ...prev, categories: [...prev.categories, val] }));
    }
    setCatInput('');
  };

  const removeCat = (cat: string) => {
    setFormData(prev => ({ ...prev, categories: prev.categories.filter(c => c !== cat) }));
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (updateProfile.isPending) return;
    updateProfile.mutate({ data: formData }, {
      onSuccess: (res) => {
        queryClient.setQueryData(myProfileQueryKey, res);
        queryClient.invalidateQueries({ queryKey: getGetSellerProfileQueryKey(res.profile.userId) });
        alert('Profil mis à jour avec succès.');
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="glass-panel p-6 md:p-10 rounded-[32px] space-y-10 rise-in">
       <div className="flex flex-col md:flex-row gap-10">
         <div className="flex-1 space-y-8">
           <div>
             <h3 className="font-display text-xl font-bold text-foreground border-b border-border pb-3 mb-6">Informations Publiques</h3>
             
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
               <div className="space-y-2">
                 <label className="text-sm font-semibold text-foreground">Nom d'affichage <span className="text-destructive">*</span></label>
                 <input required minLength={2} maxLength={80} type="text" className="w-full rounded-xl border border-border bg-background px-4 py-3.5 text-sm outline-none focus:border-primary" value={formData.displayName} onChange={e => setFormData({...formData, displayName: e.target.value})} placeholder="Votre nom" />
               </div>
               <div className="space-y-2">
                 <label className="text-sm font-semibold text-foreground">Ville <span className="text-destructive">*</span></label>
                 <select required className="w-full rounded-xl border border-border bg-background px-4 py-3.5 text-sm outline-none focus:border-primary appearance-none" value={formData.city} onChange={e => setFormData({...formData, city: e.target.value})}>
                   <option value="Niamey">Niamey</option>
                   <option value="Maradi">Maradi</option>
                   <option value="Zinder">Zinder</option>
                   <option value="Agadez">Agadez</option>
                   <option value="Tahoua">Tahoua</option>
                 </select>
               </div>
             </div>

             <div className="space-y-2">
               <label className="text-sm font-semibold text-foreground">Bio (Optionnel)</label>
               <textarea maxLength={500} rows={3} className="w-full rounded-xl border border-border bg-background px-4 py-3.5 text-sm outline-none focus:border-primary resize-none" value={formData.bio} onChange={e => setFormData({...formData, bio: e.target.value})} placeholder="Décrivez-vous brièvement..." />
             </div>
           </div>

           <div>
             <h3 className="font-display text-xl font-bold text-foreground border-b border-border pb-3 mb-6">Votre Boutique</h3>

             <div className="space-y-6">
               <div className="space-y-2">
                 <label className="text-sm font-semibold text-foreground">Nom de la boutique <span className="text-destructive">*</span></label>
                 <input required minLength={2} maxLength={100} type="text" className="w-full rounded-xl border border-border bg-background px-4 py-3.5 text-sm outline-none focus:border-primary" value={formData.shopName} onChange={e => setFormData({...formData, shopName: e.target.value})} placeholder="Ex: Boutique Al-Ihsan" />
               </div>

               <div className="space-y-2">
                 <label className="text-sm font-semibold text-foreground flex justify-between">
                   <span>Description de la boutique <span className="text-destructive">*</span></span>
                   <span className="text-xs text-muted-foreground">{formData.shopDescription.length}/700</span>
                 </label>
                 <textarea required maxLength={700} rows={5} className="w-full rounded-xl border border-border bg-background px-4 py-3.5 text-sm outline-none focus:border-primary resize-none" value={formData.shopDescription} onChange={e => setFormData({...formData, shopDescription: e.target.value})} placeholder="Que proposez-vous ?" />
               </div>

               <div className="space-y-2">
                 <label className="text-sm font-semibold text-foreground">Catégories (Max 6)</label>
                 <div className="flex flex-wrap gap-2 mb-3">
                   {formData.categories.map(c => (
                     <span key={c} className="flex items-center gap-1 px-3 py-1.5 rounded-full border border-primary/30 bg-primary/10 text-primary text-sm font-bold">
                       {c} <button type="button" onClick={() => removeCat(c)} className="hover:text-foreground ml-1"><X size={14} /></button>
                     </span>
                   ))}
                 </div>
                 <input type="text" disabled={formData.categories.length >= 6} className="w-full rounded-xl border border-border bg-background px-4 py-3.5 text-sm outline-none focus:border-primary disabled:opacity-50" value={catInput} onChange={e => setCatInput(e.target.value)} onKeyDown={handleAddCat} onBlur={handleAddCat} placeholder={formData.categories.length >= 6 ? "Maximum atteint" : "Ex: Vêtements (Appuyez sur Entrée)"} />
               </div>
             </div>
           </div>
         </div>
         
         <div className="w-full md:w-72 space-y-8">
           <div className="space-y-3">
             <label className="text-sm font-semibold text-foreground block">Avatar</label>
             <ImageUpload label="Ajouter un avatar" value={formData.avatarUrl} onChange={url => setFormData({...formData, avatarUrl: url})} className="w-full aspect-square rounded-[24px]" />
           </div>
           <div className="space-y-3">
             <label className="text-sm font-semibold text-foreground block">Bannière boutique</label>
             <ImageUpload label="Ajouter une bannière" value={formData.bannerUrl} onChange={url => setFormData({...formData, bannerUrl: url})} className="w-full aspect-[2/1] rounded-[24px]" />
           </div>
         </div>
       </div>

       <div className="flex items-center justify-between pt-8 border-t border-border">
          <Link href={`/profil/${data?.profile.userId}`} className="text-sm font-bold text-secondary hover:text-foreground transition-colors">
           Voir mon profil public
         </Link>
         <button type="submit" disabled={updateProfile.isPending} className="payloca-button px-10 py-3.5 rounded-xl bg-primary text-primary-foreground font-bold flex items-center gap-2">
           {updateProfile.isPending ? <Loader2 size={18} className="animate-spin" /> : 'Enregistrer'}
         </button>
       </div>
    </form>
  )
}

function OwnerVerificationPanel() {
  const auth = usePaylocaAuth();
  const userId = auth.user?.id ?? 'anonymous';
  const verificationQueryKey = [...getGetMySellerVerificationRequestQueryKey(), userId];
  const { data: request, isLoading } = useGetMySellerVerificationRequest({
    query: { queryKey: verificationQueryKey },
  });
  const createReq = useCreateSellerVerificationRequest();
  const queryClient = useQueryClient();
  const [details, setDetails] = useState('');
  
  if (isLoading) return <div className="py-20 text-center"><Loader2 size={32} className="animate-spin mx-auto text-primary" /></div>;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (createReq.isPending || details.length < 20) return;
    createReq.mutate({ data: { details } }, {
      onSuccess: (res) => {
        queryClient.setQueryData(verificationQueryKey, res);
        setDetails('');
      }
    });
  };

  const statusLabel = {
    pending: { label: 'En cours d\'examen', color: 'text-secondary bg-secondary/10 border-secondary/30' },
    approved: { label: 'Approuvé', color: 'text-primary bg-primary/10 border-primary/30' },
    rejected: { label: 'Rejeté', color: 'text-destructive bg-destructive/10 border-destructive/30' }
  };

  return (
    <div className="glass-panel p-8 md:p-12 rounded-[32px] max-w-3xl mx-auto rise-in">
      <div className="mb-10 text-center">
        <div className="size-20 rounded-[24px] bg-primary/10 text-primary flex items-center justify-center mx-auto mb-6"><ShieldCheck size={40} /></div>
        <h2 className="font-display text-3xl font-bold text-foreground">Vérification de Profil</h2>
        <p className="text-muted-foreground mt-4 text-base leading-relaxed max-w-xl mx-auto">
          La vérification est un service <strong>gratuit</strong> proposé par PAYLOCA. Notre équipe examine manuellement votre demande et les informations publiques de votre profil, puis peut l’approuver ou la refuser.
        </p>
      </div>

      {request ? (
        <div className="p-8 rounded-[24px] border border-border bg-card/50 text-center space-y-6">
          <h3 className="font-bold text-foreground text-xl">Dernière demande de vérification</h3>
          <div className={`inline-flex items-center gap-2 px-5 py-2 rounded-full text-sm font-bold border ${statusLabel[request.status].color}`}>
             {statusLabel[request.status].label}
          </div>
          <p className="text-sm text-muted-foreground">Demande effectuée le {new Date(request.createdAt).toLocaleDateString('fr-FR')}</p>
          {request.status === 'rejected' && request.moderationNote && (
            <div className="mt-6 p-5 rounded-2xl border border-destructive/20 bg-destructive/5 text-destructive text-sm text-left">
              <strong className="block mb-2 text-base">Motif du refus :</strong>
              <p className="leading-relaxed">{request.moderationNote}</p>
            </div>
          )}
          {request.status === 'rejected' && (
            <button onClick={() => queryClient.setQueryData(verificationQueryKey, null)} className="mt-6 payloca-button px-8 py-3 rounded-xl bg-primary text-primary-foreground font-bold inline-block">
              Soumettre une nouvelle demande
            </button>
          )}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-foreground flex justify-between">
              <span>Détails de votre activité <span className="text-destructive">*</span></span>
              <span className="text-xs text-muted-foreground">{details.length}/1000</span>
            </label>
            <textarea required minLength={20} maxLength={1000} rows={5} className="w-full rounded-xl border border-border bg-background px-4 py-3.5 text-sm outline-none focus:border-primary resize-none" placeholder="Présentez brièvement votre activité, votre ville et les informations publiques utiles à l’examen manuel de votre demande..." value={details} onChange={e => setDetails(e.target.value)} />
            <p className="text-xs text-muted-foreground">Minimum 20 caractères. N’ajoutez pas de téléphone, d’e-mail ni de lien dans cette demande.</p>
          </div>
          
          <button type="submit" disabled={createReq.isPending || details.length < 20} className="w-full payloca-button py-4 rounded-xl bg-primary text-primary-foreground font-bold flex items-center justify-center gap-2 disabled:opacity-50">
            {createReq.isPending ? <Loader2 size={18} className="animate-spin" /> : 'Demander la vérification'}
          </button>
        </form>
      )}
    </div>
  )
}

function ModVerificationRequests() {
  const auth = usePaylocaAuth();
  const userId = auth.user?.id ?? 'anonymous';
  const { data, isLoading } = useListSellerVerificationRequests(undefined, {
    query: { queryKey: [...getListSellerVerificationRequestsQueryKey(), userId] },
  });
  const moderate = useModerateSellerVerificationRequest();
  const queryClient = useQueryClient();

  if (isLoading) return <div className="py-20 text-center"><Loader2 size={32} className="animate-spin mx-auto text-primary" /></div>;

  const handleModerate = (id: number, status: 'approved' | 'rejected', reason?: string) => {
    if (status === 'rejected' && !reason) {
      alert("Veuillez fournir une raison pour le rejet.");
      return;
    }
    moderate.mutate({ id, data: { status, moderationNote: reason } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListSellerVerificationRequestsQueryKey() });
      }
    });
  };

  const pending = data?.filter(r => r.status === 'pending') || [];

  return (
    <div className="space-y-6 rise-in">
      <h2 className="font-display text-2xl font-bold text-foreground">Demandes de vérification en attente ({pending.length})</h2>
      {pending.length === 0 ? (
        <div className="p-12 rounded-[24px] border border-dashed border-border text-center text-muted-foreground text-lg">Aucune demande en attente.</div>
      ) : (
        <div className="grid gap-6">
          {pending.map(req => (
             <div key={req.id} className="p-6 rounded-[24px] border border-border bg-card flex flex-col gap-5 shadow-sm">
               <div className="flex justify-between items-start gap-4">
                 <div>
                   <p className="text-sm font-bold text-primary mb-2">Utilisateur: {req.userId}</p>
                   <p className="text-base text-foreground whitespace-pre-wrap leading-relaxed bg-background/50 p-4 rounded-xl border border-border/50">{req.details}</p>
                   <p className="text-xs text-muted-foreground mt-3">Soumis le {new Date(req.createdAt).toLocaleString('fr-FR')}</p>
                 </div>
                  <Link href={`/profil/${req.userId}`} target="_blank" className="px-4 py-2 rounded-xl border border-border text-sm font-bold hover:bg-muted shrink-0 transition-colors">Voir profil</Link>
               </div>
               <div className="flex items-center justify-end gap-3 border-t border-border pt-5">
                 <button onClick={() => {
                   const reason = prompt("Raison du rejet (obligatoire) :");
                   if (reason) handleModerate(req.id, 'rejected', reason);
                 }} disabled={moderate.isPending} className="px-6 py-2.5 rounded-xl bg-destructive/10 text-destructive font-bold text-sm hover:bg-destructive/20 transition-colors">
                   Rejeter
                 </button>
                 <button onClick={() => {
                   if (confirm("Approuver ce profil ?")) handleModerate(req.id, 'approved');
                 }} disabled={moderate.isPending} className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm payloca-button">
                   Approuver
                 </button>
               </div>
             </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ModReports() {
  const auth = usePaylocaAuth();
  const userId = auth.user?.id ?? 'anonymous';
  const { data, isLoading } = useListSellerReports(undefined, {
    query: { queryKey: [...getListSellerReportsQueryKey(), userId] },
  });
  const moderate = useModerateSellerReport();
  const queryClient = useQueryClient();

  if (isLoading) return <div className="py-20 text-center"><Loader2 size={32} className="animate-spin mx-auto text-primary" /></div>;

  const handleModerate = (id: number, status: 'resolved' | 'dismissed', resolution: string) => {
    moderate.mutate({ id, data: { status, resolution } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListSellerReportsQueryKey() });
      }
    });
  };

  const pending = data?.filter(r => r.status === 'pending') || [];

  return (
    <div className="space-y-6 rise-in">
      <h2 className="font-display text-2xl font-bold text-foreground">Signalements en attente ({pending.length})</h2>
      {pending.length === 0 ? (
        <div className="p-12 rounded-[24px] border border-dashed border-border text-center text-muted-foreground text-lg">Aucun signalement en attente.</div>
      ) : (
        <div className="grid gap-6">
          {pending.map(rep => (
             <div key={rep.id} className="p-6 rounded-[24px] border border-destructive/30 bg-destructive/5 flex flex-col gap-5">
               <div>
                 <div className="flex items-center justify-between mb-4">
                   <span className="px-3 py-1.5 rounded-full bg-destructive/20 text-destructive text-xs font-bold uppercase tracking-wider">{rep.reason}</span>
                    <Link href={`/profil/${rep.targetUserId}`} target="_blank" className="text-sm font-bold text-secondary hover:underline">Profil visé: {rep.targetUserId}</Link>
                 </div>
                 <p className="text-base text-foreground whitespace-pre-wrap bg-background/80 p-4 rounded-xl border border-destructive/20 leading-relaxed">{rep.details || "Aucun détail fourni par le signaleur."}</p>
                 <div className="flex justify-between items-center text-xs text-muted-foreground mt-4">
                   <span>Signalé par: {rep.reporterId}</span>
                   <span>Le: {new Date(rep.createdAt).toLocaleString('fr-FR')}</span>
                 </div>
               </div>
               <div className="flex justify-end gap-3 border-t border-destructive/20 pt-5">
                 <button onClick={() => {
                   const res = prompt("Raison du classement sans suite (obligatoire) :");
                   if (res) handleModerate(rep.id, 'dismissed', res);
                 }} disabled={moderate.isPending} className="px-5 py-2.5 rounded-xl bg-background border border-border text-foreground font-bold text-sm hover:bg-muted transition-colors">
                   Classer sans suite
                 </button>
                 <button onClick={() => {
                   const res = prompt("Note de résolution (ex: Avertissement envoyé, Profil suspendu, etc.) :");
                   if (res) handleModerate(rep.id, 'resolved', res);
                 }} disabled={moderate.isPending} className="px-5 py-2.5 rounded-xl bg-destructive text-destructive-foreground font-bold text-sm shadow-lg hover:brightness-110 transition-all">
                   Marquer comme Résolu (Action requise)
                 </button>
               </div>
             </div>
          ))}
        </div>
      )}
    </div>
  )
}

function OwnerDashboard() {
  const auth = usePaylocaAuth();
  const [activeTab, setActiveTab] = useState<'profile' | 'verification' | 'mod_requests' | 'mod_reports'>('profile');

  if (!auth.isLoaded) return <div className="py-32 text-center"><Loader2 size={40} className="animate-spin mx-auto text-primary" /></div>;
  if (!auth.isSignedIn) {
    return (
      <div className="page-shell py-32 max-w-xl mx-auto text-center rise-in">
        <div className="size-24 rounded-[28px] bg-primary/10 text-primary flex items-center justify-center mx-auto mb-8 shadow-inner"><Store size={48} /></div>
        <h1 className="font-display text-4xl font-bold text-foreground mb-4">Espace Vendeur</h1>
        <p className="text-muted-foreground text-lg mb-10 leading-relaxed">Connectez-vous pour configurer votre profil vendeur, personnaliser votre boutique et demander la vérification PAYLOCA.</p>
        <Link href="/sign-in" className="payloca-button px-10 py-4 rounded-xl bg-primary text-primary-foreground font-bold inline-block text-lg">Se connecter</Link>
      </div>
    );
  }

  const tabs: Array<{ id: 'profile' | 'verification' | 'mod_requests' | 'mod_reports'; label: string; icon: typeof Store }> = [
    { id: 'profile', label: 'Boutique & Profil', icon: Store },
    { id: 'verification', label: 'Vérification', icon: ShieldCheck },
  ];
  
  if (auth.isModerator) {
    tabs.push({ id: 'mod_requests', label: 'Modération: V **…**

_This response is too long to display in full._
