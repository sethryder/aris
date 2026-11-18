import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { matches } from '../core/diff.ts';
import { nodeStats } from '../core/stats.ts';
import type { Build, BuildDiff, TreeData, TreeNode } from '../core/types.ts';

export type FocusRef = { current: ((id: number) => void) | null };

/** Drawn on `tree` (A's version); `treeB` supplies B's node text when B is on another version. */
interface Props { tree: TreeData; treeB?: TreeData; a: Build; b: Build; diff: BuildDiff; filter: string; focusRef?: FocusRef }

const RADIUS: Record<TreeNode['kind'], number> = { keystone: 60, notable: 42, jewel: 42, mastery: 36, classStart: 80, ascStart: 30, normal: 24 };
const PAD = 300;

type View = { x: number; y: number; k: number };

export function TreeView({ tree, treeB = tree, a, b, diff, filter, focusRef }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGGElement>(null);
  const view = useRef<View>({ x: 0, y: 0, k: 1 });
  const [tip, setTip] = useState<{ id: number; x: number; y: number } | null>(null);

  const state = useMemo(() => {
    const s = new Map<number, string>();
    for (const id of diff.nodes.both) s.set(id, 'both');
    for (const id of diff.nodes.onlyA) s.set(id, 'a');
    for (const id of diff.nodes.onlyB) s.set(id, 'b');
    for (const id of diff.nodes.changed) s.set(id, 'changed');
    return s;
  }, [diff]);

  // Static drawing: depends on the comparison only, not on filter, pan or zoom.
  const drawing = useMemo(() => {
    const asc = new Set([a.ascendancy, b.ascendancy]);
    const shown = (n: TreeNode | undefined): n is TreeNode => !!n && (!n.ascendancy || asc.has(n.ascendancy));
    const setA = new Set(a.nodes), setB = new Set(b.nodes);
    const edges = tree.edges.map((e, i) => {
      const p = tree.nodes[e.a], q = tree.nodes[e.b];
      if (!shown(p) || !shown(q)) return null;
      const inA = setA.has(e.a) && setA.has(e.b), inB = setB.has(e.a) && setB.has(e.b);
      const cls = inA && inB ? 'both' : inA ? 'a' : inB ? 'b' : undefined;
      if (!e.arc) return <line key={i} class={cls} x1={p.x} y1={p.y} x2={q.x} y2={q.y} />;
      // Shorter arc around the group centre; sweep follows the turn direction from p to q.
      const cross = (p.x - e.arc.cx) * (q.y - e.arc.cy) - (p.y - e.arc.cy) * (q.x - e.arc.cx);
      return <path key={i} class={cls} d={`M${p.x} ${p.y}A${e.arc.r} ${e.arc.r} 0 0 ${cross > 0 ? 1 : 0} ${q.x} ${q.y}`} />;
    });
    const nodes = Object.values(tree.nodes).filter(shown).map((n) => (
      <circle key={n.id} data-id={n.id} class={`${n.kind} ${state.get(n.id) ?? ''}`} cx={n.x} cy={n.y} r={RADIUS[n.kind]} />
    ));
    return { edges, nodes, shown };
  }, [tree, a, b, state]);

  const ringed = useMemo(() => {
    if (!filter.trim()) return [];
    return Object.values(tree.nodes).filter((n) => drawing.shown(n) && n.kind !== 'classStart'
      && [n.name, ...nodeStats(a, tree, n.id), ...nodeStats(b, treeB, n.id), ...n.stats].some((t) => matches(filter, t)));
  }, [tree, treeB, a, b, filter, drawing]);

  const apply = () => {
    const { x, y, k } = view.current;
    gRef.current?.setAttribute('transform', `translate(${x} ${y}) scale(${k})`);
  };
  /** Fit a tree-space box into the viewBox. */
  const fit = (minX: number, minY: number, maxX: number, maxY: number) => {
    const { bounds: bb } = tree;
    const vw = bb.maxX - bb.minX + 2 * PAD, vh = bb.maxY - bb.minY + 2 * PAD;
    const w = Math.max(maxX - minX, 1500), h = Math.max(maxY - minY, 1500);
    const k = Math.min(vw / (w + 2 * PAD), vh / (h + 2 * PAD), 12);
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    view.current = { k, x: (bb.minX + bb.maxX) / 2 - cx * k, y: (bb.minY + bb.maxY) / 2 - cy * k };
    apply();
  };
  const fitIds = (ids: number[]) => {
    const all = ids.map((id) => tree.nodes[id]).filter(drawing.shown);
    // Ascendancy nodes sit far out on the rim; leave them out of the box unless they are all that differs.
    const main = all.filter((n) => !n.ascendancy);
    const pts = main.length ? main : all;
    if (!pts.length) return fit(tree.bounds.minX, tree.bounds.minY, tree.bounds.maxX, tree.bounds.maxY);
    fit(Math.min(...pts.map((p) => p.x)), Math.min(...pts.map((p) => p.y)), Math.max(...pts.map((p) => p.x)), Math.max(...pts.map((p) => p.y)));
  };

  useEffect(() => {
    if (focusRef) focusRef.current = (id) => {
      fitIds([id]);
      svgRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
      const el = gRef.current?.querySelector(`circle[data-id="${id}"]`);
      el?.classList.remove('flash');
      void (el as SVGElement | null)?.getBoundingClientRect();
      el?.classList.add('flash');
    };
  });
  useEffect(() => { view.current = { x: 0, y: 0, k: 1 }; apply(); }, [tree]);

  // Pan (one pointer) and pinch (two pointers) by transforming the one <g>; wheel zooms around the cursor.
  useEffect(() => {
    const svg = svgRef.current!;
    const toSvg = (cx: number, cy: number) => {
      const m = svg.getScreenCTM()!.inverse();
      return { x: m.a * cx + m.c * cy + m.e, y: m.b * cx + m.d * cy + m.f };
    };
    const zoomAt = (p: { x: number; y: number }, factor: number) => {
      const v = view.current, k = Math.min(Math.max(v.k * factor, 0.5), 20);
      view.current = { k, x: p.x - ((p.x - v.x) * k) / v.k, y: p.y - ((p.y - v.y) * k) / v.k };
      apply();
    };
    const pointers = new Map<number, { x: number; y: number }>();
    let pinch = 0;
    const down = (e: PointerEvent) => {
      svg.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, toSvg(e.clientX, e.clientY));
      if (pointers.size === 2) { const [p, q] = [...pointers.values()]; pinch = Math.hypot(p!.x - q!.x, p!.y - q!.y); }
    };
    const move = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      const cur = toSvg(e.clientX, e.clientY);
      pointers.set(e.pointerId, cur);
      if (pointers.size === 1) {
        view.current.x += cur.x - prev.x;
        view.current.y += cur.y - prev.y;
        apply();
      } else if (pointers.size === 2) {
        const [p, q] = [...pointers.values()];
        const d = Math.hypot(p!.x - q!.x, p!.y - q!.y);
        if (pinch) zoomAt({ x: (p!.x + q!.x) / 2, y: (p!.y + q!.y) / 2 }, d / pinch);
        pinch = d;
      }
      setTip(null);
    };
    const up = (e: PointerEvent) => { pointers.delete(e.pointerId); pinch = 0; };
    const wheel = (e: WheelEvent) => { e.preventDefault(); zoomAt(toSvg(e.clientX, e.clientY), Math.exp(-e.deltaY * 0.0015)); };
    svg.addEventListener('pointerdown', down);
    svg.addEventListener('pointermove', move);
    svg.addEventListener('pointerup', up);
    svg.addEventListener('pointercancel', up);
    svg.addEventListener('wheel', wheel, { passive: false });
    return () => {
      svg.removeEventListener('pointerdown', down);
      svg.removeEventListener('pointermove', move);
      svg.removeEventListener('pointerup', up);
      svg.removeEventListener('pointercancel', up);
      svg.removeEventListener('wheel', wheel);
    };
  }, []);

  const over = (e: PointerEvent) => {
    const id = Number((e.target as Element).getAttribute?.('data-id'));
    const box = svgRef.current!.parentElement!.getBoundingClientRect();
    setTip(id ? { id, x: e.clientX - box.left, y: e.clientY - box.top } : null);
  };

  const { bounds: bb } = tree;
  const offTree = diff.nodes.onlyB.filter((id) => !tree.nodes[id]).length;
  const summary = `Passive tree: ${diff.nodes.onlyB.length} nodes only they have, ${diff.nodes.onlyA.length} only you have, ${diff.nodes.changed.length} with a different choice. The lists below have the same information.`;
  return (
    <div class="tree">
      <div class="tree-tools">
        <button type="button" onClick={() => fitIds([...diff.nodes.onlyA, ...diff.nodes.onlyB, ...diff.nodes.changed])}>Zoom to differences</button>
        <button type="button" onClick={() => { view.current = { x: 0, y: 0, k: 1 }; apply(); }}>Whole tree</button>
        <span class="legend">
          <span class="sw b" /> They have, you don't <span class="sw a" /> You have, they don't
          <span class="sw changed" /> Different choice <span class="sw both" /> Both
        </span>
      </div>
      <svg ref={svgRef} role="img" aria-label={summary}
        viewBox={`${bb.minX - PAD} ${bb.minY - PAD} ${bb.maxX - bb.minX + 2 * PAD} ${bb.maxY - bb.minY + 2 * PAD}`}
        onPointerOver={over} onPointerLeave={() => setTip(null)}>
        <g ref={gRef}>
          <g class="edges">{drawing.edges}</g>
          <g class="nodes">{drawing.nodes}</g>
          <g class="rings">{ringed.map((n) => <circle key={n.id} cx={n.x} cy={n.y} r={RADIUS[n.kind] + 40} />)}</g>
        </g>
      </svg>
      {offTree > 0 && <p class="note">{offTree} of their nodes aren't on your tree version ({tree.version}), so they're only in the lists below.</p>}
      {tip && <Tooltip {...tip} tree={tree} treeB={treeB} a={a} b={b} state={state.get(tip.id)} />}
    </div>
  );
}

const SIDE: Record<string, string> = { a: 'You have, they don\'t', b: 'They have, you don\'t', both: 'Both have', changed: 'Both have, different choice' };

function Tooltip({ id, x, y, tree, treeB, a, b, state }: { id: number; x: number; y: number; tree: TreeData; treeB: TreeData; a: Build; b: Build; state?: string }) {
  const n = tree.nodes[id];
  if (!n) return null;
  const sa = nodeStats(a, tree, id), sb = nodeStats(b, treeB, id);
  const mastery = n.kind === 'mastery';
  return (
    <div class="tooltip" style={{ left: x + 14, top: y + 14 }}>
      <strong>{a.nodeOverrides[id]?.name ?? b.nodeOverrides[id]?.name ?? n.name}</strong>
      {state && <div class={`side ${state}`}>{SIDE[state]}</div>}
      {state === 'changed' || (mastery && state === 'both') ? (
        <>
          <div class="who a">You</div>{sa.map((s) => <div>{s}</div>)}
          <div class="who b">Them</div>{sb.map((s) => <div>{s}</div>)}
        </>
      ) : (
        (state === 'a' ? sa : state ? sb : mastery ? [] : n.stats).map((s) => <div>{s}</div>)
      )}
    </div>
  );
}
