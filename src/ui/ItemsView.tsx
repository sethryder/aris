import { matches } from '../core/diff.ts';
import type { Item, Mod, SlotDiff } from '../core/types.ts';

const itemName = (i?: Item) => (i ? [i.name, i.base].filter(Boolean).join(', ') : 'empty');
const tag = (m: Mod) => [m.kind !== 'explicit' && m.kind, ...m.flags].filter(Boolean).join(', ');
const ModLine = ({ m }: { m: Mod }) => <>{m.text}{tag(m) && <span class="tag"> {tag(m)}</span>}</>;

export function ItemsView({ items, slotOrder, filter }: { items: SlotDiff[]; slotOrder: string[]; filter: string }) {
  const rank = (slot: string) => {
    const base = slot.replace(/ Abyssal Socket \d+$/, '');
    const i = slotOrder.indexOf(base);
    return (i < 0 ? (slot.startsWith('Jewel') ? 900 : 800) : i) + (base === slot ? 0 : 0.5);
  };
  const f = filter.trim();
  const shown = [...items].sort((x, y) => rank(x.slot) - rank(y.slot) || x.slot.localeCompare(y.slot)).flatMap((s) => {
    if (!f || [itemName(s.a), itemName(s.b), s.slot].some((t) => matches(f, t))) return [s];
    const m = (x: Mod) => matches(f, x.text);
    const t = { ...s, onlyA: s.onlyA.filter(m), onlyB: s.onlyB.filter(m), changed: s.changed.filter((c) => m(c.a) || m(c.b)), same: s.same.filter(m) };
    return t.onlyA.length + t.onlyB.length + t.changed.length + t.same.length ? [t] : [];
  });
  if (!shown.length) return <p class="empty">No items{f ? ' match the filter' : ''}.</p>;
  return (
    <div class="items">
      {shown.map((s) => (
        <section class="slot">
          <h3>{s.slot}</h3>
          <div class="pair">
            <div class="a"><span class="who">You</span> {itemName(s.a)}</div>
            <div class="b"><span class="who">Them</span> {itemName(s.b)}</div>
          </div>
          {s.onlyB.length > 0 && <><h4 class="b"><span class="sw b" /> They have, you don't</h4><ul>{s.onlyB.map((m) => <li><ModLine m={m} /></li>)}</ul></>}
          {s.onlyA.length > 0 && <><h4 class="a"><span class="sw a" /> You have, they don't</h4><ul>{s.onlyA.map((m) => <li><ModLine m={m} /></li>)}</ul></>}
          {s.changed.length > 0 && <><h4 class="changed"><span class="sw changed" /> Different roll</h4>
            <ul>{s.changed.map((c) => <li>you <ModLine m={c.a} /> → them <ModLine m={c.b} /></li>)}</ul></>}
          {s.same.length > 0 && <details><summary>Same on both ({s.same.length})</summary><ul>{s.same.map((m) => <li><ModLine m={m} /></li>)}</ul></details>}
        </section>
      ))}
    </div>
  );
}
