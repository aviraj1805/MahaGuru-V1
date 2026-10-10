import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { PageShell } from '@/components/layout/AppShell';
import { Alert, Button, Card, Input, Label } from '@/components/ui/primitives';
import { api, errorMessage } from '@/lib/api';
import { SESSION_KEY, useSession } from '@/lib/session';
import type { Session } from '@/lib/types';

export default function AuthPage({ mode }: { mode: 'login' | 'signup' }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { data } = useSession();
  const isGuest = !!data?.user?.is_guest;
  const next = params.get('next') || '/dashboard';
  const signup = mode === 'signup';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const session = await api<Session>(signup ? '/api/auth/signup' : '/api/auth/login', {
        body: signup ? { email, password, display_name: name || undefined } : { email, password },
      });
      qc.clear();
      qc.setQueryData(SESSION_KEY, session);
      navigate(next.startsWith('/') ? next : '/dashboard');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageShell footer={false}>
      <div className="container-page grid min-h-[calc(100dvh-4rem)] items-center gap-16 py-12 lg:grid-cols-2">
        <div className="hidden lg:block">
          <p className="eyebrow text-brand">MahaGuru AI</p>
          <h2 className="mt-4 text-4xl font-semibold leading-tight tracking-tight">
            One account for your reflections, roadmaps and progress.
          </h2>
          <ul className="mt-8 space-y-4 text-muted">
            {[
              'Keep every StudentGPT conversation and clarity summary',
              'Resume any classroom exactly where you stopped',
              'A larger daily allowance, free of charge',
            ].map((t) => (
              <li key={t} className="flex gap-3">
                <Check className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden />
                {t}
              </li>
            ))}
          </ul>
        </div>
        <Card className="mx-auto w-full max-w-md p-7 sm:p-9">
          <h1 className="text-2xl font-semibold tracking-tight">{signup ? 'Create your free account' : 'Welcome back'}</h1>
          <p className="mt-2 text-sm text-muted">
            {signup
              ? 'Save your reflections and classrooms, and get a bigger daily allowance.'
              : 'Log in to continue your reflections and learning.'}
          </p>
          {isGuest && (
            <Alert className="mt-5" tone="info">
              {signup
                ? 'Everything you did as a guest will be kept in your new account.'
                : 'Anything you started as a guest will be moved into your account.'}
            </Alert>
          )}
          <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
            {signup && (
              <div>
                <Label htmlFor="name">Name (optional)</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={80} />
              </div>
            )}
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                required
                minLength={signup ? 8 : 1}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={signup ? 'new-password' : 'current-password'}
              />
              {signup && <p className="mt-1.5 text-xs text-muted">At least 8 characters.</p>}
            </div>
            {error && <Alert tone="danger">{error}</Alert>}
            <Button type="submit" className="w-full" size="lg" loading={busy} disabled={!email || !password}>
              {signup ? 'Create account' : 'Log in'}
            </Button>
          </form>
          <p className="mt-6 text-center text-sm text-muted">
            {signup ? 'Already have an account? ' : 'New to MahaGuru? '}
            <Link className="font-medium text-brand hover:underline" to={signup ? '/login' : '/signup'}>
              {signup ? 'Log in' : 'Create a free account'}
            </Link>
          </p>
        </Card>
      </div>
    </PageShell>
  );
}
