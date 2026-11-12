/// <reference lib="webworker" />
import { correlate, type CorrelationInput } from '@/services/correlation/engine';

self.onmessage = (e: MessageEvent<{ id: number; input: CorrelationInput }>) => {
  try {
    const suggestions = correlate(e.data.input);
    (self as unknown as Worker).postMessage({ id: e.data.id, suggestions });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id: e.data.id, error: err instanceof Error ? err.message : String(err) });
  }
};
