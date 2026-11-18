// The only server code: allowlisted fetch + cache + CORS. A plain fetch handler, so it runs on Bun/Deno
// directly or on Node via worker/serve.ts. Env: CONTACT (required), ORIGINS (comma list of allowed origins).
export interface Env { CONTACT: string; ORIGINS?: string }

const VERSION = '0.1.0';
const MAX_BODY = 2 * 1024 * 1024;
const MIN = 60_000;
const GGG = 'https://www.pathofexile.com/character-window';
const ACCOUNT = /^[^\s#/]{1,40}#\d{4}$/;
const ID = /^[A-Za-z0-9_-]+$/;

/** Build-link host → (page path → id, raw-code URL). From PoB src/Modules/BuildSiteTools.lua and PLAN.md 8.5. */
const BUILD_SITES: Record<string, [RegExp, (id: string) => string]> = {
  'pobb.in': [/^\/([^/]+)\/?$/, (id) => `https://pobb.in/${id}/raw`],
  'poe.ninja': [/^\/(?:poe1\/)?pob\/([^/]+)\/?$/, (id) => `https://poe.ninja/poe1/pob/raw/${id}`],
  'maxroll.gg': [/^\/poe\/pob\/([^/]+)\/?$/, (id) => `https://maxroll.gg/poe/api/pob/${id}`],
  'pastebin.com': [/^\/(?:raw\/)?([^/]+)\/?$/, (id) => `https://pastebin.com/raw/${id}`],
  'pob.codes': [/^\/b\/([^/]+)\/?$/, (id) => `https://api.pob.codes/${id}/raw`],
  'rentry.co': [/^\/([^/]+)\/?$/, (id) => `https://rentry.co/paste/${id}/raw`],
  'poedb.tw': [/^\/pob\/([^/]+)\/?$/, (id) => `https://poedb.tw/pob/${id}/raw`],
};

interface Cached { expires: number; status: number; body: string; type: string; retryAfter?: number }
// ponytail: in-memory, lost on restart (costs a few upstream hits); 300 entries ≈ tens of MB worst case.
const cache = new Map<string, Cached>();
let gggBlockedUntil = 0; // shared brake: stop calling GGG for everyone before or after its limit trips

/** Sliding window: allow `max` events per `windowMs` per key. Returns 0 (recorded) or seconds to wait. */
function limiter(max: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return (key: string): number => {
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((t) => t > now - windowMs);
    hits.delete(key);
    hits.set(key, recent);
    if (recent.length >= max) return Math.ceil((recent[0]! + windowMs - now) / 1000);
    recent.push(now);
    if (hits.size > 10_000) hits.delete(hits.keys().next().value!); // forget the stalest client
    return 0;
  };
}
// Per client IP. Cache hits only count toward `requests`; anything that reaches GGG or a build site
// also counts toward `lookups` (a character load is one lookup, two GGG calls).
const requests = limiter(60, MIN);
const lookupsPerMin = limiter(6, MIN);
const lookupsPerHour = limiter(40, 60 * MIN);

class HttpError extends Error {
  status: number; code: string; retryAfter?: number;
  constructor(status: number, code: string, retryAfter?: number) {
    super(code);
    this.status = status; this.code = code; this.retryAfter = retryAfter;
  }
}

export default {
  /** `ip` is the client address as the runtime adapter sees it (see serve.ts); unknown callers share one bucket. */
  async fetch(req: Request, env: Env, ip = 'unknown'): Promise<Response> {
    const origin = req.headers.get('Origin') ?? '';
    const allowed = (env.ORIGINS ?? 'http://localhost:5173').split(',').map((s) => s.trim());
    const cors: Record<string, string> = allowed.includes(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : { Vary: 'Origin' };
    if (req.method !== 'GET') return json({ error: 'method_not_allowed' }, 405, cors);
    if (!env.CONTACT) return json({ error: 'misconfigured' }, 500, cors); // GGG wants a contact in the User-Agent
    const url = new URL(req.url);
    try {
      const wait = requests(ip);
      if (wait) throw new HttpError(429, 'too_many_requests', wait);
      const hit = await route(url, env, ip);
      const headers: Record<string, string> = { ...cors, 'Content-Type': hit.type, 'Cache-Control': 'no-store' };
      if (hit.retryAfter) headers['Retry-After'] = String(hit.retryAfter);
      return new Response(hit.body, { status: hit.status, headers });
    } catch (e) {
      if (!(e instanceof HttpError)) { console.error(e); return json({ error: 'upstream_error' }, 502, cors); }
      const h = e.retryAfter ? { ...cors, 'Retry-After': String(e.retryAfter) } : cors;
      return json({ error: e.code, ...(e.retryAfter ? { retryAfter: e.retryAfter } : {}) }, e.status, h);
    }
  },
};

async function route(url: URL, env: Env, ip: string): Promise<Cached> {
  const q = url.searchParams;
  if (url.pathname === '/poe1/characters') {
    const account = validAccount(q.get('account'));
    return cached(`chars|${account}`, 10 * MIN, ip, async () => ({ body: await ggg('get-characters', account, null, env), type: 'application/json' }));
  }
  if (url.pathname === '/poe1/character') {
    const account = validAccount(q.get('account'));
    const name = q.get('name') ?? '';
    if (!name || name.length > 64) throw new HttpError(400, 'bad_name');
    return cached(`char|${account}|${name}`, 10 * MIN, ip, async () => {
      const passives = await ggg('get-passive-skills', account, name, env);
      const items = await ggg('get-items', account, name, env);
      return { body: `{"passives":${passives},"items":${items}}`, type: 'application/json' };
    });
  }
  if (url.pathname === '/pob') {
    const upstream = buildSiteUrl(q.get('url'));
    if (!upstream) throw new HttpError(400, 'unsupported_link');
    return cached(`pob|${upstream}`, 24 * 60 * MIN, ip, async () => {
      const res = await fetch(upstream, { headers: { 'User-Agent': ua(env) } });
      if (!res.ok) throw new HttpError(res.status === 404 ? 404 : 502, res.status === 404 ? 'not_found' : 'upstream_error');
      return { body: (await readCapped(res)).trim(), type: 'text/plain; charset=utf-8' };
    });
  }
  throw new HttpError(404, 'not_found');
}

export function buildSiteUrl(raw: string | null): string | null {
  let u: URL;
  try { u = new URL(raw ?? ''); } catch { return null; }
  const site = BUILD_SITES[u.hostname.replace(/^www\./, '')];
  const id = site && u.pathname.match(site[0])?.[1];
  return site && id && ID.test(id) ? site[1](id) : null;
}

function validAccount(a: string | null): string {
  if (!a || !ACCOUNT.test(a)) throw new HttpError(400, 'bad_account');
  return a;
}

const ua = (env: Env) => `aris/${VERSION} (contact: ${env.CONTACT})`;

async function ggg(endpoint: string, account: string, character: string | null, env: Env): Promise<string> {
  const wait = Math.ceil((gggBlockedUntil - Date.now()) / 1000);
  if (wait > 0) throw new HttpError(429, 'rate_limited', wait);
  const params = `accountName=${encodeURIComponent(account)}${character === null ? '' : `&character=${encodeURIComponent(character)}`}&realm=pc`;
  const res = await fetch(`${GGG}/${endpoint}?${params}`, { headers: { 'User-Agent': ua(env), Accept: 'application/json' } });
  brake(res);
  if (res.status === 429) {
    const retry = Number(res.headers.get('Retry-After')) || 60;
    gggBlockedUntil = Date.now() + retry * 1000;
    throw new HttpError(429, 'rate_limited', retry);
  }
  // GGG answers private and nonexistent accounts with the same 403 HTML page.
  if (res.status === 403 || res.status === 404) throw new HttpError(404, 'private_or_missing');
  if (!res.ok) throw new HttpError(502, 'upstream_error');
  const body = await readCapped(res);
  if (body.trim() === 'false') throw new HttpError(404, 'private_or_missing');
  return body;
}

/** Stop one call short of any GGG window (`x-rate-limit-ip` "max:period:lockout", state "hits:period:…"). */
function brake(res: Response) {
  const state = res.headers.get('x-rate-limit-ip-state')?.split(',') ?? [];
  res.headers.get('x-rate-limit-ip')?.split(',').forEach((rule, i) => {
    const [max, period] = rule.split(':').map(Number);
    const hits = Number(state[i]?.split(':')[0]);
    if (max && period && hits >= max - 1) gggBlockedUntil = Math.max(gggBlockedUntil, Date.now() + period * 1000);
  });
}

async function readCapped(res: Response): Promise<string> {
  const reader = res.body!.getReader(), decoder = new TextDecoder();
  let size = 0, text = '';
  for (let r = await reader.read(); !r.done; r = await reader.read()) {
    size += r.value.byteLength;
    if (size > MAX_BODY) { await reader.cancel(); throw new HttpError(502, 'too_large'); }
    text += decoder.decode(r.value, { stream: true });
  }
  return text + decoder.decode();
}

/** Cache successes for `ttl`, private/missing for 60 s; never cache rate limits or server errors. */
async function cached(key: string, ttl: number, ip: string, load: () => Promise<{ body: string; type: string }>): Promise<Cached> {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expires > now) return hit;
  const wait = lookupsPerMin(ip) || lookupsPerHour(ip);
  if (wait) throw new HttpError(429, 'too_many_requests', wait);
  let entry: Cached;
  try {
    entry = { expires: now + ttl, status: 200, ...(await load()) };
  } catch (e) {
    if (!(e instanceof HttpError) || e.code !== 'private_or_missing') throw e;
    entry = { expires: now + MIN, status: 404, body: '{"error":"private_or_missing"}', type: 'application/json' };
  }
  cache.delete(key);
  cache.set(key, entry);
  for (const [k, v] of cache) if (cache.size > 300 || v.expires <= now) cache.delete(k); else break;
  return entry;
}

const json = (body: unknown, status: number, headers: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } });
