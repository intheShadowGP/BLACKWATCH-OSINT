/**
 * File type detection from magic bytes. The browser-provided `file.type` is
 * derived from the extension and cannot be trusted, so both are compared.
 */
export interface SniffResult {
  mime: string | null;
  label: string;
  isImage: boolean;
}

const SIGNATURES: Array<{ mime: string; label: string; image: boolean; test: (b: Uint8Array) => boolean }> = [
  { mime: 'image/jpeg', label: 'JPEG', image: true, test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/png', label: 'PNG', image: true, test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a },
  { mime: 'image/gif', label: 'GIF', image: true, test: (b) => ascii(b, 0, 4) === 'GIF8' },
  { mime: 'image/webp', label: 'WebP', image: true, test: (b) => ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP' },
  { mime: 'image/tiff', label: 'TIFF', image: true, test: (b) => (b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a && b[3] === 0) || (b[0] === 0x4d && b[1] === 0x4d && b[2] === 0 && b[3] === 0x2a) },
  { mime: 'image/heic', label: 'HEIC/HEIF', image: true, test: (b) => ascii(b, 4, 4) === 'ftyp' && /^(heic|heix|hevc|hevx|mif1|msf1|heim|heis)$/.test(ascii(b, 8, 4)) },
  { mime: 'image/avif', label: 'AVIF', image: true, test: (b) => ascii(b, 4, 4) === 'ftyp' && /^avi[fs]$/.test(ascii(b, 8, 4)) },
  { mime: 'image/bmp', label: 'BMP', image: true, test: (b) => b[0] === 0x42 && b[1] === 0x4d },
  { mime: 'application/pdf', label: 'PDF', image: false, test: (b) => ascii(b, 0, 5) === '%PDF-' },
  { mime: 'application/zip', label: 'ZIP / Office', image: false, test: (b) => b[0] === 0x50 && b[1] === 0x4b && (b[2] === 3 || b[2] === 5 || b[2] === 7) },
  { mime: 'video/mp4', label: 'MP4/MOV', image: false, test: (b) => ascii(b, 4, 4) === 'ftyp' },
  { mime: 'application/x-msdownload', label: 'Windows executable', image: false, test: (b) => b[0] === 0x4d && b[1] === 0x5a },
  { mime: 'application/x-elf', label: 'ELF executable', image: false, test: (b) => b[0] === 0x7f && ascii(b, 1, 3) === 'ELF' },
];

function ascii(b: Uint8Array, off: number, len: number): string {
  let s = '';
  for (let i = off; i < off + len && i < b.length; i++) s += String.fromCharCode(b[i]);
  return s;
}

export function sniffBytes(b: Uint8Array): SniffResult {
  for (const s of SIGNATURES) if (b.length >= 4 && s.test(b)) return { mime: s.mime, label: s.label, isImage: s.image };
  // SVG / text: never treated as images (SVG can carry scripts).
  return { mime: null, label: 'unknown', isImage: false };
}

export async function sniffFile(f: Blob): Promise<SniffResult> {
  const head = new Uint8Array(await f.slice(0, 32).arrayBuffer());
  return sniffBytes(head);
}

export interface FileCheck {
  ok: boolean;
  sniff: SniffResult;
  declared: string;
  mismatch: boolean;
  error?: 'too-large' | 'empty' | 'not-image';
}

export async function checkFile(f: File, maxBytes: number, requireImage = false): Promise<FileCheck> {
  const declared = f.type || 'application/octet-stream';
  if (f.size === 0) return { ok: false, sniff: { mime: null, label: 'empty', isImage: false }, declared, mismatch: false, error: 'empty' };
  if (f.size > maxBytes) return { ok: false, sniff: { mime: null, label: '?', isImage: false }, declared, mismatch: false, error: 'too-large' };
  const sniff = await sniffFile(f);
  const mismatch = !!sniff.mime && !!f.type && sniff.mime !== f.type && !(sniff.mime === 'video/mp4' && f.type.startsWith('video/')) && !(sniff.mime === 'image/heic' && /hei[cf]/.test(f.type));
  if (requireImage && !sniff.isImage) return { ok: false, sniff, declared, mismatch, error: 'not-image' };
  return { ok: true, sniff, declared, mismatch };
}
