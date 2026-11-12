import type { Confidence, EntityType, QueryType, Result, SourceRunStatus, Verification } from '@/types';
import { nowIso, uid } from '@/utils/common';

export interface AdapterContext {
  signal: AbortSignal;
  /** True when the analyst explicitly launched this single source. */
  manual: boolean;
  maxResults: number;
}

export type AdapterResultItem = Omit<Result, 'id' | 'investigationId' | 'runId' | 'isDemo'>;

export interface AdapterOutput {
  status: Extract<SourceRunStatus, 'completed' | 'partial' | 'requires-manual-action' | 'unsupported'>;
  results: AdapterResultItem[];
  message?: string;
  /** When automation is impossible, the official page the analyst should open. */
  manualUrl?: string;
}

export interface SourceAdapter {
  sourceId: string;
  queryTypes: QueryType[];
  run(query: string, queryType: QueryType, ctx: AdapterContext): Promise<AdapterOutput>;
}

export function mkResult(r: {
  sourceId: string;
  queryType: QueryType;
  query: string;
  type: EntityType;
  kind: string;
  value: string;
  url?: string;
  infoDate?: string;
  confidence?: Confidence;
  verification?: Verification;
  data?: Record<string, unknown>;
}): AdapterResultItem {
  return {
    sourceId: r.sourceId,
    queryType: r.queryType,
    query: r.query,
    type: r.type,
    kind: r.kind.slice(0, 120),
    value: String(r.value).slice(0, 4000),
    url: r.url,
    collectedAt: nowIso(),
    infoDate: normaliseDate(r.infoDate),
    confidence: r.confidence ?? 'medium',
    // Data reported by a public source is never "verified" automatically.
    verification: r.verification ?? 'public-source',
    data: r.data ?? {},
  };
}

export function normaliseDate(d: unknown): string | undefined {
  if (d === undefined || d === null || d === '') return undefined;
  const date = typeof d === 'number' ? new Date(d < 1e12 ? d * 1000 : d) : new Date(String(d));
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export function withIds(items: AdapterResultItem[], extra: { investigationId?: string; runId?: string }): Result[] {
  return items.map((i) => ({ ...i, id: uid(), ...extra, isDemo: false }));
}

/** Picks string fields safely from untrusted JSON. */
export function str(v: unknown, max = 2000): string | undefined {
  if (typeof v === 'string') return v.slice(0, max);
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return undefined;
}

export function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

export function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

export function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
