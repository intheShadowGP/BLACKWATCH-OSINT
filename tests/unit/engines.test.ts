import { describe, expect, it } from 'vitest';
import { correlate, handleSkeleton, levenshtein } from '@/services/correlation/engine';
import { buildQuery, EMPTY_DORK, fillTemplate, placeholdersOf, translateQuery, TEMPLATES } from '@/services/search/dorks';
import { findDuplicateEvents, formatOffset, utcToZonedLocal, zonedToUtcIso } from '@/utils/time';
import { classifyEmailDomain, identifyMailHost, parseDmarc, parseSpf } from '@/services/sources/emailProviders';
import { generateVariants, parseProfileUrl, PLATFORMS } from '@/services/sources/platforms';
import { summarise, imageReportMarkdown } from '@/services/image/analysis';
import { distanceKm, parseCoordinateImport, toKML, conversions } from '@/services/geo/geo';
import type { Entity, Relation } from '@/types';

const now = '2026-01-01T00:00:00.000Z';
function ent(id: string, type: Entity['type'], value: string, extra: Partial<Entity> = {}): Entity {
  return { id, investigationId: 'inv', type, value, label: '', verification: 'unverified', confidence: 'unknown', sources: [], notes: '', tags: [], createdAt: now, updatedAt: now, ...extra };
}

describe('correlation engine', () => {
  it('computes levenshtein with early exit', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('abc', 'abc')).toBe(0);
    expect(levenshtein('a', 'abcdefgh', 2)).toBe(3);
    expect(handleSkeleton('John.Doe_92')).toBe('johndoe');
  });

  it('suggests exact cross-type matches without creating anything', () => {
    const entities = [ent('e1', 'email', 'nightjar_ops@example.org'), ent('u1', 'username', 'nightjar_ops'), ent('d1', 'domain', 'example.org'), ent('d2', 'domain', 'shop.example.org'), ent('a1', 'account', 'https://social.example.com/@nightjar_ops'), ent('ip1', 'ip', '203.0.113.42')];
    const s = correlate({
      entities,
      relations: [],
      results: [{ sourceId: 'dns-cloudflare', query: 'shop.example.org', queryType: 'domain', type: 'ip', kind: 'DNS A', value: '203.0.113.42' }],
      events: [],
    });
    const reasons = s.map((x) => x.reason);
    expect(reasons).toContain('email-local-eq-username');
    expect(reasons).toContain('email-domain');
    expect(reasons).toContain('subdomain');
    expect(reasons).toContain('account-contains-username');
    expect(reasons).toContain('dns-resolves');
    expect(s.every((x) => typeof x.key === 'string' && x.key.length > 0)).toBe(true);
    // Keys are unique
    expect(new Set(s.map((x) => x.key)).size).toBe(s.length);
  });

  it('does not suggest relations that already exist', () => {
    const entities = [ent('e1', 'email', 'abc@example.org'), ent('d1', 'domain', 'example.org')];
    const rel: Relation = { id: 'r', investigationId: 'inv', from: 'd1', to: 'e1', label: 'x', verification: 'verified', confidence: 'high', sources: [], notes: '', fromSuggestion: false, createdAt: now, updatedAt: now };
    const s = correlate({ entities, relations: [rel], results: [], events: [] });
    expect(s.find((x) => x.reason === 'email-domain')).toBeUndefined();
  });

  it('flags duplicates, inconsistencies and leads', () => {
    const entities = [ent('u1', 'username', 'johndoe'), ent('u2', 'username', 'JohnDoe'), ent('u3', 'username', 'johndoe1'), ent('p', 'person', 'X', { verification: 'verified' })];
    const s = correlate({ entities, relations: [], results: [], events: [{ id: 'a', title: 'Account created', datetime: '2020-01-01T00:00:00Z' }, { id: 'b', title: 'account created', datetime: '2021-01-01T00:00:00Z' }] });
    expect(s.some((x) => x.kind === 'duplicate' && x.strength === 'exact')).toBe(true);
    expect(s.some((x) => x.reason === 'verified-no-source')).toBe(true);
    expect(s.some((x) => x.reason === 'event-conflicting-dates')).toBe(true);
    expect(s.some((x) => x.kind === 'lead')).toBe(true);
  });
});

