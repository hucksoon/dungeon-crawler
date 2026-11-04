// dc#142: 판은 언제나 레벨 1·일반 1층부터 · 웨이포인트 없음 · 마을은 거래소·우편함·던전 입구만 · 구멍은 헬 50층을 깬 판에서 이어가기로만
//   · 속성 스킬 축복(화염구·얼음 폭발·연쇄 번개: 단계별로 커짐, dc#143부터 Lv 10 · 한 판 합쳐 20번까지) · 몬스터 배율(일반 깊이 배율 4.4, 나이트메어·헬 V2)
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
const require = createRequire(process.env.NODE_PATH + "/");
const { chromium } = require("playwright");
const REPO = process.argv[2], SHOTS = process.argv[3];
const ORIGIN = "https://hucksoon.github.io/hucksoon/";
const B = createRequire(import.meta.url)(path.join(REPO, "blessings.js"));
const M = createRequire(import.meta.url)(path.join(REPO, "monsters.js"));
const J = createRequire(import.meta.url)(path.join(REPO, "jump.js"));
const results = [];
const check = (n, ok, x = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x && !ok ? " — " + x : ""}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const HOOK = `
  window.__t = {
    s: () => ({ scene, depth, zone: player.zone, gameOver, gold: player.gold, lv: player.plvl, hp: player.hp, wp: wpSpot, bl: { ...(player.bl || {}) } }),
    st: () => { const S = stats(); return { fireball: S.fireball, fbRadius: S.fbRadius, fbRange: S.fbRange, fbEvery: S.fbEvery, nova: S.nova, novaRadius: S.novaRadius, chain: S.chain, chainStrikes: S.chainStrikes, chainMax: S.chainMax }; },
    die: () => { floorSt.ls = 1; player.hp = 0; death(); render(); },   // 버티기(dc#155)는 이미 쓴 것으로
    start: () => enterDungeon("start"),
    abyss: () => enterAbyss(),
    hell50: () => { player.zone = "hell"; depth = 50; completeHell(); },
    bless: (bl) => { player.bl = bl; updateStats(); },
    lone: (dx) => { enemies = enemies.slice(0, 1); const e = enemies[0]; e.x = player.x + dx; e.y = player.y; e.hp = e.maxHp = 1e6; e.atk = 0; visible[e.y][e.x] = true; render(); return !!e; },
    turn: () => endTurn(),
  };
  // ---- 시작 ----`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
async function open(storage) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 } }); const page = await ctx.newPage(); const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  const dialogs = [];
  page.on("dialog", d => { dialogs.push(d.message()); d.accept(); });
  await ctx.route(ORIGIN + "**", r => { const f = new URL(r.request().url()).pathname.replace("/hucksoon/", "") || "index.html";
    if (f === "ranking-config.js") return r.fulfill({ contentType: "text/javascript", body: `window.RANKING_API = "";` });
    const p = path.join(REPO, f); if (!fs.existsSync(p)) return r.fulfill({ status: 404, body: "" });
    let body = fs.readFileSync(p, "utf8"); if (f === "index.html") body = body.replace("  // ---- 시작 ----", HOOK);
    r.fulfill({ contentType: f.endsWith(".js") ? "text/javascript" : "text/html", body }); });
  await ctx.addInitScript((s) => { if (!sessionStorage.getItem("s")) { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); sessionStorage.setItem("rl_scene", s.__scene || "dungeon"); sessionStorage.setItem("s", 1); } }, storage);
  await page.goto(ORIGIN);
  await page.waitForFunction(() => window.__t);
  await sleep(200);
  return { ctx, page, errors, dialogs };
}
const save = (run, extra = {}) => JSON.stringify({ v: 1, f50: 1, best: 30, ...extra, run: { d: 10, hp: 300, mh: 300, a: 30, g: 7777, l: 12, x: 5, xn: 1297, rid: "r142", k: 0, pp: 0, ...run } });
const s = (page) => page.evaluate(() => window.__t.s());
// 새 마을·웨이포인트 없음 (rl_oldtown off), 축복 끔 (창이 막지 않게)
const BASE = { rl_oldtown: "off", rl_bless: "off", rl_autogear: "1", rl_market: "paused", rl_device_id: "r142-dev" };

