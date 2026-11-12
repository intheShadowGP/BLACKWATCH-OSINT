import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { csvCell, escapeHtml, mdLink, toCsv } from '@/services/export/format';
import { renderHtml, renderMarkdown, type ReportData } from '@/services/export/report';
import { buildCsp, allowedConnectHosts } from '@/config/csp';
import { SOURCES } from '@/services/sources/catalog';
import { sniffBytes } from '@/utils/files';
import { importBackup, BACKUP_FORMAT } from '@/services/export/backup';
import { validateEntityValue } from '@/components/forms';

const XSS = `<img src=x onerror=alert(1)><script>alert(1)</script>"'`;

function reportFixture(): ReportData {
  const now = '2026-01-01T00:00:00.000Z';
  return {
    investigation: { id: 'i', name: XSS, description: XSS, objective: XSS, status: 'open', createdAt: now, updatedAt: now, tags: [], isDemo: false },
    entities: [{ id: 'e', investigationId: 'i', type: 'url', value: XSS, label: XSS, verification: 'verified', confidence: 'high', sources: [{ sourceId: 'manual', url: 'javascript:alert(1)', collectedAt: now }], notes: XSS, tags: [], createdAt: now, updatedAt: now }],
    relations: [],
    events: [{ id: 'v', investigationId: 'i', title: XSS, description: XSS, datetime: now, timezone: XSS, dateKind: 'occurrence', verification: 'unverified', confidence: 'low', sources: [], entityIds: [], createdAt: now, updatedAt: now }],
    notes: [{ id: 'n', investigationId: 'i', title: XSS, body: XSS, createdAt: now, updatedAt: now }],
    evidence: [],
    results: [{ id: 'r', sourceId: 'manual', queryType: 'keyword', query: XSS, type: 'url', kind: XSS, value: XSS, url: 'javascript:alert(1)', collectedAt: now, confidence: 'low', verification: 'unverified', data: {}, isDemo: false }],
    sources: [{ id: 'x', name: XSS, url: 'javascript:alert(1)', count: 1 }],
    generatedAt: now,
    options: { summary: XSS, methodology: XSS, limitations: XSS, overallConfidence: 'low', include: { entities: true, relations: true, timeline: true, results: true, evidence: true, notes: true, sources: true }, onlyCorroborated: false, lang: 'en' },
  };
}

describe('XSS & injection in exports', () => {
  it('escapes HTML everywhere in HTML reports and never emits javascript: links', () => {
    const html = renderHtml(reportFixture());
    expect(html).not.toContain('<script>alert');
    expect(html).not.toContain('<img src=x');
    expect(html).not.toMatch(/href="javascript:/i);
    expect(html).toContain('&lt;script&gt;');
    // The report itself forbids scripts via its own CSP.
    expect(html).toContain(`default-src 'none'`);
  });
  it('escapes Markdown control characters and refuses non-http links', () => {
    const md = renderMarkdown(reportFixture());
    expect(md).not.toContain('](javascript:');
    expect(mdLink('x', 'javascript:alert(1)')).toBe('x');
    expect(mdLink('a]b', 'https://example.com/a b')).toBe('[a\\]b](<https://example.com/a%20b>)');
  });
  it('neutralises spreadsheet formulas in CSV', () => {
    expect(csvCell('=HYPERLINK("http://evil")')).toBe(`"'=HYPERLINK(""http://evil"")"`);
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell('-1')).toBe("'-1");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(toCsv([{ a: '=1' }], ['a'])).toBe("﻿a\r\n'=1");
  });
  it('escapeHtml covers quotes', () => {
    expect(escapeHtml(`"'<>&`)).toBe('&quot;&#39;&lt;&gt;&amp;');
  });
});

