import { z } from 'zod';
import { db } from '@/services/storage/db';
import {
  ActivitySchema,
  EntitySchema,
  EvidenceSchema,
  InvestigationSchema,
  NoteSchema,
  RelationSchema,
  ResultSchema,
  TimelineEventSchema,
  type Evidence,
} from '@/types';
import { nowIso, uid } from '@/utils/common';
import { logActivity } from '@/services/storage/repository';

export const BACKUP_FORMAT = 'blackwatch-osint-backup';
export const BACKUP_VERSION = 1;

const EvidenceExportSchema = EvidenceSchema.extend({ dataBase64: z.string().max(700_000_000).optional() });

export const BackupSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.number().int().min(1).max(BACKUP_VERSION),
  exportedAt: z.string(),
  app: z.string().optional(),
  investigations: z.array(InvestigationSchema).max(10_000),
  entities: z.array(EntitySchema).max(500_000),
  relations: z.array(RelationSchema).max(500_000),
  events: z.array(TimelineEventSchema).max(500_000),
  notes: z.array(NoteSchema).max(100_000),
  results: z.array(ResultSchema).max(1_000_000),
  activity: z.array(ActivitySchema).max(1_000_000),
  evidence: z.array(EvidenceExportSchema).max(100_000),
});
export type Backup = z.infer<typeof BackupSchema>;

