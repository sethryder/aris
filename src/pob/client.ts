// Main-thread side of the PoB engine: lazily starts the worker, one promise per calculation.
import pins from '../../pob.json';
import type { CalcInput, CalcResult } from './engine.ts';
import type { CalcRequest } from './worker.ts';

export const POB_VERSION = pins.pob;

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (r: CalcResult) => void; reject: (e: Error) => void }>();

export function calcBuild(input: CalcInput): Promise<CalcResult> {
  if (!worker) {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }: MessageEvent<{ id: number; result?: CalcResult; error?: string }>) => {
      const p = pending.get(data.id);
      pending.delete(data.id);
      if (data.error !== undefined) p?.reject(new Error(data.error));
      else p?.resolve(data.result!);
    };
    worker.onerror = (e) => {
      for (const p of pending.values()) p.reject(new Error(e.message || 'Path of Building engine crashed'));
      pending.clear();
      worker?.terminate();
      worker = null;
    };
  }
  const id = ++seq;
  const base = new URL(`${import.meta.env.BASE_URL}pob/${POB_VERSION}/`, location.href).href;
  worker.postMessage({ id, base, input } satisfies CalcRequest);
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}
