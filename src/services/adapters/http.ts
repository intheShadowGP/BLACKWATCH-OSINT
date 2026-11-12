import { getSource } from '@/services/sources/catalog';
import { settingsStore } from '@/services/privacy/store';
import { db } from '@/services/storage/db';
import rdapHosts from '@/config/rdap-hosts.json';
import { nowIso, sleep, uid } from '@/utils/common';

/* ------------------------------------------------------------------ */
/* Typed errors → mapped to source statuses by the automation engine.  */
/* ------------------------------------------------------------------ */

export class SourceDisabledError extends Error {
  name = 'SourceDisabledError';
}
export class HostNotAllowedError extends Error {
  name = 'HostNotAllowedError';
}
export class RateLimitedError extends Error {
  name = 'RateLimitedError';
}
export class UnavailableError extends Error {
  name = 'UnavailableError';
}
export class TimeoutError extends Error {
  name = 'TimeoutError';
}

const RDAP_HOSTS = new Set(rdapHosts.hosts);

export function isHostAllowedFor(sourceId: string, host: string): boolean {
  const src = getSource(sourceId);
  if (!src || src.access !== 'api') return false;
  const h = host.toLowerCase();
  if (src.hosts.includes(h)) return true;
  return sourceId === 'rdap' && RDAP_HOSTS.has(h);
}

/* ------------------------------------------------------------------ */
/* Rate limiting (per source, in memory + persisted log for hourly cap) */
/* ------------------------------------------------------------------ */

const lastCall = new Map<string, number>();
const chains = new Map<string, Promise<void>>();
const hourWindow = new Map<string, number[]>();
const cooldownUntil = new Map<string, number>();

function hourlyCount(sourceId: string): number {
  const cutoff = Date.now() - 3600_000;
  const arr = (hourWindow.get(sourceId) ?? []).filter((t) => t > cutoff);
  hourWindow.set(sourceId, arr);
  return arr.length;
}

/** Serialises calls per source and enforces the minimum interval. */
async function throttle(sourceId: string, minIntervalMs: number, signal?: AbortSignal): Promise<void> {
  const prev = chains.get(sourceId) ?? Promise.resolve();
  let release!: () => void;
  const mine = new Promise<void>((r) => (release = r));
  chains.set(
    sourceId,
    prev.then(() => mine),
  );
  await prev;
  try {
    const wait = (lastCall.get(sourceId) ?? 0) + minIntervalMs - Date.now();
    if (wait > 0) await sleep(wait, signal);
    lastCall.set(sourceId, Date.now());
  } finally {
    release();
  }
}

/** For tests. */
export function resetRateLimits(): void {
  lastCall.clear();
  chains.clear();
  hourWindow.clear();
  cooldownUntil.clear();
}

/**
 * Re-primes the hourly budgets and 429 cooldowns from the persisted request
 * log, so reloading the page does not reset quota protection.
 */
export async function hydrateRateLimits(): Promise<void> {
  const since = new Date(Date.now() - 3600_000).toISOString();
  const recent = await db.requestLog.where('at').above(since).toArray();
  for (const r of recent) {
    if (r.status === 'blocked') continue;
    const t = new Date(r.at).getTime();
    hourWindow.set(r.sourceId, [...(hourWindow.get(r.sourceId) ?? []), t]);
    if (r.status === 429 && t + 60_000 > Date.now()) cooldownUntil.set(r.sourceId, Math.max(cooldownUntil.get(r.sourceId) ?? 0, t + 60_000));
  }
}

export function rateStatus(sourceId: string): { usedLastHour: number; coolingDownUntil?: number } {
  const until = cooldownUntil.get(sourceId);
  return { usedLastHour: hourlyCount(sourceId), coolingDownUntil: until && until > Date.now() ? until : undefined };
}

/* ------------------------------------------------------------------ */
/* externalFetch                                                       */
/* ------------------------------------------------------------------ */

export interface ExternalRequest {
  sourceId: string;
  url: string;
  /** The value being searched, shown in the request log. */
  sentValue: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  headers?: Record<string, string>;
  /** Bypass the "auto" check — set when the analyst explicitly clicked this source. */
  manual?: boolean;
}

export interface ExternalResponse {
  status: number;
  ok: boolean;
  url: string;
  json<T = unknown>(): Promise<T>;
  text(): Promise<string>;
}

/** Allows tests to replace the network. */
export let fetchImpl: typeof fetch = (...args) => globalThis.fetch(...args);
export function setFetchImpl(f: typeof fetch): void {
  fetchImpl = f;
}

export async function externalFetch(req: ExternalRequest): Promise<ExternalResponse> {
  const src = getSource(req.sourceId);
  if (!src) throw new SourceDisabledError(`unknown source ${req.sourceId}`);
  if (!settingsStore.canContact(req.sourceId)) throw new SourceDisabledError(req.sourceId);
  if (!req.manual && !settingsStore.canAutomate(req.sourceId)) throw new SourceDisabledError(`${req.sourceId} (manual only)`);

  let parsed: URL;
  try {
    parsed = new URL(req.url);
  } catch {
    throw new HostNotAllowedError('invalid url');
  }
  if (parsed.protocol !== 'https:' || !isHostAllowedFor(req.sourceId, parsed.host)) {
    await logRequest(req, parsed?.host ?? '?', 'blocked', 0);
    throw new HostNotAllowedError(parsed.host);
  }

  const cd = cooldownUntil.get(req.sourceId);
  if (cd && cd > Date.now()) throw new RateLimitedError(`cooldown until ${new Date(cd).toISOString()}`);
  if (src.maxPerHour > 0 && hourlyCount(req.sourceId) >= src.maxPerHour) {
    throw new RateLimitedError('local hourly budget reached');
  }

  await throttle(req.sourceId, src.minIntervalMs, req.signal);
  hourWindow.set(req.sourceId, [...(hourWindow.get(req.sourceId) ?? []), Date.now()]);

  const timeoutMs = req.timeoutMs ?? settingsStore.limits.timeoutMs;
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort(req.signal?.reason);
  req.signal?.addEventListener('abort', onAbort);
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, timeoutMs);
  const started = performance.now();
  try {
    const res = await fetchImpl(parsed.toString(), {
      method: 'GET',
      headers: { accept: 'application/json', ...(req.headers ?? {}) },
      signal: ctrl.signal,
      credentials: 'omit',
      referrerPolicy: 'strict-origin-when-cross-origin',
      redirect: 'follow',
      cache: 'no-store',
    });
    await logRequest(req, parsed.host, res.status, performance.now() - started);
    if (res.status === 429) {
      const retry = Number(res.headers.get('retry-after'));
      cooldownUntil.set(req.sourceId, Date.now() + (Number.isFinite(retry) && retry > 0 ? retry * 1000 : 60_000));
      throw new RateLimitedError('HTTP 429');
    }
    if (res.status >= 500) throw new UnavailableError(`HTTP ${res.status}`);
    return {
      status: res.status,
      ok: res.ok,
      url: res.url || parsed.toString(),
      json: () => res.json(),
      text: () => res.text(),
    };
  } catch (e) {
    if (e instanceof RateLimitedError || e instanceof UnavailableError) throw e;
    const dur = performance.now() - started;
    if (timedOut) {
      await logRequest(req, parsed.host, 'timeout', dur);
      throw new TimeoutError(`timeout after ${timeoutMs} ms`);
    }
    if (req.signal?.aborted) {
      await logRequest(req, parsed.host, 'aborted', dur);
      throw new DOMException('Aborted', 'AbortError');
    }
    await logRequest(req, parsed.host, 'error', dur);
    // TypeError "Failed to fetch" = network failure, CORS refusal or CSP block.
    throw new UnavailableError(e instanceof Error ? e.message : String(e));
  } finally {
    clearTimeout(timer);
    req.signal?.removeEventListener('abort', onAbort);
  }
}

async function logRequest(req: ExternalRequest, host: string, status: number | 'error' | 'blocked' | 'timeout' | 'aborted', durationMs: number) {
  try {
    await db.requestLog.add({
      id: uid(),
      at: nowIso(),
      sourceId: req.sourceId,
      method: 'GET',
      host,
      sentValue: req.sentValue.slice(0, 500),
      status,
      durationMs: Math.round(durationMs),
    });
    // Keep the log bounded.
    const count = await db.requestLog.count();
    if (count > 5000) {
      const old = await db.requestLog.orderBy('at').limit(count - 5000).primaryKeys();
      await db.requestLog.bulkDelete(old);
    }
  } catch {
    /* logging must never break a lookup */
  }
}
