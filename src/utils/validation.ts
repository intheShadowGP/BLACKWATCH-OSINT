import type { QueryType } from '@/types';

/* ------------------------------------------------------------------ */
/* Primitive validators — all pure, all tested.                        */
/* ------------------------------------------------------------------ */

const IPV4_RE = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

export function isIPv4(v: string): boolean {
  return IPV4_RE.test(v.trim());
}

export function isIPv6(v: string): boolean {
  const s = v.trim();
  if (!s.includes(':') || s.length > 45) return false;
  if (!/^[0-9a-fA-F:.]+$/.test(s)) return false;
  // Embedded IPv4 tail (e.g. ::ffff:1.2.3.4)
  let head = s;
  let extraGroups = 0;
  const lastColon = s.lastIndexOf(':');
  const tail = s.slice(lastColon + 1);
  if (tail.includes('.')) {
    if (!isIPv4(tail)) return false;
    head = s.slice(0, lastColon + 1) + '0:0';
    extraGroups = 0;
  }
  const dbl = head.split('::');
  if (dbl.length > 2) return false;
  const groups = (part: string) => (part === '' ? [] : part.split(':'));
  const left = groups(dbl[0]);
  const right = dbl.length === 2 ? groups(dbl[1]) : [];
  const all = [...left, ...right];
  if (!all.every((g) => /^[0-9a-fA-F]{1,4}$/.test(g))) return false;
  const count = all.length + extraGroups;
  return dbl.length === 2 ? count < 8 : count === 8;
}

/** Hostname per RFC 1123 with at least one dot and an alphabetic TLD (or punycode). */
export function isDomain(v: string): boolean {
  const s = v.trim().toLowerCase().replace(/\.$/, '');
  if (s.length < 3 || s.length > 253) return false;
  const labels = s.split('.');
  if (labels.length < 2) return false;
  const tld = labels[labels.length - 1];
  if (!/^([a-z]{2,63}|xn--[a-z0-9-]{1,59})$/.test(tld)) return false;
  return labels.every((l) => /^(?!-)[a-z0-9-]{1,63}(?<!-)$/.test(l));
}

/** Pragmatic e-mail syntax check (RFC 5322 subset used by real mail systems). */
export function isEmail(v: string): boolean {
  const s = v.trim();
  if (s.length > 254) return false;
  const at = s.lastIndexOf('@');
  if (at < 1) return false;
  const local = s.slice(0, at);
  const domain = s.slice(at + 1);
  if (local.length > 64) return false;
  if (!/^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/.test(local)) return false;
  return isDomain(domain);
}

export interface EmailCheck {
  valid: boolean;
  local: string;
  domain: string;
  issues: string[];
}

export function analyzeEmailSyntax(v: string): EmailCheck {
  const s = v.trim();
  const at = s.lastIndexOf('@');
  const local = at > 0 ? s.slice(0, at) : s;
  const domain = at > 0 ? s.slice(at + 1).toLowerCase() : '';
  const issues: string[] = [];
  if (at < 1) issues.push('missing-at');
  if (s.length > 254) issues.push('too-long');
  if (local.length > 64) issues.push('local-too-long');
  if (local.startsWith('.') || local.endsWith('.') || local.includes('..')) issues.push('bad-dots');
  if (/\s/.test(s)) issues.push('whitespace');
  if (at > 0 && !isDomain(domain)) issues.push('bad-domain');
  if (local.includes('+')) issues.push('plus-addressing');
  return { valid: isEmail(s), local, domain, issues };
}

export const USERNAME_RE = /^[A-Za-z0-9._-]{1,64}$/;
export function isUsername(v: string): boolean {
  return USERNAME_RE.test(v.trim());
}

export interface Coordinates {
  lat: number;
  lon: number;
}

