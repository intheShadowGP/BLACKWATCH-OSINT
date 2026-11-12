import { db, guarded, INVESTIGATION_TABLES } from './db';
import type {
  Confidence,
  Entity,
  EntityType,
  Evidence,
  Investigation,
  InvestigationStatus,
  Note,
  Provenance,
  Relation,
  TimelineEvent,
  Verification,
} from '@/types';
import { nowIso, uid } from '@/utils/common';
import { normalizeValue } from '@/utils/validation';

/* ------------------------------------------------------------------ */
/* Activity / history                                                  */
/* ------------------------------------------------------------------ */

export async function logActivity(action: string, detail = '', investigationId?: string): Promise<void> {
  await db.activity.add({ id: uid(), at: nowIso(), action, detail: detail.slice(0, 2000), investigationId });
}

async function touch(investigationId: string): Promise<void> {
  await db.investigations.update(investigationId, { updatedAt: nowIso() });
}

/* ------------------------------------------------------------------ */
/* Investigations                                                      */
/* ------------------------------------------------------------------ */

export interface NewInvestigation {
  name: string;
  description?: string;
  objective?: string;
  status?: InvestigationStatus;
  tags?: string[];
  isDemo?: boolean;
}

export async function createInvestigation(input: NewInvestigation): Promise<Investigation> {
  const name = input.name.trim();
  if (!name) throw new Error('name-required');
  const now = nowIso();
  const inv: Investigation = {
    id: uid(),
    name: name.slice(0, 200),
    description: (input.description ?? '').slice(0, 10000),
    objective: (input.objective ?? '').slice(0, 10000),
    status: input.status ?? 'open',
    createdAt: now,
    updatedAt: now,
    tags: input.tags ?? [],
    isDemo: input.isDemo ?? false,
  };
  await guarded(() => db.investigations.add(inv));
  await logActivity('investigation.created', inv.name, inv.id);
  return inv;
}

export async function updateInvestigation(id: string, patch: Partial<Omit<Investigation, 'id' | 'createdAt'>>): Promise<void> {
  await guarded(() => db.investigations.update(id, { ...patch, updatedAt: nowIso() }));
  await logActivity('investigation.updated', Object.keys(patch).join(', '), id);
}

export async function deleteInvestigation(id: string): Promise<void> {
  await guarded(() =>
    db.transaction('rw', [db.investigations, ...INVESTIGATION_TABLES.map((t) => db[t])], async () => {
      for (const t of INVESTIGATION_TABLES) {
        await db[t].where('investigationId').equals(id).delete();
      }
      await db.investigations.delete(id);
    }),
  );
  await logActivity('investigation.deleted', id);
}

export async function wipeAllData(): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    for (const t of db.tables) await t.clear();
  });
}

/* ------------------------------------------------------------------ */
/* Entities                                                            */
/* ------------------------------------------------------------------ */

export interface NewEntity {
  investigationId: string;
  type: EntityType;
  value: string;
  label?: string;
  verification?: Verification;
  confidence?: Confidence;
  source?: Provenance;
  notes?: string;
  tags?: string[];
  lat?: number;
  lon?: number;
}

/**
 * Adds an entity, or merges provenance into an existing one with the same
 * type and normalised value (deduplication). Never upgrades verification
 * automatically — only the analyst can do that.
 */
export async function upsertEntity(input: NewEntity): Promise<{ entity: Entity; created: boolean }> {
  const value = input.value.trim();
  if (!value) throw new Error('value-required');
  const norm = normalizeValue(input.type, value);
  const candidates = await db.entities.where('[investigationId+type]').equals([input.investigationId, input.type]).toArray();
  const existing = candidates.find((e) => normalizeValue(e.type, e.value) === norm);
  const now = nowIso();
  if (existing) {
    const sources = [...existing.sources];
    if (input.source && !sources.some((s) => s.sourceId === input.source!.sourceId && s.url === input.source!.url)) {
      sources.push(input.source);
    }
    const patch: Partial<Entity> = { sources: sources.slice(-200), updatedAt: now };
    if (input.lat !== undefined && existing.lat === undefined) {
      patch.lat = input.lat;
      patch.lon = input.lon;
    }
    await guarded(() => db.entities.update(existing.id, patch));
    return { entity: { ...existing, ...patch }, created: false };
  }
  const entity: Entity = {
    id: uid(),
    investigationId: input.investigationId,
    type: input.type,
    value: value.slice(0, 2000),
    label: (input.label ?? '').slice(0, 300),
    verification: input.verification ?? 'unverified',
    confidence: input.confidence ?? 'unknown',
    sources: input.source ? [input.source] : [],
    notes: input.notes ?? '',
    tags: input.tags ?? [],
    lat: input.lat,
    lon: input.lon,
    createdAt: now,
    updatedAt: now,
  };
  await guarded(() => db.entities.add(entity));
  await touch(input.investigationId);
  await logActivity('entity.added', `${entity.type}: ${entity.value}`, input.investigationId);
  return { entity, created: true };
}

