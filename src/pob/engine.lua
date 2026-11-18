-- Runs Path of Building headless inside the WebAssembly Lua (src/pob/lua.wasm) and returns its Calcs tab as JSON.
-- PoB itself is unmodified. The shims make Lua 5.2 look like the LuaJIT PoB targets; reference: pob-web packages/driver/boot.lua.

package.path = "/pob/runtime/lua/?.lua;/pob/runtime/lua/?/init.lua;" .. package.path
unpack = unpack or table.unpack
loadstring = loadstring or load
bit = {
  lshift = bit32.lshift, rshift = bit32.rshift, band = bit32.band, bor = bit32.bor, bxor = bit32.bxor, bnot = bit32.bnot,
  tobit = function(v) v = v % 0x100000000; return v >= 0x80000000 and v - 0x100000000 or v end,
}
if not setfenv then
  local function envIndex(f)
    local i = 1
    repeat
      local name = debug.getupvalue(f, i)
      if name == "_ENV" then return i end
      i = i + 1
    until name == nil
  end
  getfenv = function(f) local i = envIndex(f); return i and select(2, debug.getupvalue(f, i)) or _G end
  setfenv = function(f, t)
    local i = envIndex(f)
    if i then debug.upvaluejoin(f, i, function() return t end, 1) end
    return f
  end
end
arg = {}
jit = { opt = { start = function() end, stop = function() end } }

Aris = {}
local json

local function readFile(path)
  local f = assert(io.open(path, "rb"))
  local s = f:read("*a")
  f:close()
  return s
end

function Aris.boot()
  dofile("HeadlessWrapper.lua")
  if __mainObject__.promptMsg then error("Path of Building failed to start: " .. tostring(__mainObject__.promptMsg)) end
  Inflate = ArisInflate -- real zlib for the timeless jewel tables; PoB's headless stub returns ""
  json = require("dkjson")
  return "ok"
end

local function strip(s)
  return (tostring(s or ""):gsub("%^x%x%x%x%x%x%x", ""):gsub("%^%d", ""))
end

-- Every visible Calcs-tab row, its formatted value, and the breakdown PoB shows when you hover it.
function Aris.collect()
  local tab = build.calcsTab
  tab:BuildOutput()
  local env = tab.calcsEnv
  local actor = env.player
  local breakdown = tab.controls.breakdown
  local sections = {}
  for _, sec in ipairs(tab.sectionList) do
    if tab:CheckFlag(sec) then
      for _, sub in ipairs(sec.subSection) do
        local rows = {}
        for _, row in ipairs(sub.data) do
          if row.label and tab:CheckFlag(row) then
            local cells = {}
            for _, col in ipairs(row) do
              if col.format and tab:CheckFlag(col) then
                local cell = { text = strip(formatCalcStr(col.format, actor, col)), parts = {} }
                breakdown:SetBreakdownData(col, true)
                for _, part in ipairs(breakdown.sectionList or {}) do
                  local p = { type = part.type, label = strip(part.label), lines = {}, cols = {}, rows = {} }
                  for _, l in ipairs(part.lines or {}) do p.lines[#p.lines + 1] = strip(type(l) == "table" and l[1] or l) end
                  if part.rowList and part.colList then
                    for _, c in ipairs(part.colList) do p.cols[#p.cols + 1] = strip(c.label) end
                    for _, r in ipairs(part.rowList) do
                      local vals = {}
                      for _, c in ipairs(part.colList) do vals[#vals + 1] = strip(r[c.key]) end
                      p.rows[#p.rows + 1] = vals
                    end
                  end
                  cell.parts[#cell.parts + 1] = p
                end
                cells[#cells + 1] = cell
              end
            end
            rows[#rows + 1] = { label = strip(row.label), cells = cells }
          end
        end
        if #rows > 0 then sections[#sections + 1] = { group = sec.group, label = strip(sub.label), rows = rows } end
      end
    end
  end
  breakdown:SetBreakdownData()
  local skill = actor.mainSkill
  local mainSkill = skill and skill.activeEffect and skill.activeEffect.grantedEffect and skill.activeEffect.grantedEffect.name
  return json.encode({ mainSkill = mainSkill or "", sections = sections })
end

function Aris.calcXml(path)
  loadBuildFromXML(readFile(path), "aris")
  return Aris.collect()
end

-- { items = get-items JSON, passives = get-passive-skills JSON }, fed to PoB's own importer the way its
-- "Import by account name" does (Classes/ImportTab.lua DownloadPassiveTree / DownloadItems).
function Aris.calcApi(path)
  local data = json.decode(readFile(path))
  newBuild()
  local importTab, input = build.importTab, build.configTab.input
  local passives, items = data.passives, data.items
  passives.bandit_choice = passives.bandit_choice or input.bandit
  passives.pantheon_major = passives.pantheon_major or input.pantheonMajorGod
  passives.pantheon_minor = passives.pantheon_minor or input.pantheonMinorGod
  local tree = copyTable(items.character)
  tree.passives = passives
  tree.jewels = passives.items
  importTab:ImportPassiveTreeAndJewels(tree, true)
  local gear = copyTable(items.character)
  gear.equipment = items.items
  gear.guardian = items.guardian
  importTab:ImportItemsAndSkills(gear, true, true, false)
  runCallback("OnFrame")
  return Aris.collect()
end
