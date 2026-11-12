import type { QueryType } from '@/types';
import { externalFetch } from './http';
import { arr, mkResult, num, obj, str, type AdapterContext, type AdapterOutput, type AdapterResultItem, type SourceAdapter } from './types';

/**
 * Username adapters only use official public JSON endpoints. A "found" result
 * means "the platform returned a public profile with this exact identifier";
 * it does NOT prove the account belongs to the person under investigation.
 */
interface ProfileCheck {
  sourceId: string;
  url: (u: string) => string;
  /** Turns the response into a profile or null (not found). */
  parse: (status: number, json: unknown, u: string) => Profile | null | 'error';
  normalise?: (u: string) => string;
}

export interface Profile {
  url: string;
  handle: string;
  displayName?: string;
  createdAt?: string;
  data: Record<string, unknown>;
  linked?: Array<{ service: string; value: string; url?: string }>;
}

const CHECKS: ProfileCheck[] = [
  {
    sourceId: 'github',
    url: (u) => `https://api.github.com/users/${encodeURIComponent(u)}`,
    parse: (s, j) => {
      if (s === 404) return null;
      if (s !== 200) return 'error';
      const o = obj(j);
      const login = str(o.login);
      if (!login) return null;
      const linked: Profile['linked'] = [];
      if (str(o.blog)) linked.push({ service: 'website', value: str(o.blog)! });
      if (str(o.twitter_username)) linked.push({ service: 'x', value: str(o.twitter_username)!, url: `https://x.com/${str(o.twitter_username)}` });
      return {
        url: str(o.html_url) ?? `https://github.com/${login}`,
        handle: login,
        displayName: str(o.name),
        createdAt: str(o.created_at),
        data: { bio: str(o.bio), location: str(o.location), company: str(o.company), publicRepos: num(o.public_repos), followers: num(o.followers), type: str(o.type) },
        linked,
      };
    },
  },
  {
    sourceId: 'gitlab',
    url: (u) => `https://gitlab.com/api/v4/users?username=${encodeURIComponent(u)}`,
    parse: (s, j) => {
      if (s !== 200) return 'error';
      const o = obj(arr(j)[0]);
      const username = str(o.username);
      if (!username) return null;
      return { url: str(o.web_url) ?? `https://gitlab.com/${username}`, handle: username, displayName: str(o.name), data: { state: str(o.state) } };
    },
  },
  {
    sourceId: 'codeberg',
    url: (u) => `https://codeberg.org/api/v1/users/${encodeURIComponent(u)}`,
    parse: (s, j) => {
      if (s === 404) return null;
      if (s !== 200) return 'error';
      const o = obj(j);
      const login = str(o.login);
      if (!login) return null;
      return { url: `https://codeberg.org/${login}`, handle: login, displayName: str(o.full_name), createdAt: str(o.created), data: { location: str(o.location), website: str(o.website), description: str(o.description) } };
    },
  },
  {
    sourceId: 'bluesky',
    normalise: (u) => (u.includes('.') ? u.toLowerCase() : `${u.toLowerCase()}.bsky.social`),
    url: (u) => `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(u)}`,
    parse: (s, j) => {
      if (s === 400 || s === 404) return null;
      if (s !== 200) return 'error';
      const o = obj(j);
      const handle = str(o.handle);
      if (!handle) return null;
      return {
        url: `https://bsky.app/profile/${handle}`,
        handle,
        displayName: str(o.displayName),
        createdAt: str(o.createdAt),
        data: { did: str(o.did), description: str(o.description), followers: num(o.followersCount), posts: num(o.postsCount) },
      };
    },
  },
  {
    sourceId: 'mastodon-social',
    url: (u) => `https://mastodon.social/api/v1/accounts/lookup?acct=${encodeURIComponent(u)}`,
    parse: (s, j) => {
      if (s === 404) return null;
      if (s !== 200) return 'error';
      const o = obj(j);
      const acct = str(o.acct);
      if (!acct) return null;
      return { url: str(o.url) ?? `https://mastodon.social/@${acct}`, handle: acct, displayName: str(o.display_name), createdAt: str(o.created_at), data: { followers: num(o.followers_count), statuses: num(o.statuses_count), bot: o.bot === true } };
    },
  },
  {
    sourceId: 'hackernews',
    url: (u) => `https://hacker-news.firebaseio.com/v0/user/${encodeURIComponent(u)}.json`,
    parse: (s, j) => {
      if (s !== 200) return 'error';
      if (j === null) return null; // HN returns 200 + null for unknown users
      const o = obj(j);
      const id = str(o.id);
      if (!id) return null;
      return { url: `https://news.ycombinator.com/user?id=${encodeURIComponent(id)}`, handle: id, createdAt: num(o.created) ? new Date(num(o.created)! * 1000).toISOString() : undefined, data: { karma: num(o.karma) } };
    },
  },
  {
    sourceId: 'keybase',
    url: (u) => `https://keybase.io/_/api/1.0/user/lookup.json?usernames=${encodeURIComponent(u)}&fields=basics,profile,proofs_summary`,
    parse: (s, j) => {
      if (s !== 200) return s === 404 ? null : 'error';
      const them = arr(obj(j).them);
      const o = obj(them[0]);
      const basics = obj(o.basics);
      const username = str(basics.username);
      if (!username) return null;
      const linked = arr(obj(o.proofs_summary).all)
        .map(obj)
        .map((p) => ({ service: str(p.proof_type) ?? 'proof', value: str(p.nametag) ?? '', url: str(p.service_url) }))
        .filter((p) => p.value);
      return { url: `https://keybase.io/${username}`, handle: username, displayName: str(obj(o.profile).full_name), createdAt: num(basics.ctime) ? new Date(num(basics.ctime)! * 1000).toISOString() : undefined, data: { bio: str(obj(o.profile).bio) }, linked };
    },
  },
  {
    sourceId: 'devto',
    url: (u) => `https://dev.to/api/users/by_username?url=${encodeURIComponent(u)}`,
    parse: (s, j) => {
      if (s === 404) return null;
      if (s !== 200) return 'error';
      const o = obj(j);
      const username = str(o.username);
      if (!username) return null;
      const linked: Profile['linked'] = [];
      if (str(o.github_username)) linked.push({ service: 'github', value: str(o.github_username)!, url: `https://github.com/${str(o.github_username)}` });
      if (str(o.twitter_username)) linked.push({ service: 'x', value: str(o.twitter_username)!, url: `https://x.com/${str(o.twitter_username)}` });
      if (str(o.website_url)) linked.push({ service: 'website', value: str(o.website_url)! });
      return { url: `https://dev.to/${username}`, handle: username, displayName: str(o.name), createdAt: str(o.joined_at), data: { location: str(o.location), summary: str(o.summary) }, linked };
    },
  },
  {
    sourceId: 'chesscom',
    normalise: (u) => u.toLowerCase(),
    url: (u) => `https://api.chess.com/pub/player/${encodeURIComponent(u)}`,
    parse: (s, j) => {
      if (s === 404 || s === 410) return null;
      if (s !== 200) return 'error';
      const o = obj(j);
      const username = str(o.username);
      if (!username) return null;
      return { url: str(o.url) ?? `https://www.chess.com/member/${username}`, handle: username, displayName: str(o.name), createdAt: num(o.joined) ? new Date(num(o.joined)! * 1000).toISOString() : undefined, data: { status: str(o.status), location: str(o.location) } };
    },
  },
  {
    sourceId: 'lichess',
    url: (u) => `https://lichess.org/api/user/${encodeURIComponent(u)}`,
    parse: (s, j) => {
      if (s === 404) return null;
      if (s !== 200) return 'error';
      const o = obj(j);
      const username = str(o.username);
      if (!username) return null;
      return { url: `https://lichess.org/@/${username}`, handle: username, createdAt: num(o.createdAt) ? new Date(num(o.createdAt)!).toISOString() : undefined, data: { disabled: o.disabled === true, closed: o.closed === true } };
    },
  },
  {
    sourceId: 'wikipedia',
    url: (u) => `https://en.wikipedia.org/w/api.php?action=query&list=users&ususers=${encodeURIComponent(u)}&usprop=registration%7Ceditcount&format=json&origin=*`,
    parse: (s, j) => {
      if (s !== 200) return 'error';
      const user = obj(arr(obj(obj(j).query).users)[0]);
      if ('missing' in user || 'invalid' in user || !str(user.name)) return null;
      const name = str(user.name)!;
      return { url: `https://en.wikipedia.org/wiki/User:${encodeURIComponent(name.replace(/ /g, '_'))}`, handle: name, createdAt: str(user.registration), data: { editcount: num(user.editcount) } };
    },
  },
];