async function blobToBase64(b: Blob): Promise<string> {
  const bytes = new Uint8Array(await b.arrayBuffer());
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function base64ToBlob(b64: string, mime: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/** Builds a backup of one investigation, or of everything when `ids` is omitted. */
export async function buildBackup(opts: { ids?: string[]; includeFiles?: boolean } = {}): Promise<Backup> {
  const invs = opts.ids ? (await db.investigations.bulkGet(opts.ids)).filter((x): x is NonNullable<typeof x> => !!x) : await db.investigations.toArray();
  const ids = invs.map((i) => i.id);
  const [entities, relations, events, notes, results, activity, evidence] = await Promise.all([
    db.entities.where('investigationId').anyOf(ids).toArray(),
    db.relations.where('investigationId').anyOf(ids).toArray(),
    db.events.where('investigationId').anyOf(ids).toArray(),
    db.notes.where('investigationId').anyOf(ids).toArray(),
    db.results.where('investigationId').anyOf(ids).toArray(),
    db.activity.where('investigationId').anyOf(ids).toArray(),
    db.evidence.where('investigationId').anyOf(ids).toArray(),
  ]);
  const ev = await Promise.all(
    evidence.map(async ({ blob, ...rest }) => ({ ...rest, dataBase64: opts.includeFiles && blob ? await blobToBase64(blob) : undefined })),
  );
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: nowIso(),
    app: 'BLACKWATCH OSINT',
    investigations: invs,
    entities,
    relations,
    events,
    notes,
    results,
    activity,
    evidence: ev,
  };
}

export interface ImportReport {
  investigations: number;
  entities: number;
  relations: number;
  events: number;
  notes: number;
  evidence: number;
  results: number;
  renamed: number;
}

/**
 * Validates and imports a backup. Every ID is re-mapped so an import can never
 * overwrite or merge into an existing investigation (isolation guarantee).
 */
export async function importBackup(raw: unknown): Promise<ImportReport> {
  const parsed = BackupSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`invalid-backup: ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  }
  const b = parsed.data;
  const idMap = new Map<string, string>();
  const map = (old: string) => {
    if (!idMap.has(old)) idMap.set(old, uid());
    return idMap.get(old)!;
  };
  const invIds = new Set(b.investigations.map((i) => i.id));
  const belongs = (x: { investigationId?: string }) => !!x.investigationId && invIds.has(x.investigationId);
  const existingNames = new Set((await db.investigations.toArray()).map((i) => i.name));
  let renamed = 0;
  const investigations = b.investigations.map((i) => {
    let name = i.name;
    if (existingNames.has(name)) {
      name = `${name} (import ${nowIso().slice(0, 10)})`;
      renamed++;
    }
    return { ...i, id: map(i.id), name };
  });
  const entities = b.entities.filter(belongs).map((e) => ({ ...e, id: map(e.id), investigationId: map(e.investigationId) }));
  const entityIds = new Set(b.entities.filter(belongs).map((e) => e.id));
  const relations = b.relations
    .filter((r) => belongs(r) && entityIds.has(r.from) && entityIds.has(r.to))
    .map((r) => ({ ...r, id: map(r.id), investigationId: map(r.investigationId), from: map(r.from), to: map(r.to) }));
  const events = b.events.filter(belongs).map((e) => ({ ...e, id: map(e.id), investigationId: map(e.investigationId), entityIds: e.entityIds.filter((x) => entityIds.has(x)).map(map) }));
  const notes = b.notes.filter(belongs).map((n) => ({ ...n, id: map(n.id), investigationId: map(n.investigationId) }));
  const results = b.results.filter(belongs).map((r) => ({ ...r, id: uid(), investigationId: map(r.investigationId!), runId: undefined }));
  const activity = b.activity.filter(belongs).map((a) => ({ ...a, id: uid(), investigationId: map(a.investigationId!) }));
  const evidence: Evidence[] = b.evidence.filter(belongs).map(({ dataBase64, ...e }) => ({
    ...e,
    id: map(e.id),
    investigationId: map(e.investigationId),
    blob: dataBase64 ? base64ToBlob(dataBase64, e.mime) : undefined,
  }));

  await db.transaction('rw', [db.investigations, db.entities, db.relations, db.events, db.notes, db.results, db.activity, db.evidence], async () => {
    await db.investigations.bulkAdd(investigations);
    await db.entities.bulkAdd(entities);
    await db.relations.bulkAdd(relations);
    await db.events.bulkAdd(events);
    await db.notes.bulkAdd(notes);
    await db.results.bulkAdd(results);
    await db.activity.bulkAdd(activity);
    await db.evidence.bulkAdd(evidence);
  });
  for (const inv of investigations) await logActivity('investigation.imported', inv.name, inv.id);
  return { investigations: investigations.length, entities: entities.length, relations: relations.length, events: events.length, notes: notes.length, evidence: evidence.length, results: results.length, renamed };
}

/* ------------------------------------------------------------------ */
/* Optional encrypted backups (AES-256-GCM, PBKDF2-SHA-256)             */
/* ------------------------------------------------------------------ */

export const ENCRYPTED_FORMAT = 'blackwatch-osint-encrypted';
const PBKDF2_ITERATIONS = 600_000;

const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function deriveKey(passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function encryptJson(data: unknown, passphrase: string, iterations = PBKDF2_ITERATIONS): Promise<string> {
  if (passphrase.length < 10) throw new Error('passphrase-too-short');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, iterations);
  const plain = new TextEncoder().encode(JSON.stringify(data));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain));
  let ctB64 = '';
  for (let i = 0; i < ct.length; i += 0x8000) ctB64 += String.fromCharCode(...ct.subarray(i, i + 0x8000));
  return JSON.stringify({ format: ENCRYPTED_FORMAT, version: 1, kdf: 'PBKDF2-SHA256', iterations, cipher: 'AES-256-GCM', salt: b64(salt), iv: b64(iv), data: btoa(ctB64) });
}

export function isEncryptedEnvelope(x: unknown): boolean {
  return !!x && typeof x === 'object' && (x as { format?: string }).format === ENCRYPTED_FORMAT;
}

export async function decryptJson(envelopeJson: string | object, passphrase: string): Promise<unknown> {
  const env = z
    .object({ format: z.literal(ENCRYPTED_FORMAT), iterations: z.number().int().min(100_000).max(5_000_000), salt: z.string(), iv: z.string(), data: z.string() })
    .parse(typeof envelopeJson === 'string' ? JSON.parse(envelopeJson) : envelopeJson);
  const key = await deriveKey(passphrase, unb64(env.salt), env.iterations);
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(env.iv) as BufferSource }, key, unb64(env.data) as BufferSource);
    return JSON.parse(new TextDecoder().decode(plain));
  } catch {
    throw new Error('decryption-failed');
  }
}
