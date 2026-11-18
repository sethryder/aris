import { expect, test } from 'vitest';
import type { CalcRow } from '../src/pob/engine.ts';
import { markSources } from '../src/ui/CalcsView.tsx';

const cols = ['Value', 'Stat', 'Skill types', 'Notes', 'Source', 'Source Name'];
const row = (...rows: string[][]): CalcRow => ({ label: 'Block Chance', cells: [{ text: '', parts: [{ type: 'TABLE', label: '', lines: [], cols, rows }] }] });
const src = (value: string, name: string) => [value, 'Block Chance', '', '', 'Tree', name];

test('same source with a different value pairs up; duplicates pair one to one; the rest is one-sided', () => {
  const you = row(['+22 base', 'Block Chance', '', 'Buff', 'Skill', 'Bone Offering'], src('+4 base', 'Block'), src('+4 base', 'Block'), src('+3 base', 'Sanctuary'));
  const them = row(['+23 base', 'Block Chance', '', 'Buff', 'Skill', 'Bone Offering'], src('+4 base', 'Block'), src('+12 base', 'As The Mountain'));
  expect(markSources(you, them)).toEqual([
    { kind: 'changed', other: '+23 base' },
    { kind: 'same' },
    { kind: 'only' }, // the second "Block" +4: they have only one
    { kind: 'only' },
  ]);
  expect(markSources(them, you).map((m) => m.kind)).toEqual(['changed', 'same', 'only']);
});
