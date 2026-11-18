import type { Build, TreeData } from './types.ts';

const NUM = /\d+(?:\.\d+)?/g;

/** "+5% to X" → { template: "+#% to X", values: [5] } */
export const template = (line: string) => ({ template: line.replace(NUM, '#'), values: (line.match(NUM) ?? []).map(Number) });

/** Effective stats of an allocated node: tattoo override, else chosen mastery effect, else the tree's. */
export function nodeStats(build: Build, tree: TreeData, id: number): string[] {
  const override = build.nodeOverrides[id];
  if (override) return override.stats;
  const node = tree.nodes[id];
  if (!node) return [];
  if (node.kind === 'mastery') return node.masteryEffects?.[build.masteries[id]!] ?? [];
  return node.stats;
}

/** Group lines by template and sum their numbers element-wise. */
export function sumStats(lines: string[]): Map<string, number[]> {
  const sums = new Map<string, number[]>();
  for (const line of lines) {
    const t = template(line);
    const acc = sums.get(t.template);
    if (acc) t.values.forEach((v, i) => (acc[i] = (acc[i] ?? 0) + v));
    else sums.set(t.template, t.values);
  }
  return sums;
}
