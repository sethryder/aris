// Path of Exile trade site search links. Stat ids come from public/data/poe1/trade-stats.json (scripts/build-trade-stats.ts).
import type { Item, Mod } from '../../core/types.ts';

export type TradeStats = Record<string, Record<string, string>>;   // kind → mod template → stat id

// Weapons and armour roll local versions of some mods; the trade site tells them apart with a " (Local)" suffix.
// ponytail: quivers sit in Weapon 2 too, so a quiver's global accuracy could pick the local id; split by base if it matters.
const LOCAL_SLOTS = new Set(['Weapon 1', 'Weapon 2', 'Helmet', 'Body Armour', 'Gloves', 'Boots']);
const MIN_ROLL = 0.9;   // search for rolls at least 90% of theirs

/** One trade stat filter for a mod, or null when the trade site can't search it (crafted, or text not in the stat list). */
export function statFilter(m: Mod, slot: string, stats: TradeStats) {
  if (m.flags.includes('crafted')) return null;   // you'd craft it yourself
  const kind = m.flags.includes('fractured') ? 'fractured' : m.kind;
  const map = stats[kind] ?? {};
  const parts = m.text.split(/(\d+(?:\.\d+)?)/);   // odd indexes are numbers
  const n = (parts.length - 1) / 2;
  if (n > 4) return null;
  // Templates keep some numbers literal ("per 2% Shock Effect", "1 Added Passive Skill is Magnifier"), so try every
  // mix of templated and literal numbers, most templated first. bit i set = number i becomes "#".
  for (let mask = (1 << n) - 1; mask >= 0; mask--) {
    const rolls: number[] = [];
    const tpl = parts.map((p, i) => (i % 2 && mask & (1 << ((i - 1) / 2)) ? (rolls.push(+p), '#') : p)).join('');
    // "reduced"/"-#" mods are listed under the "increased"/"+#" stat with a negative value; search those without a minimum.
    const flipped = tpl.replace(/\breduced\b/, 'increased').replace(/^-#/, '+#');
    for (const t of flipped === tpl ? [tpl] : [tpl, flipped]) {
      const id = (LOCAL_SLOTS.has(slot) ? [map[`${t} (Local)`], map[t]] : [map[t]]).find(Boolean);
      if (!id) continue;
      const avg = rolls.reduce((s, r) => s + r, 0) / rolls.length;   // "Adds 2 to 42" searches by the average, like the site
      return { id: `${kind}.${id}`, ...(t === tpl && rolls.length > 0 && { value: { min: Math.floor(avg * MIN_ROLL) } }) };
    }
  }
  return null;
}

/** Same unique by name (corrupted ones: corrupted, with their implicits), or the same base with their mods for anything else.
 *  Mod filters need the stat list; without it the search is by name or base only. */
export function tradeUrl(i: Item, league: string, stats?: TradeStats) {
  const status = { option: 'online' };
  const filtersFor = (mods: Mod[]) => (stats ? mods.flatMap((m) => statFilter(m, i.slot, stats) ?? []) : []);
  // Rares need no corrupted filter: a corruption implicit is already one of their mod filters.
  const query = i.rarity === 'unique' || i.rarity === 'relic'
    ? {
        status, name: i.name.replace(/^Foulborn /, ''), type: i.base,
        ...(i.corrupted && {
          stats: [{ type: 'and', filters: filtersFor(i.mods.filter((m) => m.kind === 'implicit')) }],
          filters: { misc_filters: { filters: { corrupted: { option: 'true' } } } },
        }),
      }
    : {
        status, type: i.base,
        stats: [{ type: 'and', filters: filtersFor(i.mods) }],
        filters: { type_filters: { filters: { rarity: { option: 'nonunique' } } } },
      };
  return `https://www.pathofexile.com/trade/search/${encodeURIComponent(league)}?q=${encodeURIComponent(JSON.stringify({ query }))}`;
}
