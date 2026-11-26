import { useEffect, useState } from 'preact/hooks';
import { matches } from '../core/diff.ts';
import { calcBuild, POB_VERSION } from '../pob/client.ts';
import type { CalcPart, CalcResult, CalcRow } from '../pob/engine.ts';
import type { Loaded } from './load.ts';

// One calculation per loaded build, shared across tab switches.
const results = new WeakMap<Loaded, Promise<CalcResult>>();
const calcFor = (l: Loaded) => {
  let p = results.get(l);
  if (!p) {
    p = calcBuild(l.calc);
    p.catch(() => results.delete(l));
    results.set(l, p);
  }
  return p;
};

type State = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; a: CalcResult; b: CalcResult };

const cellText = (r?: CalcRow) => r?.cells.map((c) => c.text).join(' / ') ?? '';
const sourceKey = (p: CalcPart, row: string[]) => `${p.label}|${row.join('|')}`;

interface MergedRow { section: string; label: string; a?: CalcRow; b?: CalcRow }

function merge(a: CalcResult, b: CalcResult): { section: string; rows: MergedRow[] }[] {
  const out = new Map<string, Map<string, MergedRow>>();
  for (const [side, res] of [['a', a], ['b', b]] as const) {
    for (const s of res.sections) {
      const rows = out.get(s.label) ?? out.set(s.label, new Map()).get(s.label)!;
      for (const r of s.rows) {
        const m = rows.get(r.label) ?? rows.set(r.label, { section: s.label, label: r.label }).get(r.label)!;
        m[side] ??= r; // first occurrence wins when PoB repeats a label within a section
      }
    }
  }
  return [...out].map(([section, rows]) => ({ section, rows: [...rows.values()] }));
}

const rowText = (r?: CalcRow) => r ? [r.label, ...r.cells.flatMap((c) => [c.text, ...c.parts.flatMap((p) => [p.label, ...p.lines, ...p.rows.flat()])])] : [];

