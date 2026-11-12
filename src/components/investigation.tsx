import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { CheckSquare, Download, FolderOpen, Plus, PlusCircle, RefreshCw, Square } from 'lucide-react';
import { toCsv } from '@/services/export/format';
import { useApp, useEngine, useSettings } from '@/app/context';
import { useI18n } from '@/i18n';
import { db } from '@/services/storage/db';
import { addEvent, upsertEntity } from '@/services/storage/repository';
import { getSource } from '@/services/sources/catalog';
import type { EntityType, Provenance, Result } from '@/types';
import { downloadBlob, formatDateTime } from '@/utils/common';
import { Badge, Button, ConfidenceBadge, CopyButton, EmptyState, Pagination, SafeLink, StatusBadge, VerificationBadge, cx, usePaged } from './ui';

/** Banner reminding which investigation receives added items. */
export function ActiveInvestigationBar() {
  const { active, investigations, setActiveId } = useApp();
  const { t } = useI18n();
  return (
    <div className={cx('mb-4 flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm', active ? 'border-bw-border bg-bw-panel' : 'border-bw-warn/40 bg-bw-warn/5')}>
      <FolderOpen className="size-4 text-bw-gold" aria-hidden />
      {active ? (
        <>
          <span className="text-bw-muted">{t('inv.activeLabel')}</span>
          <Link to={`/investigations/${active.id}`} className="font-medium text-bw-text hover:underline">
            {active.name}
          </Link>
          {active.isDemo && <Badge tone="warn">DEMO</Badge>}
          {active.isDemo && <span className="w-full text-xs text-bw-warn">{t('demo.noRealData')}</span>}
        </>
      ) : (
        <>
          <span className="text-bw-warn">{t('inv.noneActive')}</span>
          {investigations.length > 0 ? (
            <select aria-label={t('inv.select')} className="rounded border border-bw-border bg-bw-bg px-2 py-1 text-sm" value="" onChange={(e) => setActiveId(e.target.value || null)}>
              <option value="">{t('inv.select')}</option>
              {investigations.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          ) : (
            <Link to="/investigations?new=1" className="text-bw-gold hover:underline">
              {t('inv.createFirst')}
            </Link>
          )}
        </>
      )}
    </div>
  );
}

/** Adds normalised results / manual values to the active investigation, keeping provenance. */
export function useAddToInvestigation() {
  const { attachId: activeId, active, toast, reportError } = useApp();
  const { t } = useI18n();
  // Real collected data never goes into a demonstration investigation (§15).
  const refuse = useCallback(() => toast(active?.isDemo ? t('demo.noRealData') : t('inv.noneActive'), 'error'), [active, toast, t]);

  const addResult = useCallback(
    async (r: Result, silent = false): Promise<boolean> => {
      if (!activeId) {
        refuse();
        return false;
      }
      try {
        const source: Provenance = { sourceId: r.sourceId, sourceName: getSource(r.sourceId)?.name, url: r.url, collectedAt: r.collectedAt, note: `${r.kind} — query: ${r.query}` };
        if (r.type === 'event' && r.infoDate) {
          await addEvent({
            investigationId: activeId,
            title: `${r.kind}: ${r.query}`,
            description: r.value,
            datetime: r.infoDate,
            timezone: 'UTC',
            dateKind: 'occurrence',
            verification: r.verification,
            confidence: r.confidence,
            sources: [source],
            entityIds: [],
          });
        } else {
          const lat = typeof r.data.lat === 'number' ? r.data.lat : undefined;
          const lon = typeof r.data.lon === 'number' ? r.data.lon : undefined;
          await upsertEntity({ investigationId: activeId, type: r.type, value: r.value, label: r.kind, verification: r.verification, confidence: r.confidence, source, lat, lon });
          if (r.infoDate && r.type === 'account') {
            await addEvent({
              investigationId: activeId,
              title: `Account created: ${r.value}`,
              description: `${r.kind} (${getSource(r.sourceId)?.name ?? r.sourceId})`,
              datetime: r.infoDate,
              timezone: 'UTC',
              dateKind: 'occurrence',
              verification: 'public-source',
              confidence: r.confidence,
              sources: [source],
              entityIds: [],
            });
          }
        }
        await db.results.update(r.id, { investigationId: activeId });
        if (!silent) toast(t('inv.added'));
        return true;
      } catch (e) {
        reportError(e);
        return false;
      }
    },
    [activeId, toast, reportError, t, refuse],
  );

  const addValue = useCallback(
    async (type: EntityType, value: string, source: Provenance, extra: { label?: string; lat?: number; lon?: number; notes?: string } = {}) => {
      if (!activeId) {
        refuse();
        return null;
      }
      try {
        const { entity, created } = await upsertEntity({ investigationId: activeId, type, value, source, ...extra });
        toast(created ? t('inv.added') : t('inv.merged'));
        return entity;
      } catch (e) {
        reportError(e);
        return null;
      }
    },
    [activeId, toast, reportError, t, refuse],
  );

  return { addResult, addValue, activeId };
}

/**
 * Confirmation before contacting external sources (privacy setting
 * "confirm before each multi-source search"). Lists what each source receives.
 */
export function useConfirmRun() {
  const settings = useSettings();
  const { confirm } = useApp();
  const { t, lang } = useI18n();
  return useCallback(
    async (query: string, sourceIds: string[]): Promise<boolean> => {
      if (!settings.privacy.confirmBeforeRun) return true;
      const lines = sourceIds
        .map((id) => getSource(id))
        .filter((s) => s && s.access === 'api')
        .map((s) => `• ${s!.name} — ${s!.sentData[lang]}`);
      if (!lines.length) return true;
      return confirm({ title: t('search.confirmTitle'), message: `${t('search.confirmBody')}\n\n« ${query} »\n\n${lines.join('\n')}\n\n${t('search.confirmDisable')}`, confirmLabel: t('search.confirmGo') });
    },
    [settings, confirm, t, lang],
  );
}

/* --------------------------- Display translation --------------------------- */

/** Translates a normalised result "kind" (stored in English) for display. */
export function useKindLabel() {
  const { td } = useI18n();
  return useCallback(
    (kind: string) => {
      const direct = td(`kind.${kind}`);
      if (direct !== `kind.${kind}`) return direct;
      const self = kind.match(/^Self-declared link \((.+)\)$/);
      if (self) return td('kind.selfDeclared', { service: self[1] });
      const rdap = kind.match(/^RDAP (.+)$/);
      if (rdap) return td('kind.rdapGeneric', { what: rdap[1] });
      return kind;
    },
    [td],
  );
}

/** Translates adapter / engine status messages; technical details stay verbatim. */
export function useMessageLabel() {
  const { td } = useI18n();
  return useCallback(
    (msg: string) => {
      const direct = td(`msg.${msg}`);
      if (direct !== `msg.${msg}`) return direct;
      const m = msg.match(/^(network\/CORS failure|host not allowed|timeout after|does not handle|cooldown until|fallback for|alternative to|RDAP server)(.*)$/);
      if (m) {
        const k = td(`msgp.${m[1]}`);
        return k !== `msgp.${m[1]}` ? `${k}${m[2]}` : msg;
      }
      return msg;
    },
    [td],
  );
}

/* ----------------------------- Run status panel ----------------------------- */

export function RunPanel({ runId }: { runId: string }) {
  const eng = useEngine();
  const { t, td, locale } = useI18n();
  const msgLabel = useMessageLabel();
  const run = eng.getRun(runId);
  if (!run) return null;
  const busy = run.tasks.some((x) => x.status === 'running' || x.status === 'queued');
  return (
    <div className="rounded-lg border border-bw-border bg-bw-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-bw-border px-4 py-2.5">
        <div className="text-sm">
          <span className="text-bw-muted">{t('run.query')} </span>
          <span className="font-mono text-bw-text">{run.query}</span> <Badge>{td(`qt.${run.queryType}`)}</Badge>
        </div>
        <div className="flex items-center gap-2 text-xs text-bw-muted">
          {formatDateTime(run.createdAt, locale)}
          {busy && (
            <Button size="sm" variant="danger" icon={<Square className="size-3" />} onClick={() => eng.cancel(run.id)}>
              {t('run.cancelAll')}
            </Button>
          )}
        </div>
      </div>
      <ul className="divide-y divide-bw-border">
        {run.tasks.map((task) => {
          const src = getSource(task.sourceId);
          const canRetry = ['unavailable', 'rate-limited', 'cancelled', 'partial', 'disabled', 'completed'].includes(task.status) && src?.access === 'api';
          return (
            <li key={task.sourceId} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm">
              <span className="min-w-40 flex-1 font-medium">{src?.name ?? task.sourceId}</span>
              <StatusBadge s={task.status} />
              {task.fallbackFor && <Badge tone="info">{t('run.fallbackFor', { name: getSource(task.fallbackFor)?.name ?? task.fallbackFor })}</Badge>}
              {task.resultCount > 0 && <Badge tone="gold">{t('run.results', { n: task.resultCount })}</Badge>}
              {task.message && <span className="w-full text-xs text-bw-muted sm:w-auto">{msgLabel(task.message)}</span>}
              <span className="ml-auto flex items-center gap-1">
                {task.manualUrl && <SafeLink href={task.manualUrl}>{t('run.openManual')}</SafeLink>}
                {(task.status === 'running' || task.status === 'queued') && (
                  <Button size="sm" variant="ghost" onClick={() => eng.cancel(run.id, task.sourceId)}>
                    {t('common.cancel')}
                  </Button>
                )}
                {canRetry && (
                  <Button size="sm" variant="ghost" icon={<RefreshCw className="size-3" />} onClick={() => eng.retry(run.id, task.sourceId)}>
                    {t('run.retry')}
                  </Button>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ------------------------------- Results list ------------------------------- */

export function ResultsList({ runId, results: given, filterTypes, emptyText }: { runId?: string; results?: Result[]; filterTypes?: EntityType[]; emptyText?: string }) {
  const { t, locale } = useI18n();
  const kindLabel = useKindLabel();
  const { addResult, activeId } = useAddToInvestigation();
  const { toast } = useApp();
  const live = useLiveQuery(() => (runId ? db.results.where('runId').equals(runId).toArray() : Promise.resolve([] as Result[])), [runId], [] as Result[]);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const all = useMemo(() => {
    const base = given ?? live ?? [];
    const f = q.trim().toLowerCase();
    return base.filter((r) => (!filterTypes || filterTypes.includes(r.type)) && (!f || `${r.kind} ${r.value} ${r.sourceId}`.toLowerCase().includes(f)));
  }, [given, live, q, filterTypes]);
  const { slice, page, pageCount, setPage } = usePaged(all, 40);

  if (!all.length && !q) return <EmptyState title={emptyText ?? t('results.none')} />;

  const addSelected = async () => {
    let n = 0;
    for (const r of all.filter((x) => selected.has(x.id))) if (await addResult(r, true)) n++;
    setSelected(new Set());
    toast(t('results.addedN', { n }));
  };

  /** Exports the filtered (or selected) results with full provenance. */
  const exportResults = (fmt: 'csv' | 'json') => {
    const rows = (selected.size ? all.filter((x) => selected.has(x.id)) : all).map((r) => ({
      kind: r.kind,
      type: r.type,
      value: r.value,
      url: r.url ?? '',
      source: getSource(r.sourceId)?.name ?? r.sourceId,
      source_id: r.sourceId,
      query: r.query,
      query_type: r.queryType,
      verification: r.verification,
      confidence: r.confidence,
      info_date: r.infoDate ?? '',
      collected_at: r.collectedAt,
    }));
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    if (fmt === 'csv') downloadBlob(new Blob([toCsv(rows, Object.keys(rows[0] ?? { kind: '' }) as Array<keyof (typeof rows)[number]>)], { type: 'text/csv' }), `blackwatch-results-${stamp}.csv`);
    else downloadBlob(new Blob([JSON.stringify({ format: 'blackwatch-results', exportedAt: new Date().toISOString(), results: rows }, null, 2)], { type: 'application/json' }), `blackwatch-results-${stamp}.json`);
  };

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('results.filter')} aria-label={t('results.filter')} className="min-w-48 flex-1 rounded-md border border-bw-border bg-bw-bg px-3 py-1.5 text-sm" />
        <span className="text-xs text-bw-muted">{t('results.count', { n: all.length })}</span>
        <Button size="sm" variant="ghost" icon={<CheckSquare className="size-3.5" />} onClick={() => setSelected(selected.size === all.length ? new Set() : new Set(all.map((r) => r.id)))}>
          {selected.size === all.length ? t('results.unselectAll') : t('results.selectAll')}
        </Button>
        <Button size="sm" variant="gold" icon={<Plus className="size-3.5" />} disabled={!selected.size || !activeId} onClick={addSelected}>
          {t('results.addSelected', { n: selected.size })}
        </Button>
        <Button size="sm" variant="ghost" icon={<Download className="size-3.5" />} disabled={!all.length} onClick={() => exportResults('csv')}>
          CSV
        </Button>
        <Button size="sm" variant="ghost" icon={<Download className="size-3.5" />} disabled={!all.length} onClick={() => exportResults('json')}>
          JSON
        </Button>
      </div>
      <div className="overflow-x-auto rounded-md border border-bw-border">
        <table className="w-full min-w-[680px] text-sm">
          <thead className="bg-bw-panel2 text-left text-xs uppercase tracking-wider text-bw-muted">
            <tr>
              <th className="w-8 px-2 py-2" />
              <th className="px-2 py-2">{t('results.kind')}</th>
              <th className="px-2 py-2">{t('results.value')}</th>
              <th className="px-2 py-2">{t('results.source')}</th>
              <th className="px-2 py-2">{t('results.reliability')}</th>
              <th className="px-2 py-2">{t('results.date')}</th>
              <th className="w-10 px-2 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-bw-border">
            {slice.map((r) => (
              <tr key={r.id} className="align-top hover:bg-bw-elev/40">
                <td className="px-2 py-2">
                  <input
                    type="checkbox"
                    aria-label={t('common.select')}
                    className="accent-[#c42f37]"
                    checked={selected.has(r.id)}
                    onChange={(e) => {
                      const s = new Set(selected);
                      if (e.target.checked) s.add(r.id);
                      else s.delete(r.id);
                      setSelected(s);
                    }}
                  />
                </td>
                <td className="px-2 py-2 text-bw-muted">{kindLabel(r.kind)}</td>
                <td className="max-w-md px-2 py-2">
                  <div className="flex items-start gap-1">
                    <span className="break-all font-mono text-[13px]">{r.url ? <SafeLink href={r.url}>{r.value}</SafeLink> : r.value}</span>
                    <CopyButton value={r.value} />
                  </div>
                  <ResultDetails r={r} />
                </td>
                <td className="px-2 py-2 text-xs">{getSource(r.sourceId)?.name ?? r.sourceId}</td>
                <td className="space-y-1 px-2 py-2">
                  <VerificationBadge v={r.verification} />
                  <ConfidenceBadge c={r.confidence} />
                </td>
                <td className="px-2 py-2 text-xs text-bw-muted">
                  {r.infoDate && (
                    <div title={t('results.infoDate')}>
                      {t('results.infoDateShort')} {formatDateTime(r.infoDate, locale)}
                    </div>
                  )}
                  <div title={t('results.collectedAt')}>
                    {t('results.collectedShort')} {formatDateTime(r.collectedAt, locale)}
                  </div>
                </td>
                <td className="px-2 py-2">
                  <button type="button" disabled={!activeId} title={activeId ? t('results.add') : t('inv.noneActive')} aria-label={t('results.add')} onClick={() => addResult(r)} className="rounded p-1 text-bw-gold hover:bg-bw-gold/10 disabled:opacity-30">
                    <PlusCircle className="size-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pageCount={pageCount} onPage={setPage} />
    </div>
  );
}

function ResultDetails({ r }: { r: Result }) {
  const { t } = useI18n();
  const entries = Object.entries(r.data).filter(([, v]) => v !== undefined && v !== null && v !== '' && typeof v !== 'object');
  if (!entries.length) return null;
  return (
    <details className="mt-1 text-xs text-bw-muted">
      <summary className="cursor-pointer select-none">{t('common.details')}</summary>
      <dl className="mt-1 grid grid-cols-[max-content_1fr] gap-x-3">
        {entries.slice(0, 20).map(([k, v]) => (
          <div key={k} className="contents">
            <dt>{k}</dt>
            <dd className="break-all text-bw-text/80">{String(v).slice(0, 300)}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
