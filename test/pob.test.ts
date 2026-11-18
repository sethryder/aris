import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { decodePob, PobError } from '../src/core/pob.ts';
import { fromPob, parseItem } from '../src/games/poe1/fromPob.ts';

async function encode(xml: string) {
  const s = new Response(xml).body!.pipeThrough(new CompressionStream('deflate'));
  const bytes = new Uint8Array(await new Response(s).arrayBuffer());
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_');
}
const fixture = (f: string) => readFileSync(`test/fixtures/${f}`, 'utf8');

test('decodePob detects game and rejects junk', async () => {
  const { game, doc } = await decodePob(`  ${await encode(fixture('poe1/pob-b.xml'))}\n`);
  expect(game).toBe('poe1');
  expect(doc.documentElement.nodeName).toBe('PathOfBuilding');
  expect((await decodePob(await encode(fixture('poe2/pob-a.xml')))).game).toBe('poe2');
  await expect(decodePob('hello world')).rejects.toBeInstanceOf(PobError);
  await expect(decodePob(await encode('<html/>'))).rejects.toBeInstanceOf(PobError);
});

test('fromPob on pob-b (Elementalist, active sets by id)', async () => {
  const xml = fixture('poe1/pob-b.xml');
  const b = fromPob((await decodePob(await encode(xml))).doc);
  expect([b.className, b.ascendancy, b.level, b.label, b.treeVersion]).toEqual(['Witch', 'Elementalist', 90, '90 self cast', '3_28']);
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const specs = doc.querySelectorAll('Tree > Spec');
  expect(specs.length).toBe(11);
  const raw = specs[7]!.getAttribute('nodes')!.split(',');
  expect(raw.length).toBe(123);
  expect(b.nodes).toEqual(raw.map(Number).filter((n) => n < 65536));
  expect(Object.keys(b.masteries).length).toBeGreaterThan(0);
  // Active sets are id 11, which is not the eleventh in document order.
  const set11 = [...doc.querySelectorAll('Items > ItemSet')].findIndex((s) => s.getAttribute('id') === '11');
  expect(set11).not.toBe(10);
  expect(b.items.find((i) => i.slot === 'Ring 1')).toMatchObject({ name: "Berek's Grip", base: 'Two-Stone Ring', rarity: 'unique' });
  expect(b.items.find((i) => i.slot === 'Amulet')!.mods[0]).toEqual({ text: 'Allocates Bastion Breaker', kind: 'enchant', flags: [] });
  expect(b.clusterNotables).toEqual(['Primordial Bond']);
  expect(b.items.some((i) => i.slot.startsWith('Jewel '))).toBe(true);
  expect(b.items.some((i) => i.slot.includes('Swap'))).toBe(false);
  const skillSet11 = [...doc.querySelectorAll('Skills > SkillSet')].find((s) => s.getAttribute('id') === '11')!;
  const own = [...skillSet11.querySelectorAll(':scope > Skill')].filter((s) => s.getAttribute('enabled') !== 'false' && !s.hasAttribute('source'));
  expect(b.skills.length).toBe(own.filter((s) => s.querySelector('Gem[enabled="true"]')).length);
  const sourced = [...skillSet11.querySelectorAll(':scope > Skill[source]')].flatMap((s) => [...s.querySelectorAll('Gem')].map((g) => g.getAttribute('nameSpec')));
  expect(sourced.length).toBeGreaterThan(0);
  const names = b.skills.flatMap((s) => s.gems.map((g) => g.name));
  for (const n of sourced) if (!own.some((s) => s.querySelector(`Gem[nameSpec="${n}"]`))) expect(names).not.toContain(n);
});

test('fromPob reads overrides (tattoos)', () => {
  const doc = new DOMParser().parseFromString(
    `<PathOfBuilding><Build level="10" className="Templar" ascendClassName="None"/><Tree activeSpec="1"><Spec nodes="1,2,70000" treeVersion="3_30">
      <Overrides><Override nodeId="2" dn="Loyalty Tattoo">\n  +1 to Maximum Endurance Charges\n  5% increased Armour\n</Override></Overrides></Spec></Tree></PathOfBuilding>`,
    'application/xml');
  const b = fromPob(doc);
  expect(b.nodes).toEqual([1, 2]);
  expect(b.ascendancy).toBeNull();
  expect(b.nodeOverrides[2]).toEqual({ name: 'Loyalty Tattoo', stats: ['+1 to Maximum Endurance Charges', '5% increased Armour'] });
});

test('parseItem', () => {
  const it = parseItem('Weapon 1', `Rarity: UNIQUE\nThe Poet's Pen\nSomatic Wand\nVariant: Pre 3.0\nVariant: Current\nSelected Variant: 2\nQuality: 20\nImplicits: 2\n{crafted}Enchant thing\n{variant:1}{range:0.5}(11-15)% increased Spell Damage\n{variant:2}{range:0.25}(0.4-1.2)% of Damage Leeched\n{variant:1}Old line\n{fractured}{range:1}+(10-20) to Strength\n{disabled}Gone\nCorrupted`);
  expect(it).toMatchObject({ name: "The Poet's Pen", base: 'Somatic Wand', rarity: 'unique' });
  expect(it.mods).toEqual([
    { text: 'Enchant thing', kind: 'enchant', flags: [] },
    { text: '0.6% of Damage Leeched', kind: 'explicit', flags: [] },
    { text: '+20 to Strength', kind: 'explicit', flags: ['fractured'] },
  ]);
  expect(parseItem('Flask 1', 'Rarity: MAGIC\nSeething Divine Life Flask\nImplicits: 0')).toMatchObject({ name: '', base: 'Seething Divine Life Flask' });
});