export function CalcsView({ a, b, filter }: { a: Loaded; b: Loaded; filter: string }) {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [diffOnly, setDiffOnly] = useState(true);
  const [open, setOpen] = useState<Set<string>>(new Set());

  useEffect(() => {
    let live = true;
    setState({ status: 'loading' });
    Promise.all([calcFor(a), calcFor(b)])
      .then(([ra, rb]) => live && setState({ status: 'ready', a: ra, b: rb }))
      .catch((e: Error) => live && setState({ status: 'error', message: e.message }));
    return () => { live = false; };
  }, [a, b]);

  if (state.status === 'loading') {
    return <p class="note" role="status">Running Path of Building {POB_VERSION} on both builds… The first run downloads about 6 MB and takes a few seconds.</p>;
  }
  if (state.status === 'error') return <p class="error">Path of Building could not calculate these builds: {state.message}</p>;

  const f = filter.trim();
  const differs = (r: MergedRow) => cellText(r.a) !== cellText(r.b);
  const sections = merge(state.a, state.b)
    .map((s) => {
      const rows = s.rows.filter((r) => !f || matches(f, s.section) || [...rowText(r.a), ...rowText(r.b)].some((t) => matches(f, t)));
      // With "only rows that differ", identical rows fold into one "Same on both" row so a section never looks incomplete.
      return diffOnly ? { ...s, rows: rows.filter(differs), same: rows.filter((r) => !differs(r)) } : { ...s, rows, same: [] };
    })
    .filter((s) => s.rows.length);

  const toggle = (key: string) => setOpen((o) => { const n = new Set(o); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  const renderRow = (section: string) => (r: MergedRow) => {
    const key = `${section}|${r.label}`;
    const isOpen = open.has(key);
    const hasDetail = [r.a, r.b].some((x) => x?.cells.some((c) => c.parts.length));
    return (
      <>
        <tr class={differs(r) ? 'differs' : ''}>
          <th scope="row">
            {hasDetail
              ? <button type="button" class="linkish" aria-expanded={isOpen} onClick={() => toggle(key)}>{isOpen ? '▾' : '▸'} {r.label}</button>
              : r.label}
          </th>
          <td class="a">{cellText(r.a) || '–'}</td>
          <td class="b">{cellText(r.b) || '–'}</td>
        </tr>
        {isOpen && <tr class="detail"><td colSpan={3}><Breakdowns a={r.a} b={r.b} /></td></tr>}
      </>
    );
  };

  return (
    <div class="calcs">
      <p class="note">
        Calculated in your browser by <a href="https://pathofbuilding.community/">Path of Building</a> {POB_VERSION}.
        Main skill: you <strong>{state.a.mainSkill || 'none'}</strong>, them <strong>{state.b.mainSkill || 'none'}</strong>.
        Numbers follow each build's own PoB configuration (buffs, charges, enemy); account characters use PoB's defaults.
      </p>
      <label class="check"><input type="checkbox" checked={diffOnly} onChange={(e) => setDiffOnly((e.target as HTMLInputElement).checked)} /> Only rows that differ</label>
      {sections.length === 0 && <p class="empty">No rows{f ? ' match the filter' : diffOnly ? ' differ' : ''}.</p>}
      {sections.map((s) => (
        <section class="calc-section">
          <h3>{s.section}</h3>
          <table>
            <thead><tr><th scope="col">Stat</th><th scope="col" class="a">You</th><th scope="col" class="b">Them</th></tr></thead>
            <tbody>
              {s.rows.map(renderRow(s.section))}
              {s.same.length > 0 && (
                <tr class="same-toggle">
                  <th scope="row" colSpan={3}>
                    <button type="button" class="linkish" aria-expanded={open.has(`${s.section}|=`)} onClick={() => toggle(`${s.section}|=`)}>
                      {open.has(`${s.section}|=`) ? '▾' : '▸'} Same on both: {s.same.map((r) => r.label).join(', ')}
                    </button>
                  </th>
                </tr>
              )}
              {open.has(`${s.section}|=`) && s.same.map(renderRow(s.section))}
            </tbody>
          </table>
        </section>
      ))}
      <p class="note">Path of Building is MIT licensed; its engine runs here on <a href="https://github.com/atty303/pob-web">pob-web</a>'s Lua runtime.</p>
    </div>
  );
}

/** `at` is the paired row's index on the other side. */
type Mark = { kind: 'same'; at: number } | { kind: 'changed'; other: string; at: number } | { kind: 'only' };

/** Flatten a row's breakdown tables; `id` is the source row without its value, so "+22 vs +23 from Bone Offering" pairs up. */
const sourceRows = (r?: CalcRow) => r?.cells.flatMap((c) => c.parts.flatMap((p) => {
  const vi = p.cols.indexOf('Value');
  return p.rows.map((x) => ({ full: sourceKey(p, x), id: `${p.label}|${x.filter((_, i) => i !== vi).join('|')}`, value: vi >= 0 ? x[vi]! : '' }));
})) ?? [];

/** Pair my source rows with theirs: identical first, then same source with a different value; the rest are mine only. */
export function markSources(mine?: CalcRow, theirs?: CalcRow): Mark[] {
  const pool = sourceRows(theirs);
  const used = new Set<number>();
  const take = (pred: (o: (typeof pool)[number]) => boolean) => {
    const i = pool.findIndex((o, j) => !used.has(j) && pred(o));
    if (i >= 0) used.add(i);
    return i;
  };
  const rows = sourceRows(mine);
  const exact = rows.map((m) => { const i = take((o) => o.full === m.full); return i >= 0 ? ({ kind: 'same', at: i } as Mark) : null; });
  return rows.map((m, k) => exact[k] ?? (() => {
    const i = take((x) => x.id === m.id);
    return i >= 0 ? ({ kind: 'changed', other: pool[i]!.value, at: i } as Mark) : ({ kind: 'only' } as Mark);
  })());
}

/** Text lines ("Max: 81%") compare by the label before the colon. */
function markLine(line: string, theirs?: CalcRow): Mark['kind'] {
  const lines = theirs?.cells.flatMap((c) => c.parts.flatMap((p) => p.lines)) ?? [];
  if (lines.includes(line)) return 'same';
  const label = line.split(':')[0];
  return lines.some((l) => l.split(':')[0] === label) ? 'changed' : 'only';
}

/** Both sides' breakdowns, each source row marked as same, different value, or only on that side. Hovering a row highlights its pair on the other side. */
function Breakdowns({ a, b }: { a?: CalcRow; b?: CalcRow }) {
  const [hot, setHot] = useState<[number, number] | null>(null); // [your row, their row]; -1 = no pair
  const pairs = markSources(a, b).map((m) => (m.kind === 'only' ? -1 : m.at)); // one pairing drives both sides
  const [rankA, rankB] = alignRanks(pairs);
  return (
    <div class="pair breakdowns" onMouseLeave={() => setHot(null)}>
      <Side who="a" label="You" otherLabel="them" row={a} other={b} rank={rankA} hot={hot?.[0]} onHot={(n) => setHot([n, pairs[n] ?? -1])} />
      <Side who="b" label="Them" otherLabel="you" row={b} other={a} rank={rankB} hot={hot?.[1]} onHot={(n) => setHot([pairs.indexOf(n), n])} />
    </div>
  );
}

/** Sort keys that line pairs up: paired rows first, both sides in your order; rows only one side has go last, in their own order. */
export function alignRanks(pairs: number[]): [(k: number) => number, (j: number) => number] {
  const last = (k: number) => 1e9 + k;
  return [(k) => (pairs[k]! >= 0 ? k : last(k)), (j) => { const i = pairs.indexOf(j); return i >= 0 ? i : last(j); }];
}

function Side({ who, label, otherLabel, row, other, rank, hot, onHot }: { who: 'a' | 'b'; label: string; otherLabel: string; row?: CalcRow; other?: CalcRow; rank: (k: number) => number; hot?: number; onHot: (n: number) => void }) {
  const marks = markSources(row, other);
  let n = 0;
  return (
    <div class={who}>
      <div class="who">{label}</div>
      {!row && <p class="empty">Not shown for this build.</p>}
      {row?.cells.map((c) => c.parts.map((p) => (
        <div class="part">
          {p.label && <h4>{p.label}</h4>}
          {p.lines.map((l) => { const k = other ? markLine(l, other) : 'same'; return <div class={k === 'same' ? '' : `mark ${k} ${who}`}>{l}</div>; })}
          {p.rows.length > 0 && (
            <table>
              <thead><tr>{p.cols.map((col) => <th scope="col">{col}</th>)}</tr></thead>
              <tbody>
                {p.rows.map((x) => ({ x, k: n++ })).sort((r, t) => rank(r.k) - rank(t.k)).map(({ x, k }) => {
                  const m = marks[k]!;
                  return (
                    <tr class={`${m.kind === 'same' ? '' : `mark ${m.kind} ${who}`}${k === hot ? ' hot' : ''}`} onMouseEnter={() => onHot(k)}>
                      {x.map((v, i) => (
                        <td>{v}{m.kind === 'changed' && i === 0 && <span class="other"> ({otherLabel} {m.other})</span>}</td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )))}
    </div>
  );
}