try {
  // ---- 1. 규칙 (blessings.js · monsters.js · jump.js) ----
  check("element blessings: fire · ice · bolt, max Lv 10, tier elem", B.ELEM_MAX === 10 && B.ELEM_IDS.every(id => B.BLESSINGS[id]?.tier === "elem" && B.BLESSINGS[id].max === 10));
  const f1 = B.ELEM.fire(1), f4 = B.ELEM.fire(4), f5 = B.ELEM.fire(5), f8 = B.ELEM.fire(8), f10 = B.ELEM.fire(10), b1 = B.ELEM.bolt(1), b10 = B.ELEM.bolt(10);
  check("levels grow to Lv 10 with area caps (dc#153): fire radius 1 until Lv 7, 2 from Lv 8 (never 3), every 3 → 2 at Lv 5; bolt strikes 2 → 6 max, shock from Lv 4", f1.radius === 1 && f4.radius === 1 && f8.radius === 2 && B.ELEM.fire(10).radius === 2 && B.ELEM.ice(7).radius === 1 && B.ELEM.ice(10).radius === 2 && f1.every === 3 && f5.every === 2 && f10.pct > f8.pct && f8.pct > f5.pct && b1.strikes === 2 && B.ELEM.bolt(5).strikes === 6 && b10.strikes === 6 && !b1.shock && !B.ELEM.bolt(3).shock && B.ELEM.bolt(4).shock);
  check("card shows damage from the current attack (item 6)", B.cardText("fire", 1, 100).includes("50") && B.cardText("fire", 1, 200).includes("100") && !B.cardText("fire", 1).includes("지금"), B.cardText("fire", 1, 100));
  check("card text shows the level", B.cardText("fire", 3).startsWith("Lv 3:") && B.cardText("bolt", 1).includes("2번") && !B.cardText("might", 4).startsWith("Lv"), B.cardText("fire", 3));
  check("no cap (dc#168, was 20 picks): after fire 10 · bolt 10 other element cards still come", B.ELEM_CAP === undefined && Array.from({ length: 200 }, (_, i) => B.offer(`cap${i}`, { fire: 10, bolt: 10 })).some(o => o.some(id => B.ELEM_IDS.includes(id))));
  let any = 0; for (let i = 0; i < 3000; i++) if (B.offer(`w${i}`, {}).some(B.isElem)) any++;
  check(`element offers are common but not guaranteed (${Math.round(any / 30)}% of floors)`, any / 3000 > 0.45 && any / 3000 < 0.65);
  check("monsters: normal depth ramp 4.2 (dc#153), nightmare/hell v2 multipliers", M.NORMAL.ramp === 4.2 && M.V2.nightmare.hp > 1 && M.V2.hell.hp > 1 && Math.abs(M.normalMul(50) - 5.2) < 1e-9);
  const legacy = J.TOWN.doors.filter(d => d.legacy).map(d => d.id).sort().join();
  check("town: nightmare · hell · gold dungeon · waypoint doors are legacy (hidden)", legacy === "golddungeon,golddungeonNM,hell,nightmare,waypoint" && J.TOWN.buildings.filter(b => !b.legacy).map(b => b.id).join() === "market,gate", legacy);

  // ---- 2. 쓰러지면 새 판: 레벨 1·골드 0 ----
  const A = await open({ ...BASE, rl_save: save({}) });
  let a = await s(A.page);
  check("loaded run: level 12, gold 7777, floor 10, no waypoint on the floor", a.lv === 12 && a.gold === 7777 && a.depth === 10 && !a.wp, JSON.stringify(a));
  await A.page.evaluate(() => window.__t.die()); await sleep(200);
  check("death screen: says level 1 · gold 0 · no gear from floor 1 (dc#165)", (await A.page.locator("#death-modal").innerText()).includes("레벨 1·골드 0, 장비·강화석 없이 맨몸으로 일반 던전 1층부터"));
  await A.page.locator("#death-restart").click(); await sleep(300);
  a = await s(A.page);
  check("restart after death → level 1, gold 0, in the town", a.lv === 1 && a.gold === 0 && a.scene === "lobby", JSON.stringify(a));
  check("no page errors (death)", A.errors.length === 0, A.errors.join("; "));
  await A.ctx.close();

  // ---- 3. 마을 1층 문으로 새로 들어가도 레벨 1·골드 0 (확인 창) ----
  const C = await open({ ...BASE, rl_save: save({}), __scene: "lobby" });
  await C.page.evaluate(() => window.__t.start()); await sleep(400);
  const c = await s(C.page);
  check("start door with a run in progress: asks, then a fresh run (level 1, gold 0, floor 1)", C.dialogs.some(m => m.includes("레벨 1·골드 0, 장비·강화석 없이 맨몸으로 시작")) && c.lv === 1 && c.gold === 0 && c.depth === 1 && c.scene === "dungeon", JSON.stringify([c, C.dialogs]));
  // 구멍: 이어가기가 아니면 못 들어감
  await C.page.evaluate(() => window.__t.abyss()); await sleep(200);
  check("abyss can't be entered from the town (only by continuing)", (await s(C.page)).zone === "normal");
  await C.ctx.close();

  // ---- 4. 헬 50층 완료 → 구멍으로 이어가기 (레벨·축복 그대로) ----
  const H = await open({ ...BASE, rl_bless: "on", rl_save: save({ z: "hell", d: 50, bl: { might: 2 }, bz: { hell: 50 } }) });
  await H.page.evaluate(() => window.__t.hell50()); await sleep(600);
  const h = await s(H.page);
  check("hell 50 cleared → asked to continue into the Endless Pit → in the pit floor 1, level and blessings kept", H.dialogs.some(m => m.includes("끝이 없는 구멍 1층으로 바로 이어갈까요")) && h.zone === "abyss" && h.depth === 1 && h.lv === 12 && h.bl.might === 2, JSON.stringify([h, H.dialogs]));
  check("no page errors (hell → pit)", H.errors.length === 0, H.errors.join("; "));
  await H.ctx.close();

  // ---- 5. 속성 스킬 축복이 싸움에 ----
  const E = await open({ ...BASE, rl_save: save({ d: 3 }) });
  await E.page.evaluate(() => window.__t.bless({ fire: 4, bolt: 1, ice: 5 }));
  const es = await E.page.evaluate(() => window.__t.st());
  check("stats: fire Lv 4 → fireball radius 1 (dc#153) · bolt Lv 1 → 2 strikes · ice Lv 5 → radius 1", es.fireball && es.fbRadius === 1 && es.fbEvery === 3 && es.chain && es.chainStrikes === 2 && !es.chainMax && es.nova && es.novaRadius === 1, JSON.stringify(es));
  await E.page.evaluate(() => window.__t.bless({ fire: 9, bolt: 9, ice: 8 }));
  const e9 = await E.page.evaluate(() => window.__t.st());
  check("Lv 6~10 now really apply in the game (was stuck at Lv 5): fire Lv 9 → radius 2, range 4 · bolt Lv 9 → 6 strikes · ice Lv 8 → radius 2", e9.fbRadius === 2 && e9.fbRange === 4 && e9.chainStrikes === 6 && e9.novaRadius === 2, JSON.stringify(e9));
  await E.page.evaluate(() => window.__t.bless({ fire: 1 }));
  const ok = await E.page.evaluate(() => window.__t.lone(2));
  for (let i = 0; i < 4; i++) { await E.page.evaluate(() => window.__t.turn()); await sleep(60); }
  const logT = await E.page.locator("#log").innerText();
  check("fireball blessing casts in a fight (enemy 2 tiles away)", ok && logT.includes("🔥 화염구"), logT.slice(-200));
  await E.page.screenshot({ path: path.join(SHOTS, "run142-fire.png") }).catch(() => {});
  check("no page errors (element)", E.errors.length === 0, E.errors.join("; "));
  await E.ctx.close();
} catch (e) {
  console.log("ERROR", e.message);
  results.push(false);
} finally {
  await browser.close();
}
const fail = results.filter(r => !r).length;
console.log(`\n${results.length - fail} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
