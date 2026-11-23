// Client for the proxy (worker/index.ts).
// Dev falls back to the local proxy. A production build never does: a public page calling localhost makes
// browsers ask for local-network permission.
const BASE = (import.meta.env.VITE_PROXY_URL as string | undefined) || (import.meta.env.DEV ? 'http://localhost:8787' : '');

export type ApiCode = 'unreachable' | 'private_or_missing' | 'rate_limited' | 'unsupported_link' | 'not_found' | 'bad_account' | string;
export class ApiError extends Error {
  code: ApiCode; retryAfter?: number;
  constructor(code: ApiCode, retryAfter?: number) {
    super(code);
    this.code = code; this.retryAfter = retryAfter;
  }
}

async function get(path: string): Promise<Response> {
  if (!BASE) throw new ApiError('unreachable');
  let res: Response;
  try {
    res = await fetch(BASE + path);
  } catch {
    throw new ApiError('unreachable');
  }
  if (res.ok) return res;
  const body = (await res.json().catch(() => ({}))) as { error?: string; retryAfter?: number };
  throw new ApiError(body.error ?? `http_${res.status}`, body.retryAfter ?? (Number(res.headers.get('Retry-After')) || undefined));
}

export interface CharacterSummary { name: string; league: string; level: number; class: string; lastLoginTime?: number }

export const getCharacters = async (account: string) =>
  (await (await get(`/poe1/characters?account=${encodeURIComponent(account)}`)).json()) as CharacterSummary[];

export const getCharacter = async (account: string, name: string) =>
  (await (await get(`/poe1/character?account=${encodeURIComponent(account)}&name=${encodeURIComponent(name)}`)).json()) as { passives: unknown; items: unknown };

export const getCurrentLeague = async () => ((await (await get('/poe1/league')).json()) as { league: string }).league;

export const getPobCode = async (url: string) => (await get(`/pob?url=${encodeURIComponent(url)}`)).text();
