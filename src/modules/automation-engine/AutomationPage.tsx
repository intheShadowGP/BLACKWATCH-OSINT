import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Trash2, Workflow } from 'lucide-react';
import { useI18n } from '@/i18n';
import { useApp, useEngine, useSettings } from '@/app/context';
import { db } from '@/services/storage/db';
import { getSource, SOURCES } from '@/services/sources/catalog';
import { rateStatus } from '@/services/adapters/http';
import { formatDateTime } from '@/utils/common';
import { Badge, Button, Card, EmptyState, HelpBox, PageHeader, Pagination, Select, StatusBadge, usePaged } from '@/components/ui';

export default function AutomationPage() {
  const { t, td, locale } = useI18n();
  const eng = useEngine();
  const settings = useSettings();
  const { confirm, toast } = useApp();
  const runs = eng.listRuns();
  const [src, setSrc] = useState('');
  const log = useLiveQuery(() => db.requestLog.orderBy('at').reverse().limit(2000).toArray(), [], []);
  const filtered = log.filter((l) => !src || l.sourceId === src);
  const { slice, page, pageCount, setPage } = usePaged(filtered, 50);
  const runsPaged = usePaged(runs, 15);

  return (
    <div>
      <PageHeader icon={<Workflow className="size-5" />} title={t('nav.automation')} description={t('desc.automation')} />
      <HelpBox storageKey="automation">
        <p>{t('help.automation')}</p>
      </HelpBox>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title={t('auto.runs')} subtitle={t('auto.limits', { c: settings.limits.concurrency, s: Math.round(settings.limits.timeoutMs / 1000) })}>
          {!runs.length ? (
            <EmptyState title={t('dash.noSearches')}>
              <Link to="/search" className="text-bw-gold hover:underline">
                {t('search.title')}
              </Link>
            </EmptyState>
          ) : (
            <ul className="divide-y divide-bw-border text-sm">
              {runsPaged.slice.map((r) => (
                <li key={r.id} className="py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link to={`/search?run=${r.id}`} className="font-mono text-bw-text hover:underline">
                      {r.query}
                    </Link>
                    <Badge>{td(`qt.${r.queryType}`)}</Badge>
                    <span className="ml-auto text-xs text-bw-muted">{formatDateTime(r.createdAt, locale)}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {r.tasks.map((tk) => (
                      <span key={tk.sourceId} className="inline-flex items-center gap-1 text-xs text-bw-muted">
                        {getSource(tk.sourceId)?.name ?? tk.sourceId} <StatusBadge s={tk.status} />
                      </span>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <Pagination page={runsPaged.page} pageCount={runsPaged.pageCount} onPage={runsPaged.setPage} />
        </Card>
        <Card title={t('auto.quotas')}>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-bw-muted">
              <tr>
                <th className="py-1">{t('results.source')}</th>
                <th className="py-1">{t('auto.usedHour')}</th>
                <th className="py-1">{t('auto.budget')}</th>
                <th className="py-1">{t('common.status')}</th>
              </tr>
            </thead>
            <tbody>
              {SOURCES.filter((s) => s.access === 'api' && s.id !== 'osm-tiles').map((s) => {
                const rs = rateStatus(s.id);
                return (
                  <tr key={s.id} className="border-t border-bw-border/60">
                    <td className="py-1">{s.name}</td>
                    <td className="py-1 tabular-nums">{rs.usedLastHour}</td>
                    <td className="py-1 tabular-nums text-bw-muted">
                      {s.maxPerHour}/h · {s.minIntervalMs} ms
                    </td>
                    <td className="py-1">{rs.coolingDownUntil ? <Badge tone="warn">{t('auto.cooldown', { t: formatDateTime(new Date(rs.coolingDownUntil).toISOString(), locale) })}</Badge> : <Badge tone={settings.modeOf(s.id) === 'off' ? 'neutral' : 'ok'}>{td(`mode.${settings.modeOf(s.id)}`)}</Badge>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-bw-muted">{t('auto.quotaNote')}</p>
        </Card>
      </div>
      <Card
        className="mt-4"
        title={t('auto.requestLog')}
        subtitle={t('auto.requestLogHint')}
        actions={
          <>
            <Select className="max-w-56" value={src} onChange={(e) => setSrc(e.target.value)} aria-label={t('results.source')}>
              <option value="">{t('common.all')}</option>
              {SOURCES.filter((s) => s.access === 'api').map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
            <Button
              size="sm"
              variant="danger"
              icon={<Trash2 className="size-3.5" />}
              disabled={!log.length}
              onClick={async () => {
                if (await confirm({ title: t('auto.clearLog'), message: t('auto.clearLogConfirm'), danger: true })) {
                  await db.requestLog.clear();
                  toast(t('common.deleted'));
                }
              }}
            >
              {t('auto.clearLog')}
            </Button>
          </>
        }
      >
        {!filtered.length ? (
          <EmptyState title={t('dash.noRequests')} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-bw-muted">
                <tr>
                  <th className="py-1">{t('results.date')}</th>
                  <th className="py-1">{t('results.source')}</th>
                  <th className="py-1">Host</th>
                  <th className="py-1">{t('auto.sent')}</th>
                  <th className="py-1">HTTP</th>
                  <th className="py-1">ms</th>
                </tr>
              </thead>
              <tbody>
                {slice.map((l) => (
                  <tr key={l.id} className="border-t border-bw-border/60">
                    <td className="py-1 text-xs text-bw-muted">{formatDateTime(l.at, locale)}</td>
                    <td className="py-1">{getSource(l.sourceId)?.name ?? l.sourceId}</td>
                    <td className="py-1 font-mono text-xs">{l.host}</td>
                    <td className="max-w-xs truncate py-1 font-mono text-xs">{l.sentValue}</td>
                    <td className="py-1">
                      <Badge tone={typeof l.status === 'number' ? (l.status < 400 ? 'ok' : l.status === 404 ? 'neutral' : 'warn') : 'red'}>{String(l.status)}</Badge>
                    </td>
                    <td className="py-1 tabular-nums text-bw-muted">{l.durationMs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} pageCount={pageCount} onPage={setPage} />
      </Card>
    </div>
  );
}
