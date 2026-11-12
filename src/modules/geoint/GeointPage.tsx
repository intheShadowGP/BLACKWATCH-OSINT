import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import L from 'leaflet';
import { CalendarPlus, Crosshair, Download, MapPinned, MapPin, Search, Upload } from 'lucide-react';
import { useI18n } from '@/i18n';
import { useApp, useSettings } from '@/app/context';
import { db } from '@/services/storage/db';
import { geocode, reverseGeocode, type Place } from '@/services/adapters/geo';
import { mapError } from '@/services/automation/engine';
import { conversions, distanceKm, parseCoordinateImport, toGeoJSON, toKML, type GeoPoint } from '@/services/geo/geo';
import { addEvent } from '@/services/storage/repository';
import { parseCoordinates } from '@/utils/validation';
import { downloadBlob, nowIso, uid } from '@/utils/common';
import { ActiveInvestigationBar, useAddToInvestigation } from '@/components/investigation';
import { Badge, Button, Card, CopyButton, Field, HelpBox, Input, KeyValue, Modal, PageHeader, SafeLink, Textarea } from '@/components/ui';

const COLORS: Record<GeoPoint['kind'], string> = { entity: '#c42f37', event: '#c9a54a', session: '#4c7fc0', search: '#9b958b' };

export default function GeointPage() {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const settings = useSettings();
  const { activeId, active, toast, reportError } = useApp();
  const { addValue } = useAddToInvestigation();
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const [coordInput, setCoordInput] = useState(params.get('q') ?? '');
  const [current, setCurrent] = useState<{ lat: number; lon: number } | null>(() => parseCoordinates(params.get('q') ?? ''));
  const [placeQ, setPlaceQ] = useState('');
  const [places, setPlaces] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);
  const [reverse, setReverse] = useState<Place | null | undefined>(undefined);
  const [session, setSession] = useState<GeoPoint[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [eventOpen, setEventOpen] = useState(false);
  const [evTitle, setEvTitle] = useState('');
  const [evDate, setEvDate] = useState('');
  const lastNominatim = useRef(0);

  const stored = useLiveQuery(async () => {
    if (!activeId) return [] as GeoPoint[];
    const [ents, evs] = await Promise.all([db.entities.where('investigationId').equals(activeId).toArray(), db.events.where('investigationId').equals(activeId).toArray()]);
    return [
      ...ents.filter((e) => e.lat !== undefined && e.lon !== undefined).map<GeoPoint>((e) => ({ id: e.id, lat: e.lat!, lon: e.lon!, label: e.label ? `${e.value} (${e.label})` : e.value, kind: 'entity' })),
      ...evs.filter((e) => e.lat !== undefined && e.lon !== undefined).map<GeoPoint>((e) => ({ id: e.id, lat: e.lat!, lon: e.lon!, label: `${e.datetime.slice(0, 16).replace('T', ' ')} — ${e.title}`, kind: 'event' })),
    ];
  }, [activeId], [] as GeoPoint[]);

  const allPoints = useMemo(() => [...stored, ...session, ...places.map<GeoPoint>((p, i) => ({ id: `s${i}`, lat: p.lat, lon: p.lon, label: p.name, kind: 'search', sourceId: p.sourceId }))], [stored, session, places]);

  // Map lifecycle
  useEffect(() => {
    if (!mapEl.current || mapRef.current) return;
    const map = L.map(mapEl.current, { worldCopyJump: true, preferCanvas: true }).setView([20, 0], 2);
    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);
    map.on('click', (e: L.LeafletMouseEvent) => {
      const lat = Number(e.latlng.lat.toFixed(6));
      const lon = Number(L.Util.wrapNum(e.latlng.lng, [-180, 180], true).toFixed(6));
      setCurrent({ lat, lon });
      setCoordInput(`${lat}, ${lon}`);
      setReverse(undefined);
    });
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Tiles follow the privacy setting.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    let tiles: L.TileLayer | null = null;
    if (settings.privacy.externalEnabled && settings.privacy.mapTiles && settings.modeOf('osm-tiles') !== 'off') {
      tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
      }).addTo(map);
    }
    return () => {
      tiles?.remove();
    };
  }, [settings.privacy.externalEnabled, settings.privacy.mapTiles, settings]);

  // Markers
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    layer.clearLayers();
    for (const p of allPoints) {
      const m = L.circleMarker([p.lat, p.lon], { radius: 7, color: '#09090a', weight: 2, fillColor: COLORS[p.kind], fillOpacity: 0.95 });
      // Leaflet tooltip receives a text node — never interpreted as HTML.
      const label = document.createElement('span');
      label.textContent = p.label;
      m.bindTooltip(label);
      m.on('click', () => {
        setCurrent({ lat: p.lat, lon: p.lon });
        setCoordInput(`${p.lat}, ${p.lon}`);
      });
      m.addTo(layer);
    }
    if (current) {
      L.circleMarker([current.lat, current.lon], { radius: 10, color: '#c9a54a', weight: 3, fillOpacity: 0 }).addTo(layer);
    }
  }, [allPoints, current]);

  useEffect(() => {
    if (current && mapRef.current) mapRef.current.setView([current.lat, current.lon], Math.max(mapRef.current.getZoom(), 13));
  }, [current]);

  const fit = () => {
    if (!mapRef.current || !allPoints.length) return;
    mapRef.current.fitBounds(L.latLngBounds(allPoints.map((p) => [p.lat, p.lon] as [number, number])).pad(0.2));
  };

  const applyCoords = () => {
    const c = parseCoordinates(coordInput);
    if (!c) return toast(t('error.invalidCoords'), 'error');
    setCurrent(c);
    setReverse(undefined);
  };

  const politeWait = async () => {
    // Nominatim policy: max 1 request per second (also enforced by the HTTP layer).
    const wait = lastNominatim.current + 1100 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastNominatim.current = Date.now();
  };

  const searchPlace = async () => {
    if (!placeQ.trim()) return;
    setSearching(true);
    try {
      await politeWait();
      const ctrl = new AbortController();
      let res: Place[];
      try {
        res = await geocode(placeQ.trim(), { signal: ctrl.signal, manual: true }, 'nominatim');
      } catch (e) {
        const m = mapError(e);
        if ((m.status === 'unavailable' || m.status === 'rate-limited') && settings.canContact('photon')) {
          toast(t('geo.fallbackPhoton'), 'info');
          res = await geocode(placeQ.trim(), { signal: ctrl.signal, manual: true }, 'photon');
        } else throw e;
      }
      setPlaces(res);
      if (!res.length) toast(t('geo.noPlace'), 'info');
      else if (mapRef.current) mapRef.current.fitBounds(L.latLngBounds(res.map((p) => [p.lat, p.lon] as [number, number])).pad(0.3));
    } catch (e) {
      const m = mapError(e);
      toast(`${t('geo.geocodeFailed')}: ${m.message}`, 'error');
    } finally {
      setSearching(false);
    }
  };

  const doReverse = async () => {
    if (!current) return;
    try {
      await politeWait();
      setReverse(await reverseGeocode(current.lat, current.lon, { signal: new AbortController().signal, manual: true }));
    } catch (e) {
      toast(`${t('geo.geocodeFailed')}: ${mapError(e).message}`, 'error');
    }
  };

  const conv = current ? conversions(current.lat, current.lon) : null;

  const exportPoints = (fmt: 'geojson' | 'kml' | 'csv') => {
    const name = active?.name ?? 'blackwatch-map';
    if (fmt === 'geojson') downloadBlob(new Blob([toGeoJSON(allPoints)], { type: 'application/geo+json' }), `${name}.geojson`);
    else if (fmt === 'kml') downloadBlob(new Blob([toKML(allPoints, name)], { type: 'application/vnd.google-earth.kml+xml' }), `${name}.kml`);
    else downloadBlob(new Blob(['﻿lat,lon,label,kind\r\n' + allPoints.map((p) => `${p.lat},${p.lon},"${p.label.replace(/"/g, '""').replace(/^[=+\-@]/, "'$&")}",${p.kind}`).join('\r\n')], { type: 'text/csv' }), `${name}-points.csv`);
  };

  return (
    <div>
      <PageHeader icon={<MapPinned className="size-5" />} title={t('nav.geoint')} description={t('desc.geoint')} />
      <HelpBox storageKey="geoint" examples={['48.8584, 2.2945', `40°41'21.4"N 74°02'40.2"W`, '-33.8568, 151.2153']} onExample={(v) => { setCoordInput(v); setCurrent(parseCoordinates(v)); }}>
        <p>{t('help.geoint')}</p>
        <p className="text-bw-warn">{t('help.geoint.warning')}</p>
      </HelpBox>
      <ActiveInvestigationBar />
      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <Card
          title={t('geo.map')}
          actions={
            <>
              <Badge tone="red">{t('geo.legend.entity')}</Badge>
              <Badge tone="gold">{t('geo.legend.event')}</Badge>
              <Badge tone="info">{t('geo.legend.session')}</Badge>
              <Button size="sm" variant="ghost" icon={<Crosshair className="size-3.5" />} onClick={fit} disabled={!allPoints.length}>
                {t('geo.fit')}
              </Button>
            </>
          }
        >
          {!(settings.privacy.externalEnabled && settings.privacy.mapTiles) && <p className="mb-2 text-xs text-bw-warn">{t('geo.tilesOff')}</p>}
          <div ref={mapEl} className="bw-tiles-dim h-[58vh] min-h-80 w-full rounded-md border border-bw-border" role="application" aria-label={t('geo.map')} />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" icon={<Upload className="size-3.5" />} onClick={() => setImportOpen(true)}>
              {t('geo.import')}
            </Button>
            <Button size="sm" icon={<Download className="size-3.5" />} disabled={!allPoints.length} onClick={() => exportPoints('geojson')}>
              GeoJSON
            </Button>
            <Button size="sm" icon={<Download className="size-3.5" />} disabled={!allPoints.length} onClick={() => exportPoints('kml')}>
              KML
            </Button>
            <Button size="sm" icon={<Download className="size-3.5" />} disabled={!allPoints.length} onClick={() => exportPoints('csv')}>
              CSV
            </Button>
            <span className="self-center text-xs text-bw-muted">{t('geo.pointsCount', { n: allPoints.length })}</span>
          </div>
        </Card>
        <div className="space-y-4">
          <Card title={t('geo.coords')}>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                applyCoords();
              }}
            >
              <Input value={coordInput} onChange={(e) => setCoordInput(e.target.value)} placeholder="48.8584, 2.2945" aria-label={t('geo.coords')} className="font-mono" />
              <Button type="submit">{t('geo.go')}</Button>
            </form>
            {conv && current && (
              <div className="mt-3 space-y-2">
                <KeyValue
                  rows={[
                    [t('geo.decimal'), <span className="flex items-center gap-1">{conv.decimal} <CopyButton value={conv.decimal} /></span>],
                    ['DMS', <span className="flex items-center gap-1">{conv.dms} <CopyButton value={conv.dms} /></span>],
                    ['Geo URI', conv.geoUri],
                  ]}
                />
                <div className="flex flex-wrap gap-2 text-xs">
                  <SafeLink href={conv.osm}>OpenStreetMap</SafeLink>
                  <SafeLink href={conv.googleMaps}>Google Maps</SafeLink>
                  <SafeLink href={conv.bingMaps}>Bing Maps</SafeLink>
                  <SafeLink href={conv.sentinel}>Copernicus</SafeLink>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" icon={<Search className="size-3.5" />} disabled={!settings.canContact('nominatim')} onClick={doReverse}>
                    {t('geo.reverse')}
                  </Button>
                  <Button size="sm" variant="ghost" icon={<MapPin className="size-3.5" />} onClick={() => setSession((s) => [...s, { id: uid(), lat: current.lat, lon: current.lon, label: `${current.lat}, ${current.lon}`, kind: 'session' }])}>
                    {t('geo.pin')}
                  </Button>
                  <Button size="sm" variant="gold" disabled={!activeId} onClick={() => addValue('location', reverse?.name ?? conv.decimal, { sourceId: reverse ? 'nominatim' : 'manual', sourceName: reverse ? 'OpenStreetMap Nominatim' : 'Analyst input', url: reverse?.osmUrl ?? conv.osm, collectedAt: nowIso() }, { lat: current.lat, lon: current.lon, label: conv.decimal })}>
                    {t('geo.addLocation')}
                  </Button>
                  <Button size="sm" variant="ghost" icon={<CalendarPlus className="size-3.5" />} disabled={!activeId} onClick={() => setEventOpen(true)}>
                    {t('geo.linkEvent')}
                  </Button>
                </div>
                {reverse !== undefined && <p className="text-sm">{reverse ? reverse.name : t('geo.noPlace')}</p>}
                {reverse && <p className="text-xs text-bw-muted">© OpenStreetMap contributors (ODbL)</p>}
              </div>
            )}
          </Card>
          <Card title={t('geo.placeSearch')} subtitle={t('geo.placeSearchNote')}>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void searchPlace();
              }}
            >
              <Input value={placeQ} maxLength={300} onChange={(e) => setPlaceQ(e.target.value)} placeholder="Tour Eiffel" aria-label={t('geo.placeSearch')} />
              <Button type="submit" loading={searching} disabled={!settings.canContact('nominatim') || !placeQ.trim()}>
                {t('common.search')}
              </Button>
            </form>
            {places.length > 0 && (
              <ul className="mt-3 max-h-72 space-y-1 overflow-y-auto text-sm">
                {places.map((p, i) => (
                  <li key={i} className="rounded border border-bw-border px-2 py-1.5">
                    <button type="button" className="text-left hover:text-bw-gold" onClick={() => { setCurrent({ lat: p.lat, lon: p.lon }); setCoordInput(`${p.lat}, ${p.lon}`); setReverse(p); }}>
                      {p.name}
                    </button>
                    <div className="text-xs text-bw-muted">
                      {p.lat.toFixed(5)}, {p.lon.toFixed(5)} · {p.type} · {p.sourceId}
                      {current && ` · ${distanceKm(current, p).toFixed(2)} km`}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <Modal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title={t('geo.import')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setImportOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                const { points, errors } = parseCoordinateImport(importText);
                setSession((s) => [...s, ...points.map<GeoPoint>((p) => ({ id: uid(), lat: p.lat, lon: p.lon, label: p.label || `${p.lat}, ${p.lon}`, kind: 'session' }))]);
                toast(t('geo.imported', { n: points.length, e: errors }), errors ? 'info' : 'ok');
                setImportOpen(false);
                setTimeout(fit, 50);
              }}
            >
              {t('common.import')}
            </Button>
          </>
        }
      >
        <p className="mb-2 text-sm text-bw-muted">{t('geo.importHelp')}</p>
        <input
          type="file"
          accept=".csv,.txt,.geojson,.json"
          aria-label={t('backup.file')}
          className="mb-2 block text-sm"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            if (f.size > 10 * 1048576) return toast(t('error.fileTooLarge'), 'error');
            setImportText(await f.text());
          }}
        />
        <Textarea value={importText} onChange={(e) => setImportText(e.target.value)} className="min-h-40 font-mono" placeholder={'48.8584,2.2945,Eiffel Tower\n51.5007,-0.1246,Big Ben'} />
      </Modal>

      <Modal
        open={eventOpen}
        onClose={() => setEventOpen(false)}
        title={t('geo.linkEvent')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEventOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="primary"
              disabled={!evTitle.trim() || !evDate}
              onClick={async () => {
                if (!activeId || !current) return;
                try {
                  await addEvent({
                    investigationId: activeId,
                    title: evTitle.trim(),
                    description: reverse?.name ?? '',
                    datetime: new Date(evDate).toISOString(),
                    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                    dateKind: 'occurrence',
                    verification: 'unverified',
                    confidence: 'unknown',
                    sources: [{ sourceId: 'manual', sourceName: 'Analyst input', collectedAt: nowIso() }],
                    entityIds: [],
                    lat: current.lat,
                    lon: current.lon,
                  });
                  toast(t('common.saved'));
                  setEventOpen(false);
                } catch (e) {
                  reportError(e);
                }
              }}
            >
              {t('common.save')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label={t('timeline.title')}>{(id) => <Input id={id} value={evTitle} maxLength={300} onChange={(e) => setEvTitle(e.target.value)} />}</Field>
          <Field label={t('timeline.datetimeLocal')}>{(id) => <Input id={id} type="datetime-local" value={evDate} onChange={(e) => setEvDate(e.target.value)} />}</Field>
          {current && <p className="font-mono text-xs text-bw-muted">{conv?.decimal}</p>}
        </div>
      </Modal>
    </div>
  );
}
