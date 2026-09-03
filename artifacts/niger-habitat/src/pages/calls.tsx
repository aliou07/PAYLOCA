function AccountSpacePage({
  expected,
}: {
  expected: AccountType;
}) {
  const {
    isLoaded,
    isSignedIn,
    accountType,
    accountTypeLoading,
    accountTypeRequired,
  } = usePaylocaAuth();

  if (!isLoaded) {
    return (
      <Shell>
        <section className="page-shell py-20 text-center text-sm text-[#676b76]">
          Chargement de votre session…
        </section>
      </Shell>
    );
  }

  if (!isSignedIn) {
    return (
      <AuthGate>
        <AccountSpacePage expected={expected} />
      </AuthGate>
    );
  }

  if (
    accountTypeLoading
    && accountType === null
  ) {
    return (
      <Shell>
        <section className="page-shell py-20 text-center text-sm text-[#676b76]">
          Chargement de votre espace…
        </section>
      </Shell>
    );
  }

  if (
    accountType === null
    || accountTypeRequired
  ) {
    return <SignInPage />;
  }

  if (accountType !== expected) {
    return (
      <Shell>
        <section className="page-shell flex min-h-[60vh] items-center justify-center py-12">
          <div className="max-w-md rounded-[25px] border border-[#e4bbb0] bg-[#fff1eb] p-7 text-center shadow-[0_5px_0_#e8deca]">
            <h1 className="font-display text-3xl font-bold text-[#8f3e32]">
              Cet espace n’est pas le vôtre
            </h1>

            <p className="mt-3 text-sm leading-6 text-[#8f3e32]">
              Votre compte est configuré comme{" "}
              {accountType === "agency"
                ? "agence / propriétaire"
                : accountType === "ong"
                  ? "ONG"
                  : "utilisateur"}.
            </p>

            <Link
              href={
                accountType === "agency"
                  ? "/espace-agence"
                  : accountType === "ong"
                    ? "/espace-ong"
                    : "/"
              }
              className="mt-6 inline-flex rounded-xl bg-[#b95740] px-4 py-3 text-sm font-bold text-white"
            >
              Ouvrir mon espace
            </Link>
          </div>
        </section>
      </Shell>
    );
  }

  if (expected === "agency") {
    return (
      <Shell>
        <section className="page-shell py-10 md:py-16">
          <span className="text-xs font-bold uppercase tracking-[.18em] text-[#b95740]">
            Espace agence / propriétaire
          </span>

          <h1 className="mt-2 font-display text-5xl font-bold tracking-[-.05em]">
            Gérez vos biens avec clarté.
          </h1>

          <p className="mt-4 max-w-2xl text-base leading-7 text-[#676b76]">
            Publiez vos maisons et boutiques, présentez votre profil professionnel et suivez uniquement les données disponibles sur votre compte.
          </p>

          <div className="mt-9 grid gap-4 md:grid-cols-3">
            <Link
              href="/publier"
              className="rounded-[22px] border border-[#dfd7c4] bg-[#faf6ec] p-5 shadow-[0_5px_0_#e8deca] transition-transform hover:-translate-y-1"
            >
              <span className="text-2xl">
                ＋
              </span>

              <h2 className="mt-4 font-display text-2xl font-bold">
                Publier un bien
              </h2>

              <p className="mt-2 text-sm leading-6 text-[#676b76]">
                Ajoutez une annonce avec photo et contact nigérien validés.
              </p>
            </Link>

            <Link
              href="/boutique"
              className="rounded-[22px] border border-[#dfd7c4] bg-[#faf6ec] p-5 shadow-[0_5px_0_#e8deca] transition-transform hover:-translate-y-1"
            >
              <span className="text-2xl">
                ▦
              </span>

              <h2 className="mt-4 font-display text-2xl font-bold">
                Profil professionnel
              </h2>

              <p className="mt-2 text-sm leading-6 text-[#676b76]">
                Présentez votre agence ou votre activité sans faux badge ni chiffre inventé.
              </p>
            </Link>

            <Link
              href="/emplois"
              className="rounded-[22px] border border-[#dfd7c4] bg-[#faf6ec] p-5 shadow-[0_5px_0_#e8deca] transition-transform hover:-translate-y-1"
            >
              <span className="text-2xl">
                ⌁
              </span>

              <h2 className="mt-4 font-display text-2xl font-bold">
                Emploi
              </h2>

              <p className="mt-2 text-sm leading-6 text-[#676b76]">
                Gérez vos offres et consultez les candidatures de vos offres.
              </p>
            </Link>
          </div>

          <div className="mt-8 rounded-[22px] border border-[#cfe1d0] bg-[#eef7ed] p-5 text-sm leading-6 text-[#267158]">
            <strong>
              Données réelles uniquement.
            </strong>{" "}
            Les statistiques et vérifications s’afficheront lorsqu’elles seront disponibles sur votre compte.
          </div>
        </section>
      </Shell>
    );
  }

  if (expected === "ong") {
    return (
      <Shell>
        <section className="page-shell py-10 md:py-16">
          <span className="text-xs font-bold uppercase tracking-[.18em] text-[#267158]">
            Espace ONG
          </span>

          <h1 className="mt-2 font-display text-5xl font-bold tracking-[-.05em]">
            Votre action, sans chiffres inventés.
          </h1>

          <p className="mt-4 max-w-2xl text-base leading-7 text-[#676b76]">
            Présentez votre organisation et vos activités après validation. PAYLOCA n’affiche aucun impact ou badge tant qu’une donnée n’a pas été vérifiée.
          </p>

          <div className="mt-9 rounded-[24px] border border-[#dfd7c4] bg-[#faf6ec] p-6 shadow-[0_5px_0_#e8deca]">
            <h2 className="font-display text-2xl font-bold">
              Activités validées
            </h2>

            <p className="mt-3 text-sm leading-6 text-[#676b76]">
              Aucune activité validée n’est encore disponible pour ce compte.
            </p>

            <button
              type="button"
              disabled
              className="mt-6 rounded-xl border border-[#d9cfbc] px-5 py-3 text-sm font-bold text-[#8a8984]"
            >
              Créer une activité · validation requise
            </button>
          </div>
        </section>
      </Shell>
    );
  }

  return (
    <Shell>
      <section className="page-shell py-10 md:py-16">
        <span className="text-xs font-bold uppercase tracking-[.18em] text-[#b95740]">
          Espace utilisateur
        </span>

        <h1 className="mt-2 font-display text-5xl font-bold tracking-[-.05em]">
          Tout PAYLOCA au même endroit.
        </h1>

        <p className="mt-4 max-w-2xl text-base leading-7 text-[#676b76]">
          Recherchez des annonces, gardez vos favoris, échangez avec les propriétaires et participez à la communauté.
        </p>

        <div className="mt-9 grid gap-4 md:grid-cols-3">
          <Link
            href="/annonces"
            className="rounded-[22px] border border-[#dfd7c4] bg-[#faf6ec] p-5 shadow-[0_5px_0_#e8deca]"
          >
            <h2 className="font-display text-2xl font-bold">
              Les annonces
            </h2>

            <p className="mt-2 text-sm leading-6 text-[#676b76]">
              Voir les biens actuellement disponibles.
            </p>
          </Link>

          <Link
            href="/favoris"
            className="rounded-[22px] border border-[#dfd7c4] bg-[#faf6ec] p-5 shadow-[0_5px_0_#e8deca]"
          >
            <h2 className="font-display text-2xl font-bold">
              Mes favoris
            </h2>

            <p className="mt-2 text-sm leading-6 text-[#676b76]">
              Retrouver vos sélections sur cet appareil.
            </p>
          </Link>

          <Link
            href="/messages"
            className="rounded-[22px] border border-[#dfd7c4] bg-[#faf6ec] p-5 shadow-[0_5px_0_#e8deca]"
          >
            <h2 className="font-display text-2xl font-bold">
              Messages
            </h2>

            <p className="mt-2 text-sm leading-6 text-[#676b76]">
              Échanger sans sortir de PAYLOCA.
            </p>
          </Link>
        </div>

        <UserFunPanel />
      </section>
    </Shell>
  );
}

