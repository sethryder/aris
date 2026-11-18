export type GameId = 'poe1' | 'poe2';

/** One character, normalised. Nothing game-specific leaks past this type. */
export interface Build {
  game: GameId;
  source: 'account' | 'pob';
  label: string;                  // "CharName (Account#1234)" or the PoB spec title
  className: string;              // base class, e.g. "Templar"
  ascendancy: string | null;
  level: number;
  treeVersion: string;            // PoB style: "3_30", "3_30_ruthless"
  /** Allocated node ids that exist in TreeData.nodes. Excludes class-start and
   *  ascendancy-start nodes and all cluster jewel nodes. */
  nodes: number[];
  masteries: Record<number, number>;                               // mastery node id → chosen effect id
  nodeOverrides: Record<number, { name: string; stats: string[] }>; // tattoos
  clusterNotables: string[];      // names, read from cluster jewel mod text
  items: Item[];                  // gear, flasks, tree jewels, abyss jewels
  skills: SkillGroup[];
}

export interface Item {
  slot: string;                   // canonical = PoB slot name, see slots.ts. Tree jewels: "Jewel <socketNodeId>"
  name: string;                   // "" for normal and magic items
  base: string;
  rarity: string;                 // lower case: normal | magic | rare | unique | relic
  mods: Mod[];
}
export interface Mod {
  text: string;                   // markup stripped, one line
  kind: 'enchant' | 'implicit' | 'explicit';
  flags: string[];                // crafted, fractured, ...
}

export interface SkillGroup { slot: string | null; gems: Gem[] }   // one linked group
export interface Gem { name: string; support: boolean; level: number; quality: number }

/** Normalised tree: positions and edges are precomputed, so the renderer is game-agnostic. */
export interface TreeData {
  game: GameId;
  version: string;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  classes: { name: string; ascendancies: string[] }[];   // index = numeric class id
  nodes: Record<number, TreeNode>;
  edges: TreeEdge[];
  jewelSlots: number[];                                  // index → socket node id
  clusterNotables: Record<string, string[]>;             // name → stats, for nodes with no position
}
export interface TreeNode {
  id: number;
  name: string;
  stats: string[];
  kind: 'normal' | 'notable' | 'keystone' | 'mastery' | 'jewel' | 'classStart' | 'ascStart';
  ascendancy?: string;
  x: number;
  y: number;
  masteryEffects?: Record<number, string[]>;             // effect id → stats
}
export interface TreeEdge { a: number; b: number; arc?: { cx: number; cy: number; r: number } }

/** What a game module exports. `fromAccount` is absent when a game has no lookup (PoE2). */
export interface Game {
  id: GameId;
  latestTreeVersion: string;
  treeVersions: string[];
  slotOrder: string[];
  fromPob(doc: Document): Build;
  fromAccount?(raw: { passives: unknown; items: unknown }, tree: TreeData): Build;
}

export interface BuildDiff {
  nodes: { onlyA: number[]; onlyB: number[]; both: number[]; changed: number[] };  // changed = same node, different mastery effect or tattoo
  clusterNotables: { onlyA: string[]; onlyB: string[]; both: string[] };
  treeStats: StatDelta[];
  gems: { onlyA: Gem[]; onlyB: Gem[]; changed: { a: Gem; b: Gem }[]; bySkill: SkillDiff[] };
  items: SlotDiff[];
}
export interface StatDelta { template: string; a: number[]; b: number[] }
export interface SkillDiff { skill: string; inA: boolean; inB: boolean; supportsOnlyA: string[]; supportsOnlyB: string[]; supportsBoth: string[] }
export interface SlotDiff {
  slot: string; a?: Item; b?: Item;
  onlyA: Mod[]; onlyB: Mod[]; changed: { a: Mod; b: Mod }[]; same: Mod[];
}
