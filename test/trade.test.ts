import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { statFilter, tradeLeague, tradeTitle, tradeUrl, type TradeData } from '../src/games/poe1/trade.ts';
import type { Mod } from '../src/core/types.ts';

const data: TradeData = JSON.parse(readFileSync('public/data/poe1/trade-stats.json', 'utf8'));
const stats = data.stats;
const query = (url: string) => JSON.parse(new URL(url).searchParams.get('q')!).query;
const mod = (text: string, kind: Mod['kind'] = 'explicit', flags: string[] = []): Mod => ({ text, kind, flags });
const id = (kind: string, text: string) => `${kind}.${stats[kind]![text]}`;

test('statFilter matches mod text to trade stat ids', () => {
  // Weapons prefer the local stat, and search by the average roll.
  expect(statFilter(mod('Adds 2 to 42 Lightning Damage'), 'Weapon 1', stats))
    .toEqual({ id: id('explicit', 'Adds # to # Lightning Damage (Local)'), value: { min: 19 } });
  expect(statFilter(mod('Adds 2 to 42 Lightning Damage'), 'Ring 1', stats)?.id).toBe(id('explicit', 'Adds # to # Lightning Damage'));
  // Literal numbers in the template.
  expect(statFilter(mod('1 Added Passive Skill is Magnifier'), 'Jewel 1', stats)).toEqual({ id: id('explicit', '1 Added Passive Skill is Magnifier') });
  // "reduced" searches the "increased" stat for at least as much reduction.
  expect(statFilter(mod('10% reduced Attack Speed'), 'Ring 1', stats)).toEqual({ id: id('explicit', '#% increased Attack Speed'), value: { max: -9 } });
  // Decimal rolls keep a decimal minimum.
  expect(statFilter(mod('0.8% of Physical Attack Damage Leeched as Life'), 'Ring 1', stats)?.value).toEqual({ min: 0.7 });
  // Armour pieces use local ids for defences only; attack speed on gloves is global.
  expect(statFilter(mod('12% increased Attack Speed'), 'Gloves', stats)?.id).toBe(id('explicit', '#% increased Attack Speed'));
  expect(statFilter(mod('+40 to Armour'), 'Gloves', stats)?.id).toBe(id('explicit', '+# to Armour (Local)'));
  expect(statFilter(mod('+40 to Armour'), 'Belt', stats)?.id).toBe(id('explicit', '+# to Armour'));
  expect(statFilter(mod('+25% to Global Critical Strike Multiplier', 'implicit'), 'Weapon 1', stats)?.id).toMatch(/^implicit\./);
  expect(statFilter(mod('+30 to maximum Life', 'explicit', ['fractured']), 'Helmet', stats)?.id).toMatch(/^fractured\./);
  expect(statFilter(mod('+30 to maximum Life', 'explicit', ['crafted']), 'Helmet', stats)).toBeNull();
});

test('tradeUrl searches rares by base and mods', () => {
  const url = tradeUrl({ slot: 'Ring 1', name: 'Doom Loop', base: 'Two-Stone Ring', rarity: 'rare', mods: [mod('+70 to maximum Life')] }, 'Settlers', data);
  const q = JSON.parse(new URL(url).searchParams.get('q')!).query;
  expect(new URL(url).pathname).toBe('/trade/search/Settlers');
  expect(q).toMatchObject({ type: 'Two-Stone Ring', stats: [{ type: 'and', filters: [{ id: id('explicit', '+# to maximum Life'), value: { min: 63 } }] }] });
  expect(q).not.toHaveProperty('name');
});

test('corrupted uniques search corrupted copies with the same implicits', () => {
  const gloves = { slot: 'Gloves', name: 'Command of the Pit', base: 'Riveted Gloves', rarity: 'unique', corrupted: true as const,
    mods: [mod('Curse Enemies with Temporal Chains on Hit', 'implicit'), mod('7% increased Cast Speed')] };
  const q = JSON.parse(new URL(tradeUrl(gloves, 'Settlers', data)).searchParams.get('q')!).query;
  expect(q).toMatchObject({ name: 'Command of the Pit', filters: { misc_filters: { filters: { corrupted: { option: 'true' } } } } });
  expect(q.stats[0].filters).toEqual([{ id: id('implicit', 'Curse Enemies with Temporal Chains on Hit') }]);
  const plain = JSON.parse(new URL(tradeUrl({ ...gloves, corrupted: undefined }, 'Settlers', data)).searchParams.get('q')!).query;
  expect(plain).not.toHaveProperty('stats');
});

test('PoB magic names search the base inside them', () => {
  const flask = { slot: 'Flask 1', name: '', base: 'Bottomless Quicksilver Flask of the Lynx', rarity: 'magic', mods: [] };
  expect(query(tradeUrl(flask, 'Settlers', data)).type).toBe('Quicksilver Flask');
  expect(query(tradeUrl(flask, 'Settlers')).type).toBeUndefined();   // no base list: leave the base out, don't send a bad one
});

test('league and hover text', () => {
  expect(tradeLeague('SSF Hardcore Covens')).toBe('Hardcore Covens');
  expect(tradeLeague('HC SSF Ruthless Covens')).toBe('HC Ruthless Covens');
  expect(tradeLeague('Covens')).toBe('Covens');
  const ring = { slot: 'Ring 1', name: 'Doom Loop', base: 'Two-Stone Ring', rarity: 'rare', mods: [] };
  expect(tradeTitle(ring, 'Covens', data)).toMatch(/all their mods/);
  expect(tradeTitle(ring, 'Covens')).toMatch(/Mod filters are unavailable/);
});
