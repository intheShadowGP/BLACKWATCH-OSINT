import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, CalendarClock, Download, MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import { useI18n } from '@/i18n';
import { useApp } from '@/app/context';
import { db } from '@/services/storage/db';
import { addEvent, deleteEvent, updateEvent } from '@/services/storage/repository';
import { getSource } from '@/services/sources/catalog';
import { CONFIDENCE_LEVELS, DATE_KINDS, VERIFICATION_LEVELS, type Confidence, type DateKind, type Entity, type TimelineEvent, type Verification } from '@/types';
import { downloadBlob, nowIso } from '@/utils/common';
import { findDuplicateEvents, formatOffset, listTimeZones, utcToZonedLocal, zonedToUtcIso } from '@/utils/time';
import { toCsv } from '@/services/export/format';
import { safeUrl } from '@/utils/validation';
import { Badge, Button, Card, ConfidenceBadge, EmptyState, Field, HelpBox, Input, Modal, PageHeader, SafeLink, Select, Textarea, VerificationBadge } from '@/components/ui';

const KIND_TONE: Record<DateKind, 'red' | 'gold' | 'info' | 'neutral'> = { occurrence: 'red', publication: 'gold', discovery: 'info', collection: 'neutral' };

export default function TimelinePage() {
  const { t, td, locale } = useI18n();
  const [params] = useSearchParams();
  const { activeId, investigations, confirm, toast } = useApp();
  const [invId, setInvId] = useState(params.get('inv') ?? activeId ?? '');
  useEffect(() => {
    if (!invId && activeId) setInvId(activeId);
  }, [activeId, invId]);
  const events = useLiveQuery(() => (invId ? db.events.where('investigationId').equals(invId).sortBy('datetime') : Promise.resolve([] as TimelineEvent[])), [invId], [] as TimelineEvent[]);
  const entities = useLiveQuery(() => (invId ? db.entities.where('investigationId').equals(invId).toArray() : Promise.resolve([] as Entity[])), [invId], [] as Entity[]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [kinds, setKinds] = useState<Set<DateKind>>(new Set(DATE_KINDS));
  const [entityF, setEntityF] = useState('');
  const [displayTz, setDisplayTz] = useState<'event' | 'utc' | 'local'>('event');
  const [modal, setModal] = useState<{ open: boolean; event?: TimelineEvent }>({ open: false });

  const filtered = useMemo(
    () =>
      events.filter((e) => {
        if (!kinds.has(e.dateKind)) return false;
        if (from && e.datetime < new Date(from).toISOString()) return false;
        if (to && e.datetime > new Date(`${to}T23:59:59`).toISOString()) return false;
        if (entityF && !e.entityIds.includes(entityF)) return false;
        return true;
      }),
    [events, kinds, from, to, entityF],
  );
  const dups = useMemo(() => findDuplicateEvents(events), [events]);
  const dupIds = new Set(dups.flat().map((e) => e.id));
  const byId = new Map(entities.map((e) => [e.id, e]));

  const fmt = (e: TimelineEvent) => {
    const tz = displayTz === 'utc' ? 'UTC' : displayTz === 'local' ? undefined : e.timezone.split(' ')[0].startsWith('UTC') ? 'UTC' : e.timezone.split(' ')[0];
    try {
      return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: tz }).format(new Date(e.datetime)) + (displayTz === 'event' && tz ? ` (${tz === 'UTC' ? e.timezone : `${tz}, ${formatOffset(e.datetime, tz)}`})` : displayTz === 'utc' ? ' UTC' : '');
    } catch {
      return e.datetime;
    }
  };

  const exportAs = (kind: 'csv' | 'json') => {
    const inv = investigations.find((i) => i.id === invId);
    const rows = filtered.map((e) => ({
      datetime_utc: e.datetime,
      timezone: e.timezone,
      date_kind: e.dateKind,
      title: e.title,
      description: e.description,
      verification: e.verification,
      confidence: e.confidence,
      entities: e.entityIds.map((x) => byId.get(x)?.value ?? x).join(' | '),
      sources: e.sources.map((s) => `${getSource(s.sourceId)?.name ?? s.sourceId}${s.url ? ` ${s.url}` : ''}`).join(' | '),
      lat: e.lat ?? '',
      lon: e.lon ?? '',
    }));
    if (kind === 'csv') downloadBlob(new Blob([toCsv(rows, Object.keys(rows[0] ?? { datetime_utc: '' }) as never)], { type: 'text/csv' }), `${inv?.name ?? 'timeline'}-timeline.csv`);
    else downloadBlob(new Blob([JSON.stringify({ format: 'blackwatch-timeline', investigation: inv?.name, exportedAt: nowIso(), events: filtered }, null, 2)], { type: 'application/json' }), `${inv?.name ?? 'timeline'}-timeline.json`);
  };

  let lastDay = '';
  return (
    <div>
      <PageHeader
        icon={<CalendarClock className="size-5" />}
        title={t('nav.timeline')}
        description={t('desc.timeline')}
        actions={
          <Select value={invId} onChange={(e) => setInvId(e.target.value)} aria-label={t('inv.select')} className="max-w-64">
            <option value="">{t('inv.select')}</option>
            {investigations.map((i) => (
              <option key={i.id} value={i.id}>
                {i.isDemo ? '[DEMO] ' : ''}
                {i.name}
              </option>
            ))}
          </Select>
        }
      />
      <HelpBox storageKey="timeline">
        <p>{t('help.timeline')}</p>
      </HelpBox>
      {!invId ? (
        <EmptyState icon={<CalendarClock className="size-8" />} title={t('graph.pickInv')} />
      ) : (
        <>
          <Card className="mb-4">
            <div className="flex flex-wrap items-end gap-3">
              <Field label={t('timeline.from')}>{(id) => <Input id={id} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />}</Field>
              <Field label={t('timeline.to')}>{(id) => <Input id={id} type="date" value={to} onChange={(e) => setTo(e.target.value)} />}</Field>
              <Field label={t('timeline.entity')}>
                {(id) => (
                  <Select id={id} value={entityF} onChange={(e) => setEntityF(e.target.value)} className="max-w-56">
                    <option value="">{t('common.all')}</option>
                    {entities.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.value.slice(0, 60)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label={t('timeline.display')}>
                {(id) => (
                  <Select id={id} value={displayTz} onChange={(e) => setDisplayTz(e.target.value as typeof displayTz)}>
                    <option value="event">{t('timeline.tzEvent')}</option>
                    <option value="utc">UTC</option>
                    <option value="local">{t('timeline.tzLocal')}</option>
                  </Select>
                )}
              </Field>
              <div className="flex flex-wrap gap-1">
                {DATE_KINDS.map((k) => (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={kinds.has(k)}
                    className={`rounded border px-2 py-1 text-xs ${kinds.has(k) ? 'border-bw-gold/50 text-bw-text' : 'border-bw-border text-bw-muted line-through'}`}
                    onClick={() => {
                      const n = new Set(kinds);
                      if (n.has(k)) n.delete(k);
                      else n.add(k);
                      setKinds(n);
                    }}
                  >
                    {td(`dateKind.${k}`)}
                  </button>
                ))}
              </div>
              <span className="ml-auto flex gap-2">
                <Button size="sm" icon={<Download className="size-3.5" />} disabled={!filtered.length} onClick={() => exportAs('csv')}>
                  CSV
                </Button>
                <Button size="sm" icon={<Download className="size-3.5" />} disabled={!filtered.length} onClick={() => exportAs('json')}>
                  JSON
                </Button>
                <Button size="sm" variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setModal({ open: true })}>
                  {t('timeline.add')}
                </Button>
              </span>
            </div>
          </Card>
          {dups.length > 0 && (
            <div className="mb-4 flex items-start gap-2 rounded-md border border-bw-warn/40 bg-bw-warn/5 px-3 py-2 text-sm text-bw-warn">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>{t('timeline.dups', { n: dups.length, list: dups.slice(0, 3).map(([a, b]) => `"${a.title}" / "${b.title}"`).join(' ; ') })}</span>
            </div>
          )}
          {!filtered.length ? (
            <EmptyState title={t('timeline.none')} />
          ) : (
            <ol className="relative ml-3 border-l border-bw-border">
              {filtered.map((e) => {
                const day = e.datetime.slice(0, 10);
                const showDay = day !== lastDay;
                lastDay = day;
                return (
                  <li key={e.id} className="mb-3 ml-5">
                    {showDay && <div className="-ml-8 mb-2 mt-4 text-xs font-semibold uppercase tracking-wider text-bw-gold">{new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeZone: 'UTC' }).format(new Date(e.datetime))} (UTC)</div>}
                    <span className="absolute -left-[7px] mt-2 size-3 rounded-full border-2 border-bw-bg" style={{ background: e.dateKind === 'occurrence' ? '#c42f37' : e.dateKind === 'publication' ? '#c9a54a' : e.dateKind === 'discovery' ? '#4c7fc0' : '#77736c' }} />
                    <div className={`rounded-md border bg-bw-panel p-3 ${dupIds.has(e.id) ? 'border-bw-warn/60' : 'border-bw-border'}`}>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs text-bw-muted">{fmt(e)}</span>
                        <Badge tone={KIND_TONE[e.dateKind]}>{td(`dateKind.${e.dateKind}`)}</Badge>
                        <VerificationBadge v={e.verification} />
                        <ConfidenceBadge c={e.confidence} />
                        {e.lat !== undefined && <MapPin className="size-3.5 text-bw-gold" aria-label="GPS" />}
                        <span className="ml-auto flex gap-1">
                          <button type="button" aria-label={t('common.edit')} className="text-bw-muted hover:text-bw-text" onClick={() => setModal({ open: true, event: e })}>
                            <Pencil className="size-4" />
                          </button>
                          <button
                            type="button"
                            aria-label={t('common.delete')}
                            className="text-bw-muted hover:text-bw-red-bright"
                            onClick={async () => {
                              if (await confirm({ title: t('timeline.delete'), message: t('timeline.deleteConfirm', { title: e.title }), danger: true })) {
                                await deleteEvent(e.id);
                                toast(t('common.deleted'));
                              }
                            }}
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </span>
                      </div>
                      <h3 className="mt-1 font-medium">{e.title}</h3>
                      {e.description && <p className="mt-0.5 whitespace-pre-wrap text-sm text-bw-muted">{e.description}</p>}
                      <div className="mt-1 flex flex-wrap gap-2 text-xs text-bw-muted">
                        {e.entityIds.map((x) => byId.get(x) && <Badge key={x}>{byId.get(x)!.value.slice(0, 40)}</Badge>)}
                        {e.sources.map((s, i) => (s.url ? <SafeLink key={i} href={s.url}>{getSource(s.sourceId)?.name ?? s.sourceName ?? s.sourceId}</SafeLink> : <span key={i}>{getSource(s.sourceId)?.name ?? s.sourceName ?? s.sourceId}</span>))}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </>
      )}
      {invId && <EventModal open={modal.open} event={modal.event} onClose={() => setModal({ open: false })} investigationId={invId} entities={entities} />}
    </div>
  );
}

function EventModal({ open, onClose, event, investigationId, entities }: { open: boolean; onClose: () => void; event?: TimelineEvent; investigationId: string; entities: Entity[] }) {
  const { t, td } = useI18n();
  const { toast, reportError } = useApp();
  const zones = useMemo(() => listTimeZones(), []);
  const defaultTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tz, setTz] = useState(defaultTz);
  const [local, setLocal] = useState('');
  const [kind, setKind] = useState<DateKind>('occurrence');
  const [verification, setVerification] = useState<Verification>('unverified');
  const [confidence, setConfidence] = useState<Confidence>('unknown');
  const [sourceUrl, setSourceUrl] = useState('');
  const [ents, setEnts] = useState<string[]>([]);
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const z = event?.timezone && zones.includes(event.timezone) ? event.timezone : event ? 'UTC' : defaultTz;
    setTitle(event?.title ?? '');
    setDescription(event?.description ?? '');
    setTz(z);
    setLocal(event ? utcToZonedLocal(event.datetime, z) : '');
    setKind(event?.dateKind ?? 'occurrence');
    setVerification(event?.verification ?? 'unverified');
    setConfidence(event?.confidence ?? 'unknown');
    setEnts(event?.entityIds ?? []);
    setLat(event?.lat?.toString() ?? '');
    setLon(event?.lon?.toString() ?? '');
    setSourceUrl('');
    setErr(null);
  }, [open, event, zones, defaultTz]);

  const save = async () => {
    if (!title.trim()) return setErr(t('error.required'));
    const iso = zonedToUtcIso(local.length === 16 ? local : local.slice(0, 19), tz);
    if (!iso) return setErr(t('error.invalidDate'));
    if (sourceUrl && !safeUrl(sourceUrl)) return setErr(t('error.invalidUrl'));
    const la = lat.trim() ? Number(lat) : undefined;
    const lo = lon.trim() ? Number(lon) : undefined;
    if ((la !== undefined || lo !== undefined) && (la === undefined || lo === undefined || !(Math.abs(la) <= 90) || !(Math.abs(lo) <= 180))) return setErr(t('error.invalidCoords'));
    const src = sourceUrl ? [{ sourceId: 'manual', sourceName: 'Manual', url: safeUrl(sourceUrl)!, collectedAt: nowIso() }] : [];
    try {
      const payload = { investigationId, title: title.trim(), description, datetime: iso, timezone: tz, dateKind: kind, verification, confidence, entityIds: ents, lat: la, lon: lo };
      if (event) await updateEvent(event.id, { ...payload, sources: [...event.sources, ...src] });
      else await addEvent({ ...payload, sources: src.length ? src : [{ sourceId: 'manual', sourceName: 'Analyst input', collectedAt: nowIso() }] });
      toast(t('common.saved'));
      onClose();
    } catch (e) {
      reportError(e);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={event ? t('timeline.edit') : t('timeline.add')}
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={save}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label={t('timeline.title')} error={err}>
            {(id) => <Input id={id} value={title} maxLength={300} onChange={(e) => setTitle(e.target.value)} />}
          </Field>
        </div>
        <Field label={t('timeline.datetimeLocal')}>{(id) => <Input id={id} type="datetime-local" step={1} value={local} onChange={(e) => setLocal(e.target.value)} />}</Field>
        <Field label={t('timeline.timezone')} hint={local && zonedToUtcIso(local.slice(0, 16), tz) ? `= ${zonedToUtcIso(local.slice(0, 16), tz)}` : undefined}>
          {(id) => (
            <Select id={id} value={tz} onChange={(e) => setTz(e.target.value)}>
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('timeline.kind')} hint={td(`dateKindHelp.${kind}`)}>
          {(id) => (
            <Select id={id} value={kind} onChange={(e) => setKind(e.target.value as DateKind)}>
              {DATE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {td(`dateKind.${k}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('common.verification')}>
          {(id) => (
            <Select id={id} value={verification} onChange={(e) => setVerification(e.target.value as Verification)}>
              {VERIFICATION_LEVELS.map((x) => (
                <option key={x} value={x}>
                  {td(`verif.${x}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('common.confidence')}>
          {(id) => (
            <Select id={id} value={confidence} onChange={(e) => setConfidence(e.target.value as Confidence)}>
              {CONFIDENCE_LEVELS.map((x) => (
                <option key={x} value={x}>
                  {td(`conf.${x}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('entity.sourceUrl')}>{(id) => <Input id={id} value={sourceUrl} placeholder="https://" onChange={(e) => setSourceUrl(e.target.value)} />}</Field>
        <Field label={t('geo.lat')}>{(id) => <Input id={id} value={lat} inputMode="decimal" onChange={(e) => setLat(e.target.value)} />}</Field>
        <Field label={t('geo.lon')}>{(id) => <Input id={id} value={lon} inputMode="decimal" onChange={(e) => setLon(e.target.value)} />}</Field>
        <div className="sm:col-span-2">
          <Field label={t('timeline.entities')}>
            {(id) => (
              <select id={id} multiple value={ents} onChange={(e) => setEnts([...e.target.selectedOptions].map((o) => o.value))} className="h-28 w-full rounded-md border border-bw-border bg-bw-bg px-2 py-1 text-sm">
                {entities.map((e) => (
                  <option key={e.id} value={e.id}>
                    [{td(`etype.${e.type}`)}] {e.value.slice(0, 80)}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label={t('inv.description')}>{(id) => <Textarea id={id} value={description} onChange={(e) => setDescription(e.target.value)} />}</Field>
        </div>
      </div>
    </Modal>
  );
}
