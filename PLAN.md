# Aris: Path of Exile character compare

Plan written 2026-11-17. Facts in section 8 were checked against live endpoints and current repos that day; anything marked **unverified** was not.

## 1. Goal

A website where you pick two Path of Exile characters, **You** (side A) and **Them** (side B, typically a streamer whose build you follow), and see what differs: passive tree nodes, masteries, skill gems and supports, and equipped items.

The motivating case: "I switched to the shield they use but have less block. Which tree nodes, item mods or gems do they have that I don't?" The site must answer that in under a minute: load both characters, type `block` in a filter, and read the list.

**Why this exists alongside Path of Building's Compare tab:** PoB can only compare against a build that arrives as an import or PoB code, so comparing with a live character takes an extra export step. Here both sides can be picked straight from an account name. That makes account lookup the core feature, not a convenience: protect it when trading off scope, and keep PoB codes and links as the second input path.

Path of Exile 1 ships first. Path of Exile 2 is a later addition and must not require a rewrite (section 7).

## 2. Scope

**In v1**

- Load a character two ways, on either side:
  - by account name (`Name#1234`) and character, for public PoE1 profiles;
  - by Path of Building (PoB) export code, or a build link (pobb.in, poe.ninja, maxroll, pastebin, pob.codes, rentry, poedb).
- Tree diff: a zoomable vector map with nodes coloured as you-only, them-only, both; plus lists grouped by keystone, notable, mastery, small.
- Tree stat totals: every stat line summed across each build's allocated nodes, shown as You, Them, delta.
- Skill diff: gems only one side has, level and quality differences, and per active skill which supports differ.
- Item diff: per slot, the two items and their mods split into you-only, them-only, different roll, same.
- One text filter that narrows every list and rings matching nodes on the map.
- A shareable URL for comparisons built from account names or build links.

**Out of v1** (do not build; each has a named ceiling)

| Skipped | Why | Add when |
|---|---|---|
| Sprite art on the tree | Vector circles carry the diff. | The map reads as too abstract in real use. |
| Drawing cluster jewel subgraphs, diffing small cluster passives | Needs a port of PoB's `BuildSubgraph` (about 350 lines of Lua). Cluster notables are still compared by name (WP2, WP3). | Users ask for it. |
| Timeless jewel node transformations on the map and in the diff lists | 170 MB of lookup data. The WP8 calc view does include them (fetched per jewel). | Probably never. |
| Private profiles, OAuth login | GGG is not accepting new OAuth app registrations. | GGG reopens registration. |
| Path of Exile 2 | Phase 2. See section 7. | After v1 ships. |
| Weapon swap sets, non-active PoB specs / item sets / skill sets | Compare what is active. | Users ask. |
| Any database or saved comparisons | The URL is the save file. | Never, ideally. |
| Console realms | PC only. The endpoints accept `realm=xbox|sony`, untested. | Someone asks. |

## 3. Decisions already made

Do not relitigate these; flag a blocker instead.

1. **Static site on GitHub Pages.** All parsing, diffing and rendering runs in the browser.
2. **One small proxy** (`worker/index.ts`, a plain `fetch(Request) → Response` handler) is the only server code, **hosted on the user's own server**, not Cloudflare. It exists because GGG's character endpoints and almost every build-link host send no CORS headers. The site must stay fully usable for pasted PoB codes when the proxy is down. "Worker" below means this proxy.
   - Decided 2026-11-17 by the WP0 spike. From Cloudflare Workers, GGG answered with JSON (no block), but the shared egress IP had already used 185 of its 180 character requests per 2 h, so we got 429s. From the user's server: 200, and the budget showed only our own hits.
3. **Stack:** Vite, TypeScript (strict), Preact, plain CSS. Tests with Vitest (jsdom environment, for `DOMParser`). No router, no state library, no CSS framework, no tree-rendering library, no zlib library.
4. **Browser built-ins over dependencies:** `DecompressionStream('deflate')` for PoB codes (it reads the zlib wrapper), `DOMParser` for the XML, `atob` for base64, `<select>` for the character picker, SVG for the map.
5. **Tree data comes from GGG's official export**, converted at build time to a small normalised JSON that is committed to the repo.
6. **PoB's repo is a reference, not a runtime dependency.** Read its Lua to confirm behaviour (paths in section 8). v1 needs none of its data files.
7. **Vector tree, written in-house**, about 300 to 500 lines. No maintained, permissively licensed renderer covers both games. Do not copy code or SVGs from `Dav1dde/pasteofexile` (AGPL).
8. **Game seam:** everything specific to one game lives in `src/games/<game>/` and `scripts/`. Diff logic and UI see only the normalised `Build` and `TreeData` types in section 5.
9. **Simplification marker:** when you take a deliberate shortcut, leave a `// ponytail:` comment naming the ceiling and the upgrade path.
10. **PoB's calc engine runs in the browser** (decided 2026-11-17, reversing "never in-house"). PoB is MIT. Its unmodified Lua runs on pob-web's Lua 5.2 fork compiled to WebAssembly, in a Web Worker, loaded only when the Calcs tab opens. No server CPU; the proxy stays a dumb fetcher. See WP8.

## 4. Architecture

```
Browser (GitHub Pages, static)
  input ─┬─ PoB code ───────────────► core/pob.ts (base64url → inflate → XML Document)
         ├─ build link ─► Worker /pob ─┘                     │
         └─ account ───► Worker /poe1/character              ▼
                              │                games/poe1/fromPob.ts ─┐
                              └──────────────► games/poe1/fromApi.ts ─┤
                                                                       ▼
   public/data/poe1/tree-<ver>.json ─► TreeData ─►  Build A, Build B (normalised)
                                                          │
                                              core/diff.ts, core/stats.ts
                                                          │
                                              ui/ (map, lists, filter)

Proxy on the user's server (worker/index.ts): allowlisted fetch + cache + CORS. Nothing else.
```

