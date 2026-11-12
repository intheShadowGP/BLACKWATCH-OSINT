/** Offset (ms) of `timeZone` from UTC at instant `utcMs`. */
export function tzOffsetMs(utcMs: number, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const p = Object.fromEntries(dtf.formatToParts(new Date(utcMs)).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour) % 24, Number(p.minute), Number(p.second));
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/** Converts a wall-clock "YYYY-MM-DDTHH:mm[:ss]" in `timeZone` to a UTC ISO string. */
export function zonedToUtcIso(local: string, timeZone: string): string | null {
  const m = local.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  if (!isValidTimeZone(timeZone)) return null;
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0));
  let ts = guess - tzOffsetMs(guess, timeZone);
  ts = guess - tzOffsetMs(ts, timeZone);
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Formats a UTC instant as wall-clock "YYYY-MM-DDTHH:mm" in `timeZone` (for datetime-local inputs). */
export function utcToZonedLocal(iso: string, timeZone: string): string {
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms) || !isValidTimeZone(timeZone)) return '';
  const d = new Date(ms + tzOffsetMs(ms, timeZone));
  return d.toISOString().slice(0, 16);
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function listTimeZones(): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (k: string) => string[] };
  const z = intl.supportedValuesOf?.('timeZone') ?? [];
  return z.includes('UTC') ? z : ['UTC', ...z];
}

export function formatOffset(iso: string, timeZone: string): string {
  if (!isValidTimeZone(timeZone)) return '';
  const off = tzOffsetMs(new Date(iso).getTime(), timeZone) / 60000;
  const sign = off >= 0 ? '+' : '-';
  const a = Math.abs(off);
  return `UTC${sign}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`;
}

/** Events considered duplicates: same minute and same normalised title, or same minute and overlapping entities. */
export function findDuplicateEvents<T extends { id: string; title: string; datetime: string; entityIds: string[] }>(events: T[]): Array<[T, T]> {
  const out: Array<[T, T]> = [];
  const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  for (let i = 0; i < events.length; i++) {
    for (let j = i + 1; j < events.length; j++) {
      const a = events[i];
      const b = events[j];
      const sameMinute = Math.abs(new Date(a.datetime).getTime() - new Date(b.datetime).getTime()) < 60_000;
      if (!sameMinute) continue;
      if (norm(a.title) === norm(b.title) || (a.entityIds.length && a.entityIds.some((x) => b.entityIds.includes(x)) && a.entityIds.length === b.entityIds.length)) out.push([a, b]);
    }
  }
  return out;
}
