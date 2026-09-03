import {
  useState,
  useMemo,
  useEffect,
  useRef,
  type FormEvent,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
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
} from "@workspace/api-client-react";
import type {
  Job,
  EmployerJob,
  JobApplication,
  JobInputContractType,
  JobApplicationStatusInputStatus,
} from "@workspace/api-client-react";
import { usePaylocaAuth } from "@/auth/firebaseAuth";
import { Link } from "wouter";
import {
  Briefcase,
  Search,
  MapPin,
  Building,
  GraduationCap,
  Banknote,
  ShieldCheck,
  X,
  Loader2,
  AlertCircle,
  FileText,
  UserCircle,
  Check,
  XCircle,
} from "lucide-react";

function formatTimeAgo(
  dateString: string,
) {
  if (!dateString) {
    return "";
  }

  const date =
    new Date(dateString);

  if (isNaN(date.getTime())) {
    return "";
  }

  const diff =
    Date.now() - date.getTime();

  const minutes =
    Math.floor(diff / 60000);

  const hours =
    Math.floor(minutes / 60);

  const days =
    Math.floor(hours / 24);

  if (minutes < 60) {
    return "à l'instant";
  }

  if (hours < 24) {
    return `il y a ${hours}h`;
  }

  if (days === 1) {
    return "hier";
  }

  return `il y a ${days} jours`;
}

function PageHeader() {
  return (
    <section className="home-hero ambient-grid relative overflow-hidden bg-muted">
      <div className="page-shell relative z-10 grid min-h-[320px] items-center gap-10 py-12 lg:py-16">
        <div className="max-w-2xl rise-in">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-bold uppercase tracking-[.15em] text-primary">
            <Briefcase size={14} />
            Emploi Local
          </span>

          <h1 className="mt-5 font-display text-[clamp(2.5rem,5vw,4rem)] font-bold leading-[1.05] tracking-[-.04em] text-foreground">
            Des opportunités{" "}
            <span className="text-primary">
              sérieuses.
            </span>
          </h1>

          <p className="mt-4 text-base leading-7 text-muted-foreground md:text-lg">
            Trouvez un emploi près de chez vous ou recrutez des talents de confiance. Un espace sécurisé où vos candidatures restent privées.
          </p>
        </div>
      </div>
    </section>
  );
}

type JobsTab =
  | "explore"
  | "publish"
  | "manage"
  | "moderate";

