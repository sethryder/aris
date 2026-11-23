import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { diff } from '../core/diff.ts';
import { games } from '../games/index.ts';
import { BuildPicker, errorText, type Side } from './BuildPicker.tsx';
import { CalcsView } from './CalcsView.tsx';
import { ItemsView } from './ItemsView.tsx';
import { fromHash, loadSource, toHash, type Source } from './load.ts';
import { NodeLists } from './NodeLists.tsx';
import { SkillsView } from './SkillsView.tsx';
import { StatTotals } from './StatTotals.tsx';
import { TreeView, type FocusRef } from './TreeView.tsx';
import logo from '../../assets/mark.svg';

const KEYS = ['a', 'b'] as const;
const TABS = ['Tree', 'Skills', 'Items', 'Calcs'] as const;
type Tab = (typeof TABS)[number];
type S = Side & { shared?: Source };

const store = {
  get: () => { try { return localStorage.getItem('aris.a') ?? ''; } catch { return ''; } },
  set: (v: string) => { try { localStorage.setItem('aris.a', v); } catch { /* private mode */ } },
};
const display = (src: Source) => (src.kind === 'acct' ? src.account : src.kind === 'link' ? src.url : '');

export function App() {
  const [sides, setSides] = useState<[S, S]>(() => [{ input: store.get() }, { input: '' }]);
  const [filter, setFilter] = useState('');
  const [tab, setTab] = useState<Tab>('Tree');
  const tokens = useRef([0, 0]);
  const focusRef: FocusRef = useRef(null);

  const patch = (i: number, p: Partial<S>) => setSides((s) => { const n = [...s] as [S, S]; n[i] = { ...n[i]!, ...p }; return n; });

  const load = async (i: number, src: Source) => {
    const token = ++tokens.current[i]!;
    // Into the hash right away: a side that fails to load stays in the link, so a reload can retry it.
    patch(i, { src, loading: true, error: undefined, shared: src });
    if (i === 0 && src.kind !== 'acct') store.set(src.kind === 'code' ? src.code : src.url);
    if (i === 0 && src.kind === 'acct') store.set(src.account);
    try {
      const loaded = await loadSource(src);
      if (token === tokens.current[i]) patch(i, { loading: false, loaded });
    } catch (e) {
      if (token === tokens.current[i]) patch(i, { loading: false, error: errorText(e) });
    }
  };

  // Restore a shared comparison from the hash.
  useEffect(() => {
    const q = new URLSearchParams(location.hash.slice(1));
    KEYS.forEach((k, i) => {
      const src = fromHash(q.get(k));
      if (src) { patch(i, { input: display(src) }); void load(i, src); }
    });
  }, []);

  // The URL is the save file: keep it in step with what is loaded. Skip the mount run, which would
  // erase the incoming hash before the restore above has put it back into state.
  const [sa, sb] = sides;
  const unshareable = [sa, sb].some((s) => s.shared && !toHash(s.shared));
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    const q = new URLSearchParams();
    KEYS.forEach((k, i) => { const h = sides[i]!.shared && toHash(sides[i]!.shared!); if (h) q.set(k, h); });
    const hash = q.toString();
    if (hash !== location.hash.slice(1)) history.replaceState(null, '', hash ? `#${hash}` : location.pathname + location.search);
  }, [sa.shared, sb.shared]);

  const A = sa.loaded, B = sb.loaded;
  const sameGame = A && B && A.build.game === B.build.game;
  const d = useMemo(() => (A && B && sameGame ? diff(A.build, B.build, A.tree, B.tree) : null), [A, B, sameGame]);

  // Name the comparison in the tab and browser history once both sides are loaded.
  useEffect(() => {
    document.title = A && B ? `${A.build.label} vs ${B.build.label} · Aris` : 'Aris: Compare Path of Exile Characters and Builds';
  }, [A, B]);

  return (
    <>
      <header>
        <h1><img src={logo} alt="" width="28" height="28" /> Aris <span>Path of Exile character compare</span></h1>
        <div class="pickers">
          <BuildPicker id="a" label="You" side={sa} onChange={(p) => patch(0, p)} onLoad={(s) => load(0, s)} />
          <BuildPicker id="b" label="Them" side={sb} onChange={(p) => patch(1, p)} onLoad={(s) => load(1, s)} />
        </div>
        {unshareable && <p class="note">Pasted codes can't be shared by link. Upload the build to pobb.in to share it.</p>}
      </header>
      <main>
        {A && B && !sameGame && <p class="error">These builds are for different games and can't be compared.</p>}
        {!(A && B) && <p class="hint">Load a character on each side: an account name like <code>Name#1234</code>, a build link (pobb.in, poe.ninja, maxroll, …), or a Path of Building code.</p>}
        {d && A && B && (
          <>
            <div class="controls">
              <input type="search" class="filter" placeholder="Filter, e.g. block" aria-label="Filter every list" value={filter}
                onInput={(e) => setFilter((e.target as HTMLInputElement).value)} />
              <div role="tablist" aria-label="Views">
                {TABS.map((t) => (
                  <button type="button" role="tab" id={`tab-${t}`} aria-selected={tab === t} aria-controls="panel" onClick={() => setTab(t)}>{t}</button>
                ))}
              </div>
            </div>
            <div id="panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
              {tab === 'Tree' && (
                <>
                  <TreeView tree={A.tree} treeB={B.tree} a={A.build} b={B.build} diff={d} filter={filter} focusRef={focusRef} />
                  <NodeLists diff={d} a={A.build} b={B.build} treeA={A.tree} treeB={B.tree} filter={filter} onFocus={(id) => focusRef.current?.(id)} />
                  <StatTotals stats={d.treeStats} filter={filter} />
                </>
              )}
              {tab === 'Skills' && <SkillsView gems={d.gems} filter={filter} />}
              {tab === 'Items' && <ItemsView items={d.items} slotOrder={games[A.build.game]!.slotOrder} filter={filter} league={A.build.league ?? B.build.league ?? 'Standard'} trees={[A.tree, B.tree]} />}
              {tab === 'Calcs' && <CalcsView a={A} b={B} filter={filter} />}
            </div>
          </>
        )}
      </main>
      <footer>
        <p>For exact stat calculations, use the Compare tab in <a href="https://pathofbuilding.community/">Path of Building</a>.</p>
        <p>This product isn't affiliated with or endorsed by Grinding Gear Games in any way.</p>
      </footer>
    </>
  );
}
