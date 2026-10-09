import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { BookOpen, LayoutDashboard, LogOut, Menu, Moon, Sparkles, Sun, User as UserIcon, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useHealth, useSession, SESSION_KEY } from '@/lib/session';
import { cn, getTheme, setTheme } from '@/lib/utils';
import { Button } from '@/components/ui/primitives';

export function Logo({ className }: { className?: string }) {
  return (
    <Link to="/" className={cn('flex items-center gap-2.5', className)} aria-label="MahaGuru AI home">
      <svg viewBox="0 0 64 64" className="h-8 w-8" aria-hidden>
        <rect width="64" height="64" rx="16" className="fill-brand" />
        <path d="M18 44V22l14 13 14-13v22" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="font-serif text-[19px] font-medium tracking-tight">
        MahaGuru <span className="text-muted">AI</span>
      </span>
    </Link>
  );
}

const NAV = [
  { to: '/reflect', label: 'StudentGPT', icon: Sparkles, tone: 'text-reflect' },
  { to: '/learn', label: 'Classroom', icon: BookOpen, tone: 'text-learn' },
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, tone: 'text-brand' },
];

function ThemeToggle() {
  const [theme, set] = useState<'light' | 'dark'>(() => getTheme());
  return (
    <button
      onClick={() => {
        const next = theme === 'dark' ? 'light' : 'dark';
        setTheme(next);
        set(next);
      }}
      className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-sunken hover:text-ink"
      aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
    >
      {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}

function AccountArea({ onNavigate }: { onNavigate?: () => void }) {
  const { data } = useSession();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const user = data?.user;
  if (!user || user.is_guest) {
    return (
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => { navigate('/login'); onNavigate?.(); }}>
          Log in
        </Button>
        <Button size="sm" onClick={() => { navigate('/signup'); onNavigate?.(); }}>
          Sign up free
        </Button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1">
      <Link
        to="/account"
        onClick={onNavigate}
        className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-ink hover:bg-sunken"
      >
        <span className="grid h-7 w-7 place-items-center rounded-full bg-brand-soft text-xs font-semibold text-brand-ink">
          {(user.display_name || user.email || '?').slice(0, 1).toUpperCase()}
        </span>
        <span className="max-w-[10rem] truncate">{user.display_name || user.email}</span>
      </Link>
      <button
        className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-sunken hover:text-ink"
        aria-label="Log out"
        onClick={async () => {
          await api('/api/auth/logout', { method: 'POST' });
          qc.clear();
          await qc.invalidateQueries({ queryKey: SESSION_KEY });
          navigate('/');
          onNavigate?.();
        }}
      >
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  );
}

function DemoBanner() {
  const { data } = useHealth();
  if (!data?.demo_mode) return null;
  return (
    <div className="bg-warn-soft px-4 py-1.5 text-center text-xs text-ink">
      Offline demo mode: AI replies are placeholders. Add a free Gemini API key to enable real AI.
    </div>
  );
}

export function TopNav() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);
  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-bg/85 backdrop-blur-md">
      <div className="container-page flex h-16 items-center justify-between gap-4">
        <Logo />
        <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors hover:text-ink',
                  isActive && 'bg-sunken text-ink',
                )
              }
            >
              <n.icon className={cn('h-4 w-4', n.tone)} aria-hidden />
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="hidden items-center gap-1 md:flex">
          <ThemeToggle />
          <AccountArea />
        </div>
        <div className="flex items-center gap-1 md:hidden">
          <ThemeToggle />
          <button
            className="grid h-9 w-9 place-items-center rounded-lg hover:bg-sunken"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>
      {open && (
        <div className="border-t border-line bg-surface px-4 pb-4 pt-2 md:hidden animate-fade-up">
          <nav className="flex flex-col" aria-label="Mobile">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} className="flex items-center gap-3 rounded-lg px-2 py-3 text-[15px] font-medium hover:bg-sunken">
                <n.icon className={cn('h-4 w-4', n.tone)} aria-hidden /> {n.label}
              </NavLink>
            ))}
            <NavLink to="/account" className="flex items-center gap-3 rounded-lg px-2 py-3 text-[15px] font-medium hover:bg-sunken">
              <UserIcon className="h-4 w-4 text-muted" aria-hidden /> Account
            </NavLink>
          </nav>
          <div className="mt-3 border-t border-line pt-3">
            <AccountArea onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}
    </header>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-line bg-surface/50">
      <div className="container-page grid gap-8 py-10 text-sm text-muted md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-3 max-w-sm leading-relaxed">
            From confusion to clarity. Reflective mentorship and personalised learning for college students.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <span className="eyebrow">Products</span>
          <Link to="/reflect" className="hover:text-ink">StudentGPT</Link>
          <Link to="/learn" className="hover:text-ink">Classroom</Link>
          <Link to="/dashboard" className="hover:text-ink">Dashboard</Link>
        </div>
        <div className="flex flex-col gap-2">
          <span className="eyebrow">About</span>
          <Link to="/safety" className="hover:text-ink">Safety & support</Link>
          <Link to="/privacy" className="hover:text-ink">Privacy</Link>
          <a href="https://github.com/aviraj1805/MahaGuru-V1" className="hover:text-ink" target="_blank" rel="noreferrer">
            Open source on GitHub
          </a>
        </div>
      </div>
      <div className="container-page border-t border-line py-5 text-xs text-muted">
        StudentGPT is an AI mentor for reflection, not a therapist or medical service. If you are in
        crisis in India, call Tele-MANAS at 14416 or emergency services at 112.
      </div>
    </footer>
  );
}

export function PageShell({ children, footer = true }: { children: ReactNode; footer?: boolean }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      <DemoBanner />
      <TopNav />
      <main id="main" className="flex-1">
        {children}
      </main>
      {footer && <Footer />}
    </div>
  );
}
