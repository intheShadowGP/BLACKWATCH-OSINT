import type { QueryType, Result, Run, SourceRunStatus, SourceTask } from '@/types';
import { getSource, SOURCES } from '@/services/sources/catalog';
import { ALTERNATIVES, adaptersFor, getAdapter, manualUrl } from '@/services/adapters/registry';
import { HostNotAllowedError, RateLimitedError, SourceDisabledError, TimeoutError, UnavailableError } from '@/services/adapters/http';
import { withIds } from '@/services/adapters/types';
import { settingsStore } from '@/services/privacy/store';
import { db } from '@/services/storage/db';
import { logActivity } from '@/services/storage/repository';
import { nowIso, uid } from '@/utils/common';
import { normalizeValue } from '@/utils/validation';

/** Sources used only as fallbacks are not selected by default. */
const FALLBACK_ONLY = new Set(['dns-google', 'photon']);

export function defaultSourcesFor(queryType: QueryType): string[] {
  return adaptersFor(queryType)
    .map((a) => a.sourceId)
    .filter((id) => !FALLBACK_ONLY.has(id) && settingsStore.canAutomate(id));
}

export function candidateSourcesFor(queryType: QueryType): string[] {
  return adaptersFor(queryType).map((a) => a.sourceId);
}

/** Link-only sources relevant to a query, with the exact official URL to open. */
export function manualSourcesFor(query: string, queryType: QueryType): Array<{ id: string; name: string; url: string }> {
  return SOURCES.filter((s) => s.access === 'link' && s.queryTypes.includes(queryType) && settingsStore.modeOf(s.id) !== 'off').flatMap((s) => {
    const url = manualUrl(s.id, query, queryType);
    return url ? [{ id: s.id, name: s.name, url }] : [];
  });
}

export function mapError(e: unknown): { status: SourceRunStatus; message: string } {
  if (e instanceof SourceDisabledError) return { status: 'disabled', message: 'disabled by privacy settings' };
  if (e instanceof HostNotAllowedError) return { status: 'unsupported', message: `host not allowed: ${e.message}` };
  if (e instanceof RateLimitedError) return { status: 'rate-limited', message: e.message };
  if (e instanceof TimeoutError) return { status: 'unavailable', message: e.message };
  if (e instanceof UnavailableError) return { status: 'unavailable', message: `network/CORS failure: ${e.message}` };
  if (e instanceof DOMException && e.name === 'AbortError') return { status: 'cancelled', message: 'cancelled' };
  return { status: 'unavailable', message: e instanceof Error ? e.message : String(e) };
}

interface QueuedTask {
  runId: string;
  sourceId: string;
  manual: boolean;
}

type Listener = () => void;

export class AutomationEngine {
  private runs = new Map<string, Run>();
  private controllers = new Map<string, AbortController>(); // key runId:sourceId
  private queue: QueuedTask[] = [];
  private active = 0;
  private listeners = new Set<Listener>();
  private version = 0;

  subscribe = (fn: Listener) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getVersion = () => this.version;

  getRun(id: string): Run | undefined {
    return this.runs.get(id);
  }

