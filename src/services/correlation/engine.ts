import type { Entity, Relation, Result, TimelineEvent } from '@/types';
import { normalizeValue } from '@/utils/validation';

/**
 * Correlation engine — pure functions, executed in a Web Worker.
 * Every output is a SUGGESTION. Nothing here creates relations or changes a
 * verification level: the analyst accepts or ignores each suggestion.
 */
export type SuggestionKind = 'relation' | 'duplicate' | 'inconsistency' | 'lead';
export type Strength = 'exact' | 'partial';

export interface Suggestion {
  /** Deterministic key so dismissed suggestions stay dismissed. */
  key: string;
  kind: SuggestionKind;
  strength: Strength;
  fromId?: string;
  toId?: string;
  label: string;
  /** i18n code for the reason + parameters. */
  reason: string;
  params: Record<string, string>;
}

export interface CorrelationInput {
  entities: Entity[];
  relations: Relation[];
  results: Pick<Result, 'sourceId' | 'query' | 'queryType' | 'type' | 'kind' | 'value'>[];
  events: Pick<TimelineEvent, 'id' | 'title' | 'datetime'>[];
}

export function levenshtein(a: string, b: string, max = 3): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev = new Array(b.length + 1).fill(0).map((_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur.push(v);
      rowMin = Math.min(rowMin, v);
    }
    if (rowMin > max) return max + 1;
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j];
    cur = [];
  }
  return prev[b.length];
}

