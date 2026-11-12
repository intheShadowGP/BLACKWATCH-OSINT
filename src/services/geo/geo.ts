import { toDMS } from '@/utils/validation';
import { escapeHtml } from '@/services/export/format';

export interface GeoPoint {
  id: string;
  lat: number;
  lon: number;
  label: string;
  kind: 'entity' | 'event' | 'session' | 'search';
  sourceId?: string;
}

export function conversions(lat: number, lon: number) {
  return {
    decimal: `${lat.toFixed(6)}, ${lon.toFixed(6)}`,
    dms: `${toDMS(lat, true)} ${toDMS(lon, false)}`,
    geoUri: `geo:${lat.toFixed(6)},${lon.toFixed(6)}`,
    osm: `https://www.openstreetmap.org/?mlat=${lat.toFixed(6)}&mlon=${lon.toFixed(6)}#map=17/${lat.toFixed(6)}/${lon.toFixed(6)}`,
    googleMaps: `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(6)},${lon.toFixed(6)}`,
    bingMaps: `https://www.bing.com/maps?cp=${lat.toFixed(6)}~${lon.toFixed(6)}&lvl=17&style=h`,
    sentinel: `https://browser.dataspace.copernicus.eu/?lat=${lat.toFixed(5)}&lng=${lon.toFixed(5)}&zoom=14`,
  };
}

/** Haversine distance in km. */
export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371.0088;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Parses "lat,lon[,label]" lines or a GeoJSON FeatureCollection of points. */
export function parseCoordinateImport(text: string, max = 5000): { points: Array<{ lat: number; lon: number; label: string }>; errors: number } {
  const out: Array<{ lat: number; lon: number; label: string }> = [];
  let errors = 0;
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) {
    try {
      const gj = JSON.parse(trimmed) as { features?: Array<{ geometry?: { type?: string; coordinates?: unknown[] }; properties?: Record<string, unknown> }> };
      for (const f of gj.features ?? []) {
        const c = f.geometry?.coordinates;
        if (f.geometry?.type !== 'Point' || !Array.isArray(c)) {
          errors++;
          continue;
        }
        const lon = Number(c[0]);
        const lat = Number(c[1]);
        if (valid(lat, lon)) out.push({ lat, lon, label: String(f.properties?.name ?? f.properties?.label ?? '').slice(0, 200) });
        else errors++;
        if (out.length >= max) break;
      }
    } catch {
      errors++;
    }
    return { points: out, errors };
  }
  for (const line of trimmed.split(/\r?\n/)) {
    if (!line.trim() || /^\s*(lat|latitude)\b/i.test(line)) continue;
    const parts = line.split(/[;,\t]/).map((s) => s.trim());
    const lat = Number(parts[0]);
    const lon = Number(parts[1]);
    if (parts.length >= 2 && valid(lat, lon)) out.push({ lat, lon, label: parts.slice(2).join(' ').slice(0, 200) });
    else errors++;
    if (out.length >= max) break;
  }
  return { points: out, errors };
}

function valid(lat: number, lon: number) {
  return Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

export function toGeoJSON(points: GeoPoint[]): string {
  return JSON.stringify(
    {
      type: 'FeatureCollection',
      features: points.map((p) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [p.lon, p.lat] }, properties: { name: p.label, kind: p.kind, source: p.sourceId } })),
    },
    null,
    2,
  );
}

export function toKML(points: GeoPoint[], name: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${escapeHtml(name)}</name>
${points.map((p) => `<Placemark><name>${escapeHtml(p.label)}</name><description>${escapeHtml(p.kind)}</description><Point><coordinates>${p.lon},${p.lat},0</coordinates></Point></Placemark>`).join('\n')}
</Document></kml>`;
}
