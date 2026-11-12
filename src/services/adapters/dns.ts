import type { EntityType, QueryType } from '@/types';
import { externalFetch } from './http';
import { arr, mkResult, num, obj, str, type AdapterContext, type AdapterOutput, type AdapterResultItem, type SourceAdapter } from './types';

export const DNS_TYPES = ['A', 'AAAA', 'MX', 'NS', 'TXT', 'CNAME', 'SOA', 'CAA'] as const;
export type DnsType = (typeof DNS_TYPES)[number] | 'PTR';

const TYPE_CODES: Record<number, string> = { 1: 'A', 2: 'NS', 5: 'CNAME', 6: 'SOA', 12: 'PTR', 15: 'MX', 16: 'TXT', 28: 'AAAA', 257: 'CAA' };

export interface DnsAnswer {
  name: string;
  type: string;
  ttl?: number;
  data: string;
}

export interface DnsResponse {
  status: number;
  answers: DnsAnswer[];
}

const ENDPOINTS: Record<string, (name: string, type: string) => string> = {
  'dns-cloudflare': (n, t) => `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(n)}&type=${t}`,
  'dns-google': (n, t) => `https://dns.google/resolve?name=${encodeURIComponent(n)}&type=${t}`,
};

export function parseDnsJson(json: unknown): DnsResponse {
  const o = obj(json);
  const answers = arr(o.Answer)
    .map(obj)
    .map((a) => {
      const type = TYPE_CODES[num(a.type) ?? 0] ?? String(a.type);
      const raw = str(a.data) ?? '';
      // TXT records arrive as one or more quoted character-strings; join them.
      const data = type === 'TXT' ? raw.replace(/^"|"$/g, '').replace(/"\s*"/g, '') : raw;
      return { name: str(a.name) ?? '', type, ttl: num(a.TTL), data };
    })
    .filter((a) => a.data);
  return { status: num(o.Status) ?? -1, answers };
}

export async function dohQuery(sourceId: string, name: string, type: DnsType, ctx: Pick<AdapterContext, 'signal' | 'manual'>): Promise<DnsResponse> {
  const res = await externalFetch({
    sourceId,
    url: ENDPOINTS[sourceId](name, type),
    sentValue: `${name} ${type}`,
    signal: ctx.signal,
    manual: ctx.manual,
    headers: { accept: 'application/dns-json' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseDnsJson(await res.json());
}

export function reverseName(ip: string): string | null {
  if (/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return ip.split('.').reverse().join('.') + '.in-addr.arpa';
  if (ip.includes(':')) {
    const full = expandIPv6(ip);
    if (!full) return null;
    return full.replace(/:/g, '').split('').reverse().join('.') + '.ip6.arpa';
  }
  return null;
}

export function expandIPv6(ip: string): string | null {
  const parts = ip.split('::');
  if (parts.length > 2) return null;
  const head = parts[0] ? parts[0].split(':') : [];
  const tail = parts[1] ? parts[1].split(':') : [];
  const missing = 8 - head.length - tail.length;
  if (missing < 0 || (parts.length === 1 && missing !== 0)) return null;
  const groups = [...head, ...Array(parts.length === 2 ? missing : 0).fill('0'), ...tail];
  if (groups.length !== 8 || !groups.every((g) => /^[0-9a-f]{1,4}$/i.test(g))) return null;
  return groups.map((g) => g.toLowerCase().padStart(4, '0')).join(':');
}

function entityTypeFor(rtype: string): EntityType {
  switch (rtype) {
    case 'A':
    case 'AAAA':
      return 'ip';
    case 'MX':
    case 'NS':
    case 'CNAME':
    case 'PTR':
      return 'domain';
    default:
      return 'other';
  }
}

function cleanRecordValue(rtype: string, data: string): string {
  if (rtype === 'MX') return data.replace(/^\d+\s+/, '').replace(/\.$/, '');
  if (['NS', 'CNAME', 'PTR'].includes(rtype)) return data.replace(/\.$/, '');
  return data;
}

function makeDnsAdapter(sourceId: 'dns-cloudflare' | 'dns-google'): SourceAdapter {
  return {
    sourceId,
    queryTypes: ['domain', 'ipv4', 'ipv6', 'email'],
    async run(query: string, queryType: QueryType, ctx: AdapterContext): Promise<AdapterOutput> {
      const out: AdapterResultItem[] = [];
      let failures = 0;
      const jobs: Array<[string, DnsType]> = [];
      if (queryType === 'ipv4' || queryType === 'ipv6') {
        const rev = reverseName(query);
        if (!rev) return { status: 'unsupported', results: [], message: 'invalid IP' };
        jobs.push([rev, 'PTR']);
      } else if (queryType === 'email') {
        const domain = query.slice(query.lastIndexOf('@') + 1).toLowerCase();
        jobs.push([domain, 'MX'], [domain, 'TXT'], [`_dmarc.${domain}`, 'TXT'], [domain, 'A']);
      } else {
        for (const t of DNS_TYPES) jobs.push([query.toLowerCase(), t]);
        jobs.push([`_dmarc.${query.toLowerCase()}`, 'TXT']);
      }
      const settled = await Promise.allSettled(jobs.map(([n, t]) => dohQuery(sourceId, n, t, ctx)));
      settled.forEach((s, i) => {
        const [name, qtype] = jobs[i];
        if (s.status === 'rejected') {
          failures++;
          return;
        }
        for (const a of s.value.answers) {
          if (a.type !== qtype) continue; // skip CNAME chain records returned with other types
          const value = cleanRecordValue(a.type, a.data);
          out.push(
            mkResult({
              sourceId,
              queryType,
              query,
              type: entityTypeFor(a.type),
              kind: `DNS ${a.type}${name.startsWith('_dmarc.') ? ' (_dmarc)' : ''}`,
              value,
              confidence: 'high',
              data: { record: a.type, name: a.name, ttl: a.ttl, raw: a.data },
            }),
          );
        }
      });
      if (failures === jobs.length) {
        const first = settled.find((s) => s.status === 'rejected') as PromiseRejectedResult;
        throw first.reason;
      }
      return {
        status: failures > 0 ? 'partial' : 'completed',
        results: out,
        message: failures > 0 ? `${failures}/${jobs.length} DNS queries failed` : undefined,
      };
    },
  };
}

export const dnsCloudflareAdapter = makeDnsAdapter('dns-cloudflare');
export const dnsGoogleAdapter = makeDnsAdapter('dns-google');

/** Email-oriented helpers built on DNS results. */
export function extractSpf(txt: string[]): string | undefined {
  return txt.find((t) => /^v=spf1\b/i.test(t));
}
export function extractDmarc(txt: string[]): string | undefined {
  return txt.find((t) => /^v=DMARC1\b/i.test(t));
}