export async function updateEntity(id: string, patch: Partial<Omit<Entity, 'id' | 'investigationId' | 'createdAt'>>): Promise<void> {
  const e = await db.entities.get(id);
  if (!e) return;
  await guarded(() => db.entities.update(id, { ...patch, updatedAt: nowIso() }));
  await touch(e.investigationId);
  await logActivity('entity.updated', `${e.type}: ${e.value} (${Object.keys(patch).join(', ')})`, e.investigationId);
}

export async function deleteEntity(id: string): Promise<void> {
  const e = await db.entities.get(id);
  if (!e) return;
  await db.transaction('rw', db.entities, db.relations, db.events, async () => {
    await db.relations.where('from').equals(id).delete();
    await db.relations.where('to').equals(id).delete();
    const evs = await db.events.where('investigationId').equals(e.investigationId).toArray();
    for (const ev of evs) {
      if (ev.entityIds.includes(id)) await db.events.update(ev.id, { entityIds: ev.entityIds.filter((x) => x !== id) });
    }
    await db.entities.delete(id);
  });
  await logActivity('entity.deleted', `${e.type}: ${e.value}`, e.investigationId);
}

/** Merges `dropId` into `keepId`: provenance, notes, relations and events are transferred. */
export async function mergeEntities(keepId: string, dropId: string): Promise<void> {
  if (keepId === dropId) return;
  const [keep, drop] = await Promise.all([db.entities.get(keepId), db.entities.get(dropId)]);
  if (!keep || !drop || keep.investigationId !== drop.investigationId) throw new Error('merge-invalid');
  await db.transaction('rw', db.entities, db.relations, db.events, async () => {
    const sources = [...keep.sources];
    for (const s of drop.sources) if (!sources.some((x) => x.sourceId === s.sourceId && x.url === s.url)) sources.push(s);
    await db.entities.update(keepId, {
      sources: sources.slice(-200),
      notes: [keep.notes, drop.notes && `[merged from ${drop.value}] ${drop.notes}`].filter(Boolean).join('\n\n'),
      updatedAt: nowIso(),
    });
    const rels = await db.relations.where('investigationId').equals(keep.investigationId).toArray();
    for (const r of rels) {
      if (r.from !== dropId && r.to !== dropId) continue;
      const from = r.from === dropId ? keepId : r.from;
      const to = r.to === dropId ? keepId : r.to;
      if (from === to) await db.relations.delete(r.id);
      else await db.relations.update(r.id, { from, to });
    }
    const evs = await db.events.where('investigationId').equals(keep.investigationId).toArray();
    for (const ev of evs) {
      if (ev.entityIds.includes(dropId)) await db.events.update(ev.id, { entityIds: [...new Set(ev.entityIds.map((x) => (x === dropId ? keepId : x)))] });
    }
    await db.entities.delete(dropId);
  });
  await logActivity('entity.merged', `${drop.value} → ${keep.value}`, keep.investigationId);
}

/* ------------------------------------------------------------------ */
/* Relations                                                           */
/* ------------------------------------------------------------------ */

export interface NewRelation {
  investigationId: string;
  from: string;
  to: string;
  label?: string;
  verification?: Verification;
  confidence?: Confidence;
  source?: Provenance;
  notes?: string;
  fromSuggestion?: boolean;
}

export async function addRelation(input: NewRelation): Promise<Relation> {
  if (input.from === input.to) throw new Error('self-relation');
  const [a, b] = await Promise.all([db.entities.get(input.from), db.entities.get(input.to)]);
  if (!a || !b || a.investigationId !== input.investigationId || b.investigationId !== input.investigationId) {
    throw new Error('relation-cross-investigation');
  }
  const label = (input.label ?? '').trim().slice(0, 200);
  const dup = (await db.relations.where('investigationId').equals(input.investigationId).toArray()).find(
    (r) => ((r.from === input.from && r.to === input.to) || (r.from === input.to && r.to === input.from)) && r.label === label,
  );
  if (dup) return dup;
  const now = nowIso();
  const rel: Relation = {
    id: uid(),
    investigationId: input.investigationId,
    from: input.from,
    to: input.to,
    label,
    verification: input.verification ?? 'unverified',
    confidence: input.confidence ?? 'unknown',
    sources: input.source ? [input.source] : [],
    notes: input.notes ?? '',
    fromSuggestion: input.fromSuggestion ?? false,
    createdAt: now,
    updatedAt: now,
  };
  await guarded(() => db.relations.add(rel));
  await touch(input.investigationId);
  await logActivity('relation.added', `${a.value} —${label || '…'}→ ${b.value}`, input.investigationId);
  return rel;
}

