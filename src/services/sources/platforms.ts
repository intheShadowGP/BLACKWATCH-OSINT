import { USERNAME_CHECK_SOURCES } from '@/services/adapters/social';

/**
 * Extensible platform catalogue for username & SOCMINT modules.
 * Each entry is an "adapter" description: profile URL model, official search
 * URL, verification method and its reliability.
 */
export type VerificationMethod = 'official-api' | 'manual';
export type Reliability = 'high' | 'medium' | 'manual';

export interface Platform {
  id: string; // same id as the catalogue source
  name: string;
  profileUrl: (u: string) => string;
  searchUrl?: (q: string) => string;
  /** Regex extracting the username from a profile URL. */
  urlPattern?: RegExp;
  method: VerificationMethod;
  reliability: Reliability;
  /** Accepted username syntax on the platform (when documented). */
  usernameRule?: RegExp;
  restrictions?: string;
}

const enc = encodeURIComponent;

export const PLATFORMS: Platform[] = [
  { id: 'github', name: 'GitHub', profileUrl: (u) => `https://github.com/${enc(u)}`, searchUrl: (q) => `https://github.com/search?q=${enc(q)}&type=users`, urlPattern: /^https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9-]{1,39})\/?$/i, method: 'official-api', reliability: 'high', usernameRule: /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/ },
  { id: 'gitlab', name: 'GitLab', profileUrl: (u) => `https://gitlab.com/${enc(u)}`, searchUrl: (q) => `https://gitlab.com/search?search=${enc(q)}&scope=users`, urlPattern: /^https?:\/\/(?:www\.)?gitlab\.com\/([A-Za-z0-9_.-]+)\/?$/i, method: 'official-api', reliability: 'high' },
  { id: 'codeberg', name: 'Codeberg', profileUrl: (u) => `https://codeberg.org/${enc(u)}`, urlPattern: /^https?:\/\/codeberg\.org\/([A-Za-z0-9_.-]+)\/?$/i, method: 'official-api', reliability: 'high' },
  { id: 'bluesky', name: 'Bluesky', profileUrl: (u) => `https://bsky.app/profile/${enc(u.includes('.') ? u : `${u}.bsky.social`)}`, searchUrl: (q) => `https://bsky.app/search?q=${enc(q)}`, urlPattern: /^https?:\/\/bsky\.app\/profile\/([A-Za-z0-9_.:-]+)\/?$/i, method: 'official-api', reliability: 'high' },
  { id: 'mastodon-social', name: 'Mastodon (mastodon.social)', profileUrl: (u) => `https://mastodon.social/@${enc(u)}`, searchUrl: (q) => `https://mastodon.social/search?q=${enc(q)}`, urlPattern: /^https?:\/\/mastodon\.social\/@([A-Za-z0-9_]+)\/?$/i, method: 'official-api', reliability: 'high', restrictions: 'Only the mastodon.social instance is checked.' },
  { id: 'hackernews', name: 'Hacker News', profileUrl: (u) => `https://news.ycombinator.com/user?id=${enc(u)}`, searchUrl: (q) => `https://hn.algolia.com/?q=${enc(q)}`, urlPattern: /^https?:\/\/news\.ycombinator\.com\/user\?id=([A-Za-z0-9_-]+)$/i, method: 'official-api', reliability: 'high', restrictions: 'Case-sensitive identifiers.' },
  { id: 'keybase', name: 'Keybase', profileUrl: (u) => `https://keybase.io/${enc(u)}`, urlPattern: /^https?:\/\/keybase\.io\/([A-Za-z0-9_]+)\/?$/i, method: 'official-api', reliability: 'high' },
  { id: 'devto', name: 'DEV Community', profileUrl: (u) => `https://dev.to/${enc(u)}`, searchUrl: (q) => `https://dev.to/search?q=${enc(q)}`, urlPattern: /^https?:\/\/dev\.to\/([A-Za-z0-9_]+)\/?$/i, method: 'official-api', reliability: 'high' },
  { id: 'chesscom', name: 'Chess.com', profileUrl: (u) => `https://www.chess.com/member/${enc(u)}`, urlPattern: /^https?:\/\/(?:www\.)?chess\.com\/member\/([A-Za-z0-9_-]+)\/?$/i, method: 'official-api', reliability: 'high' },
  { id: 'lichess', name: 'Lichess', profileUrl: (u) => `https://lichess.org/@/${enc(u)}`, urlPattern: /^https?:\/\/lichess\.org\/@\/([A-Za-z0-9_-]+)\/?$/i, method: 'official-api', reliability: 'high' },
  { id: 'wikipedia', name: 'Wikipedia (en)', profileUrl: (u) => `https://en.wikipedia.org/wiki/User:${enc(u)}`, searchUrl: (q) => `https://en.wikipedia.org/w/index.php?search=${enc(q)}`, method: 'official-api', reliability: 'high' },
  // Manual platforms — official URLs only, the analyst confirms visually.
  { id: 'x', name: 'X (Twitter)', profileUrl: (u) => `https://x.com/${enc(u)}`, searchUrl: (q) => `https://x.com/search?q=${enc(q)}&f=user`, urlPattern: /^https?:\/\/(?:www\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/?$/i, method: 'manual', reliability: 'manual', usernameRule: /^[A-Za-z0-9_]{1,15}$/, restrictions: 'Login wall for most content.' },
  { id: 'instagram', name: 'Instagram', profileUrl: (u) => `https://www.instagram.com/${enc(u)}/`, searchUrl: (q) => `https://www.instagram.com/explore/search/keyword/?q=${enc(q)}`, urlPattern: /^https?:\/\/(?:www\.)?instagram\.com\/([A-Za-z0-9_.]{1,30})\/?$/i, method: 'manual', reliability: 'manual', usernameRule: /^[A-Za-z0-9_.]{1,30}$/ },
  { id: 'facebook', name: 'Facebook', profileUrl: (u) => `https://www.facebook.com/${enc(u)}`, searchUrl: (q) => `https://www.facebook.com/search/top?q=${enc(q)}`, urlPattern: /^https?:\/\/(?:www\.|m\.)?facebook\.com\/([A-Za-z0-9.]{5,})\/?$/i, method: 'manual', reliability: 'manual' },
  { id: 'tiktok', name: 'TikTok', profileUrl: (u) => `https://www.tiktok.com/@${enc(u)}`, searchUrl: (q) => `https://www.tiktok.com/search/user?q=${enc(q)}`, urlPattern: /^https?:\/\/(?:www\.)?tiktok\.com\/@([A-Za-z0-9_.]+)\/?$/i, method: 'manual', reliability: 'manual' },
  { id: 'linkedin', name: 'LinkedIn', profileUrl: (u) => `https://www.linkedin.com/in/${enc(u)}/`, searchUrl: (q) => `https://www.linkedin.com/search/results/all/?keywords=${enc(q)}`, urlPattern: /^https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/in\/([A-Za-z0-9_-]+)\/?$/i, method: 'manual', reliability: 'manual', restrictions: 'Login required.' },
  { id: 'reddit', name: 'Reddit', profileUrl: (u) => `https://www.reddit.com/user/${enc(u)}/`, searchUrl: (q) => `https://www.reddit.com/search/?q=${enc(q)}`, urlPattern: /^https?:\/\/(?:www\.|old\.)?reddit\.com\/(?:u|user)\/([A-Za-z0-9_-]{3,20})\/?$/i, method: 'manual', reliability: 'manual', usernameRule: /^[A-Za-z0-9_-]{3,20}$/ },
  { id: 'youtube', name: 'YouTube', profileUrl: (u) => `https://www.youtube.com/@${enc(u)}`, searchUrl: (q) => `https://www.youtube.com/results?search_query=${enc(q)}`, urlPattern: /^https?:\/\/(?:www\.)?youtube\.com\/@([A-Za-z0-9_.-]+)\/?$/i, method: 'manual', reliability: 'manual' },
  { id: 'telegram', name: 'Telegram', profileUrl: (u) => `https://t.me/${enc(u)}`, urlPattern: /^https?:\/\/t\.me\/([A-Za-z0-9_]{5,32})\/?$/i, method: 'manual', reliability: 'manual', usernameRule: /^[A-Za-z0-9_]{5,32}$/ },
  { id: 'twitch', name: 'Twitch', profileUrl: (u) => `https://www.twitch.tv/${enc(u)}`, searchUrl: (q) => `https://www.twitch.tv/search?term=${enc(q)}`, urlPattern: /^https?:\/\/(?:www\.)?twitch\.tv\/([A-Za-z0-9_]{4,25})\/?$/i, method: 'manual', reliability: 'manual' },
  { id: 'pinterest', name: 'Pinterest', profileUrl: (u) => `https://www.pinterest.com/${enc(u)}/`, searchUrl: (q) => `https://www.pinterest.com/search/users/?q=${enc(q)}`, method: 'manual', reliability: 'manual' },
  { id: 'dockerhub', name: 'Docker Hub', profileUrl: (u) => `https://hub.docker.com/u/${enc(u)}`, method: 'manual', reliability: 'manual' },
  { id: 'steam', name: 'Steam Community', profileUrl: (u) => `https://steamcommunity.com/id/${enc(u)}`, urlPattern: /^https?:\/\/steamcommunity\.com\/id\/([A-Za-z0-9_-]+)\/?$/i, method: 'manual', reliability: 'manual' },
  { id: 'medium', name: 'Medium', profileUrl: (u) => `https://medium.com/@${enc(u)}`, searchUrl: (q) => `https://medium.com/search/users?q=${enc(q)}`, urlPattern: /^https?:\/\/medium\.com\/@([A-Za-z0-9_.-]+)\/?$/i, method: 'manual', reliability: 'manual' },
  { id: 'threads', name: 'Threads', profileUrl: (u) => `https://www.threads.com/@${enc(u)}`, urlPattern: /^https?:\/\/(?:www\.)?threads\.(?:net|com)\/@([A-Za-z0-9_.]+)\/?$/i, method: 'manual', reliability: 'manual' },
  { id: 'vk', name: 'VK', profileUrl: (u) => `https://vk.com/${enc(u)}`, method: 'manual', reliability: 'manual' },
  { id: 'soundcloud', name: 'SoundCloud', profileUrl: (u) => `https://soundcloud.com/${enc(u)}`, searchUrl: (q) => `https://soundcloud.com/search/people?q=${enc(q)}`, method: 'manual', reliability: 'manual' },
];

