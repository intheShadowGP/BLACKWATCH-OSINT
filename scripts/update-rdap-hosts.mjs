#!/usr/bin/env node
// Regenerates src/config/rdap-hosts.json from the official IANA RDAP bootstrap
// registry. The resulting host list is used to build the CSP connect-src so
// RDAP lookups can follow the registry that IANA designates — and nothing else.
// Run manually (`node scripts/update-rdap-hosts.mjs`) and commit the result.
import { writeFile } from 'node:fs/promises';

const FILES = ['dns', 'ipv4', 'ipv6', 'asn'];
const hosts = new Set();
for (const f of FILES) {
  const res = await fetch(`https://data.iana.org/rdap/${f}.json`);
  if (!res.ok) throw new Error(`IANA bootstrap ${f}: HTTP ${res.status}`);
  const json = await res.json();
  for (const [, urls] of json.services) {
    for (const u of urls) {
      const url = new URL(u);
      if (url.protocol === 'https:') hosts.add(url.host.toLowerCase());
    }
  }
}
const out = {
  generatedAt: new Date().toISOString().slice(0, 10),
  source: 'https://data.iana.org/rdap/',
  hosts: [...hosts].sort(),
};
await writeFile(new URL('../src/config/rdap-hosts.json', import.meta.url), JSON.stringify(out, null, 2) + '\n');
console.log(`Wrote ${out.hosts.length} RDAP hosts`);
