import type { QueryType } from '@/types';
import { externalFetch } from './http';
import { arr, mkResult, num, obj, str, type AdapterContext, type AdapterOutput, type AdapterResultItem, type SourceAdapter } from './types';

/* ----------------------------- Cert Spotter ----------------------------- */

export function parseCertspotter(json: unknown, domain: string, query: string): { subdomains: Map<string, string | undefined>; certs: number } {
  const subdomains = new Map<string, string | undefined>();
  const d = domain.toLowerCase();
  const items = arr(json).map(obj);
  for (const it of items) {
    const notBefore = str(it.not_before);
    for (const raw of arr(it.dns_names)) {
      const name = String(raw).toLowerCase().replace(/^\*\./, '');
      if (name !== d && !name.endsWith('.' + d)) continue;
      const prev = subdomains.get(name);
      if (!prev || (notBefore && notBefore < prev)) subdomains.set(name, notBefore);
    }
  }
  void query;
  return { subdomains, certs: items.length };
}

export const certspotterAdapter: SourceAdapter = {
  sourceId: 'certspotter',
  queryTypes: ['domain'],
  async run(query, queryType, ctx) {
    const url = `https://api.certspotter.com/v1/issuances?domain=${encodeURIComponent(query.toLowerCase())}&include_subdomains=true&expand=dns_names`;
    const res = await externalFetch({ sourceId: 'certspotter', url, sentValue: query, signal: ctx.signal, manual: ctx.manual });
    if (!res.ok) return { status: 'requires-manual-action', results: [], message: `HTTP ${res.status}`, manualUrl: `https://crt.sh/?q=${encodeURIComponent('%.' + query)}` };
    const { subdomains, certs } = parseCertspotter(await res.json(), query, query);
    const results = [...subdomains.entries()].slice(0, ctx.maxResults).map(([name, firstSeen]) =>
      mkResult({
        sourceId: 'certspotter',
        queryType,
        query,
        type: 'domain',
        kind: 'Sub-domain (Certificate Transparency)',
        value: name,
        url: `https://crt.sh/?q=${encodeURIComponent(name)}`,
        infoDate: firstSeen,
        confidence: 'high',
        data: { firstCertificateNotBefore: firstSeen },
      }),
    );
    // The unauthenticated endpoint returns one page; more certificates may exist.
    const partial = certs >= 100 || subdomains.size > ctx.maxResults;
    return { status: partial ? 'partial' : 'completed', results, message: partial ? 'first page only — use crt.sh for the full history' : undefined, manualUrl: partial ? `https://crt.sh/?q=${encodeURIComponent('%.' + query)}` : undefined };
  },
};

/* ------------------------------- Wayback ------------------------------- */

export const waybackAdapter: SourceAdapter = {
  sourceId: 'wayback',
  queryTypes: ['domain', 'url'],
  async run(query, queryType, ctx) {
    const url = `https://archive.org/wayback/available?url=${encodeURIComponent(query)}`;
    const res = await externalFetch({ sourceId: 'wayback', url, sentValue: query, signal: ctx.signal, manual: ctx.manual });
    const json = obj(await res.json());
    const closest = obj(obj(json.archived_snapshots).closest);
    const snap = str(closest.url);
    const ts = str(closest.timestamp);
    const results: AdapterResultItem[] = [];
    if (snap) {
      const iso = ts && /^\d{14}$/.test(ts) ? `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}T${ts.slice(8, 10)}:${ts.slice(10, 12)}:${ts.slice(12, 14)}Z` : undefined;
      results.push(
        mkResult({ sourceId: 'wayback', queryType, query, type: 'url', kind: 'Archived snapshot (closest)', value: snap.replace(/^http:/, 'https:'), url: snap.replace(/^http:/, 'https:'), infoDate: iso, confidence: 'high', data: { status: str(closest.status) } }),
      );
    }
    return {
      status: 'completed',
      results,
      manualUrl: `https://web.archive.org/web/*/${encodeURIComponent(query)}*`,
      message: snap ? undefined : 'no snapshot reported',
    };
  },
};

/* ------------------------------- RIPEstat ------------------------------- */