Repo layout:

```
aris/
  PLAN.md
  index.html  package.json  tsconfig.json  vite.config.ts
  scripts/build-tree.ts            GGG export → public/data/<game>/tree-<ver>.json
  public/data/poe1/tree-3_30.json  (generated, committed)
  src/
    main.tsx
    core/types.ts                  the contract (section 5)
    core/pob.ts                    decode a PoB code, detect the game
    core/stats.ts                  stat-line templates and sums
    core/diff.ts                   Build × Build → BuildDiff
    core/markup.ts                 strip GGG text markup
    games/index.ts                 registry: { poe1 }
    games/poe1/{index,fromApi,fromPob,slots}.ts
    api.ts                         Worker client
    ui/{App,BuildPicker,TreeView,NodeLists,StatTotals,SkillsView,ItemsView}.tsx
    ui/style.css
  worker/index.ts                  proxy handler (+ a small runtime adapter for the server)
  test/*.test.ts
  test/fixtures/                   real samples, already saved (section 8.6)
  .github/workflows/deploy.yml
```

## 5. Contracts

WP0 creates `src/core/types.ts` with exactly this. Later packages may add optional fields; they may not rename or remove without updating every consumer.

```ts
export type GameId = 'poe1' | 'poe2';

/** One character, normalised. Nothing game-specific leaks past this type. */
export interface Build {
  game: GameId;
  source: 'account' | 'pob';
  label: string;                  // "CharName (Account#1234)" or the PoB spec title
  className: string;              // base class, e.g. "Templar"
  ascendancy: string | null;
  level: number;
  treeVersion: string;            // PoB style: "3_30", "3_30_ruthless"
  /** Allocated node ids that exist in TreeData.nodes. Excludes class-start and
   *  ascendancy-start nodes and all cluster jewel nodes. */
  nodes: number[];
  masteries: Record<number, number>;                               // mastery node id → chosen effect id
  nodeOverrides: Record<number, { name: string; stats: string[] }>; // tattoos
  clusterNotables: string[];      // names, read from cluster jewel mod text
  items: Item[];                  // gear, flasks, tree jewels, abyss jewels
  skills: SkillGroup[];
}

export interface Item {
  slot: string;                   // canonical = PoB slot name, see slots.ts. Tree jewels: "Jewel <socketNodeId>"
  name: string;                   // "" for normal and magic items
  base: string;
  rarity: string;                 // lower case: normal | magic | rare | unique | relic
  mods: Mod[];
}
export interface Mod {
  text: string;                   // markup stripped, one line
  kind: 'enchant' | 'implicit' | 'explicit';
  flags: string[];                // crafted, fractured, ...
}

export interface SkillGroup { slot: string | null; gems: Gem[] }   // one linked group
export interface Gem { name: string; support: boolean; level: number; quality: number }

/** Normalised tree: positions and edges are precomputed, so the renderer is game-agnostic. */
export interface TreeData {
  game: GameId;
  version: string;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  classes: { name: string; ascendancies: string[] }[];   // index = numeric class id
  nodes: Record<number, TreeNode>;
  edges: TreeEdge[];
  jewelSlots: number[];                                  // index → socket node id
  clusterNotables: Record<string, string[]>;             // name → stats, for nodes with no position
}
export interface TreeNode {
  id: number;
  name: string;
  stats: string[];
  kind: 'normal' | 'notable' | 'keystone' | 'mastery' | 'jewel' | 'classStart' | 'ascStart';
  ascendancy?: string;
  x: number;
  y: number;
  masteryEffects?: Record<number, string[]>;             // effect id → stats
}
export interface TreeEdge { a: number; b: number; arc?: { cx: number; cy: number; r: number } }

/** What a game module exports. `fromAccount` is absent when a game has no lookup (PoE2). */
export interface Game {
  id: GameId;
  latestTreeVersion: string;
  treeVersions: string[];
  slotOrder: string[];
  fromPob(doc: Document): Build;
  fromAccount?(raw: { passives: unknown; items: unknown }, tree: TreeData): Build;
}

export interface BuildDiff {
  nodes: { onlyA: number[]; onlyB: number[]; both: number[]; changed: number[] };  // changed = same node, different mastery effect or tattoo
  clusterNotables: { onlyA: string[]; onlyB: string[]; both: string[] };
  treeStats: StatDelta[];
  gems: { onlyA: Gem[]; onlyB: Gem[]; changed: { a: Gem; b: Gem }[]; bySkill: SkillDiff[] };
  items: SlotDiff[];
}
export interface StatDelta { template: string; a: number[]; b: number[] }
export interface SkillDiff { skill: string; inA: boolean; inB: boolean; supportsOnlyA: string[]; supportsOnlyB: string[]; supportsBoth: string[] }
export interface SlotDiff {
  slot: string; a?: Item; b?: Item;
  onlyA: Mod[]; onlyB: Mod[]; changed: { a: Mod; b: Mod }[]; same: Mod[];
}
```

## 6. Work packages

Order: **WP0 first, alone.** Then WP1 to WP4 in parallel (they own disjoint files and depend only on `types.ts`). Then WP5 and WP6 in parallel. WP7 last. WP8 (added later) builds on WP5.

Every package ends with `npm run typecheck && npm test` passing and the listed check demonstrated.

### WP0: Spike, scaffold, contract

Owns: repo root config, `src/core/types.ts`, `src/core/markup.ts`, `worker/` (minimal).

