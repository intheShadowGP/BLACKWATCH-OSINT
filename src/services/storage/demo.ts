import { db } from './db';
import { addEvent, addRelation, createInvestigation, deleteInvestigation, saveNote, upsertEntity } from './repository';
import type { Provenance } from '@/types';
import { nowIso } from '@/utils/common';

/**
 * Demonstration investigation. ALL DATA IS FICTITIOUS:
 *  - domains use the reserved example.* names (RFC 2606),
 *  - IPs use documentation ranges (RFC 5737 / RFC 3849),
 *  - people, handles and organisations are invented.
 * Demo records are flagged isDemo and excluded from real statistics.
 */
export const DEMO_NAME = 'DEMO — Opération NIGHTJAR (fictive)';

export async function hasDemo(): Promise<boolean> {
  return (await db.investigations.filter((i) => i.isDemo).count()) > 0;
}

export async function removeDemo(): Promise<void> {
  const demos = await db.investigations.filter((i) => i.isDemo).toArray();
  for (const d of demos) await deleteInvestigation(d.id);
}

export async function loadDemo(): Promise<string> {
  await removeDemo();
  const inv = await createInvestigation({
    name: DEMO_NAME,
    description:
      'Investigation de démonstration entièrement fictive. / Entirely fictitious demonstration investigation. Le pseudonyme « nightjar_ops » serait lié à une fausse boutique en ligne. / The handle "nightjar_ops" is allegedly linked to a fake online shop.',
    objective: 'Démontrer les modules BLACKWATCH sans aucune donnée réelle. / Showcase BLACKWATCH modules with no real data.',
    status: 'in-progress',
    tags: ['demo', 'fictitious'],
    isDemo: true,
  });
  const id = inv.id;
  const src = (note: string): Provenance => ({ sourceId: 'demo', sourceName: 'Demo (fictitious)', collectedAt: nowIso(), note });
  const add = async (type: Parameters<typeof upsertEntity>[0]['type'], value: string, extra: Partial<Parameters<typeof upsertEntity>[0]> = {}) =>
    (await upsertEntity({ investigationId: id, type, value, source: src('fictitious seed data'), ...extra })).entity;

  const handle = await add('username', 'nightjar_ops', { verification: 'public-source', confidence: 'medium', label: 'Pseudonyme principal / main handle' });
  const handle2 = await add('username', 'night.jar.ops', { verification: 'unverified', confidence: 'low' });
  const email = await add('email', 'nightjar_ops@example.org', { verification: 'public-source', confidence: 'medium' });
  const domain = await add('domain', 'shop.example.net', { verification: 'verified', confidence: 'high', label: 'Boutique suspecte / suspicious shop' });
  const parent = await add('domain', 'example.net', { verification: 'verified', confidence: 'high' });
  const ip = await add('ip', '203.0.113.42', { verification: 'public-source', confidence: 'medium' });
  const ip6 = await add('ip', '2001:db8::42', { verification: 'public-source', confidence: 'medium' });
  const org = await add('organization', 'Fictional Hosting Ltd.', { verification: 'public-source', confidence: 'medium' });
  const acct = await add('account', 'https://social.example.com/@nightjar_ops', { verification: 'hypothesis', confidence: 'low' });
  const person = await add('person', 'Alex Placeholder', { verification: 'hypothesis', confidence: 'low', label: 'Identité déclarée (fictive) / declared identity (fictitious)' });
  const loc = await add('location', 'Lyon, France (approx.)', { verification: 'unverified', confidence: 'low', lat: 45.764, lon: 4.8357 });
  const img = await add('image', 'storefront_photo.jpg', { verification: 'public-source', confidence: 'medium' });

  await addRelation({ investigationId: id, from: domain.id, to: ip.id, label: 'resolves to', verification: 'verified', confidence: 'high', source: src('fictitious DNS A record') });
  await addRelation({ investigationId: id, from: domain.id, to: ip6.id, label: 'resolves to', verification: 'verified', confidence: 'high', source: src('fictitious DNS AAAA record') });
  await addRelation({ investigationId: id, from: domain.id, to: parent.id, label: 'sub-domain of', verification: 'verified', confidence: 'high' });
  await addRelation({ investigationId: id, from: ip.id, to: org.id, label: 'hosted by', verification: 'public-source', confidence: 'medium' });
  await addRelation({ investigationId: id, from: handle.id, to: acct.id, label: 'handle used by', verification: 'public-source', confidence: 'medium' });
  await addRelation({ investigationId: id, from: email.id, to: domain.id, label: 'contact listed on', verification: 'public-source', confidence: 'medium' });
  await addRelation({ investigationId: id, from: person.id, to: handle.id, label: 'possibly operates', verification: 'hypothesis', confidence: 'low' });
  await addRelation({ investigationId: id, from: img.id, to: loc.id, label: 'GPS metadata points to', verification: 'unverified', confidence: 'low' });

  const ev = (title: string, datetime: string, dateKind: 'occurrence' | 'publication' | 'discovery' | 'collection', entityIds: string[], extra: Partial<Parameters<typeof addEvent>[0]> = {}) =>
    addEvent({
      investigationId: id,
      title,
      description: '',
      datetime,
      timezone: 'Europe/Paris',
      dateKind,
      verification: 'public-source',
      confidence: 'medium',
      sources: [src('fictitious')],
      entityIds,
      ...extra,
    });
  await ev('Domain shop.example.net registered', '2025-02-03T09:12:00.000Z', 'occurrence', [domain.id], { verification: 'verified', confidence: 'high' });
  await ev('First TLS certificate issued for shop.example.net', '2025-02-04T00:00:00.000Z', 'occurrence', [domain.id]);
  await ev('Account @nightjar_ops created', '2025-01-28T18:40:00.000Z', 'occurrence', [handle.id, acct.id]);
  await ev('Post advertising the shop', '2025-03-11T20:05:00.000Z', 'publication', [acct.id, domain.id]);
  await ev('Storefront photo taken (EXIF DateTimeOriginal)', '2025-03-10T14:22:00.000Z', 'occurrence', [img.id, loc.id], { verification: 'unverified', confidence: 'low', lat: 45.764, lon: 4.8357 });
  await ev('Shop discovered by analyst', '2025-04-02T08:30:00.000Z', 'discovery', [domain.id]);
  await ev('Data collected for this report', '2025-04-02T09:00:00.000Z', 'collection', []);

  await saveNote({
    investigationId: id,
    title: 'Hypothèses de travail / working hypotheses',
    body:
      '1. Le pseudonyme et l’adresse partagent le même identifiant : corrélation, pas preuve.\n2. La géolocalisation EXIF peut avoir été modifiée.\n\n1. Handle and e-mail share the same identifier: correlation, not proof.\n2. EXIF geolocation may have been altered.',
  });
  void handle2;
  return id;
}
