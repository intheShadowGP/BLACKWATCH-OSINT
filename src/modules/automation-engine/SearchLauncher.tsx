import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Play, Search, ShieldAlert } from 'lucide-react';
import { useI18n } from '@/i18n';
import { useApp, useEngine, useSettings } from '@/app/context';
import { candidateSourcesFor, defaultSourcesFor, manualSourcesFor } from '@/services/automation/engine';
import { getSource } from '@/services/sources/catalog';
import { NAV_BY_ID } from '@/layouts/nav';
import { MODULES_FOR_QUERY, detectQueryType, isEmail, isIPv4, isIPv6, isDomain, parseCoordinates } from '@/utils/validation';
import { QUERY_TYPES, type QueryType } from '@/types';
import { ActiveInvestigationBar, ResultsList, RunPanel } from '@/components/investigation';
import { Badge, Button, Card, Checkbox, HelpBox, Input, Modal, PageHeader, SafeLink, Select } from '@/components/ui';

/** Validates a query against an explicitly chosen type. */
export function validForType(q: string, qt: QueryType): boolean {
  switch (qt) {
    case 'email':
      return isEmail(q);
    case 'domain':
      return isDomain(q);
    case 'ipv4':
      return isIPv4(q);
    case 'ipv6':
      return isIPv6(q);
    case 'coordinates':
      return !!parseCoordinates(q);
    case 'url':
      return /^https?:\/\//i.test(q);
    case 'username':
      return /^@?[A-Za-z0-9._-]{1,64}$/.test(q);
    default:
      return q.trim().length > 0 && q.length <= 500;
  }
}

