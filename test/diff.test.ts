import { expect, test } from 'vitest';
import { diff, matches } from '../src/core/diff.ts';
import { sumStats, template } from '../src/core/stats.ts';
import type { Build, TreeData, TreeNode } from '../src/core/types.ts';

const node = (id: number, stats: string[], kind: TreeNode['kind'] = 'normal', extra: Partial<TreeNode> = {}): TreeNode =>
  ({ id, name: `N${id}`, stats, kind, x: 0, y: 0, ...extra });
const tree: TreeData = {
  game: 'poe1', version: '3_30', bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 }, classes: [], edges: [], jewelSlots: [], clusterNotables: {},
  nodes: {
    1: node(1, [], 'classStart'),
    2: node(2, ['+10 to Strength']),
    3: node(3, ['+10 to Strength']),
    4: node(4, ['+5% Chance to Block Attack Damage while holding a Shield'], 'notable'),
    5: node(5, [], 'mastery', { masteryEffects: { 100: ['+1 to Armour'], 200: ['+2 to Evasion'] } }),
  },
};
const base: Build = {
  game: 'poe1', source: 'pob', label: 'A', className: 'Templar', ascendancy: null, level: 90, treeVersion: '3_30',
  nodes: [1, 2, 3, 5], masteries: { 5: 100 }, nodeOverrides: {}, clusterNotables: ['Magnifier'],
  items: [
    { slot: 'Weapon 2', name: 'Doom Ward', base: 'Ezomyte Tower Shield', rarity: 'rare', mods: [{ text: '+80 to maximum Life', kind: 'explicit', flags: [] }] },
    { slot: 'Ring 1', name: 'Ring X', base: 'Ruby Ring', rarity: 'rare', mods: [{ text: '+30% to Fire Resistance', kind: 'implicit', flags: [] }] },
    { slot: 'Ring 2', name: 'Ring Y', base: 'Iron Ring', rarity: 'rare', mods: [] },
  ],
  skills: [{ slot: 'Helmet', gems: [{ name: 'Fireball', support: false, level: 20, quality: 0 }, { name: 'Spell Echo', support: true, level: 20, quality: 0 }] }],
};

test('the user story: they have more block', () => {
  const them: Build = structuredClone(base);
  them.nodes.push(4);
  them.items[0]!.mods.push({ text: '+6% Chance to Block', kind: 'explicit', flags: [] });
  const d = diff(base, them, tree, tree);
  expect(d.nodes).toEqual({ onlyA: [], onlyB: [4], both: [2, 3, 5], changed: [] });
  expect(d.treeStats).toEqual([{ template: '+#% Chance to Block Attack Damage while holding a Shield', a: [0], b: [5] }]);
  const shield = d.items.find((s) => s.slot === 'Weapon 2')!;
  expect(shield.onlyB.map((m) => m.text)).toEqual(['+6% Chance to Block']);
  expect(shield.same.length).toBe(1);
});

test('rings on swapped fingers pair up, rolls and masteries show as changed, gems split', () => {
  const them: Build = structuredClone(base);
  them.masteries[5] = 200;
  them.nodes = [2, 5];
  [them.items[1]!.slot, them.items[2]!.slot] = ['Ring 2', 'Ring 1'];
  them.items[1]!.mods[0]!.text = '+40% to Fire Resistance';
  them.skills[0]!.gems = [{ name: 'Fireball', support: false, level: 21, quality: 20 }, { name: 'Inspiration', support: true, level: 20, quality: 0 }];
  const d = diff(base, them, tree, tree);
  expect(d.nodes.changed).toEqual([5]);
  expect(d.nodes.onlyA).toEqual([3]);
  expect(d.treeStats.map((s) => [s.template, s.a, s.b])).toEqual([
    ['+# to Armour', [1], [0]], ['+# to Evasion', [0], [2]], ['+# to Strength', [20], [10]],
  ]);
  const rings = d.items.filter((s) => s.slot.startsWith('Ring'));
  expect(rings.map((r) => [r.a?.name, r.b?.name])).toEqual([['Ring X', 'Ring X'], ['Ring Y', 'Ring Y']]);
  expect(rings[0]!.changed).toEqual([{ a: base.items[1]!.mods[0], b: them.items[1]!.mods[0] }]);
  expect(d.gems.changed.map((c) => c.a.name)).toEqual(['Fireball']);
  expect(d.gems.onlyA.map((g) => g.name)).toEqual(['Spell Echo']);
  expect(d.gems.bySkill).toEqual([{ skill: 'Fireball', inA: true, inB: true, supportsOnlyA: ['Spell Echo'], supportsOnlyB: ['Inspiration'], supportsBoth: [] }]);
});

test('stats helpers', () => {
  expect(template('Adds 1 to 60.5 Lightning Damage')).toEqual({ template: 'Adds # to # Lightning Damage', values: [1, 60.5] });
  expect([...sumStats(['+10 to Strength', '+5 to Strength'])]).toEqual([['+# to Strength', [15]]]);
  expect(matches(' BLOCK', '+6% Chance to Block')).toBe(true);
});

test('across tree versions, rebalanced node text is not a "different choice"; a mastery pick is', () => {
  const treeB: TreeData = structuredClone(tree);
  treeB.version = '3_29';
  treeB.nodes[2]!.stats = ['+8 to Strength'];
  const them: Build = { ...structuredClone(base), treeVersion: '3_29', masteries: { 5: 200 } };
  expect(diff(base, them, tree, treeB).nodes.changed).toEqual([5]);
});
