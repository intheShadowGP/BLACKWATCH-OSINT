/**
 * Advanced search query builder. Pure functions: the generated query string is
 * shown verbatim to the analyst before anything is opened.
 */
export type Engine = 'google' | 'bing' | 'duckduckgo' | 'yandex';

export interface DorkInput {
  all: string;
  exact: string;
  any: string; // space-separated, joined with OR
  exclude: string; // space-separated
  site: string;
  excludeSite: string;
  filetype: string;
  intitle: string;
  inurl: string;
  intext: string;
  after: string; // YYYY-MM-DD
  before: string;
}

export const EMPTY_DORK: DorkInput = { all: '', exact: '', any: '', exclude: '', site: '', excludeSite: '', filetype: '', intitle: '', inurl: '', intext: '', after: '', before: '' };

type Op = 'site' | 'filetype' | 'intitle' | 'inurl' | 'intext' | 'after' | 'before' | 'or' | 'exclude';

/** Operator syntax per engine; null = not supported (field is dropped and reported). */
export const OPERATORS: Record<Engine, Record<Op, string | null>> = {
  google: { site: 'site:', filetype: 'filetype:', intitle: 'intitle:', inurl: 'inurl:', intext: 'intext:', after: 'after:', before: 'before:', or: 'OR', exclude: '-' },
  bing: { site: 'site:', filetype: 'filetype:', intitle: 'intitle:', inurl: null, intext: 'inbody:', after: null, before: null, or: 'OR', exclude: '-' },
  duckduckgo: { site: 'site:', filetype: 'filetype:', intitle: 'intitle:', inurl: 'inurl:', intext: null, after: null, before: null, or: 'OR', exclude: '-' },
  yandex: { site: 'site:', filetype: 'mime:', intitle: 'title:', inurl: 'url:', intext: null, after: 'date:>', before: 'date:<', or: '|', exclude: '-' },
};

export const ENGINE_URL: Record<Engine, (q: string) => string> = {
  google: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}`,
  bing: (q) => `https://www.bing.com/search?q=${encodeURIComponent(q)}`,
  duckduckgo: (q) => `https://duckduckgo.com/?q=${encodeURIComponent(q)}`,
  yandex: (q) => `https://yandex.com/search/?text=${encodeURIComponent(q)}`,
};

/** Removes characters that would break operator syntax (quotes, newlines). */
export function sanitizeTerm(s: string): string {
  return s.replace(/[\r\n\t]+/g, ' ').replace(/"/g, '').trim().slice(0, 300);
}

function quoteIfSpaced(s: string): string {
  return /\s/.test(s) ? `"${s}"` : s;
}

export function buildQuery(input: DorkInput, engine: Engine): { query: string; dropped: string[] } {
  const ops = OPERATORS[engine];
  const parts: string[] = [];
  const dropped: string[] = [];
  const add = (op: Op, value: string, field: string) => {
    const v = sanitizeTerm(value);
    if (!v) return;
    const syntax = ops[op];
    if (syntax === null) {
      dropped.push(field);
      return;
    }
    if (op === 'after' || op === 'before') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return;
      parts.push(engine === 'yandex' ? `${syntax}${v.replace(/-/g, '')}` : `${syntax}${v}`);
      return;
    }
    parts.push(`${syntax}${quoteIfSpaced(v)}`);
  };
  const all = sanitizeTerm(input.all);
  if (all) parts.push(all);
  const exact = sanitizeTerm(input.exact);
  if (exact) parts.push(`"${exact}"`);
  const any = sanitizeTerm(input.any).split(/\s+/).filter(Boolean);
  if (any.length) parts.push(any.length > 1 ? `(${any.join(` ${ops.or} `)})` : any[0]);
  for (const s of input.site.split(/[\s,]+/).filter(Boolean).slice(0, 10)) add('site', s, 'site');
  for (const s of input.excludeSite.split(/[\s,]+/).filter(Boolean).slice(0, 10)) {
    const v = sanitizeTerm(s);
    if (v) parts.push(`-${ops.site}${v}`);
  }
  add('filetype', input.filetype, 'filetype');
  add('intitle', input.intitle, 'intitle');
  add('inurl', input.inurl, 'inurl');
  add('intext', input.intext, 'intext');
  add('after', input.after, 'after');
  add('before', input.before, 'before');
  for (const x of sanitizeTerm(input.exclude).split(/\s+/).filter(Boolean)) parts.push(`-${quoteIfSpaced(x)}`);
  return { query: parts.join(' ').slice(0, 2000), dropped };
}

/* ------------------------------------------------------------------ */
/* Template library                                                    */
/* ------------------------------------------------------------------ */

export type Placeholder = 'domain' | 'name' | 'username' | 'email' | 'keyword' | 'company';

export interface DorkTemplate {
  id: string;
  category: 'people' | 'documents' | 'infrastructure' | 'social' | 'media' | 'archives' | 'organisation';
  title: { fr: string; en: string };
  /** Google-syntax template with {placeholders}. */
  template: string;
}

