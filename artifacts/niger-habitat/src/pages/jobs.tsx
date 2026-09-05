import { useState, useMemo, useEffect, useRef, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useListJobs,
  getListJobsQueryKey,
  useCreateJob,
  useListMyJobs,
  getListMyJobsQueryKey,
  useListJobApplications,
  getListJobApplicationsQueryKey,
  useCreateJobApplication,
  useUpdateJobApplicationStatus,
  useListJobsForModeration,
  getListJobsForModerationQueryKey,
  useModerateJob,
} from '@workspace/api-client-react';
import type {
  Job,
  EmployerJob,
  JobApplication,
  JobInputContractType,
  JobApplicationStatusInputStatus
} from '@workspace/api-client-react';
import { usePaylocaAuth } from '@/auth/firebaseAuth';
import { Link } from 'wouter';
import {
  Briefcase, Search, MapPin, Building, GraduationCap, Banknote, ShieldCheck, X, Loader2,
  AlertCircle, FileText, UserCircle, Check, XCircle
} from 'lucide-react';

function formatTimeAgo(dateString: string) {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '';
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (minutes < 60) return "à l'instant";
  if (hours < 24) return `il y a ${hours}h`;
  if (days === 1) return "hier";
  return `il y a ${days} jours`;
}

function PageHeader() {
  return (
    <section className="home-hero ambient-grid relative overflow-hidden bg-muted">
      <div className="page-shell relative z-10 grid min-h-[320px] items-center gap-10 py-12 lg:py-16">
        <div className="max-w-2xl rise-in">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-bold uppercase tracking-[.15em] text-primary">
            <Briefcase size={14} /> Emploi Local
          </span>
          <h1 className="mt-5 font-display text-[clamp(2.5rem,5vw,4rem)] font-bold leading-[1.05] tracking-[-.04em] text-foreground">
            Des opportunités <span className="text-primary">sérieuses.</span>
          </h1>
          <p className="mt-4 text-base leading-7 text-muted-foreground md:text-lg">
            Trouvez un emploi près de chez vous ou recrutez des talents de confiance. Un espace sécurisé où vos candidatures restent privées.
          </p>
        </div>
      </div>
    </section>
  );
}

type JobsTab = 'explore' | 'publish' | 'manage' | 'moderate';

function Tabs({ active, isModerator, canManage, onChange }: { active: JobsTab, isModerator: boolean, canManage: boolean, onChange: (t: JobsTab) => void }) {
  const tabs: Array<{ id: JobsTab; label: string; icon: typeof Search }> = [
    { id: 'explore', label: 'Offres d\'emploi', icon: Search },
  ];
  if (canManage) {
    tabs.push(
      { id: 'publish', label: 'Recruter', icon: FileText },
      { id: 'manage', label: 'Mes annonces', icon: Briefcase },
    );
  }
  if (isModerator) tabs.push({ id: 'moderate', label: 'Modération', icon: ShieldCheck });

  return (
    <div className="flex w-full overflow-x-auto hide-scrollbar">
      <div className="flex w-max min-w-full items-center gap-2 rounded-2xl bg-card p-2 border border-border">
        {tabs.map(tab => {
          const isActive = active === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold transition-all ${
                isActive ? 'bg-primary text-primary-foreground shadow-md' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
              }`}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          )
        })}
      </div>
    </div>
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

function ApplyModal({
  job,
  isOpen,
  onClose,
  isSignedIn
}: {
  job: Job | null;
  isOpen: boolean;
  onClose: () => void;
  isSignedIn: boolean;
}) {
  const queryClient = useQueryClient();
  const apply = useCreateJobApplication();
  const [message, setMessage] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setMessage('');
      setIsSuccess(false);
      apply.reset();
    }
  }, [isOpen]);

  if (!job) return null;

  if (!isSignedIn) {
    return (
      <BaseModal isOpen={isOpen} onClose={onClose} title="Connexion requise">
        <div className="flex flex-col items-center text-center py-6 gap-4">
          <div className="grid size-16 place-items-center rounded-full bg-primary/10 text-primary mb-2">
            <ShieldCheck size={32} />
          </div>
          <p className="text-muted-foreground mb-4 text-sm leading-relaxed max-w-[280px]">
            Pour postuler à cette offre, veuillez vous connecter à votre compte PAYLOCA. Vos informations restent privées.
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
      <BaseModal