function Router() {
  const [location] =
    useLocation();

  const {
    isLoaded,
    isSignedIn,
    accountTypeRequired,
  } = usePaylocaAuth();

  const isAuthRoute =
    location.startsWith("/sign-in")
    || location.startsWith("/sign-up");

  if (location.startsWith("/sign-in")) {
    return <SignInPage />;
  }

  if (location.startsWith("/sign-up")) {
    return <SignInPage />;
  }

  if (!isLoaded) {
    return (
      <div className="auth-shell flex min-h-[100dvh] items-center justify-center bg-[#e8ddc6] p-5">
        <div className="w-full max-w-md rounded-[28px] bg-[#faf6ec] p-8 text-center shadow-[0_5px_0_#e8deca]">
          <p className="text-xs font-bold uppercase tracking-[.18em] text-[#b95740]">
            PAYLOCA
          </p>

          <h1 className="mt-3 font-display text-3xl font-bold">
            Préparation de votre compte…
          </h1>

          <p className="mt-3 text-sm leading-6 text-[#676b76]">
            Vérification de votre session sécurisée.
          </p>
        </div>
      </div>
    );
  }

  if (
    isSignedIn
    && accountTypeRequired
    && !isAuthRoute
  ) {
    return <SignInPage />;
  }

  if (
    location.startsWith(
      "/espace-agence",
    )
  ) {
    return (
      <ErrorBoundary resetKey={location}>
        <AccountSpacePage expected="agency" />
      </ErrorBoundary>
    );
  }

  if (
    location.startsWith("/espace-ong")
  ) {
    return (
      <ErrorBoundary resetKey={location}>
        <AccountSpacePage expected="ong" />
      </ErrorBoundary>
    );
  }

  if (
    location.startsWith(
      "/espace-utilisateur",
    )
  ) {
    return (
      <ErrorBoundary resetKey={location}>
        <AccountSpacePage expected="user" />
      </ErrorBoundary>
    );
  }

  if (
    location.startsWith("/messages")
  ) {
    return (
      <ErrorBoundary resetKey={location}>
        <ProtectedMessagesPage />
      </ErrorBoundary>
    );
  }

  if (
    location.startsWith("/services")
  ) {
    return (
      <ErrorBoundary resetKey={location}>
        <Shell>
          <ServicesPage />
        </Shell>
      </ErrorBoundary>
    );
  }

  if (
    location.startsWith("/emplois")
  ) {
    return (
      <ErrorBoundary resetKey={location}>
        <Shell>
          <JobsPage />
        </Shell>
      </ErrorBoundary>
    );
  }

  if (
    location === "/boutique"
    || location.startsWith("/boutique?")
  ) {
    return (
      <ErrorBoundary resetKey={location}>
        <AccountTypeGate allowed={["agency"]}>
          <Shell>
            <SellerProfilePage />
          </Shell>
        </AccountTypeGate>
      </ErrorBoundary>
    );
  }

  if (location.startsWith("/profil/")) {
    const userId =
      decodeURIComponent(
        location
          .slice("/profil/".length)
          .split(/[/?#]/)[0] ?? "",
      );

    return (
      <ErrorBoundary resetKey={location}>
        <Shell>
          <SellerProfilePage userId={userId} />
        </Shell>
      </ErrorBoundary>
    );
  }

  if (location.startsWith("/fil")) {
    return (
      <ErrorBoundary resetKey={location}>
        <AuthGate>
          <Shell>
            <FunPage />
          </Shell>
        </AuthGate>
      </ErrorBoundary>
    );
  }

  if (
    location.startsWith("/recherche")
  ) {
    return (
      <ErrorBoundary resetKey={location}>
        <Shell>
          <SearchPage />
        </Shell>
      </ErrorBoundary>
    );
  }

  if (location.startsWith("/sos")) {
    return (
      <ErrorBoundary resetKey={location}>
        <Shell>
          <SosPage />
        </Shell>
      </ErrorBoundary>
    );
  }

  if (
    location.startsWith(
      "/ligue-payloca",
    )
  ) {
    return (
      <ErrorBoundary resetKey={location}>
        <LeaguePage />
      </ErrorBoundary>
    );
  }

  if (location.startsWith("/appels")) {
    return (
      <ErrorBoundary resetKey={location}>
        <CallsPage />
      </ErrorBoundary>
    );
  }

  if (
    location.startsWith("/parrainage")
    || location.startsWith("/invite/")
  ) {
    return (
      <ErrorBoundary resetKey={location}>
        <ReferralPage />
      </ErrorBoundary>
    );
  }

  if (location.startsWith("/aide")) {
    return (
      <ErrorBoundary resetKey={location}>
        <HelpPage />
      </ErrorBoundary>
    );
  }

  if (
    location.startsWith("/stories")
  ) {
    return (
      <ErrorBoundary resetKey={location}>
        <StoriesPage />
      </ErrorBoundary>
    );
  }

  if (location.startsWith("/famille")) {
    return (
      <ErrorBoundary resetKey={location}>
        <FamilyPage />
      </ErrorBoundary>
    );
  }

  if (
    location.startsWith(
      "/parametres-famille",
    )
  ) {
    return (
      <ErrorBoundary resetKey={location}>
        <FamilySettingsPage />
      </ErrorBoundary>
    );
  }

  if (
    location.startsWith(
      "/controle-parental",
    )
  ) {
    return (
      <ErrorBoundary resetKey={location}>
        <ParentalControlPage />
      </ErrorBoundary>
    );
  }

  if (
    location.startsWith("/chat-famille")
  ) {
    return (
      <ErrorBoundary resetKey={location}>
        <FamilyChatPage />
      </ErrorBoundary>
    );
  }

  if (
    location.startsWith("/abonnement")
  ) {
    return (
      <ErrorBoundary resetKey={location}>
        <PaylocaPlansPage />
      </ErrorBoundary>
    );
  }

  if (location === "/") {
    return (
      <ErrorBoundary resetKey={location}>
        <Home />
      </ErrorBoundary>
    );
  }

  if (location === "/annonces") {
    return (
      <ErrorBoundary resetKey={location}>
        <ListingsPage />
      </ErrorBoundary>
    );
  }

  if (
    location.startsWith("/annonces/")
  ) {
    return (
      <ErrorBoundary resetKey={location}>
        <DetailPage />
      </ErrorBoundary>
    );
  }

  if (
    location.startsWith("/favoris")
  ) {
    return (
      <ErrorBoundary resetKey={location}>
        <AuthGate>
          <FavoritesPage />
        </AuthGate>
      </ErrorBoundary>
    );
  }

  if (
    location.startsWith("/publier")
  ) {
    return (
      <ErrorBoundary resetKey={location}>
        <AuthGate>
          <ProtectedPublishPage />
        </AuthGate>
      </ErrorBoundary>
    );
  }

  if (
    location.startsWith(
      "/confidentialite",
    )
  ) {
    return (
      <ErrorBoundary resetKey={location}>
        <InfoPage
          title="Politique de confidentialité"
          eyebrow="Vos données, votre confiance"
        >
          <p>
            PAYLOCA utilise les informations nécessaires à votre compte et à vos annonces. Les publications du fil, leur auteur, leur communauté et leur ville sont publiques.
          </p>

          <p className="mt-4">
            Vos contacts SOS restent uniquement dans le stockage local de cet appareil, séparés par compte connecté. PAYLOCA ne les envoie pas à son serveur. Votre position n’est demandée qu’après votre consentement lors de la préparation d’un message SOS.
          </p>

          <p className="mt-6 font-semibold text-[#20283c]">
            Dernière mise à jour 28 août 2026.
          </p>
        </InfoPage>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary resetKey={location}>
      <Switch>
        <Route
          path="/"
          component={Home}
        />

        <Route
          path="/annonces"
          component={ListingsPage}
        />

        <Route
          path="/annonces/:id"
          component={DetailPage}
        />

        <Route
          path="/publier"
          component={ProtectedPublishPage}
        />

        <Route
          path="/favoris"
          component={FavoritesPage}
        />

        <Route
          path="/parametres"
          component={SettingsPage}
        />

        <Route path="/confidentialite">
          <InfoPage
            title="Politique de confidentialité"
            eyebrow="Vos données, votre confiance"
          >
            <p>
              PAYLOCA utilise les informations nécessaires à votre compte et à vos annonces. Les publications du fil, leur auteur, leur communauté et leur ville sont publiques. Vos contacts SOS restent uniquement dans le stockage local de cet appareil, séparés par compte connecté. PAYLOCA ne les envoie pas à son serveur.
            </p>

            <p className="mt-4">
              Votre position n’est demandée qu’après votre consentement lors de la préparation d’un message SOS. Elle sert alors à préparer un lien dans le SMS ; PAYLOCA n’envoie pas le message automatiquement et ne contacte pas les secours.
            </p>

            <p className="mt-6 font-semibold text-[#20283c]">
              Dernière mise à jour 26 août 2026.
            </p>
          </InfoPage>
        </Route>

        <Route path="/conditions">
          <InfoPage
            title="Conditions d'utilisation"
            eyebrow="Les règles de Payloca"
          >
            <p>
              En utilisant PAYLOCA, vous acceptez de publier uniquement des contenus et des biens légaux.
            </p>

            <p>
              PAYLOCA n’est pas responsable des transactions conclues entre utilisateurs.
            </p>

            <p>
              Tout litige doit être réglé entre les parties concernées.
            </p>
          </InfoPage>
        </Route>

        <Route
          path="/a-propos"
          component={AboutPage}
        />

        <Route component={NotFound} />
      </Switch>
    </ErrorBoundary>
  );
}

function AppContent() {
  const [location, setLocation] =
    useLocation();

  const { isSignedIn } =
    usePaylocaAuth();

  useEffect(() => {
    const handleOnline = () =>
      (document.body.dataset.offline =
        "false");

    const handleOffline = () =>
      (document.body.dataset.offline =
        "true");

    window.addEventListener(
      "online",
      handleOnline,
    );

    window.addEventListener(
      "offline",
      handleOffline,
    );

    return () => {
      window.removeEventListener(
        "online",
        handleOnline,
      );

      window.removeEventListener(
        "offline",
        handleOffline,
      );
    };
  }, []);

  const isAuthRoute =
    location.startsWith("/sign-in")
    || location.startsWith("/sign-up");

  return (
    <QueryClientProvider
      client={queryClient}
    >
      <TooltipProvider>
        <Router />

        <NotificationBootstrap />

        {isSignedIn
          && !isAuthRoute
          && <Onboarding />}

        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <FirebaseAuthProvider>
        <AppContent />
      </FirebaseAuthProvider>
    </WouterRouter>
  );
}

export default App;
