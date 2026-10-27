// 헬 던전 1단계: 규칙(몬스터 속성 저항·지옥의 아이템·지옥 강화석), 로비 헬 건물(맨 위)·입장 조건·층 고르기, 헬 몬스터·드롭·층 보상·완료, 내 저항 −10%, 서버(헬 시드·랭킹)
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import fs from "node:fs"; import path from "node:path";
import { goDoor } from "./town.mjs";   // 마을(옆에서 보는 로비) 문까지 걸어가 ↑
const require = createRequire(process.env.NODE_PATH + "/");
const { chromium } = require("playwright");
const REPO = process.argv[2], OUT = process.argv[3];
const I = createRequire(import.meta.url)(path.join(REPO, "items.js"));
// 서버는 아이템 값만 보냄 (dc#97): 참조로 다시 만든 이름 (서버가 이름 글자를 보내면 실패)
const nameOf = (v) => (v?.ref && !("name" in v) ? I.itemName(I.fromRef(v.ref, { gems: true })) : null);
const M = createRequire(import.meta.url)(path.join(REPO, "monsters.js"));
const ORIGIN = "https://game.apacimtest.com/", API = "https://api.test/api.php";
const results = []; const check = (n, ok, x = "") => { results.push(!!ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x && !ok ? " — " + x : ""}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const DIR = path.dirname(new URL(import.meta.url).pathname) + "/php";
const DB = path.join(DIR, "hell.sqlite"); for (const f of [DB, DB + "-wal", DB + "-shm"]) fs.rmSync(f, { force: true });
const CFG = path.join(DIR, "config.hell.php");
fs.writeFileSync(CFG, `<?php\n$c = require __DIR__ . '/config.test.php';\nreturn array_merge($c, ['db_dsn' => 'sqlite:${DB}']);\n`);
const php = spawn("php", ["-S", "127.0.0.1:8121", "-t", path.join(REPO, "ranking-php")], { env: { ...process.env, RANKING_CONFIG: CFG, TEST_JWT_SECRET: "hell" }, stdio: ["ignore", "ignore", "pipe"] });
let phpErr = ""; php.stderr.on("data", d => phpErr += d);
await sleep(700);

// ---- 규칙 ----
const H = M.HELL;
check("HELL: 50 floors, item level 126~175, player resist −70 from the gear total (dc#54), milestones 10~50", H.floors === 50 && H.itemBase === 125 && M.ELEMENTS.zonePenalty.hell === 70 && M.playerRes(150, 75, "hell") === 75 && M.playerRes(100, 75, "hell") === 30 && H.milestones.join() === "10,20,30,40,50");
// dc#54: 나이트메어·헬 몬스터 방어력이 공격력 층 배율로 (전에는 40 근처), 일반 던전은 그대로
const demon = M.MONSTERS.find(m => m.id === "demon");
const dN1 = M.makeNightmare(demon, "normal", 1).def, dN50 = M.makeNightmare(demon, "normal", 50).def, dH50 = M.makeHell(demon, "normal", 50, "fire").def, dD75 = M.makeMonster(demon, "normal", 75).def;
check("monster defense scales in nightmare/hell (normal 75 unchanged)", dD75 < 50 && dN1 > dD75 && dN50 > 400 && dH50 > 900 && M.NIGHTMARE.def === 1.8 && M.NIGHTMARE.hp === 2.4 && M.NIGHTMARE.atk === 0.98, JSON.stringify([dD75, dN1, dN50, dH50]));
check("nightmare resist −40 from the gear total", M.playerRes(115, 75, "nightmare") === 75 && M.playerRes(89, 75, "nightmare") === 49 && M.playerRes(50, 75, "normal") === 50);
check("hell monster resist: own 50%, others 10% (floor 1) → 40% (floor 50), boss +10", JSON.stringify(M.hellRes(1, "fire")) === '{"fire":50,"ice":10,"bolt":10}' && JSON.stringify(M.hellRes(50, "ice")) === '{"fire":40,"ice":50,"bolt":40}' && M.hellRes(25, "bolt", true).bolt === 60);
const hb = M.makeHellBoss(10, "fire"), hm = M.makeHell(M.pickNightmareType(Math.random), "normal", 30, "ice");
check("hell monsters: 지옥의 names, element + resist, stronger with depth", hb.name.startsWith("지옥의 불꽃") && hb.hell === 1 && hb.res.fire === 60 && hm.name.startsWith("지옥의 서리") && M.makeHell(M.MONSTERS.at(-1), "normal", 50, "fire").hp > M.makeHell(M.MONSTERS.at(-1), "normal", 1, "fire").hp);
const hi = I.generate("hx|j10|k3", "boss", 135), ni = I.generate("hx|n10|k3", "boss", 85);
check("hell item: 지옥의 name, tier hell, ×5 power, 지옥 강화석, element lines", I.itemName(hi).includes("지옥의") && I.itemTier(hi) === "hell" && I.isHellItem(hi) && !I.isNightmareItem(hi) && I.stoneKey(hi) === "hellStones" && I.STONE_NAMES.hellStones === "지옥 강화석" && I.nmPower(hi, "atk") === 5 && I.nmPower(ni, "atk") === 3);
check("hell costs ×4 (enhance stones, price), sell gold ×5", I.enhanceCost(3, hi) === 12 && I.shopPrice(hi) === I.shopPrice({ ...hi, seed: "x|d1|k1" }) * 4);
check("lobby hour shop seeds (|h123456|) are not hell items", !I.isHellItem(I.generate("lobby|abcdef12|h123456|s0", "golden", 70)));
const findC = (pre, pred) => { for (let i = 0; i < 3000000; i++) { const it = I.generate(`${pre}|k${i}`, "boss", 150); if (it.rarity === "common" && pred(it)) return it; } };
const hellBase = findC("hc|j25", it => it.slot === "chest" && I.socketCount(it) === 4);
check("hell common runeword base is highlighted (tier hell)", I.runewordHighlight(hellBase) && I.runewordStats({ ...hellBase, gems: [9, 13, 4, 8].map(k => ["rune", k]) }).atkPct === 35);

// ---- 게임 ----
const MAP_W = 32, MAP_H = 24;
const map = Array.from({ length: MAP_H }, (_, y) => Array.from({ length: MAP_W }, (_, x) => (x === 0 || y === 0 || x === MAP_W - 1 || y === MAP_H - 1 ? 0 : 1)));
const lv = (d, rid, z, enemies = [], extra = {}) => { const mm = map.map(r => r.slice()); mm[10][11] = 2; return JSON.stringify({ rid, d, z, turn: 0, map: mm.map(r => r.join("")).join(""), seen: "1".repeat(MAP_W * MAP_H), px: 10, py: 10, shop: null, enemies, items: [], ...extra }); };
const save = (d, rid, extra = {}, run = {}) => JSON.stringify({ v: 1, f50: 1, season: 4, best: 50, clr: 1, nb: 50, nclr: 1, ...extra, run: { d, hp: 9e6, mh: 9e6, a: 30, g: 500, l: 40, x: 0, xn: 1e12, rid, k: 0, pp: 0, ...run } });
const v4 = I.generate("hlv4|shop|d70|s1", "golden", 70);
const eqOf = (...its) => { const e = Object.fromEntries(I.SLOTS.map(s => [s, null])); for (const it of its) e[it.slot] = it; return e; };
const inv = (...eq) => JSON.stringify({ bag: [], equip: eqOf(...eq), log: [], stones: 0 });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
async function open(dev, seed, api = false) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 1000 } }); const page = await ctx.newPage(); const errors = [];
  page.on("pageerror", e => errors.push(e.message)); page.on("dialog", d => d.accept());
  await ctx.route(ORIGIN + "**", r => { const f = new URL(r.request().url()).pathname.slice(1) || "index.html";
    if (f === "ranking-config.js") return r.fulfill({ contentType: "text/javascript", body: `window.RANKING_API = "${api ? API : ""}";` });
    const p = path.join(REPO, f); if (!fs.existsSync(p)) return r.fulfill({ status: 404, body: "" });
    r.fulfill({ contentType: f.endsWith(".js") ? "text/javascript" : "text/html", body: fs.readFileSync(p) }); });
  await ctx.route("https://api.test/**", async r => { const req = r.request(), u = new URL(req.url());
    const res = await fetch(`http://127.0.0.1:8121/api.php${u.search}`, { method: req.method(), headers: { ...req.headers(), origin: ORIGIN.slice(0, -1) }, body: req.method() === "GET" ? undefined : req.postData() });
    r.fulfill({ status: res.status, headers: { "content-type": "application/json", "access-control-allow-origin": "*" }, body: await res.text() }); });
  await ctx.route("https://login.xsolla.com/**", r => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await ctx.addInitScript(([seed, dev]) => { if (sessionStorage.getItem("seeded")) return; sessionStorage.setItem("seeded", 1); sessionStorage.setItem("rl_scene", "dungeon");
    localStorage.setItem("rl_device_id", dev); for (const k of ["rl_notice_v4", "rl_notice_75", "rl_notice_1021g", "rl_notice_1021h", "rl_notice_1021i", "rl_notice_1021j", "rl_notice_1022a", "rl_notice_1022b", "rl_notice_1023a", "rl_notice_1023b", "rl_notice_1023c", "rl_notice_1023d", "rl_notice_1025a"]) localStorage.setItem(`${k}:g:${dev}`, "1");
    for (const [k, v] of Object.entries(seed)) localStorage.setItem(k.replace("DEV", dev), v);
    window.__log = []; document.addEventListener("DOMContentLoaded", () => new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => window.__log.push(n.textContent)))).observe(document.getElementById("log"), { childList: true })); }, [seed, dev]);
  await page.goto(ORIGIN); await sleep(450);
  return { ctx, page, errors };
}
const logs = (page) => page.evaluate(() => window.__log.join("\n"));
const stored = (page, k) => page.evaluate(k => JSON.parse(localStorage.getItem(k) || "null"), k);
const press = async (page, k, n = 1) => { for (let i = 0; i < n; i++) { await page.keyboard.press(k); await sleep(30); } };
const inLobby = (page) => page.evaluate(() => document.body.classList.contains("in-lobby"));
async function portalOut(page) {
  await page.keyboard.press("p"); await sleep(150);
  const L = await page.evaluate(() => JSON.parse(localStorage.getItem("rl_level")));
  if (L?.tp) await page.keyboard.press(L.tp.x > L.px ? "ArrowRight" : L.tp.x < L.px ? "ArrowLeft" : L.tp.y > L.py ? "ArrowDown" : "ArrowUp"); await sleep(200);
}
// 포탈로 마을에 나와서 헬 문(dx 1) / 층 고르기 문(dx 5)까지 걸어가 ↑
async function walkToHell(page, dx = 1) { await portalOut(page); await goDoor(page, dx === 5 ? "hellPick" : "hell"); await sleep(100); }
try {
  // 1. 나이트메어 미완료: 닫힘 (로비 화면도 찍음)
  let { ctx, page, errors } = await open("helltest-a", { rl_save: save(30, "hlA", { nclr: 0 }, {}), rl_level: lv(30, "hlA", "normal"), "rl_inv:g:DEV": inv(v4) });
  await walkToHell(page);
  check("hell closed before clearing nightmare", await inLobby(page) && (await logs(page)).includes("헬 던전은 나이트메어 50층을 완료해야"), await logs(page));
  await page.screenshot({ path: `${OUT}/hell-lobby-closed.png` });
  await ctx.close();
  // 2. 완료자: 로비 화면 → 헬 1층
  ({ ctx, page, errors } = await open("helltest-b", { rl_save: save(30, "hlB"), rl_level: lv(30, "hlB", "normal"), "rl_inv:g:DEV": inv(v4) }));
  await portalOut(page); await sleep(300);
  await page.screenshot({ path: `${OUT}/hell-lobby.png` });
  await goDoor(page, "hell"); await sleep(100);
  let S = await stored(page, "rl_save"), L = await stored(page, "rl_level");
  check("enter hell floor 1: zone 헬, save z:hell, hb 1", !(await inLobby(page)) && (await page.locator("#zone").innerText()).includes("헬") && S.run.z === "hell" && S.run.d === 1 && S.hb === 1, JSON.stringify(S.run));
  check("hell monsters: 지옥의 + resist on every monster", L.enemies.length >= 15 && L.enemies.every(e => e.name.startsWith("지옥의") && e.res && e.el), JSON.stringify(L.enemies.slice(0, 2).map(e => [e.name, e.res])));
  await press(page, "Escape"); await press(page, "i"); await sleep(150);
  check("player resist −70 from the gear total in hell (stats tab, dc#54)", (await page.locator("#inv-summary").textContent()).includes("속성 저항: 불 -70%") && (await page.locator("#inv-summary").textContent()).includes("장비 합 0/0/0% − 70 (헬)"), await page.locator("#inv-summary").textContent());
  check("no page errors (enter)", errors.length === 0, errors.join("; "));
  await ctx.close();
  // 3. 헬 5층 보스: 지옥의 아이템 2개 (레벨 130, 시드 j5)
  const boss = { x: 11, y: 10, ...M.makeHellBoss(5, "fire"), hp: 1 };
  ({ ctx, page, errors } = await open("helltest-c", { rl_save: save(5, "hlC", { hb: 5 }, { z: "hell" }), rl_level: lv(5, "hlC", "hell", [boss]), "rl_inv:g:DEV": inv(v4) }));
  await press(page, "ArrowRight"); await sleep(250);
  L = await stored(page, "rl_level");
  const drops = L.items.filter(i => i.type === "gear");
  check("hell boss drops 지옥의 items, level 130, seed j5", drops.length === 2 && drops.every(d => d.item.lvl === 130 && /\|j5\|k\d+$/.test(d.item.seed) && I.itemName(d.item).includes("지옥의")), JSON.stringify(drops.map(d => [d.item.lvl, d.item.seed])));
  // 계단: 6층, 층 보상 골드
  const g0 = (await stored(page, "rl_save")).run.g;
  await press(page, "ArrowRight"); await sleep(300);
  S = await stored(page, "rl_save");
  check("hell stairs: floor 6, hb 6, floor reward gold", S.run.d === 6 && S.hb === 6 && S.run.g > g0 && (await logs(page)).includes("헬 5층 돌파!"), JSON.stringify([S.run.d, S.hb, g0, S.run.g]));
  await ctx.close();
  // 4. 층 고르기 문: 10층 완료(hb 11) → 10층만 열림
  ({ ctx, page, errors } = await open("helltest-d", { rl_save: save(30, "hlD", { hb: 11 }), rl_level: lv(30, "hlD", "normal"), "rl_inv:g:DEV": inv(v4) }));
  await walkToHell(page, 5);
  check("pick door: 10층 enabled, 20층 locked", !(await page.locator("#hellpick-modal").isHidden()) && await page.locator("#hellpick-list button", { hasText: "10층" }).isEnabled() && await page.locator("#hellpick-list button", { hasText: "20층" }).isDisabled());
  await page.screenshot({ path: `${OUT}/hell-pick.png` });
  await page.locator("#hellpick-list button", { hasText: "10층" }).click(); await sleep(400);
  S = await stored(page, "rl_save");
  check("pick 10층 → hell floor 10 (named boss floor)", S.run.z === "hell" && S.run.d === 10 && (await stored(page, "rl_level")).enemies.some(e => e.kind === "boss"), JSON.stringify(S.run));
  await ctx.close();
  // 5. 헬 50층 완료 → 헬 완료, 랭킹(따로)
  ({ ctx, page, errors } = await open("helltest-e", { rl_save: save(50, "hlE", { hb: 50 }, { z: "hell" }), rl_level: lv(50, "hlE", "hell"), "rl_inv:g:DEV": inv(v4) }, true));
  await press(page, "ArrowRight"); await sleep(400);
  S = await stored(page, "rl_save");
  check("hell 50 clear: 헬 완료! notice, hclr", await inLobby(page) && (await page.locator("#notice-title").innerText()) === "헬 완료!" && S.hclr === 1, JSON.stringify(S));
  await page.keyboard.press("Enter"); await sleep(3500);
  const board = await (await fetch("http://127.0.0.1:8121/api.php?r=ranking&type=stage&season=hell", { headers: { Origin: ORIGIN.slice(0, -1) } })).json();
  check("server: hell board has 51 (= 50층 완료)", board.season === "hell" && board.seasonName === "헬" && board.rows?.[0]?.stage === 51, JSON.stringify(board).slice(0, 300));
  check("no page errors (clear)", errors.length === 0, errors.join("; "));
  await ctx.close();
} finally { await browser.close(); }

