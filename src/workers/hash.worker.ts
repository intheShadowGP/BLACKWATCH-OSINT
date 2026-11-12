/// <reference lib="webworker" />
// Hashes files off the main thread. The File object is transferred by
// structured clone; nothing leaves the device.

function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

self.onmessage = async (e: MessageEvent<{ id: number; file: Blob }>) => {
  try {
    const buf = await e.data.file.arrayBuffer();
    const [s256, s1] = await Promise.all([crypto.subtle.digest('SHA-256', buf), crypto.subtle.digest('SHA-1', buf)]);
    (self as unknown as Worker).postMessage({ id: e.data.id, sha256: hex(s256), sha1: hex(s1) });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id: e.data.id, error: err instanceof Error ? err.message : String(err) });
  }
};
