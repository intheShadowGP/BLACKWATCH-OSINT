import { db } from '@/services/storage/db';
import { getSource } from '@/services/sources/catalog';
import type { Entity, Evidence, Investigation, Note, Provenance, Relation, Result, TimelineEvent } from '@/types';
import { nowIso } from '@/utils/common';
import { csvCell, escapeHtml, mdEscape, mdLink } from './format';

export type ReportFormat = 'pdf' | 'html' | 'json' | 'csv' | 'md';
export type Lang = 'fr' | 'en';

export interface ReportOptions {
  summary: string;
  methodology: string;
  limitations: string;
  overallConfidence: 'high' | 'medium' | 'low' | 'unknown';
  include: {
    entities: boolean;
    relations: boolean;
    timeline: boolean;
    results: boolean;
    evidence: boolean;
    notes: boolean;
    sources: boolean;
  };
  /** Exclude items still marked as hypothesis / unverified. */
  onlyCorroborated: boolean;
  lang: Lang;
}

export interface ReportData {
  investigation: Investigation;
  entities: Entity[];
  relations: Relation[];
  events: TimelineEvent[];
  notes: Note[];
  evidence: Omit<Evidence, 'blob'>[];
  results: Result[];
  sources: Array<{ id: string; name: string; url?: string; count: number }>;
  generatedAt: string;
  options: ReportOptions;
}

const T = {
  fr: {
    report: 'Rapport d’investigation',
    id: 'Identifiant',
    generated: 'Généré le',
    status: 'Statut',
    summary: 'Résumé',
    objective: 'Objectifs',
    methodology: 'Méthodologie',
    sources: 'Sources consultées',
    entities: 'Entités',
    relations: 'Relations',
    timeline: 'Chronologie',
    results: 'Résultats collectés',
    evidence: 'Preuves',
    notes: 'Notes',
    limitations: 'Limites',
    confidence: 'Niveau de confiance global',
    type: 'Type',
    value: 'Valeur',
    verification: 'Vérification',
    conf: 'Confiance',
    provenance: 'Provenance',
    date: 'Date',
    kind: 'Nature',
    tz: 'Fuseau',
    from: 'De',
    to: 'Vers',
    label: 'Libellé',
    name: 'Nom',
    size: 'Taille',
    hash: 'SHA-256',
    count: 'Éléments',
    demo: 'DONNÉES FICTIVES — investigation de démonstration',
    disclaimer:
      'Ce rapport reflète des informations issues de sources ouvertes à la date de collecte indiquée. Une corrélation ou une hypothèse n’est pas une preuve. Les niveaux de vérification sont attribués par l’analyste.',
    none: 'Aucun élément.',
  },
  en: {
    report: 'Investigation report',
    id: 'Identifier',
    generated: 'Generated on',
    status: 'Status',
    summary: 'Summary',
    objective: 'Objectives',
    methodology: 'Methodology',
    sources: 'Sources consulted',
    entities: 'Entities',
    relations: 'Relations',
    timeline: 'Timeline',
    results: 'Collected results',
    evidence: 'Evidence',
    notes: 'Notes',
    limitations: 'Limitations',
    confidence: 'Overall confidence level',
    type: 'Type',
    value: 'Value',
    verification: 'Verification',
    conf: 'Confidence',
    provenance: 'Provenance',
    date: 'Date',
    kind: 'Kind',
    tz: 'Time zone',
    from: 'From',
    to: 'To',
    label: 'Label',
    name: 'Name',
    size: 'Size',
    hash: 'SHA-256',
    count: 'Items',
    demo: 'FICTITIOUS DATA — demonstration investigation',
    disclaimer:
      'This report reflects open-source information as of the stated collection dates. A correlation or hypothesis is not proof. Verification levels are assigned by the analyst.',
    none: 'No items.',
  },
} as const;

export function reportStrings(lang: Lang) {
  return T[lang];
}

