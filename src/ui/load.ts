// Turning picker input / URL hash into a loaded Build. No UI here.
import { getCharacter, getPobCode } from '../api.ts';
import { decodePob } from '../core/pob.ts';
import type { Build, GameId, TreeData } from '../core/types.ts';
import type { CalcInput } from '../pob/engine.ts';
import { games } from '../games/index.ts';

export type Source =
  | { kind: 'acct'; account: string; name?: string }
  | { kind: 'link'; url: string }
  | { kind: 'code'; code: string };

const ACCOUNT = /^[^\s#/]{1,40}#\d{4}$/;

export function parseInput(raw: string): Source {
  const s = raw.trim();
  const profile = s.match(/pathofexile\.com\/account\/view-profile\/([^/?#]+)-(\d{4})(?:\/characters\?characterName=([^&#]+))?/i);
  if (profile) return { kind: 'acct', account: `${decodeURIComponent(profile[1]!)}#${profile[2]}`, name: profile[3] && decodeURIComponent(profile[3]) };
  if (/^https?:\/\//i.test(s)) return { kind: 'link', url: s };
  if (ACCOUNT.test(s)) return { kind: 'acct', account: s };
  return { kind: 'code', code: s };
}

/** Hash value for a source, or null when it can't be shared (raw codes are too long and private). */
export function toHash(src: Source): string | null {
  if (src.kind === 'acct') return src.name ? `acct:${src.account}/${src.name}` : null;
  if (src.kind === 'link') return `link:${src.url}`;
  return null;
}
export function fromHash(v: string | null): Source | null {
  if (!v) return null;
  if (v.startsWith('link:')) return { kind: 'link', url: v.slice(5) };
  const m = v.match(/^acct:([^/]+)\/(.+)$/);
  return m ? { kind: 'acct', account: m[1]!, name: m[2]! } : null;
}

export class LoadError extends Error { override name = 'LoadError'; }

const treeCache = new Map<string, Promise<TreeData>>();
export function loadTree(game: GameId, version: string): Promise<TreeData> {
  const key = `${game}/${version}`;
  let p = treeCache.get(key);
  if (!p) {
    p = fetch(`${import.meta.env.BASE_URL}data/${game}/tree-${version}.json`).then((r) => {
      if (!r.ok) throw new LoadError(`Could not load passive tree ${version}`);
      return r.json() as Promise<TreeData>;
    });
    p.catch(() => treeCache.delete(key));
    treeCache.set(key, p);
  }
  return p;
}

/** `calc` is what the PoB engine needs to recalculate this build (WP8). */
export interface Loaded { build: Build; tree: TreeData; warning?: string; calc: CalcInput }

/** Load the tree the build was made on, or the latest shipped one with a warning. */
async function withTree(build: Build, calc: CalcInput): Promise<Loaded> {
  const game = games[build.game]!;
  if (game.treeVersions.includes(build.treeVersion)) return { build, tree: await loadTree(build.game, build.treeVersion), calc };
  return {
    build,
    tree: await loadTree(build.game, game.latestTreeVersion),
    warning: `This build uses tree ${build.treeVersion || 'unknown'}; showing it on ${game.latestTreeVersion}. Some nodes may be missing.`,
    calc,
  };
}

export async function loadSource(src: Source): Promise<Loaded> {
  if (src.kind === 'acct') {
    const game = games.poe1!;
    const [raw, tree] = await Promise.all([getCharacter(src.account, src.name!), loadTree('poe1', game.latestTreeVersion)]);
    const build = game.fromAccount!(raw, tree);
    build.label = `${build.label} (${src.account})`;
    return { build, tree, calc: raw };
  }
  const code = src.kind === 'link' ? await getPobCode(src.url) : src.code;
  const { game, doc } = await decodePob(code);
  const g = games[game];
  if (!g) throw new LoadError('Path of Exile 2 builds are not supported yet.');
  return withTree(g.fromPob(doc), { xml: new XMLSerializer().serializeToString(doc) });
}