1. `git init`. Scaffold Vite + Preact + TypeScript strict + Vitest (jsdom). Scripts: `dev`, `build`, `typecheck`, `test`, `data`.
2. Write `types.ts` from section 5.
3. `markup.ts`: `stripMarkup(s)` turns `[key|Display]` into `Display`, `[Word]` into `Word`, and `<underline>{x}` into `x`. One test. Both tree stats and item mods from the API carry this markup, for example `1 Added Passive Skill is [affliction_notable_magnifier|Magnifier]`.
4. **The spike that decides the hosting shape.** Deploy a throwaway Worker that fetches `get-passive-skills` for a public ladder character (find one via `GET https://www.pathofexile.com/api/ladders/<league>?limit=5&realm=pc`, entries with `"public": true`). Record the status code and the `x-rate-limit-ip-state` header.
   - 200 with JSON: proceed.
   - 403 or a Cloudflare challenge page: **stop and report to the user.** pathofexile.com sits behind Cloudflare and this was only tested from a residential IP. Because lookup is the core feature, the preferred fallback is the same proxy code on a host the user owns; shipping without account lookup is the last resort. Either way it is the user's call.
   - Also report whether the rate-limit state shows hits you did not make. Workers share egress IPs, and GGG limits per IP.

Check: `npm run dev` shows a blank app, tests pass, and the spike result is written in the WP0 hand-back.

### WP1: Tree data build script

Owns: `scripts/build-tree.ts`, `public/data/poe1/`, `test/build-tree.test.ts`.

1. Config: `POE1_TAGS = ['3.30.0', '3.29.1', '3.28.0']`. Fetch `https://raw.githubusercontent.com/grindinggear/skilltree-export/<tag>/data.json`. Output `public/data/poe1/tree-3_30.json` and so on (tag `3.30.0` → version `3_30`, dropping the patch number). Adding a league is one array entry and a rerun.
2. Convert to `TreeData` (source structure in section 8.4):
   - Skip the `"root"` node and nodes flagged `isProxy`.
   - Nodes with no `group` go to `clusterNotables` by name, not to `nodes`.
   - Compute `x`, `y` with the orbit formula and angle tables in section 8.4.
   - `kind`: keystone, else notable, else mastery, else jewel socket, else class start (`classStartIndex` present), else ascendancy start, else normal.
   - `masteryEffects`: `{ effect: stats }` from the node's `masteryEffects` array.
   - Run every name and stat line through `stripMarkup`.
   - Edges from each node's `out`, deduplicated. Arc when both ends share a group and an orbit greater than 0 (centre = group position, radius = orbit radius), otherwise a straight line. Drop edges that touch a mastery or cross between an ascendancy and the main tree. **Unverified rule:** confirm it against the connector code in PoB `src/Classes/PassiveTree.lua` before trusting it.
   - Copy `classes` (name and ascendancy names), `jewelSlots`, and bounds.
3. Keep only the fields in the contract. Target under 1.5 MB per file before gzip.

Check: a test loads the generated `tree-3_30.json` and asserts a known keystone has `kind: 'keystone'`, non-empty stats and finite coordinates inside bounds; that every edge endpoint exists in `nodes`; and that no stat line contains `[` or `|`.

### WP2: PoB code decoding and the PoE1 PoB parser

Owns: `src/core/pob.ts`, `src/games/poe1/fromPob.ts`, `src/games/poe1/slots.ts`, tests.

1. `pob.ts`: `decodePob(code: string): Promise<{ game: GameId; doc: Document }>`. Trim whitespace, map `-` to `+` and `_` to `/`, `atob`, inflate with `DecompressionStream('deflate')`, parse with `DOMParser`. Root `<PathOfBuilding>` is poe1, `<PathOfBuilding2>` is poe2. Throw a typed error for input that is not a PoB code.
2. `fromPob(doc)` using the XML structure in section 8.3:
   - Class, ascendancy and level from `<Build>` (`className`, `ascendClassName`, `level`).
   - The active spec is the **1-based index** `Tree@activeSpec` into the `<Spec>` children. `nodes` is the comma list, minus ids of 65536 and above (cluster nodes). Class-start and ascendancy-start removal happens in the diff step, where tree data is available.
   - `masteries` from `masteryEffects="{node,effect},{…}"`. `nodeOverrides` from `<Overrides><Override nodeId dn>` with the element text split into stat lines.
   - Items: the active item set is the `<ItemSet>` whose `id` equals `Items@activeItemSet` (an id, not an index). Each `<Slot name itemId>` with `itemId != "0"` maps to an `<Item id>`. Skip slots containing `Swap`. Tree jewels come from `<Spec><Sockets><Socket nodeId itemId>` as slot `Jewel <nodeId>`.
   - Item text parser: `Rarity:` line, then name and base (two lines for rare and unique, one otherwise), header lines up to `Implicits: N`, then N implicit lines, then explicit lines. Strip `{…}` prefixes; `{crafted}`, `{fractured}` and `{enchant}` set flags or kind. Drop lines whose `{variant:…}` list does not include `Selected Variant`. For `{range:r}` with `(a-b)`, substitute `a + r·(b−a)` rounded to the precision of the bounds.
   - Skills: the `<SkillSet>` whose `id` equals `Skills@activeSkillSet`. Skip `<Skill>` elements with `enabled="false"` or a `source` attribute (item-granted or tree-granted skills; the fixture has `source="Item:38:…"` and `source="Tree:4917"`). Skip gems with `enabled="false"`. `name` is `nameSpec`; `support` is true when `skillId` starts with `Support`. `// ponytail:` this prefix heuristic replaces a gem database; if it misclassifies, convert PoB `src/Data/Gems.lua`.
   - `clusterNotables`: from every jewel's mods matching `1 Added Passive Skill is (.+)`, excluding `a Jewel Socket`.