/** Handle "skeleton": lower-case, separators and trailing digits removed. */
export function handleSkeleton(s: string): string {
  return s.toLowerCase().replace(/^@/, '').replace(/[._\-\s]/g, '').replace(/\d+$/, '');
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function correlate(input: CorrelationInput): Suggestion[] {
  const { entities, relations } = input;
  const out: Suggestion[] = [];
  const linked = new Set(relations.map((r) => pairKey(r.from, r.to)));
  const push = (s: Suggestion) => {
    if (s.fromId && s.toId && (s.kind === 'relation' || s.kind === 'duplicate') && linked.has(pairKey(s.fromId, s.toId))) return;
    if (!out.some((o) => o.key === s.key)) out.push(s);
  };
  const byType = (t: Entity['type']) => entities.filter((e) => e.type === t);
  const usernames = byType('username');
  const emails = byType('email');
  const domains = byType('domain');
  const ips = byType('ip');
  const accounts = byType('account');
  const urls = byType('url');

  /* ---------------------------- duplicates ---------------------------- */
  for (let i = 0; i < entities.length; i++) {
    for (let j = i + 1; j < entities.length; j++) {
      const a = entities[i];
      const b = entities[j];
      if (a.type !== b.type) continue;
      const na = normalizeValue(a.type, a.value);
      const nb = normalizeValue(b.type, b.value);
      if (na === nb) {
        push({ key: `dup:${pairKey(a.id, b.id)}`, kind: 'duplicate', strength: 'exact', fromId: a.id, toId: b.id, label: 'duplicate', reason: 'dup-exact', params: { a: a.value, b: b.value } });
      } else if ((a.type === 'username' || a.type === 'person' || a.type === 'organization') && na.length >= 4 && levenshtein(na, nb, 1) <= 1) {
        push({ key: `dup~:${pairKey(a.id, b.id)}`, kind: 'duplicate', strength: 'partial', fromId: a.id, toId: b.id, label: 'possible duplicate', reason: 'dup-near', params: { a: a.value, b: b.value } });
      }
    }
  }

  /* ---------------------- exact cross-type matches ---------------------- */
  for (const em of emails) {
    const at = em.value.lastIndexOf('@');
    const local = em.value.slice(0, at).toLowerCase().replace(/\+.*$/, '');
    const domain = em.value.slice(at + 1).toLowerCase();
    for (const u of usernames) {
      const un = normalizeValue('username', u.value);
      if (un === local) push({ key: `rel:email-user:${pairKey(em.id, u.id)}`, kind: 'relation', strength: 'exact', fromId: em.id, toId: u.id, label: 'same identifier', reason: 'email-local-eq-username', params: { email: em.value, username: u.value } });
      else if (handleSkeleton(un) && handleSkeleton(un) === handleSkeleton(local))
        push({ key: `rel:email-user~:${pairKey(em.id, u.id)}`, kind: 'relation', strength: 'partial', fromId: em.id, toId: u.id, label: 'similar identifier', reason: 'email-local-similar-username', params: { email: em.value, username: u.value } });
    }
    for (const d of domains) {
      const dn = normalizeValue('domain', d.value);
      if (dn === domain) push({ key: `rel:email-domain:${pairKey(em.id, d.id)}`, kind: 'relation', strength: 'exact', fromId: em.id, toId: d.id, label: 'hosted on', reason: 'email-domain', params: { email: em.value, domain: d.value } });
    }
  }

  for (const acc of [...accounts, ...urls]) {
    const host = hostOf(acc.value);
    let path = '';
    try {
      path = decodeURIComponent(new URL(acc.value).pathname + new URL(acc.value).search).toLowerCase();
    } catch {
      /* not a URL */
    }
    for (const u of usernames) {
      const un = normalizeValue('username', u.value);
      if (un.length >= 3 && path && new RegExp(`(^|[/@=:])${un.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[/?&#])`).test(path)) {
        push({ key: `rel:acc-user:${pairKey(acc.id, u.id)}`, kind: 'relation', strength: 'exact', fromId: u.id, toId: acc.id, label: 'handle used by', reason: 'account-contains-username', params: { account: acc.value, username: u.value } });
      }
    }
    if (host) {
      for (const d of domains) {
        const dn = normalizeValue('domain', d.value);
        if (host === dn || host.endsWith('.' + dn)) push({ key: `rel:url-domain:${pairKey(acc.id, d.id)}`, kind: 'relation', strength: 'exact', fromId: acc.id, toId: d.id, label: 'hosted on', reason: 'url-host-domain', params: { url: acc.value, domain: d.value } });
      }
    }
  }

  // Sub-domain ↔ parent domain
  for (const a of domains) {
    for (const b of domains) {
      if (a.id === b.id) continue;
      const na = normalizeValue('domain', a.value);
      const nb = normalizeValue('domain', b.value);
      if (na.endsWith('.' + nb)) push({ key: `rel:subdomain:${pairKey(a.id, b.id)}`, kind: 'relation', strength: 'exact', fromId: a.id, toId: b.id, label: 'sub-domain of', reason: 'subdomain', params: { sub: a.value, parent: b.value } });
    }
  }

  // DNS resolution evidence from collected results
  const dnsPairs = input.results.filter((r) => r.queryType === 'domain' && r.type === 'ip' && /^DNS (A|AAAA)/.test(r.kind));
  for (const r of dnsPairs) {
    const d = domains.find((x) => normalizeValue('domain', x.value) === normalizeValue('domain', r.query));
    const ip = ips.find((x) => x.value.toLowerCase() === r.value.toLowerCase());
    if (d && ip) push({ key: `rel:resolves:${pairKey(d.id, ip.id)}`, kind: 'relation', strength: 'exact', fromId: d.id, toId: ip.id, label: 'resolves to', reason: 'dns-resolves', params: { domain: d.value, ip: ip.value, source: r.sourceId } });
  }
  const ptrPairs = input.results.filter((r) => (r.queryType === 'ipv4' || r.queryType === 'ipv6') && r.type === 'domain');
  for (const r of ptrPairs) {
    const ip = ips.find((x) => x.value.toLowerCase() === r.query.toLowerCase());
    const d = domains.find((x) => normalizeValue('domain', x.value) === normalizeValue('domain', r.value));
    if (d && ip) push({ key: `rel:ptr:${pairKey(d.id, ip.id)}`, kind: 'relation', strength: 'exact', fromId: ip.id, toId: d.id, label: 'reverse DNS', reason: 'ip-hostname', params: { domain: d.value, ip: ip.value, source: r.sourceId } });
  }

  // Similar handles (partial)
  for (let i = 0; i < usernames.length; i++) {
    for (let j = i + 1; j < usernames.length; j++) {
      const a = usernames[i];
      const b = usernames[j];
      const sa = handleSkeleton(a.value);
      const sb = handleSkeleton(b.value);
      if (sa.length >= 4 && sa === sb && normalizeValue('username', a.value) !== normalizeValue('username', b.value)) {
        push({ key: `rel:handle~:${pairKey(a.id, b.id)}`, kind: 'relation', strength: 'partial', fromId: a.id, toId: b.id, label: 'similar handle', reason: 'similar-handles', params: { a: a.value, b: b.value } });
      }
    }
  }

  /* -------------------------- inconsistencies -------------------------- */
  for (const e of entities) {
    if (e.verification === 'verified' && e.sources.length === 0) {
      push({ key: `inc:nosource:${e.id}`, kind: 'inconsistency', strength: 'exact', fromId: e.id, label: 'verified without source', reason: 'verified-no-source', params: { value: e.value } });
    }
  }
  const entById = new Map(entities.map((e) => [e.id, e]));
  for (const r of relations) {
    const a = entById.get(r.from);
    const b = entById.get(r.to);
    if (r.verification === 'verified' && (a?.verification === 'hypothesis' || b?.verification === 'hypothesis')) {
      push({ key: `inc:relhyp:${r.id}`, kind: 'inconsistency', strength: 'exact', fromId: r.from, toId: r.to, label: 'verified relation on hypothesis', reason: 'relation-verified-on-hypothesis', params: { a: a?.value ?? '?', b: b?.value ?? '?' } });
    }
  }
  const byTitle = new Map<string, Array<Pick<TimelineEvent, 'id' | 'title' | 'datetime'>>>();
  for (const ev of input.events) {
    const k = ev.title.trim().toLowerCase();
    byTitle.set(k, [...(byTitle.get(k) ?? []), ev]);
  }
  for (const [, evs] of byTitle) {
    const dates = new Set(evs.map((e) => e.datetime.slice(0, 16)));
    if (evs.length > 1 && dates.size > 1) {
      push({ key: `inc:dates:${evs.map((e) => e.id).sort().join(',')}`, kind: 'inconsistency', strength: 'partial', label: 'conflicting dates', reason: 'event-conflicting-dates', params: { title: evs[0].title, count: String(evs.length) } });
    }
  }

  /* -------------------------------- leads -------------------------------- */
  const queried = new Set(input.results.map((r) => `${r.queryType}|${r.query.toLowerCase()}`));
  for (const u of usernames) if (!queried.has(`username|${normalizeValue('username', u.value)}`) && !queried.has(`username|${u.value.toLowerCase()}`)) push({ key: `lead:user:${u.id}`, kind: 'lead', strength: 'partial', fromId: u.id, label: 'username', reason: 'lead-username', params: { value: u.value } });
  for (const d of domains) if (!queried.has(`domain|${d.value.toLowerCase()}`)) push({ key: `lead:domain:${d.id}`, kind: 'lead', strength: 'partial', fromId: d.id, label: 'domain', reason: 'lead-domain', params: { value: d.value } });
  for (const ip of ips) if (!queried.has(`ipv4|${ip.value.toLowerCase()}`) && !queried.has(`ipv6|${ip.value.toLowerCase()}`)) push({ key: `lead:ip:${ip.id}`, kind: 'lead', strength: 'partial', fromId: ip.id, label: 'ip', reason: 'lead-ip', params: { value: ip.value } });
  for (const em of emails) if (!queried.has(`email|${em.value.toLowerCase()}`)) push({ key: `lead:email:${em.id}`, kind: 'lead', strength: 'partial', fromId: em.id, label: 'email', reason: 'lead-email', params: { value: em.value } });
  for (const em of emails) {
    const local = em.value.slice(0, em.value.lastIndexOf('@')).replace(/\+.*$/, '');
    if (local.length >= 3 && !usernames.some((u) => normalizeValue('username', u.value) === local.toLowerCase())) {
      push({ key: `lead:local:${em.id}`, kind: 'lead', strength: 'partial', fromId: em.id, label: 'pivot', reason: 'lead-email-local-pivot', params: { value: local } });
    }
  }

  return out;
}
