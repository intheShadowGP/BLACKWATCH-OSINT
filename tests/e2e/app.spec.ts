import { expect, test, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

/** Fails the test if the page talks to anything except localhost (unless mocked). */
async function guardNetwork(page: Page, allow: (url: URL) => boolean = () => false) {
  const external: string[] = [];
  await page.route('**/*', (route) => {
    const u = new URL(route.request().url());
    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return route.continue();
    if (allow(u)) return route.fallback();
    external.push(u.toString());
    return route.abort();
  });
  return external;
}

async function newInvestigation(page: Page, name: string) {
  await page.goto('./#/investigations');
  await page.getByRole('button', { name: 'New investigation' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill(name);
  await page.getByRole('dialog').getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (e) => {
    throw e;
  });
});

test('loads under the GitHub Pages sub-path with CSP and survives a deep-link reload', async ({ page }) => {
  const external = await guardNetwork(page);
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Operations centre' })).toBeVisible();
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(csp).toContain("script-src 'self'");
  expect(csp).not.toContain('%BLACKWATCH_CSP%');
  await page.goto('./#/settings');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await page.goto('./#/does-not-exist');
  await expect(page.getByText('Page or item not found.')).toBeVisible();
  expect(errors.filter((e) => !/favicon/i.test(e))).toEqual([]);
  expect(external).toEqual([]);
});

test('full investigation workflow: entities, relation, timeline, note, graph, export, delete, import', async ({ page }) => {
  await guardNetwork(page);
  await newInvestigation(page, 'E2E Case');

  // Entities
  await page.getByRole('tab', { name: /Entities/ }).click();
  for (const [type, value] of [
    ['domain', 'example.org'],
    ['ip', '192.0.2.10'],
  ]) {
    await page.getByRole('button', { name: 'Add entity' }).first().click();
    await page.getByRole('dialog').getByLabel('Type').selectOption(type);
    await page.getByRole('dialog').getByLabel('Value').fill(value);
    await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
  }
  // invalid value is rejected with a message
  await page.getByRole('button', { name: 'Add entity' }).first().click();
  await page.getByRole('dialog').getByLabel('Type').selectOption('email');
  await page.getByRole('dialog').getByLabel('Value').fill('not-an-email');
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toHaveText('Invalid e-mail address.');
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('tab', { name: /Entities/ })).toContainText('2');

  // Relation
  await page.getByRole('tab', { name: /Relations/ }).click();
  await page.getByRole('button', { name: 'Add relation' }).click();
  await page.getByRole('dialog').getByLabel('Relation type').fill('resolves to');
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('— resolves to →')).toBeVisible();

  // Note (rendered as text, never HTML)
  await page.getByRole('tab', { name: /Notes/ }).click();
  await page.getByRole('button', { name: 'Add note' }).click();
  await page.getByRole('dialog').getByLabel('Title').fill('Hypothesis');
  await page.getByRole('dialog').getByLabel('Content').fill('<img src=x onerror="window.__pwned=1">');
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('article').getByText('<img src=x onerror="window.__pwned=1">')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();

  // Timeline
  await page.getByRole('link', { name: 'Timeline' }).first().click();
  await page.getByRole('button', { name: 'Add event' }).click();
  await page.getByRole('dialog').getByLabel('Title').fill('Domain registered');
  await page.getByRole('dialog').getByLabel(/Date and time/).fill('2025-02-03T10:12');
  await page.getByRole('dialog').getByLabel('Time zone').selectOption('Europe/Paris');
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('heading', { name: 'Domain registered' })).toBeVisible();

  // Graph renders
  await page.getByRole('link', { name: 'Link analysis' }).click();
  await expect(page.locator('canvas').first()).toBeVisible();

  // Export → delete → import
  await page.getByRole('link', { name: 'Investigations' }).first().click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export', exact: true }).first().click()]);
  const path = await download.path();
  const backup = JSON.parse(await readFile(path!, 'utf8'));
  expect(backup.format).toBe('blackwatch-osint-backup');
  expect(backup.entities).toHaveLength(2);
  expect(backup.relations).toHaveLength(1);
  expect(backup.events).toHaveLength(1);
  expect(backup.events[0].datetime).toBe('2025-02-03T09:12:00.000Z');

  await page.getByRole('button', { name: 'Delete' }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('No investigations.')).toBeVisible();

  await page.getByRole('button', { name: 'Import backup' }).click();
  await page.getByRole('dialog').getByLabel('File').setInputFiles(path!);
  await page.getByRole('dialog').getByRole('button', { name: 'Import backup' }).click();
  await expect(page.getByRole('dialog').getByText('Entities')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).first().click();
  await expect(page.getByRole('link', { name: 'E2E Case' })).toBeVisible();
});

