#!/usr/bin/env node
// Captures README screenshots from the running app (default http://localhost:5179/)
// using the FICTITIOUS demo investigation only. External requests are blocked.
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const BASE = process.env.APP_URL ?? 'http://localhost:5179/';
const OUT = 'docs/screenshots';
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'fr-FR' });
const page = await context.newPage();
await page.route('**/*', (r) => (new URL(r.request().url()).hostname === 'localhost' ? r.continue() : r.abort()));
await page.addInitScript(() => localStorage.setItem('bw.lang', 'fr'));

await page.goto(BASE);
await page.getByRole('button', { name: /Charger la démo|Réinitialiser la démo/ }).first().click();
await page.waitForURL(/investigations\//);
const shots = [
  ['dashboard', '#/'],
  ['investigation', null],
  ['graph', '#/graph'],
  ['timeline', '#/timeline'],
  ['search-intelligence', '#/dorks?q=example.com'],
  ['sources', '#/sources'],
];
const invUrl = page.url();
for (const [name, hash] of shots) {
  await page.goto(hash ? BASE + hash : invUrl);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`✓ ${name}`);
}
await browser.close();