export const ripestatAdapter: SourceAdapter = {
  sourceId: 'ripestat',
  queryTypes: ['ipv4', 'ipv6'],
  async run(query, queryType, ctx) {
    const url = `https://stat.ripe.net/data/prefix-overview/data.json?resource=${encodeURIComponent(query)}&sourceapp=blackwatch-osint`;
    const res = await externalFetch({ sourceId: 'ripestat', url, sentValue: query, signal: ctx.signal, manual: ctx.manual });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = obj(obj(await res.json()).data);
    const results: AdapterResultItem[] = [];
    const prefix = str(data.resource);
    const announced = data.announced === true;
    if (prefix) results.push(mkResult({ sourceId: 'ripestat', queryType, query, type: 'other', kind: 'Routed prefix', value: prefix, url: `https://stat.ripe.net/${encodeURIComponent(query)}`, confidence: 'high', data: { announced } }));
    for (const a of arr(data.asns).map(obj)) {
      const asn = num(a.asn);
      if (!asn) continue;
      results.push(
        mkResult({ sourceId: 'ripestat', queryType, query, type: 'organization', kind: 'Origin ASN', value: `AS${asn}${str(a.holder) ? ` — ${str(a.holder)}` : ''}`, url: `https://stat.ripe.net/AS${asn}`, confidence: 'high', data: { asn, holder: str(a.holder) } }),
      );
    }
    return { status: 'completed', results, message: announced ? undefined : 'prefix not announced in BGP' };
  },
};

/* -------------------------------- IPinfo -------------------------------- */

export const ipinfoAdapter: SourceAdapter = {
  sourceId: 'ipinfo',
  queryTypes: ['ipv4', 'ipv6'],
  async run(query, queryType, ctx) {
    const res = await externalFetch({ sourceId: 'ipinfo', url: `https://ipinfo.io/${encodeURIComponent(query)}/json`, sentValue: query, signal: ctx.signal, manual: ctx.manual });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = obj(await res.json());
    if (j.bogon === true) return { status: 'completed', results: [], message: 'bogon / private address' };
    const results: AdapterResultItem[] = [];
    const base = { sourceId: 'ipinfo', queryType, query, url: `https://ipinfo.io/${encodeURIComponent(query)}` } as const;
    const host = str(j.hostname);
    if (host) results.push(mkResult({ ...base, type: 'domain', kind: 'Hostname (reverse DNS)', value: host, confidence: 'medium' }));
    const org = str(j.org);
    if (org) results.push(mkResult({ ...base, type: 'organization', kind: 'Network organisation', value: org, confidence: 'medium' }));
    const loc = str(j.loc);
    const place = [str(j.city), str(j.region), str(j.country)].filter(Boolean).join(', ');
    if (place) {
      const [lat, lon] = (loc ?? '').split(',').map(Number);
      results.push(
        mkResult({
          ...base,
          type: 'location',
          kind: 'IP geolocation (approximate)',
          value: place,
          // IP geolocation is an estimate of the network, never the location of a person.
          confidence: 'low',
          data: { lat: Number.isFinite(lat) ? lat : undefined, lon: Number.isFinite(lon) ? lon : undefined, timezone: str(j.timezone), anycast: j.anycast === true },
        }),
      );
    }
    return { status: 'completed', results };
  },
};

/* --------------------------- Shodan InternetDB --------------------------- */

export const internetdbAdapter: SourceAdapter = {
  sourceId: 'shodan-internetdb',
  queryTypes: ['ipv4'],
  async run(query: string, queryType: QueryType, ctx: AdapterContext): Promise<AdapterOutput> {
    const url = `https://internetdb.shodan.io/${encodeURIComponent(query)}`;
    const res = await externalFetch({ sourceId: 'shodan-internetdb', url, sentValue: query, signal: ctx.signal, manual: ctx.manual });
    if (res.status === 404) return { status: 'completed', results: [], message: 'no data for this IP' };
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = obj(await res.json());
    const base = { sourceId: 'shodan-internetdb', queryType, query, url: `https://www.shodan.io/host/${encodeURIComponent(query)}` } as const;
    const results: AdapterResultItem[] = [];
    for (const p of arr(j.ports)) if (typeof p === 'number') results.push(mkResult({ ...base, type: 'other', kind: 'Open port (observed by Shodan)', value: String(p), confidence: 'medium' }));
    for (const h of arr(j.hostnames)) if (typeof h === 'string') results.push(mkResult({ ...base, type: 'domain', kind: 'Hostname (Shodan)', value: h, confidence: 'medium' }));
    for (const c of arr(j.cpes)) if (typeof c === 'string') results.push(mkResult({ ...base, type: 'other', kind: 'Software (CPE, reported)', value: c, confidence: 'low' }));
    for (const v of arr(j.vulns)) if (typeof v === 'string') results.push(mkResult({ ...base, type: 'other', kind: 'Potential CVE (unconfirmed)', value: v, confidence: 'low', verification: 'unverified' }));
    for (const t of arr(j.tags)) if (typeof t === 'string') results.push(mkResult({ ...base, type: 'other', kind: 'Shodan tag', value: t, confidence: 'low' }));
    return { status: 'completed', results };
  },
};
