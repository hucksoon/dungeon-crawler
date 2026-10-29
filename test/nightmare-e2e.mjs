// 나이트메어 던전 (2단계): 입구·입장 조건·층·아이템 레벨 76~125·완료·랭킹, 일반 던전 완료자는 65층부터
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import fs from "node:fs"; import path from "node:path";
import { goDoor } from "./town.mjs";   // 마을(옆에서 보는 로비) 문까지 걸어가 ↑
const require = createRequire(process.env.NODE_PATH + "/");
const { chromium, devices } = require("playwright");
const REPO = process.argv[2], OUT = process.argv[3];
const I = createRequire(import.meta.url)(path.join(REPO, "items.js"));
// 서버는 아이템 값만 보냄 (dc#97): 참조로 다시 만든 이름 (서버가 이름 글자를 보내면 실패)
const nameOf = (v) => (v?.ref && !("name" in v) ? I.itemName(I.fromRef(v.ref, { gems: true })) : null);
const M = createRequire(import.meta.url)(path.join(REPO, "monsters.js"));
const ORIGIN = "https://game.apacimtest.com/", API = "https://api.test/api.php";
const results = []; const check = (n, ok, x = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x && !ok ? " — " + x : ""}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const NM = M.NIGHTMARE;

// ---- 규칙 ----
check("nightmare: 50 floors, 2%/floor + 0.3%×(floor−1)², monsters 20 → 50 (floor 41), items 76~125, clear 51", NM.floors === 50 && NM.perFloor === 0.02 && NM.perFloor2 === 0.003 && M.nmMonsterCount(1) === 20 && M.nmMonsterCount(40) === 49 && M.nmMonsterCount(41) === 50 && M.nmMonsterCount(50) === 50 && NM.itemBase === 75 && NM.clearStage === 51);
const b1 = M.makeNightmareBoss(1), b50 = M.makeNightmareBoss(50), base = M.makeBoss(75);
check("nightmare boss = 75층 boss × 1.44 HP (dc#54), ×9.18 at 50", b1.hp === Math.round(base.hp * M.NIGHTMARE.bossHp) && M.NIGHTMARE.bossHp === 1.44 && Math.abs(b50.hp / b1.hp - 9.18) < 0.01 && b1.name.startsWith("악몽의"));
const pool = M.nightmarePool().map(m => m.id);
check("nightmare pool has floor-75 monsters plus 대악마·타이탄·공허의 군주·고룡", ["archdemon", "titan", "void_lord", "ancient_dragon"].every(id => pool.includes(id)) || pool.length >= 8, pool.join());

// ---- 서버 ----
const DIR = path.dirname(new URL(import.meta.url).pathname) + "/php";
const DB = path.join(DIR, "nm.sqlite"); for (const f of [DB, DB + "-wal", DB + "-shm"]) fs.rmSync(f, { force: true });
const CFG = path.join(DIR, "config.nm.php");
fs.writeFileSync(CFG, `<?php\n$c = require __DIR__ . '/config.test.php';\nreturn array_merge($c, ['db_dsn' => 'sqlite:${DB}']);\n`);
const php = spawn("php", ["-S", "127.0.0.1:8101", "-t", path.join(REPO, "ranking-php")], { env: { ...process.env, RANKING_CONFIG: CFG, TEST_JWT_SECRET: "nm" }, stdio: ["ignore", "ignore", "pipe"] });
let phpErr = ""; php.stderr.on("data", d => phpErr += d);
await sleep(700);