3. `slots.ts`: canonical slot names are PoB's (`Weapon 1`, `Weapon 2`, `Helmet`, `Body Armour`, `Gloves`, `Boots`, `Amulet`, `Ring 1`, `Ring 2`, `Ring 3`, `Belt`, `Flask 1` to `Flask 5`, `Graft 1`, `Graft 2`, `<slot> Abyssal Socket N`). Export `slotOrder`, and the API mapping used by WP3: `Weapon`→`Weapon 1`, `Offhand`→`Weapon 2`, `Helm`→`Helmet`, `BodyArmour`→`Body Armour`, `Ring`→`Ring 1`, `Ring2`→`Ring 2`, `Ring3`→`Ring 3`, `Flask` with `x`→`Flask x+1`. An unknown `inventoryId` passes through under its own name; never drop an item silently.

Check: tests decode a real code (re-encode `test/fixtures/poe1/pob-b.xml`, or fetch one) and assert class Witch, ascendancy Elementalist, level 90, the active spec is the eighth of eleven (title "90 self cast", 123 node ids before filtering), a non-empty mastery map, the active skill set and item set are the ones with id `11` (not the eleventh in document order), and that no skill group from a `source` skill survives. The active spec in this fixture has no tattoos, so test `nodeOverrides` with a hand-written `<Override>` element.

### WP3: Worker proxy and the PoE1 account parser

Owns: `worker/`, `src/api.ts`, `src/games/poe1/fromApi.ts`, tests.

**Worker routes** (GET only, JSON errors as `{ error, retryAfter? }`):

| Route | Upstream | Returns | Cache |
|---|---|---|---|
| `/poe1/characters?account=` | `get-characters` | upstream array | 10 min |
| `/poe1/character?account=&name=` | `get-passive-skills` and `get-items` | `{ passives, items }` | 10 min |
| `/pob?url=` | raw-code URL from the table in section 8.5 | `text/plain` code | 24 h |

Rules:
- **Not an open proxy.** `account` must match `^[^\s#/]{1,40}#\d{4}$`; `name` at most 64 characters, passed through `encodeURIComponent`. For `/pob`, parse the URL, require the host to be in the table, extract the id with `^[A-Za-z0-9_-]+$`, and build the upstream URL from the table. Never fetch a caller-supplied URL as given. Cap response bodies at 2 MB.
- **Rate limits** (added 2026-11-17): per client IP, 60 requests/min, and 6/min or 40/h lookups that miss the cache and reach an upstream. Across all clients, stop calling GGG one call short of any window in `x-rate-limit-ip-state`, and for `Retry-After` after a 429. Client IP comes from the runtime adapter (`TRUST_PROXY=1` → rightmost `X-Forwarded-For`).
- Encode `#` as `%23` in `accountName`. Send `realm=pc`.
- `User-Agent: aris/<version> (contact: <CONTACT>)`, with `CONTACT` a Wrangler variable. An empty User-Agent is blocked by GGG. The contact value comes from the user; do not invent one.
- CORS: `Access-Control-Allow-Origin` for the Pages origin and `http://localhost:5173` only.
- Upstream 403 → `404 { error: 'private_or_missing' }`, cached 60 seconds (GGG returns an identical 403 HTML page for private and nonexistent accounts). Upstream 429 → `429` with `Retry-After` passed through. A body of literal `false` → `404`.
- Cache in memory: a `Map` of key → `{ expires, status, body }`, pruned on write. `// ponytail:` lost on restart, which only costs some upstream hits.

**`fromAccount({ passives, items }, tree)`** using the shapes in section 8.2:
- `nodes` = `passives.hashes`. Ignore `hashes_ex` (cluster allocations; their ids are small integers local to each jewel's subgraph, not PoB's 65536+ scheme, so they cannot be matched across sources).
- `masteries` = `mastery_effects`. `nodeOverrides` from `skill_overrides` (node id → node object with `name` and `stats`).
- Class and ascendancy: `tree.classes[passives.character]`, then its `ascendancies[passives.ascendancy − 1]` when `ascendancy > 0`. **Unverified:** the off-by-one, and how `alternate_ascendancy` (bloodlines) should display; check against the fixture, where `items.character.class` is `"Warden"`.
- Gear from `items.items` through the slot mapping. Skip `Weapon2` and `Offhand2` (swap) and anything in the main inventory.
- Tree jewels from `passives.items`: slot `Jewel <tree.jewelSlots[item.x]>`.
- Mods: `enchantMods` is an array of strings; `implicitMods` and `explicitMods` are arrays of `{ description, flags? }` objects since API 3.29.0. Accept a plain string too. `flags` keys that are true become `Mod.flags`. Strip markup.
- Gems from each item's `socketedItems`: `support` is the API boolean, `name` is `typeLine` with a trailing ` Support` removed, level and quality are the leading integers of the `Level` and `Quality` entries in `properties`. Group gems by the `group` of their socket (`item.sockets[gem.socket].group`) to form one `SkillGroup` per link group. A socketed entry with `abyssJewel: true` is an item in slot `<slot> Abyssal Socket N`, not a gem.
- `clusterNotables`: same regex as WP2, over jewel mods.
- `treeVersion` = `poe1.latestTreeVersion`.

Check: a test runs the saved fixtures through `fromAccount` and asserts 116 nodes, six mastery choices, `Weapon 2` is the shield "Foulborn Esh's Mirror", the helmet's gems form one or more groups containing "Sniper's Mark" and "Mark On Hit", and `clusterNotables` contains "Magnifier". Separately, running the proxy locally plus curl shows `/pob?url=https://example.com/x` returns 400.

