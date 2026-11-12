import { z } from 'zod';

// Zod's JIT probes `new Function`, which the strict CSP (script-src 'self',
// no 'unsafe-eval') blocks and Firefox reports as a violation. Run jitless.
z.config({ jitless: true });

/* ------------------------------------------------------------------ */
/* Shared enumerations                                                 */
/* ------------------------------------------------------------------ */

export const ENTITY_TYPES = [
  'person',
  'username',
  'email',
  'domain',
  'ip',
  'organization',
  'location',
  'image',
  'document',
  'account',
  'event',
  'url',
  'phone',
  'other',
] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

/**
 * How much an item can be trusted. Ordered from strongest to weakest.
 * - verified:       confirmed by the analyst against an identifiable source
 * - public-source:  reported by a public source, not independently confirmed
 * - correlation:    produced by matching data (automatic or manual)
 * - hypothesis:     analyst assumption
 * - unverified:     raw / unchecked
 */
export const VERIFICATION_LEVELS = ['verified', 'public-source', 'correlation', 'hypothesis', 'unverified'] as const;
export type Verification = (typeof VERIFICATION_LEVELS)[number];

export const CONFIDENCE_LEVELS = ['high', 'medium', 'low', 'unknown'] as const;
export type Confidence = (typeof CONFIDENCE_LEVELS)[number];

export const INVESTIGATION_STATUSES = ['open', 'in-progress', 'on-hold', 'closed', 'archived'] as const;
export type InvestigationStatus = (typeof INVESTIGATION_STATUSES)[number];

export const DATE_KINDS = ['occurrence', 'publication', 'discovery', 'collection'] as const;
export type DateKind = (typeof DATE_KINDS)[number];

export const QUERY_TYPES = ['username', 'domain', 'ipv4', 'ipv6', 'email', 'url', 'coordinates', 'keyword'] as const;
export type QueryType = (typeof QUERY_TYPES)[number];

/** Status of a single source execution (prompt §5.3). */
export const SOURCE_RUN_STATUSES = [
  'available',
  'queued',
  'running',
  'completed',
  'partial',
  'rate-limited',
  'unavailable',
  'unsupported',
  'requires-manual-action',
  'disabled',
  'cancelled',
] as const;
export type SourceRunStatus = (typeof SOURCE_RUN_STATUSES)[number];

/* ------------------------------------------------------------------ */
/* Provenance                                                          */
/* ------------------------------------------------------------------ */

export const ProvenanceSchema = z.object({
  /** Source catalogue id, or "manual" / "local-analysis" / "demo". */
  sourceId: z.string().min(1).max(100),
  sourceName: z.string().max(200).optional(),
  url: z.string().max(4000).optional(),
  collectedAt: z.string().max(40),
  note: z.string().max(2000).optional(),
});
export type Provenance = z.infer<typeof ProvenanceSchema>;

/* ------------------------------------------------------------------ */
/* Persistent records                                                  */
/* ------------------------------------------------------------------ */

const id = z.string().min(1).max(64);
const isoDate = z.string().max(40);
const text = (max: number) => z.string().max(max);

export const InvestigationSchema = z.object({
  id,
  name: text(200).min(1),
  description: text(10000).default(''),
  objective: text(10000).default(''),
  status: z.enum(INVESTIGATION_STATUSES),
  createdAt: isoDate,
  updatedAt: isoDate,
  tags: z.array(text(60)).max(50).default([]),
  isDemo: z.boolean().default(false),
});
export type Investigation = z.infer<typeof InvestigationSchema>;

export const EntitySchema = z.object({
  id,
  investigationId: id,
  type: z.enum(ENTITY_TYPES),
  value: text(2000).min(1),
  label: text(300).default(''),
  verification: z.enum(VERIFICATION_LEVELS),
  confidence: z.enum(CONFIDENCE_LEVELS),
  sources: z.array(ProvenanceSchema).max(200).default([]),
  notes: text(20000).default(''),
  tags: z.array(text(60)).max(50).default([]),
  lat: z.number().min(-90).max(90).optional(),
  lon: z.number().min(-180).max(180).optional(),
  createdAt: isoDate,
  updatedAt: isoDate,
});
export type Entity = z.infer<typeof EntitySchema>;