export const USERNAME_CHECK_SOURCES = CHECKS.map((c) => c.sourceId);

export async function checkProfile(sourceId: string, username: string, ctx: Pick<AdapterContext, 'signal' | 'manual'>): Promise<Profile | null> {
  const c = CHECKS.find((x) => x.sourceId === sourceId);
  if (!c) throw new Error('unsupported');
  const u = c.normalise ? c.normalise(username) : username;
  const res = await externalFetch({ sourceId, url: c.url(u), sentValue: u, signal: ctx.signal, manual: ctx.manual });
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    json = undefined;
  }
  const parsed = c.parse(res.status, json, u);
  if (parsed === 'error') throw new Error(`HTTP ${res.status}`);
  return parsed;
}

export function profileToResults(sourceId: string, query: string, queryType: QueryType, p: Profile): AdapterResultItem[] {
  const out: AdapterResultItem[] = [
    mkResult({
      sourceId,
      queryType,
      query,
      type: 'account',
      kind: 'Public profile',
      value: p.url,
      url: p.url,
      infoDate: p.createdAt,
      // Exact-match handle from the official API; ownership is NOT established.
      confidence: p.handle.toLowerCase() === query.toLowerCase() ? 'high' : 'medium',
      data: { handle: p.handle, displayName: p.displayName, createdAt: p.createdAt, ...p.data },
    }),
  ];
  for (const l of p.linked ?? []) {
    out.push(
      mkResult({
        sourceId,
        queryType,
        query,
        type: l.service === 'website' ? 'url' : 'account',
        kind: `Self-declared link (${l.service})`,
        value: l.url ?? l.value,
        url: l.url ?? (/^https?:\/\//.test(l.value) ? l.value : undefined),
        confidence: 'low',
        verification: 'unverified',
        data: { service: l.service, declaredOn: p.url },
      }),
    );
  }
  return out;
}

function profileAdapter(sourceId: string): SourceAdapter {
  return {
    sourceId,
    queryTypes: ['username'],
    async run(query, queryType, ctx) {
      const p = await checkProfile(sourceId, query.replace(/^@/, ''), ctx);
      if (!p) return { status: 'completed', results: [], message: 'no public profile returned' };
      return { status: 'completed', results: profileToResults(sourceId, query, queryType, p) };
    },
  };
}

export const profileAdapters: SourceAdapter[] = CHECKS.map((c) => profileAdapter(c.sourceId));

/* -------------------------- Keyword / mention search -------------------------- */

export const bskySearchAdapter = async (query: string, queryType: QueryType, ctx: AdapterContext): Promise<AdapterOutput> => {
  const url = `https://public.api.bsky.app/xrpc/app.bsky.actor.searchActors?q=${encodeURIComponent(query)}&limit=${Math.min(25, ctx.maxResults)}`;
  const res = await externalFetch({ sourceId: 'bluesky', url, sentValue: query, signal: ctx.signal, manual: ctx.manual });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const results = arr(obj(await res.json()).actors)
    .map(obj)
    .filter((a) => str(a.handle))
    .map((a) =>
      mkResult({
        sourceId: 'bluesky',
        queryType,
        query,
        type: 'account',
        kind: 'Account search match',
        value: `https://bsky.app/profile/${str(a.handle)}`,
        url: `https://bsky.app/profile/${str(a.handle)}`,
        infoDate: str(a.createdAt),
        confidence: 'low',
        verification: 'unverified',
        data: { handle: str(a.handle), displayName: str(a.displayName), description: str(a.description, 300) },
      }),
    );
  return { status: 'completed', results };
};

export const mastodonSearchAdapter = async (query: string, queryType: QueryType, ctx: AdapterContext): Promise<AdapterOutput> => {
  const url = `https://mastodon.social/api/v2/search?q=${encodeURIComponent(query)}&type=accounts&limit=${Math.min(20, ctx.maxResults)}`;
  const res = await externalFetch({ sourceId: 'mastodon-social', url, sentValue: query, signal: ctx.signal, manual: ctx.manual });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const results = arr(obj(await res.json()).accounts)
    .map(obj)
    .filter((a) => str(a.url))
    .map((a) =>
      mkResult({
        sourceId: 'mastodon-social',
        queryType,
        query,
        type: 'account',
        kind: 'Account search match',
        value: str(a.url)!,
        url: str(a.url),
        infoDate: str(a.created_at),
        confidence: 'low',
        verification: 'unverified',
        data: { acct: str(a.acct), displayName: str(a.display_name) },
      }),
    );
  return { status: 'completed', results };
};

export const hnAlgoliaAdapter: SourceAdapter = {
  sourceId: 'hn-algolia',
  queryTypes: ['keyword', 'domain', 'username'],
  async run(query, queryType, ctx) {
    const q = queryType === 'username' ? `author_${query}` : query;
    const url =
      queryType === 'username'
        ? `https://hn.algolia.com/api/v1/search?tags=${encodeURIComponent(q)}&hitsPerPage=${Math.min(50, ctx.maxResults)}`
        : `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(q)}&hitsPerPage=${Math.min(50, ctx.maxResults)}`;
    const res = await externalFetch({ sourceId: 'hn-algolia', url, sentValue: query, signal: ctx.signal, manual: ctx.manual });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = obj(await res.json());
    const results = arr(json.hits)
      .map(obj)
      .map((h) => {
        const id = str(h.objectID);
        const link = `https://news.ycombinator.com/item?id=${encodeURIComponent(id ?? '')}`;
        return mkResult({
          sourceId: 'hn-algolia',
          queryType,
          query,
          type: 'url',
          kind: 'Mention (Hacker News)',
          value: str(h.title) || str(h.story_title) || str(h.comment_text, 160) || link,
          url: link,
          infoDate: str(h.created_at),
          confidence: 'medium',
          data: { author: str(h.author), externalUrl: str(h.url) },
        });
      });
    const total = num(json.nbHits) ?? results.length;
    return { status: total > results.length ? 'partial' : 'completed', results, message: total > results.length ? `${results.length}/${total} hits` : undefined };
  },
};

export const wikiSearchAdapter = async (query: string, queryType: QueryType, ctx: AdapterContext): Promise<AdapterOutput> => {
  const url = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=${Math.min(20, ctx.maxResults)}&format=json&origin=*`;
  const res = await externalFetch({ sourceId: 'wikipedia', url, sentValue: query, signal: ctx.signal, manual: ctx.manual });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = arr(await res.json());
  const titles = arr(j[1]);
  const links = arr(j[3]);
  const results = titles.map((t, i) =>
    mkResult({ sourceId: 'wikipedia', queryType, query, type: 'document', kind: 'Encyclopedia article', value: String(t), url: str(links[i]), confidence: 'medium' }),
  );
  return { status: 'completed', results };
};

export const wikidataAdapter: SourceAdapter = {
  sourceId: 'wikidata',
  queryTypes: ['keyword'],
  async run(query, queryType, ctx) {
    const url = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(query)}&language=en&uselang=en&limit=${Math.min(20, ctx.maxResults)}&format=json&origin=*`;
    const res = await externalFetch({ sourceId: 'wikidata', url, sentValue: query, signal: ctx.signal, manual: ctx.manual });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const results = arr(obj(await res.json()).search)
      .map(obj)
      .map((e) =>
        mkResult({
          sourceId: 'wikidata',
          queryType,
          query,
          type: 'other',
          kind: 'Wikidata entity',
          value: `${str(e.label) ?? str(e.id)}${str(e.description) ? ` — ${str(e.description)}` : ''}`,
          url: str(e.concepturi),
          confidence: 'medium',
          data: { id: str(e.id) },
        }),
      );
    return { status: 'completed', results };
  },
};
