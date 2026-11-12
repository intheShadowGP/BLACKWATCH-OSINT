import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Mail, Play } from 'lucide-react';
import { useI18n } from '@/i18n';
import { useApp, useEngine, useSettings } from '@/app/context';
import { db } from '@/services/storage/db';
import { analyzeEmailSyntax } from '@/utils/validation';
import { classifyEmailDomain, identifyMailHost, parseDmarc, parseSpf } from '@/services/sources/emailProviders';
import { ActiveInvestigationBar, ResultsList, RunPanel, useAddToInvestigation, useConfirmRun } from '@/components/investigation';
import { Badge, Button, Card, Checkbox, Field, HelpBox, Input, KeyValue, PageHeader, SafeLink } from '@/components/ui';
import type { Result } from '@/types';
import { nowIso } from '@/utils/common';

export default function EmailPage() {
  const { t, td } = useI18n();
  const [params] = useSearchParams();
  const eng = useEngine();
  const settings = useSettings();
  const { attachId: activeId } = useApp();
  const confirmRun = useConfirmRun();
  const { addValue } = useAddToInvestigation();
  const [v, setV] = useState(params.get('q') ?? '');
  const [gravatar, setGravatar] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  useEffect(() => {
    const q = params.get('q');
    if (q) setV(q);
  }, [params]);

  const syntax = useMemo(() => (v.trim() ? analyzeEmailSyntax(v) : null), [v]);
  const classes = syntax?.valid ? classifyEmailDomain(syntax.domain) : [];
  const results = useLiveQuery(() => (runId ? db.results.where('runId').equals(runId).toArray() : Promise.resolve([] as Result[])), [runId], [] as Result[]);

  const mx = results.filter((r) => r.kind === 'DNS MX');
  const txt = results.filter((r) => r.kind === 'DNS TXT').map((r) => r.value);
  const dmarcTxt = results.filter((r) => r.kind === 'DNS TXT (_dmarc)').map((r) => r.value);
  const spf = txt.find((x) => /^v=spf1/i.test(x));
  const dmarc = dmarcTxt.find((x) => /^v=DMARC1/i.test(x));
  const run = runId ? eng.getRun(runId) : undefined;
  const dnsDone = run?.tasks.some((x) => x.sourceId.startsWith('dns-') && ['completed', 'partial'].includes(x.status));

  const launch = async () => {
    if (!syntax?.valid) return;
    const sources = ['dns-cloudflare', ...(gravatar ? ['gravatar'] : [])];
    if (!(await confirmRun(v.trim(), sources))) return;
    setRunId(await eng.start({ query: v.trim(), queryType: 'email', sourceIds: sources, investigationId: activeId ?? undefined, manual: true }));
  };

  const email = v.trim();
  const local = syntax?.local ?? '';
  const searches = syntax?.valid
    ? [
        { label: 'Google — exact', url: `https://www.google.com/search?q=${encodeURIComponent(`"${email}"`)}` },
        { label: 'Bing — exact', url: `https://www.bing.com/search?q=${encodeURIComponent(`"${email}"`)}` },
        { label: 'DuckDuckGo — exact', url: `https://duckduckgo.com/?q=${encodeURIComponent(`"${email}"`)}` },
        { label: 'GitHub — commits/code', url: `https://github.com/search?q=${encodeURIComponent(`"${email}"`)}&type=commits` },
        { label: `Google — "${local}" (local part)`, url: `https://www.google.com/search?q=${encodeURIComponent(`"${local}"`)}` },
        { label: `Google — site:${syntax.domain}`, url: `https://www.google.com/search?q=${encodeURIComponent(`site:${syntax.domain} "${local}"`)}` },
        { label: 'Have I Been Pwned (manual)', url: 'https://haveibeenpwned.com/' },
      ]
    : [];

  return (
    <div>
      <PageHeader icon={<Mail className="size-5" />} title={t('nav.email')} description={t('desc.email')} />
      <HelpBox storageKey="email" examples={['contact@example.org', 'first.last+news@gmail.com']} onExample={setV}>
        <p>{t('help.email')}</p>
        <p className="text-bw-warn">{t('help.email.warning')}</p>
      </HelpBox>
      <ActiveInvestigationBar />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={t('email.input')}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void launch();
            }}
            className="space-y-3"
          >
            <Field label={t('email.address')} error={syntax && !syntax.valid ? t('error.invalidEmail') : null}>
              {(id) => <Input id={id} type="text" inputMode="email" value={v} maxLength={254} onChange={(e) => setV(e.target.value)} className="font-mono" autoComplete="off" />}
            </Field>
            <Checkbox checked={gravatar} onChange={setGravatar} disabled={settings.modeOf('gravatar') === 'off'} label={t('email.gravatar')} />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="primary" icon={<Play className="size-4" />} disabled={!syntax?.valid || !settings.privacy.externalEnabled}>
                {t('email.analyse')}
              </Button>
              {syntax?.valid && activeId && (
                <Button variant="ghost" onClick={() => addValue('email', email, { sourceId: 'manual', sourceName: 'Analyst input', collectedAt: nowIso() })}>
                  {t('email.add')}
                </Button>
              )}
            </div>
          </form>
        </Card>
        <Card title={t('email.local')} subtitle={t('email.localNote')}>
          {!syntax ? (
            <p className="text-sm text-bw-muted">{t('email.enter')}</p>
          ) : (
            <KeyValue
              rows={[
                [t('email.syntax'), syntax.valid ? <Badge tone="ok">{t('email.valid')}</Badge> : <Badge tone="red">{t('email.invalid')}</Badge>],
                [t('email.localPart'), syntax.local || '—'],
                [t('email.domain'), syntax.domain ? <Link className="hover:underline" to={`/domain?q=${encodeURIComponent(syntax.domain)}`}>{syntax.domain}</Link> : '—'],
                [t('email.provider'), classes.map((c) => <Badge key={c} tone={c === 'disposable' ? 'red' : c === 'privacy' ? 'gold' : 'neutral'}>{td(`email.class.${c}`)}</Badge>)],
                [t('email.notes'), syntax.issues.length ? syntax.issues.map((i) => td(`email.issue.${i}`)).join(' · ') : '—'],
                [t('email.pivot'), syntax.local ? <Link className="hover:underline" to={`/username?q=${encodeURIComponent(syntax.local.replace(/\+.*$/, ''))}`}>{syntax.local.replace(/\+.*$/, '')}</Link> : '—'],
              ]}
            />
          )}
        </Card>
      </div>

      {runId && (
        <div className="mt-4 space-y-4">
          <RunPanel runId={runId} />
          {dnsDone && (
            <Card title={t('email.mailConfig')}>
              <KeyValue
                rows={[
                  [
                    'MX',
                    mx.length ? (
                      <ul>
                        {mx.map((m) => (
                          <li key={m.id}>
                            {m.value} {identifyMailHost(m.value) && <Badge tone="gold">{identifyMailHost(m.value)}</Badge>}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <Badge tone="warn">{t('email.noMx')}</Badge>
                    ),
                  ],
                  ['SPF', spf ? `${parseSpf(spf).all ?? '—'} · ${parseSpf(spf).includes.join(', ') || '—'}` : t('email.none')],
                  ['DMARC', dmarc ? `p=${parseDmarc(dmarc).p ?? '?'}${parseDmarc(dmarc).rua ? ` · rua=${parseDmarc(dmarc).rua}` : ''}` : t('email.none')],
                ]}
              />
              <p className="mt-2 text-xs text-bw-muted">{t('email.mxNote')}</p>
            </Card>
          )}
          <ResultsList runId={runId} />
        </div>
      )}

      {searches.length > 0 && (
        <Card className="mt-4" title={t('email.searches')} subtitle={t('email.searchesNote')}>
          <div className="flex flex-wrap gap-2">
            {searches.map((s) => (
              <SafeLink key={s.url} href={s.url} className="rounded border border-bw-border px-2 py-1 text-xs">
                {s.label}
              </SafeLink>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
