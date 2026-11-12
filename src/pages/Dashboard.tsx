import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Activity as ActivityIcon, AlertTriangle, ArrowDown, ArrowUp, Boxes, Database, FolderKanban, LayoutDashboard, Radar, Rocket, Search, Trash2 } from 'lucide-react';
import { useI18n, type TKey } from '@/i18n';
import { useApp, useSettings } from '@/app/context';
import { db } from '@/services/storage/db';
import { SOURCES, getSource } from '@/services/sources/catalog';
import { loadDemo, removeDemo } from '@/services/storage/demo';
import { getSetting, setSetting } from '@/services/storage/repository';
import { NAV } from '@/layouts/nav';
import { formatDateTime } from '@/utils/common';
import { Badge, Button, Card, Checkbox, EmptyState, PageHeader, Stat } from '@/components/ui';
import { Logo } from '@/components/Logo';
import { rateStatus } from '@/services/adapters/http';

const CARD_IDS = ['stats', 'alerts', 'modules', 'inProgress', 'searches', 'sources', 'activity'] as const;
type CardId = (typeof CARD_IDS)[number];
interface Layout {
  order: CardId[];
  hidden: CardId[];
}
const DEFAULT_LAYOUT: Layout = { order: [...CARD_IDS], hidden: [] };
const WIDE: Partial<Record<CardId, boolean>> = { stats: true, alerts: true, modules: true };

function sanitizeLayout(l: Partial<Layout>): Layout {
  const order = (l.order ?? []).filter((x): x is CardId => (CARD_IDS as readonly string[]).includes(x));
  for (const id of CARD_IDS) if (!order.includes(id)) order.push(id);
  return { order, hidden: (l.hidden ?? []).filter((x): x is CardId => (CARD_IDS as readonly string[]).includes(x)) };
}

