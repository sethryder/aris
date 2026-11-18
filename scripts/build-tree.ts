// GGG skilltree export → public/data/<game>/tree-<ver>.json (TreeData). Run: npm run data
import { mkdirSync, writeFileSync } from 'node:fs';
import { stripMarkup } from '../src/core/markup.ts';
import type { TreeData, TreeEdge, TreeNode } from '../src/core/types.ts';

const POE1_TAGS = ['3.30.0', '3.29.1', '3.28.0'];

const ANGLES: Record<number, number[]> = {
  16: [0, 30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330],
  40: [0, 10, 20, 30, 40, 45, 50, 60, 70, 80, 90, 100, 110, 120, 130, 135, 140, 150, 160, 170, 180, 190, 200, 210, 220, 225, 230, 240, 250, 260, 270, 280, 290, 300, 310, 315, 320, 330, 340, 350],
};
const angle = (n: number, i: number) => ((ANGLES[n]?.[i] ?? (360 * i) / n) * Math.PI) / 180;

const lines = (stats: string[] = []) => stats.flatMap((s) => s.split('\n')).map(stripMarkup);
const round = (v: number) => Math.round(v * 10) / 10;

// Shape of GGG's export, only the fields we read (PLAN.md 8.4).
interface RawNode {
  skill: number; name: string; stats?: string[]; group?: number; orbit?: number; orbitIndex?: number;
  out?: string[]; isNotable?: boolean; isKeystone?: boolean; isMastery?: boolean; isJewelSocket?: boolean;
  isAscendancyStart?: boolean; isProxy?: boolean; ascendancyName?: string; classStartIndex?: number;
  masteryEffects?: { effect: number; stats: string[] }[];
}
interface RawTree {
  nodes: Record<string, RawNode>;
  groups: Record<string, { x: number; y: number; isProxy?: boolean }>;
  classes: { name: string; ascendancies: { name: string }[] }[];
  jewelSlots: number[];
  constants: { orbitRadii: number[]; skillsPerOrbit: number[] };
  min_x: number; min_y: number; max_x: number; max_y: number;
}

export function convertPoe1(raw: RawTree, version: string): TreeData {
  const { orbitRadii, skillsPerOrbit } = raw.constants;
  const nodes: Record<number, TreeNode> = {};
  const clusterNotables: Record<string, string[]> = {};

  for (const [key, n] of Object.entries(raw.nodes)) {
    if (key === 'root' || n.isProxy) continue;
    const stats = lines(n.stats);
    if (n.group === undefined) {
      clusterNotables[stripMarkup(n.name)] = stats;
      continue;
    }
    const g = raw.groups[n.group]!;
    // ponytail: cluster-jewel template groups sit off-tree; skipped until cluster subgraphs are drawn.
    if (g.isProxy) continue;
    const orbit = n.orbit ?? 0, r = orbitRadii[orbit]!, a = angle(skillsPerOrbit[orbit]!, n.orbitIndex ?? 0);
    const node: TreeNode = {
      id: n.skill,
      name: stripMarkup(n.name),
      stats,
      kind: n.isKeystone ? 'keystone' : n.isNotable ? 'notable' : n.isMastery ? 'mastery' : n.isJewelSocket ? 'jewel'
        : n.classStartIndex !== undefined ? 'classStart' : n.isAscendancyStart ? 'ascStart' : 'normal',
      x: round(g.x + r * Math.sin(a)),
      y: round(g.y - r * Math.cos(a)),
    };
    if (n.ascendancyName) node.ascendancy = n.ascendancyName;
    if (n.masteryEffects) node.masteryEffects = Object.fromEntries(n.masteryEffects.map((e) => [e.effect, lines(e.stats)]));
    nodes[n.skill] = node;
  }

  // Connector rule from PoB src/Classes/PassiveTree.lua (connectors loop + BuildConnector).
  const edges: TreeEdge[] = [];
  const seen = new Set<string>();
  for (const n of Object.values(raw.nodes)) {
    const a = nodes[n.skill];
    if (!a) continue;
    for (const o of n.out ?? []) {
      const b = nodes[+o], rb = raw.nodes[o]!;
      const key = a.id < +o ? `${a.id},${o}` : `${o},${a.id}`;
      if (!b || seen.has(key)) continue;
      seen.add(key);
      if ([a.kind, b.kind].some((k) => k === 'mastery' || k === 'classStart') || a.ascendancy !== b.ascendancy) continue;
      const e: TreeEdge = { a: a.id, b: b.id };
      if (n.group === rb.group && n.orbit === rb.orbit && (n.orbit ?? 0) > 0) {
        const g = raw.groups[n.group!]!;
        e.arc = { cx: round(g.x), cy: round(g.y), r: orbitRadii[n.orbit!]! };
      }
      edges.push(e);
    }
  }

  return {
    game: 'poe1',
    version,
    bounds: { minX: raw.min_x, minY: raw.min_y, maxX: raw.max_x, maxY: raw.max_y },
    classes: raw.classes.map((c) => ({ name: c.name, ascendancies: c.ascendancies.map((x) => x.name) })),
    nodes,
    edges,
    jewelSlots: raw.jewelSlots,
    clusterNotables,
  };
}

if (import.meta.main) {
  mkdirSync('public/data/poe1', { recursive: true });
  for (const tag of POE1_TAGS) {
    const res = await fetch(`https://raw.githubusercontent.com/grindinggear/skilltree-export/${tag}/data.json`);
    if (!res.ok) throw new Error(`${tag}: HTTP ${res.status}`);
    const version = tag.split('.').slice(0, 2).join('_');
    const json = JSON.stringify(convertPoe1((await res.json()) as RawTree, version));
    writeFileSync(`public/data/poe1/tree-${version}.json`, json);
    console.log(`tree-${version}.json ${(json.length / 1e6).toFixed(2)} MB`);
  }
}