test('external search uses only the selected source, normalises results and keeps provenance', async ({ page }) => {
  const contacted: string[] = [];
  const external = await guardNetwork(page, (u) => u.hostname === 'cloudflare-dns.com');
  await page.route('https://cloudflare-dns.com/**', (route) => {
    const u = new URL(route.request().url());
    contacted.push(`${u.searchParams.get('name')} ${u.searchParams.get('type')}`);
    const type = u.searchParams.get('type');
    const answer = type === 'A' ? [{ name: 'example.org.', type: 1, TTL: 60, data: '192.0.2.44' }] : [];
    return route.fulfill({ status: 200, contentType: 'application/dns-json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ Status: 0, Answer: answer }) });
  });
  await newInvestigation(page, 'Search case');
  await page.goto('./#/domain?q=example.org');
  // keep only the DNS source
  for (const name of ['RDAP (IANA bootstrap)', 'Cert Spotter (SSLMate)', 'Internet Archive — Wayback Availability', 'HN Search (Algolia)']) {
    await page.getByLabel(name).uncheck();
  }
  await page.getByRole('button', { name: 'Analyse' }).click();
  // Privacy confirmation lists exactly what will be sent, to whom.
  await expect(page.getByRole('dialog')).toContainText('Cloudflare DNS over HTTPS');
  await expect(page.getByRole('dialog')).not.toContainText('Cert Spotter');
  await page.getByRole('dialog').getByRole('button', { name: 'Launch' }).click();
  await expect(page.getByText('Completed')).toBeVisible();
  await expect(page.getByText('192.0.2.44').first()).toBeVisible();
  expect(contacted.every((c) => c.includes('example.org'))).toBe(true);
  expect(external).toEqual([]);

  // Add the result to the investigation, provenance kept
  await page.getByRole('tab', { name: /All results/ }).click();
  await page.getByRole('button', { name: 'Add to investigation' }).first().click();
  await page.goto('./#/investigations');
  await page.getByRole('link', { name: 'Search case' }).click();
  await page.getByRole('tab', { name: /Entities/ }).click();
  await expect(page.getByText('192.0.2.44')).toBeVisible();
  await expect(page.getByText('Cloudflare DNS over HTTPS')).toBeVisible();

  // Request log shows what was sent
  await page.goto('./#/automation');
  await expect(page.getByText('example.org A').first()).toBeVisible();
});

test('local mode blocks every external lookup', async ({ page }) => {
  const external = await guardNetwork(page);
  await page.goto('./#/settings');
  await page.getByLabel('Allow external requests').uncheck();
  await page.goto('./#/domain?q=example.org');
  await expect(page.getByRole('button', { name: 'Analyse' })).toBeDisabled();
  await page.goto('./#/username?q=someone');
  await expect(page.getByRole('button', { name: /Check/ })).toBeDisabled();
  expect(external).toEqual([]);
});

test('demo mode, report generation and image analysis are fully local', async ({ page }) => {
  const external = await guardNetwork(page);
  await page.goto('./');
  await page.getByRole('button', { name: 'Load demo' }).click();
  await expect(page.getByText(/FICTITIOUS DATA/).first()).toBeVisible();

  await page.goto('./#/reports');
  await page.getByLabel('Format').selectOption('md');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Generate & download' }).click()]);
  const md = await readFile((await dl.path())!, 'utf8');
  expect(md).toContain('FICTITIOUS DATA');
  expect(md).toContain('## Timeline');

  await page.getByLabel('Format').selectOption('pdf');
  const [pdf] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Generate & download' }).click()]);
  const pdfBytes = await readFile((await pdf.path())!);
  expect(pdfBytes.subarray(0, 5).toString()).toBe('%PDF-');

  // 1×1 PNG without metadata
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  await page.goto('./#/image');
  await page.getByLabel('Choose images').setInputFiles({ name: 'pixel.png', mimeType: 'image/png', buffer: png });
  const sha = createHash('sha256').update(png).digest('hex');
  await expect(page.getByText(sha)).toBeVisible();
  await expect(page.getByText(/No metadata|No device data/).first()).toBeVisible();

  // A non-image disguised as .jpg is refused
  await page.getByLabel('Choose images').setInputFiles({ name: 'evil.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('<svg onload=alert(1)>') });
  await expect(page.getByText(/not a recognised image/)).toBeVisible();
  expect(external).toEqual([]);
});

test('report preview renders under the production CSP and results can be exported', async ({ page }) => {
  await guardNetwork(page, (u) => u.hostname === 'cloudflare-dns.com');
  await page.route('https://cloudflare-dns.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/dns-json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ Status: 0, Answer: [{ name: 'example.org.', type: 1, TTL: 60, data: '192.0.2.44' }] }) }),
  );
  await newInvestigation(page, 'Preview case');
  await page.goto('./#/reports');
  await page.getByRole('button', { name: 'Preview' }).click();
  const frame = page.frameLocator('iframe[title="Preview"]');
  await expect(frame.getByRole('heading', { name: /Investigation report/ })).toBeVisible();

  await page.goto('./#/domain?q=example.org');
  for (const name of ['RDAP (IANA bootstrap)', 'Cert Spotter (SSLMate)', 'Internet Archive — Wayback Availability', 'HN Search (Algolia)']) await page.getByLabel(name).uncheck();
  await page.getByRole('button', { name: 'Analyse' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Launch' }).click();
  await page.getByRole('tab', { name: /All results/ }).click();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'CSV' }).first().click()]);
  const csv = await readFile((await dl.path())!, 'utf8');
  expect(csv).toContain('192.0.2.44');
  expect(csv).toContain('Cloudflare DNS over HTTPS');
});

test('real lookups are never attached to the demonstration investigation', async ({ page }) => {
  await guardNetwork(page, (u) => u.hostname === 'cloudflare-dns.com');
  await page.route('https://cloudflare-dns.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/dns-json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ Status: 0, Answer: [{ name: 'example.org.', type: 1, TTL: 60, data: '192.0.2.99' }] }) }),
  );
  await page.goto('./');
  await page.getByRole('button', { name: 'Load demo' }).click();
  await expect(page.getByText(/FICTITIOUS DATA/).first()).toBeVisible();
  await page.goto('./#/domain?q=example.org');
  await expect(page.getByText(/real collected data is not added/)).toBeVisible();
  for (const name of ['RDAP (IANA bootstrap)', 'Cert Spotter (SSLMate)', 'Internet Archive — Wayback Availability', 'HN Search (Algolia)']) await page.getByLabel(name).uncheck();
  await page.getByRole('button', { name: 'Analyse' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Launch' }).click();
  await page.getByRole('tab', { name: /All results/ }).click();
  await expect(page.getByRole('button', { name: 'Add to investigation' }).first()).toBeDisabled();

  // Local modules are guarded too.
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  await page.goto('./#/image');
  await page.getByLabel('Choose images').setInputFiles({ name: 'pixel.png', mimeType: 'image/png', buffer: png });
  await expect(page.getByRole('button', { name: 'Add to investigation' })).toBeDisabled();
  await page.goto('./#/geoint?q=48.8584,%202.2945');
  await expect(page.getByRole('button', { name: 'Link to an event' })).toBeDisabled();
});

test('dashboard cards can be hidden and the layout persists', async ({ page }) => {
  await guardNetwork(page);
  await page.goto('./');
  await page.getByRole('button', { name: 'Customise' }).click();
  await page.getByLabel('Modules', { exact: true }).uncheck();
  await page.getByRole('button', { name: 'Done' }).click();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Operations centre' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Modules', exact: true })).toHaveCount(0);
});
