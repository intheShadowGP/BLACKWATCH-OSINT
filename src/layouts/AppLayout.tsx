import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ChevronsLeft, ChevronsRight, Loader2, Menu, Search, ShieldCheck, ShieldOff, X } from 'lucide-react';
import { NAV } from './nav';
import { useI18n } from '@/i18n';
import { useApp, useSettings } from '@/app/context';
import { cx } from '@/components/ui';
import { detectQueryType } from '@/utils/validation';
import { Logo } from '@/components/Logo';

const GROUP_LABEL = { core: 'nav.group.core', collect: 'nav.group.collect', analyse: 'nav.group.analyse', system: 'nav.group.system' } as const;

export function AppLayout() {
  const { t, lang, setLang } = useI18n();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('bw.sidebar') === 'collapsed';
    } catch {
      return false;
    }
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setMobileOpen(false), [location.pathname]);
  const toggle = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem('bw.sidebar', c ? 'open' : 'collapsed');
      } catch {
        /* ignore */
      }
      return !c;
    });

  const sidebar = (mobile: boolean) => (
    <nav aria-label={t('nav.main')} className="flex h-full flex-col">
      <div className={cx('flex h-14 items-center gap-2 border-b border-bw-border px-3', collapsed && !mobile && 'justify-center')}>
        <Logo className="size-7 shrink-0" />
        {(!collapsed || mobile) && (
          <div className="leading-tight">
            <div className="text-sm font-bold tracking-[0.2em] text-bw-text">BLACKWATCH</div>
            <div className="text-[10px] tracking-[0.35em] text-bw-gold">OSINT</div>
          </div>
        )}
        {mobile && (
          <button type="button" className="ml-auto p-1 text-bw-muted" aria-label={t('common.close')} onClick={() => setMobileOpen(false)}>
            <X className="size-5" />
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        {(['core', 'collect', 'analyse', 'system'] as const).map((g) => (
          <div key={g} className="mb-2">
            {(!collapsed || mobile) && <div className="px-4 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-bw-muted/60">{t(GROUP_LABEL[g])}</div>}
            {NAV.filter((n) => n.group === g).map((n) => (
              <NavLink
                key={n.id}
                to={n.path}
                end={n.path === '/'}
                title={collapsed && !mobile ? t(n.label) : undefined}
                className={({ isActive }) =>
                  cx(
                    'mx-2 flex items-center gap-3 rounded-md px-2.5 py-2 text-sm transition-colors',
                    collapsed && !mobile && 'justify-center',
                    isActive ? 'bg-bw-red/20 text-bw-text shadow-[inset_2px_0_0_var(--color-bw-red-bright)]' : 'text-bw-muted hover:bg-bw-elev hover:text-bw-text',
                  )
                }
              >
                <n.icon className="size-4 shrink-0" aria-hidden />
                {(!collapsed || mobile) && <span className="truncate">{t(n.label)}</span>}
              </NavLink>
            ))}
          </div>
        ))}
      </div>
      {!mobile && (
        <button type="button" onClick={toggle} className="flex items-center justify-center gap-2 border-t border-bw-border py-2.5 text-xs text-bw-muted hover:text-bw-text" aria-label={collapsed ? t('nav.expand') : t('nav.collapse')}>
          {collapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
          {!collapsed && t('nav.collapse')}
        </button>
      )}
    </nav>
  );

  return (
    <div className="flex h-full">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-bw-panel focus:px-3 focus:py-2">
        {t('nav.skip')}
      </a>
      <aside className={cx('hidden shrink-0 border-r border-bw-border bg-bw-panel transition-[width] duration-200 md:block', collapsed ? 'w-16' : 'w-60')}>{sidebar(false)}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-[900] md:hidden">
          <div className="absolute inset-0 bg-black/70" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 border-r border-bw-border bg-bw-panel">{sidebar(true)}</aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-bw-border bg-bw-panel/90 px-3 backdrop-blur sm:gap-3 sm:px-4">
          <button type="button" className="rounded p-1.5 text-bw-muted hover:text-bw-text md:hidden" aria-label={t('nav.open')} onClick={() => setMobileOpen(true)}>
            <Menu className="size-5" />
          </button>
          <GlobalSearch />
          <ActiveSelector />
          <PrivacyIndicator />
          <button type="button" onClick={() => setLang(lang === 'fr' ? 'en' : 'fr')} className="rounded border border-bw-border px-2 py-1 text-xs font-semibold text-bw-muted hover:text-bw-text" aria-label={t('settings.language')}>
            {lang === 'fr' ? 'EN' : 'FR'}
          </button>
        </header>
        <main id="main" className="bw-grid min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1400px] px-4 py-5 sm:px-6">
            <Suspense
              fallback={
                <div className="flex items-center gap-2 py-20 text-bw-muted">
                  <Loader2 className="size-5 animate-spin" /> {t('common.loading')}
                </div>
              }
            >
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  );
}

function GlobalSearch() {
  const { t, td } = useI18n();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const type = q.trim() ? detectQueryType(q) : null;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!q.trim()) return;
    navigate(`/search?q=${encodeURIComponent(q.trim())}`);
  };
  return (
    <form role="search" onSubmit={submit} className="relative min-w-0 flex-1">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-bw-muted" aria-hidden />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        maxLength={2000}
        placeholder={t('search.placeholder')}
        aria-label={t('search.placeholder')}
        className="w-full rounded-md border border-bw-border bg-bw-bg py-2 pl-9 pr-24 text-sm placeholder:text-bw-muted/60 focus:border-bw-gold/60 focus:outline-none"
      />
      {type && <span className="absolute right-2 top-1/2 -translate-y-1/2 rounded border border-bw-gold/40 bg-bw-gold/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-bw-gold">{td(`qt.${type}`)}</span>}
    </form>
  );
}

function ActiveSelector() {
  const { investigations, activeId, setActiveId } = useApp();
  const { t } = useI18n();
  return (
    <select
      value={activeId ?? ''}
      onChange={(e) => setActiveId(e.target.value || null)}
      aria-label={t('inv.activeLabel')}
      className="hidden max-w-56 truncate rounded-md border border-bw-border bg-bw-bg px-2 py-2 text-sm text-bw-text lg:block"
    >
      <option value="">{t('inv.noActiveShort')}</option>
      {investigations
        .filter((i) => i.status !== 'archived' || i.id === activeId)
        .map((i) => (
          <option key={i.id} value={i.id}>
            {i.isDemo ? '[DEMO] ' : ''}
            {i.name}
          </option>
        ))}
    </select>
  );
}

function PrivacyIndicator() {
  const s = useSettings();
  const { t } = useI18n();
  const navigate = useNavigate();
  const on = s.privacy.externalEnabled;
  return (
    <button
      type="button"
      onClick={() => navigate('/settings')}
      title={on ? t('privacy.externalOn') : t('privacy.externalOff')}
      aria-label={on ? t('privacy.externalOn') : t('privacy.externalOff')}
      className={cx('flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs', on ? 'border-bw-gold/40 text-bw-gold' : 'border-bw-ok/40 text-bw-ok')}
    >
      {on ? <ShieldCheck className="size-4" /> : <ShieldOff className="size-4" />}
      <span className="hidden xl:inline">{on ? t('privacy.modeHybrid') : t('privacy.modeLocal')}</span>
    </button>
  );
}
