import { useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { CalendarClock, Download, FileText, Lock, Paperclip, Pencil, Plus, Share2, Trash2, Upload } from 'lucide-react';
import { useI18n } from '@/i18n';
import { useApp, useSettings } from '@/app/context';
import { db } from '@/services/storage/db';
import { addEvidence, deleteEntity, deleteEvidence, deleteNote, deleteRelation, saveNote, updateInvestigation } from '@/services/storage/repository';
import { getSource } from '@/services/sources/catalog';
import { ENTITY_TYPES, INVESTIGATION_STATUSES, type Entity, type EntityType, type Evidence, type Investigation, type InvestigationStatus, type Note, type Relation } from '@/types';
import { downloadBlob, formatBytes, formatDateTime } from '@/utils/common';
import { checkFile } from '@/utils/files';
import { hashFile } from '@/workers/client';
import { Badge, Button, Card, ConfidenceBadge, CopyButton, EmptyState, Field, Input, KeyValue, Modal, PageHeader, Pagination, SafeLink, Select, Tabs, Textarea, VerificationBadge, usePaged } from '@/components/ui';
import { EntityModal, RelationModal } from '@/components/forms';
import { SuggestionsPanel } from '@/components/Suggestions';
import { EncryptedExportModal, exportBackupFile } from './backupUi';

type Tab = 'overview' | 'entities' | 'relations' | 'suggestions' | 'notes' | 'evidence' | 'sources' | 'history';

export default function InvestigationDetail() {
  const { id = '' } = useParams();
  const { t, td, locale } = useI18n();
  const { setActiveId, activeId, reportError } = useApp();
  const [tab, setTab] = useState<Tab>('overview');
  const [encOpen, setEncOpen] = useState(false);
  const inv = useLiveQuery(() => db.investigations.get(id), [id]);
  const entities = useLiveQuery(() => db.entities.where('investigationId').equals(id).toArray(), [id], [] as Entity[]);
  const relations = useLiveQuery(() => db.relations.where('investigationId').equals(id).toArray(), [id], [] as Relation[]);
  const notes = useLiveQuery(() => db.notes.where('investigationId').equals(id).reverse().sortBy('updatedAt'), [id], [] as Note[]);
  const evidence = useLiveQuery(() => db.evidence.where('investigationId').equals(id).toArray(), [id], [] as Evidence[]);
  const eventsCount = useLiveQuery(() => db.events.where('investigationId').equals(id).count(), [id], 0);
  const activity = useLiveQuery(() => db.activity.where('investigationId').equals(id).reverse().sortBy('at'), [id], []);

  if (inv === undefined) return <p className="text-bw-muted">{t('common.loading')}</p>;
  if (!inv) return <EmptyState title={t('error.notFound')} />;

  return (
    <div>
      <PageHeader
        title={inv.name}
        description={inv.isDemo ? t('demo.banner') : inv.description.slice(0, 240) || undefined}
        actions={
          <>
            <Button variant={activeId === inv.id ? 'gold' : 'secondary'} onClick={() => setActiveId(activeId === inv.id ? null : inv.id)}>
              {activeId === inv.id ? t('inv.isActive') : t('inv.setActive')}
            </Button>
            <Link to={`/graph?inv=${inv.id}`} className="inline-flex items-center gap-1.5 rounded-md border border-bw-border bg-bw-elev px-3 py-2 text-sm hover:bg-[#26262c]">
              <Share2 className="size-4" /> {t('nav.graph')}
            </Link>
            <Link to={`/timeline?inv=${inv.id}`} className="inline-flex items-center gap-1.5 rounded-md border border-bw-border bg-bw-elev px-3 py-2 text-sm hover:bg-[#26262c]">
              <CalendarClock className="size-4" /> {t('nav.timeline')}
            </Link>
            <Link to={`/reports?inv=${inv.id}`} className="inline-flex items-center gap-1.5 rounded-md border border-bw-border bg-bw-elev px-3 py-2 text-sm hover:bg-[#26262c]">
              <FileText className="size-4" /> {t('nav.reports')}
            </Link>
            <Button icon={<Download className="size-4" />} onClick={() => exportBackupFile({ ids: [inv.id] }, t).catch(reportError)}>
              JSON
            </Button>
            <Button icon={<Lock className="size-4" />} onClick={() => setEncOpen(true)}>
              {t('backup.encrypted')}
            </Button>
          </>
        }
      />
      {inv.isDemo && <div className="mb-4 rounded-md border border-bw-warn/50 bg-bw-warn/10 px-3 py-2 text-sm font-medium text-bw-warn">{t('demo.banner')}</div>}
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        items={[
          { id: 'overview', label: t('inv.tab.overview') },
          { id: 'entities', label: t('inv.tab.entities'), count: entities.length },
          { id: 'relations', label: t('inv.tab.relations'), count: relations.length },
          { id: 'suggestions', label: t('inv.tab.suggestions') },
          { id: 'notes', label: t('inv.tab.notes'), count: notes.length },
          { id: 'evidence', label: t('inv.tab.evidence'), count: evidence.length },
          { id: 'sources', label: t('inv.tab.sources') },
          { id: 'history', label: t('inv.tab.history') },
        ]}
      />
      {tab === 'overview' && <Overview key={inv.id + inv.updatedAt} inv={inv} counts={{ entities: entities.length, relations: relations.length, events: eventsCount, notes: notes.length, evidence: evidence.length }} />}
      {tab === 'entities' && <EntitiesTab investigationId={inv.id} entities={entities} />}
      {tab === 'relations' && <RelationsTab investigationId={inv.id} entities={entities} relations={relations} />}
      {tab === 'suggestions' && <SuggestionsPanel investigationId={inv.id} />}
      {tab === 'notes' && <NotesTab investigationId={inv.id} notes={notes} />}
      {tab === 'evidence' && <EvidenceTab investigationId={inv.id} evidence={evidence} />}
      {tab === 'sources' && <SourcesTab entities={entities} relations={relations} />}
      {tab === 'history' && (
        <Card>
          {!activity.length ? (
            <EmptyState title={t('dash.noActivity')} />
          ) : (
            <ul className="space-y-1 text-sm">
              {activity.slice(0, 500).map((a) => (
                <li key={a.id} className="flex gap-3 border-b border-bw-border/50 py-1">
                  <span className="shrink-0 text-xs text-bw-muted">{formatDateTime(a.at, locale)}</span>
                  <span className="shrink-0 text-bw-gold">{td(`act.${a.action}`)}</span>
                  <span className="min-w-0 break-words text-bw-muted">{a.detail}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
      <EncryptedExportModal open={encOpen} onClose={() => setEncOpen(false)} ids={[inv.id]} />
    </div>
  );
}

function Overview({ inv, counts }: { inv: Investigation; counts: Record<string, number> }) {
  const { t, td, locale } = useI18n();
  const { toast, reportError } = useApp();
  const [name, setName] = useState(inv.name);
  const [description, setDescription] = useState(inv.description);
  const [objective, setObjective] = useState(inv.objective);
  const [status, setStatus] = useState<InvestigationStatus>(inv.status);
  const [tags, setTags] = useState(inv.tags.join(', '));
  const dirty = name !== inv.name || description !== inv.description || objective !== inv.objective || status !== inv.status || tags !== inv.tags.join(', ');
  const save = async () => {
    if (!name.trim()) return;
    try {
      await updateInvestigation(inv.id, { name: name.trim(), description, objective, status, tags: tags.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 50) });
      toast(t('common.saved'));
    } catch (e) {
      reportError(e);
    }
  };
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card title={t('inv.tab.overview')} className="lg:col-span-2" actions={<Button variant="primary" size="sm" disabled={!dirty || !name.trim()} onClick={save}>{t('common.save')}</Button>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('inv.name')} error={!name.trim() ? t('error.required') : null}>{(id) => <Input id={id} value={name} maxLength={200} onChange={(e) => setName(e.target.value)} />}</Field>
          <Field label={t('common.status')}>
            {(id) => (
              <Select id={id} value={status} onChange={(e) => setStatus(e.target.value as InvestigationStatus)}>
                {INVESTIGATION_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {td(`invStatus.${s}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <div className="sm:col-span-2">
            <Field label={t('inv.description')}>{(id) => <Textarea id={id} value={description} onChange={(e) => setDescription(e.target.value)} />}</Field>
          </div>
          <div className="sm:col-span-2">
            <Field label={t('inv.objective')}>{(id) => <Textarea id={id} value={objective} onChange={(e) => setObjective(e.target.value)} />}</Field>
          </div>
          <div className="sm:col-span-2">
            <Field label={t('inv.tags')}>{(id) => <Input id={id} value={tags} onChange={(e) => setTags(e.target.value)} />}</Field>
          </div>
        </div>
      </Card>
      <Card title={t('inv.facts')}>
        <KeyValue
          rows={[
            [t('report.id'), <span className="flex items-center gap-1">{inv.id.slice(0, 8)}… <CopyButton value={inv.id} /></span>],
            [t('inv.createdOn'), formatDateTime(inv.createdAt, locale)],
            [t('inv.updated'), formatDateTime(inv.updatedAt, locale)],
            [t('inv.tab.entities'), counts.entities],
            [t('inv.tab.relations'), counts.relations],
            [t('nav.timeline'), counts.events],
            [t('inv.tab.notes'), counts.notes],
            [t('inv.tab.evidence'), counts.evidence],
          ]}
        />
      </Card>
    </div>
  );
}

function EntitiesTab({ investigationId, entities }: { investigationId: string; entities: Entity[] }) {
  const { t, td } = useI18n();
  const { confirm, toast } = useApp();
  const [edit, setEdit] = useState<Entity | undefined>();
  const [open, setOpen] = useState(false);
  const [typeF, setTypeF] = useState<'' | EntityType>('');
  const [q, setQ] = useState('');
  const list = useMemo(() => entities.filter((e) => (!typeF || e.type === typeF) && (!q || `${e.value} ${e.label} ${e.notes}`.toLowerCase().includes(q.toLowerCase()))).sort((a, b) => a.type.localeCompare(b.type) || a.value.localeCompare(b.value)), [entities, typeF, q]);
  const { slice, page, pageCount, setPage } = usePaged(list, 50);
  return (
    <Card
      actions={
        <Button variant="primary" size="sm" icon={<Plus className="size-3.5" />} onClick={() => { setEdit(undefined); setOpen(true); }}>
          {t('entity.add')}
        </Button>
      }
      title={t('inv.tab.entities')}
    >
      <div className="mb-3 flex flex-wrap gap-2">
        <Input className="max-w-xs" placeholder={t('common.search')} aria-label={t('common.search')} value={q} onChange={(e) => setQ(e.target.value)} />
        <Select className="max-w-48" value={typeF} aria-label={t('entity.type')} onChange={(e) => setTypeF(e.target.value as EntityType | '')}>
          <option value="">{t('common.allTypes')}</option>
          {ENTITY_TYPES.map((x) => (
            <option key={x} value={x}>
              {td(`etype.${x}`)}
            </option>
          ))}
        </Select>
      </div>
      {!list.length ? (
        <EmptyState title={t('entity.none')}>{t('entity.noneHint')}</EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-bw-muted">
              <tr>
                <th className="py-2 pr-2">{t('entity.type')}</th>
                <th className="py-2 pr-2">{t('entity.value')}</th>
                <th className="py-2 pr-2">{t('common.verification')}</th>
                <th className="py-2 pr-2">{t('inv.tab.sources')}</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-bw-border">
              {slice.map((e) => (
                <tr key={e.id} className="align-top">
                  <td className="py-2 pr-2">
                    <Badge>{td(`etype.${e.type}`)}</Badge>
                  </td>
                  <td className="max-w-md py-2 pr-2">
                    <div className="flex items-start gap-1 break-all font-mono text-[13px]">
                      {/^https?:\/\//.test(e.value) ? <SafeLink href={e.value}>{e.value}</SafeLink> : e.value}
                      <CopyButton value={e.value} />
                    </div>
                    {e.label && <div className="text-xs text-bw-muted">{e.label}</div>}
                  </td>
                  <td className="space-x-1 py-2 pr-2">
                    <VerificationBadge v={e.verification} />
                    <ConfidenceBadge c={e.confidence} />
                  </td>
                  <td className="py-2 pr-2 text-xs text-bw-muted">{e.sources.map((s) => getSource(s.sourceId)?.name ?? s.sourceName ?? s.sourceId).filter((v, i, a) => a.indexOf(v) === i).join(', ') || '—'}</td>
                  <td className="whitespace-nowrap py-2 text-right">
                    <button type="button" aria-label={t('common.edit')} className="rounded p-1 text-bw-muted hover:text-bw-text" onClick={() => { setEdit(e); setOpen(true); }}>
                      <Pencil className="size-4" />
                    </button>
                    <button
                      type="button"
                      aria-label={t('common.delete')}
                      className="rounded p-1 text-bw-muted hover:text-bw-red-bright"
                      onClick={async () => {
                        if (await confirm({ title: t('entity.delete'), message: t('entity.deleteConfirm', { value: e.value }), danger: true })) {
                          await deleteEntity(e.id);
                          toast(t('common.deleted'));
                        }
                      }}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} pageCount={pageCount} onPage={setPage} />
      <EntityModal open={open} onClose={() => setOpen(false)} investigationId={investigationId} entity={edit} />
    </Card>
  );
}

function RelationsTab({ investigationId, entities, relations }: { investigationId: string; entities: Entity[]; relations: Relation[] }) {
  const { t } = useI18n();
  const { confirm, toast } = useApp();
  const [edit, setEdit] = useState<Relation | undefined>();
  const [open, setOpen] = useState(false);
  const byId = new Map(entities.map((e) => [e.id, e]));
  return (
    <Card title={t('inv.tab.relations')} actions={<Button variant="primary" size="sm" icon={<Plus className="size-3.5" />} onClick={() => { setEdit(undefined); setOpen(true); }}>{t('relation.add')}</Button>}>
      {!relations.length ? (
        <EmptyState title={t('relation.none')}>{t('relation.noneHint')}</EmptyState>
      ) : (
        <ul className="divide-y divide-bw-border text-sm">
          {relations.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 py-2">
              <span className="font-mono text-[13px]">{byId.get(r.from)?.value ?? '?'}</span>
              <span className="text-bw-gold">— {r.label || '…'} →</span>
              <span className="font-mono text-[13px]">{byId.get(r.to)?.value ?? '?'}</span>
              <VerificationBadge v={r.verification} />
              <ConfidenceBadge c={r.confidence} />
              {r.fromSuggestion && <Badge tone="gold">{t('corr.fromSuggestion')}</Badge>}
              <span className="ml-auto">
                <button type="button" aria-label={t('common.edit')} className="rounded p-1 text-bw-muted hover:text-bw-text" onClick={() => { setEdit(r); setOpen(true); }}>
                  <Pencil className="size-4" />
                </button>
                <button
                  type="button"
                  aria-label={t('common.delete')}
                  className="rounded p-1 text-bw-muted hover:text-bw-red-bright"
                  onClick={async () => {
                    if (await confirm({ title: t('relation.delete'), message: t('relation.deleteConfirm'), danger: true })) {
                      await deleteRelation(r.id);
                      toast(t('common.deleted'));
                    }
                  }}
                >
                  <Trash2 className="size-4" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <RelationModal open={open} onClose={() => setOpen(false)} investigationId={investigationId} entities={entities} relation={edit} />
    </Card>
  );
}

function NotesTab({ investigationId, notes }: { investigationId: string; notes: Note[] }) {
  const { t, locale } = useI18n();
  const { toast, confirm, reportError } = useApp();
  const [editing, setEditing] = useState<Note | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [open, setOpen] = useState(false);
  const start = (n: Note | null) => {
    setEditing(n);
    setTitle(n?.title ?? '');
    setBody(n?.body ?? '');
    setOpen(true);
  };
  return (
    <Card title={t('inv.tab.notes')} actions={<Button variant="primary" size="sm" icon={<Plus className="size-3.5" />} onClick={() => start(null)}>{t('note.add')}</Button>}>
      {!notes.length ? (
        <EmptyState title={t('note.none')} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {notes.map((n) => (
            <article key={n.id} className="rounded-md border border-bw-border bg-bw-panel2 p-3">
              <header className="mb-1 flex items-center gap-2">
                <h3 className="flex-1 truncate font-medium">{n.title || t('note.untitled')}</h3>
                <button type="button" aria-label={t('common.edit')} className="text-bw-muted hover:text-bw-text" onClick={() => start(n)}>
                  <Pencil className="size-4" />
                </button>
                <button
                  type="button"
                  aria-label={t('common.delete')}
                  className="text-bw-muted hover:text-bw-red-bright"
                  onClick={async () => {
                    if (await confirm({ title: t('note.delete'), message: t('note.deleteConfirm'), danger: true })) {
                      await deleteNote(n.id);
                      toast(t('common.deleted'));
                    }
                  }}
                >
                  <Trash2 className="size-4" />
                </button>
              </header>
              {/* Notes are rendered as plain text — never as HTML. */}
              <p className="line-clamp-6 whitespace-pre-wrap text-sm text-bw-muted">{n.body}</p>
              <p className="mt-2 text-xs text-bw-muted/70">{formatDateTime(n.updatedAt, locale)}</p>
            </article>
          ))}
        </div>
      )}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? t('note.edit') : t('note.add')}
        wide
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="primary"
              disabled={!title.trim() && !body.trim()}
              onClick={async () => {
                try {
                  await saveNote({ id: editing?.id, investigationId, title, body });
                  toast(t('common.saved'));
                  setOpen(false);
                } catch (e) {
                  reportError(e);
                }
              }}
            >
              {t('common.save')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label={t('note.title')}>{(id) => <Input id={id} value={title} maxLength={300} onChange={(e) => setTitle(e.target.value)} />}</Field>
          <Field label={t('note.body')}>{(id) => <Textarea id={id} className="min-h-64 font-mono" value={body} onChange={(e) => setBody(e.target.value)} />}</Field>
        </div>
      </Modal>
    </Card>
  );
}

function EvidenceTab({ investigationId, evidence }: { investigationId: string; evidence: Evidence[] }) {
  const { t, locale } = useI18n();
  const { toast, confirm, reportError } = useApp();
  const settings = useSettings();
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [compare, setCompare] = useState('');
  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const f of [...files].slice(0, 20)) {
        const check = await checkFile(f, settings.limits.maxFileSizeMb * 1048576);
        if (!check.ok) {
          toast(`${f.name}: ${t(check.error === 'too-large' ? 'error.fileTooLarge' : 'error.fileEmpty')}`, 'error');
          continue;
        }
        const { sha256, sha1 } = await hashFile(f);
        await addEvidence({
          investigationId,
          name: f.name.slice(0, 500),
          mime: check.sniff.mime ?? check.declared,
          size: f.size,
          sha256,
          sha1,
          notes: '',
          metadata: { declaredMime: check.declared, detected: check.sniff.label, mimeMismatch: check.mismatch, lastModified: new Date(f.lastModified).toISOString() },
          blob: f,
        });
        if (check.mismatch) toast(t('evidence.mimeMismatch', { name: f.name }), 'info');
      }
      toast(t('evidence.added'));
    } catch (e) {
      reportError(e);
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = '';
    }
  };
  const cmp = compare.trim().toLowerCase();
  return (
    <Card
      title={t('inv.tab.evidence')}
      subtitle={t('evidence.localOnly')}
      actions={
        <>
          <input ref={ref} type="file" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} aria-label={t('evidence.add')} />
          <Button variant="primary" size="sm" loading={busy} icon={<Upload className="size-3.5" />} onClick={() => ref.current?.click()}>
            {t('evidence.add')}
          </Button>
        </>
      }
    >
      <div className="mb-3 max-w-xl">
        <Input placeholder={t('evidence.compareHash')} aria-label={t('evidence.compareHash')} value={compare} onChange={(e) => setCompare(e.target.value)} className="font-mono" />
      </div>
      {!evidence.length ? (
        <EmptyState icon={<Paperclip className="size-7" />} title={t('evidence.none')} />
      ) : (
        <ul className="divide-y divide-bw-border text-sm">
          {evidence.map((ev) => {
            const match = cmp && (ev.sha256 === cmp || ev.sha1 === cmp);
            return (
              <li key={ev.id} className={`flex flex-wrap items-center gap-2 py-2 ${match ? 'bg-bw-ok/10' : ''}`}>
                <Paperclip className="size-4 text-bw-muted" />
                <span className="font-medium">{ev.name}</span>
                <Badge>{ev.mime}</Badge>
                <span className="text-xs text-bw-muted">{formatBytes(ev.size)}</span>
                {(ev.metadata as { mimeMismatch?: boolean }).mimeMismatch && <Badge tone="warn">{t('evidence.mismatchBadge')}</Badge>}
                {match && <Badge tone="ok">{t('evidence.hashMatch')}</Badge>}
                <span className="w-full break-all font-mono text-xs text-bw-muted">
                  SHA-256 {ev.sha256} <CopyButton value={ev.sha256} />
                </span>
                <span className="text-xs text-bw-muted">{formatDateTime(ev.createdAt, locale)}</span>
                <span className="ml-auto flex gap-1">
                  {ev.blob && (
                    <Button size="sm" variant="ghost" icon={<Download className="size-3.5" />} onClick={() => downloadBlob(ev.blob!, ev.name)}>
                      {t('common.download')}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="danger"
                    icon={<Trash2 className="size-3.5" />}
                    onClick={async () => {
                      if (await confirm({ title: t('evidence.delete'), message: t('evidence.deleteConfirm', { name: ev.name }), danger: true })) {
                        await deleteEvidence(ev.id);
                        toast(t('common.deleted'));
                      }
                    }}
                  >
                    {t('common.delete')}
                  </Button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function SourcesTab({ entities, relations }: { entities: Entity[]; relations: Relation[] }) {
  const { t, locale } = useI18n();
  const rows = useMemo(() => {
    const m = new Map<string, { sourceId: string; url?: string; count: number; last: string }>();
    for (const x of [...entities, ...relations]) {
      for (const s of x.sources) {
        const k = `${s.sourceId}|${s.url ?? ''}`;
        const cur = m.get(k);
        m.set(k, { sourceId: s.sourceId, url: s.url, count: (cur?.count ?? 0) + 1, last: cur && cur.last > s.collectedAt ? cur.last : s.collectedAt });
      }
    }
    return [...m.values()].sort((a, b) => b.count - a.count);
  }, [entities, relations]);
  if (!rows.length) return <EmptyState title={t('sources.noneUsed')} />;
  return (
    <Card title={t('inv.tab.sources')}>
      <ul className="divide-y divide-bw-border text-sm">
        {rows.map((r) => (
          <li key={`${r.sourceId}${r.url}`} className="flex flex-wrap items-center gap-2 py-1.5">
            <span className="font-medium">{getSource(r.sourceId)?.name ?? r.sourceId}</span>
            {r.url && <SafeLink href={r.url} className="max-w-md truncate text-xs" />}
            <Badge>{r.count}</Badge>
            <span className="ml-auto text-xs text-bw-muted">{formatDateTime(r.last, locale)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
