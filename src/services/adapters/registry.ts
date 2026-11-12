import type { QueryType } from '@/types';
import { dnsCloudflareAdapter, dnsGoogleAdapter } from './dns';
import { rdapAdapter, icannLookupUrl } from './rdap';
import { certspotterAdapter, internetdbAdapter, ipinfoAdapter, ripestatAdapter, waybackAdapter } from './network';
import { bskySearchAdapter, hnAlgoliaAdapter, mastodonSearchAdapter, profileAdapters, wikiSearchAdapter, wikidataAdapter } from './social';
import { geoAdapterRun } from './geo';
import { gravatarAdapter } from './email';
import type { SourceAdapter } from './types';
import { PLATFORMS } from '@/services/sources/platforms';
import { parseCoordinates } from '@/utils/validation';

const byId = new Map<string, SourceAdapter>();
for (const a of [dnsCloudflareAdapter, dnsGoogleAdapter, rdapAdapter, certspotterAdapter, waybackAdapter, ripestatAdapter, ipinfoAdapter, internetdbAdapter, hnAlgoliaAdapter, wikidataAdapter, gravatarAdapter, ...profileAdapters]) {
  byId.set(a.sourceId, a);
}

/** Sources that behave differently per query type are composed here. */
function compose(sourceId: string, username: SourceAdapter | undefined, keyword: SourceAdapter['run'], keywordTypes: QueryType[]): SourceAdapter {
  return {
    sourceId,
    queryTypes: [...(username ? (['username'] as QueryType[]) : []), ...keywordTypes],
    run: (q, t, ctx) => (t === 'username' && username ? username.run(q, t, ctx) : keyword(q, t, ctx)),
  };
}
byId.set('bluesky', compose('bluesky', byId.get('bluesky'), bskySearchAdapter, ['keyword']));
byId.set('mastodon-social', compose('mastodon-social', byId.get('mastodon-social'), mastodonSearchAdapter, ['keyword']));
byId.set('wikipedia', compose('wikipedia', byId.get('wikipedia'), wikiSearchAdapter, ['keyword']));
byId.set('nominatim', { sourceId: 'nominatim', queryTypes: ['keyword', 'coordinates'], run: (q, t, c) => geoAdapterRun('nominatim', q, t, c) });
byId.set('photon', { sourceId: 'photon', queryTypes: ['keyword'], run: (q, t, c) => geoAdapterRun('photon', q, t, c) });

export function getAdapter(sourceId: string): SourceAdapter | undefined {
  return byId.get(sourceId);
}

export function adaptersFor(queryType: QueryType): SourceAdapter[] {
  return [...byId.values()].filter((a) => a.queryTypes.includes(queryType));
}

/** Fallbacks proposed (and auto-tried when allowed) when a source is unavailable. */
export const ALTERNATIVES: Record<string, string[]> = {
  'dns-cloudflare': ['dns-google'],
  'dns-google': ['dns-cloudflare'],
  nominatim: ['photon'],
  photon: ['nominatim'],
  rdap: ['icann-lookup'],
  certspotter: ['crtsh'],
};

/* ------------------------------------------------------------------ */
/* Manual links for link-only sources                                  */
/* ------------------------------------------------------------------ */

const enc = encodeURIComponent;

export function manualUrl(sourceId: string, query: string, queryType: QueryType): string | null {
  switch (sourceId) {
    case 'crtsh':
      return `https://crt.sh/?q=${enc(queryType === 'domain' ? `%.${query}` : query)}`;
    case 'icann-lookup':
      return icannLookupUrl(query);
    case 'google':
      return `https://www.google.com/search?q=${enc(queryType === 'domain' ? `site:${query}` : `"${query}"`)}`;
    case 'bing':
      return `https://www.bing.com/search?q=${enc(queryType === 'domain' ? `site:${query}` : `"${query}"`)}`;
    case 'duckduckgo':
      return `https://duckduckgo.com/?q=${enc(queryType === 'domain' ? `site:${query}` : `"${query}"`)}`;
    case 'yandex':
      return `https://yandex.com/search/?text=${enc(queryType === 'domain' ? `site:${query}` : `"${query}"`)}`;
    case 'hibp':
      return 'https://haveibeenpwned.com/';
    case 'virustotal':
      return queryType === 'domain'
        ? `https://www.virustotal.com/gui/domain/${enc(query)}`
        : queryType === 'url'
          ? `https://www.virustotal.com/gui/search/${enc(query)}`
          : `https://www.virustotal.com/gui/ip-address/${enc(query)}`;
    case 'urlscan':
      return `https://urlscan.io/search/#${enc(queryType === 'domain' ? `domain:${query}` : queryType === 'ipv4' ? `ip:"${query}"` : `"${query}"`)}`;
    case 'google-maps': {
      const c = parseCoordinates(query);
      return c ? `https://www.google.com/maps/@?api=1&map_action=map&center=${c.lat},${c.lon}&zoom=18&basemap=satellite` : `https://www.google.com/maps/search/?api=1&query=${enc(query)}`;
    }
    default: {
      const p = PLATFORMS.find((x) => x.id === sourceId);
      if (!p) return null;
      if (queryType === 'username') return p.profileUrl(query.replace(/^@/, ''));
      return p.searchUrl ? p.searchUrl(query) : null;
    }
  }
}