describe('search query builder', () => {
  it('builds Google syntax transparently', () => {
    const { query, dropped } = buildQuery({ ...EMPTY_DORK, exact: 'Jane Doe', site: 'example.com', filetype: 'pdf', exclude: 'jobs', any: 'cv resume', after: '2024-01-01' }, 'google');
    expect(query).toBe('"Jane Doe" (cv OR resume) site:example.com filetype:pdf after:2024-01-01 -jobs');
    expect(dropped).toEqual([]);
  });
  it('drops unsupported operators per engine and reports them', () => {
    const r = buildQuery({ ...EMPTY_DORK, all: 'x', inurl: 'admin', after: '2024-01-01' }, 'bing');
    expect(r.query).toBe('x');
    expect(r.dropped).toEqual(['inurl', 'after']);
  });
  it('strips quotes/newlines from user input', () => {
    const r = buildQuery({ ...EMPTY_DORK, exact: 'a"b\nc' }, 'google');
    expect(r.query).toBe('"ab c"');
  });
  it('fills templates and translates operators', () => {
    const tpl = TEMPLATES.find((t) => t.id === 'd-pdf')!;
    expect(placeholdersOf(tpl.template)).toEqual(['domain']);
    expect(fillTemplate(tpl.template, { domain: 'example.com' })).toBe('site:example.com filetype:pdf');
    expect(translateQuery('site:example.com filetype:pdf intitle:x', 'yandex').query).toBe('site:example.com mime:pdf title:x');
    expect(translateQuery('intext:x', 'duckduckgo').unsupported).toEqual(['intext:']);
  });
  it('contains no credential-hunting templates', () => {
    for (const t of TEMPLATES) expect(t.template).not.toMatch(/password|passwd|\.env|credential|api[_-]?key|secret/i);
  });
});

describe('time zones', () => {
  it('converts wall-clock time to UTC and back', () => {
    expect(zonedToUtcIso('2025-03-10T14:22', 'Europe/Paris')).toBe('2025-03-10T13:22:00.000Z');
    expect(zonedToUtcIso('2025-07-10T14:22', 'Europe/Paris')).toBe('2025-07-10T12:22:00.000Z');
    expect(zonedToUtcIso('2025-07-10T14:22', 'America/New_York')).toBe('2025-07-10T18:22:00.000Z');
    expect(utcToZonedLocal('2025-07-10T12:22:00.000Z', 'Europe/Paris')).toBe('2025-07-10T14:22');
    expect(formatOffset('2025-07-10T12:22:00.000Z', 'Asia/Kolkata')).toBe('UTC+05:30');
    expect(zonedToUtcIso('bad', 'UTC')).toBeNull();
    expect(zonedToUtcIso('2025-01-01T00:00', 'Not/AZone')).toBeNull();
  });
  it('detects duplicate events', () => {
    const d = findDuplicateEvents([
      { id: '1', title: 'Post published!', datetime: '2025-01-01T10:00:00Z', entityIds: [] },
      { id: '2', title: 'post published', datetime: '2025-01-01T10:00:30Z', entityIds: [] },
      { id: '3', title: 'Other', datetime: '2025-01-02T10:00:00Z', entityIds: [] },
    ]);
    expect(d).toHaveLength(1);
  });
});

