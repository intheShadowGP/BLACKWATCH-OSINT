import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/services/storage/db';
import { addEvent, addRelation, createInvestigation, deleteEntity, deleteInvestigation, mergeEntities, saveNote, upsertEntity, wipeAllData, addEvidence } from '@/services/storage/repository';
import { buildBackup, decryptJson, encryptJson, importBackup } from '@/services/export/backup';
import { loadDemo, hasDemo, removeDemo } from '@/services/storage/demo';
import { collectReportData, renderCsv, renderHtml, renderJson, renderMarkdown, type ReportOptions } from '@/services/export/report';

const src = { sourceId: 'manual', collectedAt: '2026-01-01T00:00:00.000Z' };

beforeEach(async () => {
  await wipeAllData();
});

describe('investigations & entities (IndexedDB)', () => {
  it('creates an investigation and deduplicates entities, merging provenance', async () => {
    const inv = await createInvestigation({ name: 'Case A' });
    const a = await upsertEntity({ investigationId: inv.id, type: 'domain', value: 'Example.com', source: src });
    const b = await upsertEntity({ investigationId: inv.id, type: 'domain', value: 'www.example.com.', source: { sourceId: 'dns-cloudflare', collectedAt: src.collectedAt } });
    expect(a.created).toBe(true);
    expect(b.created).toBe(false);
    expect(b.entity.id).toBe(a.entity.id);
    expect((await db.entities.get(a.entity.id))!.sources).toHaveLength(2);
    // never upgrades verification automatically
    expect((await db.entities.get(a.entity.id))!.verification).toBe('unverified');
  });

  it('keeps investigations isolated and rejects cross-investigation relations', async () => {
    const i1 = await createInvestigation({ name: 'One' });
    const i2 = await createInvestigation({ name: 'Two' });
    const e1 = (await upsertEntity({ investigationId: i1.id, type: 'username', value: 'x' })).entity;
    const e2 = (await upsertEntity({ investigationId: i2.id, type: 'username', value: 'x' })).entity;
    expect(e1.id).not.toBe(e2.id);
    await expect(addRelation({ investigationId: i1.id, from: e1.id, to: e2.id })).rejects.toThrow('relation-cross-investigation');
    await expect(addRelation({ investigationId: i1.id, from: e1.id, to: e1.id })).rejects.toThrow('self-relation');
  });

  it('deletes an investigation and everything that belongs to it, only it', async () => {
    const keep = await createInvestigation({ name: 'Keep' });
    const del = await createInvestigation({ name: 'Delete' });
    const k = (await upsertEntity({ investigationId: keep.id, type: 'email', value: 'a@example.org' })).entity;
    const a = (await upsertEntity({ investigationId: del.id, type: 'email', value: 'a@example.org' })).entity;
    const b = (await upsertEntity({ investigationId: del.id, type: 'domain', value: 'example.org' })).entity;
    await addRelation({ investigationId: del.id, from: a.id, to: b.id, label: 'hosted on' });
    await addEvent({ investigationId: del.id, title: 'x', description: '', datetime: '2025-01-01T00:00:00.000Z', timezone: 'UTC', dateKind: 'occurrence', verification: 'unverified', confidence: 'unknown', sources: [], entityIds: [a.id] });
    await saveNote({ investigationId: del.id, title: 'n', body: 'b' });
    await deleteInvestigation(del.id);
    expect(await db.investigations.get(del.id)).toBeUndefined();
    expect(await db.entities.where('investigationId').equals(del.id).count()).toBe(0);
    expect(await db.relations.where('investigationId').equals(del.id).count()).toBe(0);
    expect(await db.events.where('investigationId').equals(del.id).count()).toBe(0);
    expect(await db.notes.where('investigationId').equals(del.id).count()).toBe(0);
    expect(await db.entities.get(k.id)).toBeDefined();
  });

  it('removes relations and event links when an entity is deleted, and merges entities', async () => {
    const inv = await createInvestigation({ name: 'M' });
    const a = (await upsertEntity({ investigationId: inv.id, type: 'username', value: 'johndoe', source: src })).entity;
    const b = (await upsertEntity({ investigationId: inv.id, type: 'username', value: 'john_doe', source: { sourceId: 'github', collectedAt: src.collectedAt } })).entity;
    const c = (await upsertEntity({ investigationId: inv.id, type: 'email', value: 'j@example.org' })).entity;
    await addRelation({ investigationId: inv.id, from: b.id, to: c.id, label: 'uses' });
    await mergeEntities(a.id, b.id);
    const rels = await db.relations.where('investigationId').equals(inv.id).toArray();
    expect(rels[0].from).toBe(a.id);
    expect((await db.entities.get(a.id))!.sources.map((s) => s.sourceId).sort()).toEqual(['github', 'manual']);
    await deleteEntity(a.id);
    expect(await db.relations.where('investigationId').equals(inv.id).count()).toBe(0);
  });
});