describe('Content-Security-Policy', () => {
  const prod = buildCsp({ dev: false });
  it('forbids inline scripts and plugins in production', () => {
    const script = prod.split(';').find((d) => d.trim().startsWith('script-src'))!;
    expect(script).not.toContain('unsafe-inline');
    expect(script).not.toContain('unsafe-eval');
    expect(prod).toContain("object-src 'none'");
    expect(prod).toContain("base-uri 'self'");
    expect(prod).toContain("form-action 'none'");
    expect(prod).not.toContain('ws://');
  });
  it('allows every API source host in connect-src (and nothing link-only)', () => {
    const connect = prod.split(';').find((d) => d.trim().startsWith('connect-src'))!;
    for (const s of SOURCES.filter((x) => x.access === 'api')) for (const h of s.hosts) expect(connect, h).toContain(`https://${h}`);
    expect(connect).not.toContain('google.com');
    expect(connect).not.toContain('crt.sh');
    expect(connect).not.toMatch(/\shttps:(\s|$)/); // no blanket https:
    expect(allowedConnectHosts().every((h) => /^[a-z0-9.-]+(:\d+)?$/.test(h))).toBe(true);
  });
  it('index.html carries the CSP placeholder and a strict referrer policy', () => {
    const html = readFileSync('index.html', 'utf8');
    expect(html).toContain('%BLACKWATCH_CSP%');
    expect(html).toContain('strict-origin-when-cross-origin');
  });
});

describe('file handling', () => {
  it('detects real types from magic bytes', () => {
    expect(sniffBytes(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0])).mime).toBe('image/jpeg');
    expect(sniffBytes(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])).mime).toBe('image/png');
    expect(sniffBytes(new TextEncoder().encode('%PDF-1.7')).isImage).toBe(false);
    expect(sniffBytes(new Uint8Array([0x4d, 0x5a, 0x90, 0])).label).toBe('Windows executable');
  });
  it('never treats SVG/HTML text as an image', () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>');
    expect(sniffBytes(svg).isImage).toBe(false);
    expect(sniffBytes(new TextEncoder().encode('<html><script>')).mime).toBeNull();
  });
});

describe('local data tampering', () => {
  it('rejects backups with injected fields of the wrong type or oversized values', async () => {
    const base = { format: BACKUP_FORMAT, version: 1, exportedAt: 'x', investigations: [], entities: [], relations: [], events: [], notes: [], results: [], activity: [], evidence: [] };
    await expect(importBackup({ ...base, investigations: [{ id: 'a', name: 'x'.repeat(5000), status: 'open', createdAt: 'x', updatedAt: 'x' }] })).rejects.toThrow(/invalid-backup/);
    await expect(importBackup({ ...base, entities: [{ id: 'e', investigationId: 'a', type: 'not-a-type', value: 'v', verification: 'verified', confidence: 'high', createdAt: 'x', updatedAt: 'x' }] })).rejects.toThrow(/invalid-backup/);
    await expect(importBackup({ ...base, investigations: [{ id: 'a', name: 'ok', status: 'pwned', createdAt: 'x', updatedAt: 'x' }] })).rejects.toThrow(/invalid-backup/);
  });
  it('validates entity values by type', () => {
    expect(validateEntityValue('email', 'not-an-email')).toBe('error.invalidEmail');
    expect(validateEntityValue('url', 'javascript:alert(1)')).toBe('error.invalidUrl');
    expect(validateEntityValue('ip', '999.1.1.1')).toBe('error.invalidIp');
    expect(validateEntityValue('username', '  ')).toBe('error.required');
    expect(validateEntityValue('url', 'https://example.com')).toBeNull();
  });
});

describe('source code hygiene', () => {
  function walk(dir: string): string[] {
    return readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? walk(p) : [p];
    });
  }
  const files = walk('src').filter((f) => /\.(ts|tsx)$/.test(f));
  it('never uses dangerouslySetInnerHTML, eval or new Function', () => {
    for (const f of files) {
      const code = readFileSync(f, 'utf8');
      expect(code, f).not.toMatch(/dangerouslySetInnerHTML|\beval\(|new Function\(/);
    }
  });
  it('does not embed secrets or VITE_ secret variables', () => {
    for (const f of files) {
      const code = readFileSync(f, 'utf8');
      expect(code, f).not.toMatch(/import\.meta\.env\.VITE_[A-Z_]*(KEY|TOKEN|SECRET)/);
      expect(code, f).not.toMatch(/(ghp_[A-Za-z0-9]{30,}|sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35})/);
    }
  });
  it('only uses external fetch through the guarded HTTP layer', () => {
    for (const f of files) {
      if (f.replace(/\\/g, '/').endsWith('services/adapters/http.ts')) continue;
      const code = readFileSync(f, 'utf8');
      expect(code, f).not.toMatch(/\bfetch\(/);
    }
  });
});
