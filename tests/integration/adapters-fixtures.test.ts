import { beforeEach, describe, expect, it } from 'vitest';
import { getAdapter } from '@/services/adapters/registry';
import { resetRateLimits, setFetchImpl } from '@/services/adapters/http';
import { DEFAULT_PRIVACY, settingsStore } from '@/services/privacy/store';
import type { QueryType } from '@/types';

/**
 * "Not found" responses recorded from the real services on 2026-11-12
 * (browser fetch from a localhost origin; all carried CORS headers).
 */
const NOT_FOUND: Record<string, { status: number; body: string; query: string; qt: QueryType }> = {
  github: { status: 404, body: '{"message":"Not Found","documentation_url":"https://docs.github.com/rest","status":"404"}', query: 'zq9-nonexistent', qt: 'username' },
  gitlab: { status: 200, body: '[]', query: 'zq9-nonexistent', qt: 'username' },
  codeberg: { status: 404, body: '{"message":"user redirect does not exist [name: zq9]","url":"https://codeberg.org/api/swagger"}', query: 'zq9', qt: 'username' },
  bluesky: { status: 400, body: '{"error":"InvalidRequest","message":"Profile not found"}', query: 'zq9', qt: 'username' },
  'mastodon-social': { status: 404, body: '{"error":"Record not found"}', query: 'zq9', qt: 'username' },
  hackernews: { status: 200, body: 'null', query: 'zq9', qt: 'username' },
  keybase: { status: 200, body: '{"status":{"code":100,"desc":"bad list value","fields":{"usernames":"bad list value"},"name":"INPUT_ERROR"}}', query: 'zq9-x', qt: 'username' },
  devto: { status: 404, body: '{"error":"not found","status":404}', query: 'zq9', qt: 'username' },
  chesscom: { status: 404, body: '{"code":0,"message":"User \\"zq9\\" not found."}', query: 'zq9', qt: 'username' },
  lichess: { status: 404, body: '{"error":"Not found"}', query: 'zq9', qt: 'username' },
  wikipedia: { status: 200, body: '{"batchcomplete":"","query":{"users":[{"name":"Zq9","missing":""}]}}', query: 'zq9', qt: 'username' },
  'shodan-internetdb': { status: 404, body: '{"detail":"No information available"}', query: '192.0.2.1', qt: 'ipv4' },
  ipinfo: { status: 200, body: '{"ip":"10.0.0.1","bogon":true}', query: '10.0.0.1', qt: 'ipv4' },
  wayback: { status: 200, body: '{"url":"zq9.com","archived_snapshots":{}}', query: 'zq9.com', qt: 'domain' },
  certspotter: { status: 200, body: '[]', query: 'zq9.com', qt: 'domain' },
  gravatar: { status: 404, body: '{"error":"Profile not found"}', query: 'nobody@example.org', qt: 'email' },
};

beforeEach(() => {
  resetRateLimits();
  settingsStore.privacy = { ...DEFAULT_PRIVACY, sourceModes: {} };
});

describe('adapters handle recorded "not found" responses as completed with no result', () => {
  for (const [sourceId, fx] of Object.entries(NOT_FOUND)) {
    it(sourceId, async () => {
      setFetchImpl((async () => new Response(fx.body, { status: fx.status, headers: { 'content-type': 'application/json' } })) as typeof fetch);
      const adapter = getAdapter(sourceId)!;
      const out = await adapter.run(fx.query, fx.qt, { signal: new AbortController().signal, manual: true, maxResults: 50 });
      expect(out.status).toBe('completed');
      expect(out.results).toEqual([]);
    });
  }
});

describe('adapters parse recorded positive responses', () => {
  it('Shodan InternetDB', async () => {
    setFetchImpl((async () => new Response(JSON.stringify({ cpes: [], hostnames: ['dns.google'], ip: '8.8.8.8', ports: [53, 443], tags: [], vulns: [] }), { status: 200 })) as typeof fetch);
    const out = await getAdapter('shodan-internetdb')!.run('8.8.8.8', 'ipv4', { signal: new AbortController().signal, manual: true, maxResults: 50 });
    expect(out.results.map((r) => r.value)).toEqual(['53', '443', 'dns.google']);
  });
  it('RIPEstat prefix overview', async () => {
    setFetchImpl((async () => new Response(JSON.stringify({ data: { resource: '8.8.8.0/24', announced: true, asns: [{ asn: 15169, holder: 'GOOGLE - Google LLC' }] } }), { status: 200 })) as typeof fetch);
    const out = await getAdapter('ripestat')!.run('8.8.8.8', 'ipv4', { signal: new AbortController().signal, manual: true, maxResults: 50 });
    expect(out.results.map((r) => r.value)).toEqual(['8.8.8.0/24', 'AS15169 — GOOGLE - Google LLC']);
  });
  it('IPinfo geolocation is low confidence', async () => {
    setFetchImpl((async () => new Response(JSON.stringify({ ip: '8.8.8.8', hostname: 'dns.google', city: 'Mountain View', region: 'California', country: 'US', loc: '37.4056,-122.0775', org: 'AS15169 Google LLC' }), { status: 200 })) as typeof fetch);
    const out = await getAdapter('ipinfo')!.run('8.8.8.8', 'ipv4', { signal: new AbortController().signal, manual: true, maxResults: 50 });
    const loc = out.results.find((r) => r.type === 'location')!;
    expect(loc.confidence).toBe('low');
    expect(loc.data).toMatchObject({ lat: 37.4056, lon: -122.0775 });
  });
  it('Nominatim reverse geocoding', async () => {
    setFetchImpl((async () => new Response(JSON.stringify({ display_name: 'Tour Eiffel, Paris, France', lat: '48.8582', lon: '2.2945', type: 'attraction', osm_type: 'way', osm_id: 5013364 }), { status: 200 })) as typeof fetch);
    const out = await getAdapter('nominatim')!.run('48.8584, 2.2945', 'coordinates', { signal: new AbortController().signal, manual: true, maxResults: 50 });
    expect(out.results[0]).toMatchObject({ type: 'location', value: 'Tour Eiffel, Paris, France', url: 'https://www.openstreetmap.org/way/5013364' });
  });
  it('Keybase declared proofs are flagged unverified', async () => {
    setFetchImpl((async () => new Response(JSON.stringify({ them: [{ basics: { username: 'chris', ctime: 1390000000 }, profile: { full_name: 'Chris' }, proofs_summary: { all: [{ proof_type: 'twitter', nametag: 'chris', service_url: 'https://twitter.com/chris' }] } }] }), { status: 200 })) as typeof fetch);
    const out = await getAdapter('keybase')!.run('chris', 'username', { signal: new AbortController().signal, manual: true, maxResults: 50 });
    expect(out.results).toHaveLength(2);
    expect(out.results[1]).toMatchObject({ kind: 'Self-declared link (twitter)', verification: 'unverified', confidence: 'low' });
  });
});
