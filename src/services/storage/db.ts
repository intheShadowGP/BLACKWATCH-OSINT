import Dexie, { type EntityTable } from 'dexie';
import type {
  Activity,
  Entity,
  Evidence,
  Investigation,
  Note,
  Relation,
  RequestLogEntry,
  Result,
  Run,
  SettingRow,
  TimelineEvent,
} from '@/types';

/**
 * Local IndexedDB database. Everything an analyst produces stays here unless
 * they explicitly export it. Tables that belong to an investigation are
 * indexed by `investigationId` so investigations stay isolated.
 */
export class BlackwatchDB extends Dexie {
  investigations!: EntityTable<Investigation, 'id'>;
  entities!: EntityTable<Entity, 'id'>;
  relations!: EntityTable<Relation, 'id'>;
  events!: EntityTable<TimelineEvent, 'id'>;
  notes!: EntityTable<Note, 'id'>;
  evidence!: EntityTable<Evidence, 'id'>;
  results!: EntityTable<Result, 'id'>;
  activity!: EntityTable<Activity, 'id'>;
  requestLog!: EntityTable<RequestLogEntry, 'id'>;
  runs!: EntityTable<Run, 'id'>;
  settings!: EntityTable<SettingRow, 'key'>;

  constructor(name = 'blackwatch-osint') {
    super(name);
    this.version(1).stores({
      investigations: 'id, status, updatedAt, isDemo',
      entities: 'id, investigationId, type, [investigationId+type], value, updatedAt',
      relations: 'id, investigationId, from, to',
      events: 'id, investigationId, datetime',
      notes: 'id, investigationId, updatedAt',
      evidence: 'id, investigationId, sha256',
      results: 'id, investigationId, runId, sourceId, collectedAt',
      activity: 'id, investigationId, at',
      requestLog: 'id, at, sourceId',
      runs: 'id, investigationId, createdAt',
      settings: 'key',
    });
  }
}

export const db = new BlackwatchDB();

/** Tables scoped to a single investigation (used by delete / export). */
export const INVESTIGATION_TABLES = ['entities', 'relations', 'events', 'notes', 'evidence', 'results', 'activity', 'runs'] as const;
export type InvestigationTable = (typeof INVESTIGATION_TABLES)[number];

export class StorageError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'StorageError';
  }
}

/** Wraps a Dexie operation and converts quota / unavailability errors into readable messages. */
export async function guarded<T>(op: () => Promise<T>): Promise<T> {
  try {
    return await op();
  } catch (e) {
    const name = (e as { name?: string })?.name ?? '';
    if (name === 'QuotaExceededError' || /quota/i.test(String(e))) {
      throw new StorageError('storage-quota', e);
    }
    if (name === 'MissingAPIError' || name === 'InvalidStateError') {
      throw new StorageError('storage-unavailable', e);
    }
    throw e;
  }
}
