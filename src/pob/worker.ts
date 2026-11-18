// Web Worker hosting the PoB engine. One engine per worker, requests handled one at a time.
import { startEngine, type CalcInput } from './engine.ts';

export interface CalcRequest { id: number; base: string; input: CalcInput }

let engine: ReturnType<typeof startEngine> | undefined;
let queue: Promise<unknown> = Promise.resolve();

self.onmessage = ({ data: { id, base, input } }: MessageEvent<CalcRequest>) => {
  queue = queue.then(async () => {
    try {
      engine ??= startEngine(async (path) => {
        const res = await fetch(new URL(path, base));
        if (!res.ok) throw new Error(`Could not download ${path} (HTTP ${res.status})`);
        return new Uint8Array(await res.arrayBuffer());
      });
      const e = await engine.catch((err) => { engine = undefined; throw err; });
      postMessage({ id, result: await e.calc(input) });
    } catch (err) {
      postMessage({ id, error: err instanceof Error ? err.message : String(err) });
    }
  });
};
