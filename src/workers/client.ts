import type { CorrelationInput, Suggestion } from '@/services/correlation/engine';

/** Small promise wrapper around a dedicated worker; falls back to the main thread if workers are unavailable. */
function makeClient<I, O>(factory: () => Worker, fallback: (input: I) => Promise<O>) {
  let worker: Worker | null = null;
  let seq = 0;
  const pending = new Map<number, { resolve: (v: O) => void; reject: (e: Error) => void }>();
  function get(): Worker | null {
    if (worker) return worker;
    try {
      worker = factory();
      worker.onmessage = (e: MessageEvent<{ id: number; error?: string } & Record<string, unknown>>) => {
        const p = pending.get(e.data.id);
        if (!p) return;
        pending.delete(e.data.id);
        if (e.data.error) p.reject(new Error(e.data.error));
        else p.resolve(e.data as unknown as O);
      };
      worker.onerror = () => {
        for (const p of pending.values()) p.reject(new Error('worker crashed'));
        pending.clear();
        worker?.terminate();
        worker = null;
      };
      return worker;
    } catch {
      return null;
    }
  }
  return (input: I, transfer: Record<string, unknown>): Promise<O> => {
    const w = typeof Worker !== 'undefined' ? get() : null;
    if (!w) return fallback(input);
    const id = ++seq;
    return new Promise<O>((resolve, reject) => {
      pending.set(id, { resolve, reject });
      w.postMessage({ id, ...transfer });
    });
  };
}

const correlationClient = makeClient<CorrelationInput, { suggestions: Suggestion[] }>(
  () => new Worker(new URL('./correlation.worker.ts', import.meta.url), { type: 'module' }),
  async (input) => {
    const { correlate } = await import('@/services/correlation/engine');
    return { suggestions: correlate(input) };
  },
);

export async function runCorrelation(input: CorrelationInput): Promise<Suggestion[]> {
  const r = await correlationClient(input, { input });
  return r.suggestions;
}

const hashClient = makeClient<Blob, { sha256: string; sha1: string }>(
  () => new Worker(new URL('./hash.worker.ts', import.meta.url), { type: 'module' }),
  async (file) => {
    const buf = await file.arrayBuffer();
    const h = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
    return { sha256: h(await crypto.subtle.digest('SHA-256', buf)), sha1: h(await crypto.subtle.digest('SHA-1', buf)) };
  },
);

const metadataClient = makeClient<Blob, { metadata: Record<string, unknown>; thumbnail: boolean; warning?: string }>(
  () => new Worker(new URL('./metadata.worker.ts', import.meta.url), { type: 'module' }),
  async (file) => {
    const exifr = (await import('exifr')).default;
    const metadata = ((await exifr.parse(file, { tiff: true, exif: true, gps: true, iptc: true, xmp: true, mergeOutput: true }).catch(() => ({}))) ?? {}) as Record<string, unknown>;
    return { metadata: JSON.parse(JSON.stringify(metadata)), thumbnail: false };
  },
);

export function extractMetadata(file: Blob): Promise<{ metadata: Record<string, unknown>; thumbnail: boolean; warning?: string }> {
  return metadataClient(file, { file });
}

export function hashFile(file: Blob): Promise<{ sha256: string; sha1: string }> {
  return hashClient(file, { file });
}
