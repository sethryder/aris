import { stripMarkup } from '../../core/markup.ts';
import type { Build, Gem, Item, Mod, SkillGroup } from '../../core/types.ts';

const kids = (el: Element | null | undefined, tag: string) => (el ? [...el.children].filter((c) => c.tagName === tag) : []);
const attr = (el: Element | null | undefined, name: string) => {
  const v = el?.getAttribute(name);
  return v == null || v === 'nil' || v === 'None' ? null : v;
};
/** The child set whose `id` matches the parent's active-set attribute; older exports have no sets. */
const activeSet = (parent: Element | null, setTag: string, activeAttr: string) => {
  const sets = kids(parent, setTag);
  return sets.length ? sets.find((s) => s.getAttribute('id') === attr(parent, activeAttr)) ?? sets[0]! : parent;
};

export const CLUSTER_NOTABLE = /^1 Added Passive Skill is (.+)$/;
export const clusterNotablesOf = (items: Item[]) =>
  items.flatMap((i) => i.mods.map((m) => m.text.match(CLUSTER_NOTABLE)?.[1]).filter((n): n is string => !!n && n !== 'a Jewel Socket'));

export function fromPob(doc: Document): Build {
  const root = doc.documentElement;
  const build = kids(root, 'Build')[0];
  const tree = kids(root, 'Tree')[0];
  const specs = kids(tree, 'Spec');
  const spec = specs[Number(attr(tree, 'activeSpec') ?? 1) - 1] ?? specs[0]; // 1-based index

  const masteries: Record<number, number> = {};
  for (const [, node, effect] of (attr(spec, 'masteryEffects') ?? '').matchAll(/\{(\d+),(\d+)\}/g)) masteries[+node!] = +effect!;

  const nodeOverrides: Build['nodeOverrides'] = {};
  for (const o of spec?.querySelectorAll('Overrides > Override') ?? []) {
    nodeOverrides[Number(o.getAttribute('nodeId'))] = { name: o.getAttribute('dn') ?? '', stats: splitLines(o.textContent) };
  }

  const itemsEl = kids(root, 'Items')[0];
  const itemText = new Map(kids(itemsEl, 'Item').map((i) => [i.getAttribute('id'), i.textContent ?? '']));
  const slotted: [string, string | null][] = kids(activeSet(itemsEl ?? null, 'ItemSet', 'activeItemSet'), 'Slot')
    .filter((s) => !s.getAttribute('name')?.includes('Swap'))
    .map((s) => [s.getAttribute('name')!, s.getAttribute('itemId')]);
  for (const s of spec?.querySelectorAll('Sockets > Socket') ?? []) slotted.push([`Jewel ${s.getAttribute('nodeId')}`, s.getAttribute('itemId')]);
  const items = slotted
    .filter(([, id]) => id && id !== '0' && itemText.has(id))
    .map(([slot, id]) => parseItem(slot, itemText.get(id)!));

  const skillsEl = kids(root, 'Skills')[0];
  const skills: SkillGroup[] = kids(activeSet(skillsEl ?? null, 'SkillSet', 'activeSkillSet'), 'Skill')
    .filter((s) => s.getAttribute('enabled') !== 'false' && !s.hasAttribute('source'))
    .map((s) => ({
      slot: attr(s, 'slot'),
      gems: kids(s, 'Gem')
        .filter((g) => g.getAttribute('enabled') !== 'false' && g.getAttribute('nameSpec'))
        .map((g): Gem => ({
          name: g.getAttribute('nameSpec')!,
          // ponytail: prefix heuristic instead of a gem database; convert PoB src/Data/Gems.lua if it misclassifies.
          support: (g.getAttribute('skillId') ?? '').startsWith('Support'),
          level: Number(g.getAttribute('level')) || 0,
          quality: Number(g.getAttribute('quality')) || 0,
        })),
    }))
    .filter((g) => g.gems.length);

  const className = attr(build, 'className') ?? '';
  const ascendancy = attr(build, 'ascendClassName');
  const level = Number(attr(build, 'level')) || 1;
  return {
    game: 'poe1',
    source: 'pob',
    label: attr(spec, 'title') ?? 'Path of Building build',
    className,
    ascendancy,
    level,
    treeVersion: attr(spec, 'treeVersion') ?? '',
    nodes: (attr(spec, 'nodes') ?? '').split(',').filter(Boolean).map(Number).filter((id) => id < 65536), // 65536+ = cluster nodes
    masteries,
    nodeOverrides,
    clusterNotables: clusterNotablesOf(items.filter((i) => i.slot.startsWith('Jewel'))),
    items,
    skills,
  };
}

