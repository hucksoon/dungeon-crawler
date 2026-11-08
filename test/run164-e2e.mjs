// dc#163: 축복 정리 (넓은 눈·숨 고르기·황금 손 뺌, 흡혈귀의 이빨, 완벽한 물약, 1층 축복 없음, 레벨 업 축복은 2레벨마다),
//   각성 스킬 (불의 장화·얼음 보호막·전자기장), 속성 저항 유물, 일반 던전 몬스터의 공격 속성 (불·얼음·번개·독)
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
const require = createRequire(process.env.NODE_PATH + "/");
const { chromium } = require("playwright");
const REPO = process.argv[2];
const ORIGIN = "https://hucksoon.github.io/hucksoon/";
const R = createRequire(import.meta.url), M = R(path.join(REPO, "monsters.js")), B = R(path.join(REPO, "blessings.js"));
const I = R(path.join(REPO, "items.js"));
// 방어력이 있어야 % 확인이 됨: 갑옷 하나를 낀 가방
let armor = null; for (let n = 0; !armor; n++) { const it = I.generate(`r164|${n}`, "golden", 20); if (it.slot === "chest") armor = it; }
const invJson = JSON.stringify({ bag: [], equip: { ...Object.fromEntries(I.SLOTS.map(x => [x, null])), chest: armor }, log: [], stones: 0 });
const results = [];
const check = (n, ok, x = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x && !ok ? " — " + x : ""}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const HOOK = `
  window.__t = {
    // 내 둘레 9×9를 바닥으로, 몬스터는 모두 치움
    yard: () => { enemies = []; items = []; shots = []; floorSt.ls = 1; floorSt.sc = 999;
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const x = player.x + dx, y = player.y + dy; if (map[y]?.[x] !== undefined) { map[y][x] = FLOOR; visible[y][x] = true; seen[y][x] = true; } }
      render(); },
    mon: (dx, dy, o = {}) => { const m = { ...RLMonsters.makeNormal(RLMonsters.pickType(2, () => 0.5), "normal", 2), x: player.x + dx, y: player.y + dy, hp: 10000, maxHp: 10000, atk: 50, def: 0, ranged: false, slow: 99, ...o }; enemies.push(m); return enemies.length - 1; },
    foe: (i) => { const e = enemies[i]; return e ? { hp: e.hp, maxHp: e.maxHp, x: e.x, y: e.y } : null; },
    setBl: (bl, rl = {}) => { player.bl = bl; player.rl = rl; updateStats(); },
    st: () => { const s = stats(); return { def: s.def, maxHp: s.maxHp, atk: s.atk, ls: s.lifesteal, perfect: s.perfect, eres: s.eres, aw: s.aw, potCd: player.potCd, hp: player.hp, jumpCd: player.jumpCd, burn: player.burn, poison: player.poison, ishred: player.ishred, ishredT: player.ishredT }; },
    hp: (v) => { player.hp = v; player.potCd = 0; },
    potion: () => { usePotion(); return player.hp; },
    cast: () => { const s = stats(); castAwake(s, () => enemies.filter(e => e.hp > 0)); },
    turn: () => { turn++; },
    trail: () => [...fireTrail.keys()],
    mark: (dx, dy) => trailMark(player.x + dx, player.y + dy),
    hit: (el, atk) => nelemHit(el, atk),
    world: () => worldTurn(),
    // 버티기: 화상·독이 걸린 채 쓰러질 피해 → HP 1, 화상·독 풀림
    guard: () => { player.burn = { at: turn, left: 3, dmg: 50 }; player.poison = { left: 4, dmg: 50 }; floorSt.ls = 0; gameOver = false; player.hp = 0; death(); const r = { hp: player.hp, over: gameOver, burn: !!player.burn, poison: !!player.poison }; player.hp = 500; return r; },
    // 저장했다가 다시 불러와도 독·방어력 깎임이 남음
    psave: () => { player.poison = { left: 4, dmg: 7 }; player.ishred = 10; player.ishredT = 3; saveLevel(); return JSON.parse(localStorage.getItem("rl_level")).ps; },
    spawnShare: (d, n = 4000) => { const o = depth; depth = d; const c = {}; let k = 0; for (let i = 0; i < n; i++) { const m = nelem({ kind: "normal" }); if (m.nel) { k++; c[m.nel] = (c[m.nel] || 0) + 1; } } depth = o; return { share: k / n, kinds: c }; },
    // 축복 차례: 1층 처음 오기 → 2층 처음 오기, 레벨 업 3 → 4
    blessQ: () => { player.pq = []; player.bz = {}; const o = depth; depth = 1; Bless.onFloor(); const a = player.pq.length; depth = 3; Bless.onFloor(); const b = player.pq.length; player.plvl = 3; Bless.onLevel(); const c = player.pq.length; player.plvl = 4; Bless.onLevel(); const d = player.pq.length; depth = o; player.pq = []; Bless.close(); return [a, b, c, d]; },
  };
  // ---- 시작 ----`;
