import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { statFilter, tradeUrl, type TradeStats } from '../src/games/poe1/trade.ts';
import type { Mod } from '../src/core/types.ts';

const stats: TradeStats = JSON.parse(readFileSync('public/data/poe1/trade-stats.json', 'utf8'));
const mod = (text: string, kind: Mod['kind'] = 'explicit', flags: string[] = []): Mod => ({ text, kind, flags });
const id = (kind: string, text: string) => `${kind}.${stats[kind]![text]}`;

test('statFilter matches mod text to trade stat ids', () => {
  // Weapons prefer the local stat, and search by the average roll.
  expect(statFilter(mod('Adds 2 to 42 Lightning Damage'), 'Weapon 1', stats))
    .toEqual({ id: id('explicit', 'Adds # to # Lightning Damage (Local)'), value: { min: 19 } });
  expect(statFilter(mod('Adds 2 to 42 Lightning Damage'), 'Ring 1', stats)?.id).toBe(id('explicit', 'Adds # to # Lightning Damage'));
  // Literal numbers in the template.
  expect(statFilter(mod('1 Added Passive Skill is Magnifier'), 'Jewel 1', stats)).toEqual({ id: id('explicit', '1 Added Passive Skill is Magnifier') });
  // "reduced" searches the "increased" stat with no minimum.
  expect(statFilter(mod('10% reduced Attack Speed'), 'Ring 1', stats)).toEqual({ id: id('explicit', '#% increased Attack Speed') });
  expect(statFilter(mod('+25% to Global Critical Strike Multiplier', 'implicit'), 'Weapon 1', stats)?.id).toMatch(/^implicit\./);
  expect(statFilter(mod('+30 to maximum Life', 'explicit', ['fractured']), 'Helmet', stats)?.id).toMatch(/^fractured\./);
  expect(statFilter(mod('+30 to maximum Life', 'explicit', ['crafted']), 'Helmet', stats)).toBeNull();
});

test('tradeUrl searches rares by base and mods', () => {
  const url = tradeUrl({ slot: 'Ring 1', name: 'Doom Loop', base: 'Two-Stone Ring', rarity: 'rare', mods: [mod('+70 to maximum Life')] }, 'Settlers', stats);
  const q = JSON.parse(new URL(url).searchParams.get('q')!).query;
  expect(new URL(url).pathname).toBe('/trade/search/Settlers');
  expect(q).toMatchObject({ type: 'Two-Stone Ring', stats: [{ type: 'and', filters: [{ id: id('explicit', '+# to maximum Life'), value: { min: 63 } }] }] });
  expect(q).not.toHaveProperty('name');
});
