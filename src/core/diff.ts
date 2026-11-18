import { nodeStats, sumStats, template } from './stats.ts';
import type { Build, BuildDiff, Gem, Item, Mod, SkillDiff, SlotDiff, StatDelta, TreeData } from './types.ts';

export const matches = (filter: string, text: string) => text.toLowerCase().includes(filter.trim().toLowerCase());

const split = <T>(a: T[], b: T[]) => {
  const sa = new Set(a), sb = new Set(b);
  return { onlyA: a.filter((x) => !sb.has(x)), onlyB: b.filter((x) => !sa.has(x)), both: a.filter((x) => sb.has(x)) };
};
const uniq = <T>(xs: T[]) => [...new Set(xs)];

export function diff(a: Build, b: Build, treeA: TreeData, treeB: TreeData): BuildDiff {
  const real = (build: Build, tree: TreeData) =>
    uniq(build.nodes).filter((id) => tree.nodes[id]?.kind !== 'classStart' && tree.nodes[id]?.kind !== 'ascStart');
  const nodesA = real(a, treeA), nodesB = real(b, treeB);
  const n = split(nodesA, nodesB);
  const changed = n.both.filter((id) => nodeStats(a, treeA, id).join('\n') !== nodeStats(b, treeB, id).join('\n'));

  return {
    nodes: { ...n, changed },
    clusterNotables: split(uniq(a.clusterNotables), uniq(b.clusterNotables)),
    treeStats: statDeltas(nodesA.flatMap((id) => nodeStats(a, treeA, id)), nodesB.flatMap((id) => nodeStats(b, treeB, id))),
    gems: gemDiff(a, b),
    items: itemDiff(a.items, b.items),
  };
}

function statDeltas(linesA: string[], linesB: string[]): StatDelta[] {
  const sa = sumStats(linesA), sb = sumStats(linesB);
  return uniq([...sa.keys(), ...sb.keys()])
    .map((t) => {
      const va = sa.get(t), vb = sb.get(t);
      return { template: t, a: va ?? vb!.map(() => 0), b: vb ?? va!.map(() => 0) };
    })
    .filter((d) => d.a.join() !== d.b.join())
    .sort((x, y) => x.template.localeCompare(y.template));
}

function gemDiff(a: Build, b: Build): BuildDiff['gems'] {
  const byName = (build: Build) => {
    const m = new Map<string, Gem>();
    for (const g of build.skills.flatMap((s) => s.gems)) if ((m.get(g.name)?.level ?? -1) < g.level) m.set(g.name, g);
    return m;
  };
  const ga = byName(a), gb = byName(b);
  const supportsOf = (build: Build, skill: string) =>
    uniq(build.skills.filter((s) => s.gems.some((g) => g.name === skill)).flatMap((s) => s.gems.filter((g) => g.support).map((g) => g.name)));
  const actives = uniq([...ga.values(), ...gb.values()].filter((g) => !g.support).map((g) => g.name));
  const bySkill = actives.map((skill): SkillDiff => {
    const s = split(supportsOf(a, skill), supportsOf(b, skill));
    return { skill, inA: ga.has(skill), inB: gb.has(skill), supportsOnlyA: s.onlyA, supportsOnlyB: s.onlyB, supportsBoth: s.both };
  });
  return {
    onlyA: [...ga.values()].filter((g) => !gb.has(g.name)),
    onlyB: [...gb.values()].filter((g) => !ga.has(g.name)),
    changed: [...ga.values()].flatMap((g) => {
      const o = gb.get(g.name);
      return o && (o.level !== g.level || o.quality !== g.quality) ? [{ a: g, b: o }] : [];
    }),
    bySkill,
  };
}

/** Interchangeable slots: a ring on the other finger is not a difference. */
const family = (slot: string) => slot.match(/^(Ring|Flask|Jewel) /)?.[1] ?? slot;

function itemDiff(itemsA: Item[], itemsB: Item[]): SlotDiff[] {
  const pairs: [Item | undefined, Item | undefined][] = [];
  for (const fam of uniq([...itemsA, ...itemsB].map((i) => family(i.slot)))) {
    const restA = itemsA.filter((i) => family(i.slot) === fam), restB = itemsB.filter((i) => family(i.slot) === fam);
    const take = (same: (x: Item, y: Item) => boolean) => {
      for (const x of [...restA]) {
        const j = restB.findIndex((y) => same(x, y));
        if (j < 0) continue;
        pairs.push([x, restB.splice(j, 1)[0]]);
        restA.splice(restA.indexOf(x), 1);
      }
    };
    take((x, y) => x.slot === y.slot && x.name === y.name && x.base === y.base);
    take((x, y) => x.name === y.name && x.base === y.base);
    take((x, y) => x.base === y.base);
    take((x, y) => x.slot === y.slot);
    take(() => true);
    for (const x of restA) pairs.push([x, undefined]);
    for (const y of restB) pairs.push([undefined, y]);
  }
  return pairs.map(([a, b]) => ({ slot: (a ?? b)!.slot, a, b, ...modDiff(a?.mods ?? [], b?.mods ?? []) }));
}

function modDiff(modsA: Mod[], modsB: Mod[]): Omit<SlotDiff, 'slot' | 'a' | 'b'> {
  const key = (m: Mod) => `${m.kind}|${template(m.text).template}`;
  const restB = [...modsB], same: Mod[] = [], changed: { a: Mod; b: Mod }[] = [], onlyA: Mod[] = [];
  const pending: Mod[] = [];
  for (const m of modsA) {
    const j = restB.findIndex((o) => o.kind === m.kind && o.text === m.text);
    if (j >= 0) same.push(restB.splice(j, 1)[0]!);
    else pending.push(m);
  }
  for (const m of pending) {
    const j = restB.findIndex((o) => key(o) === key(m));
    if (j >= 0) changed.push({ a: m, b: restB.splice(j, 1)[0]! });
    else onlyA.push(m);
  }
  return { onlyA, onlyB: restB, changed, same };
}
