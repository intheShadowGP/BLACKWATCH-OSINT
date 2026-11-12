/// <reference lib="webworker" />
// EXIF / XMP / IPTC extraction off the main thread. Runs fully locally.
import exifr from 'exifr';

function serialise(v: unknown, depth = 0): unknown {
  if (depth > 4) return undefined;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? undefined : v.toISOString();
  if (v instanceof Uint8Array || v instanceof ArrayBuffer) return `<${(v as ArrayBuffer).byteLength} bytes>`;
  if (Array.isArray(v)) return v.length > 64 ? `<array ${v.length}>` : v.map((x) => serialise(x, depth + 1));
  if (v && typeof v === 'object') {
    const o: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) o[k] = serialise(x, depth + 1);
    return o;
  }
  if (typeof v === 'string') return v.slice(0, 2000);
  return v;
}

self.onmessage = async (e: MessageEvent<{ id: number; file: Blob }>) => {
  try {
    const meta = await exifr.parse(e.data.file, {
      tiff: true,
      exif: true,
      gps: true,
      ifd1: true,
      iptc: true,
      xmp: true,
      icc: false,
      jfif: true,
      ihdr: true,
      interop: false,
      translateValues: true,
      reviveValues: true,
      mergeOutput: true,
    });
    let thumbnail = false;
    try {
      thumbnail = !!(await exifr.thumbnail(e.data.file));
    } catch {
      thumbnail = false;
    }
    (self as unknown as Worker).postMessage({ id: e.data.id, metadata: serialise(meta ?? {}), thumbnail });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id: e.data.id, metadata: {}, thumbnail: false, warning: err instanceof Error ? err.message : String(err) });
  }
};
