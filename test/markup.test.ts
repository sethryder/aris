import { expect, test } from 'vitest';
import { stripMarkup } from '../src/core/markup.ts';

test('stripMarkup', () => {
  expect(stripMarkup('1 Added Passive Skill is [affliction_notable_magnifier|Magnifier]')).toBe('1 Added Passive Skill is Magnifier');
  expect(stripMarkup('+10% to [Fire] [Resistances]')).toBe('+10% to Fire Resistances');
  expect(stripMarkup('<underline>{Hallowed}')).toBe('Hallowed');
  expect(stripMarkup('plain')).toBe('plain');
});
