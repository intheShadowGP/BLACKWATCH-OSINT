import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AtSign, Play, Wand2 } from 'lucide-react';
import { useI18n } from '@/i18n';
import { useApp, useEngine, useSettings } from '@/app/context';
import { PLATFORMS, generateVariants } from '@/services/sources/platforms';
import { isUsername } from '@/utils/validation';
import { ActiveInvestigationBar, ResultsList, RunPanel, useAddToInvestigation, useConfirmRun } from '@/components/investigation';
import { Badge, Button, Card, Checkbox, Field, HelpBox, Input, PageHeader, SafeLink } from '@/components/ui';
import { ManualRecordButton } from '@/components/ManualRecord';
import { nowIso } from '@/utils/common';

export default function UsernamePage() {
  const { t, td } = useI18n();
  const [params] = useSearchParams();
  const eng = useEngine();
  const settings = useSettings();
  const { attachId: activeId } = useApp();
  const confirmRun = useConfirmRun();
  const { addValue } = useAddToInvestigation();
  const [u, setU] = useState((params.get('q') ?? '').replace(/^@/, ''));
  const [variants, setVariants] = useState<string[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [runIds, setRunIds] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const q = params.get('q');
    if (q) setU(q.replace(/^@/, ''));
  }, [params]);

  const username = u.trim().replace(/^@/, '');
  const valid = isUsername(username);
  const automated = PLATFORMS.filter((p) => p.method === 'official-api');
  const manual = PLATFORMS.filter((p) => p.method === 'manual');
  const usable = automated.filter((p) => settings.canContact(p.id));

  const launch = async () => {
    if (!valid) return setErr(t('error.invalidUsername'));
    setErr(null);
    const targets = [username, ...[...picked].filter((v) => v !== username)];
    if (!(await confirmRun(targets.slice(0, 10).join(', '), usable.map((p) => p.id)))) return;
    const ids: string[] = [];
    for (const target of targets.slice(0, 10)) {
      ids.push(await eng.start({ query: target, queryType: 'username', sourceIds: usable.map((p) => p.id), investigationId: activeId ?? undefined, manual: true }));
    }
    setRunIds(ids);
  };

  const ruleWarnings = useMemo(() => PLATFORMS.filter((p) => p.usernameRule && valid && !p.usernameRule.test(username)).map((p) => p.name), [username, valid]);

  return (
    <div>
      <PageHeader icon={<AtSign className="size-5" />} title={t('nav.username')} description={t('desc.username')} />
      <HelpBox storageKey="username" examples={['torvalds', 'gargron', 'nightjar_ops']} onExample={setU}>
        <p>{t('help.username')}</p>
        <p className="text-bw-warn">{t('help.username.warning')}</p>
      </HelpBox>
      <ActiveInvestigationBar />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title={t('user.query')} className="lg:col-span-2">
          <form
            className="flex flex-col gap-2 sm:flex-row sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              void launch();
            }}
          >
            <div className="flex-1">
              <Field label={t('user.username')} error={err}>
                {(id) => <Input id={id} value={u} maxLength={64} onChange={(e) => setU(e.target.value)} placeholder="johndoe" className="font-mono" />}
              </Field>
            </div>
            <Button type="submit" variant="primary" icon={<Play className="size-4" />} disabled={!valid || !usable.length}>
              {t('user.check', { n: usable.length * (1 + [...picked].filter((v) => v !== username).length) })}
            </Button>
          </form>
          {ruleWarnings.length > 0 && <p className="mt-2 text-xs text-bw-warn">{t('user.ruleWarning', { list: ruleWarnings.join(', ') })}</p>}
          {!settings.privacy.externalEnabled && <p className="mt-2 text-sm text-bw-warn">{t('privacy.externalOff')}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button size="sm" icon={<Wand2 className="size-3.5" />} disabled={!valid} onClick={() => setVariants(generateVariants(username))}>
              {t('user.variants')}
            </Button>
            {valid && activeId && (
              <Button size="sm" variant="ghost" onClick={() => addValue('username', username, { sourceId: 'manual', sourceName: 'Analyst input', collectedAt: nowIso() })}>
                {t('user.addHandle')}
              </Button>
            )}
          </div>
          {variants.length > 0 && (
            <div className="mt-3">
              <p className="mb-2 text-xs text-bw-muted">{t('user.variantsHelp')}</p>
              <div className="flex flex-wrap gap-2">
                {variants.map((v) => (
                  <span key={v} className="rounded border border-bw-border px-2 py-1">
                    <Checkbox
                      checked={picked.has(v) || v === username}
                      disabled={v === username || (!picked.has(v) && picked.size >= 9)}
                      onChange={(c) => {
                        const n = new Set(picked);
                        if (c) n.add(v);
                        else n.delete(v);
                        setPicked(n);
                      }}
                      label={<span className="font-mono text-xs">{v}</span>}
                    />
                  </span>
                ))}
              </div>
              <p className="mt-2 text-xs text-bw-warn">{t('user.quotaWarning')}</p>
            </div>
          )}
        </Card>
        <Card title={t('user.catalogue')}>
          <ul className="space-y-1 text-sm">
            {automated.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2">
                <span>{p.name}</span>
                <span className="flex gap-1">
                  <Badge tone="ok">{t('user.api')}</Badge>
                  <Badge tone={settings.modeOf(p.id) === 'off' ? 'neutral' : 'gold'}>{td(`mode.${settings.modeOf(p.id)}`)}</Badge>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-bw-muted">{t('user.reliabilityNote')}</p>
        </Card>
      </div>

      {runIds.map((id) => (
        <div key={id} className="mt-4 space-y-3">
          <RunPanel runId={id} />
          <ResultsList runId={id} emptyText={t('user.noneFound')} />
        </div>
      ))}

      <Card className="mt-4" title={t('user.manualPlatforms')} subtitle={t('user.manualHelp')}>
        {!valid ? (
          <p className="text-sm text-bw-muted">{t('user.enterFirst')}</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {manual.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center gap-2 rounded-md border border-bw-border bg-bw-panel2 px-3 py-2">
                <span className="min-w-28 font-medium">{p.name}</span>
                {p.usernameRule && !p.usernameRule.test(username) ? (
                  <Badge tone="warn">{t('user.invalidOnPlatform')}</Badge>
                ) : (
                  <SafeLink href={p.profileUrl(username)} className="text-xs">
                    {t('user.openProfile')}
                  </SafeLink>
                )}
                {p.searchUrl && (
                  <SafeLink href={p.searchUrl(username)} className="text-xs">
                    {t('user.openSearch')}
                  </SafeLink>
                )}
                <span className="ml-auto">
                  <ManualRecordButton sourceId={p.id} sourceName={p.name} defaultUrl={p.profileUrl(username)} />
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
