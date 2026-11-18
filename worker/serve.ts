// Node adapter for the proxy: `CONTACT=... ORIGINS=https://you.github.io PORT=8787 node worker/serve.ts`.
// Behind a reverse proxy set TRUST_PROXY=1 so per-client limits use the address it appends to X-Forwarded-For.
// Bun/Deno can serve worker/index.ts's fetch handler directly instead.
import { createServer } from 'node:http';
import handler, { type Env } from './index.ts';

const env: Env = { CONTACT: process.env.CONTACT ?? '', ORIGINS: process.env.ORIGINS };
const trustProxy = process.env.TRUST_PROXY === '1';
if (!env.CONTACT) throw new Error('Set CONTACT (goes into the User-Agent GGG sees)');

createServer(async (req, res) => {
  const r = await handler.fetch(
    new Request(`http://localhost${req.url}`, { method: req.method, headers: { Origin: req.headers.origin ?? '' } }), env,
    // Rightmost entry is the one our own reverse proxy added; anything left of it is client-supplied.
    (trustProxy && String(req.headers['x-forwarded-for'] ?? '').split(',').pop()?.trim()) || req.socket.remoteAddress || 'unknown');
  res.writeHead(r.status, Object.fromEntries(r.headers));
  res.end(await r.text());
}).listen(Number(process.env.PORT ?? 8787), process.env.HOST ?? '127.0.0.1');
