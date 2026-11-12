import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Download, FolderPlus, ImageIcon, Trash2, Upload } from 'lucide-react';
import { useI18n } from '@/i18n';
import { useApp, useSettings } from '@/app/context';
import { extractMetadata, hashFile } from '@/workers/client';
import { checkFile } from '@/utils/files';
import { summarise, imageReportMarkdown, type ImageSummary } from '@/services/image/analysis';
import { addEvent, addEvidence, upsertEntity } from '@/services/storage/repository';
import { downloadBlob, formatBytes, nowIso, uid } from '@/utils/common';
import { ActiveInvestigationBar } from '@/components/investigation';
import { Badge, Button, Card, CopyButton, EmptyState, HelpBox, Input, KeyValue, PageHeader, SafeLink } from '@/components/ui';

interface Analysed {
  id: string;
  file: File;
  url: string | null;
  mime: string;
  label: string;
  mismatch: boolean;
  width?: number;
  height?: number;
  sha256?: string;
  sha1?: string;
  raw?: Record<string, unknown>;
  summary?: ImageSummary;
  thumbnail?: boolean;
  status: 'working' | 'done' | 'error';
  error?: string;
}

async function dimensions(f: Blob): Promise<{ width: number; height: number } | undefined> {
  try {
    const bmp = await createImageBitmap(f);
    const d = { width: bmp.width, height: bmp.height };
    bmp.close();
    return d;
  } catch {
    return undefined; // e.g. HEIC not decodable by this browser
  }
}