export async function collectReportData(investigationId: string, options: ReportOptions): Promise<ReportData> {
  const investigation = await db.investigations.get(investigationId);
  if (!investigation) throw new Error('investigation-not-found');
  const w = (t: { where(k: string): { equals(v: string): unknown } }) => t.where('investigationId').equals(investigationId) as { toArray(): Promise<never[]> };
  let entities: Entity[] = await w(db.entities).toArray();
  let relations: Relation[] = await w(db.relations).toArray();
  let events: TimelineEvent[] = await w(db.events).toArray();
  const notes: Note[] = await w(db.notes).toArray();
  const results: Result[] = await w(db.results).toArray();
  const evidence: Evidence[] = await w(db.evidence).toArray();
  if (options.onlyCorroborated) {
    const keep = (v: string) => v === 'verified' || v === 'public-source';
    entities = entities.filter((e) => keep(e.verification));
    const ids = new Set(entities.map((e) => e.id));
    relations = relations.filter((r) => keep(r.verification) && ids.has(r.from) && ids.has(r.to));
    events = events.filter((e) => keep(e.verification));
  }
  events.sort((a, b) => a.datetime.localeCompare(b.datetime));
  const counts = new Map<string, number>();
  const bump = (p: Provenance) => counts.set(p.sourceId, (counts.get(p.sourceId) ?? 0) + 1);
  for (const x of [...entities, ...relations, ...events]) x.sources.forEach(bump);
  for (const r of results) counts.set(r.sourceId, (counts.get(r.sourceId) ?? 0) + 1);
  const sources = [...counts.entries()].map(([id, count]) => {
    const s = getSource(id);
    return { id, name: s?.name ?? id, url: s?.homepage, count };
  });
  return {
    investigation,
    entities,
    relations,
    events,
    notes,
    results,
    evidence: (evidence as Evidence[]).map(({ blob: _b, ...e }) => e),
    sources,
    generatedAt: nowIso(),
    options,
  };
}

function provText(sources: Provenance[]): string {
  return sources.map((s) => `${getSource(s.sourceId)?.name ?? s.sourceId}${s.url ? ` <${s.url}>` : ''} @ ${s.collectedAt.slice(0, 19).replace('T', ' ')}Z`).join('; ');
}

/* ------------------------------- Markdown ------------------------------- */

export function renderMarkdown(d: ReportData): string {
  const t = T[d.options.lang];
  const o = d.options;
  const name = (id: string) => d.entities.find((e) => e.id === id)?.value ?? id;
  const L: string[] = [];
  L.push(`# ${t.report} — ${mdEscape(d.investigation.name)}`, '');
  if (d.investigation.isDemo) L.push(`> **${t.demo}**`, '');
  L.push(`- **${t.id}**: \`${d.investigation.id}\``, `- **${t.generated}**: ${d.generatedAt}`, `- **${t.status}**: ${d.investigation.status}`, `- **${t.confidence}**: ${o.overallConfidence}`, '');
  L.push(`## ${t.summary}`, '', o.summary || d.investigation.description || '—', '');
  L.push(`## ${t.objective}`, '', d.investigation.objective || '—', '');
  L.push(`## ${t.methodology}`, '', o.methodology || '—', '');
  if (o.include.sources) {
    L.push(`## ${t.sources}`, '');
    if (!d.sources.length) L.push(t.none);
    for (const s of d.sources) L.push(`- ${mdLink(s.name, s.url)} — ${s.count} ${t.count.toLowerCase()}`);
    L.push('');
  }
  if (o.include.entities) {
    L.push(`## ${t.entities}`, '');
    if (!d.entities.length) L.push(t.none);
    else {
      L.push(`| ${t.type} | ${t.value} | ${t.verification} | ${t.conf} | ${t.provenance} |`, '|---|---|---|---|---|');
      for (const e of d.entities) L.push(`| ${e.type} | ${mdEscape(e.value)}${e.label ? ` (${mdEscape(e.label)})` : ''} | ${e.verification} | ${e.confidence} | ${mdEscape(provText(e.sources)) || '—'} |`);
    }
    L.push('');
  }
  if (o.include.relations) {
    L.push(`## ${t.relations}`, '');
    if (!d.relations.length) L.push(t.none);
    else {
      L.push(`| ${t.from} | ${t.label} | ${t.to} | ${t.verification} | ${t.conf} |`, '|---|---|---|---|---|');
      for (const r of d.relations) L.push(`| ${mdEscape(name(r.from))} | ${mdEscape(r.label || '—')} | ${mdEscape(name(r.to))} | ${r.verification} | ${r.confidence} |`);
    }
    L.push('');
  }
  if (o.include.timeline) {
    L.push(`## ${t.timeline}`, '');
    if (!d.events.length) L.push(t.none);
    else {
      L.push(`| ${t.date} (UTC) | ${t.tz} | ${t.kind} | ${t.label} | ${t.verification} |`, '|---|---|---|---|---|');
      for (const e of d.events) L.push(`| ${e.datetime} | ${mdEscape(e.timezone)} | ${e.dateKind} | ${mdEscape(e.title)} | ${e.verification} |`);
    }
    L.push('');
  }
  if (o.include.results) {
    L.push(`## ${t.results}`, '');
    if (!d.results.length) L.push(t.none);
    else {
      L.push(`| ${t.kind} | ${t.value} | Source | ${t.date} |`, '|---|---|---|---|');
      for (const r of d.results) L.push(`| ${mdEscape(r.kind)} | ${mdLink(r.value, r.url)} | ${mdEscape(getSource(r.sourceId)?.name ?? r.sourceId)} | ${r.collectedAt} |`);
    }
    L.push('');
  }
  if (o.include.evidence) {
    L.push(`## ${t.evidence}`, '');
    if (!d.evidence.length) L.push(t.none);
    for (const e of d.evidence) L.push(`- ${mdEscape(e.name)} — ${e.mime}, ${e.size} B — SHA-256 \`${e.sha256}\``);
    L.push('');
  }
  if (o.include.notes) {
    L.push(`## ${t.notes}`, '');
    if (!d.notes.length) L.push(t.none);
    for (const n of d.notes) L.push(`### ${mdEscape(n.title || '—')}`, '', n.body.replace(/</g, '&lt;'), '');
  }
  L.push(`## ${t.limitations}`, '', o.limitations || '—', '', `---`, '', `_${t.disclaimer}_`, '');
  return L.join('\n');
}