const EXE = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const browser = await chromium.launch({ executablePath: EXE });
async function open(storage) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 } }); const page = await ctx.newPage(); const errors = [];
  page.on("pageerror", e => errors.push(e.message)); page.on("dialog", d => d.accept());
  await ctx.route(ORIGIN + "**", r => { const f = new URL(r.request().url()).pathname.replace("/hucksoon/", "") || "index.html";
    if (f === "ranking-config.js") return r.fulfill({ contentType: "text/javascript", body: `window.RANKING_API = "";` });
    const p = path.join(REPO, f); if (!fs.existsSync(p)) return r.fulfill({ status: 404, body: "" });
    let body = fs.readFileSync(p); if (f === "index.html") body = body.toString("utf8").replace("  // ---- 시작 ----", HOOK);
    r.fulfill({ contentType: f.endsWith(".js") ? "text/javascript" : f.endsWith(".png") ? "image/png" : f.endsWith(".webp") ? "image/webp" : "text/html", body }); });
  await ctx.addInitScript((s) => { if (!sessionStorage.getItem("s")) { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); sessionStorage.setItem("rl_scene", "dungeon"); sessionStorage.setItem("s", 1); } }, storage);
  await page.goto(ORIGIN);
  await page.waitForFunction(() => window.__t);
  await sleep(400);
  return { ctx, page, errors };
}
const save = (run = {}) => JSON.stringify({ v: 1, best: 12, run: { d: 8, hp: 1000, mh: 1000, a: 40, g: 777, l: 5, x: 0, xn: 5000, x4: 1, rid: "r164", k: 0, pp: 0, bz: { normal: 8 }, ...run } });
const T = (page, fn, ...a) => page.evaluate(([f, a]) => window.__t[f](...a), [fn, a]);
const BASE = { rl_oldtown: "off", rl_bless: "on", rl_autogear: "1", rl_market: "paused", rl_device_id: "r164-dev", rl_3d: "0", rl_live: "off", rl_tut: JSON.stringify(["intro"]), rl_tip_dodge: "1" };

