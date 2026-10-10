import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { LogOut, Menu, Moon, Sun, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useHealth, useSession, SESSION_KEY } from '@/lib/session';
import { cn, getTheme, setTheme } from '@/lib/utils';
import { Button } from '@/components/ui/primitives';

export function Logo({ className }: { className?: string }) {
  return (
    <Link to="/" className={cn('flex items-center gap-2.5', className)} aria-label="MahaGuru AI home">
      <svg viewBox="0 0 64 64" className="h-7 w-7" aria-hidden>
        <rect width="64" height="64" rx="16" className="fill-brand" />
        <g transform="translate(-2.5 2)" className="text-on-brand">
          <path d="M16 45V24l14 14 13.5-13.5" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="46" cy="22" r="10" fill="currentColor" fillOpacity=".22" />
          <circle cx="46" cy="22" r="5.5" fill="currentColor" />
        </g>
      </svg>
      <span className="text-[17px] font-semibold tracking-tight">
        MahaGuru <span className="font-medium text-muted">AI</span>
      </span>
    </Link>
  );
}

const NAV = [
  { to: '/reflect', label: 'StudentGPT' },
  { to: '/learn', label: 'Classroom' },
  { to: '/research', label: 'Research' },
  { to: '/about', label: 'About' },
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
          Get started
        </Button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1">
      <Link
        to="/dashboard"
        onClick={onNavigate}
        className="rounded-lg px-3 py-2 text-sm font-medium text-muted hover:bg-sunken hover:text-ink"
      >
        Dashboard
      </Link>
      <Link
        to="/account"
        onClick={onNavigate}
        className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-ink hover:bg-sunken"
      >
        <span className="grid h-7 w-7 place-items-center rounded-full bg-brand text-xs font-semibold text-on-brand">
          {(user.display_name || user.email || '?').slice(0, 1).toUpperCase()}
        </span>
        <span className="max-w-[9rem] truncate">{user.display_name || user.email}</span>
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
    <div className="border-b border-warn/30 bg-warn-soft px-4 py-1.5 text-center text-xs text-ink">
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
    <header className="sticky top-0 z-40 border-b border-line bg-bg/90 backdrop-blur">
      <div className="container-page flex h-16 items-center justify-between gap-6">
        <div className="flex items-center gap-8">
          <Logo />
          <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) =>
                  cn(
                    'rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors hover:text-ink',
                    isActive && 'text-ink',
                  )
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
        </div>
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
        <div className="border-t border-line bg-surface px-4 pb-4 pt-2 md:hidden">
          <nav className="flex flex-col" aria-label="Mobile">
            {[...NAV, { to: '/dashboard', label: 'Dashboard' }, { to: '/account', label: 'Account' }].map((n) => (
              <NavLink key={n.to} to={n.to} className="rounded-lg px-2 py-3 text-[15px] font-medium hover:bg-sunken">
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="mt-3 border-t border-line pt-3">
            <AccountArea onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}
    </header>
  );
}

const FOOTER = [
  {
    title: 'Products',
    links: [
      { to: '/reflect', label: 'StudentGPT' },
      { to: '/learn', label: 'Classroom' },
      { to: '/dashboard', label: 'Dashboard' },
    ],
  },
  {
    title: 'Company',
    links: [
      { to: '/about', label: 'About' },
      { to: '/research', label: 'Research' },
      { href: 'https://github.com/aviraj1805/MahaGuru-V1', label: 'Open source' },
    ],
  },
  {
    title: 'Trust',
    links: [
      { to: '/safety', label: 'Safety and support' },
      { to: '/privacy', label: 'Privacy' },
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t border-line bg-sunken">
      <div className="container-page grid gap-10 py-14 text-sm md:grid-cols-[1.6fr_repeat(3,1fr)]">
        <div>
          <Logo />
          <p className="mt-4 max-w-xs leading-relaxed text-muted">
            Career clarity and personalised learning for college students across India.
          </p>
        </div>
        {FOOTER.map((col) => (
          <div key={col.title} className="flex flex-col gap-2.5">
            <span className="font-semibold text-ink">{col.title}</span>
            {col.links.map((l) =>
              'href' in l ? (
                <a key={l.label} href={l.href} target="_blank" rel="noreferrer" className="text-muted hover:text-ink">
                  {l.label}
                </a>
              ) : (
                <Link key={l.label} to={l.to} className="text-muted hover:text-ink">
                  {l.label}
                </Link>
              ),
            )}
          </div>
        ))}
      </div>
      <div className="border-t border-line">
        <div className="container-page flex flex-col gap-2 py-6 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>&copy; {new Date().getFullYear()} MahaGuru AI. Open source under the MIT License.</p>
          <p>
            StudentGPT is not a medical service. In a crisis in India, call Tele-MANAS on 14416 or emergency services on 112.
          </p>
        </div>
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
