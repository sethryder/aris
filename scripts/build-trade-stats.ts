// GGG trade data → public/data/poe1/trade-stats.json (TradeData, src/games/poe1/trade.ts). Run: npm run data
// stats: the trade site only accepts mods as these ids; trade.ts matches mod text against the templates.
// bases: gear base types, to find the base inside a PoB magic item's name ("Bottomless Quicksilver Flask of the Lynx").
// Rerun each league: new mods get new ids.
import { writeFileSync } from 'node:fs';
import type { TradeData } from '../src/games/poe1/trade.ts';

export const KINDS = ['explicit', 'implicit', 'enchant', 'fractured'] as const;
const GEAR = ['accessory', 'armour', 'flask', 'jewel', 'weapon', 'graft', 'tincture'];
interface RawEntry { id: string; text: string; option?: unknown }
type Raw<E> = { result: { id: string; entries: E[] }[] };

export function convert(stats: Raw<RawEntry>, items: Raw<{ type: string; name?: string }>): TradeData {
  const out: TradeData = { stats: {}, bases: [] };
  for (const kind of KINDS) {
    const map: Record<string, string> = (out.stats[kind] = {});
    for (const e of stats.result.find((g) => g.id === kind)?.entries ?? []) {
      // Multi-line and pick-an-option stats never match one mod line. First id wins for the few duplicate texts.
      if (e.text.includes('\n') || e.option) continue;
      map[e.text] ??= e.id.slice(kind.length + 1);
    }
  }
  out.bases = [...new Set(items.result.filter((g) => GEAR.includes(g.id)).flatMap((g) => g.entries.filter((e) => !e.name).map((e) => e.type)))];
  return out;
}

if (import.meta.main) {
  const get = async (what: string) => {
    // GGG asks API clients for a contact in the User-Agent; CONTACT is the same .env value the proxy uses.
    const ua = `aris-build-script${process.env.CONTACT ? ` (contact: ${process.env.CONTACT})` : ''}`;
    const res = await fetch(`https://www.pathofexile.com/api/trade/data/${what}`, { headers: { 'User-Agent': ua } });
    if (!res.ok) throw new Error(`trade ${what}: HTTP ${res.status}`);
    return res.json();
  };
  writeFileSync('public/data/poe1/trade-stats.json', JSON.stringify(convert(await get('stats'), await get('items'))));
  console.log('wrote public/data/poe1/trade-stats.json');
}