/* --------------------------------- HTML --------------------------------- */

export function renderHtml(d: ReportData): string {
  const t = T[d.options.lang];
  const o = d.options;
  const e = escapeHtml;
  const name = (id: string) => d.entities.find((x) => x.id === id)?.value ?? id;
  const link = (text: string, url?: string) => (url && /^https?:\/\//i.test(url) ? `<a href="${e(url)}" rel="noopener noreferrer">${e(text)}</a>` : e(text));
  const table = (head: string[], rows: string[][]) =>
    rows.length ? `<table><thead><tr>${head.map((h) => `<th>${e(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>` : `<p class="none">${e(t.none)}</p>`;
  const para = (s: string) => `<p>${e(s || '—').replace(/\n/g, '<br>')}</p>`;
  const parts: string[] = [];
  parts.push(`<h1>${e(t.report)}<br><small>${e(d.investigation.name)}</small></h1>`);
  if (d.investigation.isDemo) parts.push(`<p class="demo">${e(t.demo)}</p>`);
  parts.push(`<dl><dt>${e(t.id)}</dt><dd><code>${e(d.investigation.id)}</code></dd><dt>${e(t.generated)}</dt><dd>${e(d.generatedAt)}</dd><dt>${e(t.status)}</dt><dd>${e(d.investigation.status)}</dd><dt>${e(t.confidence)}</dt><dd>${e(o.overallConfidence)}</dd></dl>`);
  parts.push(`<h2>${e(t.summary)}</h2>${para(o.summary || d.investigation.description)}`);
  parts.push(`<h2>${e(t.objective)}</h2>${para(d.investigation.objective)}`);
  parts.push(`<h2>${e(t.methodology)}</h2>${para(o.methodology)}`);
  if (o.include.sources) parts.push(`<h2>${e(t.sources)}</h2>${table([t.name, t.count], d.sources.map((s) => [link(s.name, s.url), String(s.count)]))}`);
  if (o.include.entities)
    parts.push(`<h2>${e(t.entities)}</h2>${table([t.type, t.value, t.verification, t.conf, t.provenance], d.entities.map((x) => [e(x.type), e(x.value) + (x.label ? ` <em>(${e(x.label)})</em>` : ''), `<span class="v-${e(x.verification)}">${e(x.verification)}</span>`, e(x.confidence), x.sources.map((s) => link(getSource(s.sourceId)?.name ?? s.sourceId, s.url) + ` <small>${e(s.collectedAt.slice(0, 16))}</small>`).join('<br>') || '—']))}`);
  if (o.include.relations) parts.push(`<h2>${e(t.relations)}</h2>${table([t.from, t.label, t.to, t.verification, t.conf], d.relations.map((r) => [e(name(r.from)), e(r.label || '—'), e(name(r.to)), `<span class="v-${e(r.verification)}">${e(r.verification)}</span>`, e(r.confidence)]))}`);
  if (o.include.timeline) parts.push(`<h2>${e(t.timeline)}</h2>${table([`${t.date} (UTC)`, t.tz, t.kind, t.label, t.verification], d.events.map((x) => [e(x.datetime), e(x.timezone), e(x.dateKind), e(x.title), e(x.verification)]))}`);
  if (o.include.results) parts.push(`<h2>${e(t.results)}</h2>${table([t.kind, t.value, 'Source', t.date], d.results.map((r) => [e(r.kind), link(r.value, r.url), e(getSource(r.sourceId)?.name ?? r.sourceId), e(r.collectedAt)]))}`);
  if (o.include.evidence) parts.push(`<h2>${e(t.evidence)}</h2>${table([t.name, 'MIME', t.size, t.hash], d.evidence.map((x) => [e(x.name), e(x.mime), e(x.size), `<code>${e(x.sha256)}</code>`]))}`);
  if (o.include.notes) parts.push(`<h2>${e(t.notes)}</h2>${d.notes.length ? d.notes.map((n) => `<h3>${e(n.title || '—')}</h3>${para(n.body)}`).join('') : `<p class="none">${e(t.none)}</p>`}`);
  parts.push(`<h2>${e(t.limitations)}</h2>${para(o.limitations)}<hr><p class="disclaimer">${e(t.disclaimer)}</p>`);
  return `<!doctype html>
<html lang="${d.options.lang}"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(t.report)} — ${e(d.investigation.name)}</title>
<style>
body{font:14px/1.55 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:1000px;margin:2rem auto;padding:0 1rem;color:#1a1a1a;background:#fff}
h1{border-bottom:3px solid #7a1018;padding-bottom:.4rem}h1 small{font-size:.6em;color:#555}
h2{color:#7a1018;margin-top:2rem;border-bottom:1px solid #ddd}
table{border-collapse:collapse;width:100%;font-size:12.5px}th,td{border:1px solid #ddd;padding:4px 6px;text-align:left;vertical-align:top;word-break:break-word}
th{background:#f3eee6}dl{display:grid;grid-template-columns:max-content 1fr;gap:.2rem 1rem}dt{font-weight:600}
.demo{background:#fff4d6;border:1px solid #c9a227;padding:.5rem;font-weight:700}.none{color:#777}.disclaimer{color:#555;font-style:italic}
.v-verified{color:#0a6b2a;font-weight:600}.v-hypothesis,.v-unverified{color:#9a4b00}.v-correlation{color:#1d4f91}
@media print{body{margin:0}a{color:inherit}}
</style></head><body>${parts.join('\n')}</body></html>`;
}

/* --------------------------------- JSON / CSV --------------------------------- */

export function renderJson(d: ReportData): string {
  return JSON.stringify({ format: 'blackwatch-osint-report', version: 1, ...d }, null, 2);
}

export function renderCsv(d: ReportData): string {
  const name = (id: string) => d.entities.find((x) => x.id === id)?.value ?? id;
  const head = ['section', 'id', 'type', 'value', 'label', 'verification', 'confidence', 'date', 'sources'];
  const rows: unknown[][] = [];
  for (const e of d.entities) rows.push(['entity', e.id, e.type, e.value, e.label, e.verification, e.confidence, e.createdAt, provText(e.sources)]);
  for (const r of d.relations) rows.push(['relation', r.id, 'relation', `${name(r.from)} -> ${name(r.to)}`, r.label, r.verification, r.confidence, r.createdAt, provText(r.sources)]);
  for (const e of d.events) rows.push(['event', e.id, e.dateKind, e.title, e.timezone, e.verification, e.confidence, e.datetime, provText(e.sources)]);
  for (const r of d.results) rows.push(['result', r.id, r.kind, r.value, r.url ?? '', r.verification, r.confidence, r.collectedAt, getSource(r.sourceId)?.name ?? r.sourceId]);
  for (const e of d.evidence) rows.push(['evidence', e.id, e.mime, e.name, e.sha256, '', '', e.createdAt, 'local']);
  return '﻿' + [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
}

/* ---------------------------------- PDF ---------------------------------- */

export async function renderPdf(d: ReportData): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const t = T[d.options.lang];
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 48;
  let y = M;
  // jsPDF's standard fonts are WinAnsi: replace characters they cannot encode.
  const clean = (s: string) => s.replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/[—–]/g, '-').replace(/…/g, '...').replace(/[^\u0000-ÿ]/g, '?');
  const ensure = (h: number) => {
    if (y + h > H - M) {
      doc.addPage();
      y = M;
    }
  };
  const text = (s: string, size = 10, style: 'normal' | 'bold' | 'italic' = 'normal', color: [number, number, number] = [20, 20, 20]) => {
    doc.setFont('helvetica', style);
    doc.setFontSize(size);
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(clean(s), W - 2 * M) as string[];
    for (const line of lines) {
      ensure(size * 1.35);
      doc.text(line, M, y);
      y += size * 1.35;
    }
  };
  const h2 = (s: string) => {
    y += 8;
    ensure(30);
    text(s, 14, 'bold', [122, 16, 24]);
    doc.setDrawColor(200, 200, 200);
    doc.line(M, y - 8, W - M, y - 8);
    y += 4;
  };
  text(t.report, 20, 'bold', [122, 16, 24]);
  text(d.investigation.name, 14, 'bold');
  if (d.investigation.isDemo) text(t.demo, 11, 'bold', [160, 110, 0]);
  text(`${t.id}: ${d.investigation.id}`, 9);
  text(`${t.generated}: ${d.generatedAt}   |   ${t.status}: ${d.investigation.status}   |   ${t.confidence}: ${d.options.overallConfidence}`, 9);
  const o = d.options;
  h2(t.summary);
  text(o.summary || d.investigation.description || '-');
  h2(t.objective);
  text(d.investigation.objective || '-');
  h2(t.methodology);
  text(o.methodology || '-');
  const name = (id: string) => d.entities.find((x) => x.id === id)?.value ?? id;
  const list = (title: string, items: string[]) => {
    h2(title);
    if (!items.length) text(t.none, 10, 'italic', [110, 110, 110]);
    for (const it of items) text(`- ${it}`, 9);
  };
  if (o.include.sources) list(t.sources, d.sources.map((s) => `${s.name} (${s.count})${s.url ? ` - ${s.url}` : ''}`));
  if (o.include.entities) list(t.entities, d.entities.map((e) => `[${e.type}] ${e.value}${e.label ? ` (${e.label})` : ''} - ${e.verification}/${e.confidence}${e.sources.length ? ` - ${provText(e.sources)}` : ''}`));
  if (o.include.relations) list(t.relations, d.relations.map((r) => `${name(r.from)} -[${r.label || '...'}]-> ${name(r.to)} - ${r.verification}/${r.confidence}`));
  if (o.include.timeline) list(t.timeline, d.events.map((e) => `${e.datetime} (${e.timezone}, ${e.dateKind}) ${e.title} - ${e.verification}`));
  if (o.include.results) list(t.results, d.results.map((r) => `${r.kind}: ${r.value} - ${getSource(r.sourceId)?.name ?? r.sourceId} @ ${r.collectedAt}`));
  if (o.include.evidence) list(t.evidence, d.evidence.map((e) => `${e.name} (${e.mime}, ${e.size} B) SHA-256 ${e.sha256}`));
  if (o.include.notes) {
    h2(t.notes);
    if (!d.notes.length) text(t.none, 10, 'italic', [110, 110, 110]);
    for (const n of d.notes) {
      text(n.title || '-', 11, 'bold');
      text(n.body, 9);
    }
  }
  h2(t.limitations);
  text(o.limitations || '-');
  y += 10;
  text(t.disclaimer, 8, 'italic', [90, 90, 90]);
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(clean(`BLACKWATCH OSINT - ${d.investigation.name} - ${i}/${pages}`), M, H - 24);
  }
  return doc.output('blob');
}
