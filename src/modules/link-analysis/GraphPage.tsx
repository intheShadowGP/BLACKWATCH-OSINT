import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import cytoscape, { type Core, type ElementDefinition, type Layouts } from 'cytoscape';
import { Download, LayoutGrid, Link2, Pencil, Plus, Share2, Trash2, ZoomIn, ZoomOut } from 'lucide-react';
import { useI18n } from '@/i18n';
import { useApp } from '@/app/context';
import { db } from '@/services/storage/db';
import { deleteEntity, deleteRelation, getSetting, setSetting } from '@/services/storage/repository';
import { getSource } from '@/services/sources/catalog';
import { ENTITY_TYPES, VERIFICATION_LEVELS, type Entity, type EntityType, type Relation, type Verification } from '@/types';
import { downloadBlob } from '@/utils/common';
import { EntityModal, RelationModal } from '@/components/forms';
import { Badge, Button, Card, ConfidenceBadge, EmptyState, HelpBox, Input, KeyValue, PageHeader, SafeLink, Select, VerificationBadge, cx } from '@/components/ui';
import { SuggestionsPanel } from '@/components/Suggestions';

export const TYPE_COLOR: Record<EntityType, string> = {
  person: '#d9534f',
  username: '#c9a54a',
  email: '#e08e45',
  domain: '#4c7fc0',
  ip: '#5aa0a8',
  organization: '#8e6cc0',
  location: '#3f9d5b',
  image: '#b5739d',
  document: '#9b958b',
  account: '#d4b86a',
  event: '#c42f37',
  url: '#6b8fbf',
  phone: '#7fb069',
  other: '#6e6a63',
};
const TYPE_SHAPE: Partial<Record<EntityType, string>> = { person: 'ellipse', organization: 'round-rectangle', domain: 'diamond', ip: 'hexagon', location: 'triangle', event: 'star', image: 'round-tag', document: 'rectangle', account: 'round-pentagon' };
const VERIF_BORDER: Record<Verification, { style: string; color: string; width: number; opacity: number }> = {
  verified: { style: 'solid', color: '#c9a54a', width: 4, opacity: 1 },
  'public-source': { style: 'solid', color: '#7aa5dc', width: 2.5, opacity: 1 },
  correlation: { style: 'dashed', color: '#c9a54a', width: 2.5, opacity: 0.95 },
  hypothesis: { style: 'dotted', color: '#d08b2c', width: 3, opacity: 0.85 },
  unverified: { style: 'dotted', color: '#77736c', width: 2, opacity: 0.7 },
};

const LAYOUTS = ['cose', 'concentric', 'breadthfirst', 'circle', 'grid'] as const;