function Tabs({
  active,
  isModerator,
  canManage,
  onChange,
}: {
  active: JobsTab;
  isModerator: boolean;
  canManage: boolean;
  onChange: (tab: JobsTab) => void;
}) {
  const tabs: Array<{
    id: JobsTab;
    label: string;
    icon: typeof Search;
  }> = [
    {
      id: "explore",
      label: "Offres d'emploi",
      icon: Search,
    },
  ];

  if (canManage) {
    tabs.push(
      {
        id: "publish",
        label: "Recruter",
        icon: FileText,
      },
      {
        id: "manage",
        label: "Mes annonces",
        icon: Briefcase,
      },
    );
  }

  if (isModerator) {
    tabs.push({
      id: "moderate",
      label: "Modération",
      icon: ShieldCheck,
    });
  }

  return (
    <div className="flex w-full overflow-x-auto hide-scrollbar">
      <div className="flex w-max min-w-full items-center gap-2 rounded-2xl border border-border bg-card p-2">
        {tabs.map((tab) => {
          const isActive =
            active === tab.id;

          const Icon = tab.icon;

          return (
            <button
              key={tab.id}
              onClick={() =>
                onChange(tab.id)
              }
              className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold transition-all ${
                isActive
                  ? "bg-primary text-primary-foreground shadow-md"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              }`}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}  );
}

function BaseModal({
  isOpen,
  onClose,
  title,
  children,
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const onCloseRef =
    useRef(onClose);

  onCloseRef.current =
    onClose;

  useEffect(() => {
    const onKeyDown = (
      event: KeyboardEvent,
    ) => {
      if (
        event.key === "Escape"
      ) {
        onCloseRef.current();
      }
    };

    if (isOpen) {
      document.addEventListener(
        "keydown",
        onKeyDown,
      );
    }

    return () =>
      document.removeEventListener(
        "keydown",
        onKeyDown,
      );
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm transition-all duration-200">
      <div
        className="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-[22px] border border-border bg-card shadow-2xl rise-in"
        onClick={(event) =>
          event.stopPropagation()
        }
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border p-5">
          <h2 className="font-display text-lg font-bold text-foreground">
            {title}
          </h2>

          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto p-5">
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
  isSignedIn,
}: {
  job: Job | null;
  isOpen: boolean;
  onClose: () => void;
  isSignedIn: boolean;
}) {
  const queryClient =
    useQueryClient();

  const apply =
    useCreateJobApplication();

  const [message, setMessage] =
    useState("");

  const [isSuccess, setIsSuccess] =
    useState(false);

  useEffect(() => {
    if (isOpen) {
      setMessage("");
      setIsSuccess(false);
      apply.reset();
    }
  }, [isOpen]);

  if (!job) {
    return null;
  }

  if (!isSignedIn) {
    return (
      <BaseModal
        isOpen={isOpen}
        onClose={onClose}
        title="Connexion requise"
      >
        <div className="flex flex-col items-center gap-4 py-6 text-center">
          <div className="mb-2 grid size-16 place-items-center rounded-full bg-primary/10 text-primary">
            <ShieldCheck size={32} />
          </div>

          <p className="mb-4 max-w-[280px] text-sm leading-relaxed text-muted-foreground">
            Pour postuler à cette offre, veuillez vous connecter à votre compte PAYLOCA. Vos informations restent privées.
          </p>

          <Link
            href="/sign-in"
            onClick={onClose}
            className="payloca-button block w-full rounded-xl bg-primary px-6 py-3 text-center font-bold text-primary-foreground"
          >
            Se connecter
          </Link>

          <button
            onClick={onClose}
            className="mt-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
          >
            Annuler
          </button>
        </div>
      </BaseModal>
    );
  }

  if (isSuccess) {
    return (      <BaseModal
        isOpen={isOpen}
        onClose={onClose}
        title="Candidature envoyée"
      >
        <div className="flex flex-col items-center gap-4 py-6 text-center">
          <div className="mb-2 grid size-16 place-items-center rounded-full bg-green-500/10 text-green-500">
            <Check size={32} />
          </div>

          <h3 className="font-display text-xl font-bold text-foreground">
            Succès !
          </h3>

          <p className="text-sm leading-relaxed text-muted-foreground">
            Votre candidature a été transmise à{" "}
            <strong className="text-foreground">
              {job.companyName}
            </strong>
            . L'employeur vous contactera s'il donne suite.
          </p>

          <button
            onClick={onClose}
            className="payloca-button mt-4 w-full rounded-xl bg-primary px-6 py-3 font-bold text-primary-foreground"
          >
            Terminer
          </button>
        </div>
      </BaseModal>
    );
  }

  const handleSubmit = (
    event: FormEvent,
  ) => {
    event.preventDefault();

    if (
      message.length < 20
      || message.length > 1500
    ) {
      return;
    }

    apply.mutate(
      {
        id: job.id,
        data: {
          message,
        },
      },
      {
        onSuccess: () => {
          setIsSuccess(true);
        },
      },
    );
  };

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title={`Postuler chez ${job.companyName}`}
    >
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-5"
      >
        <div className="flex gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm">
          <ShieldCheck
            size={20}
            className="shrink-0 text-primary"
          />

          <p className="text-muted-foreground">
            Votre candidature sera envoyée directement à l'employeur. PAYLOCA protège votre identité : seul votre nom et ce message seront transmis.
          </p>
        </div>

        <div className="space-y-2">
          <label
            htmlFor="apply-message"
            className="flex items-center justify-between text-sm font-semibold text-foreground"
          >
            <span>
              Lettre de motivation / Message{" "}
              <span className="text-destructive">
                *
              </span>
            </span>

            <span
              className={`text-xs ${
                message.length > 1500
                  ? "text-destructive"
                  : "text-muted-foreground"
              }`}
            >
              {message.length}/1500
            </span>
          </label>

          <textarea
            id="apply-message"
            required
            minLength={20}
            maxLength={1500}
            rows={6}
            placeholder="Présentez-vous, décrivez votre expérience pertinente et pourquoi ce poste vous intéresse..."
            className="w-full resize-none rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:border-primary"
            value={message}
            onChange={(event) =>
              setMessage(
                event.target.value,
              )
            }
          />

          {message.length > 0
            && message.length < 20 && (
              <p className="text-xs text-destructive">
                Votre message doit contenir au moins 20 caractères.
              </p>
            )}
        </div>

        {apply.isError && (
          <div className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle
              size={16}
              className="mt-0.5 shrink-0"
            />

            <span>
              Une erreur est survenue lors de l'envoi. Veuillez réessayer.
            </span>
          </div>
        )}

        <button
          type="submit"
          disabled={
            apply.isPending
            || message.length < 20
            || message.length > 1500
          }
          className="payloca-button mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 font-bold text-primary-foreground disabled:pointer-events-none disabled:opacity-50"
        >
          {apply.isPending ? (
            <Loader2
              size={18}
              className="animate-spin"
            />
          ) : (
            "Envoyer ma candidature"
          )}
        </button>
      </form>
    </BaseModal>
  );
}

function JobSkeleton() {
  return (
    <div className="overflow-hidden rounded-[22px] border border-border bg-card">
      <div className="flex flex-col gap-4 p-5">
        <div className="flex justify-between gap-3">
          <div className="flex-1 space-y-2">
            <div className="h-5 w-3/4 animate-pulse rounded bg-muted" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
          </div>

          <div className="h-6 w-16 animate-pulse rounded-full bg-muted" />
        </div>

        <div className="mt-2 space-y-2">
          <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
          <div className="h-3 w-1/4 animate-pulse rounded bg-muted" />
        </div>

        <div className="mt-auto space-y-2">
          <div className="h-2 w-full animate-pulse rounded bg-muted" />
          <div className="h-2 w-full animate-pulse rounded bg-muted" />
          <div className="h-2 w-2/3 animate-pulse rounded bg-muted" />
        </div>        <div className="mt-4 flex justify-between border-t border-border pt-4">
          <div className="h-3 w-24 animate-pulse rounded bg-muted" />
          <div className="h-9 w-24 animate-pulse rounded-xl bg-muted" />
        </div>
      </div>
    </div>
  );
}

function JobCard({
  job,
  onApply,
  canApply,
}: {
  job: Job;
  onApply: () => void;
  canApply: boolean;
}) {
  return (
    <div className="group relative flex flex-col overflow-hidden rounded-[22px] border border-border bg-card/80 shadow-sm backdrop-blur-md transition-all hover:border-primary/50 hover:shadow-md">
      <div className="flex flex-1 flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="line-clamp-2 font-display text-lg font-bold text-foreground">
              {job.title}
            </h3>

            <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-secondary">
              <Building size={14} />
              {job.companyName}
            </p>
          </div>

          <span className="inline-flex shrink-0 items-center rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">
            {job.contractType}
          </span>
        </div>

        <div className="flex flex-col gap-2 text-sm text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <MapPin
              size={15}
              className="shrink-0 text-primary"
            />

            <span className="line-clamp-1">
              {job.city}
              {job.locationDetails
                ? `, ${job.locationDetails}`
                : ""}
            </span>
          </div>

          {job.educationLevel && (
            <div className="flex items-center gap-1.5">
              <GraduationCap
                size={15}
                className="shrink-0 text-primary"
              />

              <span className="line-clamp-1">
                {job.educationLevel}
              </span>
            </div>
          )}

          {(job.salaryMin !== null
            || job.salaryMax !== null) && (
            <div className="flex items-center gap-1.5">
              <Banknote
                size={15}
                className="shrink-0 text-primary"
              />

              <span>
                {job.salaryMin !== null
                  ? `${job.salaryMin.toLocaleString(
                      "fr-FR",
                    )}`
                  : ""}

                {job.salaryMin !== null
                  && job.salaryMax !== null
                  ? " - "
                  : ""}

                {job.salaryMax !== null
                  ? `${job.salaryMax.toLocaleString(
                      "fr-FR",
                    )}`
                  : ""}{" "}
                FCFA
              </span>
            </div>
          )}
        </div>

        <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm text-muted-foreground">
          {job.description}
        </p>

        <div className="mt-auto flex items-center justify-between border-t border-border pt-4">
          <span className="text-xs text-muted-foreground">
            Publié il y a{" "}
            {formatTimeAgo(job.createdAt)}
          </span>

          <button
            onClick={onApply}
            disabled={!canApply}
            title={
              !canApply
                ? "Réservé aux comptes utilisateur avec un abonnement VIP"
                : undefined
            }
            className="payloca-button rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            {canApply
              ? "Postuler"
              : "VIP requis"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ExploreTab({
  isSignedIn,
  canApply,
}: {
  isSignedIn: boolean;
  canApply: boolean;
}) {
  const {
    data: jobs,
    isLoading,
    isError,
    refetch,
  } = useListJobs();

  const [search, setSearch] =
    useState("");

  const [cityFilter, setCityFilter] =
    useState("");

  const [contractFilter, setContractFilter] =
    useState("");

  const [selectedJob, setSelectedJob] =
    useState<Job | null>(null);

  const [activeModal, setActiveModal] =
    useState<"apply" | null>(null);

  const filteredJobs = useMemo(() => {
    if (!jobs) {
      return [];
    }

    return jobs.filter((job) => {
      const matchSearch = search
        ? (
            job.title
              .toLowerCase()
              .includes(
                search.toLowerCase(),
              )
            || job.companyName
              .toLowerCase()
              .includes(
                search.toLowerCase(),
              )
          )
        : true;

      const matchCity =
        cityFilter
          ? job.city === cityFilter
          : true;

      const matchContract =
        contractFilter
          ? job.contractType
              === contractFilter
          : true;

      return (
        matchSearch
        && matchCity
        && matchContract
      );
    });
  }, [
    jobs,
    search,
    cityFilter,
    contractFilter,
  ]);

  return (
    <div>
      <div className="mb-8 grid gap-4 md:grid-cols-[1fr_200px_200px]">
        <div className="relative">
          <Search
            size={18}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
          />

          <input
            type="text"
            placeholder="Rechercher une offre, une entreprise..."
            className="w-full rounded-xl border border-border bg-card py-3 pl-11 pr-4 text-sm font-semibold text-foreground outline-none focus-visible:border-primary"
            value={search}
            onChange={(event) =>
              setSearch(
                event.target.value,
              )
            }
          />        </div>

        <select
          value={cityFilter}
          onChange={(event) =>
            setCityFilter(
              event.target.value,
            )
          }
          className="appearance-none rounded-xl border border-border bg-card px-4 py-3 text-sm font-semibold text-foreground outline-none focus-visible:border-primary"
        >
          <option value="">
            Toutes les villes
          </option>

          <option value="Niamey">
            Niamey
          </option>

          <option value="Maradi">
            Maradi
          </option>

          <option value="Zinder">
            Zinder
          </option>

          <option value="Agadez">
            Agadez
          </option>

          <option value="Tahoua">
            Tahoua
          </option>
        </select>

        <select
          value={contractFilter}
          onChange={(event) =>
            setContractFilter(
              event.target.value,
            )
          }
          className="appearance-none rounded-xl border border-border bg-card px-4 py-3 text-sm font-semibold text-foreground outline-none focus-visible:border-primary"
        >
          <option value="">
            Tous les contrats
          </option>

          <option value="CDI">
            CDI
          </option>

          <option value="CDD">
            CDD
          </option>

          <option value="Stage">
            Stage
          </option>

          <option value="Mission">
            Mission
          </option>

          <option value="Apprentissage">
            Apprentissage
          </option>
        </select>
      </div>

      {isLoading ? (
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({
            length: 6,
          }).map((_, index) => (
            <JobSkeleton
              key={index}
            />
          ))}
        </div>
      ) : isError ? (
        <div className="rounded-[22px] border border-destructive/30 bg-destructive/10 p-8 text-center">
          <AlertCircle
            className="mx-auto text-destructive"
            size={30}
          />

          <h3 className="mt-3 font-display text-xl font-bold text-foreground">
            Erreur de chargement
          </h3>

          <p className="mt-1 text-sm text-muted-foreground">
            Impossible de charger les annonces.
          </p>

          <button
            onClick={() =>
              refetch()
            }
            className="payloca-button mt-5 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground"
          >
            Réessayer
          </button>
        </div>
      ) : filteredJobs.length === 0 ? (
        <div className="rounded-[22px] border border-dashed border-border bg-card/50 p-10 text-center">
          <div className="mx-auto grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
            <Search size={24} />
          </div>

          <h3 className="mt-4 font-display text-xl font-bold text-foreground">
            Aucune offre
          </h3>

          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            Nous n'avons trouvé aucune offre correspondant à vos critères.
          </p>

          {(search
            || cityFilter
            || contractFilter) && (
            <button
              onClick={() => {
                setSearch("");
                setCityFilter("");
                setContractFilter("");
              }}
              className="mt-5 rounded-full border border-border px-5 py-2.5 text-sm font-bold text-foreground transition-colors hover:bg-muted"
            >
              Réinitialiser les filtres
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {filteredJobs.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              canApply={canApply}
              onApply={() => {
                setSelectedJob(job);
                setActiveModal("apply");
              }}
            />
          ))}
        </div>
      )}

      <ApplyModal
        job={
          activeModal === "apply"
            ? selectedJob
            : null
        }
        isOpen={
          activeModal === "apply"
        }
        onClose={() => {
          setActiveModal(null);

          setTimeout(
            () => setSelectedJob(null),
            200,
          );
        }}
        isSignedIn={isSignedIn}
      />
    </div>
  );
}

function PublishTab({
  isSignedIn,
  onPublished,
}: {
  isSignedIn: boolean;
  onPublished: () => void;
}) {
  const queryClient =
    useQueryClient();

  const createJob =
    useCreateJob();

  const [formData, setFormData] =
    useState({
      title: "",
      companyName: "",
      city: "Niamey",
      locationDetails: "",
      contractType:
        "CDI" as JobInputContractType,
      educationLevel: "",
      salaryMin: "",
      salaryMax: "",
      description: "",
    });

  if (!isSignedIn) {
    return (
      <div className="mx-auto mt-8 max-w-2xl rounded-[22px] border border-dashed border-border bg-card/50 p-10 text-center">
        <div className="mx-auto mb-4 grid size-16 place-items-center rounded-full bg-primary/10 text-primary">
          <Briefcase size={32} />
        </div>

        <h3 className="font-display text-2xl font-bold text-foreground">
          Recrutez avec PAYLOCA
        </h3>

        <p className="mx-auto mt-2 leading-relaxed text-muted-foreground">
          Publiez vos offres d'emploi gratuitement et trouvez des profils de confiance près de chez vous.
        </p>

        <Link
          href="/sign-in"
          className="payloca-button mt-6 inline-block rounded-xl bg-primary px-8 py-3.5 font-bold text-primary-foreground"
        >
          Se connecter pour publier
        </Link>        </Link>
      </div>
    );
  }

  const handleSubmit = (
    event: FormEvent,
  ) => {
    event.preventDefault();

    if (createJob.isPending) {
      return;
    }

    const payload = {
      title: formData.title.trim(),
      companyName:
        formData.companyName.trim(),
      city: formData.city,
      locationDetails:
        formData.locationDetails
          .trim()
        || undefined,
      contractType:
        formData.contractType,
      educationLevel:
        formData.educationLevel
          .trim()
        || undefined,
      salaryMin:
        formData.salaryMin
          ? Number(formData.salaryMin)
          : undefined,
      salaryMax:
        formData.salaryMax
          ? Number(formData.salaryMax)
          : undefined,
      description:
        formData.description.trim(),
    };

    createJob.mutate(
      {
        data: payload,
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey:
              getListMyJobsQueryKey(),
          });

          queryClient.invalidateQueries({
            queryKey:
              getListJobsQueryKey(),
          });

          setFormData({
            title: "",
            companyName: "",
            city: "Niamey",
            locationDetails: "",
            contractType: "CDI",
            educationLevel: "",
            salaryMin: "",
            salaryMax: "",
            description: "",
          });

          createJob.reset();
          onPublished();
        },
      },
    );
  };

  return (
    <div className="mx-auto max-w-3xl">
      <div className="rounded-[22px] border border-border bg-card p-6 shadow-sm md:p-8">
        <div className="mb-8 flex gap-4 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm">
          <ShieldCheck
            size={24}
            className="shrink-0 text-primary"
          />

          <div className="flex flex-col gap-1 text-muted-foreground">
            <p className="font-bold text-foreground">
              Publication encadrée
            </p>

            <p>
              Les nouvelles offres sont examinées par notre équipe avant publication.
            </p>

            <p>
              Aucune commission n'est facturée. PAYLOCA ne certifie pas l'authenticité des diplômes des candidats.
            </p>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-6"
        >
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">
                Titre du poste{" "}
                <span className="text-destructive">
                  *
                </span>
              </label>

              <input
                required
                minLength={3}
                maxLength={120}
                type="text"
                placeholder="Ex: Vendeur/Vendeuse en boutique"
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:border-primary"
                value={formData.title}
                onChange={(event) =>
                  setFormData({
                    ...formData,
                    title: event.target.value,
                  })
                }
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">
                Nom de l'entreprise{" "}
                <span className="text-destructive">
                  *
                </span>
              </label>

              <input
                required
                minLength={2}
                maxLength={120}
                type="text"
                placeholder="Ex: Boutique Al-Ihsan"
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:border-primary"
                value={formData.companyName}
                onChange={(event) =>
                  setFormData({
                    ...formData,
                    companyName:
                      event.target.value,
                  })
                }
              />
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">
                Ville{" "}
                <span className="text-destructive">
                  *
                </span>
              </label>

              <select
                required
                className="w-full appearance-none rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:border-primary"
                value={formData.city}
                onChange={(event) =>
                  setFormData({
                    ...formData,
                    city: event.target.value,
                  })
                }
              >
                <option value="Niamey">
                  Niamey
                </option>                <option value="Maradi">
                  Maradi
                </option>

                <option value="Zinder">
                  Zinder
                </option>

                <option value="Agadez">
                  Agadez
                </option>

                <option value="Tahoua">
                  Tahoua
                </option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">
                Quartier / Adresse
              </label>

              <input
                maxLength={160}
                type="text"
                placeholder="Ex: Grand Marché"
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:border-primary"
                value={
                  formData.locationDetails
                }
                onChange={(event) =>
                  setFormData({
                    ...formData,
                    locationDetails:
                      event.target.value,
                  })
                }
              />
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">
                Type de contrat{" "}
                <span className="text-destructive">
                  *
                </span>
              </label>

              <select
                required
                className="w-full appearance-none rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:border-primary"
                value={formData.contractType}
                onChange={(event) =>
                  setFormData({
                    ...formData,
                    contractType:
                      event.target.value as JobInputContractType,
                  })
                }
              >
                <option value="CDI">
                  CDI
                </option>

                <option value="CDD">
                  CDD
                </option>

                <option value="Stage">
                  Stage
                </option>

                <option value="Mission">
                  Mission
                </option>

                <option value="Apprentissage">
                  Apprentissage
                </option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">
                Niveau d'études souhaité
              </label>

              <input
                maxLength={100}
                type="text"
                placeholder="Ex: BAC, Licence, ou non requis"
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:border-primary"
                value={
                  formData.educationLevel
                }
                onChange={(event) =>
                  setFormData({
                    ...formData,
                    educationLevel:
                      event.target.value,
                  })
                }
              />
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">
                Salaire minimum (FCFA)
              </label>

              <input
                type="number"
                min={0}
                placeholder="Ex: 50000"
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:border-primary"
                value={formData.salaryMin}
                onChange={(event) =>
                  setFormData({
                    ...formData,
                    salaryMin:
                      event.target.value,
                  })
                }
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">
                Salaire maximum (FCFA)
              </label>

              <input
                type="number"
                min={0}
                placeholder="Ex: 100000"
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:border-primary"
                value={formData.salaryMax}
                onChange={(event) =>
                  setFormData({
                    ...formData,
                    salaryMax:
                      event.target.value,
                  })
                }
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="flex items-center justify-between text-sm font-semibold text-foreground">
              <span>
                Description du poste{" "}
                <span className="text-destructive">
                  *
                </span>
              </span>

              <span
                className={`text-xs ${
                  formData.description.length
                    > 4000
                    ? "text-destructive"
                    : "text-muted-foreground"
                }`}
              >
                {formData.description.length}/4000
              </span>
            </label>

            <textarea
              required
              minLength={20}
              maxLength={4000}
              rows={6}
              placeholder="Décrivez les missions, les compétences requises, les horaires..."
              className="w-full resize-none rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:border-primary"
              value={formData.description}
              onChange={(event) =>
                setFormData({
                  ...formData,
                  description:
                    event.target.value,
                })
              }
            />
          </div>          {createJob.isError && (
            <div className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle
                size={16}
                className="mt-0.5 shrink-0"
              />

              <span>
                Une erreur est survenue lors de la soumission de l'offre. Veuillez vérifier les champs.
              </span>
            </div>
          )}

          <button
            type="submit"
            disabled={
              createJob.isPending
              || formData.description.length
                < 20
            }
            className="payloca-button mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-4 font-bold text-primary-foreground disabled:pointer-events-none disabled:opacity-50"
          >
            {createJob.isPending ? (
              <Loader2
                size={20}
                className="animate-spin"
              />
            ) : (
              "Soumettre pour validation"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

function StatusBadge({
  status,
}: {
  status: string;
}) {
  const map: Record<
    string,
    {
      label: string;
      classes: string;
    }
  > = {
    pending_review: {
      label: "En examen",
      classes:
        "bg-orange-500/10 text-orange-500 border-orange-500/20",
    },
    approved: {
      label: "Publiée",
      classes:
        "bg-green-500/10 text-green-500 border-green-500/20",
    },
    rejected: {
      label: "Refusée",
      classes:
        "bg-destructive/10 text-destructive border-destructive/20",
    },
    closed: {
      label: "Fermée",
      classes:
        "bg-muted text-muted-foreground border-border",
    },
  };

  const config =
    map[status]
    || map.pending_review;

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold ${config.classes}`}
    >
      {config.label}
    </span>
  );
}

function AppStatusBadge({
  status,
}: {
  status: string;
}) {
  if (status === "shortlisted") {
    return (
      <span className="rounded-md bg-green-500/10 px-2 py-1 text-xs font-bold text-green-500">
        Pré-sélectionné
      </span>
    );
  }

  if (status === "rejected") {
    return (
      <span className="rounded-md bg-destructive/10 px-2 py-1 text-xs font-bold text-destructive">
        Refusé
      </span>
    );
  }

  return (
    <span className="rounded-md bg-primary/10 px-2 py-1 text-xs font-bold text-primary">
      Nouvelle
    </span>
  );
}

function ApplicationsModal({
  jobId,
  userId,
  onClose,
}: {
  jobId: number | null;
  userId: string;
  onClose: () => void;
}) {
  const queryClient =
    useQueryClient();

  const {
    data: applications,
    isLoading,
  } = useListJobApplications(
    jobId as number,
    {
      query: {
        queryKey: [
          ...getListJobApplicationsQueryKey(
            jobId as number,
          ),
          userId,
        ],
        enabled: jobId !== null,
      },
    },
  );

  const updateStatus =
    useUpdateJobApplicationStatus();

  if (jobId === null) {
    return null;
  }

  const handleUpdate = (
    appId: number,
    status: JobApplicationStatusInputStatus,
  ) => {
    updateStatus.mutate(
      {
        id: appId,
        data: {
          status,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey:
              getListJobApplicationsQueryKey(
                jobId,
              ),
          });
        },
      },
    );
  };

  return (
    <BaseModal
      isOpen={jobId !== null}
      onClose={onClose}
      title="Candidatures reçues"
    >
      <div className="max-h-[60vh] space-y-4">
        {isLoading && (
          <Loader2
            className="mx-auto my-10 animate-spin text-primary"
            size={32}
          />
        )}

        {!isLoading
          && (
            !applications
            || applications.length === 0
          ) && (
            <div className="py-10 text-center text-muted-foreground">
              <UserCircle
                size={40}
                className="mx-auto mb-3 opacity-20"
              />

              <p>
                Aucune candidature pour le moment.
              </p>
            </div>
          )}

        {applications?.map((application) => (
          <div
            key={application.id}
            className="flex flex-col gap-3 rounded-xl border border-border bg-background p-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <h5 className="font-bold text-foreground">
                  {application.candidateName}
                </h5>

                <span className="text-xs text-muted-foreground">
                  {formatTimeAgo(
                    application.createdAt,
                  )}
                </span>
              </div>

              <AppStatusBadge
                status={application.status}
              />
            </div>

            <div className="whitespace-pre-wrap rounded-lg bg-muted/30 p-3 text-sm text-foreground">
              {application.message}
            </div>

            {application.status === "submitted" && (
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() =>
                    handleUpdate(
                      application.id,
                      "shortlisted",
                    )
                  }
                  disabled={
                    updateStatus.isPending
                  }
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-green-500/10 px-3 py-2 text-xs font-bold text-green-500 transition-colors hover:bg-green-500/20 disabled:opacity-50"
                >
                  <Check size={14} />
                  Pré-sélectionner
                </button>

                <button
                  onClick={() =>
                    handleUpdate(
                      application.id,
                      "rejected",
                    )
                  }
                  disabled={
                    updateStatus.isPending
                  }
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-destructive/10 px-3 py-2 text-xs font-bold text-destructive transition-colors hover:bg-destructive/20 disabled:opacity-50"
                >
                  <XCircle size={14} />
                  Refuser
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </BaseModal>
  );
}      </div>
    </BaseModal>
  );
}

function ManageTab({
  isSignedIn,
  userId,
}: {
  isSignedIn: boolean;
  userId: string;
}) {
  const {
    data: myJobs,
    isLoading,
  } = useListMyJobs({
    query: {
      queryKey: [
        ...getListMyJobsQueryKey(),
        userId,
      ],
      enabled: isSignedIn,
    },
  });

  const [selectedJobId, setSelectedJobId] =
    useState<number | null>(null);

  if (!isSignedIn) {
    return (
      <div className="mx-auto mt-8 max-w-2xl rounded-[22px] border border-dashed border-border bg-card/50 p-10 text-center">
        <div className="mx-auto mb-4 grid size-16 place-items-center rounded-full bg-primary/10 text-primary">
          <ShieldCheck size={32} />
        </div>

        <h3 className="font-display text-2xl font-bold text-foreground">
          Espace sécurisé
        </h3>

        <p className="mx-auto mt-2 leading-relaxed text-muted-foreground">
          Veuillez vous connecter pour publier ou gérer vos offres d'emploi sur PAYLOCA.
        </p>

        <Link
          href="/sign-in"
          className="payloca-button mt-6 inline-block rounded-xl bg-primary px-8 py-3.5 font-bold text-primary-foreground"
        >
          Se connecter
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="mx-auto grid max-w-4xl gap-6">
        {isLoading && (
          <Loader2
            className="mx-auto my-10 animate-spin text-primary"
            size={32}
          />
        )}

        {!isLoading
          && myJobs?.length === 0 && (
            <div className="rounded-[22px] border border-dashed border-border bg-card/50 p-10 text-center">
              <Briefcase
                size={32}
                className="mx-auto mb-3 text-muted-foreground opacity-50"
              />

              <h3 className="font-display text-xl font-bold text-foreground">
                Aucune annonce
              </h3>

              <p className="mt-2 text-muted-foreground">
                Vous n'avez pas encore publié d'offres d'emploi.
              </p>
            </div>
          )}

        {myJobs?.map((job) => (
          <div
            key={job.id}
            className="flex flex-col gap-4 rounded-[22px] border border-border bg-card p-6 shadow-sm md:flex-row md:items-center md:justify-between"
          >
            <div>
              <div className="flex items-center gap-3">
                <h4 className="font-display text-lg font-bold text-foreground">
                  {job.title}
                </h4>

                <StatusBadge
                  status={job.status}
                />
              </div>

              <p className="mt-1 text-sm font-semibold text-secondary">
                {job.companyName}
              </p>

              <p className="mt-2 line-clamp-1 text-sm text-muted-foreground">
                {job.city} •{" "}
                {job.contractType}
              </p>

              {job.moderationNote
                && job.status
                  === "rejected" && (
                <div className="mt-3 flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                  <AlertCircle
                    size={16}
                    className="mt-0.5 shrink-0"
                  />

                  <span>
                    {job.moderationNote}
                  </span>
                </div>
              )}
            </div>

            <div className="shrink-0">
              {(job.status === "approved"
                || job.status === "closed") && (
                <button
                  onClick={() =>
                    setSelectedJobId(job.id)
                  }
                  className="w-full rounded-xl border border-border bg-background px-5 py-2.5 text-sm font-bold text-foreground transition-colors hover:bg-muted md:w-auto"
                >
                  Voir les candidatures
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <ApplicationsModal
        jobId={selectedJobId}
        userId={userId}
        onClose={() =>
          setSelectedJobId(null)
        }
      />
    </>
  );
}

type ModerationStatus =
  | "pending_review"
  | "approved"
  | "rejected"
  | "closed";

function ModerationTab({
  userId,
}: {
  userId: string;
}) {
  const queryClient =
    useQueryClient();

  const [status, setStatus] =
    useState<ModerationStatus>(
      "pending_review",
    );

  const [rejectingJob, setRejectingJob] =
    useState<EmployerJob | null>(null);

  const [moderationNote, setModerationNote] =
    useState("");

  const params = {
    status,
  };

  const moderation =
    useListJobsForModeration(
      params,
      {
        query: {
          queryKey: [
            ...getListJobsForModerationQueryKey(
              params,
            ),
            userId,
          ],
        },
      },
    );

  const decide =
    useModerateJob();

  const updateJob = (
    jobId: number,
    nextStatus:
      | "approved"
      | "rejected"
      | "closed",
    note?: string,
  ) => {
    decide.mutate(
      {
        id: jobId,
        data: {
          status: nextStatus,
          moderationNote:
            note?.trim()
            || undefined,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey:
              getListJobsForModerationQueryKey(),
          });

          queryClient.invalidateQueries({
            queryKey:
              getListJobsQueryKey(),
          });          setRejectingJob(null);
          setModerationNote("");
        },
      },
    );
  };

  return (
    <>
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 rounded-[22px] border border-border bg-card p-5">
          <div className="flex items-start gap-3">
            <ShieldCheck
              className="mt-0.5 shrink-0 text-primary"
              size={22}
            />

            <div>
              <h3 className="font-display text-lg font-bold text-foreground">
                Contrôle des offres
              </h3>

              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Vérifiez la cohérence de l’offre avant publication. Une validation ne certifie ni l’employeur, ni les diplômes des candidats.
              </p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {(
              [
                [
                  "pending_review",
                  "À examiner",
                ],
                [
                  "approved",
                  "Publiées",
                ],
                [
                  "rejected",
                  "Refusées",
                ],
                [
                  "closed",
                  "Fermées",
                ],
              ] as Array<
                [ModerationStatus, string]
              >
            ).map(
              ([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() =>
                    setStatus(value)
                  }
                  className={`rounded-full border px-4 py-2 text-sm font-bold transition-colors ${
                    status === value
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ),
            )}
          </div>
        </div>

        {moderation.isLoading && (
          <Loader2
            className="mx-auto my-12 animate-spin text-primary"
            size={32}
          />
        )}

        {moderation.isError && (
          <div
            role="alert"
            className="rounded-2xl border border-destructive/20 bg-destructive/10 p-5 text-sm text-destructive"
          >
            Impossible de charger les offres à modérer.
          </div>
        )}

        {!moderation.isLoading
          && moderation.data?.length
            === 0 && (
            <div className="rounded-[22px] border border-dashed border-border bg-card/50 p-10 text-center">
              <ShieldCheck
                className="mx-auto text-muted-foreground/50"
                size={36}
              />

              <h3 className="mt-4 font-display text-xl font-bold text-foreground">
                Aucune offre dans cette catégorie
              </h3>
            </div>
          )}

        <div className="grid gap-5">
          {moderation.data?.map((job) => (
            <article
              key={job.id}
              className="rounded-[22px] border border-border bg-card p-6 shadow-sm"
            >
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="font-display text-xl font-bold text-foreground">
                      {job.title}
                    </h3>

                    <StatusBadge
                      status={job.status}
                    />
                  </div>

                  <p className="mt-1 font-semibold text-secondary">
                    {job.companyName}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
                    <span>
                      {job.city}
                      {job.locationDetails
                        ? ` · ${job.locationDetails}`
                        : ""}
                    </span>

                    <span>
                      {job.contractType}
                    </span>

                    <span>
                      {job.educationLevel}
                    </span>
                  </div>

                  <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-foreground">
                    {job.description}
                  </p>

                  {job.moderationNote && (
                    <p className="mt-4 rounded-xl bg-muted/50 p-3 text-sm text-muted-foreground">
                      Motif :{" "}
                      {job.moderationNote}
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 flex-wrap gap-2 lg:max-w-[220px] lg:justify-end">
                  {job.status
                    === "pending_review" && (
                    <>
                      <button
                        type="button"
                        disabled={
                          decide.isPending
                        }
                        onClick={() =>
                          updateJob(
                            job.id,
                            "approved",
                          )
                        }
                        className="rounded-xl bg-green-500 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                      >
                        Publier
                      </button>

                      <button
                        type="button"
                        disabled={
                          decide.isPending
                        }
                        onClick={() => {
                          setRejectingJob(
                            job,
                          );
                          setModerationNote(
                            "",
                          );
                        }}
                        className="rounded-xl bg-destructive/10 px-4 py-2.5 text-sm font-bold text-destructive disabled:opacity-50"
                      >
                        Refuser
                      </button>
                    </>
                  )}

                  {job.status
                    === "approved" && (
                    <button
                      type="button"                      disabled={
                        decide.isPending
                      }
                      onClick={() =>
                        updateJob(
                          job.id,
                          "closed",
                        )
                      }
                      className="rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-bold text-foreground disabled:opacity-50"
                    >
                      Fermer l’offre
                    </button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>

      <BaseModal
        isOpen={Boolean(rejectingJob)}
        onClose={() => {
          setRejectingJob(null);
          setModerationNote("");
        }}
        title="Refuser cette offre"
      >
        <p className="text-sm leading-6 text-muted-foreground">
          Expliquez clairement à l’employeur ce qui doit être corrigé avant une nouvelle soumission.
        </p>

        <label className="mt-5 block text-sm font-bold text-foreground">
          Motif du refus

          <textarea
            required
            maxLength={500}
            rows={5}
            value={moderationNote}
            onChange={(event) =>
              setModerationNote(
                event.target.value,
              )
            }
            className="mt-2 w-full rounded-xl border border-border bg-background p-3 font-normal text-foreground outline-none focus:border-primary"
          />
        </label>

        <button
          type="button"
          disabled={
            !rejectingJob
            || !moderationNote.trim()
            || decide.isPending
          }
          onClick={() =>
            rejectingJob
            && updateJob(
              rejectingJob.id,
              "rejected",
              moderationNote,
            )
          }
          className="mt-5 w-full rounded-xl bg-destructive px-5 py-3 font-bold text-white disabled:opacity-50"
        >
          Confirmer le refus
        </button>
      </BaseModal>
    </>
  );
}

export default function JobsPage() {
  const auth =
    usePaylocaAuth();

  const isSignedIn =
    auth?.isSignedIn ?? false;

  const isModerator =
    auth?.isModerator ?? false;

  const canManage =
    isSignedIn
    && auth?.accountType === "agency";

  const canApply = Boolean(
    isSignedIn
    && auth?.accountType === "user"
    && auth.membership.plan !== "free",
  );

  const userId =
    auth?.user?.id ?? "anonymous";

  const [activeTab, setActiveTab] =
    useState<JobsTab>("explore");

  return (
    <>
      <PageHeader />

      <div className="page-shell py-8 md:py-12">
        <Tabs
          active={activeTab}
          isModerator={isModerator}
          canManage={canManage}
          onChange={setActiveTab}
        />

        <div className="mt-8">
          {activeTab === "explore" && (
            <ExploreTab
              isSignedIn={isSignedIn}
              canApply={canApply}
            />
          )}

          {activeTab === "publish"
            && canManage && (
              <PublishTab
                isSignedIn={isSignedIn}
                onPublished={() =>
                  setActiveTab("manage")
                }
              />
            )}

          {activeTab === "manage"
            && canManage && (
              <ManageTab
                isSignedIn={isSignedIn}
                userId={userId}
              />
            )}

          {activeTab === "moderate"
            && isModerator && (
              <ModerationTab
                userId={userId}
              />
            )}
        </div>
      </div>
    </>
  );
}
