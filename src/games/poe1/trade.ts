// Path of Exile trade site search links. Stat ids and base types come from public/data/poe1/trade-stats.json
// (scripts/build-trade-stats.ts); without it, links search by name or base only.
import type { Item, Mod } from '../../core/types.ts';

export interface TradeData {
  stats: Record<string, Record<string, string>>;   // kind → mod template → stat id
  bases: string[];                                 // gear base types
}

// Weapons roll local versions of attack mods, armour pieces of defence mods; the trade site marks them " (Local)".
// ponytail: quivers sit in Weapon 2 too, so a quiver's global accuracy could pick the local id; split by base if it matters.
const ARMOUR_SLOTS = new Set(['Helmet', 'Body Armour', 'Gloves', 'Boots']);
const isLocal = (slot: string, tpl: string) => slot.startsWith('Weapon') || (ARMOUR_SLOTS.has(slot) && /Armour|Evasion|Energy Shield/.test(tpl));
const MIN_ROLL = 0.9;   // search for rolls at least 90% of theirs
const bits = (x: number) => x.toString(2).replace(/0/g, '').length;

/** One trade stat filter for a mod, or null when the trade site can't search it (crafted, or text not in the stat list). */
export function statFilter(m: Mod, slot: string, stats: TradeData['stats']) {
  if (m.flags.includes('crafted')) return null;   // you'd craft it yourself
  const kind = m.flags.includes('fractured') ? 'fractured' : m.kind;
  const map = stats[kind] ?? {};
  const parts = m.text.split(/(\d+(?:\.\d+)?)/);   // odd indexes are numbers
  const n = (parts.length - 1) / 2;
  if (n > 4) return null;
  // Templates keep some numbers literal ("per 2% Shock Effect", "1 Added Passive Skill is Magnifier"), so try every
  // mix of templated and literal numbers, most templated first. bit i set = number i becomes "#".
  for (const mask of [...Array(1 << n).keys()].sort((a, b) => bits(b) - bits(a))) {
    const rolls: number[] = [];
    const tpl = parts.map((p, i) => (i % 2 && mask & (1 << ((i - 1) / 2)) ? (rolls.push(+p), '#') : p)).join('');
    // "reduced"/"-#" mods are listed under the "increased"/"+#" stat with a negative value.
    const flipped = tpl.replace(/\breduced\b/, 'increased').replace(/^-#/, '+#');
    for (const t of flipped === tpl ? [tpl] : [tpl, flipped]) {
      const id = (isLocal(slot, t) ? [map[`${t} (Local)`], map[t]] : [map[t]]).find(Boolean);
      if (!id) continue;
      if (!rolls.length) return { id: `${kind}.${id}` };
      const avg = rolls.reduce((s, r) => s + r, 0) / rolls.length;   // "Adds 2 to 42" searches by the average, like the site
      const bound = Number.isInteger(avg) ? Math.floor(avg * MIN_ROLL) : Math.floor(avg * MIN_ROLL * 10) / 10;
      return { id: `${kind}.${id}`, value: t === tpl ? { min: bound } : { max: -bound } };
    }
  }
  return null;
}

const isUnique = (i: Item) => i.rarity === 'unique' || i.rarity === 'relic';

/** PoB keeps a magic item's whole name as its base ("Bottomless Quicksilver Flask of the Lynx"): take the longest known
 *  base inside it. Undefined when it can't be told apart, so the search leaves the base out rather than fail. */
function baseType(i: Item, data?: TradeData) {
  if (isUnique(i)) return i.base;
  const known = data?.bases.filter((b) => i.base.includes(b)).sort((a, b) => b.length - a.length)[0];
  return known ?? (i.rarity === 'magic' ? undefined : i.base);
}

/** Same unique by name (corrupted ones: corrupted, with their implicits), or the same base with their mods for anything else. */
export function tradeUrl(i: Item, league: string, data?: TradeData) {
  const status = { option: 'online' };
  const filtersFor = (mods: Mod[]) => (data ? mods.flatMap((m) => statFilter(m, i.slot, data.stats) ?? []) : []);
  // Rares need no corrupted filter: a corruption implicit is already one of their mod filters.
  const query = isUnique(i)
    ? {
        status, name: i.name.replace(/^Foulborn /, ''), type: i.base,
        ...(i.corrupted && {
          stats: [{ type: 'and', filters: filtersFor(i.mods.filter((m) => m.kind === 'implicit')) }],
          filters: { misc_filters: { filters: { corrupted: { option: 'true' } } } },
        }),
      }
    : {
        status, type: baseType(i, data),
        stats: [{ type: 'and', filters: filtersFor(i.mods) }],
        filters: { type_filters: { filters: { rarity: { option: 'nonunique' } } } },
      };
  return `https://www.pathofexile.com/trade/search/${encodeURIComponent(league)}?q=${encodeURIComponent(JSON.stringify({ query }))}`;
}

/** Hover text for the link, matching what tradeUrl actually searches. */
export function tradeTitle(i: Item, league: string, data?: TradeData) {
  if (isUnique(i)) {
    return `Searches ${league} for this unique${i.corrupted ? `, corrupted${data ? ', with their implicits at 90% or more of their rolls' : ''}` : ''}.`;
  }
  return data
    ? `Searches ${league} for this base with all their mods (except crafted) at 90% or more of their rolls. Turn some off on the trade site if there are too few results.`
    : `Searches ${league} for this base. Mod filters are unavailable.`;
}

/** Trade leagues drop the SSF prefix: "SSF Hardcore Covens" trades in "Hardcore Covens". */
export const tradeLeague = (league: string) => league.replace(/\bSSF /, '');
