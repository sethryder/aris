// GGG trade stat list → public/data/poe1/trade-stats.json: { kind: { "mod template": "stat id" } }. Run: npm run data
// The trade site only accepts mods as these ids; src/games/poe1/trade.ts matches mod text against the templates.
// Rerun each league: new mods get new ids.
import { writeFileSync } from 'node:fs';

export const KINDS = ['explicit', 'implicit', 'enchant', 'fractured'] as const;
interface RawEntry { id: string; text: string; option?: unknown }

export function convert(raw: { result: { id: string; entries: RawEntry[] }[] }) {
  const out: Record<string, Record<string, string>> = {};
  for (const kind of KINDS) {
    const map: Record<string, string> = (out[kind] = {});
    for (const e of raw.result.find((g) => g.id === kind)?.entries ?? []) {
      // Multi-line and pick-an-option stats never match one mod line. First id wins for the few duplicate texts.
      if (e.text.includes('\n') || e.option) continue;
      map[e.text] ??= e.id.slice(kind.length + 1);
    }
  }
  return out;
}

if (import.meta.main) {
  const res = await fetch('https://www.pathofexile.com/api/trade/data/stats', { headers: { 'User-Agent': 'aris-build-script' } });
  if (!res.ok) throw new Error(`trade stats: HTTP ${res.status}`);
  writeFileSync('public/data/poe1/trade-stats.json', JSON.stringify(convert(await res.json())));
  console.log('wrote public/data/poe1/trade-stats.json');
}
