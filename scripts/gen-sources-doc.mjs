#!/usr/bin/env node
// Regenerates docs/SOURCES.md from the source catalogue (single source of truth).
// Requires Node.js >= 22.18 (TypeScript type stripping).
import { writeFile } from 'node:fs/promises';
import { SOURCES } from '../src/services/sources/catalog.ts';

const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const access = { api: 'API (automatisée)', link: 'Lien manuel', local: 'Local' };
const mode = { auto: 'Auto', manual: 'Manuel', off: 'Désactivé' };

const lines = [
  '# Sources OSINT / OSINT sources',
  '',
  '> Fichier généré par `node scripts/gen-sources-doc.mjs` à partir de `src/services/sources/catalog.ts`. Ne pas éditer à la main.',
  '> Generated from the catalogue — do not edit by hand.',
  '',
  'Légende — **CORS** : résultat d’une vraie requête `fetch` depuis un navigateur sur une origine `localhost`. **Vérifiée** : date de ce test. Les sources « Lien manuel » ne déclenchent aucune requête : l’analyste ouvre la page officielle.',
  '',
];
const byCat = new Map();
for (const s of SOURCES) byCat.set(s.category, [...(byCat.get(s.category) ?? []), s]);
for (const [cat, list] of byCat) {
  lines.push(`## ${cat}`, '', '| Source | Accès | Mode par défaut | Clé | CORS | Vérifiée | Quotas connus | Données transmises | Documentation |', '|---|---|---|---|---|---|---|---|---|');
  for (const s of list) {
    lines.push(
      `| [${esc(s.name)}](${s.homepage}) | ${access[s.access]} | ${mode[s.defaultMode]} | ${s.requiresKey ? 'oui' : 'non'} | ${s.cors} | ${s.lastVerified ?? 'non vérifiée'} | ${esc(s.quota.fr)} | ${esc(s.sentData.fr)} | ${s.docsUrl ? `[docs](${s.docsUrl})` : '—'}${s.privacyUrl ? ` · [privacy](${s.privacyUrl})` : ''}${s.termsUrl ? ` · [terms](${s.termsUrl})` : ''} |`,
    );
  }
  lines.push('');
}
lines.push(
  '## Serveurs RDAP',
  '',
  'Les requêtes RDAP de domaine suivent le fichier d’amorçage officiel de l’IANA (`https://data.iana.org/rdap/dns.json`). La liste des hôtes autorisés dans la CSP est un instantané de ce registre (`src/config/rdap-hosts.json`, régénéré par `node scripts/update-rdap-hosts.mjs`). Si un registre absent de l’instantané est désigné, BLACKWATCH ne le contacte pas : il propose ICANN Lookup en consultation manuelle.',
  '',
  '## Ajouter une source',
  '',
  'Voir [CONTRIBUTING.md](CONTRIBUTING.md#ajouter-une-source).',
  '',
);
await writeFile(new URL('../docs/SOURCES.md', import.meta.url), lines.join('\n'));
console.log(`docs/SOURCES.md: ${SOURCES.length} sources`);