/** Parses "lat, lon" decimal or DMS (48°51'29.6"N 2°17'40.2"E). */
export function parseCoordinates(input: string): Coordinates | null {
  const s = input.trim();
  const dec = s.match(/^(-?\d{1,2}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (dec) {
    const lat = Number(dec[1]);
    const lon = Number(dec[2]);
    return validCoords(lat, lon);
  }
  const dmsRe = /(\d{1,3})\s*[°º]\s*(?:(\d{1,2}(?:\.\d+)?)\s*['′])?\s*(?:(\d{1,2}(?:\.\d+)?)\s*(?:"|″|''))?\s*([NSEWnsew])/g;
  const parts = [...s.matchAll(dmsRe)];
  if (parts.length === 2) {
    const toDec = (m: RegExpMatchArray) => {
      const d = Number(m[1]) + Number(m[2] ?? 0) / 60 + Number(m[3] ?? 0) / 3600;
      return /[SWsw]/.test(m[4]) ? -d : d;
    };
    const a = parts[0];
    const b = parts[1];
    const aIsLat = /[NSns]/.test(a[4]);
    const bIsLat = /[NSns]/.test(b[4]);
    if (aIsLat === bIsLat) return null;
    const lat = aIsLat ? toDec(a) : toDec(b);
    const lon = aIsLat ? toDec(b) : toDec(a);
    return validCoords(lat, lon);
  }
  return null;
}

function validCoords(lat: number, lon: number): Coordinates | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { lat, lon };
}

export function toDMS(value: number, isLat: boolean): string {
  const hemi = isLat ? (value >= 0 ? 'N' : 'S') : value >= 0 ? 'E' : 'W';
  const abs = Math.abs(value);
  const d = Math.floor(abs);
  const mFloat = (abs - d) * 60;
  const m = Math.floor(mFloat);
  const sec = ((mFloat - m) * 60).toFixed(2);
  return `${d}°${m}'${sec}"${hemi}`;
}

/* ------------------------------------------------------------------ */
/* URL safety                                                          */
/* ------------------------------------------------------------------ */

const SAFE_PROTOCOLS = new Set(['http:', 'https:']);

/** Returns a normalised http(s) URL string, or null for anything else (javascript:, data:, file:, …). */
export function safeUrl(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (s.length > 4000) return null;
  // Reject control characters that browsers strip silently (e.g. "java\tscript:")
  if (/[\u0000-\u001F\u007F]/.test(s)) return null;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (!SAFE_PROTOCOLS.has(u.protocol)) return null;
  if (u.username || u.password) return null;
  return u.toString();
}

export function isUrl(v: string): boolean {
  return safeUrl(v) !== null && /^https?:\/\//i.test(v.trim());
}

/* ------------------------------------------------------------------ */
/* Global search: query type detection                                 */
/* ------------------------------------------------------------------ */

export function detectQueryType(raw: string): QueryType | null {
  const s = raw.trim();
  if (!s) return null;
  if (isUrl(s)) return 'url';
  if (isEmail(s)) return 'email';
  if (isIPv4(s)) return 'ipv4';
  if (isIPv6(s)) return 'ipv6';
  if (parseCoordinates(s)) return 'coordinates';
  if (isDomain(s) && !/^\d+(\.\d+)+$/.test(s)) return 'domain';
  if (isUsername(s.replace(/^@/, '')) && !/\s/.test(s)) return 'username';
  return 'keyword';
}

/** Modules that make sense for a query type (prompt §12). */
export const MODULES_FOR_QUERY: Record<QueryType, string[]> = {
  username: ['username', 'socmint', 'search', 'graph', 'investigations'],
  domain: ['domain', 'search', 'email', 'graph', 'investigations'],
  ipv4: ['domain', 'search', 'graph', 'investigations'],
  ipv6: ['domain', 'search', 'graph', 'investigations'],
  email: ['email', 'search', 'username', 'graph', 'investigations'],
  url: ['socmint', 'domain', 'search', 'investigations'],
  coordinates: ['geoint', 'timeline', 'investigations'],
  keyword: ['search', 'socmint', 'geoint', 'investigations'],
};

/* ------------------------------------------------------------------ */
/* Misc                                                                */
/* ------------------------------------------------------------------ */

export function normalizeValue(type: string, value: string): string {
  const v = value.trim();
  switch (type) {
    case 'domain':
      return v.toLowerCase().replace(/\.$/, '').replace(/^www\./, '');
    case 'email':
      return v.toLowerCase();
    case 'username':
      return v.replace(/^@/, '').toLowerCase();
    case 'url':
      try {
        const u = new URL(v);
        u.hash = '';
        return u.toString().replace(/\/$/, '').toLowerCase();
      } catch {
        return v.toLowerCase();
      }
    case 'ip':
      return v.toLowerCase();
    default:
      return v.toLowerCase().replace(/\s+/g, ' ');
  }
}

export function clampText(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}
