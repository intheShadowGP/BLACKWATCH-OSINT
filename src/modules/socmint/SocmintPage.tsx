import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link2, Play, Users } from 'lucide-react';
import { useI18n } from '@/i18n';
import { useApp, useEngine, useSettings } from '@/app/context';
import { PLATFORMS, parseProfileUrl } from '@/services/sources/platforms';
import { candidateSourcesFor, defaultSourcesFor } from '@/services/automation/engine';
import { getSource } from '@/services/sources/catalog';
import { db } from '@/services/storage/db';
import { isUrl, safeUrl } from '@/utils/validation';
import { formatDateTime, nowIso } from '@/utils/common';
import type { Entity } from '@/types';
import { ActiveInvestigationBar, ResultsList, RunPanel, useAddToInvestigation, useConfirmRun } from '@/components/investigation';
import { Badge, Button, Card, Checkbox, EmptyState, Field, HelpBox, Input, PageHeader, SafeLink, VerificationBadge } from '@/components/ui';
import { ManualRecordButton } from '@/components/ManualRecord';
import { RelationModal } from '@/components/forms';

export default function SocmintPage() {
  const { t, locale } = useI18n();
  const [params] = useSearchParams();
  const eng = useEngine();
  const settings = useSettings();
  const { attachId: activeId } = useApp();
  const confirmRun = useConfirmRun();
  const { addValue } = useAddToInvestigation();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [selected, setSelected] = useState<Set<string>>(new Set(defaultSourcesFor('keyword')));
  const [runId, setRunId] = useState<string | null>(null);
  const [assoc, setAssoc] = useState<{ from?: string } | null>(null);
  useEffect(() => {
    const p = params.get('q');
    if (p) setQ(p);
  }, [params]);
  useEffect(() => setSelected(new Set(defaultSourcesFor('keyword'))), [settings.privacy]);

  const trimmed = q.trim();
  const asUrl = isUrl(trimmed) ? trimmed : null;
  const parsed = asUrl ? parseProfileUrl(asUrl) : null;
  const keywordOk = !!trimmed && !asUrl && trimmed.length <= 300;

  const entities = useLiveQuery(() => (activeId ? db.entities.where('investigationId').equals(activeId).toArray() : Promise.resolve([] as Entity[])), [activeId], [] as Entity[]);
  const accounts = useMemo(() => entities.filter((e) => e.type === 'account').sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [entities]);

  const launch = async () => {
    if (!keywordOk) return;
    if (!(await confirmRun(trimmed, [...selected]))) return;
    setRunId(await eng.start({ query: trimmed, queryType: 'keyword', sourceIds: [...selected], investigationId: activeId ?? undefined, manual: true }));
  };

  return (
    <div>
      <PageHeader icon={<Users className="size-5" />} title={t('nav.socmint')} description={t('desc.socmint')} />
      <HelpBox storageKey="socmint" examples={['bellingcat', 'open source intelligence', 'https://github.com/torvalds', 'https://bsky.app/profile/bsky.app']} onExample={setQ}>
        <p>{t('help.socmint')}</p>
        <p className="text-bw-warn">{t('help.socmint.warning')}</p>
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
            <Field label={t('soc.input')} hint={t('soc.inputHint')}>
              {(id) => <Input id={id} value={q} maxLength={2000} onChange={(e) => setQ(e.target.value)} />}
            </Field>
          </div>
          <Button type="submit" variant="primary" icon={<Play className="size-4" />} disabled={!keywordOk || !selected.size || !settings.privacy.externalEnabled}>
            {t('soc.search')}
          </Button>
        </form>
        {keywordOk && (
          <div className="mt-3 flex flex-wrap gap-3">
            {candidateSourcesFor('keyword')
              .filter((id) => !['nominatim', 'photon'].includes(id))
              .map((id) => (
                <Checkbox
                  key={id}
                  checked={selected.has(id)}
                  disabled={settings.modeOf(id) === 'off'}
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
        )}
      </Card>

      {asUrl && (
        <Card className="mt-4" title={t('soc.urlAnalysis')}>
          {parsed ? (
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <Badge tone="gold">{parsed.platform.name}</Badge>
              <span>
                {t('soc.handle')}: <b className="font-mono">{parsed.username}</b>
              </span>
              <SafeLink href={asUrl}>{t('soc.open')}</SafeLink>
              <Link className="text-bw-gold hover:underline" to={`/username?q=${encodeURIComponent(parsed.username)}`}>
                {t('soc.pivotUsername')}
              </Link>
              {activeId && (
                <>
                  <Button size="sm" variant="gold" onClick={() => addValue('account', safeUrl(asUrl)!, { sourceId: parsed.platform.id, sourceName: parsed.platform.name, url: safeUrl(asUrl)!, collectedAt: nowIso(), note: 'URL provided by analyst' }, { label: `${parsed.platform.name}: ${parsed.username}` })}>
                    {t('soc.addAccount')}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => addValue('username', parsed.username, { sourceId: 'manual', sourceName: 'Parsed from URL', url: safeUrl(asUrl)!, collectedAt: nowIso() })}>
                    {t('soc.addHandle')}
                  </Button>
                </>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3 text-sm text-bw-muted">
              {t('soc.unknownPlatform')}
              <SafeLink href={asUrl}>{t('soc.open')}</SafeLink>
              {activeId && (
                <Button size="sm" variant="gold" onClick={() => addValue('url', safeUrl(asUrl)!, { sourceId: 'manual', sourceName: 'Analyst input', url: safeUrl(asUrl)!, collectedAt: nowIso() })}>
                  {t('soc.addUrl')}
                </Button>
              )}
            </div>
          )}
        </Card>
      )}

      {runId && (
        <div className="mt-4 space-y-3">
          <RunPanel runId={runId} />
          <ResultsList runId={runId} />
        </div>
      )}

      {keywordOk && (
        <Card className="mt-4" title={t('soc.officialSearch')} subtitle={t('soc.officialSearchHelp')}>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {PLATFORMS.filter((p) => p.searchUrl).map((p) => (
              <div key={p.id} className="flex items-center gap-2 rounded border border-bw-border bg-bw-panel2 px-3 py-1.5 text-sm">
                <span className="flex-1">{p.name}</span>
                <SafeLink href={p.searchUrl!(trimmed)} className="text-xs">
                  {t('soc.open')}
                </SafeLink>
                <ManualRecordButton sourceId={p.id} sourceName={p.name} defaultUrl="" defaultValue="" />
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card
        className="mt-4"
        title={t('soc.discoveries')}
        subtitle={t('soc.discoveriesHelp')}
        actions={
          activeId && accounts.length > 0 ? (
            <Button size="sm" icon={<Link2 className="size-3.5" />} onClick={() => setAssoc({})}>
              {t('soc.associate')}
            </Button>
          ) : undefined
        }
      >
        {!activeId ? (
          <p className="text-sm text-bw-muted">{t('inv.noneActive')}</p>
        ) : !accounts.length ? (
          <EmptyState title={t('soc.noAccounts')} />
        ) : (
          <ul className="divide-y divide-bw-border text-sm">
            {accounts.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-2 py-1.5">
                <SafeLink href={a.value} className="max-w-lg truncate font-mono text-[13px]" />
                {a.label && <span className="text-xs text-bw-muted">{a.label}</span>}
                <VerificationBadge v={a.verification} />
                <span className="ml-auto text-xs text-bw-muted">{formatDateTime(a.createdAt, locale)}</span>
                <Button size="sm" variant="ghost" icon={<Link2 className="size-3.5" />} onClick={() => setAssoc({ from: a.id })}>
                  {t('soc.associate')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {activeId && <RelationModal open={!!assoc} onClose={() => setAssoc(null)} investigationId={activeId} entities={entities} presetFrom={assoc?.from} />}
    </div>
  );
}
