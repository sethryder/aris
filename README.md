# Aris

Compare two Path of Exile characters: passive tree, masteries, gems and items. See `PLAN.md` for the design.

## Develop

```sh
npm install
npm run dev                                  # site on http://localhost:5173
npm run proxy                                # proxy on http://127.0.0.1:8787, reads CONTACT from .env (only needed for account names and build links)
npm run typecheck && npm test
npm run data                                 # regenerate public/data/poe1/ after adding a tag to POE1_TAGS
npm run pob                                  # build public/pob/<tag>/ (Path of Building engine assets) from the tag in pob.json
./scripts/build-lua-wasm.sh                  # rebuild src/pob/lua.{mjs,wasm} (needs docker); only when pob.json's lua/emsdk pins or bridge.c change
```

`npm test` includes a golden test of the PoB engine; it is skipped until `npm run pob` has been run.

## Path of Building engine

The Calcs tab runs [Path of Building](https://github.com/PathOfBuildingCommunity/PathOfBuilding) (MIT) unmodified, in a Web Worker, on [pob-web](https://github.com/atty303/pob-web)'s Lua 5.2 fork compiled to WebAssembly. `pob.json` pins the PoB release, the Lua fork commit, luautf8 and emsdk. `.github/workflows/pob-update.yml` checks for new PoB releases daily and opens a pull request when the engine still passes the tests on it. PoB's licence ships with the assets as `pob/<tag>/LICENSE.md`.

## Deploy

**Site:** GitHub Pages via `.github/workflows/deploy.yml` on every push to `main`. Set the repo variable `PROXY_URL` to the proxy's public URL, and set Pages to deploy from GitHub Actions.

**Proxy:** `worker/index.ts` is a plain `fetch` handler, served on Node by `worker/serve.ts`. Put it behind your reverse proxy for TLS. Environment:

| Variable | Meaning |
|---|---|
| `CONTACT` | Required. Goes into the User-Agent GGG sees: `aris/<version> (contact: …)`. |
| `ORIGINS` | Comma-separated allowed origins, e.g. `https://you.github.io`. Defaults to `http://localhost:5173`. |
| `PORT`, `HOST` | Listen address. Default `127.0.0.1:8787`. |
| `TRUST_PROXY` | Set to `1` behind a reverse proxy, so per-client limits use the rightmost `X-Forwarded-For` address. Without it every visitor looks like the reverse proxy and shares one bucket. |

Limits per client IP: 60 requests a minute, and 6 lookups a minute or 40 an hour that reach GGG or a build site (cache hits are free). Across everyone, the proxy stops calling GGG one call short of any window in GGG's `x-rate-limit-ip-state`.

Bun or Deno can serve the handler directly, passing the client address: `Deno.serve((req, info) => handler.fetch(req, env, info.remoteAddr.hostname))`.

This product isn't affiliated with or endorsed by Grinding Gear Games in any way.
