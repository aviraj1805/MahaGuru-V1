import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
import { AlertTriangle, Info, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------- Button
type Variant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger' | 'reflect' | 'learn';
type Size = 'sm' | 'md' | 'lg' | 'icon';

const variants: Record<Variant, string> = {
  primary: 'bg-brand text-white hover:bg-brand/90',
  reflect: 'bg-brand text-white hover:bg-brand/90',
  learn: 'bg-brand text-white hover:bg-brand/90',
  secondary: 'bg-sunken text-ink hover:bg-line/70',
  outline: 'border border-line bg-surface text-ink hover:border-ink/25 hover:bg-sunken',
  ghost: 'text-ink hover:bg-sunken',
  danger: 'bg-danger text-white hover:bg-danger/90',
};
const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5 rounded-md',
  md: 'h-10 px-4 text-sm gap-2 rounded-lg',
  lg: 'h-11 px-5 text-[15px] gap-2 rounded-lg',
  icon: 'h-9 w-9 rounded-lg',
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, className, children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        'inline-flex select-none items-center justify-center whitespace-nowrap font-medium transition-colors disabled:pointer-events-none disabled:opacity-50',
        variants[variant],
        sizes[size],
        className,
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
});

// ---------------------------------------------------------------- Card
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('rounded-xl border border-line bg-surface', className)} {...props} />
  );
}

// ---------------------------------------------------------------- Form fields
export function Label({ className, ...props }: HTMLAttributes<HTMLLabelElement> & { htmlFor?: string }) {
  return <label className={cn('mb-1.5 block text-sm font-medium text-ink', className)} {...props} />;
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          'h-11 w-full rounded-lg border border-line bg-surface px-3.5 text-[15px] text-ink placeholder:text-muted/80 transition-colors focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15',
          className,
        )}
        {...props}
      />
    );
  },
);

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { autoGrow?: boolean; maxRows?: number };

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, autoGrow, maxRows = 8, onInput, ...props },
  ref,
) {
  const inner = useRef<HTMLTextAreaElement | null>(null);
  const resize = () => {
    const el = inner.current;
    if (!el || !autoGrow) return;
    el.style.height = 'auto';
    const line = parseFloat(getComputedStyle(el).lineHeight) || 22;
    el.style.height = Math.min(el.scrollHeight, line * maxRows + 24) + 'px';
  };
  useEffect(() => {
    resize();
  }, [props.value]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <textarea
      ref={(el) => {
        inner.current = el;
        if (typeof ref === 'function') ref(el);
        else if (ref) ref.current = el;
      }}
      onInput={(e) => {
        resize();
        onInput?.(e);
      }}
      className={cn(
        'w-full resize-none rounded-lg border border-line bg-surface px-3.5 py-3 text-[15px] leading-relaxed text-ink placeholder:text-muted/80 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15',
        className,
      )}
      {...props}
    />
  );
});

// ---------------------------------------------------------------- Feedback
export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <span role="status" className={cn('inline-flex items-center gap-2 text-muted', className)}>
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      {label && <span className="text-sm">{label}</span>}
      {!label && <span className="sr-only">Loading</span>}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-lg bg-sunken', className)} aria-hidden />;
}

export function Badge({
  tone = 'neutral',
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: 'neutral' | 'reflect' | 'learn' | 'ok' | 'warn' | 'danger' | 'brand' }) {
  const tones = {
    neutral: 'bg-sunken text-muted',
    reflect: 'bg-reflect-soft text-reflect-ink',
    learn: 'bg-learn-soft text-learn-ink',
    brand: 'bg-brand-soft text-brand-ink',
    ok: 'bg-ok-soft text-ok',
    warn: 'bg-warn-soft text-warn',
    danger: 'bg-danger-soft text-danger',
  };
  return (
    <span
      className={cn('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium', tones[tone], className)}
      {...props}
    />
  );
}

export function ProgressBar({
  value,
  tone = 'learn',
  className,
  label,
}: {
  value: number;
  tone?: 'learn' | 'reflect' | 'brand';
  className?: string;
  label?: string;
}) {
  const v = Math.max(0, Math.min(100, value));
  const color = { learn: 'bg-learn', reflect: 'bg-reflect', brand: 'bg-brand' }[tone];
  return (
    <div
      className={cn('h-2 w-full overflow-hidden rounded-full bg-sunken', className)}
      role="progressbar"
      aria-valuenow={Math.round(v)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div className={cn('h-full rounded-full transition-[width] duration-500', color)} style={{ width: `${v}%` }} />
    </div>
  );
}

export function Alert({
  tone = 'info',
  title,
  children,
  action,
  className,
}: {
  tone?: 'info' | 'warn' | 'danger';
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const styles = {
    info: 'border-brand/20 bg-brand-soft text-brand-ink',
    warn: 'border-warn/30 bg-warn-soft text-ink',
    danger: 'border-danger/30 bg-danger-soft text-ink',
  }[tone];
  const Icon = tone === 'info' ? Info : AlertTriangle;
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cn('flex gap-3 rounded-lg border p-3.5 text-sm', styles, className)}>
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', tone === 'danger' && 'text-danger', tone === 'warn' && 'text-warn')} aria-hidden />
      <div className="min-w-0 flex-1">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className={cn(title && 'mt-0.5', 'opacity-90')}>{children}</div>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  children,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-12 text-center', className)}>
      {icon && <div className="mb-4 grid h-11 w-11 place-items-center rounded-lg border border-line bg-surface text-muted">{icon}</div>}
      <h3 className="font-display font-semibold tracking-tight text-xl text-ink">{title}</h3>
      {children && <div className="mt-2 max-w-md text-sm text-muted">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <EmptyState
      icon={<AlertTriangle className="h-5 w-5" />}
      title="Something went wrong"
      action={onRetry && <Button variant="outline" onClick={onRetry}>Try again</Button>}
    >
      {message}
    </EmptyState>
  );
}

// ---------------------------------------------------------------- Dialog
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    setTimeout(() => panel.current?.querySelector<HTMLElement>('input,textarea,button')?.focus(), 0);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-ink/50" onClick={onClose} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-t`}
        className={cn(
          'relative max-h-[90vh] w-full overflow-y-auto rounded-t-2xl border border-line bg-surface p-6 shadow-lift animate-fade-up sm:max-w-lg sm:rounded-2xl',
          className,
        )}
      >
        <button onClick={onClose} className="absolute right-4 top-4 rounded-lg p-1.5 text-muted hover:bg-sunken" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
        <h2 id={`${id}-t`} className="pr-8 font-display font-semibold tracking-tight text-xl">{title}</h2>
        {description && <p className="mt-1.5 text-sm text-muted">{description}</p>}
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}