### WP4: Diff engine and stat totals

Owns: `src/core/diff.ts`, `src/core/stats.ts`, tests. No game-specific code here.

1. `stats.ts`:
   - `template(line)` → `{ template, values }`: replace each number (`/\d+(\.\d+)?/g`) with `#` and collect the numbers.
   - `nodeStats(build, tree, id)`: the override's stats if overridden; the chosen effect's stats for a mastery; otherwise the tree node's stats.
   - `sumStats(lines)`: group by template and sum element-wise.
2. `diff(a, b, treeA, treeB): BuildDiff`:
   - Nodes: set difference after removing `classStart` and `ascStart` kinds. `changed` = allocated on both sides with different `nodeStats`.
   - `treeStats`: `sumStats` over every allocated node on each side; keep rows where the sums differ; sort by template. Cluster passives are not included; the UI must say so.
   - Gems: flatten each side to a name-keyed map (keep the highest level if a name repeats). `changed` when level or quality differs.
   - `bySkill`: for each active gem name on either side, the union of supports in groups containing it, split three ways.
   - Items: pair by slot. Within Rings, Flasks and Jewels, pair across sides by (1) same name and base, (2) same base, (3) leftover in order, so a ring in the other finger is not reported as two differences. Mods pair by `kind` plus template: same template and same values is `same`, same template and different values is `changed`, the rest are `onlyA` or `onlyB`.
3. `matches(filter, text)`: case-insensitive substring. The UI filter uses this everywhere.

