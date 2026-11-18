import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { poe1 } from '../src/games/poe1/index.ts';
import type { TreeData } from '../src/core/types.ts';

const json = (f: string) => JSON.parse(readFileSync(f, 'utf8'));
const tree: TreeData = json('public/data/poe1/tree-3_30.json');

test('fromAccount on the saved fixtures', () => {
  const b = poe1.fromAccount!({ passives: json('test/fixtures/poe1/api-get-passive-skills.json'), items: json('test/fixtures/poe1/api-get-items.json') }, tree);
  expect(b.nodes.length).toBe(116);
  expect(Object.keys(b.masteries).length).toBe(6);
  expect([b.className, b.ascendancy, b.level, b.treeVersion]).toEqual(['Ranger', 'Warden', 100, '3_30']);
  const shield = b.items.find((i) => i.slot === 'Weapon 2')!;
  expect(shield.name).toBe("Foulborn Esh's Mirror");
  expect(shield.mods).toContainEqual({ text: 'Damage cannot be Reflected', kind: 'explicit', flags: ['mutated'] });
  const helm = b.skills.filter((s) => s.slot === 'Helmet').flatMap((s) => s.gems);
  expect(helm.map((g) => g.name)).toEqual(expect.arrayContaining(["Sniper's Mark", 'Mark On Hit']));
  expect(helm.find((g) => g.name === "Sniper's Mark")).toMatchObject({ support: false, level: 20, quality: 8 });
  expect(helm.find((g) => g.name === 'Mark On Hit')?.support).toBe(true);
  expect(b.clusterNotables).toContain('Magnifier');
  expect(b.items.filter((i) => i.slot.startsWith('Jewel ')).length).toBe(6);
  expect(b.items.flatMap((i) => i.mods).filter((m) => /[[|]/.test(m.text))).toEqual([]);
});
