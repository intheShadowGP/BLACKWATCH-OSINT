import { describe, expect, it } from 'vitest';
import { analyzeEmailSyntax, detectQueryType, isDomain, isEmail, isIPv4, isIPv6, normalizeValue, parseCoordinates, safeUrl, toDMS } from '@/utils/validation';

describe('IP validation', () => {
  it('accepts valid IPv4 and rejects invalid ones', () => {
    expect(isIPv4('8.8.8.8')).toBe(true);
    expect(isIPv4('255.255.255.255')).toBe(true);
    expect(isIPv4('256.1.1.1')).toBe(false);
    expect(isIPv4('1.2.3')).toBe(false);
    expect(isIPv4('01.2.3.4')).toBe(false);
  });
  it('accepts valid IPv6 forms', () => {
    expect(isIPv6('2001:db8::1')).toBe(true);
    expect(isIPv6('::1')).toBe(true);
    expect(isIPv6('2606:4700:4700::1111')).toBe(true);
    expect(isIPv6('::ffff:192.0.2.1')).toBe(true);
    expect(isIPv6('1:2:3:4:5:6:7:8')).toBe(true);
    expect(isIPv6('1::2::3')).toBe(false);
    expect(isIPv6('12345::1')).toBe(false);
    expect(isIPv6('example.com')).toBe(false);
  });
});

describe('domain & e-mail', () => {
  it('validates domains', () => {
    expect(isDomain('example.com')).toBe(true);
    expect(isDomain('sub.example.co.uk')).toBe(true);
    expect(isDomain('xn--bcher-kva.example')).toBe(true);
    expect(isDomain('localhost')).toBe(false);
    expect(isDomain('-bad.com')).toBe(false);
    expect(isDomain('a..b.com')).toBe(false);
    expect(isDomain('1.2.3.4')).toBe(false);
  });
  it('validates e-mail addresses', () => {
    expect(isEmail('john.doe+tag@example.org')).toBe(true);
    expect(isEmail('a@b')).toBe(false);
    expect(isEmail('no-at.example.org')).toBe(false);
    expect(isEmail('a..b@example.org')).toBe(false);
    expect(isEmail('x'.repeat(65) + '@example.org')).toBe(false);
  });
  it('reports syntax issues', () => {
    const r = analyzeEmailSyntax('first.last+news@gmail.com');
    expect(r.valid).toBe(true);
    expect(r.domain).toBe('gmail.com');
    expect(r.issues).toContain('plus-addressing');
    expect(analyzeEmailSyntax('bad@').issues).toContain('bad-domain');
  });
});

describe('coordinates', () => {
  it('parses decimal coordinates', () => {
    expect(parseCoordinates('48.8584, 2.2945')).toEqual({ lat: 48.8584, lon: 2.2945 });
    expect(parseCoordinates('-33.8568 151.2153')).toEqual({ lat: -33.8568, lon: 151.2153 });
    expect(parseCoordinates('91, 0')).toBeNull();
  });
  it('parses DMS coordinates in either order', () => {
    const c = parseCoordinates(`40°41'21.4"N 74°02'40.2"W`)!;
    expect(c.lat).toBeCloseTo(40.68928, 4);
    expect(c.lon).toBeCloseTo(-74.04450, 4);
    const d = parseCoordinates(`74°02'40.2"W 40°41'21.4"N`)!;
    expect(d.lat).toBeCloseTo(40.68928, 4);
  });
  it('formats DMS', () => {
    expect(toDMS(48.8584, true)).toBe(`48°51'30.24"N`);
    expect(toDMS(-2.5, false)).toBe(`2°30'0.00"W`);
  });
});

describe('query type detection', () => {
  it.each([
    ['torvalds', 'username'],
    ['@nightjar_ops', 'username'],
    ['example.com', 'domain'],
    ['8.8.8.8', 'ipv4'],
    ['2001:db8::1', 'ipv6'],
    ['john@example.org', 'email'],
    ['https://github.com/torvalds', 'url'],
    ['48.8584, 2.2945', 'coordinates'],
    ['open source intelligence', 'keyword'],
  ])('%s → %s', (input, expected) => {
    expect(detectQueryType(input)).toBe(expected);
  });
  it('returns null for empty input', () => {
    expect(detectQueryType('   ')).toBeNull();
  });
});

describe('normalisation', () => {
  it('normalises values for deduplication', () => {
    expect(normalizeValue('domain', 'WWW.Example.COM.')).toBe('example.com');
    expect(normalizeValue('username', '@JohnDoe')).toBe('johndoe');
    expect(normalizeValue('url', 'https://Example.com/a/#frag')).toBe('https://example.com/a');
  });
});

describe('safeUrl', () => {
  it('only allows http(s)', () => {
    expect(safeUrl('https://example.com/x')).toBe('https://example.com/x');
    expect(safeUrl('javascript:alert(1)')).toBeNull();
    expect(safeUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(safeUrl('file:///etc/passwd')).toBeNull();
    expect(safeUrl('java\tscript:alert(1)')).toBeNull();
    expect(safeUrl('https://user:pass@example.com')).toBeNull();
    expect(safeUrl('')).toBeNull();
  });
});
