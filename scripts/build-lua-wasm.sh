#!/bin/sh
# Builds src/pob/lua.{mjs,wasm}: pob-web's Lua 5.2 fork + luautf8 + scripts/lua-wasm/bridge.c, with emsdk in docker.
# Pins live in pob.json. Rerun only when a pin or bridge.c changes; the outputs are committed.
set -eu
cd "$(dirname "$0")/.."
pin() { node -p "require('./pob.json').$1"; }
LUA=$(pin lua) UTF8=$(pin luautf8) EMSDK=$(pin emsdk)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
curl -sfL "https://codeload.github.com/atty303/lua/tar.gz/$LUA" | tar xz -C "$work" && mv "$work"/lua-* "$work/lua"
curl -sfL "https://codeload.github.com/starwing/luautf8/tar.gz/refs/tags/$UTF8" | tar xz -C "$work" && mv "$work"/luautf8-* "$work/luautf8"
cp scripts/lua-wasm/bridge.c "$work/"
docker run --rm -u "$(id -u):$(id -g)" -e HOME=/tmp -v "$work:/w" -w /w "emscripten/emsdk:$EMSDK" sh -c '
  emcc -O3 -DLUA_COMPAT_ALL -Ilua -Iluautf8 \
    $(ls lua/*.c | grep -vE "/(lua|luac)\.c$") luautf8/lutf8lib.c bridge.c \
    -sUSE_ZLIB=1 -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createLua -sENVIRONMENT=web,worker,node \
    -sALLOW_MEMORY_GROWTH=1 -sSTACK_SIZE=1MB -sFORCE_FILESYSTEM=1 \
    -sEXPORTED_FUNCTIONS=_aris_run -sEXPORTED_RUNTIME_METHODS=ccall,FS \
    -o lua.mjs'
cp "$work/lua.mjs" "$work/lua.wasm" src/pob/
ls -la src/pob/lua.mjs src/pob/lua.wasm
