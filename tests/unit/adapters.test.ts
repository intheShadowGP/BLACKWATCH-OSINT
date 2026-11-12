import { describe, expect, it } from 'vitest';
import { expandIPv6, parseDnsJson, reverseName } from '@/services/adapters/dns';
import { findRdapBase, parseRdapDomain } from '@/services/adapters/rdap';
import { parseCertspotter } from '@/services/adapters/network';
import { normaliseDate } from '@/services/adapters/types';
import { getAdapter, manualUrl } from '@/services/adapters/registry';
import { SOURCES } from '@/services/sources/catalog';
import { PLATFORMS } from '@/services/sources/platforms';

describe('DNS parsing', () => {
  it('parses DoH JSON answers and joins TXT strings', () => {
    const r = parseDnsJson({
      Status: 0,
      Answer: [
        { name: 'example.com.', type: 1, TTL: 300, data: '93.184.215.14' },
        { name: 'example.com.', type: 16, TTL: 300, data: '"v=spf1 " "-all"' },
        { name: 'example.com.', type: 257, TTL: 300, data: '0 issue "letsencrypt.org"' },
      ],
    });
    expect(r.answers.map((a) => a.type)).toEqual(['A', 'TXT', 'CAA']);
    expect(r.answers[1].data).toBe('v=spf1 -all');
    expect(r.answers[2].data).toBe('0 issue "letsencrypt.org"');
  });
  it('builds reverse names', () => {
    expect(reverseName('8.8.4.4')).toBe('4.4.8.8.in-addr.arpa');
    expect(expandIPv6('2001:db8::1')).toBe('2001:0db8:0000:0000:0000:0000:0000:0001');
    expect(reverseName('2001:db8::1')?.endsWith('8.b.d.0.1.0.0.2.ip6.arpa')).toBe(true);
  });
});

describe('RDAP', () => {
  const services: Array<[string[], string[]]> = [
    [['com', 'net'], ['https://rdap.verisign.com/com/v1/']],
    [['co.uk'], ['https://rdap.example.uk/']],
    [['uk'], ['https://rdap.nominet.uk/uk/']],
  ];
  it('picks the longest matching bootstrap suffix', () => {
    expect(findRdapBase(services, 'example.com')).toBe('https://rdap.verisign.com/com/v1/');
    expect(findRdapBase(services, 'shop.example.co.uk')).toBe('https://rdap.example.uk/');
    expect(findRdapBase(services, 'example.zz')).toBeNull();
  });
  it('normalises a domain response', () => {
    const items = parseRdapDomain(
      {
        ldhName: 'EXAMPLE.COM',
        status: ['client transfer prohibited'],
        events: [
          { eventAction: 'registration', eventDate: '1995-08-14T04:00:00Z' },
          { eventAction: 'last update of RDAP database', eventDate: '2026-01-01T00:00:00Z' },
        ],
        entities: [{ roles: ['registrar'], vcardArray: ['vcard', [['version', {}, 'text', '4.0'], ['fn', {}, 'text', 'RESERVED-Internet Assigned Numbers Authority']]], publicIds: [{ type: 'IANA Registrar ID', identifier: '376' }] }],
        nameservers: [{ ldhName: 'A.IANA-SERVERS.NET' }],
      },
      'example.com',
      'domain',
      'https://rdap.verisign.com/com/v1/domain/example.com',
    );
    const kinds = items.map((i) => i.kind);
    expect(kinds).toContain('RDAP registration');
    expect(kinds).not.toContain('RDAP last update of RDAP database');
    expect(items.find((i) => i.kind === 'RDAP registrar')?.value).toMatch(/Internet Assigned/);
    expect(items.find((i) => i.kind === 'RDAP nameserver')?.value).toBe('a.iana-servers.net');
    expect(items.every((i) => i.verification === 'public-source')).toBe(true);
  });
});

describe('Certificate Transparency', () => {
  it('keeps only names under the domain and the earliest date', () => {
    const r = parseCertspotter(
      [
        { dns_names: ['example.com', '*.example.com', 'www.example.com', 'evil.com'], not_before: '2024-02-01T00:00:00Z' },
        { dns_names: ['www.example.com', 'api.example.com'], not_before: '2023-01-01T00:00:00Z' },
      ],
      'example.com',
      'example.com',
    );
    expect([...r.subdomains.keys()].sort()).toEqual(['api.example.com', 'example.com', 'www.example.com']);
    expect(r.subdomains.get('www.example.com')).toBe('2023-01-01T00:00:00Z');
  });
});

describe('misc adapter helpers', () => {
  it('normalises dates from seconds, ms and strings', () => {
    expect(normaliseDate(0)).toBe('1970-01-01T00:00:00.000Z');
    expect(normaliseDate(1700000000)).toBe('2023-11-14T22:13:20.000Z');
    expect(normaliseDate(1700000000000)).toBe('2023-11-14T22:13:20.000Z');
    expect(normaliseDate('garbage')).toBeUndefined();
  });
  it('every API source with query types has an adapter (except tiles)', () => {
    for (const s of SOURCES.filter((x) => x.access === 'api' && x.queryTypes.length)) {
      expect(getAdapter(s.id), s.id).toBeDefined();
    }
  });
  it('every automated platform has an API source and adapter', () => {
    for (const p of PLATFORMS.filter((x) => x.method === 'official-api')) {
      expect(SOURCES.find((s) => s.id === p.id && s.access === 'api'), p.id).toBeDefined();
      expect(getAdapter(p.id), p.id).toBeDefined();
    }
  });
  it('builds manual URLs with encoding', () => {
    expect(manualUrl('crtsh', 'example.com', 'domain')).toBe('https://crt.sh/?q=%25.example.com');
    expect(manualUrl('google', 'a "b"', 'keyword')).toBe('https://www.google.com/search?q=%22a%20%22b%22%22');
    expect(manualUrl('x', 'jack', 'username')).toBe('https://x.com/jack');
  });
});
