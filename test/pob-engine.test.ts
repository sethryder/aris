// @vitest-environment node
// Golden test for the in-browser PoB engine: needs `npm run pob` first (CI always runs it).
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import pins from '../pob.json';
import { startEngine, type CalcResult } from '../src/pob/engine.ts';

const dir = `public/pob/${pins.pob}`;
const row = (r: CalcResult, section: string, label: string) =>
  r.sections.find((s) => s.label === section)?.rows.find((x) => x.label === label);

describe.skipIf(!existsSync(`${dir}/manifest.json`))('PoB engine', () => {
  const log: string[] = [];
  const engine = startEngine(async (p) => new Uint8Array(readFileSync(`${dir}/${p}`)), (l) => log.push(l));

  test('recalculates pob-b to the values PoB saved, with sources', async () => {
    const r = await (await engine).calc({ xml: readFileSync('test/fixtures/poe1/pob-b.xml', 'utf8') });
    expect(row(r, 'Block', 'Block Chance')?.cells[0]?.text).toMatch(/^74%/);
    expect(row(r, 'Block', 'Spell Block Chance')?.cells[0]?.text).toMatch(/^56%/);
    const sources = row(r, 'Block', 'Spell Block Chance')!.cells[0]!.parts.flatMap((p) => p.rows.map((x) => x.join(' | ')));
    expect(sources.some((s) => s.includes('Tempest Shield'))).toBe(true);
    expect(r.sections.flatMap((s) => s.rows).find((x) => x.label === 'Total' && x.cells[0]?.text === '4,355')).toBeTruthy(); // life, as saved
    // The build has an Elegant Hubris: its table must be fetched and inflated. (ES/evasion differ from the saved
    // <PlayerStat> values because PoB's calcs changed since the fixture was saved, not because of the jewel.)
    expect(log.filter((l) => l.includes('Missing LUT'))).toEqual([]);
  }, 60_000);

  test('imports an account character through PoB\'s importer', async () => {
    const json = (f: string) => JSON.parse(readFileSync(`test/fixtures/poe1/${f}`, 'utf8'));
    const r = await (await engine).calc({ items: json('api-get-items.json'), passives: json('api-get-passive-skills.json') });
    expect(r.sections.length).toBeGreaterThan(10);
    expect(row(r, 'Block', 'Block Chance')?.cells[0]?.text).toMatch(/^\d+%/);
  }, 60_000);
});