describe('backup export / import', () => {
  it('round-trips an investigation with remapped ids, including evidence files', async () => {
    const inv = await createInvestigation({ name: 'Backup me' });
    const e = (await upsertEntity({ investigationId: inv.id, type: 'domain', value: 'example.org' })).entity;
    const f = (await upsertEntity({ investigationId: inv.id, type: 'ip', value: '192.0.2.1' })).entity;
    await addRelation({ investigationId: inv.id, from: e.id, to: f.id, label: 'resolves to' });
    await addEvidence({ investigationId: inv.id, name: 'a.txt', mime: 'text/plain', size: 5, sha256: 'ab'.repeat(32), notes: '', metadata: {}, blob: new Blob(['hello']) });
    const backup = await buildBackup({ ids: [inv.id], includeFiles: true });
    const json = JSON.parse(JSON.stringify(backup));
    const report = await importBackup(json);
    expect(report).toMatchObject({ investigations: 1, entities: 2, relations: 1, evidence: 1, renamed: 1 });
    const all = await db.investigations.toArray();
    expect(all).toHaveLength(2);
    const imported = all.find((i) => i.id !== inv.id)!;
    expect(imported.name).toMatch(/import/);
    const rels = await db.relations.where('investigationId').equals(imported.id).toArray();
    const ents = await db.entities.where('investigationId').equals(imported.id).toArray();
    expect(ents.map((x) => x.id)).toContain(rels[0].from);
    expect(ents.map((x) => x.id)).not.toContain(e.id);
    const ev = await db.evidence.where('investigationId').equals(imported.id).first();
    expect(await ev!.blob!.text()).toBe('hello');
  });

  it('rejects malformed backups', async () => {
    await expect(importBackup({ format: 'nope' })).rejects.toThrow(/invalid-backup/);
    await expect(importBackup({ format: 'blackwatch-osint-backup', version: 99 })).rejects.toThrow(/invalid-backup/);
  });

  it('encrypts and decrypts with AES-GCM; wrong passphrase fails', async () => {
    const enc = await encryptJson({ secret: 'data' }, 'correct horse battery', 100_000);
    expect(enc).not.toContain('secret');
    expect(await decryptJson(enc, 'correct horse battery')).toEqual({ secret: 'data' });
    await expect(decryptJson(enc, 'wrong passphrase!!')).rejects.toThrow('decryption-failed');
    await expect(encryptJson({}, 'short')).rejects.toThrow('passphrase-too-short');
  });
});

describe('demo mode & reports', () => {
  const opts: ReportOptions = {
    summary: '',
    methodology: 'm',
    limitations: 'l',
    overallConfidence: 'medium',
    include: { entities: true, relations: true, timeline: true, results: true, evidence: true, notes: true, sources: true },
    onlyCorroborated: false,
    lang: 'en',
  };

  it('loads, flags and removes fictitious demo data', async () => {
    const id = await loadDemo();
    expect(await hasDemo()).toBe(true);
    const inv = await db.investigations.get(id);
    expect(inv!.isDemo).toBe(true);
    const ents = await db.entities.where('investigationId').equals(id).toArray();
    // Only reserved / documentation values
    for (const e of ents.filter((x) => x.type === 'domain')) expect(e.value).toMatch(/example\.(net|org|com)$/);
    for (const e of ents.filter((x) => x.type === 'ip')) expect(e.value).toMatch(/^(203\.0\.113\.|198\.51\.100\.|192\.0\.2\.|2001:db8:)/);
    await removeDemo();
    expect(await hasDemo()).toBe(false);
  });

  it('generates reports in every text format with provenance and demo warning', async () => {
    const id = await loadDemo();
    const data = await collectReportData(id, opts);
    expect(data.entities.length).toBeGreaterThan(5);
    const md = renderMarkdown(data);
    expect(md).toContain('FICTITIOUS DATA');
    expect(md).toContain('## Timeline');
    const html = renderHtml(data);
    expect(html).toContain("default-src 'none'");
    expect(html).not.toMatch(/<script/i);
    expect(JSON.parse(renderJson(data)).investigation.id).toBe(id);
    const csv = renderCsv(data);
    expect(csv.split('\r\n')[0]).toContain('section,id,type,value');
    const strict = await collectReportData(id, { ...opts, onlyCorroborated: true });
    expect(strict.entities.every((e) => e.verification === 'verified' || e.verification === 'public-source')).toBe(true);
  });
});