const splitLines = (s: string | null) => (s ?? '').split('\n').map((l) => stripMarkup(l.trim())).filter(Boolean);

const NOT_MODS = /^(Split|Mirrored|Corrupted|Requirements:|-+|Foil Unique.*|(Shaper|Elder|Crusader|Hunter|Redeemer|Warlord|Searing Exarch|Eater of Worlds|Fractured|Synthesised) Item)$/;

/** PoB item text → Item. Ground truth: PoB src/Classes/Item.lua ParseRaw. */
export function parseItem(slot: string, raw: string): Item {
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
  let i = 0;
  const rarity = (lines[i]?.match(/^Rarity: (\w+)/)?.[1] ?? 'normal').toLowerCase();
  if (lines[i]?.startsWith('Rarity:')) i++;
  const twoLines = rarity === 'rare' || rarity === 'unique' || rarity === 'relic';
  const name = twoLines ? lines[i++] ?? '' : '';
  const base = lines[i++] ?? '';

  let variants = 0, selected = 0, alt = 0, implicits = 0;
  for (; i < lines.length; i++) {
    const [, key, val] = lines[i]!.match(/^([^:{]+): (.*)$/) ?? [];
    if (key === 'Implicits') { implicits = Number(val) || 0; i++; break; }
    if (key === 'Variant') variants++;
    else if (key === 'Selected Variant') selected = Number(val);
    else if (key === 'Selected Alt Variant') alt = Number(val);
    // ponytail: Selected Variant Group / Alt2..5 ignored (a handful of uniques); see Item.lua NormaliseVariantSelections.
  }
  selected ||= variants; // PoB defaults to the last variant

  const mods: Mod[] = [];
  lines.slice(i).forEach((line, n) => {
    if (NOT_MODS.test(line) || line.startsWith('(')) return;
    const tags = [...line.matchAll(/\{(\w+)(?::([^}]*))?\}/g)];
    const text = applyRange(line.replace(/\{[^}]*\}/g, ''), tags.find((t) => t[1] === 'range')?.[2]);
    const variantList = tags.find((t) => t[1] === 'variant')?.[2]?.split(',').map(Number);
    if (variantList && !variantList.includes(selected) && !variantList.includes(alt)) return;
    if (tags.some((t) => t[1] === 'disabled')) return; // PoB ignores these (e.g. mods a Foulborn mutation removed)
    const flags = tags.map((t) => t[1]!).filter((t) => !['range', 'variant', 'tags', 'modGroup', 'enchant', 'implicit'].includes(t));
    const inImplicits = n < implicits;
    const enchant = flags.includes('crafted') && inImplicits || tags.some((t) => t[1] === 'enchant');
    mods.push({
      text: stripMarkup(text),
      kind: enchant ? 'enchant' : inImplicits ? 'implicit' : 'explicit',
      flags: enchant ? flags.filter((f) => f !== 'crafted') : flags,
    });
  });
  return { slot, name, base, rarity, mods };
}

/** `(a-b)` → `a + r·(b−a)`, rounded to the bounds' decimal precision. PoB defaults r to 0.5. */
function applyRange(text: string, r = '0.5'): string {
  return text.replace(/\((-?\d+(?:\.\d+)?)-(-?\d+(?:\.\d+)?)\)/g, (_, a: string, b: string) => {
    const dp = Math.max(a.split('.')[1]?.length ?? 0, b.split('.')[1]?.length ?? 0);
    const v = +a + Number(r) * (+b - +a);
    return (Math.round(v * 10 ** dp) / 10 ** dp).toFixed(dp);
  });
}
