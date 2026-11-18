import { matches } from '../core/diff.ts';
import { nodeStats } from '../core/stats.ts';
import type { Build, BuildDiff, TreeData } from '../core/types.ts';

interface Props { diff: BuildDiff; a: Build; b: Build; treeA: TreeData; treeB: TreeData; filter: string; onFocus: (id: number) => void }

interface Row { ids: number[]; name: string; stats: string[]; count?: number }

const GROUPS = ['Keystones', 'Notables', 'Ascendancy', 'Cluster jewel notables', 'Masteries', 'Jewel sockets', 'Small passives'] as const;

function rows(ids: number[], build: Build, tree: TreeData, clusterNotables: string[], filter: string): Map<string, Row[]> {
  const out = new Map<string, Row[]>(GROUPS.map((g) => [g, []]));
  const small = new Map<string, Row>();
  const keep = (r: Row) => !filter.trim() || [r.name, ...r.stats].some((t) => matches(filter, t));
  for (const id of ids) {
    const n = tree.nodes[id];
    const r: Row = { ids: [id], name: build.nodeOverrides[id]?.name ?? n?.name ?? `Unknown node ${id}`, stats: nodeStats(build, tree, id) };
    if (!keep(r)) continue;
    const group = !n ? 'Notables' : n.ascendancy ? 'Ascendancy' : n.kind === 'keystone' ? 'Keystones' : n.kind === 'notable' ? 'Notables'
      : n.kind === 'mastery' ? 'Masteries' : n.kind === 'jewel' ? 'Jewel sockets' : 'Small passives';
    if (group !== 'Small passives') { out.get(group)!.push(r); continue; }
    const key = r.stats.join(' / ');
    const prev = small.get(key);
    if (prev) { prev.ids.push(id); prev.count = prev.ids.length; } else small.set(key, { ...r, name: key || r.name, stats: [] });
  }
  out.get('Small passives')!.push(...[...small.values()].sort((x, y) => (y.count ?? 1) - (x.count ?? 1)));
  out.get('Cluster jewel notables')!.push(...clusterNotables
    .map((name) => ({ ids: [], name, stats: tree.clusterNotables[name] ?? [] }))
    .filter(keep));
  return out;
}

function Section({ title, cls, groups, onFocus }: { title: string; cls: string; groups: Map<string, Row[]>; onFocus: (id: number) => void }) {
  const total = [...groups.values()].reduce((s, g) => s + g.length, 0);
  return (
    <section class={`nodelist ${cls}`}>
      <h3><span class={`sw ${cls}`} /> {title} <span class="count">({total})</span></h3>
      {total === 0 && <p class="empty">Nothing.</p>}
      {[...groups].filter(([, g]) => g.length).map(([name, g]) => (
        <div class="group">
          <h4>{name}</h4>
          <ul>
            {g.map((r) => (
              <li>
                {r.ids.length ? <button type="button" class="linkish" onClick={() => onFocus(r.ids[0]!)}>{r.name}</button> : <span class="name">{r.name}</span>}
                {r.count && r.count > 1 && <span class="count"> ×{r.count}</span>}
                {r.stats.length > 0 && <div class="stats">{r.stats.join(' · ')}</div>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

export function NodeLists({ diff, a, b, treeA, treeB, filter, onFocus }: Props) {
  const changed = new Map<string, Row[]>([['Changed', diff.nodes.changed.map((id) => {
    const name = treeA.nodes[id]?.name ?? `Unknown node ${id}`;
    return { ids: [id], name, stats: [`You: ${nodeStats(a, treeA, id).join(' · ') || 'nothing'}`, `Them: ${nodeStats(b, treeB, id).join(' · ') || 'nothing'}`] };
  }).filter((r) => !filter.trim() || [r.name, ...r.stats].some((t) => matches(filter, t)))]]);
  return (
    <div class="nodelists">
      <Section title="They have, you don't" cls="b" groups={rows(diff.nodes.onlyB, b, treeB, diff.clusterNotables.onlyB, filter)} onFocus={onFocus} />
      <Section title="You have, they don't" cls="a" groups={rows(diff.nodes.onlyA, a, treeA, diff.clusterNotables.onlyA, filter)} onFocus={onFocus} />
      <Section title="Different choice (masteries, tattoos)" cls="changed" groups={changed} onFocus={onFocus} />
    </div>
  );
}
