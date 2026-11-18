// Path of Building release (tag in pob.json) → public/pob/<tag>/: the Lua and data the headless engine needs.
// Run: npm run pob. Output is generated (CI runs this before tests and build), not committed.
//
//   core.pack           (gzip; no .gz extension so hosts don't add Content-Encoding) src/*.lua, Classes, Modules, Data, runtime/lua
//   tree/<ver>.pack  src/TreeData/<ver>/*.lua, fetched per build
//   timeless/<file>     big timeless-jewel tables, fetched only when a build has that jewel
//   manifest.json, LICENSE.md
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';

const { pob: tag } = JSON.parse(readFileSync('pob.json', 'utf8')) as { pob: string };
const src = join('.cache/pob', tag);
const out = join('public/pob', tag);
const SMALL = 1_000_000; // timeless files below this ride along in core

if (!existsSync(join(src, 'src/Launch.lua'))) {
  rmSync(src, { recursive: true, force: true });
  const git = (...args: string[]) => execFileSync('git', args, { stdio: 'inherit' });
  git('clone', '--quiet', '--depth=1', '--filter=blob:none', '--sparse', '--branch', tag,
    'https://github.com/PathOfBuildingCommunity/PathOfBuilding.git', src);
  git('-C', src, 'sparse-checkout', 'set', '--no-cone',
    '/LICENSE.md', '/runtime/lua/', '/src/*.lua', '/src/Classes/', '/src/Modules/', '/src/Data/', '/src/TreeData/*/*.lua');
}

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));

// PoB v2.68 started using compound assignment (`x += 1`), which no stock Lua parses. Rewrite to `x = x + (1)`.
// ponytail: line-based; a compound assignment sharing a line with other code slips through and the golden test fails.
const COMPOUND = /^(\s*)([\w.:[\]"']+) (\+|-|\*|\/|\.\.)= (.+?)(\s*--.*)?$/gm;
let rewrites = 0;
const read = (file: string): Buffer => {
  if (!file.endsWith('.lua')) return readFileSync(file);
  const text = readFileSync(file, 'utf8').replace(COMPOUND, (_, ind, lhs, op, rhs, comment = '') => {
    rewrites++;
    return `${ind}${lhs} = ${lhs} ${op} (${rhs})${comment}`;
  });
  return Buffer.from(text);
};

/** Pack format: one JSON line [[path, size], ...], then the bytes in order; gzipped. */
function pack(files: string[], base: string): Buffer {
  const bodies = files.map(read);
  const index = files.map((f, i) => [relative(base, f), bodies[i]!.length]);
  return gzipSync(Buffer.concat([Buffer.from(JSON.stringify(index) + '\n'), ...bodies]), { level: 9 });
}

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'tree'), { recursive: true });
mkdirSync(join(out, 'timeless'), { recursive: true });

const timelessDir = join(src, 'src/Data/TimelessJewelData');
const isTreeFile = (f: string) => /[/\\](tree|sprites)\.lua$/.test(f);
const big = walk(timelessDir).filter((f) => statSync(f).size >= SMALL);
const core = [
  ...readdirSync(join(src, 'src')).filter((f) => f.endsWith('.lua')).map((f) => join(src, 'src', f)),
  ...['Classes', 'Modules', 'Data'].flatMap((d) => walk(join(src, 'src', d))),
  ...walk(join(src, 'runtime/lua')),
  ...walk(join(src, 'src/TreeData')).filter((f) => !isTreeFile(f)), // shared code PoB requires at startup (3_19/Assets.lua, legion)
].filter((f) => !big.includes(f));
writeFileSync(join(out, 'core.pack'), pack(core, src));

const trees = readdirSync(join(src, 'src/TreeData')).filter((d) => existsSync(join(src, 'src/TreeData', d, 'tree.lua')));
for (const v of trees) writeFileSync(join(out, 'tree', `${v}.pack`), pack(walk(join(src, 'src/TreeData', v)).filter(isTreeFile), src));

for (const f of big) copyFileSync(f, join(out, 'timeless', relative(timelessDir, f)));
copyFileSync(join(src, 'LICENSE.md'), join(out, 'LICENSE.md'));

// Timeless tables grouped by jewel ("ElegantHubris" → its files), so the engine can fetch what a build uses.
const timeless: Record<string, string[]> = {};
for (const f of big) (timeless[relative(timelessDir, f).split('.')[0]!] ??= []).push(relative(timelessDir, f));
// PoB reads its latest tree synchronously at startup, so the engine mounts it before boot.
const versions = readFileSync(join(src, 'src/GameVersions.lua'), 'utf8').match(/treeVersionList = \{([^}]+)\}/)?.[1]?.match(/"[^"]+"/g);
const latest = versions?.at(-1)?.slice(1, -1);
if (!latest || !trees.includes(latest)) throw new Error('Could not find latestTreeVersion in GameVersions.lua');
writeFileSync(join(out, 'manifest.json'), JSON.stringify({ tag, latest, trees, timeless }));

const mb = (f: string) => (statSync(join(out, f)).size / 1e6).toFixed(1);
console.log(`PoB ${tag}: core ${mb('core.pack')} MB, ${trees.length} trees, ${big.length} timeless files, ${rewrites} compound assignments rewritten`);
