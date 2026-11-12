import { externalFetch } from './http';
import { arr, mkResult, num, obj, str, type AdapterContext, type AdapterOutput } from './types';
import type { QueryType } from '@/types';
import { parseCoordinates } from '@/utils/validation';

export interface Place {
  name: string;
  lat: number;
  lon: number;
  type?: string;
  osmUrl?: string;
  sourceId: string;
}

export async function geocode(query: string, ctx: Pick<AdapterContext, 'signal' | 'manual'>, sourceId: 'nominatim' | 'photon' = 'nominatim'): Promise<Place[]> {
  if (sourceId === 'photon') {
    const res = await externalFetch({ sourceId, url: `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=10`, sentValue: query, ...ctx });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return arr(obj(await res.json()).features)
      .map(obj)
      .map((f) => {
        const p = obj(f.properties);
        const c = arr(obj(f.geometry).coordinates);
        const name = [str(p.name), str(p.street), str(p.city), str(p.country)].filter(Boolean).join(', ');
        const osmType = str(p.osm_type);
        const osmId = num(p.osm_id);
        const t = osmType === 'N' ? 'node' : osmType === 'W' ? 'way' : osmType === 'R' ? 'relation' : undefined;
        return { name, lat: Number(c[1]), lon: Number(c[0]), type: str(p.osm_value), osmUrl: t && osmId ? `https://www.openstreetmap.org/${t}/${osmId}` : undefined, sourceId };
      })
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
  }
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=jsonv2&limit=10&addressdetails=0`;
  const res = await externalFetch({ sourceId, url, sentValue: query, ...ctx });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return arr(await res.json())
    .map(obj)
    .map((p) => ({
      name: str(p.display_name) ?? '',
      lat: Number(p.lat),
      lon: Number(p.lon),
      type: str(p.type),
      osmUrl: str(p.osm_type) && p.osm_id ? `https://www.openstreetmap.org/${str(p.osm_type)}/${String(p.osm_id)}` : undefined,
      sourceId,
    }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
}

export async function reverseGeocode(lat: number, lon: number, ctx: Pick<AdapterContext, 'signal' | 'manual'>): Promise<Place | null> {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=jsonv2&zoom=18`;
  const res = await externalFetch({ sourceId: 'nominatim', url, sentValue: `${lat},${lon}`, ...ctx });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const p = obj(await res.json());
  if (!str(p.display_name)) return null;
  return {
    name: str(p.display_name)!,
    lat: Number(p.lat),
    lon: Number(p.lon),
    type: str(p.type),
    osmUrl: str(p.osm_type) && p.osm_id ? `https://www.openstreetmap.org/${str(p.osm_type)}/${String(p.osm_id)}` : undefined,
    sourceId: 'nominatim',
  };
}

export async function geoAdapterRun(sourceId: 'nominatim' | 'photon', query: string, queryType: QueryType, ctx: AdapterContext): Promise<AdapterOutput> {
  if (queryType === 'coordinates') {
    if (sourceId !== 'nominatim') return { status: 'unsupported', results: [] };
    const c = parseCoordinates(query);
    if (!c) return { status: 'unsupported', results: [], message: 'invalid coordinates' };
    const p = await reverseGeocode(c.lat, c.lon, ctx);
    return {
      status: 'completed',
      results: p
        ? [mkResult({ sourceId, queryType, query, type: 'location', kind: 'Reverse geocoding (OSM)', value: p.name, url: p.osmUrl, confidence: 'medium', data: { lat: p.lat, lon: p.lon, osmType: p.type } })]
        : [],
    };
  }
  const places = await geocode(query, ctx, sourceId);
  return {
    status: 'completed',
    results: places.slice(0, ctx.maxResults).map((p) =>
      mkResult({ sourceId, queryType, query, type: 'location', kind: 'Geocoding candidate (OSM)', value: p.name, url: p.osmUrl, confidence: 'low', verification: 'unverified', data: { lat: p.lat, lon: p.lon, osmType: p.type } }),
    ),
  };
}