export default function SearchLauncher() {
  const { t, td, lang } = useI18n();
  const [params, setParams] = useSearchParams();
  const eng = useEngine();
  const settings = useSettings();
  const { attachId: activeId } = useApp();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [qt, setQt] = useState<QueryType | null>(() => (params.get('q') ? detectQueryType(params.get('q')!) : null));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [runId, setRunId] = useState<string | null>(params.get('run'));
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    const pq = params.get('q');
    if (pq !== null && pq !== q) {
      setQ(pq);
      setQt(detectQueryType(pq));
    }
    const pr = params.get('run');
    if (pr) setRunId(pr);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  useEffect(() => {
    if (qt) setSelected(new Set(defaultSourcesFor(qt)));
  }, [qt, settings.privacy]);

  const valid = !!qt && validForType(q.trim(), qt);
  const candidates = qt ? candidateSourcesFor(qt) : [];
  const manual = useMemo(() => (qt && valid ? manualSourcesFor(qt === 'username' ? q.trim().replace(/^@/, '') : q.trim(), qt) : []), [qt, valid, q]);

  const launch = async () => {
    if (!qt || !valid) return;
    const id = await eng.start({ query: qt === 'username' ? q.trim().replace(/^@/, '') : q.trim(), queryType: qt, sourceIds: [...selected], investigationId: activeId ?? undefined, manual: true });
    setRunId(id);
    setParams({ q: q.trim(), run: id });
  };

  const sentPreview = [...selected].map((s) => getSource(s)).filter(Boolean);

  return (
    <div>
      <PageHeader icon={<Search className="size-5" />} title={t('search.title')} description={t('search.desc')} />
      <HelpBox storageKey="search" examples={['nightjar_ops', 'example.com', '1.1.1.1', 'contact@example.org', '48.8584, 2.2945']} onExample={(v) => { setQ(v); setQt(detectQueryType(v)); }}>
        <p>{t('help.search')}</p>
      </HelpBox>
      <ActiveInvestigationBar />
      <Card>
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            setQt(detectQueryType(q));
          }}
        >
          <Input value={q} maxLength={2000} onChange={(e) => { setQ(e.target.value); setQt(detectQueryType(e.target.value)); }} placeholder={t('search.placeholder')} aria-label={t('search.placeholder')} className="font-mono" />
          <Select value={qt ?? ''} onChange={(e) => setQt((e.target.value || null) as QueryType | null)} className="sm:max-w-48" aria-label={t('search.type')}>
            <option value="">{t('search.type')}</option>
            {QUERY_TYPES.map((x) => (
              <option key={x} value={x}>
                {td(`qt.${x}`)}
              </option>
            ))}
          </Select>
        </form>
        {qt && !valid && q.trim() && <p className="mt-2 text-sm text-bw-red-bright">{t('search.invalidForType', { type: td(`qt.${qt}`) })}</p>}
        {qt && valid && (
          <div className="mt-4 space-y-4">
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-bw-muted">{t('search.suggestedModules')}</h3>
              <div className="flex flex-wrap gap-2">
                {MODULES_FOR_QUERY[qt].map((m) => {
                  const nav = NAV_BY_ID.get(m === 'search' ? 'search' : m);
                  if (!nav) return null;
                  return (
                    <Link key={m} to={`${nav.path}?q=${encodeURIComponent(q.trim())}`} className="inline-flex items-center gap-1.5 rounded-md border border-bw-border bg-bw-panel2 px-3 py-1.5 text-sm hover:border-bw-gold/50">
                      <nav.icon className="size-4 text-bw-red-bright" /> {t(nav.label)}
                    </Link>
                  );
                })}
              </div>
            </div>
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-bw-muted">{t('search.sources')}</h3>
              {!settings.privacy.externalEnabled ? (
                <p className="text-sm text-bw-warn">{t('privacy.externalOff')}</p>
              ) : candidates.length === 0 ? (
                <p className="text-sm text-bw-muted">{t('search.noAutoSources')}</p>
              ) : (
                <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                  {candidates.map((id) => {
                    const s = getSource(id)!;
                    const mode = settings.modeOf(id);
                    return (
                      <div key={id} className="flex items-center gap-2 rounded border border-bw-border px-2 py-1.5">
                        <Checkbox
                          disabled={mode === 'off'}
                          checked={selected.has(id)}
                          onChange={(v) => {
                            const n = new Set(selected);
                            if (v) n.add(id);
                            else n.delete(id);
                            setSelected(n);
                          }}
                          label={s.name}
                        />
                        <span className="ml-auto">
                          <Badge tone={mode === 'auto' ? 'ok' : mode === 'manual' ? 'gold' : 'neutral'}>{td(`mode.${mode}`)}</Badge>
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="primary" icon={<Play className="size-4" />} disabled={!selected.size || !settings.privacy.externalEnabled} onClick={() => (settings.privacy.confirmBeforeRun ? setConfirmOpen(true) : launch())}>
                {t('search.launch', { n: selected.size })}
              </Button>
              <span className="text-xs text-bw-muted">{activeId ? t('search.willAttach') : t('search.noAttach')}</span>
            </div>
            {manual.length > 0 && (
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-bw-muted">{t('search.manualLinks')}</h3>
                <div className="flex flex-wrap gap-2">
                  {manual.map((m) => (
                    <SafeLink key={m.id} href={m.url} className="rounded border border-bw-border px-2 py-1 text-xs">
                      {m.name}
                    </SafeLink>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      {runId && eng.getRun(runId) && (
        <div className="mt-4 space-y-4">
          <RunPanel runId={runId} />
          <Card title={t('results.title')}>
            <ResultsList runId={runId} />
          </Card>
        </div>
      )}

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={t('search.confirmTitle')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="primary"
              icon={<Play className="size-4" />}
              onClick={() => {
                setConfirmOpen(false);
                void launch();
              }}
            >
              {t('search.confirmGo')}
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm">
          <p className="flex items-start gap-2 text-bw-warn">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" /> {t('search.confirmBody')}
          </p>
          <p className="font-mono">{q.trim()}</p>
          <ul className="space-y-1 text-bw-muted">
            {sentPreview.map((s) => (
              <li key={s!.id}>
                <b className="text-bw-text">{s!.name}</b> — {s!.sentData[lang]}
              </li>
            ))}
          </ul>
          <p className="text-xs text-bw-muted">{t('search.confirmDisable')}</p>
        </div>
      </Modal>
    </div>
  );
}
