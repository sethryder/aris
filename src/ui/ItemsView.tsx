import { useEffect, useState } from 'preact/hooks';
import { matches } from '../core/diff.ts';
import { tradeUrl, type TradeStats } from '../games/poe1/trade.ts';
import type { Item, Mod, SlotDiff } from '../core/types.ts';

const itemName = (i?: Item) => (i ? [i.name, i.base].filter(Boolean).join(', ') : 'empty');
const tag = (m: Mod) => [m.kind !== 'explicit' && m.kind, ...m.flags].filter(Boolean).join(', ');
// ponytail: fetched once per page load; links fall back to name/base search until it arrives or if it fails.
let statsP: Promise<TradeStats | undefined> | undefined;
const loadStats = () => (statsP ??= fetch(`${import.meta.env.BASE_URL}data/poe1/trade-stats.json`).then((r) => (r.ok ? r.json() : undefined), () => undefined));

const ModLine = ({ m }: { m: Mod }) => <>{m.text}{tag(m) && <span class="tag"> {tag(m)}</span>}</>;

export function ItemsView({ items, slotOrder, filter, league }: { items: SlotDiff[]; slotOrder: string[]; filter: string; league: string }) {
  const [stats, setStats] = useState<TradeStats>();
  useEffect(() => { loadStats().then(setStats); }, []);
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
            <div class="b"><span class="who">Them</span> {itemName(s.b)}{s.b?.base && <> <a class="trade" href={tradeUrl(s.b, league, stats)} target="_blank" rel="noopener"
              title={s.b.rarity === 'unique' || s.b.rarity === 'relic' ? `Search the ${league} trade site for this unique` : `Searches ${league} for this base with all their mods (except crafted) at 90% or more of their rolls. Turn some off on the trade site if there are too few results.`}>trade ↗</a></>}</div>
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
