import { Link } from 'wouter';

export default function JobsPage() {
  return (
    <div className="page-shell py-10 md:py-16">
      <Link href="/" className="text-sm font-bold text-primary">← Retour à PAYLOCA</Link>
      <section className="mt-8 rounded-2xl border border-border bg-card p-6 text-center">
        <h1 className="font-display text-2xl font-bold text-foreground">Emplois PAYLOCA</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Cette section est en cours de synchronisation.
        </p>
      </section>
    </div>
  );
}
