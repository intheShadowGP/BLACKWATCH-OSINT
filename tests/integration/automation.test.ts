import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AutomationEngine } from '@/services/automation/engine';
import { externalFetch, HostNotAllowedError, RateLimitedError, resetRateLimits, setFetchImpl, SourceDisabledError } from '@/services/adapters/http';
import { settingsStore, DEFAULT_PRIVACY } from '@/services/privacy/store';
import { db } from '@/services/storage/db';
import { wipeAllData } from '@/services/storage/repository';

type Handler = (url: URL) => { status: number; body: unknown; headers?: Record<string, string> } | 'network-error';
let calls: string[] = [];

function mockNetwork(handler: Handler) {
  calls = [];
  setFetchImpl((async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    calls.push(url.toString());
    const r = handler(url);
    if (r === 'network-error') throw new TypeError('Failed to fetch');
    return new Response(typeof r.body === 'string' ? r.body : JSON.stringify(r.body), { status: r.status, headers: { 'content-type': 'application/json', ...(r.headers ?? {}) } });
  }) as typeof fetch);
}

async function waitFor(engine: AutomationEngine, runId: string) {
  for (let i = 0; i < 200; i++) {
    if (engine.getRun(runId)?.finishedAt) return engine.getRun(runId)!;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('run did not finish');
}

beforeEach(async () => {
  await wipeAllData();
  resetRateLimits();
  settingsStore.privacy = { ...DEFAULT_PRIVACY, sourceModes: {} };
});
afterEach(() => setFetchImpl((...a) => globalThis.fetch(...a)));

describe('automation engine', () => {
  it('runs sources in parallel, normalises results and keeps provenance', async () => {
    mockNetwork((u) => {
      if (u.host === 'api.github.com') return { status: 200, body: { login: 'octo', html_url: 'https://github.com/octo', created_at: '2011-01-25T18:44:36Z' } };
      if (u.host === 'gitlab.com') return { status: 200, body: [] };
      return { status: 404, body: {} };
    });
    const engine = new AutomationEngine();
    const runId = await engine.start({ query: 'octo', queryType: 'username', sourceIds: ['github', 'gitlab'] });
    const run = await waitFor(engine, runId);
    expect(run.tasks.map((t) => t.status)).toEqual(['completed', 'completed']);
    const results = await db.results.where('runId').equals(runId).toArray();
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ sourceId: 'github', type: 'account', value: 'https://github.com/octo', verification: 'public-source', infoDate: '2011-01-25T18:44:36.000Z' });
    expect(await db.requestLog.count()).toBe(2);
  });

  it('marks unavailable sources, keeps other results and auto-tries the fallback', async () => {
    mockNetwork((u) => {
      if (u.host === 'cloudflare-dns.com') return 'network-error';
      if (u.host === 'dns.google') return { status: 200, body: { Status: 0, Answer: [{ name: 'example.com.', type: 1, TTL: 60, data: '192.0.2.10' }] } };
      return { status: 404, body: {} };
    });
    const engine = new AutomationEngine();
    const runId = await engine.start({ query: 'example.com', queryType: 'domain', sourceIds: ['dns-cloudflare'] });
    const run = await waitFor(engine, runId);
    expect(run.tasks.find((t) => t.sourceId === 'dns-cloudflare')!.status).toBe('unavailable');
    const g = run.tasks.find((t) => t.sourceId === 'dns-google')!;
    expect(g.status).toBe('completed');
    expect(g.fallbackFor).toBe('dns-cloudflare');
    // A records were duplicated across 9 queries in the mock; dedup keeps one.
    expect(await db.results.where('runId').equals(runId).count()).toBe(1);
  });

  it('reports rate limiting (HTTP 429) and enters cooldown', async () => {
    mockNetwork(() => ({ status: 429, body: {}, headers: { 'retry-after': '30' } }));
    const engine = new AutomationEngine();
    const runId = await engine.start({ query: 'octo', queryType: 'username', sourceIds: ['github'] });
    const run = await waitFor(engine, runId);
    expect(run.tasks[0].status).toBe('rate-limited');
    await expect(externalFetch({ sourceId: 'github', url: 'https://api.github.com/users/x', sentValue: 'x', manual: true })).rejects.toBeInstanceOf(RateLimitedError);
  });

  it('respects privacy settings: disabled sources and offline mode never hit the network', async () => {
    mockNetwork(() => ({ status: 200, body: {} }));
    settingsStore.privacy = { ...DEFAULT_PRIVACY, sourceModes: { github: 'off', gitlab: 'manual' } };
    const engine = new AutomationEngine();
    const runId = await engine.start({ query: 'octo', queryType: 'username', sourceIds: ['github', 'gitlab'], manual: false });
    const run = await waitFor(engine, runId);
    expect(run.tasks.map((t) => t.status)).toEqual(['disabled', 'disabled']);
    expect(calls).toHaveLength(0);
    settingsStore.privacy = { ...DEFAULT_PRIVACY, externalEnabled: false, sourceModes: {} };
    await expect(externalFetch({ sourceId: 'github', url: 'https://api.github.com/users/x', sentValue: 'x', manual: true })).rejects.toBeInstanceOf(SourceDisabledError);
    expect(calls).toHaveLength(0);
  });

  it('flags link-only sources as requiring manual action with an official URL', async () => {
    mockNetwork(() => ({ status: 200, body: {} }));
    const engine = new AutomationEngine();
    const runId = await engine.start({ query: 'example.com', queryType: 'domain', sourceIds: ['crtsh'] });
    const run = engine.getRun(runId)!;
    expect(run.tasks[0].status).toBe('requires-manual-action');
    expect(run.tasks[0].manualUrl).toBe('https://crt.sh/?q=%25.example.com');
    expect(calls).toHaveLength(0);
  });

  it('cancels queued and running tasks', async () => {
    mockNetwork(() => ({ status: 200, body: null }));
    settingsStore.limits = { ...settingsStore.limits, concurrency: 1 };
    const engine = new AutomationEngine();
    const runId = await engine.start({ query: 'octo', queryType: 'username', sourceIds: ['github', 'gitlab', 'codeberg'] });
    engine.cancel(runId);
    const run = await waitFor(engine, runId);
    expect(run.tasks.filter((t) => t.status === 'cancelled').length).toBeGreaterThanOrEqual(2);
    settingsStore.limits = { ...settingsStore.limits, concurrency: 4 };
  });
});

