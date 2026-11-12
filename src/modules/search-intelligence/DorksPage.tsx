import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BookmarkPlus, SearchCode, Trash2 } from 'lucide-react';
import { useI18n } from '@/i18n';
import { useApp } from '@/app/context';
import { buildQuery, EMPTY_DORK, ENGINE_URL, fillTemplate, placeholdersOf, TEMPLATES, translateQuery, type DorkInput, type Engine, type Placeholder } from '@/services/search/dorks';
import { getSetting, setSetting } from '@/services/storage/repository';
import { detectQueryType } from '@/utils/validation';
import { Badge, Button, Card, CopyButton, Field, HelpBox, Input, PageHeader, SafeLink, Select, Tabs } from '@/components/ui';

const ENGINES: Engine[] = ['google', 'bing', 'duckduckgo', 'yandex'];
const ENGINE_NAME: Record<Engine, string> = { google: 'Google', bing: 'Bing', duckduckgo: 'DuckDuckGo', yandex: 'Yandex' };

interface Saved {
  id: string;
  label: string;
  query: string;
}

export default function DorksPage() {
  const { t, td, lang } = useI18n();
  const { toast } = useApp();
  const [params] = useSearchParams();
  const [tab, setTab] = useState<'builder' | 'library' | 'saved'>('builder');
  const [d, setD] = useState<DorkInput>(EMPTY_DORK);
  const [vals, setVals] = useState<Partial<Record<Placeholder, string>>>({});
  const [cat, setCat] = useState<string>('');
  const [saved, setSaved] = useState<Saved[]>([]);

  useEffect(() => {
    void getSetting<Saved[]>('dorks.saved', []).then(setSaved);
  }, []);
  useEffect(() => {
    const q = params.get('q');
    if (!q) return;
    const type = detectQueryType(q);
    if (type === 'domain') {
      setD({ ...EMPTY_DORK, site: q });
      setVals((v) => ({ ...v, domain: q }));
    } else if (type === 'email') {
      setD({ ...EMPTY_DORK, exact: q });
      setVals((v) => ({ ...v, email: q }));
    } else if (type === 'username') {
      setD({ ...EMPTY_DORK, exact: q.replace(/^@/, '') });
      setVals((v) => ({ ...v, username: q.replace(/^@/, '') }));
    } else {
      setD({ ...EMPTY_DORK, exact: q });
      setVals((v) => ({ ...v, keyword: q, name: q }));
    }
  }, [params]);

  const set = (k: keyof DorkInput) => (e: React.ChangeEvent<HTMLInputElement>) => setD({ ...d, [k]: e.target.value });
  const built = useMemo(() => ENGINES.map((en) => ({ engine: en, ...buildQuery(d, en) })), [d]);
  const persist = async (next: Saved[]) => {
    setSaved(next);
    await setSetting('dorks.saved', next);
  };
  const save = async (label: string, query: string) => {
    if (!query) return;
    await persist([{ id: crypto.randomUUID(), label: label.slice(0, 120) || query.slice(0, 60), query }, ...saved].slice(0, 300));
    toast(t('common.saved'));
  };

  const fields: Array<[keyof DorkInput, string, string?]> = [
    ['all', t('dork.all')],
    ['exact', t('dork.exact')],
    ['any', t('dork.any')],
    ['exclude', t('dork.exclude')],
    ['site', t('dork.site'), 'example.com'],
    ['excludeSite', t('dork.excludeSite')],
    ['filetype', t('dork.filetype'), 'pdf'],
    ['intitle', t('dork.intitle')],
    ['inurl', t('dork.inurl')],
    ['intext', t('dork.intext')],
  ];

  return (
    <div>
      <PageHeader icon={<SearchCode className="size-5" />} title={t('nav.search')} description={t('desc.search')} />
      <HelpBox storageKey="dorks">
        <p>{t('help.dorks')}</p>
      </HelpBox>
      <Tabs value={tab} onChange={setTab} items={[{ id: 'builder', label: t('dork.builder') }, { id: 'library', label: t('dork.library'), count: TEMPLATES.length }, { id: 'saved', label: t('dork.saved'), count: saved.length }]} />

      {tab === 'builder' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title={t('dork.builder')} actions={<Button size="sm" variant="ghost" onClick={() => setD(EMPTY_DORK)}>{t('common.reset')}</Button>}>
            <div className="grid gap-3 sm:grid-cols-2">
              {fields.map(([k, label, ph]) => (
                <Field key={k} label={label}>
                  {(id) => <Input id={id} value={d[k]} placeholder={ph} maxLength={300} onChange={set(k)} />}
                </Field>
              ))}
              <Field label={t('dork.after')}>{(id) => <Input id={id} type="date" value={d.after} onChange={set('after')} />}</Field>
              <Field label={t('dork.before')}>{(id) => <Input id={id} type="date" value={d.before} onChange={set('before')} />}</Field>
            </div>
          </Card>
          <Card title={t('dork.generated')} subtitle={t('dork.transparent')}>
            <ul className="space-y-3">
              {built.map((b) => (
                <li key={b.engine} className="rounded-md border border-bw-border bg-bw-panel2 p-3">
                  <div className="mb-1 flex items-center gap-2">
                    <b className="text-sm">{ENGINE_NAME[b.engine]}</b>
                    {b.dropped.length > 0 && <Badge tone="warn">{t('dork.unsupported', { list: b.dropped.join(', ') })}</Badge>}
                    <span className="ml-auto flex items-center gap-1">
                      <CopyButton value={b.query} />
                      <button type="button" aria-label={t('dork.save')} title={t('dork.save')} disabled={!b.query} className="rounded p-1 text-bw-muted hover:text-bw-text disabled:opacity-30" onClick={() => save(`${ENGINE_NAME[b.engine]}: ${b.query.slice(0, 50)}`, b.query)}>
                        <BookmarkPlus className="size-3.5" />
                      </button>
                    </span>
                  </div>
                  <code className="block min-h-6 break-all text-[13px] text-bw-gold">{b.query || '—'}</code>
                  {b.query && (
                    <SafeLink href={ENGINE_URL[b.engine](b.query)} className="mt-1 text-xs">
                      {t('dork.open', { engine: ENGINE_NAME[b.engine] })}
                    </SafeLink>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      {tab === 'library' && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card title={t('dork.values')} subtitle={t('dork.valuesHelp')}>
            <div className="space-y-2">
              {(['name', 'username', 'email', 'domain', 'company', 'keyword'] as Placeholder[]).map((p) => (
                <Field key={p} label={td(`dork.ph.${p}`)}>
                  {(id) => <Input id={id} value={vals[p] ?? ''} maxLength={200} onChange={(e) => setVals({ ...vals, [p]: e.target.value })} />}
                </Field>
              ))}
            </div>
          </Card>
          <Card
            className="lg:col-span-2"
            title={t('dork.library')}
            actions={
              <Select value={cat} onChange={(e) => setCat(e.target.value)} className="max-w-52" aria-label={t('dork.category')}>
                <option value="">{t('common.all')}</option>
                {[...new Set(TEMPLATES.map((x) => x.category))].map((c) => (
                  <option key={c} value={c}>
                    {td(`dork.cat.${c}`)}
                  </option>
                ))}
              </Select>
            }
          >
            <ul className="space-y-2">
              {TEMPLATES.filter((x) => !cat || x.category === cat).map((tpl) => {
                const q = fillTemplate(tpl.template, vals);
                const missing = placeholdersOf(tpl.template).filter((p) => !vals[p]?.trim());
                return (
                  <li key={tpl.id} className="rounded-md border border-bw-border bg-bw-panel2 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <b className="text-sm">{tpl.title[lang]}</b>
                      <Badge>{td(`dork.cat.${tpl.category}`)}</Badge>
                      {missing.length > 0 && <Badge tone="warn">{t('dork.missing', { list: missing.map((m) => td(`dork.ph.${m}`)).join(', ') })}</Badge>}
                    </div>
                    <code className="mt-1 block break-all text-[13px] text-bw-gold">{q}</code>
                    {!missing.length && (
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">
                        {ENGINES.map((en) => {
                          const tr = translateQuery(q, en);
                          return (
                            <SafeLink key={en} href={ENGINE_URL[en](tr.query)} title={tr.unsupported.length ? t('dork.unsupported', { list: tr.unsupported.join(', ') }) : tr.query}>
                              {ENGINE_NAME[en]}
                              {tr.unsupported.length ? ' ⚠' : ''}
                            </SafeLink>
                          );
                        })}
                        <CopyButton value={q} />
                        <button type="button" className="text-bw-muted hover:text-bw-text" onClick={() => save(tpl.title[lang], q)}>
                          {t('dork.save')}
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>
      )}

      {tab === 'saved' && (
        <Card title={t('dork.saved')}>
          {!saved.length ? (
            <p className="text-sm text-bw-muted">{t('dork.noneSaved')}</p>
          ) : (
            <ul className="divide-y divide-bw-border">
              {saved.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                  <span className="font-medium">{s.label}</span>
                  <code className="w-full break-all text-xs text-bw-gold">{s.query}</code>
                  <span className="flex gap-3 text-xs">
                    {ENGINES.map((en) => (
                      <SafeLink key={en} href={ENGINE_URL[en](translateQuery(s.query, en).query)}>
                        {ENGINE_NAME[en]}
                      </SafeLink>
                    ))}
                  </span>
                  <button type="button" aria-label={t('common.delete')} className="ml-auto text-bw-muted hover:text-bw-red-bright" onClick={() => persist(saved.filter((x) => x.id !== s.id))}>
                    <Trash2 className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}
