import { useMemo, useState } from 'react';
import { Database } from 'lucide-react';
import { useI18n, useL10n } from '@/i18n';
import { useSettings } from '@/app/context';
import { SOURCE_CATEGORIES, SOURCES, type SourceMode } from '@/services/sources/catalog';
import { getAdapter } from '@/services/adapters/registry';
import { Badge, Card, HelpBox, Input, PageHeader, SafeLink, Select } from '@/components/ui';

export default function SourcesPage() {
  const { t, td } = useI18n();
  const l = useL10n();
  const settings = useSettings();
  const [cat, setCat] = useState('');
  const [access, setAccess] = useState('');
  const [q, setQ] = useState('');
  const list = useMemo(
    () => SOURCES.filter((s) => (!cat || s.category === cat) && (!access || s.access === access) && (!q || `${s.name} ${s.description.en} ${s.description.fr}`.toLowerCase().includes(q.toLowerCase()))),
    [cat, access, q],
  );
  return (
    <div>
      <PageHeader icon={<Database className="size-5" />} title={t('nav.sources')} description={t('desc.sources')} />
      <HelpBox storageKey="sources">
        <p>{t('help.sources')}</p>
      </HelpBox>
      <div className="mb-4 flex flex-wrap gap-2">
        <Input className="max-w-xs" placeholder={t('common.search')} aria-label={t('common.search')} value={q} onChange={(e) => setQ(e.target.value)} />
        <Select className="max-w-56" value={cat} onChange={(e) => setCat(e.target.value)} aria-label={t('sources.category')}>
          <option value="">{t('common.all')}</option>
          {SOURCE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {td(`cat.${c}`)}
            </option>
          ))}
        </Select>
        <Select className="max-w-48" value={access} onChange={(e) => setAccess(e.target.value)} aria-label={t('sources.access')}>
          <option value="">{t('common.all')}</option>
          {(['api', 'link', 'local'] as const).map((a) => (
            <option key={a} value={a}>
              {td(`access.${a}`)}
            </option>
          ))}
        </Select>
        <span className="self-center text-xs text-bw-muted">{t('results.count', { n: list.length })}</span>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {list.map((s) => {
          const mode = settings.modeOf(s.id);
          return (
            <Card
              key={s.id}
              title={s.name}
              subtitle={td(`cat.${s.category}`)}
              actions={
                <>
                  <Badge tone={s.access === 'api' ? 'ok' : s.access === 'local' ? 'info' : 'gold'}>{td(`access.${s.access}`)}</Badge>
                  {s.access !== 'local' && (
                    <Select
                      value={mode}
                      aria-label={t('privacy.mode')}
                      className="w-auto py-1 text-xs"
                      onChange={(e) => void settings.setSourceMode(s.id, e.target.value as SourceMode)}
                    >
                      {(s.access === 'api' ? (['auto', 'manual', 'off'] as const) : (['manual', 'off'] as const)).map((m) => (
                        <option key={m} value={m}>
                          {td(`mode.${m}`)}
                        </option>
                      ))}
                    </Select>
                  )}
                </>
              }
            >
              <p className="mb-3 text-sm text-bw-muted">{l(s.description)}</p>
              <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-xs">
                <dt className="text-bw-muted">{t('sources.sent')}</dt>
                <dd>{l(s.sentData)}</dd>
                <dt className="text-bw-muted">{t('sources.purpose')}</dt>
                <dd>{l(s.purpose)}</dd>
                <dt className="text-bw-muted">{t('sources.quota')}</dt>
                <dd>{l(s.quota)}</dd>
                <dt className="text-bw-muted">{t('sources.key')}</dt>
                <dd>{s.requiresKey ? t('common.yes') : t('common.no')}</dd>
                <dt className="text-bw-muted">CORS</dt>
                <dd>{s.cors === 'yes' ? <Badge tone="ok">{t('sources.corsOk')}</Badge> : s.cors === 'no' ? <Badge tone="warn">{t('sources.corsNo')}</Badge> : 'n/a'}</dd>
                <dt className="text-bw-muted">{t('sources.verified')}</dt>
                <dd>{s.lastVerified ?? <Badge tone="warn">{t('sources.notVerified')}</Badge>}</dd>
                {s.hosts.length > 0 && (
                  <>
                    <dt className="text-bw-muted">{t('sources.hosts')}</dt>
                    <dd className="font-mono">{s.hosts.join(', ')}{s.id === 'rdap' ? ` + ${t('sources.rdapHosts')}` : ''}</dd>
                  </>
                )}
                {s.access === 'api' && (
                  <>
                    <dt className="text-bw-muted">{t('sources.adapter')}</dt>
                    <dd>{getAdapter(s.id) ? getAdapter(s.id)!.queryTypes.map((x) => td(`qt.${x}`)).join(', ') || '—' : s.id === 'osm-tiles' ? t('sources.tilesOnly') : '—'}</dd>
                  </>
                )}
              </dl>
              <div className="mt-3 flex flex-wrap gap-3 text-xs">
                <SafeLink href={s.homepage}>{t('sources.homepage')}</SafeLink>
                {s.docsUrl && <SafeLink href={s.docsUrl}>{t('sources.docs')}</SafeLink>}
                {s.privacyUrl && <SafeLink href={s.privacyUrl}>{t('sources.privacy')}</SafeLink>}
                {s.termsUrl && <SafeLink href={s.termsUrl}>{t('sources.terms')}</SafeLink>}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
