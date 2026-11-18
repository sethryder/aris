// GGG character-window API (get-passive-skills + get-items) → Build. Shapes: PLAN.md 8.2.
// The only file that should change when GGG changes the API format.
import { stripMarkup } from '../../core/markup.ts';
import type { Build, Gem, Item, Mod, SkillGroup, TreeData } from '../../core/types.ts';
import { clusterNotablesOf } from './fromPob.ts';
import { apiSlot } from './slots.ts';

type RawMod = string | { description: string; flags?: Record<string, boolean> };
interface RawItem {
  inventoryId: string; x?: number; name?: string; typeLine: string; baseType?: string; rarity?: string;
  enchantMods?: RawMod[]; implicitMods?: RawMod[]; explicitMods?: RawMod[];
  sockets?: { group: number }[];
  socketedItems?: (RawItem & { socket: number; support?: boolean; abyssJewel?: boolean; properties?: { name: string; values: [string, number][] }[] })[];
}
interface RawPassives {
  character: number; ascendancy: number; hashes: number[];
  mastery_effects?: Record<string, number>; skill_overrides?: Record<string, { name: string; stats?: string[] }>;
  items?: RawItem[];
}
interface RawItems { items: RawItem[]; character: { name: string; level: number } }

const SKIP = new Set(['Weapon2', 'Offhand2', 'MainInventory', 'ExpandedMainInventory']);

const mods = (raw: RawMod[] | undefined, kind: Mod['kind']): Mod[] =>
  (raw ?? []).map((m) => typeof m === 'string'
    ? { text: stripMarkup(m), kind, flags: [] }
    : { text: stripMarkup(m.description), kind, flags: Object.keys(m.flags ?? {}).filter((f) => m.flags![f]) });

const toItem = (slot: string, i: RawItem): Item => ({
  slot,
  name: stripMarkup(i.name ?? ''),
  base: stripMarkup(i.baseType ?? i.typeLine),
  rarity: (i.rarity ?? 'normal').toLowerCase(),
  mods: [...mods(i.enchantMods, 'enchant'), ...mods(i.implicitMods, 'implicit'), ...mods(i.explicitMods, 'explicit')],
});

const leadingInt = (props: { name: string; values: [string, number][] }[] | undefined, name: string) =>
  parseInt(props?.find((p) => p.name === name)?.values[0]?.[0]?.replace(/^\+/, '') ?? '', 10) || 0;

export function fromAccount(raw: { passives: unknown; items: unknown }, tree: TreeData, latestTreeVersion: string): Build {
  const passives = raw.passives as RawPassives, items = raw.items as RawItems;
  const cls = tree.classes[passives.character];
  // Verified on the fixture: ascendancy is 1-based (Ranger, 1 → Warden).
  // ponytail: alternate_ascendancy (bloodlines) not shown; map it through GGG's alternate_ascendancies if users want it.
  const ascendancy = passives.ascendancy > 0 ? cls?.ascendancies[passives.ascendancy - 1] ?? null : null;

  const gear: Item[] = [];
  const skills: SkillGroup[] = [];
  for (const it of items.items) {
    if (SKIP.has(it.inventoryId)) continue;
    const slot = apiSlot(it.inventoryId, it.x);
    gear.push(toItem(slot, it));
    const groups = new Map<number, Gem[]>();
    let abyss = 0;
    for (const s of it.socketedItems ?? []) {
      if (s.abyssJewel) { gear.push(toItem(`${slot} Abyssal Socket ${++abyss}`, s)); continue; }
      const g = it.sockets?.[s.socket]?.group ?? s.socket;
      const list = groups.get(g) ?? groups.set(g, []).get(g)!;
      list.push({ name: s.typeLine.replace(/ Support$/, ''), support: !!s.support, level: leadingInt(s.properties, 'Level'), quality: leadingInt(s.properties, 'Quality') });
    }
    for (const gems of groups.values()) skills.push({ slot, gems });
  }

  const jewels = (passives.items ?? []).map((j) => toItem(`Jewel ${tree.jewelSlots[j.x ?? -1] ?? `x${j.x}`}`, j));
  const nodeOverrides: Build['nodeOverrides'] = {};
  for (const [id, n] of Object.entries(passives.skill_overrides ?? {})) nodeOverrides[+id] = { name: stripMarkup(n.name), stats: (n.stats ?? []).map(stripMarkup) };

  return {
    game: 'poe1',
    source: 'account',
    label: items.character.name,
    className: cls?.name ?? '',
    ascendancy,
    level: items.character.level,
    treeVersion: latestTreeVersion,
    nodes: passives.hashes, // hashes_ex (cluster nodes) are jewel-local ids; ignored
    masteries: Object.fromEntries(Object.entries(passives.mastery_effects ?? {}).map(([k, v]) => [+k, +v])),
    nodeOverrides,
    clusterNotables: clusterNotablesOf(jewels),
    items: [...gear, ...jewels],
    skills,
  };
}