// ---- 서버: 헬 아이템 검증 ----
try {
  const post = (guest, body) => fetch("http://127.0.0.1:8121/api.php?r=score", { method: "POST", headers: { "Content-Type": "application/json", Origin: ORIGIN.slice(0, -1), "X-Guest-Id": guest }, body: JSON.stringify(body) }).then(r => r.json());
  const me = (guest, season) => fetch(`http://127.0.0.1:8121/api.php?r=me&season=${season}`, { headers: { Origin: ORIGIN.slice(0, -1), "X-Guest-Id": guest } }).then(r => r.json());
  let hellItem = null; for (let i = 0; !hellItem; i++) { const it = I.rollDrop(`hsv${i}|j20|k${i}`, 145, "boss"); if (it && it.lvl === 145) hellItem = it; }
  const ref = (it) => ({ seed: it.seed, src: it.src, lvl: it.lvl, v: it.v, enh: 0, id: it.id, r: it.r });
  await post("hell-guest-01", { stage: 76, plvl: 40, nm: 51, hell: 21, item: ref(hellItem) });   // 76 = 일반 던전 완료
  const m = await me("hell-guest-01", "hell");
  check("server: hell item (seed j20, lvl 145) accepted with hell 21, hell board", m.stage === 21 && m.item?.lvl === 145 && nameOf(m.item)?.includes("지옥의"), JSON.stringify(m));
  await post("hell-guest-02", { stage: 76, plvl: 40, nm: 30, hell: 21, item: ref(hellItem) });
  const m2 = await me("hell-guest-02", "hell");
  check("server: hell record needs nightmare cleared (nm 51)", !m2.stageRank && !(m2.stage > 0), JSON.stringify(m2));
} finally { php.kill(); }
check("no php errors", !/Fatal|Warning|Notice|Deprecated/.test(phpErr), phpErr.slice(0, 400));
const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
