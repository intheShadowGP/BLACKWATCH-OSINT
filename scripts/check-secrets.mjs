#!/usr/bin/env node
// Fails the build if anything resembling a secret is present in the source,
// the public folder, the build output, or if a .env file is tracked.
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const PATTERNS = [
  [/ghp_[A-Za-z0-9]{30,}/, 'GitHub token'],
  [/github_pat_[A-Za-z0-9_]{40,}/, 'GitHub fine-grained token'],
  [/sk-[A-Za-z0-9]{20,}/, 'API secret key (sk-)'],
  [/AKIA[0-9A-Z]{16}/, 'AWS access key'],
  [/AIza[0-9A-Za-z_-]{35}/, 'Google API key'],
  [/xox[baprs]-[A-Za-z0-9-]{10,}/, 'Slack token'],
  [/-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/, 'Private key'],
  [/VITE_[A-Z_]*(SECRET|TOKEN|PASSWORD|KEY)\s*=/, 'Secret-looking VITE_ variable'],
];

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

let failures = 0;
for (const file of [...walk('src'), ...walk('public'), ...walk('dist'), 'index.html', 'vite.config.ts']) {
  if (!existsSync(file) || /\.(png|jpe?g|gif|webp|ico|woff2?)$/i.test(file)) continue;
  const text = readFileSync(file, 'utf8');
  for (const [re, label] of PATTERNS) {
    if (re.test(text)) {
      console.error(`✗ ${label} pattern found in ${file}`);
      failures++;
    }
  }
}

try {
  const tracked = execSync('git ls-files', { encoding: 'utf8' }).split('\n');
  for (const f of tracked) {
    if (/(^|\/)\.env(\.|$)/.test(f) && !/\.env\.example$/.test(f)) {
      console.error(`✗ tracked environment file: ${f}`);
      failures++;
    }
  }
} catch {
  /* not a git checkout */
}

if (failures) {
  console.error(`\n${failures} potential secret(s) found.`);
  process.exit(1);
}
console.log('✓ no secrets detected');