export default function Dashboard() {
  const { t, td, locale } = useI18n();
  const { setActiveId, toast, reportError, confirm } = useApp();
  const settings = useSettings();
  const navigate = useNavigate();
  const [storageInfo, setStorageInfo] = useState<{ persisted: boolean | null; usage?: number; quota?: number }>({ persisted: null });
  const [layout, setLayout] = useState<Layout>(DEFAULT_LAYOUT);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    void getSetting<Partial<Layout>>('dashboard.layout', DEFAULT_LAYOUT).then((l) => setLayout(sanitizeLayout(l)));
  }, []);
  const saveLayout = (l: Layout) => {
    setLayout(l);
    void setSetting('dashboard.layout', l);
  };

  // Indexed counts only — no full-table loads (§14).
  const data = useLiveQuery(async () => {
    // Booleans are not valid IndexedDB keys: the (small) investigations table is filtered.
    const demoIdsFallback = (await db.investigations.filter((i) => i.isDemo).primaryKeys()) as string[];
    const invTotal = await db.investigations.count();
    const [entTotal, entDemo, resTotal, resDemo] = await Promise.all([
      db.entities.count(),
      demoIdsFallback.length ? db.entities.where('investigationId').anyOf(demoIdsFallback).count() : 0,
      db.results.count(),
      demoIdsFallback.length ? db.results.where('investigationId').anyOf(demoIdsFallback).count() : 0,
    ]);
    const inProgress = await db.investigations
      .orderBy('updatedAt')
      .reverse()
      .filter((i) => i.status === 'open' || i.status === 'in-progress')
      .limit(6)
      .toArray();
    const runs = await db.runs.orderBy('createdAt').reverse().limit(6).toArray();
    const activity = await db.activity.orderBy('at').reverse().limit(12).toArray();
    const log = await db.requestLog.orderBy('at').reverse().limit(400).toArray();
    const lastBySource = new Map<string, (typeof log)[number]>();
    for (const l of log) if (!lastBySource.has(l.sourceId)) lastBySource.set(l.sourceId, l);
    const today = new Date().toISOString().slice(0, 10);
    const requestsToday = await db.requestLog.where('at').aboveOrEqual(today).count();
    return { invCount: invTotal - demoIdsFallback.length, demoCount: demoIdsFallback.length, entityCount: entTotal - entDemo, resultCount: resTotal - resDemo, inProgress, runs, activity, lastBySource, requestsToday };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const persisted = navigator.storage?.persisted ? await navigator.storage.persisted() : null;
        const est = navigator.storage?.estimate ? await navigator.storage.estimate() : undefined;
        setStorageInfo({ persisted, usage: est?.usage, quota: est?.quota });
      } catch {
        setStorageInfo({ persisted: null });
      }
    })();
  }, []);

  const apiSources = SOURCES.filter((s) => s.access === 'api');
  const activeSources = settings.privacy.externalEnabled ? apiSources.filter((s) => settings.modeOf(s.id) !== 'off').length : 0;

  const alerts: string[] = [];
  if (!settings.privacy.externalEnabled) alerts.push(t('dash.alert.offline'));
  if (storageInfo.persisted === false) alerts.push(t('dash.alert.notPersisted'));
  if (storageInfo.usage && storageInfo.quota && storageInfo.usage / storageInfo.quota > 0.8) alerts.push(t('dash.alert.quota'));
  for (const s of apiSources) if (rateStatus(s.id).coolingDownUntil) alerts.push(t('dash.alert.rateLimited', { name: s.name }));
  if (data) for (const [sid, l] of data.lastBySource) if (l.status === 'error' || l.status === 'timeout') alerts.push(t('dash.alert.sourceError', { name: getSource(sid)?.name ?? sid, when: formatDateTime(l.at, locale) }));

  const startDemo = async () => {
    try {
      const id = await loadDemo();
      setActiveId(id);
      toast(t('demo.loaded'));
      navigate(`/investigations/${id}`);
    } catch (e) {
      reportError(e);
    }
  };

  const isFirstRun = data && data.invCount === 0 && data.demoCount === 0;

  const cards: Record<CardId, ReactNode> = {
    stats: (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t('dash.investigations')} value={data?.invCount ?? '…'} icon={<FolderKanban className="size-4" />} hint={data?.demoCount ? t('dash.demoExcluded', { n: data.demoCount }) : undefined} />
        <Stat label={t('dash.entities')} value={data?.entityCount ?? '…'} icon={<Boxes className="size-4" />} />
        <Stat label={t('dash.results')} value={data?.resultCount ?? '…'} icon={<Database className="size-4" />} />
        <Stat label={t('dash.activeSources')} value={`${activeSources}/${apiSources.length}`} icon={<ActivityIcon className="size-4" />} hint={data ? t('dash.requestsToday', { n: data.requestsToday }) : undefined} />
      </div>
    ),
    alerts: alerts.length ? (
      <Card title={t('dash.alerts')} className="border-bw-warn/40">
        <ul className="space-y-1.5 text-sm">
          {alerts.slice(0, 8).map((a) => (
            <li key={a} className="flex items-start gap-2 text-bw-warn">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" /> <span>{a}</span>
            </li>
          ))}
        </ul>
      </Card>
    ) : null,
    modules: (
      <Card title={t('dash.modules')}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
          {NAV.filter((n) => n.id !== 'dashboard').map((n) => (
            <Link key={n.id} to={n.path} className="group rounded-md border border-bw-border bg-bw-panel2 p-3 transition-colors hover:border-bw-red/60">
              <n.icon className="mb-1.5 size-5 text-bw-red-bright transition-colors group-hover:text-bw-gold" />
              <div className="text-sm font-medium">{t(n.label)}</div>
              <div className="line-clamp-2 text-xs text-bw-muted">{t(n.desc)}</div>
            </Link>
          ))}
        </div>
      </Card>
    ),
    inProgress: (
      <Card title={t('dash.inProgress')} actions={<Link className="text-xs text-bw-gold hover:underline" to="/investigations">{t('common.all')}</Link>}>
        {!data?.inProgress.length ? (
          <EmptyState title={t('inv.empty')} />
        ) : (
          <ul className="space-y-2">
            {data.inProgress.map((i) => (
              <li key={i.id}>
                <Link to={`/investigations/${i.id}`} className="block rounded-md border border-bw-border px-3 py-2 hover:border-bw-gold/40">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{i.name}</span>
                    {i.isDemo && <Badge tone="warn">DEMO</Badge>}
                  </div>
                  <div className="text-xs text-bw-muted">
                    {td(`invStatus.${i.status}`)} · {formatDateTime(i.updatedAt, locale)}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {data && data.demoCount > 0 && (
          <div className="mt-3 flex gap-2">
            <Button size="sm" variant="ghost" icon={<Rocket className="size-3.5" />} onClick={startDemo}>
              {t('demo.reset')}
            </Button>
            <Button
              size="sm"
              variant="danger"
              icon={<Trash2 className="size-3.5" />}
              onClick={async () => {
                if (await confirm({ title: t('demo.remove'), message: t('demo.removeConfirm'), danger: true })) {
                  await removeDemo();
                  toast(t('demo.removed'));
                }
              }}
            >
              {t('demo.remove')}
            </Button>
          </div>
        )}
      </Card>
    ),
    searches: (
      <Card title={t('dash.recentSearches')} actions={<Link className="text-xs text-bw-gold hover:underline" to="/automation">{t('common.all')}</Link>}>
        {!data?.runs.length ? (
          <EmptyState icon={<Search className="size-6" />} title={t('dash.noSearches')} />
        ) : (
          <ul className="space-y-1.5 text-sm">
            {data.runs.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2">
                <Link to={`/search?run=${r.id}`} className="truncate font-mono text-bw-text hover:underline">
                  {r.query}
                </Link>
                <span className="shrink-0 text-xs text-bw-muted">{formatDateTime(r.createdAt, locale)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    ),
    sources: (
      <Card title={t('dash.sourceHealth')} actions={<Link className="text-xs text-bw-gold hover:underline" to="/sources">{t('common.all')}</Link>}>
        {!data?.lastBySource.size ? (
          <p className="text-sm text-bw-muted">{t('dash.noRequests')}</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {[...data.lastBySource.entries()].slice(0, 10).map(([sid, l]) => (
              <li key={sid} className="flex items-center justify-between gap-2">
                <span className="truncate">{getSource(sid)?.name ?? sid}</span>
                <Badge tone={typeof l.status === 'number' && l.status < 400 ? 'ok' : l.status === 404 ? 'neutral' : l.status === 429 ? 'warn' : 'red'}>{String(l.status)}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    ),
    activity: (
      <Card title={t('dash.activity')}>
        {!data?.activity.length ? (
          <p className="text-sm text-bw-muted">{t('dash.noActivity')}</p>
        ) : (
          <ul className="space-y-1.5 text-xs">
            {data.activity.map((a) => (
              <li key={a.id} className="flex gap-2">
                <span className="shrink-0 text-bw-muted">{formatDateTime(a.at, locale)}</span>
                <span className="truncate">
                  <span className="text-bw-gold">{td(`act.${a.action}`)}</span> {a.detail}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    ),
  };

  const move = (id: CardId, dir: -1 | 1) => {
    const o = [...layout.order];
    const i = o.indexOf(id);
    const j = i + dir;
    if (j < 0 || j >= o.length) return;
    [o[i], o[j]] = [o[j], o[i]];
    saveLayout({ ...layout, order: o });
  };

  return (
    <div>
      <PageHeader
        icon={<Radar className="size-5" />}
        title={t('dash.title')}
        description={t('desc.dashboard')}
        actions={
          <Button size="sm" variant={editing ? 'gold' : 'ghost'} icon={<LayoutDashboard className="size-4" />} onClick={() => setEditing((e) => !e)}>
            {editing ? t('dash.customizeDone') : t('dash.customize')}
          </Button>
        }
      />

      {editing && (
        <Card className="mb-4" title={t('dash.customize')} subtitle={t('dash.customizeHelp')}>
          <ul className="space-y-1">
            {layout.order.map((id, i) => (
              <li key={id} className="flex items-center gap-2 rounded border border-bw-border px-2 py-1">
                <Checkbox
                  checked={!layout.hidden.includes(id)}
                  onChange={(v) => saveLayout({ ...layout, hidden: v ? layout.hidden.filter((x) => x !== id) : [...layout.hidden, id] })}
                  label={t(`dash.card.${id}` as TKey)}
                />
                <span className="ml-auto flex gap-1">
                  <Button size="sm" variant="ghost" aria-label={t('dash.moveUp')} disabled={i === 0} icon={<ArrowUp className="size-3.5" />} onClick={() => move(id, -1)} />
                  <Button size="sm" variant="ghost" aria-label={t('dash.moveDown')} disabled={i === layout.order.length - 1} icon={<ArrowDown className="size-3.5" />} onClick={() => move(id, 1)} />
                </span>
              </li>
            ))}
          </ul>
          <Button size="sm" variant="ghost" className="mt-2" onClick={() => saveLayout(DEFAULT_LAYOUT)}>
            {t('common.reset')}
          </Button>
        </Card>
      )}

      {isFirstRun && (
        <div className="mb-6 overflow-hidden rounded-xl border border-bw-red/40 bg-gradient-to-br from-bw-red/15 via-bw-panel to-bw-panel">
          <div className="flex flex-col gap-6 p-6 md:flex-row md:items-center">
            <Logo className="size-20 shrink-0" />
            <div className="flex-1 space-y-2">
              <h2 className="text-lg font-semibold">{t('guide.title')}</h2>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-bw-muted">
                <li>{t('guide.step1')}</li>
                <li>{t('guide.step2')}</li>
                <li>{t('guide.step3')}</li>
                <li>{t('guide.step4')}</li>
                <li>{t('guide.step5')}</li>
              </ol>
              <p className="text-xs text-bw-muted">{t('guide.privacy')}</p>
            </div>
            <div className="flex flex-col gap-2">
              <Button variant="primary" icon={<FolderKanban className="size-4" />} onClick={() => navigate('/investigations?new=1')}>
                {t('inv.new')}
              </Button>
              <Button variant="gold" icon={<Rocket className="size-4" />} onClick={startDemo}>
                {t('demo.load')}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {layout.order
          .filter((id) => !layout.hidden.includes(id) && cards[id])
          .map((id) => (
            <div key={id} className={WIDE[id] ? 'min-w-0 lg:col-span-3' : 'min-w-0'}>
              {cards[id]}
            </div>
          ))}
      </div>
      <p className="mt-6 text-xs text-bw-muted">
        {t('dash.storageNote')}
        {storageInfo.usage !== undefined && storageInfo.quota ? ` — ${(storageInfo.usage / 1048576).toFixed(1)} MB / ${(storageInfo.quota / 1073741824).toFixed(1)} GB` : ''}
      </p>
    </div>
  );
}