export default function ImagePage() {
  const { t, td } = useI18n();
  const settings = useSettings();
  const { activeId, toast, reportError } = useApp();
  const [items, setItems] = useState<Analysed[]>([]);
  const [compare, setCompare] = useState('');
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(
    () => () => {
      for (const i of items) if (i.url) URL.revokeObjectURL(i.url);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const update = (id: string, patch: Partial<Analysed>) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  const onFiles = async (files: FileList | File[] | null) => {
    if (!files) return;
    for (const f of [...files].slice(0, 30)) {
      const check = await checkFile(f, settings.limits.maxFileSizeMb * 1048576, true);
      if (!check.ok) {
        toast(`${f.name}: ${t(check.error === 'too-large' ? 'error.fileTooLarge' : check.error === 'empty' ? 'error.fileEmpty' : 'error.notImage')}`, 'error');
        continue;
      }
      const id = uid();
      const canPreview = check.sniff.mime !== 'image/heic' && check.sniff.mime !== 'image/tiff';
      const item: Analysed = { id, file: f, url: canPreview ? URL.createObjectURL(f) : null, mime: check.sniff.mime!, label: check.sniff.label, mismatch: check.mismatch, status: 'working' };
      setItems((xs) => [item, ...xs]);
      try {
        const [dims, hashes, meta] = await Promise.all([dimensions(f), hashFile(f), extractMetadata(f)]);
        update(id, { width: dims?.width, height: dims?.height, sha256: hashes.sha256, sha1: hashes.sha1, raw: meta.metadata, thumbnail: meta.thumbnail, summary: summarise(meta.metadata, dims), status: 'done' });
      } catch (e) {
        update(id, { status: 'error', error: e instanceof Error ? e.message : String(e) });
      }
    }
  };

  const addToInvestigation = async (it: Analysed) => {
    if (!activeId || !it.sha256 || !it.summary) return;
    try {
      const src = { sourceId: 'local-analysis', sourceName: 'BLACKWATCH local analysis', collectedAt: nowIso(), note: `SHA-256 ${it.sha256}` };
      await addEvidence({ investigationId: activeId, name: it.file.name, mime: it.mime, size: it.file.size, sha256: it.sha256, sha1: it.sha1, notes: '', metadata: { summary: it.summary, width: it.width, height: it.height }, blob: it.file });
      const { entity: img } = await upsertEntity({ investigationId: activeId, type: 'image', value: it.file.name, label: `SHA-256 ${it.sha256.slice(0, 16)}…`, verification: 'verified', confidence: 'high', source: src });
      const ids = [img.id];
      if (it.summary.gps) {
        const { entity: loc } = await upsertEntity({ investigationId: activeId, type: 'location', value: `${it.summary.gps.lat.toFixed(6)}, ${it.summary.gps.lon.toFixed(6)}`, label: `EXIF GPS — ${it.file.name}`, verification: 'unverified', confidence: 'low', source: src, lat: it.summary.gps.lat, lon: it.summary.gps.lon });
        ids.push(loc.id);
      }
      const when = it.summary.dateOriginal ?? it.summary.dateCreate;
      if (when && !Number.isNaN(new Date(when).getTime())) {
        await addEvent({
          investigationId: activeId,
          title: `Image captured (EXIF): ${it.file.name}`,
          description: [it.summary.make, it.summary.model].filter(Boolean).join(' '),
          datetime: new Date(when).toISOString(),
          // exifr interprets offset-less EXIF dates in the browser's local zone.
          timezone: it.summary.offset ? `UTC${it.summary.offset}` : `${Intl.DateTimeFormat().resolvedOptions().timeZone} (assumed)`,
          dateKind: 'occurrence',
          verification: 'unverified',
          confidence: 'low',
          sources: [src],
          entityIds: ids,
          lat: it.summary.gps?.lat,
          lon: it.summary.gps?.lon,
        });
      }
      toast(t('img.added'));
    } catch (e) {
      reportError(e);
    }
  };

  const cmp = compare.trim().toLowerCase();
  const dupHashes = new Set(items.map((i) => i.sha256).filter((h, idx, a) => h && a.indexOf(h) !== idx));

  return (
    <div>
      <PageHeader icon={<ImageIcon className="size-5" />} title={t('nav.image')} description={t('desc.image')} />
      <HelpBox storageKey="image">
        <p>{t('help.image')}</p>
        <p className="text-bw-ok">{t('help.image.local')}</p>
      </HelpBox>
      <ActiveInvestigationBar />
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          void onFiles(e.dataTransfer.files);
        }}
        className={`mb-4 flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-10 text-center transition-colors ${drag ? 'border-bw-gold bg-bw-gold/5' : 'border-bw-border'}`}
      >
        <Upload className="size-8 text-bw-muted" />
        <p className="text-sm">{t('img.drop')}</p>
        <p className="text-xs text-bw-muted">{t('img.formats', { mb: settings.limits.maxFileSizeMb })}</p>
        <input ref={input} type="file" accept="image/*" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} aria-label={t('img.choose')} />
        <Button variant="primary" onClick={() => input.current?.click()}>
          {t('img.choose')}
        </Button>
      </div>
      {items.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Input className="max-w-xl font-mono" placeholder={t('evidence.compareHash')} aria-label={t('evidence.compareHash')} value={compare} onChange={(e) => setCompare(e.target.value)} />
          <Button
            variant="ghost"
            icon={<Trash2 className="size-4" />}
            onClick={() => {
              items.forEach((i) => i.url && URL.revokeObjectURL(i.url));
              setItems([]);
            }}
          >
            {t('img.clear')}
          </Button>
        </div>
      )}
      {!items.length ? (
        <EmptyState icon={<ImageIcon className="size-8" />} title={t('img.none')} />
      ) : (
        <div className="space-y-4">
          {items.map((it) => (
            <Card
              key={it.id}
              title={it.file.name}
              subtitle={`${it.label} · ${formatBytes(it.file.size)}${it.width ? ` · ${it.width}×${it.height}` : ''}`}
              actions={
                it.status === 'done' ? (
                  <>
                    <Button size="sm" variant="gold" icon={<FolderPlus className="size-3.5" />} disabled={!activeId} title={activeId ? undefined : t('inv.noneActive')} onClick={() => addToInvestigation(it)}>
                      {t('img.addToInv')}
                    </Button>
                    <Button size="sm" icon={<Download className="size-3.5" />} onClick={() => downloadBlob(new Blob([imageReportMarkdown({ name: it.file.name, size: it.file.size, mime: it.mime, sha256: it.sha256!, sha1: it.sha1, width: it.width, height: it.height }, it.summary!, it.raw!)], { type: 'text/markdown' }), `${it.file.name}-metadata.md`)}>
                      MD
                    </Button>
                    <Button size="sm" icon={<Download className="size-3.5" />} onClick={() => downloadBlob(new Blob([JSON.stringify({ file: { name: it.file.name, size: it.file.size, mime: it.mime, sha256: it.sha256, sha1: it.sha1, width: it.width, height: it.height }, summary: it.summary, raw: it.raw, generatedAt: nowIso() }, null, 2)], { type: 'application/json' }), `${it.file.name}-metadata.json`)}>
                      JSON
                    </Button>
                  </>
                ) : (
                  <Badge tone={it.status === 'error' ? 'red' : 'info'}>{it.status === 'error' ? t('img.error') : t('common.loading')}</Badge>
                )
              }
            >
              <div className="grid gap-4 md:grid-cols-[220px_1fr]">
                <div>
                  {it.url ? <img src={it.url} alt={it.file.name} className="max-h-64 w-full rounded border border-bw-border bg-black object-contain" /> : <div className="flex h-40 items-center justify-center rounded border border-bw-border text-xs text-bw-muted">{t('img.noPreview')}</div>}
                  {it.mismatch && (
                    <p className="mt-2 flex items-center gap-1 text-xs text-bw-warn">
                      <AlertTriangle className="size-3.5" /> {t('img.mimeMismatch', { declared: it.file.type || '?', detected: it.label })}
                    </p>
                  )}
                </div>
                <div className="min-w-0 space-y-3">
                  {it.error && <p className="text-sm text-bw-red-bright">{it.error}</p>}
                  {it.sha256 && (
                    <div className="space-y-0.5 font-mono text-xs">
                      <div className="flex items-center gap-1 break-all">
                        SHA-256 {it.sha256} <CopyButton value={it.sha256} />
                        {cmp && (cmp === it.sha256 || cmp === it.sha1) && <Badge tone="ok">{t('evidence.hashMatch')}</Badge>}
                        {dupHashes.has(it.sha256) && <Badge tone="gold">{t('img.duplicate')}</Badge>}
                      </div>
                      <div className="break-all text-bw-muted">SHA-1 {it.sha1}</div>
                    </div>
                  )}
                  {it.summary && (
                    <>
                      <div className="flex flex-wrap gap-1">
                        {it.summary.flags.map((f) => (
                          <Badge key={f} tone={f === 'gps-present' ? 'gold' : f === 'no-metadata' || f === 'no-camera-data' ? 'neutral' : 'warn'}>
                            {td(`img.flag.${f}`)}
                          </Badge>
                        ))}
                      </div>
                      <KeyValue
                        rows={(
                          [
                            [t('img.camera'), [it.summary.make, it.summary.model].filter(Boolean).join(' ') || undefined],
                            [t('img.lens'), it.summary.lens],
                            [t('img.serial'), it.summary.serial],
                            [t('img.software'), [it.summary.software, it.summary.creatorTool].filter(Boolean).join(' / ') || undefined],
                            [t('img.dateOriginal'), it.summary.dateOriginal],
                            [t('img.dateCreate'), it.summary.dateCreate],
                            [t('img.dateModify'), it.summary.dateModify],
                            [t('img.offset'), it.summary.offset],
                            [t('img.gpsDate'), it.summary.gpsDate],
                            [t('img.author'), it.summary.author],
                            [t('img.copyright'), it.summary.copyright],
                            [t('img.description'), it.summary.description],
                            [t('img.thumbnail'), it.thumbnail ? t('common.yes') : undefined],
                          ] as Array<[string, string | undefined]>
                        )
                          .filter(([, v]) => v)
                          .map(([k, v]) => [k, v] as [string, React.ReactNode])}
                      />
                      {it.summary.gps && (
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          <Badge tone="gold">GPS</Badge>
                          <span className="font-mono">
                            {it.summary.gps.lat.toFixed(6)}, {it.summary.gps.lon.toFixed(6)}
                            {it.summary.gps.alt !== undefined && ` · ${it.summary.gps.alt.toFixed(1)} m`}
                          </span>
                          <Link className="text-bw-gold hover:underline" to={`/geoint?q=${encodeURIComponent(`${it.summary.gps.lat}, ${it.summary.gps.lon}`)}`}>
                            {t('img.showOnMap')}
                          </Link>
                        </div>
                      )}
                      <details className="text-xs">
                        <summary className="cursor-pointer text-bw-muted">{t('img.raw', { n: Object.keys(it.raw ?? {}).length })}</summary>
                        <pre className="mt-2 max-h-80 overflow-auto rounded border border-bw-border bg-bw-bg p-2 text-[11px]">{JSON.stringify(it.raw, null, 2)}</pre>
                      </details>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-bw-muted">
                        <span>{t('img.reverseManual')}</span>
                        <SafeLink href="https://tineye.com/">TinEye</SafeLink>
                        <SafeLink href="https://lens.google.com/">Google Lens</SafeLink>
                        <SafeLink href="https://www.bing.com/visualsearch">Bing Visual Search</SafeLink>
                        <SafeLink href="https://yandex.com/images/">Yandex Images</SafeLink>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