export async function updateRelation(id: string, patch: Partial<Omit<Relation, 'id' | 'investigationId' | 'createdAt'>>): Promise<void> {
  const r = await db.relations.get(id);
  if (!r) return;
  await db.relations.update(id, { ...patch, updatedAt: nowIso() });
  await logActivity('relation.updated', Object.keys(patch).join(', '), r.investigationId);
}

export async function deleteRelation(id: string): Promise<void> {
  const r = await db.relations.get(id);
  if (!r) return;
  await db.relations.delete(id);
  await logActivity('relation.deleted', r.label, r.investigationId);
}

/* ------------------------------------------------------------------ */
/* Timeline                                                            */
/* ------------------------------------------------------------------ */

export type NewEvent = Omit<TimelineEvent, 'id' | 'createdAt' | 'updatedAt'>;

export async function addEvent(input: NewEvent): Promise<TimelineEvent> {
  if (Number.isNaN(new Date(input.datetime).getTime())) throw new Error('invalid-date');
  const now = nowIso();
  const ev: TimelineEvent = { ...input, id: uid(), createdAt: now, updatedAt: now };
  await guarded(() => db.events.add(ev));
  await touch(input.investigationId);
  await logActivity('event.added', ev.title, input.investigationId);
  return ev;
}

export async function updateEvent(id: string, patch: Partial<NewEvent>): Promise<void> {
  const ev = await db.events.get(id);
  if (!ev) return;
  await db.events.update(id, { ...patch, updatedAt: nowIso() });
  await logActivity('event.updated', ev.title, ev.investigationId);
}

export async function deleteEvent(id: string): Promise<void> {
  const ev = await db.events.get(id);
  if (!ev) return;
  await db.events.delete(id);
  await logActivity('event.deleted', ev.title, ev.investigationId);
}

/* ------------------------------------------------------------------ */
/* Notes                                                               */
/* ------------------------------------------------------------------ */

export async function saveNote(input: { id?: string; investigationId: string; title: string; body: string }): Promise<Note> {
  const now = nowIso();
  if (input.id) {
    await db.notes.update(input.id, { title: input.title.slice(0, 300), body: input.body.slice(0, 100000), updatedAt: now });
    await touch(input.investigationId);
    return (await db.notes.get(input.id))!;
  }
  const note: Note = {
    id: uid(),
    investigationId: input.investigationId,
    title: input.title.slice(0, 300),
    body: input.body.slice(0, 100000),
    createdAt: now,
    updatedAt: now,
  };
  await guarded(() => db.notes.add(note));
  await touch(input.investigationId);
  await logActivity('note.added', note.title, input.investigationId);
  return note;
}

export async function deleteNote(id: string): Promise<void> {
  const n = await db.notes.get(id);
  if (!n) return;
  await db.notes.delete(id);
  await logActivity('note.deleted', n.title, n.investigationId);
}

/* ------------------------------------------------------------------ */
/* Evidence                                                            */
/* ------------------------------------------------------------------ */

export async function addEvidence(input: Omit<Evidence, 'id' | 'createdAt'>): Promise<Evidence> {
  const ev: Evidence = { ...input, id: uid(), createdAt: nowIso() };
  await guarded(() => db.evidence.add(ev));
  await touch(input.investigationId);
  await logActivity('evidence.added', `${ev.name} (${ev.sha256.slice(0, 12)}…)`, input.investigationId);
  return ev;
}

export async function deleteEvidence(id: string): Promise<void> {
  const ev = await db.evidence.get(id);
  if (!ev) return;
  await db.evidence.delete(id);
  await logActivity('evidence.deleted', ev.name, ev.investigationId);
}

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  try {
    const row = await db.settings.get(key);
    return row ? (row.value as T) : fallback;
  } catch {
    return fallback;
  }
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await guarded(() => db.settings.put({ key, value }));
}
