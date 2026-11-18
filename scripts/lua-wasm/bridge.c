// Host for Path of Building's Lua in WebAssembly. One Lua state; JS calls aris_run(code) and gets a string back.
#include <emscripten.h>
#include <zlib.h>
#include "lua.h"
#include "lauxlib.h"
#include "lualib.h"

int luaopen_utf8(lua_State *L);
static lua_State *L;

// Inflate(data): zlib or gzip → string, "" on error (matches PoB's headless stub on failure).
static int l_inflate(lua_State *L) {
  size_t n;
  const char *in = luaL_checklstring(L, 1, &n);
  z_stream s = {0};
  if (inflateInit2(&s, 15 + 32) != Z_OK) { lua_pushliteral(L, ""); return 1; }
  luaL_Buffer b;
  luaL_buffinit(L, &b);
  static char out[1 << 16];
  s.next_in = (Bytef *)in;
  s.avail_in = (uInt)n;
  int r;
  do {
    s.next_out = (Bytef *)out;
    s.avail_out = sizeof out;
    r = inflate(&s, Z_NO_FLUSH);
    if (r != Z_OK && r != Z_STREAM_END) { inflateEnd(&s); lua_pushliteral(L, ""); return 1; }
    luaL_addlstring(&b, out, sizeof out - s.avail_out);
  } while (r != Z_STREAM_END);
  inflateEnd(&s);
  luaL_pushresult(&b);
  return 1;
}

static int traceback(lua_State *L) {
  luaL_traceback(L, L, lua_tostring(L, 1), 1);
  return 1;
}

// Run a chunk; return its first result as a string, or "\x01" + error with traceback.
EMSCRIPTEN_KEEPALIVE const char *aris_run(const char *code) {
  if (!L) {
    L = luaL_newstate();
    luaL_openlibs(L);
    luaL_getsubtable(L, LUA_REGISTRYINDEX, "_PRELOAD");
    lua_pushcfunction(L, luaopen_utf8);
    lua_setfield(L, -2, "lua-utf8");
    lua_pop(L, 1);
    lua_register(L, "ArisInflate", l_inflate);
  }
  lua_settop(L, 0);
  lua_pushcfunction(L, traceback);
  if (luaL_loadstring(L, code) || lua_pcall(L, 0, 1, 1)) {
    lua_pushfstring(L, "\x01%s", lua_tostring(L, -1));
    return lua_tostring(L, -1);
  }
  const char *s = lua_tostring(L, -1);
  return s ? s : "";
}