export const RelationSchema = z.object({
  id,
  investigationId: id,
  from: id,
  to: id,
  label: text(200).default(''),
  verification: z.enum(VERIFICATION_LEVELS),
  confidence: z.enum(CONFIDENCE_LEVELS),
  sources: z.array(ProvenanceSchema).max(200).default([]),
  notes: text(20000).default(''),
  /** true when created from an automatic suggestion that the analyst accepted. */
  fromSuggestion: z.boolean().default(false),
  createdAt: isoDate,
  updatedAt: isoDate,
});
export type Relation = z.infer<typeof RelationSchema>;

export const TimelineEventSchema = z.object({
  id,
  investigationId: id,
  title: text(300).min(1),
  description: text(20000).default(''),
  /** ISO 8601 instant (UTC). */
  datetime: isoDate,
  /** IANA timezone in which the event was observed / reported. */
  timezone: text(80).default('UTC'),
  dateKind: z.enum(DATE_KINDS),
  verification: z.enum(VERIFICATION_LEVELS),
  confidence: z.enum(CONFIDENCE_LEVELS),
  sources: z.array(ProvenanceSchema).max(200).default([]),
  entityIds: z.array(id).max(200).default([]),
  lat: z.number().min(-90).max(90).optional(),
  lon: z.number().min(-180).max(180).optional(),
  createdAt: isoDate,
  updatedAt: isoDate,
});
export type TimelineEvent = z.infer<typeof TimelineEventSchema>;

export const NoteSchema = z.object({
  id,
  investigationId: id,
  title: text(300).default(''),
  body: text(100000).default(''),
  createdAt: isoDate,
  updatedAt: isoDate,
});
export type Note = z.infer<typeof NoteSchema>;

/** A normalised result produced by a source adapter (Data Engine format). */
export const ResultSchema = z.object({
  id,
  investigationId: id.optional(),
  runId: id.optional(),
  sourceId: text(100),
  queryType: z.enum(QUERY_TYPES),
  query: text(2000),
  /** Entity type this result describes. */
  type: z.enum(ENTITY_TYPES),
  /** Short human-readable kind, e.g. "DNS A record", "Public profile". */
  kind: text(120),
  value: text(4000),
  url: text(4000).optional(),
  collectedAt: isoDate,
  /** Date carried by the information itself (e.g. account creation), if any. */
  infoDate: isoDate.optional(),
  confidence: z.enum(CONFIDENCE_LEVELS),
  verification: z.enum(VERIFICATION_LEVELS),
  data: z.record(z.string(), z.unknown()).default({}),
  isDemo: z.boolean().default(false),
});
export type Result = z.infer<typeof ResultSchema>;

export const EvidenceSchema = z.object({
  id,
  investigationId: id,
  name: text(500),
  mime: text(200),
  size: z.number().int().nonnegative(),
  sha256: text(64),
  sha1: text(40).optional(),
  notes: text(20000).default(''),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: isoDate,
});
/** Evidence row; the binary itself is stored alongside as a Blob. */
export type Evidence = z.infer<typeof EvidenceSchema> & { blob?: Blob };

export const ActivitySchema = z.object({
  id,
  investigationId: id.optional(),
  at: isoDate,
  action: text(100),
  detail: text(2000).default(''),
});
export type Activity = z.infer<typeof ActivitySchema>;

export interface RequestLogEntry {
  id: string;
  at: string;
  sourceId: string;
  method: string;
  /** Host + path only; the searched value is kept separately so the log can be shown honestly. */
  host: string;
  sentValue: string;
  status: number | 'error' | 'blocked' | 'timeout' | 'aborted';
  durationMs: number;
}

export interface SourceTask {
  sourceId: string;
  status: SourceRunStatus;
  message?: string;
  resultCount: number;
  startedAt?: string;
  finishedAt?: string;
  manualUrl?: string;
  /** Set when this task was added automatically as an alternative to a failed source. */
  fallbackFor?: string;
}

export interface Run {
  id: string;
  investigationId?: string;
  query: string;
  queryType: QueryType;
  createdAt: string;
  finishedAt?: string;
  tasks: SourceTask[];
}

export interface SettingRow {
  key: string;
  value: unknown;
}
