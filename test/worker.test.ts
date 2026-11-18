import { afterEach, expect, test, vi } from 'vitest';
import handler, { buildSiteUrl } from '../worker/index.ts';

const env = { CONTACT: 'test', ORIGINS: 'https://example.github.io' };
const get = (path: string, origin = 'https://example.github.io') => handler.fetch(new Request(`http://x${path}`, { headers: { Origin: origin } }), env);
afterEach(() => vi.unstubAllGlobals());

test('build links map to raw URLs; anything else is refused', () => {
  expect(buildSiteUrl('https://pobb.in/AbC_d-1')).toBe('https://pobb.in/AbC_d-1/raw');
  expect(buildSiteUrl('https://poe.ninja/poe1/pob/1a2b')).toBe('https://poe.ninja/poe1/pob/raw/1a2b');
  expect(buildSiteUrl('https://poe.ninja/pob/1a2b')).toBe('https://poe.ninja/poe1/pob/raw/1a2b');
  expect(buildSiteUrl('https://pob.codes/b/xyz')).toBe('https://api.pob.codes/xyz/raw');
  expect(buildSiteUrl('https://maxroll.gg/poe/pob/abc')).toBe('https://maxroll.gg/poe/api/pob/abc');
  expect(buildSiteUrl('https://pastebin.com/abc')).toBe('https://pastebin.com/raw/abc');
  expect(buildSiteUrl('https://example.com/x')).toBeNull();
  expect(buildSiteUrl('https://pobb.in/a%2F..%2Fx')).toBeNull();
  expect(buildSiteUrl('https://pobb.in.evil.com/abc')).toBeNull();
  expect(buildSiteUrl('not a url')).toBeNull();
});

test('validation, CORS and GGG error mapping', async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  expect((await get('/pob?url=https://example.com/x')).status).toBe(400);
  expect((await get('/poe1/characters?account=Name-1234')).status).toBe(400);
  expect((await get('/poe1/characters?account=http://evil#1234')).status).toBe(400);
  expect(fetchMock).not.toHaveBeenCalled();

  fetchMock.mockResolvedValueOnce(new Response('<html>', { status: 403 }));
  const r = await get('/poe1/characters?account=Priv%231234');
  expect(r.status).toBe(404);
  expect(await r.json()).toEqual({ error: 'private_or_missing' });
  expect(r.headers.get('Access-Control-Allow-Origin')).toBe('https://example.github.io');
  expect(String(fetchMock.mock.calls[0]![0])).toBe('https://www.pathofexile.com/character-window/get-characters?accountName=Priv%231234&realm=pc');
  expect(fetchMock.mock.calls[0]![1].headers['User-Agent']).toBe('aris/0.1.0 (contact: test)');
  await get('/poe1/characters?account=Priv%231234'); // cached 403
  expect(fetchMock).toHaveBeenCalledTimes(1);

  fetchMock.mockResolvedValueOnce(new Response('[]', { status: 200 }));
  const other = await get('/poe1/characters?account=Pub%231234', 'https://evil.example');
  expect(other.status).toBe(200);
  expect(other.headers.get('Access-Control-Allow-Origin')).toBeNull();

  fetchMock.mockResolvedValueOnce(new Response('', { status: 429, headers: { 'Retry-After': '120' } }));
  const limited = await get('/poe1/character?account=Pub%231234&name=Bob');
  expect(limited.status).toBe(429);
  expect(limited.headers.get('Retry-After')).toBe('120');
  expect(await limited.json()).toEqual({ error: 'rate_limited', retryAfter: 120 });
  // While locked out, don't touch GGG at all.
  expect((await get('/poe1/characters?account=New%231234')).status).toBe(429);
  expect(fetchMock).toHaveBeenCalledTimes(3);
});

test('per-client lookup limit: the 7th uncached lookup in a minute is refused, other clients are not', async () => {
  vi.setSystemTime(Date.now() + 3 * 3600_000); // clear any GGG brake from earlier tests
  const fetchMock = vi.fn(async () => new Response('code'));
  vi.stubGlobal('fetch', fetchMock);
  const pob = (id: string, ip: string) => handler.fetch(new Request(`http://x/pob?url=https://pobb.in/${id}`), env, ip);
  for (let i = 0; i < 6; i++) expect((await pob(`limit${i}`, '1.1.1.1')).status).toBe(200);
  const r = await pob('limit6', '1.1.1.1');
  expect(r.status).toBe(429);
  expect((await r.json()).error).toBe('too_many_requests');
  expect((await pob('limit0', '1.1.1.1')).status).toBe(200); // cached: free
  expect((await pob('limit6', '2.2.2.2')).status).toBe(200);
  expect(fetchMock).toHaveBeenCalledTimes(7);
  vi.useRealTimers();
});

test('GGG brake: one call short of a window, stop calling GGG for everyone', async () => {
  vi.setSystemTime(Date.now() + 6 * 3600_000);
  const fetchMock = vi.fn(async () => new Response('[]', { headers: { 'x-rate-limit-ip': '15:60:120,90:1800:600', 'x-rate-limit-ip-state': '14:60:0,20:1800:0' } }));
  vi.stubGlobal('fetch', fetchMock);
  expect((await handler.fetch(new Request('http://x/poe1/characters?account=Brake%231234'), env, '3.3.3.3')).status).toBe(200);
  const r = await handler.fetch(new Request('http://x/poe1/characters?account=Other%231234'), env, '4.4.4.4');
  expect(r.status).toBe(429);
  expect(Number(r.headers.get('Retry-After'))).toBeGreaterThan(50);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  vi.useRealTimers();
});

test('Cloudflare 403 is an outage, not a private profile; brake refusals cost no lookup quota', async () => {
  let now = Date.now() + 9 * 3600_000;
  vi.setSystemTime(now);
  const fetchMock = vi.fn(async () => new Response('<html>challenge</html>', { status: 403, headers: { 'cf-mitigated': 'challenge' } }));
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const chars = (acct: string) => handler.fetch(new Request(`http://x/poe1/characters?account=${acct}%231234`), env, '5.5.5.5');
  const r = await chars('Cf');
  expect(r.status).toBe(429);
  expect((await r.json()).error).toBe('rate_limited');
  for (let i = 0; i < 8; i++) expect((await (await chars(`Cf${i}`)).json()).error).toBe('rate_limited');
  expect(fetchMock).toHaveBeenCalledTimes(1);
  // Brake lifts: the 8 refused retries must not have used up this client's 6/min.
  vi.setSystemTime(now += 6 * 60_000);
  fetchMock.mockImplementation(async () => new Response('[]'));
  expect((await chars('Cf')).status).toBe(200);
  vi.useRealTimers();
});

test('concurrent misses for one key share a single upstream call', async () => {
  vi.setSystemTime(Date.now() + 12 * 3600_000);
  const fetchMock = vi.fn(async () => new Response('code'));
  vi.stubGlobal('fetch', fetchMock);
  const pob = (ip: string) => handler.fetch(new Request('http://x/pob?url=https://pobb.in/shared1'), env, ip);
  const rs = await Promise.all(['6.6.6.1', '6.6.6.2', '6.6.6.3'].map(pob));
  expect(rs.map((r) => r.status)).toEqual([200, 200, 200]);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  vi.useRealTimers();
});