/** Sanity check: every automated platform has a matching adapter. */
export const AUTOMATED_PLATFORM_IDS = PLATFORMS.filter((p) => p.method === 'official-api').map((p) => p.id);
if (import.meta.env?.DEV) {
  for (const id of AUTOMATED_PLATFORM_IDS) if (!USERNAME_CHECK_SOURCES.includes(id)) console.warn(`platform ${id} lacks an adapter`);
}

/** Identifies a platform + username from a profile URL. */
export function parseProfileUrl(url: string): { platform: Platform; username: string } | null {
  for (const p of PLATFORMS) {
    if (!p.urlPattern) continue;
    const m = url.trim().match(p.urlPattern);
    if (m) return { platform: p, username: decodeURIComponent(m[1]) };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Username variants                                                   */
/* ------------------------------------------------------------------ */

export function generateVariants(input: string, max = 40): string[] {
  const base = input.trim().replace(/^@/, '');
  if (!base) return [];
  const out = new Set<string>();
  const lower = base.toLowerCase();
  out.add(base);
  out.add(lower);
  const parts = lower.split(/[._\-\s]+/).filter(Boolean);
  if (parts.length > 1) {
    for (const sep of ['', '.', '_', '-']) out.add(parts.join(sep));
    out.add(parts.slice().reverse().join(''));
    out.add(parts.slice().reverse().join('.'));
    out.add(parts.slice().reverse().join('_'));
    out.add(parts[0][0] + parts.slice(1).join(''));
    out.add(parts[0] + parts[parts.length - 1][0]);
  }
  const noDigits = lower.replace(/\d+$/, '');
  if (noDigits && noDigits !== lower) out.add(noDigits);
  const noSep = lower.replace(/[._-]/g, '');
  out.add(noSep);
  out.add(`${noSep}_`);
  out.add(`_${noSep}`);
  out.add(`the${noSep}`);
  out.add(`${noSep}official`);
  out.add(`real${noSep}`);
  const leet = noSep.replace(/a/g, '4').replace(/e/g, '3').replace(/i/g, '1').replace(/o/g, '0');
  if (leet !== noSep) out.add(leet);
  return [...out].filter((v) => /^[A-Za-z0-9._-]{1,64}$/.test(v)).slice(0, max);
}
