import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Globe, Play } from 'lucide-react';
import { useI18n } from '@/i18n';
import { useApp, useEngine, useSettings } from '@/app/context';
import { candidateSourcesFor, defaultSourcesFor, manualSourcesFor } from '@/services/automation/engine';
import { getSource } from '@/services/sources/catalog';
import { db } from '@/services/storage/db';
import { isDomain, isIPv4, isIPv6 } from '@/utils/validation';
import { formatDateTime } from '@/utils/common';
import type { QueryType, Result } from '@/types';
import { ActiveInvestigationBar, ResultsList, RunPanel, useConfirmRun } from '@/components/investigation';
import { Badge, Button, Card, Checkbox, CopyButton, Field, HelpBox, Input, PageHeader, SafeLink, Tabs } from '@/components/ui';

function typeOf(v: string): QueryType | null {
  const s = v.trim();
  if (isIPv4(s)) return 'ipv4';
  if (isIPv6(s)) return 'ipv6';
  if (isDomain(s)) return 'domain';
  return null;
}

export default function DomainPage() {
  const { t, td, locale } = useI18n();
  const [params] = useSearchParams();
  const eng = useEngine();
  const settings = useSettings();
  const { attachId: activeId } = useApp();
  const confirmRun = useConfirmRun();
  const [v, setV] = useState(params.get('q') ?? '');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [runId, setRunId] = useState<string | null>(null);
  const [view, setView] = useState<'structured' | 'all'>('structured');
  useEffect(() => {
    const q = params.get('q');
    if (q) setV(q);
  }, [params]);
  const qt = typeOf(v);
  const value = qt === 'domain' ? v.trim().toLowerCase().replace(/\.$/, '') : v.trim();
  useEffect(() => {
    if (qt) setSelected(new Set(defaultSourcesFor(qt)));
  }, [qt, settings.privacy]);

  const results = useLiveQuery(() => (runId ? db.results.where('runId').equals(runId).toArray() : Promise.resolve([] as Result[])), [runId], [] as Result[]);
  const history = useLiveQuery(
    async () => (qt ? (await db.runs.orderBy('createdAt').reverse().limit(200).toArray()).filter((r) => r.query.toLowerCase() === value.toLowerCase()).slice(0, 10) : []),
    [qt, value, runId],
    [],
  );

  const launch = async () => {
    if (!qt) return;
    if (!(await confirmRun(value, [...selected]))) return;
    setRunId(await eng.start({ query: value, queryType: qt, sourceIds: [...selected], investigationId: activeId ?? undefined, manual: true }));
  };

  const grouped = useMemo(() => {
    const dns = new Map<string, Result[]>();
    const rest: Record<string, Result[]> = { registration: [], subdomains: [], network: [], exposure: [], archive: [] };
    for (const r of results) {
      if (r.kind.startsWith('DNS ')) {
        const k = r.kind.replace(/^DNS /, '');
        dns.set(k, [...(dns.get(k) ?? []), r]);
      } else if (r.sourceId === 'rdap') rest.registration.push(r);
      else if (r.sourceId === 'certspotter') rest.subdomains.push(r);
      else if (r.sourceId === 'ripestat' || r.sourceId === 'ipinfo') rest.network.push(r);
      else if (r.sourceId === 'shodan-internetdb') rest.exposure.push(r);
      else if (r.sourceId === 'wayback') rest.archive.push(r);
    }
    return { dns, rest };
  }, [results]);

  return (
    <div>
      <PageHeader icon={<Globe className="size-5" />} title={t('nav.domain')} description={t('desc.domain')} />
      <HelpBox storageKey="domain" examples={['example.com', 'wikipedia.org', '1.1.1.1', '2606:4700:4700::1111']} onExample={setV}>
        <p>{t('help.domain')}</p>
        <p className="text-bw-warn">{t('help.domain.warning')}</p>
      </HelpBox>
      <ActiveInvestigationBar />
      <Card>
        <form
          className="flex flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            void launch();
          }}
        >
          <div className="flex-1">
            <Field label={t('domain.input')} error={v.trim() && !qt ? t('error.invalidDomainOrIp') : null}>
              {(id) => <Input id={id} value={v} maxLength={253} onChange={(e) => setV(e.target.value)} placeholder="example.com / 203.0.113.10" className="font-mono" />}
            </Field>
          </div>
          {qt && <Badge tone="gold">{td(`qt.${qt}`)}</Badge>}
          <Button type="submit" variant="primary" icon={<Play className="size-4" />} disabled={!qt || !selected.size || !settings.privacy.externalEnabled}>
            {t('domain.analyse')}
          </Button>
        </form>
        {qt && (
          <>
            <div className="mt-3 flex flex-wrap gap-3">
              {candidateSourcesFor(qt).map((id) => (
                <Checkbox
                  key={id}
                  disabled={settings.modeOf(id) === 'off'}
                  checked={selected.has(id)}
                  onChange={(c) => {
                    const n = new Set(selected);
                    if (c) n.add(id);
                    else n.delete(id);
                    setSelected(n);
                  }}
                  label={getSource(id)?.name ?? id}
                />
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <span className="text-bw-muted">{t('search.manualLinks')}:</span>
              {manualSourcesFor(value, qt).map((m) => (
                <SafeLink key={m.id} href={m.url}>
                  {m.name}
                </SafeLink>
              ))}
            </div>
          </>
        )}
      </Card>

      {runId && (
        <div className="mt-4 space-y-4">
          <RunPanel runId={runId} />
          <Tabs<'structured' | 'all'> value={view} onChange={setView} items={[{ id: 'structured', label: t('domain.structured') }, { id: 'all', label: t('domain.allResults'), count: results.length }]} />
          {view === 'all' ? (
            <ResultsList runId={runId} />
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {grouped.dns.size > 0 && (
                <Card title={t('domain.dns')} className="lg:col-span-2">
                  <div className="grid gap-x-6 gap-y-3 md:grid-cols-2">
                    {[...grouped.dns.entries()].map(([k, rs]) => (
                      <div key={k}>
                        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-bw-gold">{k}</h3>
                        <ul className="space-y-0.5">
                          {rs.map((r) => (
                            <li key={r.id} className="flex items-start gap-1 break-all font-mono text-[13px]">
                              {r.type === 'ip' || r.type === 'domain' ? (
                                <Link className="hover:underline" to={`/domain?q=${encodeURIComponent(r.value)}`}>
                                  {r.value}
                                </Link>
                              ) : (
                                r.value
                              )}
                              <CopyButton value={r.value} />
                              {typeof r.data.ttl === 'number' && <span className="text-xs text-bw-muted">TTL {r.data.ttl}</span>}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
              {(['registration', 'network', 'subdomains', 'exposure', 'archive'] as const).map((k) =>
                grouped.rest[k].length ? (
                  <Card key={k} title={t(`domain.section.${k}`)} subtitle={k === 'exposure' ? t('domain.exposureNote') : k === 'network' ? t('domain.geoNote') : undefined}>
                    <ResultsList results={grouped.rest[k]} />
                  </Card>
                ) : null,
              )}
              {!results.length && <p className="text-sm text-bw-muted">{t('domain.waiting')}</p>}
            </div>
          )}
        </div>
      )}

      {history.length > 0 && (
        <Card className="mt-4" title={t('domain.history')}>
          <ul className="space-y-1 text-sm">
            {history.map((r) => (
              <li key={r.id} className="flex items-center gap-2">
                <button type="button" className="text-bw-gold hover:underline" onClick={() => setRunId(r.id)}>
                  {formatDateTime(r.createdAt, locale)}
                </button>
                <span className="text-xs text-bw-muted">{r.tasks.map((x) => getSource(x.sourceId)?.name ?? x.sourceId).join(', ')}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