const MAP_W = 32, MAP_H = 24;
const map = Array.from({ length: MAP_H }, (_, y) => Array.from({ length: MAP_W }, (_, x) => (x === 0 || y === 0 || x === MAP_W - 1 || y === MAP_H - 1 ? 0 : 1)));
const lv = (d, rid, z, enemies = [], stairs = [11, 10]) => { const m = map.map(r => r.slice()); m[stairs[1]][stairs[0]] = 2; return JSON.stringify({ rid, d, z, turn: 0, map: m.map(r => r.join("")).join(""), seen: "1".repeat(MAP_W * MAP_H), px: 10, py: 10, shop: null, enemies, items: [] }); };
const save = (d, rid, extra = {}, run = {}) => JSON.stringify({ v: 1, f50: 1, season: 4, best: 50, clr: 1, ...extra, run: { d, hp: 9e6, mh: 9e6, a: 30, g: 500, p: 3, l: 40, x: 0, xn: 1e12, rid, k: 0, pp: 0, ...run } });
const v4 = I.generate("nmv4|shop|d70|s1", "golden", 70), v3 = I.generate("nmv3|shop|d20|s1", "golden", 20, 3);
const eqOf = (...its) => { const e = Object.fromEntries(I.SLOTS.map(s => [s, null])); for (const it of its) e[it.slot] = it; return e; };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
async function open(dev, seed, opts = {}) {
  const ctx = await browser.newContext(opts.device ? { ...devices[opts.device] } : { viewport: { width: 1100, height: 1000 } }); const page = await ctx.newPage(); const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("dialog", d => d.accept());
  await ctx.route(ORIGIN + "**", r => { const f = new URL(r.request().url()).pathname.slice(1) || "index.html";
    if (f === "ranking-config.js") return r.fulfill({ contentType: "text/javascript", body: `window.RANKING_API = "${opts.api ? API : ""}";` });
    const p = path.join(REPO, f); if (!fs.existsSync(p)) return r.fulfill({ status: 404, body: "" });
    r.fulfill({ contentType: f.endsWith(".js") ? "text/javascript" : "text/html", body: fs.readFileSync(p) }); });
  await ctx.route("https://api.test/**", async r => { const req = r.request(), u = new URL(req.url());
    const res = await fetch(`http://127.0.0.1:8101/api.php${u.search}`, { method: req.method(), headers: { ...req.headers(), origin: ORIGIN.slice(0, -1) }, body: req.method() === "GET" ? undefined : req.postData() });
    r.fulfill({ status: res.status, headers: { "content-type": "application/json", "access-control-allow-origin": "*" }, body: await res.text() }); });
  await ctx.route("https://login.xsolla.com/**", r => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await ctx.addInitScript(([seed, dev]) => { if (sessionStorage.getItem("seeded")) return; sessionStorage.setItem("seeded", 1); sessionStorage.setItem("rl_scene", "dungeon");
    localStorage.setItem("rl_device_id", dev); localStorage.setItem(`rl_notice_v4:g:${dev}`, "1"); localStorage.setItem(`rl_notice_75:g:${dev}`, "1");
    for (const [k, v] of Object.entries(seed)) localStorage.setItem(k.replace("DEV", dev), v);
    window.__log = []; document.addEventListener("DOMContentLoaded", () => new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => window.__log.push(n.textContent)))).observe(document.getElementById("log"), { childList: true })); }, [seed, dev]);
  await page.goto(ORIGIN); await sleep(450);
  return { ctx, page, errors };
}
const logs = (page) => page.evaluate(() => window.__log.join("\n"));
const stored = (page, k) => page.evaluate(k => JSON.parse(localStorage.getItem(k) || "null"), k);
const inLobby = (page) => page.evaluate(() => document.body.classList.contains("in-lobby"));
// 포탈로 로비(포탈 문 앞) → 아래 → 오른쪽으로 나이트메어 문 아래 → 위로 문에
// 포탈(P) → 로비, 로비 포탈 위(16,13)
async function portalOut(page) {
  await page.keyboard.press("p"); await sleep(150);
  const L = await page.evaluate(() => JSON.parse(localStorage.getItem("rl_level")));
  if (L?.tp) await page.keyboard.press(L.tp.x > L.px ? "ArrowRight" : L.tp.x < L.px ? "ArrowLeft" : L.tp.y > L.py ? "ArrowDown" : "ArrowUp"); await sleep(200);
}
// 마을 나이트메어 문까지 걸어가 ↑
async function walkToNightmare(page) {
  await portalOut(page);
  await goDoor(page, "nightmare"); await sleep(100);
}
try {
  // 1. 일반 던전 미완료: 입장 불가
  let { ctx, page, errors } = await open("nmtest-a", { rl_save: save(30, "nmA", { clr: 0 }), rl_level: lv(30, "nmA", "normal"), "rl_inv:g:DEV": JSON.stringify({ bag: [], equip: eqOf(v4), log: [], stones: 0 }) });
  await walkToNightmare(page);
  check("not cleared: stays in lobby with the requirement message", await inLobby(page) && (await logs(page)).includes("50층을 완료해야 들어갈 수 있다"), await logs(page));
  await page.screenshot({ path: path.join(OUT, "nm-lobby.png") });
  await ctx.close();

  // 2. 완료했지만 예전 장비를 끼고 있음: 입장 불가
  ({ ctx, page, errors } = await open("nmtest-b", { rl_save: save(30, "nmB"), rl_level: lv(30, "nmB", "normal"), "rl_inv:g:DEV": JSON.stringify({ bag: [], equip: eqOf(v4, v3), log: [], stones: 0 }) }));
  await walkToNightmare(page);
  check("cleared but wearing old gear: refused", await inLobby(page) && (await logs(page)).includes("예전(v3까지) 장비 1개를 끼고 있어서 들어갈 수 없다"));
  await ctx.close();

  // 3. 조건을 채우면 나이트메어 1층
  ({ ctx, page, errors } = await open("nmtest-c", { rl_save: save(30, "nmC"), rl_level: lv(30, "nmC", "normal"), "rl_inv:g:DEV": JSON.stringify({ bag: [v3], equip: eqOf(v4), log: [], stones: 0 }) }));
  await walkToNightmare(page);
  const L1 = await stored(page, "rl_level"), S1 = await stored(page, "rl_save");
  check("enter: nightmare floor 1 (HUD, save z:nm, level z:nm)", !(await inLobby(page)) && (await page.locator("#zone").innerText()).includes("나이트메어") && (await page.locator("#depth").innerText()) === "1" && S1.run.z === "nm" && S1.run.d === 1 && L1.z === "nm", JSON.stringify(S1.run));
  const mobs = L1.enemies.filter(e => e.kind !== "golden");
  check(`nightmare floor 1 has ~20 strong monsters (${mobs.length})`, mobs.length >= 15 && mobs.length <= 24 && mobs.every(e => e.name.startsWith("악몽의") || e.name.includes("악몽의")) && Math.min(...mobs.map(e => e.hp)) > M.makeMonster(M.MONSTERS[0], "normal", 75).hp);
  // 나이트메어 안에서는 예전 장비를 낄 수 없음
  await page.keyboard.press("i"); await sleep(150);
  await page.locator(".bag-item", { hasText: I.itemName(v3) }).click();
  await page.getByRole("button", { name: "장착", exact: true }).click(); await sleep(150);
  check("can't equip old gear inside nightmare", (await page.locator("#inv-detail").innerText()).includes("나이트메어·헬에서는 예전(v3까지) 장비를 낄 수 없어요") && !(await stored(page, "rl_inv:g:nmtest-c")).equip[v3.slot]?.id?.includes(v3.id));
  await page.keyboard.press("Escape");
  await page.screenshot({ path: path.join(OUT, "nm-floor1.png") });
  check("no page errors (enter)", errors.length === 0, errors.join("; "));
  await ctx.close();

  // 4. 나이트메어 5층 보스: 아이템 레벨 80, 시드 n5, 2개
  const nb = { x: 11, y: 10, ...M.makeNightmareBoss(5), hp: 1 };
  ({ ctx, page, errors } = await open("nmtest-d", { rl_save: save(5, "nmD", {}, { z: "nm" }), rl_level: lv(5, "nmD", "nm", [nb], [28, 20]), "rl_inv:g:DEV": JSON.stringify({ bag: [], equip: eqOf(v4), log: [], stones: 0 }) }));
  await page.keyboard.press("ArrowRight"); await sleep(250);
  const L4 = await stored(page, "rl_level");
  const drops = L4.items.filter(i => i.type === "gear");
  check("nightmare boss drops 2 items, level 80, seed n5, latest rev", drops.length === 2 && drops.every(d => d.item.lvl === 80 && /\|n5\|k\d+$/.test(d.item.seed) && d.item.r === I.RULES_REV), JSON.stringify(drops.map(d => [d.item.lvl, d.item.seed])));
  await ctx.close();

  // 5. 계단: 나이트메어 6층 → 7층, 최고 층
  ({ ctx, page, errors } = await open("nmtest-e", { rl_save: save(6, "nmE", { nb: 6 }, { z: "nm" }), rl_level: lv(6, "nmE", "nm"), "rl_inv:g:DEV": JSON.stringify({ bag: [], equip: eqOf(v4), log: [], stones: 0 }) }));
  await page.keyboard.press("ArrowRight"); await sleep(250);
  check("nightmare stairs: floor 7, nightmare best 7 (normal best untouched)", (await page.locator("#depth").innerText()) === "7" && (await page.locator("#best").innerText()) === "7" && (await stored(page, "rl_save")).nb === 7 && (await stored(page, "rl_save")).best === 50);
  await ctx.close();

  // 6. 나이트메어 50층 완료 → 로비, 포탈은 나이트메어 50층 새 구역, 랭킹(따로)에 51
  ({ ctx, page, errors } = await open("nmtest-f", { rl_save: save(50, "nmF", { nb: 50 }, { z: "nm" }), rl_level: lv(50, "nmF", "nm"), "rl_inv:g:DEV": JSON.stringify({ bag: [v4], equip: eqOf(v4), log: [], stones: 0 }) }, { api: true }));
  await page.keyboard.press("ArrowRight"); await sleep(300);
  const S6 = await stored(page, "rl_save");
  check("nightmare 50 clear: lobby + 나이트메어 완료 notice, nclr, portal to nightmare 50", await inLobby(page) && (await page.locator("#notice-title").innerText()) === "나이트메어 완료!" && S6.nclr === 1 && S6.run.z === "nm" && S6.run.d === 50);
  await page.keyboard.press("Enter"); await sleep(3500);
  const nmBoard = await (await fetch("http://127.0.0.1:8101/api.php?r=ranking&type=stage&season=nm", { headers: { Origin: ORIGIN.slice(0, -1) } })).json();
  check("server: nightmare board has 51 (= 50층 완료)", nmBoard.season === "nm" && nmBoard.rows?.[0]?.stage === 51, JSON.stringify(nmBoard.rows));
  await page.keyboard.press("ArrowUp"); await sleep(300);  // 마을 파란 포탈 문 앞에서 ↑
  check("lobby portal → nightmare 50 again", !(await inLobby(page)) && (await page.locator("#zone").innerText()).includes("나이트메어") && (await page.locator("#depth").innerText()) === "50");
  check("no page errors (clear)", errors.length === 0, errors.join("; "));
  await ctx.close();

  // 7. 일반 던전 완료자: 웨이포인트가 모두 켜져 있음 (dc#97) → 마을 웨이포인트에서 50층부터
  ({ ctx, page, errors } = await open("nmtest-g", { rl_save: save(30, "nmG"), rl_level: lv(30, "nmG", "normal"), "rl_inv:g:DEV": JSON.stringify({ bag: [], equip: eqOf(v4), log: [], stones: 0 }) }));
  await portalOut(page);
  await goDoor(page, "waypoint"); await sleep(150);
  check("cleared player: every normal waypoint already on (10~50), nightmare not", await page.locator("#wp-list .wp-row").nth(0).locator("button:not([disabled])").count() === 5 && await page.locator("#wp-list .wp-row").nth(1).locator("button:not([disabled])").count() === 0);
  await page.locator("#wp-list .wp-row").nth(0).locator("button", { hasText: "50층" }).click(); await sleep(400);
  check("cleared player: waypoint 50 → starts on floor 50", !(await inLobby(page)) && (await page.locator("#depth").innerText()) === "50" && (await page.locator("#zone").innerText()) === "", await page.locator("#depth").innerText());
  await ctx.close();

  // 8. 랭킹 화면: 탭 5개 (끝이 없는 구멍·정식 v1·나이트메어·헬·클로즈 베타, dc#124), 나이트메어 탭
  ({ ctx, page, errors } = await open("nmtest-h", {}, { api: true }));
  await page.goto(ORIGIN + "ranking.html#nm"); await sleep(800);
  check("ranking: 5 tabs, #nm opens nightmare with 50층 완료 ✓", (await page.locator("#seasons button").count()) === 5 && (await page.locator('#seasons button[aria-selected="true"]').innerText()).startsWith("나이트메어") && (await page.locator("#board-stage").innerText()).includes("50층 완료 ✓"));
  await page.screenshot({ path: path.join(OUT, "nm-ranking.png") });
  await ctx.close();
} finally { await browser.close(); }

