import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Check, ChevronDown, ChevronUp, Copy, ExternalLink, HelpCircle, Loader2, X } from 'lucide-react';
import { safeUrl } from '@/utils/validation';
import { useI18n } from '@/i18n';
import type { Confidence, SourceRunStatus, Verification } from '@/types';

export function cx(...c: Array<string | false | null | undefined>): string {
  return c.filter(Boolean).join(' ');
}

/* ------------------------------- Buttons ------------------------------- */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'gold';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-bw-red hover:bg-bw-red-bright text-white border-bw-red-bright/40',
  secondary: 'bg-bw-elev hover:bg-[#26262c] text-bw-text border-bw-border',
  ghost: 'bg-transparent hover:bg-bw-elev text-bw-muted hover:text-bw-text border-transparent',
  danger: 'bg-transparent hover:bg-bw-red/20 text-bw-red-bright border-bw-red/50',
  gold: 'bg-bw-gold/10 hover:bg-bw-gold/20 text-bw-gold border-bw-gold/40',
};

export function Button({ variant = 'secondary', size = 'md', loading, icon, children, className, disabled, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md'; loading?: boolean; icon?: ReactNode }) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-md border font-medium transition-colors disabled:opacity-45 disabled:cursor-not-allowed whitespace-nowrap',
        size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-2 text-sm',
        VARIANTS[variant],
        className,
      )}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}

/* -------------------------------- Layout -------------------------------- */

