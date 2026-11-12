import { SOURCES, type SourceMode } from '@/services/sources/catalog';
import { getSetting, setSetting } from '@/services/storage/repository';

/**
 * Controlled Privacy settings. Kept in memory for synchronous checks by the
 * HTTP layer, persisted to IndexedDB.
 */
export interface PrivacySettings {
  /** Master switch: when false, no request leaves the browser (offline / local-only mode). */
  externalEnabled: boolean;
  /** Per-source mode; missing entries fall back to the catalogue default. */
  sourceModes: Record<string, SourceMode>;
  /** Show a confirmation before an automated multi-source run. */
  confirmBeforeRun: boolean;
  /** Load OSM tiles on the map. */
  mapTiles: boolean;
}

export interface RuntimeLimits {
  concurrency: number;
  timeoutMs: number;
  maxFileSizeMb: number;
  maxResultsPerSource: number;
}

export const DEFAULT_PRIVACY: PrivacySettings = {
  externalEnabled: true,
  sourceModes: {},
  confirmBeforeRun: true,
  mapTiles: true,
};

export const DEFAULT_LIMITS: RuntimeLimits = {
  concurrency: 4,
  timeoutMs: 15000,
  maxFileSizeMb: 50,
  maxResultsPerSource: 200,
};

type Listener = () => void;

class SettingsStore {
  privacy: PrivacySettings = { ...DEFAULT_PRIVACY };
  limits: RuntimeLimits = { ...DEFAULT_LIMITS };
  private listeners = new Set<Listener>();
  private version = 0;

  async load(): Promise<void> {
    const p = await getSetting<Partial<PrivacySettings>>('privacy', {});
    const l = await getSetting<Partial<RuntimeLimits>>('limits', {});
    this.privacy = { ...DEFAULT_PRIVACY, ...p, sourceModes: { ...(p.sourceModes ?? {}) } };
    this.limits = sanitizeLimits({ ...DEFAULT_LIMITS, ...l });
    this.emit();
  }

  modeOf(sourceId: string): SourceMode {
    const src = SOURCES.find((s) => s.id === sourceId);
    if (!src) return 'off';
    return this.privacy.sourceModes[sourceId] ?? src.defaultMode;
  }

  /** Whether a source may be contacted at all (manual click included). */
  canContact(sourceId: string): boolean {
    return this.privacy.externalEnabled && this.modeOf(sourceId) !== 'off';
  }

  /** Whether a source may run inside an automated multi-source search. */
  canAutomate(sourceId: string): boolean {
    return this.privacy.externalEnabled && this.modeOf(sourceId) === 'auto';
  }

  async setPrivacy(patch: Partial<PrivacySettings>): Promise<void> {
    // Apply immediately (UI + HTTP guard), then persist.
    this.privacy = { ...this.privacy, ...patch };
    this.emit();
    await setSetting('privacy', this.privacy);
  }

  async setSourceMode(sourceId: string, mode: SourceMode): Promise<void> {
    await this.setPrivacy({ sourceModes: { ...this.privacy.sourceModes, [sourceId]: mode } });
  }

  async setLimits(patch: Partial<RuntimeLimits>): Promise<void> {
    this.limits = sanitizeLimits({ ...this.limits, ...patch });
    this.emit();
    await setSetting('limits', this.limits);
  }

  subscribe = (fn: Listener): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getVersion = (): number => this.version;

  private emit(): void {
    this.version++;
    for (const l of this.listeners) l();
  }
}

export function sanitizeLimits(l: RuntimeLimits): RuntimeLimits {
  const clamp = (v: unknown, min: number, max: number, d: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : d;
  };
  return {
    concurrency: clamp(l.concurrency, 1, 8, DEFAULT_LIMITS.concurrency),
    timeoutMs: clamp(l.timeoutMs, 3000, 60000, DEFAULT_LIMITS.timeoutMs),
    maxFileSizeMb: clamp(l.maxFileSizeMb, 1, 500, DEFAULT_LIMITS.maxFileSizeMb),
    maxResultsPerSource: clamp(l.maxResultsPerSource, 10, 2000, DEFAULT_LIMITS.maxResultsPerSource),
  };
}

export const settingsStore = new SettingsStore();
