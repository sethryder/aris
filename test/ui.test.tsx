import { readFileSync } from 'node:fs';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { App } from '../src/ui/App.tsx';

async function encode(xml: string) {
  const s = new Response(xml).body!.pipeThrough(new CompressionStream('deflate'));
  const bytes = new Uint8Array(await new Response(s).arrayBuffer());
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_');
}
const codes: Record<string, string> = {};
let root: HTMLElement;

beforeEach(async () => {
  codes.A ??= await encode(readFileSync('test/fixtures/poe1/pob-a.xml', 'utf8'));
  codes.B ??= await encode(readFileSync('test/fixtures/poe1/pob-b.xml', 'utf8'));
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const tree = url.match(/data\/poe1\/(tree-[\w]+\.json)$/);
    if (tree) return new Response(readFileSync(`public/data/poe1/${tree[1]}`, 'utf8'));
    const link = url.match(/\/pob\?url=(.+)$/);
    if (link) return new Response(codes[decodeURIComponent(link[1]!).slice(-1)]);
    return new Response('{"error":"not_found"}', { status: 404 });
  }));
  root = document.body.appendChild(document.createElement('div'));
});
afterEach(() => { render(null, root); root.remove(); vi.unstubAllGlobals(); history.replaceState(null, '', '/'); });

const until = async (cond: () => unknown) => {
  for (let i = 0; i < 200 && !cond(); i++) await act(() => new Promise((r) => setTimeout(r, 10)));
  expect(cond()).toBeTruthy();
};
const tab = (name: string) => [...root.querySelectorAll<HTMLButtonElement>('[role=tab]')].find((t) => t.textContent === name)!;
const type = async (el: HTMLInputElement, v: string) => act(() => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); });

test('pasted codes render all three tabs and the filter narrows every list', async () => {
  await act(() => render(<App />, root));
  for (const [id, code] of [['a', codes.A!], ['b', codes.B!]] as const) {
    await type(root.querySelector<HTMLInputElement>(`#${id}-in`)!, code);
    await act(() => root.querySelector<HTMLInputElement>(`#${id}-in`)!.form!.requestSubmit());
  }
  await until(() => root.querySelector('[role=tab]'));
  expect(root.querySelectorAll('.nodes circle').length).toBeGreaterThan(1000);
  expect(root.textContent).toContain("They have, you don't");
  expect(root.textContent).toContain("Pasted codes can't be shared by link");
  expect(location.hash).toBe('');

  const filter = root.querySelector<HTMLInputElement>('.filter')!;
  const before = root.querySelectorAll('.nodelists li').length;
  await type(filter, 'block');
  const after = [...root.querySelectorAll('.nodelists li')];
  expect(after.length).toBeLessThan(before);
  expect(after.length).toBeGreaterThan(0);
  expect(root.querySelectorAll('.stattotals tbody tr').length).toBeGreaterThan(0);
  for (const li of after) expect(li.textContent!.toLowerCase()).toContain('block');
  for (const td of root.querySelectorAll('.stattotals tbody tr td:first-child')) expect(td.textContent!.toLowerCase()).toContain('block');
  expect(root.querySelectorAll('.rings circle').length).toBeGreaterThan(0);

  await act(() => tab('Items').click());
  expect(root.querySelectorAll('.slot').length).toBeGreaterThan(0);
  for (const li of root.querySelectorAll('.slot li')) expect(li.textContent!.toLowerCase()).toContain('block');
  await type(filter, '');
  const allSlots = root.querySelectorAll('.slot').length;
  expect(allSlots).toBeGreaterThan(5);

  await act(() => tab('Skills').click());
  expect(root.textContent).toContain('Supports per active skill');
  expect(root.textContent).toContain('Exsanguinate');
  await type(filter, 'block');
  expect(root.textContent).not.toContain('Exsanguinate');
});

test('a link-based comparison is restored from the hash', async () => {
  history.replaceState(null, '', '/#' + new URLSearchParams({ a: 'link:https://pobb.in/A', b: 'link:https://pobb.in/B' }));
  await act(() => render(<App />, root));
  await until(() => root.querySelector('[role=tab]'));
  expect(root.querySelector<HTMLInputElement>('#a-in')!.value).toBe('https://pobb.in/A');
  expect(root.textContent).toContain('90 self cast');
  expect(new URLSearchParams(location.hash.slice(1)).get('b')).toBe('link:https://pobb.in/B');
});