describe('HTTP layer guards', () => {
  it('refuses hosts that do not belong to the source and non-HTTPS URLs', async () => {
    mockNetwork(() => ({ status: 200, body: {} }));
    await expect(externalFetch({ sourceId: 'github', url: 'https://evil.example/steal', sentValue: 'x', manual: true })).rejects.toBeInstanceOf(HostNotAllowedError);
    await expect(externalFetch({ sourceId: 'github', url: 'http://api.github.com/users/x', sentValue: 'x', manual: true })).rejects.toBeInstanceOf(HostNotAllowedError);
    await expect(externalFetch({ sourceId: 'google', url: 'https://www.google.com/', sentValue: 'x', manual: true })).rejects.toBeInstanceOf(HostNotAllowedError);
    expect(calls).toHaveLength(0);
    const blocked = await db.requestLog.where('sourceId').equals('github').toArray();
    expect(blocked.every((b) => b.status === 'blocked')).toBe(true);
  });

  it('allows RDAP registry hosts from the IANA snapshot only for the rdap source', async () => {
    mockNetwork(() => ({ status: 200, body: {} }));
    await expect(externalFetch({ sourceId: 'rdap', url: 'https://rdap.verisign.com/com/v1/domain/example.com', sentValue: 'x', manual: true })).resolves.toBeDefined();
    await expect(externalFetch({ sourceId: 'github', url: 'https://rdap.verisign.com/com/v1/domain/example.com', sentValue: 'x', manual: true })).rejects.toBeInstanceOf(HostNotAllowedError);
  });
});