describe('e-mail providers', () => {
  it('classifies domains locally', () => {
    expect(classifyEmailDomain('gmail.com')).toContain('webmail');
    expect(classifyEmailDomain('proton.me')).toContain('privacy');
    expect(classifyEmailDomain('yopmail.com')).toContain('disposable');
    expect(classifyEmailDomain('univ.example.edu')).toContain('education');
    expect(classifyEmailDomain('acme-corp.example')).toEqual(['custom']);
    expect(identifyMailHost('aspmx.l.google.com.')).toMatch(/Google/);
  });
  it('parses SPF and DMARC', () => {
    const s = parseSpf('v=spf1 include:_spf.google.com ip4:192.0.2.0/24 ~all');
    expect(s.all).toBe('~all');
    expect(s.includes).toEqual(['_spf.google.com']);
    expect(s.ips).toEqual(['192.0.2.0/24']);
    expect(parseDmarc('v=DMARC1; p=reject; rua=mailto:x@example.org').p).toBe('reject');
  });
});

describe('platforms', () => {
  it('parses profile URLs', () => {
    expect(parseProfileUrl('https://github.com/torvalds')).toMatchObject({ username: 'torvalds' });
    expect(parseProfileUrl('https://x.com/jack')?.platform.id).toBe('x');
    expect(parseProfileUrl('https://www.reddit.com/user/spez/')?.username).toBe('spez');
    expect(parseProfileUrl('https://example.com/whatever')).toBeNull();
  });
  it('generates bounded, valid variants', () => {
    const v = generateVariants('John Doe');
    expect(v).toContain('johndoe');
    expect(v).toContain('john.doe');
    expect(v).toContain('doejohn');
    expect(v.every((x) => /^[A-Za-z0-9._-]+$/.test(x))).toBe(true);
    expect(generateVariants('x'.repeat(10), 5)).toHaveLength(5);
  });
  it('builds encoded profile URLs', () => {
    const gh = PLATFORMS.find((p) => p.id === 'github')!;
    expect(gh.profileUrl('a/b?c')).toBe('https://github.com/a%2Fb%3Fc');
  });
});

describe('image metadata interpretation', () => {
  it('summarises EXIF and raises flags', () => {
    const s = summarise({ Make: 'Canon', Model: 'EOS', DateTimeOriginal: '2025-03-10T14:22:00.000Z', ModifyDate: '2025-04-01T10:00:00.000Z', Software: 'Adobe Photoshop 25', latitude: 45.76, longitude: 4.83, ExifImageWidth: 4000, ExifImageHeight: 3000 }, { width: 800, height: 600 });
    expect(s.gps).toEqual({ lat: 45.76, lon: 4.83, alt: undefined });
    expect(s.flags).toEqual(expect.arrayContaining(['editing-software', 'modified-after-capture', 'gps-present', 'no-timezone', 'dimension-mismatch']));
    expect(summarise({}).flags).toContain('no-metadata');
    expect(summarise({ latitude: 0, longitude: 0 }).flags).toContain('gps-zero');
  });
  it('produces a markdown report', () => {
    const md = imageReportMarkdown({ name: 'a.jpg', size: 10, mime: 'image/jpeg', sha256: 'ff' }, summarise({}), {});
    expect(md).toContain('SHA-256: `ff`');
    expect(md).toContain('no-metadata');
  });
});

describe('geo helpers', () => {
  it('imports CSV and GeoJSON coordinates', () => {
    expect(parseCoordinateImport('lat,lon,label\n48.85,2.29,Eiffel\nbad\n91,0').points).toHaveLength(1);
    const gj = JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [2.29, 48.85] }, properties: { name: 'E' } }] });
    expect(parseCoordinateImport(gj).points[0]).toEqual({ lat: 48.85, lon: 2.29, label: 'E' });
  });
  it('computes distances and conversions', () => {
    expect(distanceKm({ lat: 48.8584, lon: 2.2945 }, { lat: 51.5007, lon: -0.1246 })).toBeCloseTo(340.6, 0);
    expect(conversions(1, 2).geoUri).toBe('geo:1.000000,2.000000');
  });
  it('escapes KML', () => {
    expect(toKML([{ id: '1', lat: 1, lon: 2, label: '<script>', kind: 'session' }], 'x')).toContain('&lt;script&gt;');
  });
});