export function Card({ title, actions, children, className, subtitle }: { title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('rounded-lg border border-bw-border bg-bw-panel/95 shadow-[0_1px_0_rgba(255,255,255,0.03)_inset]', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-bw-border px-4 py-2.5">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold tracking-wide text-bw-text">{title}</h2>}
            {subtitle && <p className="text-xs text-bw-muted">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function PageHeader({ icon, title, description, actions }: { icon?: ReactNode; title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        {icon && <div className="mt-0.5 rounded-md border border-bw-red/40 bg-bw-red/15 p-2 text-bw-red-bright">{icon}</div>}
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-bw-text">{title}</h1>
          {description && <p className="mt-0.5 max-w-3xl text-sm text-bw-muted">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/** Contextual help: description, how to use, examples (prompt §7.3). */
export function HelpBox({ children, examples, onExample, storageKey }: { children: ReactNode; examples?: string[]; onExample?: (v: string) => void; storageKey: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(`bw.help.${storageKey}`) !== 'closed';
    } catch {
      return true;
    }
  });
  const toggle = () => {
    setOpen((o) => {
      try {
        localStorage.setItem(`bw.help.${storageKey}`, o ? 'closed' : 'open');
      } catch {
        /* ignore */
      }
      return !o;
    });
  };
  return (
    <div className="mb-4 rounded-lg border border-bw-gold/25 bg-bw-gold/[0.04] text-sm">
      <button type="button" onClick={toggle} className="flex w-full items-center gap-2 px-3 py-2 text-left text-bw-gold" aria-expanded={open}>
        <HelpCircle className="size-4" aria-hidden />
        <span className="font-medium">{t('help.title')}</span>
        {open ? <ChevronUp className="ml-auto size-4" /> : <ChevronDown className="ml-auto size-4" />}
      </button>
      {open && (
        <div className="space-y-2 px-3 pb-3 text-bw-muted">
          {children}
          {examples && examples.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-xs uppercase tracking-wider text-bw-gold-dim">{t('help.examples')}</span>
              {examples.map((ex) => (
                <button key={ex} type="button" onClick={() => onExample?.(ex)} className="rounded border border-bw-border bg-bw-elev px-2 py-0.5 font-mono text-xs text-bw-text hover:border-bw-gold/50">
                  {ex}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* -------------------------------- Inputs -------------------------------- */

const fieldCls = 'w-full rounded-md border border-bw-border bg-bw-bg px-3 py-2 text-sm text-bw-text placeholder:text-bw-muted/60 focus:border-bw-gold/60 focus:outline-none disabled:opacity-50';

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(fieldCls, props.className)} />;
}
export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(fieldCls, 'min-h-24', props.className)} />;
}
export function Select({ children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={cx(fieldCls, 'pr-8', props.className)}>
      {children}
    </select>
  );
}

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string | null; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-xs font-medium uppercase tracking-wider text-bw-muted">
        {label}
      </label>
      {children(id)}
      {error ? (
        <p role="alert" className="text-xs text-bw-red-bright">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-bw-muted/80">{hint}</p>
      ) : null}
    </div>
  );
}

export function Checkbox({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; disabled?: boolean }) {
  return (
    <label className={cx('inline-flex cursor-pointer items-center gap-2 text-sm', disabled && 'cursor-not-allowed opacity-50')}>
      <input type="checkbox" className="size-4 accent-[#c42f37]" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

/* -------------------------------- Badges -------------------------------- */

export function Badge({ children, tone = 'neutral', title }: { children: ReactNode; tone?: 'neutral' | 'red' | 'gold' | 'ok' | 'warn' | 'info'; title?: string }) {
  const tones = {
    neutral: 'border-bw-border bg-bw-elev text-bw-muted',
    red: 'border-bw-red/50 bg-bw-red/15 text-bw-red-bright',
    gold: 'border-bw-gold/40 bg-bw-gold/10 text-bw-gold',
    ok: 'border-bw-ok/40 bg-bw-ok/10 text-bw-ok',
    warn: 'border-bw-warn/40 bg-bw-warn/10 text-bw-warn',
    info: 'border-bw-info/40 bg-bw-info/10 text-[#7aa5dc]',
  };
  return (
    <span title={title} className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded border px-1.5 py-0.5 text-[11px] font-medium', tones[tone])}>
      {children}
    </span>
  );
}

const VERIF_TONE: Record<Verification, 'ok' | 'info' | 'gold' | 'warn' | 'neutral'> = {
  verified: 'ok',
  'public-source': 'info',
  correlation: 'gold',
  hypothesis: 'warn',
  unverified: 'neutral',
};

export function VerificationBadge({ v }: { v: Verification }) {
  const { td } = useI18n();
  return <Badge tone={VERIF_TONE[v]}>{td(`verif.${v}`)}</Badge>;
}

export function ConfidenceBadge({ c }: { c: Confidence }) {
  const { td } = useI18n();
  const tone = c === 'high' ? 'ok' : c === 'medium' ? 'gold' : c === 'low' ? 'warn' : 'neutral';
  return (
    <Badge tone={tone} title={td('common.confidence')}>
      {td(`conf.${c}`)}
    </Badge>
  );
}

export function StatusBadge({ s }: { s: SourceRunStatus }) {
  const { td } = useI18n();
  const tone: Record<SourceRunStatus, 'neutral' | 'red' | 'gold' | 'ok' | 'warn' | 'info'> = {
    available: 'neutral',
    queued: 'neutral',
    running: 'info',
    completed: 'ok',
    partial: 'gold',
    'rate-limited': 'warn',
    unavailable: 'red',
    unsupported: 'neutral',
    'requires-manual-action': 'gold',
    disabled: 'neutral',
    cancelled: 'neutral',
  };
  return (
    <Badge tone={tone[s]}>
      {s === 'running' && <Loader2 className="size-3 animate-spin" aria-hidden />}
      {td(`status.${s}`)}
    </Badge>
  );
}

/* --------------------------------- Links --------------------------------- */

/** External link: only http(s), never sends a referrer, always a new tab. */
export function SafeLink({ href, children, className, title }: { href: string | undefined | null; children?: ReactNode; className?: string; title?: string }) {
  const url = safeUrl(href ?? '');
  if (!url) return <span className={className}>{children ?? href}</span>;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer nofollow" referrerPolicy="no-referrer" title={title ?? url} className={cx('inline-flex items-center gap-1 break-all text-bw-gold hover:underline', className)}>
      {children ?? url}
      <ExternalLink className="size-3 shrink-0 opacity-70" aria-hidden />
    </a>
  );
}

export function CopyButton({ value, label }: { value: string; label?: string }) {
  const { t } = useI18n();
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      title={label ?? t('common.copy')}
      aria-label={label ?? t('common.copy')}
      className="rounded p-1 text-bw-muted hover:bg-bw-elev hover:text-bw-text"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setOk(true);
          setTimeout(() => setOk(false), 1200);
        } catch {
          /* clipboard blocked */
        }
      }}
    >
      {ok ? <Check className="size-3.5 text-bw-ok" /> : <Copy className="size-3.5" />}
    </button>
  );
}

/* --------------------------------- Modal --------------------------------- */

export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const { t } = useI18n();
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    setTimeout(() => ref.current?.querySelector<HTMLElement>('input,textarea,select,button')?.focus(), 0);
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[1000] flex items-end justify-center bg-black/70 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className={cx('flex max-h-[92vh] w-full flex-col rounded-t-xl border border-bw-border bg-bw-panel shadow-2xl sm:rounded-xl', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg')}>
        <header className="flex items-center justify-between border-b border-bw-border px-4 py-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <button type="button" onClick={onClose} aria-label={t('common.close')} className="rounded p-1 text-bw-muted hover:bg-bw-elev hover:text-bw-text">
            <X className="size-4" />
          </button>
        </header>
        <div className="overflow-y-auto p-4">{children}</div>
        {footer && <footer className="flex flex-wrap justify-end gap-2 border-t border-bw-border px-4 py-3">{footer}</footer>}
      </div>
    </div>
  );
}

/* ------------------------------ Misc helpers ------------------------------ */

export function EmptyState({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-bw-border px-4 py-10 text-center">
      {icon && <div className="text-bw-muted/60">{icon}</div>}
      <p className="font-medium text-bw-text">{title}</p>
      {children && <div className="max-w-md text-sm text-bw-muted">{children}</div>}
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: Array<{ id: T; label: string; count?: number }> }) {
  return (
    <div role="tablist" className="mb-4 flex gap-1 overflow-x-auto border-b border-bw-border">
      {items.map((it) => (
        <button
          key={it.id}
          role="tab"
          type="button"
          aria-selected={value === it.id}
          onClick={() => onChange(it.id)}
          className={cx('-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm', value === it.id ? 'border-bw-red-bright text-bw-text' : 'border-transparent text-bw-muted hover:text-bw-text')}
        >
          {it.label}
          {it.count !== undefined && <span className="ml-1.5 rounded bg-bw-elev px-1.5 text-xs text-bw-muted">{it.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Pagination({ page, pageCount, onPage }: { page: number; pageCount: number; onPage: (p: number) => void }) {
  const { t } = useI18n();
  if (pageCount <= 1) return null;
  return (
    <div className="mt-3 flex items-center justify-end gap-2 text-sm text-bw-muted">
      <Button size="sm" variant="ghost" disabled={page <= 0} onClick={() => onPage(page - 1)}>
        {t('common.prev')}
      </Button>
      <span>
        {page + 1} / {pageCount}
      </span>
      <Button size="sm" variant="ghost" disabled={page >= pageCount - 1} onClick={() => onPage(page + 1)}>
        {t('common.next')}
      </Button>
    </div>
  );
}

export function usePaged<T>(items: T[], size = 50) {
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(items.length / size));
  const p = Math.min(page, pageCount - 1);
  return { page: p, pageCount, setPage, slice: items.slice(p * size, p * size + size) };
}

export function Stat({ label, value, icon, hint }: { label: string; value: ReactNode; icon?: ReactNode; hint?: string }) {
  return (
    <div className="relative overflow-hidden rounded-lg border border-bw-border bg-bw-panel p-4">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-bw-gold/40 to-transparent" />
      <div className="flex items-center justify-between text-bw-muted">
        <span className="text-xs uppercase tracking-wider">{label}</span>
        {icon}
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums text-bw-text">{value}</div>
      {hint && <p className="mt-1 text-xs text-bw-muted">{hint}</p>}
    </div>
  );
}

export function KeyValue({ rows }: { rows: Array<[string, ReactNode]> }) {
  return (
    <dl className="grid grid-cols-[minmax(110px,max-content)_1fr] gap-x-4 gap-y-1.5 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-bw-muted">{k}</dt>
          <dd className="min-w-0 break-words font-mono text-[13px] text-bw-text">{v ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}