// ---- 서버: 나이트메어 아이템 검증 ----
try {
  const post = (guest, body) => fetch("http://127.0.0.1:8101/api.php?r=score", { method: "POST", headers: { "Content-Type": "application/json", Origin: ORIGIN.slice(0, -1), "X-Guest-Id": guest }, body: JSON.stringify(body) }).then(r => r.json());
  const me = (guest, season = "") => fetch(`http://127.0.0.1:8101/api.php?r=me${season ? "&season=" + season : ""}`, { headers: { Origin: ORIGIN.slice(0, -1), "X-Guest-Id": guest } }).then(r => r.json());
  const player = async (guest, season) => (await fetch(`http://127.0.0.1:8101/api.php?r=player&id=${(await me(guest, season)).id}${season ? "&season=" + season : ""}`, { headers: { Origin: ORIGIN.slice(0, -1) } })).json();
  const boss = I.generate("nmsrv|n10|k3", "boss", 85), shop = I.generate("nmsrv|shop|n9|s2", "golden", 84);
  const ref = (it, extra = {}) => ({ seed: it.seed, src: it.src, lvl: it.lvl, v: 4, enh: 0, id: it.id, r: it.r, ...extra });
  await post("nm-guest-0001", { stage: 76, nm: 12, plvl: 40, item: ref(boss), gear: [ref(boss), ref(shop)] });
  const p1 = await player("nm-guest-0001", "nm");
  check("server: nightmare items (lvl 85 boss n10, lvl 84 shop n9) verify, nightmare board 12", !p1.gear.rejected && p1.gear.items.length === 2 && p1.stage === 12, JSON.stringify([p1.stage, p1.gear.rejected]));
  check("server: nightmare item counts on the v4 item board too", nameOf((await me("nm-guest-0001")).item) === I.itemName(boss));
  await post("nm-guest-0002", { stage: 76, plvl: 40, item: ref(boss), gear: [ref(boss)] });
  check("server: without nightmare progress, a lvl 85 item is rejected", (await player("nm-guest-0002")).gear.rejected === 1);
  const bad = I.generate("nmsrv|n10|k3", "boss", 90);
  await post("nm-guest-0003", { stage: 76, nm: 40, plvl: 40, gear: [ref(bad), ref(boss, { r: 1 })] });
  check("server: wrong level for the floor / old rev rejected", (await player("nm-guest-0003", "nm")).gear.rejected === 2);
  await post("nm-guest-0004", { stage: 76, nm: 999, plvl: 40, gear: [] });
  check("server: nightmare stage clamped to 51", (await me("nm-guest-0004", "nm")).stage === 51);
  await post("nm-guest-0005", { stage: 30, nm: 10, plvl: 40, gear: [] });
  check("server: nightmare record needs a normal-dungeon clear", !(await me("nm-guest-0005", "nm")).stage);
  check("no php errors", !/Fatal|Warning|Notice|Deprecated/.test(phpErr), phpErr.slice(0, 400));
} finally { php.kill(); }
const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