  listRuns(): Run[] {
    return [...this.runs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /**
   * Starts a multi-source run. `manual` = the analyst explicitly picked these
   * sources (allows sources in "manual" privacy mode); sources in "off" mode
   * are always refused.
   */
  async start(opts: { query: string; queryType: QueryType; sourceIds: string[]; investigationId?: string; manual?: boolean }): Promise<string> {
    const run: Run = {
      id: uid(),
      investigationId: opts.investigationId,
      query: opts.query.trim(),
      queryType: opts.queryType,
      createdAt: nowIso(),
      tasks: [],
    };
    for (const sourceId of [...new Set(opts.sourceIds)]) {
      run.tasks.push(this.initialTask(sourceId, run.query, run.queryType, !!opts.manual));
    }
    this.runs.set(run.id, run);
    await db.runs.put(structuredClone(run));
    await logActivity('automation.run', `${run.queryType}: ${run.query} → ${run.tasks.map((t) => t.sourceId).join(', ')}`, run.investigationId);
    for (const t of run.tasks) if (t.status === 'queued') this.queue.push({ runId: run.id, sourceId: t.sourceId, manual: !!opts.manual });
    this.finishIfDone(run);
    this.emit();
    this.pump();
    return run.id;
  }

  private initialTask(sourceId: string, query: string, queryType: QueryType, manual: boolean): SourceTask {
    const src = getSource(sourceId);
    if (!src) return { sourceId, status: 'unsupported', resultCount: 0, message: 'unknown source' };
    if (src.access === 'link') {
      return { sourceId, status: 'requires-manual-action', resultCount: 0, manualUrl: manualUrl(sourceId, query, queryType) ?? src.homepage, message: 'not automatable from a browser' };
    }
    const adapter = getAdapter(sourceId);
    if (!adapter || !adapter.queryTypes.includes(queryType)) return { sourceId, status: 'unsupported', resultCount: 0, message: `does not handle ${queryType}` };
    if (!settingsStore.canContact(sourceId) || (!manual && !settingsStore.canAutomate(sourceId))) {
      return { sourceId, status: 'disabled', resultCount: 0, message: settingsStore.privacy.externalEnabled ? 'source disabled or manual-only in privacy settings' : 'external lookups are switched off' };
    }
    return { sourceId, status: 'queued', resultCount: 0 };
  }

  retry(runId: string, sourceId: string): void {
    const run = this.runs.get(runId);
    const task = run?.tasks.find((t) => t.sourceId === sourceId);
    if (!run || !task || task.status === 'running' || task.status === 'queued') return;
    const fresh = this.initialTask(sourceId, run.query, run.queryType, true);
    Object.assign(task, fresh, { resultCount: task.resultCount, startedAt: undefined, finishedAt: undefined, manualUrl: undefined });
    if (fresh.status === 'queued') this.queue.push({ runId, sourceId, manual: true });
    this.emit();
    this.pump();
  }

  cancel(runId: string, sourceId?: string): void {
    const run = this.runs.get(runId);
    if (!run) return;
    for (const t of run.tasks) {
      if (sourceId && t.sourceId !== sourceId) continue;
      if (t.status === 'queued') {
        t.status = 'cancelled';
        t.message = 'cancelled';
        this.queue = this.queue.filter((q) => !(q.runId === runId && q.sourceId === t.sourceId));
      }
      this.controllers.get(`${runId}:${t.sourceId}`)?.abort();
    }
    this.finishIfDone(run);
    this.emit();
  }

  private pump(): void {
    while (this.active < settingsStore.limits.concurrency && this.queue.length) {
      const next = this.queue.shift()!;
      this.active++;
      void this.execute(next).finally(() => {
        this.active--;
        this.pump();
      });
    }
  }

  private async execute({ runId, sourceId, manual }: QueuedTask): Promise<void> {
    const run = this.runs.get(runId);
    const task = run?.tasks.find((t) => t.sourceId === sourceId);
    const adapter = getAdapter(sourceId);
    if (!run || !task || !adapter) return;
    const ctrl = new AbortController();
    this.controllers.set(`${runId}:${sourceId}`, ctrl);
    task.status = 'running';
    task.startedAt = nowIso();
    task.message = undefined;
    this.emit();
    try {
      const out = await adapter.run(run.query, run.queryType, { signal: ctrl.signal, manual, maxResults: settingsStore.limits.maxResultsPerSource });
      const stored = await this.store(run, out.results.slice(0, settingsStore.limits.maxResultsPerSource), sourceId);
      task.status = out.status;
      task.message = out.message;
      task.manualUrl = out.manualUrl;
      task.resultCount += stored;
    } catch (e) {
      const m = mapError(e);
      task.status = m.status;
      task.message = m.message;
      if (m.status === 'unavailable' || m.status === 'rate-limited') this.enqueueFallback(run, sourceId);
    } finally {
      task.finishedAt = nowIso();
      this.controllers.delete(`${runId}:${sourceId}`);
      this.finishIfDone(run);
      await db.runs.put(structuredClone(run));
      this.emit();
    }
  }

  private enqueueFallback(run: Run, failedId: string): void {
    for (const alt of ALTERNATIVES[failedId] ?? []) {
      if (run.tasks.some((t) => t.sourceId === alt)) continue;
      const src = getSource(alt);
      if (!src) continue;
      if (src.access === 'link') {
        run.tasks.push({ sourceId: alt, status: 'requires-manual-action', resultCount: 0, manualUrl: manualUrl(alt, run.query, run.queryType) ?? src.homepage, message: `alternative to ${failedId}`, fallbackFor: failedId });
        continue;
      }
      const t = this.initialTask(alt, run.query, run.queryType, false);
      t.fallbackFor = failedId;
      run.tasks.push(t);
      if (t.status === 'queued') this.queue.push({ runId: run.id, sourceId: alt, manual: false });
    }
    this.pump();
  }

  /** Stores results with run-level deduplication (same type + normalised value + kind). */
  private async store(run: Run, items: Omit<Result, 'id' | 'investigationId' | 'runId' | 'isDemo'>[], _sourceId: string): Promise<number> {
    if (!items.length) return 0;
    const existing = await db.results.where('runId').equals(run.id).toArray();
    const seen = new Set(existing.map((r) => dedupKey(r)));
    const fresh = withIds(items, { runId: run.id, investigationId: run.investigationId }).filter((r) => {
      const k = dedupKey(r);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    if (fresh.length) await db.results.bulkAdd(fresh);
    return fresh.length;
  }

  private finishIfDone(run: Run): void {
    if (run.tasks.every((t) => !['queued', 'running'].includes(t.status))) run.finishedAt = run.finishedAt ?? nowIso();
    else run.finishedAt = undefined;
  }

  private emit(): void {
    this.version++;
    for (const l of this.listeners) l();
  }

  /** Cancels everything and forgets all runs (used by "delete all data"). */
  reset(): void {
    for (const c of this.controllers.values()) c.abort();
    this.controllers.clear();
    this.queue = [];
    this.runs.clear();
    this.emit();
  }

  /** Restores past runs (read-only history) from IndexedDB. */
  async hydrate(): Promise<void> {
    const past = await db.runs.orderBy('createdAt').reverse().limit(50).toArray();
    for (const r of past) {
      if (this.runs.has(r.id)) continue;
      // A run interrupted by closing the tab cannot have continued: say so.
      for (const t of r.tasks) {
        if (t.status === 'queued' || t.status === 'running') {
          t.status = 'cancelled';
          t.message = 'interrupted (page closed or reloaded)';
        }
      }
      this.runs.set(r.id, r);
    }
    this.emit();
  }
}

export function dedupKey(r: Pick<Result, 'type' | 'value' | 'kind'>): string {
  return `${r.type}|${r.kind}|${normalizeValue(r.type, r.value)}`;
}

export const engine = new AutomationEngine();