export default function GraphPage() {
  const { t, td } = useI18n();
  const [params] = useSearchParams();
  const { activeId, investigations, confirm, toast } = useApp();
  const [invId, setInvId] = useState<string>(params.get('inv') ?? activeId ?? '');
  useEffect(() => {
    if (!invId && activeId) setInvId(activeId);
  }, [activeId, invId]);
  const entities = useLiveQuery(() => (invId ? db.entities.where('investigationId').equals(invId).toArray() : Promise.resolve([] as Entity[])), [invId], [] as Entity[]);
  const relations = useLiveQuery(() => (invId ? db.relations.where('investigationId').equals(invId).toArray() : Promise.resolve([] as Relation[])), [invId], [] as Relation[]);

  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const layoutRef = useRef<Layouts | null>(null);
  const [selected, setSelected] = useState<{ kind: 'node' | 'edge'; id: string } | null>(null);
  const [multi, setMulti] = useState<string[]>([]);
  const [typeFilter, setTypeFilter] = useState<Set<EntityType>>(new Set(ENTITY_TYPES));
  const [verifFilter, setVerifFilter] = useState<Set<Verification>>(new Set(VERIFICATION_LEVELS));
  const [search, setSearch] = useState('');
  const [layout, setLayout] = useState<(typeof LAYOUTS)[number]>('cose');
  const [entityModal, setEntityModal] = useState<{ open: boolean; entity?: Entity }>({ open: false });
  const [relModal, setRelModal] = useState<{ open: boolean; relation?: Relation; from?: string; to?: string }>({ open: false });
  const [showSuggestions, setShowSuggestions] = useState(false);
  const positions = useRef<Record<string, { x: number; y: number }>>({});

  useEffect(() => {
    if (!invId) return;
    void getSetting<Record<string, { x: number; y: number }>>(`graphpos:${invId}`, {}).then((p) => (positions.current = p));
  }, [invId]);

  const elements = useMemo<ElementDefinition[]>(() => {
    const visible = entities.filter((e) => typeFilter.has(e.type) && verifFilter.has(e.verification));
    const ids = new Set(visible.map((e) => e.id));
    return [
      ...visible.map<ElementDefinition>((e) => ({
        group: 'nodes',
        data: { id: e.id, label: (e.label && e.type === 'person' ? e.value : e.value).slice(0, 40), type: e.type, verification: e.verification, color: TYPE_COLOR[e.type], shape: TYPE_SHAPE[e.type] ?? 'ellipse', ...vb(e.verification) },
        position: positions.current[e.id],
      })),
      ...relations
        .filter((r) => ids.has(r.from) && ids.has(r.to) && verifFilter.has(r.verification))
        .map<ElementDefinition>((r) => ({ group: 'edges', data: { id: r.id, source: r.from, target: r.to, label: r.label, verification: r.verification, lineStyle: VERIF_BORDER[r.verification].style, lineColor: r.verification === 'verified' ? '#c9a54a' : r.verification === 'public-source' ? '#7aa5dc' : r.verification === 'correlation' ? '#a68a3e' : '#5f5b55' } })),
    ];
  }, [entities, relations, typeFilter, verifFilter]);

  // Init cytoscape once.
  useEffect(() => {
    if (!containerRef.current) return;
    const cy = cytoscape({
      container: containerRef.current,
      wheelSensitivity: 0.25,
      minZoom: 0.1,
      maxZoom: 4,
      style: [
        {
          selector: 'node',
          style: {
            'background-color': 'data(color)',
            shape: 'data(shape)' as never,
            label: 'data(label)',
            color: '#ece7de',
            'font-size': 10,
            'text-valign': 'bottom',
            'text-margin-y': 5,
            'text-outline-color': '#09090a',
            'text-outline-width': 2,
            width: 30,
            height: 30,
            'border-width': 'data(bw)' as never,
            'border-color': 'data(bc)',
            'border-style': 'data(bs)' as never,
            opacity: 'data(op)' as never,
          },
        },
        { selector: 'node:selected', style: { 'overlay-color': '#c42f37', 'overlay-opacity': 0.25, 'overlay-padding': 6 } },
        { selector: 'node.match', style: { 'underlay-color': '#c9a54a', 'underlay-opacity': 0.5, 'underlay-padding': 8 } as never },
        { selector: 'node.faded, edge.faded', style: { opacity: 0.15 } },
        {
          selector: 'edge',
          style: {
            width: 1.8,
            'line-color': 'data(lineColor)',
            'line-style': 'data(lineStyle)' as never,
            'target-arrow-color': 'data(lineColor)',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            label: 'data(label)',
            'font-size': 8,
            color: '#9b958b',
            'text-rotation': 'autorotate',
            'text-background-color': '#09090a',
            'text-background-opacity': 0.8,
            'text-background-padding': '2px',
          },
        },
        { selector: 'edge:selected', style: { width: 3.5, 'line-color': '#c42f37', 'target-arrow-color': '#c42f37' } },
      ],
    });
    cyRef.current = cy;
    cy.on('tap', 'node', (e) => {
      const id = e.target.id();
      setSelected({ kind: 'node', id });
      const orig = e.originalEvent as MouseEvent | undefined;
      setMulti((m) => (orig?.shiftKey ? [...new Set([...m, id])].slice(-2) : [id]));
    });
    cy.on('tap', 'edge', (e) => setSelected({ kind: 'edge', id: e.target.id() }));
    cy.on('tap', (e) => {
      if (e.target === cy) {
        setSelected(null);
        setMulti([]);
      }
    });
    return () => {
      // Stop any running layout animation before tearing the instance down.
      layoutRef.current?.stop();
      layoutRef.current = null;
      cy.stop(true, false);
      cy.destroy();
      cyRef.current = null;
    };
  }, []);

  const savePositions = useCallback(() => {
    const cy = cyRef.current;
    if (!cy || cy.destroyed() || !invId) return;
    const p: Record<string, { x: number; y: number }> = { ...positions.current };
    cy.nodes().forEach((n) => {
      p[n.id()] = { ...n.position() };
    });
    positions.current = p;
    void setSetting(`graphpos:${invId}`, p);
  }, [invId]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.off('dragfree');
    cy.on('dragfree', 'node', savePositions);
  }, [savePositions]);

  const runLayout = useCallback(
    (name: (typeof LAYOUTS)[number], save = true) => {
      const cy = cyRef.current;
      if (!cy || cy.destroyed() || !cy.nodes().length) return;
      layoutRef.current?.stop();
      const l = cy.layout({ name, animate: false, padding: 40, nodeRepulsion: () => 9000, idealEdgeLength: () => 110 } as never);
      if (save) l.one('layoutstop', savePositions);
      layoutRef.current = l;
      l.run();
    },
    [savePositions],
  );

  // Sync elements.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const hadAllPositions = elements.filter((e) => e.group === 'nodes').every((e) => e.position);
    cy.batch(() => {
      cy.elements().remove();
      cy.add(elements);
    });
    if (!hadAllPositions) runLayout(layout);
    else cy.fit(undefined, 40);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elements]);

  // Search highlighting.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const q = search.trim().toLowerCase();
    cy.elements().removeClass('match faded');
    if (!q) return;
    const matches = cy.nodes().filter((n) => String(n.data('label')).toLowerCase().includes(q));
    cy.elements().not(matches.closedNeighborhood()).addClass('faded');
    matches.addClass('match');
    if (matches.length) cy.animate({ fit: { eles: matches, padding: 80 } } as never, { duration: 300 });
  }, [search, elements]);

  const selEntity = selected?.kind === 'node' ? entities.find((e) => e.id === selected.id) : undefined;
  const selRelation = selected?.kind === 'edge' ? relations.find((r) => r.id === selected.id) : undefined;
  const byId = new Map(entities.map((e) => [e.id, e]));
  const inv = investigations.find((i) => i.id === invId);

  const exportPng = () => {
    const cy = cyRef.current;
    if (!cy) return;
    const blob = cy.png({ output: 'blob', bg: '#09090a', full: true, scale: 2 }) as unknown as Blob;
    downloadBlob(blob, `${inv?.name ?? 'graph'}-graph.png`);
  };
  const exportJson = () => {
    downloadBlob(new Blob([JSON.stringify({ format: 'blackwatch-graph', investigation: inv?.name, nodes: entities, edges: relations, exportedAt: new Date().toISOString() }, null, 2)], { type: 'application/json' }), `${inv?.name ?? 'graph'}-graph.json`);
  };

  return (
    <div>
      <PageHeader
        icon={<Share2 className="size-5" />}
        title={t('nav.graph')}
        description={t('desc.graph')}
        actions={
          <Select value={invId} onChange={(e) => { setInvId(e.target.value); setSelected(null); }} aria-label={t('inv.select')} className="max-w-64">
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
      <HelpBox storageKey="graph">
        <p>{t('help.graph')}</p>
      </HelpBox>
      {!invId ? (
        <EmptyState icon={<Share2 className="size-8" />} title={t('graph.pickInv')} />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setEntityModal({ open: true })}>
                {t('entity.add')}
              </Button>
              <Button size="sm" icon={<Link2 className="size-3.5" />} disabled={entities.length < 2} onClick={() => setRelModal({ open: true, from: multi[0], to: multi[1] })}>
                {multi.length === 2 ? t('graph.linkSelected') : t('relation.add')}
              </Button>
              <Select value={layout} onChange={(e) => { const l = e.target.value as (typeof LAYOUTS)[number]; setLayout(l); runLayout(l); }} className="max-w-40" aria-label={t('graph.layout')}>
                {LAYOUTS.map((l) => (
                  <option key={l} value={l}>
                    {td(`graph.layout.${l}`)}
                  </option>
                ))}
              </Select>
              <Button size="sm" variant="ghost" icon={<LayoutGrid className="size-3.5" />} onClick={() => runLayout(layout)}>
                {t('graph.relayout')}
              </Button>
              <Button size="sm" variant="ghost" aria-label={t('graph.zoomIn')} icon={<ZoomIn className="size-3.5" />} onClick={() => cyRef.current?.zoom(cyRef.current.zoom() * 1.25)} />
              <Button size="sm" variant="ghost" aria-label={t('graph.zoomOut')} icon={<ZoomOut className="size-3.5" />} onClick={() => cyRef.current?.zoom(cyRef.current.zoom() / 1.25)} />
              <Button size="sm" variant="ghost" onClick={() => cyRef.current?.fit(undefined, 40)}>
                {t('geo.fit')}
              </Button>
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('common.search')} aria-label={t('common.search')} className="max-w-48 py-1.5" />
              <span className="ml-auto flex gap-1">
                <Button size="sm" icon={<Download className="size-3.5" />} onClick={exportPng} disabled={!entities.length}>
                  PNG
                </Button>
                <Button size="sm" icon={<Download className="size-3.5" />} onClick={exportJson} disabled={!entities.length}>
                  JSON
                </Button>
              </span>
            </div>
            <div className="relative">
              <div ref={containerRef} className="h-[64vh] min-h-96 w-full rounded-lg border border-bw-border bg-[#0b0b0d]" aria-label={t('nav.graph')} role="img" />
              {!entities.length && <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-bw-muted">{t('graph.empty')}</div>}
            </div>
            <p className="text-xs text-bw-muted">{t('graph.tips')}</p>
          </div>
          <div className="space-y-4">
            {selEntity && (
              <Card
                title={selEntity.value}
                actions={
                  <>
                    <button type="button" aria-label={t('common.edit')} className="text-bw-muted hover:text-bw-text" onClick={() => setEntityModal({ open: true, entity: selEntity })}>
                      <Pencil className="size-4" />
                    </button>
                    <button
                      type="button"
                      aria-label={t('common.delete')}
                      className="text-bw-muted hover:text-bw-red-bright"
                      onClick={async () => {
                        if (await confirm({ title: t('entity.delete'), message: t('entity.deleteConfirm', { value: selEntity.value }), danger: true })) {
                          await deleteEntity(selEntity.id);
                          setSelected(null);
                          toast(t('common.deleted'));
                        }
                      }}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </>
                }
              >
                <div className="mb-2 flex flex-wrap gap-1">
                  <Badge>{td(`etype.${selEntity.type}`)}</Badge>
                  <VerificationBadge v={selEntity.verification} />
                  <ConfidenceBadge c={selEntity.confidence} />
                </div>
                {selEntity.label && <p className="mb-2 text-sm text-bw-muted">{selEntity.label}</p>}
                {selEntity.notes && <p className="mb-2 whitespace-pre-wrap text-sm">{selEntity.notes}</p>}
                <h4 className="mb-1 text-xs uppercase tracking-wider text-bw-muted">{t('inv.tab.sources')}</h4>
                <ul className="space-y-1 text-xs">
                  {selEntity.sources.map((s, i) => (
                    <li key={i}>
                      {getSource(s.sourceId)?.name ?? s.sourceName ?? s.sourceId} {s.url && <SafeLink href={s.url} className="max-w-full truncate">{t('common.link')}</SafeLink>} <span className="text-bw-muted">{s.collectedAt.slice(0, 16).replace('T', ' ')}</span>
                    </li>
                  ))}
                  {!selEntity.sources.length && <li className="text-bw-muted">—</li>}
                </ul>
                <h4 className="mb-1 mt-3 text-xs uppercase tracking-wider text-bw-muted">{t('inv.tab.relations')}</h4>
                <ul className="space-y-1 text-xs">
                  {relations
                    .filter((r) => r.from === selEntity.id || r.to === selEntity.id)
                    .map((r) => (
                      <li key={r.id}>
                        {r.from === selEntity.id ? '→' : '←'} <span className="text-bw-gold">{r.label || '…'}</span> {byId.get(r.from === selEntity.id ? r.to : r.from)?.value}
                      </li>
                    ))}
                </ul>
              </Card>
            )}
            {selRelation && (
              <Card
                title={t('relation.title')}
                actions={
                  <>
                    <button type="button" aria-label={t('common.edit')} className="text-bw-muted hover:text-bw-text" onClick={() => setRelModal({ open: true, relation: selRelation })}>
                      <Pencil className="size-4" />
                    </button>
                    <button
                      type="button"
                      aria-label={t('common.delete')}
                      className="text-bw-muted hover:text-bw-red-bright"
                      onClick={async () => {
                        if (await confirm({ title: t('relation.delete'), message: t('relation.deleteConfirm'), danger: true })) {
                          await deleteRelation(selRelation.id);
                          setSelected(null);
                        }
                      }}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </>
                }
              >
                <KeyValue
                  rows={[
                    [t('relation.from'), byId.get(selRelation.from)?.value],
                    [t('relation.label'), selRelation.label || '—'],
                    [t('relation.to'), byId.get(selRelation.to)?.value],
                    [t('common.verification'), <VerificationBadge v={selRelation.verification} />],
                    [t('common.confidence'), <ConfidenceBadge c={selRelation.confidence} />],
                    [t('common.notes'), selRelation.notes || '—'],
                  ]}
                />
              </Card>
            )}
            <Card title={t('graph.filters')}>
              <div className="space-y-3">
                <div>
                  <h4 className="mb-1 text-xs uppercase tracking-wider text-bw-muted">{t('entity.type')}</h4>
                  <div className="flex flex-wrap gap-1">
                    {ENTITY_TYPES.map((x) => (
                      <button
                        key={x}
                        type="button"
                        aria-pressed={typeFilter.has(x)}
                        onClick={() => {
                          const n = new Set(typeFilter);
                          if (n.has(x)) n.delete(x);
                          else n.add(x);
                          setTypeFilter(n);
                        }}
                        className={cx('flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px]', typeFilter.has(x) ? 'border-bw-border text-bw-text' : 'border-transparent text-bw-muted/50 line-through')}
                      >
                        <span className="size-2 rounded-full" style={{ background: TYPE_COLOR[x] }} />
                        {td(`etype.${x}`)}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <h4 className="mb-1 text-xs uppercase tracking-wider text-bw-muted">{t('common.verification')}</h4>
                  <div className="flex flex-wrap gap-1">
                    {VERIFICATION_LEVELS.map((v) => (
                      <button
                        key={v}
                        type="button"
                        aria-pressed={verifFilter.has(v)}
                        onClick={() => {
                          const n = new Set(verifFilter);
                          if (n.has(v)) n.delete(v);
                          else n.add(v);
                          setVerifFilter(n);
                        }}
                        className={cx('rounded border px-1.5 py-0.5 text-[11px]', verifFilter.has(v) ? 'text-bw-text' : 'text-bw-muted/50 line-through')}
                        style={{ borderColor: VERIF_BORDER[v].color, borderStyle: VERIF_BORDER[v].style as 'solid' }}
                      >
                        {td(`verif.${v}`)}
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-[11px] text-bw-muted">{t('graph.legend')}</p>
                </div>
              </div>
            </Card>
            <Card title={t('inv.tab.suggestions')} actions={<Button size="sm" variant="ghost" onClick={() => setShowSuggestions((s) => !s)}>{showSuggestions ? t('common.hide') : t('common.show')}</Button>}>
              {showSuggestions ? <SuggestionsPanel investigationId={invId} /> : <p className="text-xs text-bw-muted">{t('graph.suggestionsHint')}</p>}
            </Card>
            <p className="text-xs text-bw-muted">
              <Link to={`/investigations/${invId}`} className="text-bw-gold hover:underline">
                {t('graph.history')}
              </Link>
            </p>
          </div>
        </div>
      )}
      {invId && <EntityModal open={entityModal.open} onClose={() => setEntityModal({ open: false })} investigationId={invId} entity={entityModal.entity} />}
      {invId && <RelationModal open={relModal.open} onClose={() => setRelModal({ open: false })} investigationId={invId} entities={entities} relation={relModal.relation} presetFrom={relModal.from} presetTo={relModal.to} />}
    </div>
  );
}

function vb(v: Verification) {
  const b = VERIF_BORDER[v];
  return { bw: b.width, bc: b.color, bs: b.style, op: b.opacity };
}