export const TEMPLATES: DorkTemplate[] = [
  { id: 'p-exact-name', category: 'people', title: { fr: 'Nom exact', en: 'Exact name' }, template: '"{name}"' },
  { id: 'p-name-cv', category: 'people', title: { fr: 'CV / curriculum publics', en: 'Public CV / résumé' }, template: '"{name}" (cv OR resume OR curriculum) filetype:pdf' },
  { id: 'p-username-any', category: 'people', title: { fr: 'Pseudonyme mentionné', en: 'Handle mentioned' }, template: '"{username}" -site:github.com' },
  { id: 'p-email-mention', category: 'people', title: { fr: 'Adresse e-mail mentionnée', en: 'E-mail address mentioned' }, template: '"{email}"' },
  { id: 's-linkedin', category: 'social', title: { fr: 'Profils LinkedIn publics', en: 'Public LinkedIn profiles' }, template: 'site:linkedin.com/in "{name}"' },
  { id: 's-x', category: 'social', title: { fr: 'Mentions sur X', en: 'Mentions on X' }, template: 'site:x.com "{username}"' },
  { id: 's-reddit', category: 'social', title: { fr: 'Mentions sur Reddit', en: 'Mentions on Reddit' }, template: 'site:reddit.com "{username}"' },
  { id: 's-github', category: 'social', title: { fr: 'Mentions sur GitHub', en: 'Mentions on GitHub' }, template: 'site:github.com "{username}"' },
  { id: 's-telegram', category: 'social', title: { fr: 'Canaux Telegram publics', en: 'Public Telegram channels' }, template: 'site:t.me "{keyword}"' },
  { id: 'd-pdf', category: 'documents', title: { fr: 'PDF publiés sur un domaine', en: 'PDFs published on a domain' }, template: 'site:{domain} filetype:pdf' },
  { id: 'd-office', category: 'documents', title: { fr: 'Documents bureautiques publics', en: 'Public office documents' }, template: 'site:{domain} (filetype:docx OR filetype:xlsx OR filetype:pptx)' },
  { id: 'd-reports', category: 'documents', title: { fr: 'Rapports annuels', en: 'Annual reports' }, template: '"{company}" ("annual report" OR "rapport annuel") filetype:pdf' },
  { id: 'i-subdomains', category: 'infrastructure', title: { fr: 'Sous-domaines indexés', en: 'Indexed sub-domains' }, template: 'site:*.{domain} -site:www.{domain}' },
  { id: 'i-dirlist', category: 'infrastructure', title: { fr: 'Listes de répertoires publiques', en: 'Public directory listings' }, template: 'site:{domain} intitle:"index of"' },
  { id: 'i-mentions', category: 'infrastructure', title: { fr: 'Mentions du domaine ailleurs', en: 'Domain mentioned elsewhere' }, template: '"{domain}" -site:{domain}' },
  { id: 'i-status', category: 'infrastructure', title: { fr: 'Pages de statut / documentation', en: 'Status / documentation pages' }, template: 'site:{domain} (inurl:status OR inurl:docs OR inurl:api)' },
  { id: 'm-images', category: 'media', title: { fr: 'Images sur un domaine', en: 'Images on a domain' }, template: 'site:{domain} (filetype:jpg OR filetype:png)' },
  { id: 'm-video', category: 'media', title: { fr: 'Vidéos YouTube sur un sujet', en: 'YouTube videos on a topic' }, template: 'site:youtube.com "{keyword}"' },
  { id: 'a-archive', category: 'archives', title: { fr: 'Pages archivées (archive.org)', en: 'Archived pages (archive.org)' }, template: 'site:web.archive.org "{domain}"' },
  { id: 'a-paste', category: 'archives', title: { fr: 'Mentions sur sites de partage de texte', en: 'Mentions on paste sites' }, template: '"{keyword}" (site:pastebin.com OR site:gist.github.com)' },
  { id: 'o-employees', category: 'organisation', title: { fr: 'Personnel déclaré', en: 'Declared staff' }, template: 'site:linkedin.com/in "{company}"' },
  { id: 'o-press', category: 'organisation', title: { fr: 'Communiqués de presse', en: 'Press releases' }, template: '"{company}" ("press release" OR "communiqué de presse")' },
  { id: 'o-registry', category: 'organisation', title: { fr: 'Registres d’entreprises', en: 'Company registries' }, template: '"{company}" (site:opencorporates.com OR site:pappers.fr OR site:find-and-update.company-information.service.gov.uk)' },
];

export function placeholdersOf(template: string): Placeholder[] {
  return [...new Set([...template.matchAll(/\{(\w+)\}/g)].map((m) => m[1] as Placeholder))];
}

export function fillTemplate(template: string, values: Partial<Record<Placeholder, string>>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: Placeholder) => sanitizeTerm(values[k] ?? '') || `{${k}}`);
}

/** Converts a Google-syntax query to another engine (best effort, reports unsupported operators). */
export function translateQuery(q: string, engine: Engine): { query: string; unsupported: string[] } {
  if (engine === 'google') return { query: q, unsupported: [] };
  const ops = OPERATORS[engine];
  const unsupported: string[] = [];
  const map: Record<string, Op> = { 'site:': 'site', 'filetype:': 'filetype', 'intitle:': 'intitle', 'inurl:': 'inurl', 'intext:': 'intext', 'after:': 'after', 'before:': 'before' };
  let out = q.replace(/\b(site:|filetype:|intitle:|inurl:|intext:|after:|before:)/g, (m) => {
    const target = ops[map[m]];
    if (target === null) {
      unsupported.push(m);
      return m;
    }
    return target;
  });
  if (ops.or !== 'OR') out = out.replace(/\sOR\s/g, ` ${ops.or} `);
  return { query: out, unsupported: [...new Set(unsupported)] };
}
