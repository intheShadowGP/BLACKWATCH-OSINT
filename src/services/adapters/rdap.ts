import type { QueryType } from '@/types';
import { externalFetch, isHostAllowedFor } from './http';
import { arr, mkResult, obj, str, type AdapterContext, type AdapterOutput, type AdapterResultItem, type SourceAdapter } from './types';

let bootstrapCache: { at: number; services: Array<[string[], string[]]> } | null = null;

export function icannLookupUrl(q: string): string {
  return `https://lookup.icann.org/en/lookup?name=${encodeURIComponent(q)}`;
}

async function domainBootstrap(ctx: AdapterContext): Promise<Array<[string[], string[]]>> {
  if (bootstrapCache && Date.now() - bootstrapCache.at < 24 * 3600_000) return bootstrapCache.services;
  const res = await externalFetch({ sourceId: 'rdap', url: 'https://data.iana.org/rdap/dns.json', sentValue: '(IANA bootstrap file)', signal: ctx.signal, manual: ctx.manual });
  const json = obj(await res.json());
  const services = arr(json.services).filter((s): s is [string[], string[]] => Array.isArray(s) && s.length === 2);
  bootstrapCache = { at: Date.now(), services };
  return services;
}

export function findRdapBase(services: Array<[string[], string[]]>, domain: string): string | null {
  const labels = domain.toLowerCase().split('.');
  // Longest matching suffix wins (bootstrap entries may be multi-label).
  for (let i = 0; i < labels.length; i++) {
    const suffix = labels.slice(i).join('.');
    const svc = services.find(([tlds]) => tlds.includes(suffix));
    if (svc) return svc[1].find((u) => u.startsWith('https://')) ?? null;
  }
  return null;
}

function vcardName(entity: Record<string, unknown>): string | undefined {
  const vcard = arr(entity.vcardArray)[1];
  for (const field of arr(vcard)) {
    const f = arr(field);
    if (f[0] === 'fn') return str(f[3]);
  }
  for (const field of arr(vcard)) {
    const f = arr(field);
    if (f[0] === 'org') return str(f[3]);
  }
  return undefined;
}

export function parseRdapDomain(json: unknown, query: string, queryType: QueryType, url: string): AdapterResultItem[] {
  const o = obj(json);
  const out: AdapterResultItem[] = [];
  const base = { sourceId: 'rdap', queryType, query, url };
  const events = arr(o.events).map(obj);
  for (const ev of events) {
    const action = str(ev.eventAction);
    const date = str(ev.eventDate);
    if (!action || !date || action === 'last update of RDAP database') continue;
    out.push(mkResult({ ...base, type: 'event', kind: `RDAP ${action}`, value: `${action}: ${date}`, infoDate: date, confidence: 'high', data: { action, date } }));
  }
  for (const ent of arr(o.entities).map(obj)) {
    const roles = arr(ent.roles).map((r) => String(r));
    const name = vcardName(ent);
    if (!name) continue;
    if (roles.includes('registrar')) {
      const ianaId = arr(ent.publicIds).map(obj).find((p) => str(p.type)?.includes('IANA'));
      out.push(mkResult({ ...base, type: 'organization', kind: 'RDAP registrar', value: name, confidence: 'high', data: { roles, ianaId: str(ianaId?.identifier) } }));
    } else {
      // Registrant data is frequently redacted for privacy; report what is public as-is.
      out.push(mkResult({ ...base, type: 'organization', kind: `RDAP ${roles.join('/') || 'entity'}`, value: name, confidence: 'medium', data: { roles } }));
    }
  }
  for (const ns of arr(o.nameservers).map(obj)) {
    const n = str(ns.ldhName);
    if (n) out.push(mkResult({ ...base, type: 'domain', kind: 'RDAP nameserver', value: n.toLowerCase().replace(/\.$/, ''), confidence: 'high' }));
  }
  const statuses = arr(o.status).map(String);
  if (statuses.length) out.push(mkResult({ ...base, type: 'other', kind: 'RDAP status', value: statuses.join(', '), confidence: 'high', data: { status: statuses } }));
  // IP network objects
  if (str(o.startAddress)) {
    out.push(
      mkResult({
        ...base,
        type: 'other',
        kind: 'RDAP network',
        value: `${str(o.startAddress)} – ${str(o.endAddress)}${str(o.name) ? ` (${str(o.name)})` : ''}`,
        confidence: 'high',
        data: { handle: str(o.handle), name: str(o.name), country: str(o.country), type: str(o.type) },
      }),
    );
    const country = str(o.country);
    if (country) out.push(mkResult({ ...base, type: 'location', kind: 'RDAP registration country', value: country, confidence: 'medium' }));
  }
  return out;
}

export const rdapAdapter: SourceAdapter = {
  sourceId: 'rdap',
  queryTypes: ['domain', 'ipv4', 'ipv6'],
  async run(query: string, queryType: QueryType, ctx: AdapterContext): Promise<AdapterOutput> {
    let url: string;
    if (queryType === 'domain') {
      const services = await domainBootstrap(ctx);
      const base = findRdapBase(services, query);
      if (!base) {
        return { status: 'requires-manual-action', results: [], message: 'No RDAP service published by IANA for this TLD', manualUrl: icannLookupUrl(query) };
      }
      url = `${base.replace(/\/?$/, '/')}domain/${encodeURIComponent(query.toLowerCase())}`;
    } else {
      // rdap.org redirects to the responsible RIR (all RIR hosts are in the CSP allow-list).
      url = `https://rdap.org/ip/${encodeURIComponent(query)}`;
    }
    const host = new URL(url).host;
    if (!isHostAllowedFor('rdap', host)) {
      return { status: 'requires-manual-action', results: [], message: `RDAP server ${host} not in the allow-list snapshot`, manualUrl: icannLookupUrl(query) };
    }
    const res = await externalFetch({ sourceId: 'rdap', url, sentValue: query, signal: ctx.signal, manual: ctx.manual, headers: { accept: 'application/rdap+json, application/json' } });
    if (res.status === 404) return { status: 'completed', results: [], message: 'not found in registry' };
    if (!res.ok) return { status: 'requires-manual-action', results: [], message: `HTTP ${res.status}`, manualUrl: icannLookupUrl(query) };
    return { status: 'completed', results: parseRdapDomain(await res.json(), query, queryType, res.url) };
  },
};