Check (this is the user's story, so it must exist as a test): build A and build B are identical except B allocates a node whose stat is `+5% Chance to Block Attack Damage while holding a Shield` and has a shield mod `+6% Chance to Block`. The diff puts that node in `onlyB`, shows the template `+#% Chance to Block Attack Damage while holding a Shield` in `treeStats` with a `[0]` and b `[5]`, and puts the mod in the shield slot's `onlyB`.

### WP5: UI shell, pickers, lists

Owns: `src/main.tsx`, `src/api.ts` usage, `src/ui/*` except `TreeView.tsx`, `src/games/index.ts`.

- **BuildPicker**, one per side, a single text input that accepts three things:
  - starts with `http` → build link, via the Worker. A `pathofexile.com/account/view-profile/Name-1234` URL is treated as the account `Name#1234`.
  - matches `Name#1234` → fetch the character list, show a native `<select>` sorted by `lastLoginTime` descending, with league, level and class.
  - anything else → try `decodePob`.
  Remember side A's last input in `localStorage` (wrapped in try/catch).
- If a PoB code is PoE2, say "Path of Exile 2 builds are not supported yet." If the two sides are different games, refuse to compare.
- **URL state** in the hash: `#a=acct:Name%231234/Char&b=link:https://pobb.in/abc`. Pasted raw codes are not put in the URL; show "paste codes can't be shared by link; upload to pobb.in to share".
- **Tree version handling:** load `tree-<build.treeVersion>.json`; if that version is not shipped, load the latest and show a warning naming both versions. A node id missing from the loaded tree renders as "Unknown node 12345" and never throws.
- **Views** (tabs, with the filter box always visible): Tree (map from WP6, node lists, stat totals), Skills, Items.
  - Node lists are headed "They have, you don't" first, then "You have, they don't", then "Different choice" (masteries, tattoos). Within each: keystones, notables, cluster notables, masteries, then small nodes collapsed by stat with a count (`+10 to Strength ×7`).
  - Clicking a node row calls the map's `focus(id)`.
- **Errors** shown inline next to the picker: private or missing profile (explain how to make the Characters tab public, or paste a PoB code instead), rate limited (show the retry time), bad code, Worker unreachable (pasted codes still work).
- Footer, required by GGG policy: "This product isn't affiliated with or endorsed by Grinding Gear Games in any way." Also one line pointing to Path of Building's Compare tab for exact stat calculations.
- Colour: you-only and them-only must be distinguishable without relying on red versus green (for example amber and blue), and each list is labelled in text. Dark theme. Keyboard reachable.

Check: with the Worker mocked, loading the two PoB fixtures renders all three tabs, typing `block` narrows every list, and reloading the page with the hash restores a link-based comparison.

### WP6: Tree map

Owns: `src/ui/TreeView.tsx`.

- One `<svg>` with `viewBox` from `tree.bounds`. Edges as `<line>` or `<path>` arcs (take the shorter arc), nodes as `<circle>` sized by kind. Around 7,500 elements; no virtualisation needed.
- State classes per node: `a`, `b`, `both`, `changed`, none. An edge is lit when both ends are allocated on the same side.
- Ascendancy nodes: draw only the ascendancies of build A and build B, at their data coordinates; hide the rest. If they land somewhere unusable, mirror how PoB positions them in `PassiveTree.lua`.
- Pan with pointer drag, zoom with wheel and pinch, by transforming one `<g>`. About 40 lines; no library.
- One shared tooltip element showing name, stats (effective stats per side when they differ) and which side has it.
- Props: `tree`, `diff`, `filter` (rings matching nodes), and an imperative `focus(id)`. A "Zoom to differences" button fits the view to the bounding box of `onlyA ∪ onlyB ∪ changed`.
- A legend. The node lists from WP5 are the accessible equivalent, so the SVG gets `role="img"` and a summary label.

Check: load the two PoB fixtures, screenshot the map at default zoom and after "Zoom to differences", and confirm visually that the outline resembles the PoE1 passive tree (roughly circular, class starts around the centre) and that differing nodes stand out.

### WP7: Deploy and end-to-end

Owns: `.github/workflows/deploy.yml`, `vite.config.ts` base path, README.

1. GitHub Actions: on push to `main`, `npm ci`, typecheck, test, build, deploy to Pages. Set Vite `base` to the repo path. `VITE_PROXY_URL` points at the Worker.
2. Deploy the proxy to the user's server behind its existing reverse proxy (TLS), with `CONTACT` and the allowed origin set as environment variables.
3. ~~Before the repo goes public: replace the real account and character names in `test/fixtures/` with placeholders.~~ Done 2026-11-17 (character names → `ExampleCharacter`/`CharacterNN`; PoE2 `lastCharacterHash` removed).
4. End-to-end on the deployed site: account-versus-link comparison of two real characters, the `block` filter, a shared URL opened in a private window, and the same on a phone-width viewport.

### WP8: Calcs tab on PoB's own engine

Goal: the PoB Calcs page for both sides at once. Every stat You / Them / delta, and per stat the sources (tree node, item, skill, buff) with the ones only one side has called out. The user's question: "where does their extra block come from?"

**Spike result (2026-11-17, PoB v2.68.1, pob-b fixture):** headless PoB recalculated attack block 74, spell block 56, life 4355, matching the `<PlayerStat>` values PoB saved. ES and evasion differ until the build's Elegant Hubris timeless data is loaded. `modDB:Tabulate` gives per-source rows (`Skill:TempestShield` +25 spell block, `Tree:38921` +14, …). Under WebAssembly in Node: 390 KB wasm, init 2.6 s once, about 1.9 s per build.

**Runtime facts:**
- Lua: `github.com/atty303/lua` branch `pob-web` (Lua 5.2 fork; pin the commit). Stock 5.2 fails: `string.format('%d', x)` rejects non-integers that LuaJIT accepts. The fork also matches LuaJIT table sizing.
- Shims before `HeadlessWrapper.lua`: `unpack`, `loadstring`, `bit` from `bit32`, `setfenv`/`getfenv`, `jit.opt`, `arg = {}` (pob-web `packages/driver/boot.lua` is the reference). C module `lua-utf8` (starwing/luautf8) linked statically and registered in `package.preload`.
- PoB v2.68 started using compound assignment (`x += 1`, `s ..= t`), which no stock Lua parses. The asset build rewrites `^(\s*)(lhs) op= (rhs)$` to `lhs = lhs op (rhs)` and fails loudly if a line it can't rewrite remains.
- Needed from a PoB release: `src/{Classes,Modules,Data,*.lua}` minus `Data/TimelessJewelData`, `src/TreeData/<ver>/{tree,sprites}.lua` per version, `runtime/lua/`. About 4.7 MB gzipped plus 0.4 MB per tree version. Timeless jewel zips (2.5 to 25 MB each) are fetched only when a build has that jewel, and need `Inflate` implemented (zlib in the wasm build).
- Account characters go through PoB's own importer: `build.importTab:ImportItemsAndSkills(get-items json)` then `ImportPassiveTreeAndJewels(get-passive-skills json)`.

**Packages:**
1. `scripts/build-lua-wasm.sh`: emsdk 6.0.6 in docker → `public/pob/lua.{mjs,wasm}` (committed, rebuilt rarely). Exposes one call: run a Lua string, return a string.
2. `scripts/build-pob.ts`: PoB tag from `pob.json` → filter, rewrite, pack as `public/pob/<tag>/*.tar.gz` (tar parsed in JS, gzip via `DecompressionStream`). Generated in CI, not committed.
3. `src/pob/engine.lua` + `src/pob/worker.ts`: boot once per worker, then `calc(xml)` or `import(items, passives)` → JSON of PoB's `CalcSections` rows (label, formatted value per output) with `Tabulate` sources resolved to names.
4. UI: a Calcs tab. Sections and rows as PoB lays them out, both sides, delta, expandable sources with one-side-only sources marked. The filter applies. A note says numbers depend on each build's PoB config (for account characters, PoB defaults).
5. CI: deploy builds the PoB assets. A daily workflow compares `pob.json` with PoB's latest release and opens a PR bumping it; the golden test (pob-b in Node: block 74/56) gates it.
6. Licence: ship PoB's `LICENSE.md` with the assets and credit PoB and pob-web in the footer and README.

Check: golden test passes in Node; in the browser, comparing the two fixtures shows block rows with sources for both sides, and the filter `block` narrows the Calcs tab.

**Status (2026-11-17): built.** Golden test passes (block 74/56, life 4355, Elegant Hubris table loads; account fixture imports). In Chromium the Calcs tab computes both fixtures in about 5 s including first download. Packs are named `.pack`, not `.pack.gz`: dev servers and some hosts add `Content-Encoding: gzip` to `.gz` files and the browser then unzips them itself. Open: jewels whose timeless table file name differs from the item name (the `Abyss*` tables) are not auto-fetched yet.

## 7. Adding Path of Exile 2 later

What the seam buys: a new `src/games/poe2/` and a second branch in `scripts/build-tree.ts`, with no change to `core/diff.ts` or the renderer.

- **Input:** PoB code or link only. There is no way to fetch another player's PoE2 character (section 8.1), so `poe2.fromAccount` stays undefined and the picker hides the account path for that game.
- **Tree:** `github.com/grindinggear/poe2-skilltree-export` (official since 2026-05; pin commit SHAs because not every version is tagged). Nodes carry baked `x`, `y`, and a top-level `edges` array carries arc centres, so conversion to `TreeData` is simpler than PoE1. Ascendancy is `ascendancyId` mapped through `classes[].ascendancies[]`. Drop the 239 unnamed placeholder nodes. Edge semantics are not documented by GGG: a non-zero `orbit` comes with an arc centre (`orbitX`, `orbitY`), an explicit `orbit: 0` is a forced straight line, and a missing `orbit` falls back to the PoE1 rule. The reference is PoB-PoE2's converter, `src/Export/Scripts/passivetree_ggg.lua`. Re-check all of this when PoE2 1.0 ships, since the tree will change.
- **Additive `Build` fields:** weapon-set passives (`<WeaponSet1 nodes>` and `<WeaponSet2 nodes>`, subsets of `nodes`) and attribute choices (`<AttributeOverride strNodes dexNodes intNodes>`; the 293 "+5 to any Attribute" nodes get their stat from the choice). Express attribute choices through the existing `nodeOverrides`.
- **Skills:** gems are not socketed in gear, so `SkillGroup.slot` is null. Supports are the other gems in the same `<Skill>`.
- **Items:** slot names add `Charm 1` to `Charm 3`; gear sockets hold runes, which arrive as `{rune}` mod lines.
- A fixture is already saved at `test/fixtures/poe2/pob-a.xml`.

The rule that keeps this cheap, enforced in review from WP0 on: nothing outside `src/games/poe1/` and `scripts/` may mention inventory ids, orbit maths, or PoE1 slot names.

## 8. Reference facts

### 8.1 How characters can be fetched

- **PoE1, public profiles: works without login.** Tested live 2026-11-17 from a residential IP:
  ```
  GET https://www.pathofexile.com/character-window/get-characters?accountName=Name%231234&realm=pc
  GET https://www.pathofexile.com/character-window/get-passive-skills?accountName=Name%231234&character=<name>&realm=pc
  GET https://www.pathofexile.com/character-window/get-items?accountName=Name%231234&character=<name>&realm=pc
  ```
  - The account must be `Name#1234` with `#` as `%23`. `Name-1234` and a bare `Name` return 403.
  - Private profile and nonexistent account both return 403 with an HTML body.
  - No `Access-Control-Allow-Origin`, so browsers cannot call these directly.
  - An empty User-Agent gets a Cloudflare block page.
  - Do not fetch the HTML profile page; it returns a JavaScript challenge.
- **Rate limits** are per IP, reported in `x-rate-limit-ip` as `hits:seconds:lockout`:
  - `get-characters` and `get-passive-skills` share `15:60:120, 90:1800:600, 180:7200:3600`.
  - `get-items`: `30:60:120, 90:1800:600, 180:7200:3600`.
  - In practice about 90 character loads per 30 minutes for the whole site. Hence the cache.
- **These endpoints are not in GGG's API reference.** GGG's developer docs say using undocumented endpoints is against the Terms of Use (section 7i). Path of Building's "Import By Account Name" uses exactly these three URLs today (`src/Classes/ImportTab.lua`). Treat lookup as something that can vanish; the PoB-code path is the durable one.
- **PoE2:** no unauthenticated route exists. `realm=poe2` is ignored by `get-characters` and returns 404 on the other two. The OAuth API (`account:characters`) reads only the logged-in account, and GGG's docs state "We are currently unable to process new applications."
- **poe.ninja:** its character endpoints would work technically, but its API page says they are "not available for third-party use" and that misbehaving clients are blocked. Do not use them.

### 8.2 PoE1 response shapes

`get-characters`: `[{ name, realm, class, league, level, lastLoginTime }]`, all leagues, no id.

`get-passive-skills`:
```json
{ "character": 2, "ascendancy": 1, "alternate_ascendancy": 0,
  "hashes": [1461, 2060], "hashes_ex": [157, 161],
  "mastery_effects": { "48660": 17942 },
  "skill_overrides": {},
  "items": [ { "inventoryId": "PassiveJewels", "x": 45, "typeLine": "Medium Cluster Jewel" } ],
  "jewel_data": { "45": { "type": "JewelPassiveTreeExpansionMedium",
                          "subgraph": { "groups": {}, "nodes": { "168": { "skill": "…", "name": "…", "stats": [] } } } } } }
```
- `hashes_ex` values are keys into the `subgraph.nodes` of the cluster jewels.
- `jewel_data` is keyed by the jewel item's `x`.
- Bandit and pantheon choices are absent from this endpoint.

`get-items`: `{ items: [...], character: { name, class, league, level } }`. Per item:
- `inventoryId` (`Weapon`, `Offhand`, `Weapon2`, `Offhand2`, `Helm`, `BodyArmour`, `Gloves`, `Boots`, `Amulet`, `Ring`, `Ring2`, `Belt`, `Flask`), `x`, `name`, `typeLine`, `baseType`, `rarity`.
- `sockets: [{ group, attr, sColour }]`; equal `group` means linked.
- `socketedItems[]`: `socket` (index into `sockets`), `support`, `typeLine`, `properties` with `{ name: "Level", values: [["20 (Max)", 0]] }` and `{ name: "Quality", values: [["+8%", 1]] }`.
- `enchantMods`: strings. `implicitMods` and `explicitMods`: `[{ description, flags?: { fractured, crafted, mutated, … } }]`. The old `craftedMods` and `fracturedMods` arrays no longer exist.

### 8.3 Path of Building code format

- URL-safe base64 of zlib-deflated XML. Root `<PathOfBuilding>` (PoE1) or `<PathOfBuilding2>` (PoE2).
- Attribute order is not stable. Many values are the literal strings `"nil"`, `"true"`, `"false"`.
- `<Build level className ascendClassName bandit …>`
- `<Tree activeSpec="N">` (1-based index) → `<Spec title treeVersion="3_30" classId ascendClassId nodes="h1,h2,…" masteryEffects="{node,effect},…" clusterHashFormatVersion="2">`
  - with `<Sockets><Socket nodeId itemId/></Sockets>` and `<Overrides><Override nodeId dn icon>stat lines</Override></Overrides>`.
  - Ids of 65536 and above in `nodes` are cluster jewel nodes.
- `<Skills activeSkillSet="id">` → `<SkillSet id>` → `<Skill slot label enabled source?>` → `<Gem nameSpec skillId gemId variantId level quality enabled>`.
- `<Items activeItemSet="id">` → `<Item id>raw text</Item>` and `<ItemSet id>` → `<Slot name itemId>`.
- Item raw text:
  ```
  Rarity: UNIQUE
  The Poet's Pen
  Somatic Wand
  Quality: 20
  Sockets: B-B-B
  LevelReq: 12
  Implicits: 1
  {variant:1}{range:0.5}(11-15)% increased Spell Damage
  +1 to Level of Socketed Skill Gems per 25 Player Levels
  ```
- Ground truth when in doubt: PoB `src/Classes/ImportTab.lua` (import and code encode/decode), `PassiveSpec.lua` (spec save and load), `Item.lua` (item text).

### 8.4 PoE1 tree data

- Repo `github.com/grindinggear/skilltree-export`, tags per patch; latest `3.30.0`. File `data.json` (6.7 MB). `ruthless.json` and `alternate.json` are not used in v1.
- `nodes` is a dict keyed by hash string, plus `"root"`. Fields: `skill, name, stats[], group, orbit, orbitIndex, out[], in[]`. Flags present only when true: `isNotable, isKeystone, isMastery, isJewelSocket, isAscendancyStart, isProxy`. Also `ascendancyName`, `classStartIndex`, `masteryEffects: [{ effect, stats[] }]`.
- 402 nodes have no `group`: cluster jewel notables and keystones, and anoint-only notables. They have names and stats but no position.
- `groups`: dict of `{ x, y, orbits, nodes }`.
- `constants.orbitRadii = [0, 82, 162, 335, 493, 662, 846]`, `constants.skillsPerOrbit = [1, 6, 16, 16, 40, 72, 72]`.
- Position: `x = group.x + r·sin(a)`, `y = group.y − r·cos(a)`, with `r = orbitRadii[orbit]` and `a` in degrees from:
  - 16-slot orbits: `0,30,45,60,90,120,135,150,180,210,225,240,270,300,315,330`
  - 40-slot orbits: `0,10,20,30,40,45,50,60,70,80,90,100,110,120,130,135,140,150,160,170,180,190,200,210,220,225,230,240,250,260,270,280,290,300,310,315,320,330,340,350`
  - any other count: `360·i/n`.
- `classes[i] = { name, ascendancies: [{ id, name }] }`; the index is the class id, 0 is Scion.
- `jewelSlots`: array of socket node ids.
- Bounds: `min_x −14159, min_y −10689, max_x 12430, max_y 10900`.
- Licence: none published. GGG permits fan use of the tree export; do not monetise, and show the non-affiliation line.

### 8.5 Build link → raw code URL

From PoB `src/Modules/BuildSiteTools.lua`. Only pob.codes sends CORS headers, so all of these go through the Worker.

| Host | Raw code URL | Checked live |
|---|---|---|
| pobb.in | `https://pobb.in/<id>/raw` | yes |
| poe.ninja | `https://poe.ninja/poe1/pob/raw/<id>` (page: `/poe1/pob/<id>`; `/pob/<id>` redirects) | yes |
| maxroll.gg | `https://maxroll.gg/poe/api/pob/<id>` | yes |
| pastebin.com | `https://pastebin.com/raw/<id>` | yes |
| pob.codes | `https://api.pob.codes/<id>/raw` (page: `pob.codes/b/<id>`) | yes |
| rentry.co | `https://rentry.co/paste/<id>/raw` | no |
| poedb.tw | `https://poedb.tw/pob/<id>/raw` | no |

### 8.6 Fixtures already in the repo

`test/fixtures/poe1/`:
- `api-get-characters.json`, `api-get-passive-skills.json`, `api-get-items.json`: one real public character, fetched 2026-11-17. It was partly unequipped at the time (six items), so fetch a fuller one if a test needs every slot.
- `pob-a.xml`: a decoded PoB build, level 16 Templar.
- `pob-b.xml`: a decoded PoB build, level 90 Witch Elementalist, tree `3_28`, eleven specs (the eighth is active), item-granted skills.

`test/fixtures/poe2/pob-a.xml`: a decoded PoB2 build, for section 7.

These are decoded XML. To test `decodePob`, deflate and base64url-encode one in the test.

## 9. Risks and open items

| Item | Owner | Detail |
|---|---|---|
| Worker reaching GGG | Resolved | WP0 spike: Cloudflare egress was already rate-limited by other tenants; the user's server is clean. Proxy runs there (decision 2). |
| Terms of Use | User | Lookup uses endpoints GGG does not sanction (section 8.1). The user chose on 2026-11-17 to carry the project forward with lookup as its core feature. Keep the Worker polite (identified User-Agent, caching, rate-limit headers honoured) so it stays within what GGG tolerates from PoB. |
| User-Agent contact | User | The Worker needs a contact string. |
| Edge-drawing rule | WP1 | Recalled, not re-read; verify against PoB. |
| Class and ascendancy ids from the API | WP3 | Off-by-one and bloodline display unverified. |
| League rollover | Maintenance | A new league means a new tag in `POE1_TAGS` and a rerun of `npm run data`. |
| API format drift | Maintenance | GGG changed the mod format in July 2026. `fromApi.ts` is the only file that should need to change. |
