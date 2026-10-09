import { Link } from 'react-router-dom';
import { PageShell } from '@/components/layout/AppShell';

export default function NotFound() {
  return (
    <PageShell>
      <div className="container-page py-28 text-center">
        <p className="eyebrow">404</p>
        <h1 className="mt-3 font-serif text-4xl">This page doesn't exist</h1>
        <p className="mt-3 text-muted">It may have been moved or deleted.</p>
        <Link to="/" className="mt-6 inline-block font-medium text-brand hover:underline">
          Go home
        </Link>
      </div>
    </PageShell>
  );
}
