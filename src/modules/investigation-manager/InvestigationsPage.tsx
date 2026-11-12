import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Archive, Download, FolderKanban, Plus, Trash2, Upload } from 'lucide-react';
import { useI18n } from '@/i18n';
import { useApp } from '@/app/context';
import { db } from '@/services/storage/db';
import { createInvestigation, deleteInvestigation, updateInvestigation } from '@/services/storage/repository';
import { INVESTIGATION_STATUSES, type InvestigationStatus } from '@/types';
import { formatDateTime } from '@/utils/common';
import { Badge, Button, Card, EmptyState, Field, HelpBox, Input, Modal, PageHeader, Select, Textarea } from '@/components/ui';
import { exportBackupFile, ImportBackupModal } from './backupUi';

export default function InvestigationsPage() {
  const { t, td, locale } = useI18n();
  const { setActiveId, activeId, toast, reportError, confirm } = useApp();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(params.get('new') === '1');
  const [importing, setImporting] = useState(false);
  const [filter, setFilter] = useState<'active' | 'all' | InvestigationStatus>('active');
  const [q, setQ] = useState('');

  const invs = useLiveQuery(() => db.investigations.orderBy('updatedAt').reverse().toArray(), []);
  const counts = useLiveQuery(async () => {
    const m = new Map<string, number>();
    await db.entities.each((e) => m.set(e.investigationId, (m.get(e.investigationId) ?? 0) + 1));
    return m;
  }, []);

  const list = useMemo(
    () =>
      (invs ?? []).filter((i) => {
        if (filter === 'active' && i.status === 'archived') return false;
        if (filter !== 'active' && filter !== 'all' && i.status !== filter) return false;
        const f = q.trim().toLowerCase();
        return !f || `${i.name} ${i.description} ${i.tags.join(' ')}`.toLowerCase().includes(f);
      }),
    [invs, filter, q],
  );

  return (
    <div>
      <PageHeader
        icon={<FolderKanban className="size-5" />}
        title={t('nav.investigations')}
        description={t('desc.investigations')}
        actions={
          <>
            <Button icon={<Upload className="size-4" />} onClick={() => setImporting(true)}>
              {t('backup.import')}
            </Button>
            <Button icon={<Download className="size-4" />} onClick={() => exportBackupFile({}, t).catch(reportError)} disabled={!invs?.length}>
              {t('backup.exportAll')}
            </Button>
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
              {t('inv.new')}
            </Button>
          </>
        }
      />
      <HelpBox storageKey="investigations">
        <p>{t('help.investigations')}</p>
      </HelpBox>

      <div className="mb-3 flex flex-wrap gap-2">
        <Input className="max-w-xs" placeholder={t('common.search')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('common.search')} />
        <Select className="max-w-52" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} aria-label={t('common.status')}>
          <option value="active">{t('inv.filterActive')}</option>
          <option value="all">{t('common.all')}</option>
          {INVESTIGATION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {td(`invStatus.${s}`)}
            </option>
          ))}
        </Select>
      </div>

      {!list.length ? (
        <EmptyState icon={<FolderKanban className="size-8" />} title={t('inv.empty')}>
          {t('inv.emptyHint')}
        </EmptyState>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.map((i) => (
            <Card
              key={i.id}
              className={i.id === activeId ? 'border-bw-gold/50' : undefined}
              title={
                <Link to={`/investigations/${i.id}`} className="hover:underline">
                  {i.name}
                </Link>
              }
              actions={
                <>
                  {i.isDemo && <Badge tone="warn">DEMO</Badge>}
                  <Badge tone={i.status === 'closed' || i.status === 'archived' ? 'neutral' : 'gold'}>{td(`invStatus.${i.status}`)}</Badge>
                </>
              }
            >
              <p className="line-clamp-3 min-h-10 text-sm text-bw-muted">{i.description || '—'}</p>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-bw-muted">
                <span>
                  {t('inv.entities')}: <b className="text-bw-text">{counts?.get(i.id) ?? 0}</b>
                </span>
                <span>
                  {t('inv.updated')}: {formatDateTime(i.updatedAt, locale)}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant={i.id === activeId ? 'gold' : 'secondary'} onClick={() => setActiveId(i.id === activeId ? null : i.id)}>
                  {i.id === activeId ? t('inv.isActive') : t('inv.setActive')}
                </Button>
                <Button size="sm" variant="ghost" icon={<Download className="size-3.5" />} onClick={() => exportBackupFile({ ids: [i.id] }, t).catch(reportError)}>
                  {t('common.export')}
                </Button>
                {i.status !== 'archived' ? (
                  <Button size="sm" variant="ghost" icon={<Archive className="size-3.5" />} onClick={() => updateInvestigation(i.id, { status: 'archived' }).then(() => toast(t('inv.archived')))}>
                    {t('inv.archive')}
                  </Button>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => updateInvestigation(i.id, { status: 'open' })}>
                    {t('inv.unarchive')}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="danger"
                  icon={<Trash2 className="size-3.5" />}
                  onClick={async () => {
                    if (await confirm({ title: t('inv.delete'), message: t('inv.deleteConfirm', { name: i.name }), danger: true, confirmLabel: t('common.delete') })) {
                      await deleteInvestigation(i.id);
                      toast(t('inv.deleted'));
                    }
                  }}
                >
                  {t('common.delete')}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <NewInvestigationModal
        open={creating}
        onClose={() => {
          setCreating(false);
          if (params.get('new')) setParams({});
        }}
        onCreated={(id) => {
          setActiveId(id);
          navigate(`/investigations/${id}`);
        }}
      />
      <ImportBackupModal open={importing} onClose={() => setImporting(false)} />
    </div>
  );
}

function NewInvestigationModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const { t } = useI18n();
  const { toast, reportError } = useApp();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [objective, setObjective] = useState('');
  const [tags, setTags] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const ref = useRef(false);
  useEffect(() => {
    if (open) {
      setName('');
      setDescription('');
      setObjective('');
      setTags('');
      setErr(null);
      ref.current = false;
    }
  }, [open]);
  const submit = async () => {
    if (!name.trim()) return setErr(t('error.required'));
    if (ref.current) return;
    ref.current = true;
    try {
      const inv = await createInvestigation({
        name,
        description,
        objective,
        tags: tags
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean)
          .slice(0, 50),
      });
      toast(t('inv.created'));
      onClose();
      onCreated(inv.id);
    } catch (e) {
      ref.current = false;
      reportError(e);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('inv.new')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={submit}>
            {t('common.create')}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label={t('inv.name')} error={err}>
          {(id) => <Input id={id} value={name} maxLength={200} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />}
        </Field>
        <Field label={t('inv.description')}>{(id) => <Textarea id={id} value={description} onChange={(e) => setDescription(e.target.value)} />}</Field>
        <Field label={t('inv.objective')} hint={t('inv.objectiveHint')}>
          {(id) => <Textarea id={id} value={objective} onChange={(e) => setObjective(e.target.value)} />}
        </Field>
        <Field label={t('inv.tags')} hint={t('inv.tagsHint')}>
          {(id) => <Input id={id} value={tags} onChange={(e) => setTags(e.target.value)} />}
        </Field>
      </div>
    </Modal>
  );
}
