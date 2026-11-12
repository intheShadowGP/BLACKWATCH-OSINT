import { SOURCES } from '../services/sources/catalog.ts';
import rdap from './rdap-hosts.json' with { type: 'json' };

/** Every host BLACKWATCH may contact: catalogue API hosts + IANA-designated RDAP servers. */
export function allowedConnectHosts(): string[] {
  const set = new Set<string>();
  for (const s of SOURCES) if (s.access === 'api') for (const h of s.hosts) set.add(h);
  for (const h of rdap.hosts) set.add(h);
  return [...set].sort();
}

/**
 * Content-Security-Policy delivered via <meta> (GitHub Pages cannot set headers).
 * Notes:
 *  - frame-ancestors / report-uri are ignored in <meta>; documented in SECURITY.md.
 *  - style-src needs 'unsafe-inline' for Leaflet/Cytoscape inline positioning styles;
 *    scripts stay strictly 'self'.
 *  - Remote images are limited to OSM tiles: avatars from third parties are never
 *    hot-linked, to avoid leaking the analyst's IP to profile hosts.
 */
export function buildCsp({ dev }: { dev: boolean }): string {
  const connect = ["'self'", ...allowedConnectHosts().map((h) => `https://${h}`)];
  if (dev) connect.push('ws://localhost:*', 'ws://127.0.0.1:*');
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': dev ? ["'self'", "'unsafe-inline'"] : ["'self'"],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:', 'https://tile.openstreetmap.org'],
    'font-src': ["'self'", 'data:'],
    'connect-src': connect,
    'worker-src': ["'self'", 'blob:'],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'none'"],
    'frame-src': ["'none'"],
    'media-src': ["'self'", 'blob:'],
    'manifest-src': ["'self'"],
  };
  return Object.entries(directives)
    .map(([k, v]) => `${k} ${v.join(' ')}`)
    .join('; ');
}