try {
  // ---- 1. 규칙 (blessings.js · monsters.js) ----
  check("removed: 넓은 눈(eye) · 숨 고르기(breath) · 황금 손(coin)", !B.BLESSINGS.eye && !B.BLESSINGS.breath && !B.BLESSINGS.coin);
  check("new: 흡혈귀의 이빨 (lifesteal +2%, max 5)", B.BLESSINGS.vamp?.fx.lifesteal === 2 && B.BLESSINGS.vamp.max === 5);
  check("완벽한 물약 only after 물약 장인 is maxed (5)", B.offer("p1", { brew: 4 }).every(id => id !== "perfect") && (() => { for (let i = 0; i < 400; i++) if (B.offer(`p${i}`, { brew: 5 }).includes("perfect")) return true; return false; })());
  const awOffered = (have, id) => { for (let i = 0; i < 600; i++) if (B.offer(`a${i}`, have).includes(id)) return true; return false; };
  check("awakened skills appear only after Lv 10 of that element", !awOffered({ fire: 9 }, "fireAw") && awOffered({ fire: 10 }, "fireAw") && awOffered({ ice: 10 }, "iceAw") && awOffered({ bolt: 10 }, "boltAw") && !awOffered({ fire: 10 }, "boltAw"));
  check(`awakened names "각성 …" and Lv 10 max (${B.BLESSINGS.fireAw.name}, ${B.BLESSINGS.iceAw.name}, ${B.BLESSINGS.boltAw.name})`, ["fireAw", "iceAw", "boltAw"].every(k => B.BLESSINGS[k].name.startsWith("각성 ") && B.BLESSINGS[k].max === 10));
  const F = (lv) => B.AWAKE.field(lv);
  check(`전자기장: radius grows 1 → 4 max, longer cooldown than skills (every ${F(1).every} → ${F(10).every}), % of max HP ${F(1).pct} → ${F(10).pct}`, F(1).radius === 1 && F(10).radius === 4 && [1, 4, 7, 10].every((l, i) => F(l).radius === i + 1) && F(10).every > B.ELEM.bolt(10).every && F(10).pct > F(1).pct);
  check("resist relics: 불·얼음·번개·독", ["resFire", "resIce", "resBolt", "resPoison"].every(k => B.RELICS[k]));
  check(`monster elements: floor ${M.NORMAL_ELEM.from}+, share ${M.normalElemShare(10)} → ${M.normalElemShare(50)}, 4 kinds`, M.normalElemShare(9) === 0 && M.normalElemShare(10) > 0 && M.normalElemShare(50) > M.normalElemShare(20) && M.NORMAL_ELEM.list.join() === "fire,ice,bolt,poison");
  let any = 0; for (let i = 0; i < 3000; i++) if (B.offer(`w${i}`, {}).some(B.isElem)) any++;
  check(`element offers still common (${Math.round(any / 30)}% of floors)`, any / 3000 > 0.45 && any / 3000 < 0.65);

  const A = await open({ ...BASE, rl_save: save(), "rl_inv:g:r164-dev": invJson });
  await T(A.page, "yard");
  // ---- 2. 축복 차례 ----
  const q = await T(A.page, "blessQ");
  check(`no blessing on floor 1, one on floor 3 (dc#171: every 3 floors); level-up blessing only on even levels (${q.join(",")})`, q[0] === 0 && q[1] === 1 && q[2] === 1 && q[3] === 2, JSON.stringify(q));
  // ---- 3. 흡혈 · 완벽한 물약 ----
  await T(A.page, "setBl", { vamp: 3 });
  check("흡혈귀의 이빨 ×3 → lifesteal 6%", (await T(A.page, "st")).ls === 6);
  await T(A.page, "setBl", { brew: 5 });
  let s0 = await T(A.page, "st"); await T(A.page, "hp", 1); const h0 = await T(A.page, "potion");
  await T(A.page, "setBl", { brew: 5, perfect: 1 }); await T(A.page, "hp", 1); const h1 = await T(A.page, "potion");
  await T(A.page, "setBl", { brew: 5, perfect: 2 }); await T(A.page, "hp", 1); const h2 = await T(A.page, "potion");
  check(`완벽한 물약: brew max ${h0 - 1} → +50% ${h1 - 1} → full ${h2} (max ${s0.maxHp})`, h1 > h0 && h2 === s0.maxHp, JSON.stringify([h0, h1, h2, s0.maxHp]));
  // ---- 4. 각성 ----
  await T(A.page, "setBl", {}); const d0 = (await T(A.page, "st")).def;
  await T(A.page, "setBl", { ice: 10, iceAw: 10 }); const d1 = (await T(A.page, "st")).def;
  check(`각성 얼음 보호막 Lv 10: defense ${d0} → ${d1} (+${B.AWAKE.shield(10).defPct}%)`, d1 > d0 && Math.abs(d1 / d0 - (1 + B.AWAKE.shield(10).defPct / 100)) < 0.05, JSON.stringify([d0, d1]));
  await T(A.page, "yard"); await T(A.page, "setBl", { fire: 10, fireAw: 5 });
  await T(A.page, "mark", 2, 0); await T(A.page, "mark", 3, 0);
  const onTrail = await T(A.page, "mon", 2, 0), offTrail = await T(A.page, "mon", -3, 0);
  await T(A.page, "cast");
  const ft = [await T(A.page, "foe", onTrail), await T(A.page, "foe", offTrail)], tr = await T(A.page, "trail");
  check(`각성 불의 장화: walked tiles burn (${tr.length} tiles), a monster on the fire takes damage, one off it doesn't`, tr.length >= 2 && ft[0].hp < 10000 && ft[1].hp === 10000, JSON.stringify({ ft, tr }));
  for (let i = 0; i < 5; i++) await T(A.page, "turn");
  await T(A.page, "cast");
  check("fire goes out after a few turns", (await T(A.page, "trail")).length <= 1);
  await T(A.page, "yard"); await T(A.page, "setBl", { bolt: 10, boltAw: 10 });
  const near = await T(A.page, "mon", 3, 0), far = await T(A.page, "mon", 6, 0), boss = await T(A.page, "mon", 0, 3, { kind: "boss" });
  await T(A.page, "cast");
  const fl = [await T(A.page, "foe", near), await T(A.page, "foe", far), await T(A.page, "foe", boss)], P = B.AWAKE.field(10).pct;
  check(`각성 전자기장 Lv 10: within 4 tiles lose ${P}% max HP, boss half, outside untouched (${fl.map(f => 10000 - f.hp).join(", ")})`, 10000 - fl[0].hp >= P * 100 * 0.95 && fl[1].hp === 10000 && Math.abs((10000 - fl[2].hp) - (10000 - fl[0].hp) / 2) < 120, JSON.stringify(fl));
  // ---- 5. 몬스터 공격 속성 ----
  const sh = [await T(A.page, "spawnShare", 9), await T(A.page, "spawnShare", 30)];
  check(`spawn: none before floor 10, ~${Math.round(M.normalElemShare(30) * 100)}% at floor 30, all 4 kinds (${Math.round(sh[1].share * 100)}%)`, sh[0].share === 0 && Math.abs(sh[1].share - M.normalElemShare(30)) < 0.04 && Object.keys(sh[1].kinds).length === 4, JSON.stringify(sh));
  await T(A.page, "setBl", {}); await T(A.page, "yard"); await T(A.page, "hp", 99999);
  const dA = (await T(A.page, "st")).def;
  await T(A.page, "hit", "fire", 100); await T(A.page, "hit", "poison", 100); await T(A.page, "hit", "ice", 100);
  const jc0 = (await T(A.page, "st")).jumpCd; await T(A.page, "hit", "bolt", 100); await T(A.page, "hit", "bolt", 100);
  const e1 = await T(A.page, "st");
  check(`fire → burn (${e1.burn?.dmg} × ${e1.burn?.left})`, e1.burn?.dmg === Math.round(100 * M.NORMAL_ELEM.burn.mul));
  check(`poison → damage over turns (${e1.poison?.dmg} × ${e1.poison?.left})`, e1.poison?.dmg === Math.round(100 * M.NORMAL_ELEM.poison.mul) && e1.poison.left === M.NORMAL_ELEM.poison.ticks);
  check(`ice → defense −${e1.ishred}% (${dA} → ${e1.def})`, e1.ishred === M.NORMAL_ELEM.ice.shred && e1.def < dA);
  check(`bolt → dodge cooldown +1, not more (max ${M.NORMAL_ELEM.bolt.max})`, e1.jumpCd === jc0 + 1, JSON.stringify([jc0, e1.jumpCd]));
  const hp0 = e1.hp; await T(A.page, "world"); const e2 = await T(A.page, "st");
  check("poison ticks each turn", e2.poison.left === e1.poison.left - 1 && e2.hp < hp0);
  await T(A.page, "setBl", {}, { resPoison: 3, resFire: 3 }); await T(A.page, "hit", "poison", 1000); await T(A.page, "hit", "fire", 1000);
  const e3 = await T(A.page, "st");
  check(`resist relics (×3 = ${e3.eres.poison}%) cut the effect`, e3.eres.poison === 45 && e3.poison.dmg === Math.round(1000 * M.NORMAL_ELEM.poison.mul * 0.55), JSON.stringify(e3.poison));
  const gd = await T(A.page, "guard");
  check("버티기 (HP 1) also clears burn and poison", gd.hp === 1 && !gd.over && !gd.burn && !gd.poison, JSON.stringify(gd));
  const ps = await T(A.page, "psave");
  check("poison and defense loss are saved with the floor", ps.poison?.left === 4 && ps.poison.dmg === 7 && ps.ishred?.[0] === 10 && ps.ishred[1] === 3, JSON.stringify(ps));
  check("no page errors", A.errors.length === 0, A.errors.join("; "));
  await A.ctx.close();
} finally { await browser.close(); }
const pass = results.filter(Boolean).length;
console.log(`\n${pass} passed, ${results.length - pass} failed`);
process.exit(pass === results.length ? 0 : 1);
