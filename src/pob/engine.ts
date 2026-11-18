// Loads the WebAssembly Lua, mounts Path of Building's packed files, and runs engine.lua.
// Shared by the Web Worker (fetch) and the Node golden test (fs).
import engineLua from './engine.lua?raw';
// @ts-expect-error emscripten output has no types
import createLua from './lua.mjs';

export interface CalcPart { type: string; label: string; lines: string[]; cols: string[]; rows: string[][] }
export interface CalcCell { text: string; parts: CalcPart[] }
export interface CalcRow { label: string; cells: CalcCell[] }
export interface CalcSection { group: number; label: string; rows: CalcRow[] }
export interface CalcResult { mainSkill: string; sections: CalcSection[] }
export type CalcInput = { xml: string } | { items: unknown; passives: unknown };

interface Manifest { tag: string; latest: string; trees: string[]; timeless: Record<string, string[]> }
interface EmFS { mkdirTree(p: string): void; writeFile(p: string, d: Uint8Array | string): void; chdir(p: string): void }

/** `fetchBytes(path)` reads a file under public/pob/<tag>/. `log` receives PoB's console output. */
export async function startEngine(fetchBytes: (path: string) => Promise<Uint8Array>, log: (line: string) => void = () => {}) {
  const manifest = JSON.parse(new TextDecoder().decode(await fetchBytes('manifest.json'))) as Manifest;
  const lua = await createLua({ print: log, printErr: log, stdin: () => null });
  const FS = lua.FS as EmFS;
  const run = (code: string): string => {
    const out = lua.ccall('aris_run', 'string', ['string'], [code]) as string;
    if (out.startsWith('\x01')) throw new Error(out.slice(1));
    return out;
  };
  const write = (path: string, data: Uint8Array) => {
    FS.mkdirTree(path.slice(0, path.lastIndexOf('/')));
    FS.writeFile(path, data);
  };

  const mounted = new Set<string>();
  const mount = async (name: string) => {
    if (mounted.has(name)) return;
    mounted.add(name);
    const gz = await fetchBytes(name);
    const raw = new Uint8Array(await new Response(new Response(gz as BlobPart).body!.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
    const nl = raw.indexOf(10);
    let off = nl + 1;
    for (const [path, size] of JSON.parse(new TextDecoder().decode(raw.subarray(0, nl))) as [string, number][]) {
      write(`/pob/${path}`, raw.subarray(off, off + size));
      off += size;
    }
  };

  await Promise.all([mount('core.pack'), mount(`tree/${manifest.latest}.pack`)]);
  FS.chdir('/pob/src');
  run(engineLua);
  run('return Aris.boot()');

  return {
    tag: manifest.tag,
    async calc(input: CalcInput): Promise<CalcResult> {
      const text = 'xml' in input ? input.xml : JSON.stringify(input);
      const trees = 'xml' in input ? [...input.xml.matchAll(/treeVersion="(\w+)"/g)].map((m) => m[1]!) : [];
      await Promise.all(trees.filter((v) => manifest.trees.includes(v)).map((v) => mount(`tree/${v}.pack`)));
      // ponytail: a jewel is detected by its name appearing in the build ("Elegant Hubris" → ElegantHubris);
      // jewels whose file name doesn't match their item name stay unloaded, and PoB says "Missing LUT".
      const squashed = text.replace(/[\s']/g, '');
      await Promise.all(Object.entries(manifest.timeless).filter(([jewel]) => squashed.includes(jewel)).flatMap(([, files]) =>
        files.filter((f) => !mounted.has(f)).map(async (f) => {
          mounted.add(f);
          write(`/pob/src/Data/TimelessJewelData/${f}`, await fetchBytes(`timeless/${f}`));
        })));
      write('/in', new TextEncoder().encode(text));
      return JSON.parse(run(`return Aris.${'xml' in input ? 'calcXml' : 'calcApi'}('/in')`)) as CalcResult;
    },
  };
}
