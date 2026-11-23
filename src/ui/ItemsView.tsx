import { useEffect, useMemo, useState } from 'preact/hooks';
import { matches } from '../core/diff.ts';
import { getCurrentLeague } from '../api.ts';
import { tradeLeague, tradeTitle, tradeUrl, type TradeData } from '../games/poe1/trade.ts';
import type { Item, Mod, SlotDiff, TreeData } from '../core/types.ts';

const itemName = (i?: Item) => (i ? [i.name, i.base].filter(Boolean).join(', ') : 'empty');
const ItemName = ({ i }: { i?: Item }) => <>{itemName(i)}{i?.corrupted && <span class="tag corrupted"> corrupted</span>}</>;
const tag = (m: Mod) => [m.kind !== 'explicit' && m.kind, ...m.flags].filter(Boolean).join(', ');
// ponytail: fetched once per page load; links fall back to name/base search until it arrives or if it fails.
let dataP: Promise<TradeData | undefined> | undefined;
const loadTradeData = () => (dataP ??= fetch(`${import.meta.env.BASE_URL}data/poe1/trade-stats.json`).then((r) => (r.ok ? r.json() : undefined), () => undefined));
let leagueP: Promise<string | undefined> | undefined;
const loadLeague = () => (leagueP ??= getCurrentLeague().catch(() => undefined));

/** "Jewel 26196" → "Jewel near Overcharge". Socket ids missing from the tree sit inside cluster jewels. */
export function jewelLabel(slot: string, trees: TreeData[]) {
  const id = Number(slot.match(/^Jewel (\d+)$/)?.[1]);
  if (!id) return slot;
  for (const t of trees) {
    const s = t.nodes[id];
    if (!s) continue;
    let best = '', d = Infinity;
    for (const n of Object.values(t.nodes)) {
      const dn = (n.x - s.x) ** 2 + (n.y - s.y) ** 2;
      if ((n.kind === 'notable' || n.kind === 'keystone') && !n.ascendancy && dn < d) { best = n.name; d = dn; }
    }
    return `Jewel near ${best}`;
  }
  return 'Jewel in a cluster jewel';
}

const GROUPS: [RegExp, string][] = [[/^Weapon/, 'Weapons'], [/^(Helmet|Body Armour|Gloves|Boots)/, 'Armour'], [/^(Amulet|Ring|Belt)/, 'Jewellery'],
  [/^Flask/, 'Flasks'], [/^Graft/, 'Grafts'], [/^Jewel/, 'Jewels']];
const group = (slot: string) => GROUPS.find(([re]) => re.test(slot))?.[1] ?? 'Other';   // abyss jewels stay with their item

const ModLine = ({ m }: { m: Mod }) => <>{m.text}{tag(m) && <span class="tag"> {tag(m)}</span>}</>;

/** `buildLeague`: their league, else yours (PoB codes don't say). Otherwise the current league. */
export function ItemsView({ items, slotOrder, filter, buildLeague, trees }: { items: SlotDiff[]; slotOrder: string[]; filter: string; buildLeague?: string; trees: TreeData[] }) {
  const [data, setData] = useState<TradeData>();
  const [current, setCurrent] = useState<string>();
  useEffect(() => { loadTradeData().then(setData); }, []);
  useEffect(() => { if (!buildLeague) loadLeague().then(setCurrent); }, [buildLeague]);
  const league = tradeLeague(buildLeague ?? current ?? 'Standard');
  const labels = useMemo(() => {
    const seen = new Map<string, number>();
    return new Map(items.map((s) => {
      const l = jewelLabel(s.slot, trees), n = (seen.get(l) ?? 0) + 1;
      seen.set(l, n);
      return [s.slot, n > 1 ? `${l} (${n})` : l];   // two sockets can share a nearest notable
    }));
  }, [items, ...trees]);
  const rank = (slot: string) => {
    const base = slot.replace(/ Abyssal Socket \d+$/, '');
    const i = slotOrder.indexOf(base);
    return (i < 0 ? (slot.startsWith('Jewel') ? 900 : 800) : i) + (base === slot ? 0 : 0.5);
  };
  const f = filter.trim();
  const shown = [...items].sort((x, y) => rank(x.slot) - rank(y.slot) || x.slot.localeCompare(y.slot)).flatMap((s) => {
    if (!f || [itemName(s.a), itemName(s.b), s.slot, labels.get(s.slot)!].some((t) => matches(f, t))) return [s];
    const m = (x: Mod) => matches(f, x.text);
    const t = { ...s, onlyA: s.onlyA.filter(m), onlyB: s.onlyB.filter(m), changed: s.changed.filter((c) => m(c.a) || m(c.b)), same: s.same.filter(m) };
    return t.onlyA.length + t.onlyB.length + t.changed.length + t.same.length ? [t] : [];
  });
  if (!shown.length) return <p class="empty">No items{f ? ' match the filter' : ''}.</p>;
  return (
    <div class="items">
      {shown.map((s, i) => (<>
        {(i === 0 || group(s.slot) !== group(shown[i - 1]!.slot)) && <h2 class="group">{group(s.slot)}</h2>}
        <section class="slot">
          <h3>{labels.get(s.slot)}</h3>
          <div class="pair">
            <div class="a"><span class="who">You</span> <ItemName i={s.a} /></div>
            <div class="b"><span class="who">Them</span> <ItemName i={s.b} />{s.b?.base && <> <a class="trade" href={tradeUrl(s.b, league, data)} target="_blank" rel="noopener"
              title={tradeTitle(s.b, league, data)}>trade ↗</a></>}</div>
          </div>
          {s.onlyB.length > 0 && <><h4 class="b"><span class="sw b" /> They have, you don't</h4><ul>{s.onlyB.map((m) => <li><ModLine m={m} /></li>)}</ul></>}
          {s.onlyA.length > 0 && <><h4 class="a"><span class="sw a" /> You have, they don't</h4><ul>{s.onlyA.map((m) => <li><ModLine m={m} /></li>)}</ul></>}
          {s.changed.length > 0 && <><h4 class="changed"><span class="sw changed" /> Different roll</h4>
            <ul>{s.changed.map((c) => <li>you <ModLine m={c.a} /> → them <ModLine m={c.b} /></li>)}</ul></>}
          {s.same.length > 0 && <details><summary>Same on both ({s.same.length})</summary><ul>{s.same.map((m) => <li><ModLine m={m} /></li>)}</ul></details>}
        </section>
      </>))}
    </div>
  );
}
