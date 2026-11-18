import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import type { TreeData } from '../src/core/types.ts';

const tree: TreeData = JSON.parse(readFileSync('public/data/poe1/tree-3_30.json', 'utf8'));

test('tree-3_30 is sane', () => {
  const ds = tree.nodes[58556]!;
  expect(ds.name).toBe('Divine Shield');
  expect(ds.kind).toBe('keystone');
  expect(ds.stats.length).toBeGreaterThan(1);
  const { minX, minY, maxX, maxY } = tree.bounds;
  expect(ds.x).toBeGreaterThanOrEqual(minX); expect(ds.x).toBeLessThanOrEqual(maxX);
  expect(ds.y).toBeGreaterThanOrEqual(minY); expect(ds.y).toBeLessThanOrEqual(maxY);
  for (const n of Object.values(tree.nodes)) expect(Number.isFinite(n.x) && Number.isFinite(n.y)).toBe(true);
  for (const e of tree.edges) expect(tree.nodes[e.a] && tree.nodes[e.b]).toBeTruthy();
  // jewelSlots keeps GGG's full index (API item.x points into it); 36 entries are cluster-subgraph sockets with no tree node.
  const onTree = tree.jewelSlots.filter((id) => tree.nodes[id]);
  expect(onTree.length).toBe(24);
  for (const id of onTree) expect(tree.nodes[id]!.kind).toBe('jewel');
  const all = Object.values(tree.nodes).flatMap((n) => [n.name, ...n.stats, ...Object.values(n.masteryEffects ?? {}).flat()]);
  expect(all.filter((s) => /[[|]/.test(s))).toEqual([]);
  expect(tree.clusterNotables['Magnifier']?.length).toBeGreaterThan(0);
  expect(tree.classes[0]!.name).toBe('Scion');
});
