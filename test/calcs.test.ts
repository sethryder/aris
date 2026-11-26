import { expect, test } from 'vitest';
import type { CalcRow } from '../src/pob/engine.ts';
import { alignRanks, markSources } from '../src/ui/CalcsView.tsx';

const cols = ['Value', 'Stat', 'Skill types', 'Notes', 'Source', 'Source Name'];
const row = (...rows: string[][]): CalcRow => ({ label: 'Block Chance', cells: [{ text: '', parts: [{ type: 'TABLE', label: '', lines: [], cols, rows }] }] });
const src = (value: string, name: string) => [value, 'Block Chance', '', '', 'Tree', name];

test('same source with a different value pairs up; duplicates pair one to one; the rest is one-sided', () => {
  const you = row(['+22 base', 'Block Chance', '', 'Buff', 'Skill', 'Bone Offering'], src('+4 base', 'Block'), src('+4 base', 'Block'), src('+3 base', 'Sanctuary'));
  const them = row(['+23 base', 'Block Chance', '', 'Buff', 'Skill', 'Bone Offering'], src('+4 base', 'Block'), src('+12 base', 'As The Mountain'));
  expect(markSources(you, them)).toEqual([
    { kind: 'changed', other: '+23 base', at: 0 },
    { kind: 'same', at: 1 },
    { kind: 'only' }, // the second "Block" +4: they have only one
    { kind: 'only' },
  ]);
  expect(markSources(them, you).map((m) => m.kind)).toEqual(['changed', 'same', 'only']);
});

test('rows line up: pairs first in your order, one-sided rows last', () => {
  const you = row(src('+3 base', 'Sanctuary'), src('+4 base', 'Block'), src('+22 base', 'Bone Offering'));
  const them = row(src('+12 base', 'As The Mountain'), src('+23 base', 'Bone Offering'), src('+4 base', 'Block'));
  const [rankA, rankB] = alignRanks(markSources(you, them).map((m) => (m.kind === 'only' ? -1 : m.at)));
  const order = (r: CalcRow, rank: (k: number) => number) => r.cells[0]!.parts[0]!.rows.map((x, k) => ({ name: x[5], k })).sort((p, q) => rank(p.k) - rank(q.k)).map((o) => o.name);
  expect(order(you, rankA)).toEqual(['Block', 'Bone Offering', 'Sanctuary']);
  expect(order(them, rankB)).toEqual(['Block', 'Bone Offering', 'As The Mountain']);
});
