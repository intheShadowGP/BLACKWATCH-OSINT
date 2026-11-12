/**
 * Interprets raw EXIF/XMP/IPTC output. Every "flag" is an observation to be
 * checked by the analyst — metadata can be stripped, altered or forged.
 */
export interface ImageSummary {
  make?: string;
  model?: string;
  lens?: string;
  software?: string;
  creatorTool?: string;
  serial?: string;
  dateOriginal?: string;
  dateCreate?: string;
  dateModify?: string;
  offset?: string;
  gps?: { lat: number; lon: number; alt?: number };
  gpsDate?: string;
  orientation?: string;
  author?: string;
  copyright?: string;
  description?: string;
  exifWidth?: number;
  exifHeight?: number;
  flags: string[];
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 500) : typeof v === 'number' ? String(v) : undefined);
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

const EDITORS = /photoshop|lightroom|gimp|snapseed|affinity|pixelmator|canva|picsart|facetune|vsco|capture one|darktable|paint\.net|luminar|krita|instagram|meitu/i;

export function summarise(meta: Record<string, unknown>, actual?: { width: number; height: number }): ImageSummary {
  const s: ImageSummary = {
    make: str(meta.Make),
    model: str(meta.Model),
    lens: str(meta.LensModel) ?? str(meta.Lens),
    software: str(meta.Software),
    creatorTool: str(meta.CreatorTool),
    serial: str(meta.BodySerialNumber) ?? str(meta.SerialNumber),
    dateOriginal: str(meta.DateTimeOriginal),
    dateCreate: str(meta.CreateDate) ?? str(meta.DateCreated),
    dateModify: str(meta.ModifyDate),
    offset: str(meta.OffsetTimeOriginal) ?? str(meta.OffsetTime),
    orientation: str(meta.Orientation),
    author: str(meta.Artist) ?? (Array.isArray(meta.creator) ? str(meta.creator[0]) : str(meta.creator)) ?? str(meta.Byline),
    copyright: str(meta.Copyright) ?? str(meta.rights),
    description: str(meta.ImageDescription) ?? str(meta.description) ?? str(meta.Caption),
    exifWidth: num(meta.ExifImageWidth) ?? num(meta.ImageWidth),
    exifHeight: num(meta.ExifImageHeight) ?? num(meta.ImageHeight),
    flags: [],
  };
  const lat = num(meta.latitude);
  const lon = num(meta.longitude);
  if (lat !== undefined && lon !== undefined && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(lat === 0 && lon === 0)) {
    s.gps = { lat, lon, alt: num(meta.GPSAltitude) };
  } else if (lat === 0 && lon === 0) {
    s.flags.push('gps-zero');
  }
  if (meta.GPSDateStamp) s.gpsDate = `${str(meta.GPSDateStamp)}${Array.isArray(meta.GPSTimeStamp) ? ` ${(meta.GPSTimeStamp as number[]).map((x) => String(Math.floor(x)).padStart(2, '0')).join(':')} UTC` : ''}`;

  const keys = Object.keys(meta).length;
  if (keys === 0) s.flags.push('no-metadata');
  else if (!s.make && !s.model && !s.dateOriginal) s.flags.push('no-camera-data');
  if ((s.software && EDITORS.test(s.software)) || (s.creatorTool && EDITORS.test(s.creatorTool))) s.flags.push('editing-software');
  if (s.dateOriginal && s.dateModify && Math.abs(new Date(s.dateOriginal).getTime() - new Date(s.dateModify).getTime()) > 60_000) s.flags.push('modified-after-capture');
  if (s.gps) s.flags.push('gps-present');
  if (!s.offset && s.dateOriginal) s.flags.push('no-timezone');
  if (actual && s.exifWidth && s.exifHeight) {
    const same = (actual.width === s.exifWidth && actual.height === s.exifHeight) || (actual.width === s.exifHeight && actual.height === s.exifWidth);
    if (!same) s.flags.push('dimension-mismatch');
  }
  return s;
}

/** Renders a local metadata report as Markdown. */
export function imageReportMarkdown(file: { name: string; size: number; mime: string; sha256: string; sha1?: string; width?: number; height?: number }, s: ImageSummary, raw: Record<string, unknown>): string {
  const L = [
    `# Image metadata report — ${file.name.replace(/[\r\n]/g, ' ')}`,
    '',
    `- Generated: ${new Date().toISOString()} (BLACKWATCH OSINT, local analysis)`,
    `- Size: ${file.size} bytes · MIME (detected): ${file.mime}`,
    `- Dimensions: ${file.width ?? '?'} × ${file.height ?? '?'}`,
    `- SHA-256: \`${file.sha256}\``,
    file.sha1 ? `- SHA-1: \`${file.sha1}\`` : '',
    '',
    '## Summary',
    '',
    ...Object.entries(s)
      .filter(([k, v]) => k !== 'flags' && v !== undefined)
      .map(([k, v]) => `- **${k}**: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`),
    '',
    '## Observations (to be verified)',
    '',
    ...(s.flags.length ? s.flags.map((f) => `- ${f}`) : ['- none']),
    '',
    '## Raw metadata',
    '',
    '```json',
    JSON.stringify(raw, null, 2).replace(/```/g, '`​``'),
    '```',
    '',
    '> Metadata can be stripped, altered or forged. It does not prove where, when or by whom an image was created.',
  ];
  return L.filter((l) => l !== '').join('\n').replace(/\n## /g, '\n\n## ');
}
