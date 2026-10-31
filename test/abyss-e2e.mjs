// 끝이 없는 구멍 (dc#124): 헬을 완료하면 마을 웨이포인트 맨 아래에서, 매번 1층부터. 층마다 네임드 2마리(1~15층 쌍, 16~20층은 몬스터 전부 네임드)
// 한 층에 +7%, 장비·골드 없이 경험치만, 20층 완료 → 다음 업데이트 안내. 서버: 구멍 랭킹(맨 위), 가장 먼저 완료한 사람에게 칭호 [s1 제패한자] (숨기기 가능)
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import fs from "node:fs"; import path from "node:path";
import { goDoor } from "./town.mjs";
const require = createRequire(process.env.NODE_PATH + "/");
const { chromium } = require("playwright");
const REPO = process.argv[2], OUT = process.argv[3];
const I = createRequire(import.meta.url)(path.join(REPO, "items.js"));
const M = createRequire(import.meta.url)(path.join(REPO, "monsters.js"));
const ORIGIN = "https://game.apacimtest.com/", API = "https://api.test/api.php", PORT = 8141;
const results = []; const check = (n, ok, x = "") => { results.push(!!ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x && !ok ? " — " + x : ""}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const DIR = path.dirname(new URL(import.meta.url).pathname) + "/php";
const DB = path.join(DIR, "abyss.sqlite"); for (const f of [DB, DB + "-wal", DB + "-shm"]) fs.rmSync(f, { force: true });
const CFG = path.join(DIR, "config.abyss.php");
fs.writeFileSync(CFG, `<?php\n$c = require __DIR__ . '/config.test.php';\nreturn array_merge($c, ['db_dsn' => 'sqlite:${DB}']);\n`);
const php = spawn("php", ["-S", `127.0.0.1:${PORT}`, "-t", path.join(REPO, "ranking-php")], { env: { ...process.env, RANKING_CONFIG: CFG, TEST_JWT_SECRET: "abyss" }, stdio: ["ignore", "ignore", "pipe"] });
let phpErr = ""; php.stderr.on("data", d => phpErr += d);
await sleep(700);

// ---- 규칙 ----
const A = M.ABYSS, N = M.NAMED.bosses, nm = (k) => N[k].name;
const plan = (n) => { const p = M.abyssPlan(n); return p.pair ? p.pair.map(nm).join("+") : `all ${nm(p.all)}`; };
check("ABYSS: 20 floors, +7% per floor, XP ×150, clear 21, presence 4000", A.floors === 20 && A.perFloor === 0.07 && A.xpMul === 150 && A.clearStage === 21 && A.presence === 4000);
check("floor plan: 1 불가사리×2, 2 불가사리+구미호, 5 불가사리+염라대왕, 6 구미호×2, 15 염라대왕×2",
  plan(1) === "불가사리+불가사리" && plan(2) === "불가사리+구미호" && plan(3) === "불가사리+이무기" && plan(4) === "불가사리+저승사자" && plan(5) === "불가사리+염라대왕"
  && plan(6) === "구미호+구미호" && plan(7) === "구미호+이무기" && plan(15) === "염라대왕+염라대왕", [1, 2, 5, 6, 7, 15].map(plan).join(" / "));
check("floors 16~20: every monster is one named (불가사리 → … → 염라대왕)", [16, 17, 18, 19, 20].map(plan).join() === "all 불가사리,all 구미호,all 이무기,all 저승사자,all 염라대왕", [16, 20].map(plan).join());
check("scale: floor 1 ×1, floor 2 ×1.07, floor 20 ×2.33", M.abyssScale(1) === 1 && Math.abs(M.abyssScale(2) - 1.07) < 1e-9 && Math.abs(M.abyssScale(20) - 2.33) < 1e-9);
const g1 = M.makeAbyssNamed(50, 1), g20 = M.makeAbyssNamed(50, 20), hellBoss = M.makeHellBoss(50, "fire");
check("named guard: stronger than the hell 50 boss and grows with depth, kind boss, abyss", g1.kind === "boss" && g1.abyss === 1 && !g1.mob && g1.hp > hellBoss.hp && g20.hp > g1.hp * 2.3 && g20.atk > g1.atk * 2.2 && g1.pattern === "judge", JSON.stringify([g1.hp, g20.hp, hellBoss.hp]));
check("named in a mob slot (floors 16~20) is marked mob (does not guard the stairs)", M.makeAbyssNamed(10, 16, false).mob === 1);
// dc#125: 일반 자리 네임드는 그 층 일반 몬스터 세기 (지킴이와 같은 세기라 18층에서 들어가자마자 쓰러졌음), 패턴 박자는 마리마다
{ const g18 = M.makeAbyssNamed(30, 18), m18 = M.makeAbyssNamed(30, 18, false, () => 0.5), reg = M.makeAbyss(M.pickNightmareType(() => 0.5), "normal", 18, "bolt");
  const phases = new Set(Array.from({ length: 30 }, () => M.makeAbyssNamed(30, 18, false).phase));
  check("mob-slot named: regular-mob strength (not the guard's), 이무기 pattern kept, beats spread out", m18.hp === reg.hp && m18.atk === reg.atk && m18.hp * 10 < g18.hp && m18.atk < g18.atk / 2 && m18.pattern === "sweep" && m18.name === "이무기" && phases.size >= 3, JSON.stringify([m18.hp, reg.hp, g18.hp, m18.atk, g18.atk, [...phases]])); }
const t = M.MONSTERS.at(-1), h50 = M.makeHell(t, "normal", 50, "fire"), a1 = M.makeAbyss(t, "normal", 1, "fire"), a10 = M.makeAbyss(t, "normal", 10, "fire");
check("regular mob: hell 50 strength ×scale, XP ×150", a1.hp === h50.hp && a1.xp === h50.xp * 150 && a10.hp === Math.round(h50.hp * 1.63) && a1.abyss === 1, JSON.stringify([a1.hp, h50.hp, a10.hp]));

// ---- 게임 ----
const HOOK = `
  window.__t = {
    s: () => ({ scene, depth, zone: player.zone || "normal", gameOver, gold: player.gold, xp: player.xp, plvl: player.plvl, items: items.length, boss: bossAlive(),
      foes: enemies.map(e => ({ name: e.name, kind: e.kind, named: !!e.named, mob: !!e.mob, abyss: !!e.abyss })) }),
    // 지금 층의 몬스터 하나를 쓰러뜨림 (계단을 지키는 네임드면 guard, 그 밖은 아무나)
    kill: (guard) => { const e = enemies.find(x => guard ? x.kind === "boss" && !x.mob : !(x.kind === "boss" && !x.mob)); if (!e) return false; e.hp = 0; killEnemy(e); render(); updateStats(); return true; },
    // 계단으로 (계단 근처 몬스터는 내려가는 걸 막으므로 치움. clear=false면 그대로)
    stairs: (clear = true) => { for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) if (map[y][x] === STAIRS) {
      if (clear) enemies = enemies.filter(e => (e.kind === "boss" && !e.mob) || dist(e, { x, y }) > RLMonsters.STAIRS_BLOCK_RADIUS);
      player.x = x; player.y = y; arrive(x, y); render(); return true; } return false; },
    near: () => enemies.filter(e => dist(e, player) <= CHASE_RANGE).length,
    jump: (n) => { depth = n; newLevel(generateDungeon()); render(); updateStats(); saveGame(true); },
    die: () => { player.hp = 0; death(); render(); },
  };
  // ---- 시작 ----`;
const save = (extra = {}, run = {}) => JSON.stringify({ v: 1, f50: 1, season: 4, best: 50, clr: 1, nb: 50, nclr: 1, hb: 50, ...extra,
  run: { d: 30, hp: 9e9, mh: 9e9, a: 30, g: 500, l: 60, x: 0, xn: 1e15, rid: "ab-run", k: 0, pp: 0, ...run } });
const v4 = I.generate("abv4|shop|d70|s1", "golden", 70);
const inv = () => { const e = Object.fromEntries(I.SLOTS.map(s => [s, null])); e[v4.slot] = v4; return JSON.stringify({ bag: [], equip: e, log: [], stones: 0 }); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
async function open(dev, seed, { api = false, scene = "lobby" } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 1000 } }); const page = await ctx.newPage(); const errors = [];
  page.on("pageerror", e => errors.push(e.message)); page.on("dialog", d => d.accept());
  await ctx.route(ORIGIN + "**", r => { const f = new URL(r.request().url()).pathname.slice(1) || "index.html";
    if (f === "ranking-config.js") return r.fulfill({ contentType: "text/javascript", body: `window.RANKING_API = "${api ? API : ""}";` });
    const p = path.join(REPO, f); if (!fs.existsSync(p)) return r.fulfill({ status: 404, body: "" });
    let body = fs.readFileSync(p); if (f === "index.html") body = body.toString().replace("  // ---- 시작 ----", HOOK);
    r.fulfill({ contentType: f.endsWith(".js") ? "text/javascript" : f.endsWith(".png") ? "image/png" : f.endsWith(".webp") ? "image/webp" : "text/html", body }); });
  await ctx.route("https://api.test/**", async r => { const req = r.request(), u = new URL(req.url());
    const res = await fetch(`http://127.0.0.1:${PORT}/api.php${u.search}`, { method: req.method(), headers: { ...req.headers(), origin: ORIGIN.slice(0, -1) }, body: req.method() === "GET" ? undefined : req.postData() });
    r.fulfill({ status: res.status, headers: { "content-type": "application/json", "access-control-allow-origin": "*" }, body: await res.text() }); });
  await ctx.route("https://login.xsolla.com/**", r => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await ctx.addInitScript(([seed, dev, scene]) => { if (sessionStorage.getItem("seeded")) return; sessionStorage.setItem("seeded", 1); sessionStorage.setItem("rl_scene", scene);
    localStorage.setItem("rl_device_id", dev); localStorage.setItem("rl_tips", JSON.stringify(["intro", "dungeon", "gear", "lowhp"]));
    for (const [k, v] of Object.entries(seed)) localStorage.setItem(k.replace("DEV", dev), v);
    window.__log = []; document.addEventListener("DOMContentLoaded", () => new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => window.__log.push(n.textContent)))).observe(document.getElementById("log"), { childList: true })); }, [seed, dev, scene]);
  await page.goto(ORIGIN); await page.waitForFunction(() => window.__t); await sleep(300);
  // 시작할 때 뜨는 공지 창은 닫음
  for (let i = 0; i < 4 && await page.locator("#notice-modal").isVisible().catch(() => false); i++) { await page.keyboard.press("Enter"); await sleep(150); }
  return { ctx, page, errors };
}
const st = (page) => page.evaluate(() => window.__t.s());
const logs = (page) => page.evaluate(() => window.__log.join("\n"));
const stored = (page, k) => page.evaluate(k => JSON.parse(localStorage.getItem(k) || "null"), k);
const hole = (page) => page.locator("#wp-abyss");
try {
  // 1. 헬 미완료: 웨이포인트 맨 아래 구멍 버튼이 잠김
  let { ctx, page, errors } = await open("abyss-test-a", { rl_save: save(), "rl_inv:g:DEV": inv() });
  await goDoor(page, "waypoint");
  check("waypoint picker: 끝이 없는 구멍 row at the bottom, locked before clearing hell", await page.locator("#wp-list .wp-row").last().locator("b").innerText() === "끝이 없는 구멍" && await hole(page).isDisabled() && (await hole(page).innerText()).includes("헬 50층 완료 후"), await hole(page).innerText());
  await ctx.close();

  // 2. 헬 완료: 구멍 1층 → 네임드 2마리(불가사리), 일반 몬스터는 구멍 몬스터, 황금 고블린·바닥 아이템 없음
  ({ ctx, page, errors } = await open("abyss-test-b", { rl_save: save({ hclr: 1, hb: 51 }), "rl_inv:g:DEV": inv() }));
  await goDoor(page, "waypoint");
  check("hell cleared: hole button enabled (1층)", await hole(page).isEnabled() && (await hole(page).innerText()) === "1층");
  await page.screenshot({ path: `${OUT}/abyss-waypoint.png` });
  await hole(page).click(); await sleep(500);
  let s = await st(page), S = await stored(page, "rl_save");
  const guards = s.foes.filter(f => f.kind === "boss" && !f.mob), mobs = s.foes.filter(f => !(f.kind === "boss"));
  check("enter: abyss floor 1, zone label 구멍, save z:abyss ab:1", s.scene === "dungeon" && s.zone === "abyss" && s.depth === 1 && S.run.z === "abyss" && S.ab === 1 && (await page.locator("#zone").innerText()).includes("구멍"), JSON.stringify([s.zone, s.depth, S.run.z, S.ab]));
  check("floor 1: two named guards, both 불가사리", guards.length === 2 && guards.every(g => g.name === "불가사리" && g.named && g.abyss), JSON.stringify(guards));
  check("floor 1: about 50 regular abyss monsters, no golden goblin, no floor items", mobs.length >= 40 && mobs.every(m => m.abyss && m.kind !== "golden") && s.items === 0, JSON.stringify([mobs.length, s.items]));
  check("entry log: +7% per floor, XP ×150, no gear", (await logs(page)).includes("7%씩 강해지고") && (await logs(page)).includes("경험치를 150배"));
  await page.screenshot({ path: `${OUT}/abyss-floor1.png` });
  // 일반 몬스터: 경험치만 (골드·장비 없음)
  const before = await st(page);
  await page.evaluate(() => window.__t.kill(false)); await sleep(100);
  s = await st(page);
  check("kill a regular monster: XP up, gold same, nothing dropped", (s.xp > before.xp || s.plvl > before.plvl) && s.gold === before.gold && s.items === 0, JSON.stringify([before.xp, s.xp, before.gold, s.gold, s.items]));
  // 네임드 1마리만 쓰러뜨리면 계단은 아직 닫힘
  await page.evaluate(() => window.__t.kill(true)); await sleep(100);
  s = await st(page);
  check("one guard down: stairs still closed, no item or gold", s.boss && s.items === 0 && s.gold === before.gold);
  await page.evaluate(() => window.__t.stairs()); await sleep(150);
  check("stairs blocked while a guard lives", (await st(page)).depth === 1 && (await logs(page)).includes("보스가 살아 있는 동안 계단이 열리지 않는다"));
  await page.evaluate(() => window.__t.kill(true)); await sleep(100);
  check("both guards down: 계단이 열렸다", !(await st(page)).boss && (await logs(page)).includes("네임드 보스를 모두 쓰러뜨렸다! 계단이 열렸다"));
  const g0 = (await st(page)).gold;
  await page.evaluate(() => window.__t.stairs()); await sleep(300);
  s = await st(page); S = await stored(page, "rl_save");
  check("stairs → floor 2 (불가사리 + 구미호), no floor reward gold, ab 2", s.depth === 2 && s.gold === g0 && S.ab === 2
    && s.foes.filter(f => f.kind === "boss" && !f.mob).map(f => f.name).sort().join() === ["구미호", "불가사리"].sort().join(), JSON.stringify([s.depth, s.gold, g0, S.ab, s.foes.filter(f => f.kind === "boss").map(f => f.name)]));
  // 16층: 몬스터가 모두 불가사리, 계단은 지키는 2마리만 쓰러뜨리면 열림
  await page.evaluate(() => window.__t.jump(16)); await sleep(200);
  s = await st(page);
  const all16 = s.foes.filter(f => f.kind !== "golden");
  check("floor 16: every monster is 불가사리 (2 guards + the rest mob)", all16.length >= 40 && all16.every(f => f.name === "불가사리" && f.named) && all16.filter(f => !f.mob).length === 2, JSON.stringify([all16.length, all16.filter(f => !f.mob).length]));
  await page.evaluate(() => { window.__t.kill(true); window.__t.kill(true); }); await sleep(100);
  check("floor 16: guards down → stairs open with the mob 불가사리 still alive", !(await st(page)).boss && (await st(page)).foes.length >= 38);
  await page.screenshot({ path: `${OUT}/abyss-floor16.png` });
  // 18층 (모두 이무기, dc#125): 시작 자리 5칸 안에는 몬스터가 없음
  await page.evaluate(() => window.__t.jump(18)); await sleep(200);
  check("floor 18: no monster within 5 tiles of the start", (await page.evaluate(() => window.__t.near())) === 0 && (await st(page)).foes.every(f => f.name === "이무기"), String(await page.evaluate(() => window.__t.near())));
  // 쓰러지면 새로 시작 → 웨이포인트 구멍은 다시 1층부터
  await page.evaluate(() => window.__t.die()); await sleep(200);
  await page.locator("#death-restart").click(); await sleep(400);
  await goDoor(page, "waypoint");
  await hole(page).click(); await sleep(500);
  s = await st(page);
  check("after death: the hole starts again from floor 1 (best 2 kept)", s.zone === "abyss" && s.depth === 1 && (await stored(page, "rl_save")).ab === 2, JSON.stringify([s.depth, (await stored(page, "rl_save")).ab]));
  check("no page errors", errors.length === 0, errors.join("; "));
  await ctx.close();

  // 3. 20층 완료 → 안내(다음 업데이트), aclr, 구멍 랭킹 21, 가장 먼저 완료 → 칭호
  ({ ctx, page, errors } = await open("abyss-test-c", { rl_save: save({ hclr: 1, hb: 51, ab: 20 }, { d: 20, z: "abyss", rid: "ab-c" }), "rl_inv:g:DEV": inv() }, { api: true, scene: "dungeon" }));
  await page.evaluate(() => window.__t.jump(20)); await sleep(200);
  s = await st(page);
  check("floor 20: guards are 염라대왕 ×2, every monster 염라대왕", s.foes.filter(f => f.kind !== "golden").every(f => f.name === "염라대왕"));
  await page.evaluate(() => { window.__t.kill(true); window.__t.kill(true); window.__t.stairs(); }); await sleep(500);
  S = await stored(page, "rl_save");
  const notice = await page.locator("#notice-modal").innerText().catch(() => "");
  check("floor 20 clear: 끝이 없는 구멍 완료! with 'wait for the next update', aclr 1, back in town", (await page.locator("#notice-title").innerText()) === "끝이 없는 구멍 완료!" && notice.includes("다음 업데이트를 기다려 주세요") && S.aclr === 1 && (await st(page)).scene === "lobby", JSON.stringify([notice.slice(0, 200), S.aclr]));
  check("stats bar: 구멍 best 20 완료 (after clear the portal goes back to floor 1)", (await stored(page, "rl_save")).run.d === 1);
  await page.keyboard.press("Enter"); await sleep(200);
  await page.screenshot({ path: `${OUT}/abyss-clear.png` });
  // 랭킹 기록(3초 모아서) → 칭호 알림
  await page.waitForFunction(() => document.getElementById("notice-title")?.textContent.includes("[s1 제패한자]"), null, { timeout: 9000 }).catch(() => {});
  check("first clear: title notice [s1 제패한자] in the game", (await page.locator("#notice-title").innerText()).includes("[s1 제패한자]") && (await logs(page)).includes("칭호 [s1 제패한자]을(를) 얻었다"), await page.locator("#notice-title").innerText());
  const board = await (await fetch(`http://127.0.0.1:${PORT}/api.php?r=ranking&type=stage&season=abyss`, { headers: { Origin: ORIGIN.slice(0, -1) } })).json();
  check("server: abyss board has 21 (= 20층 완료), name starts with the title", board.season === "abyss" && board.seasonName === "끝이 없는 구멍" && board.rows?.[0]?.stage === 21 && board.rows[0].name.startsWith("[s1 제패한자] "), JSON.stringify(board).slice(0, 300));
  check("no page errors (clear)", errors.length === 0, errors.join("; "));

  // 4. 랭킹 화면: 맨 앞 탭이 구멍, 내 칭호 숨기기 → 이름 앞 칭호가 빠짐
  await page.goto(ORIGIN + "ranking.html#abyss"); await sleep(800);
  check("ranking page: first tab 끝이 없는 구멍 (selected by #abyss), row shows the title", (await page.locator("#seasons button").first().innerText()).includes("끝이 없는 구멍")
    && await page.locator("#seasons button").first().getAttribute("aria-selected") === "true" && (await page.locator("#board-stage li").first().innerText()).includes("[s1 제패한자]"));
  await page.screenshot({ path: `${OUT}/abyss-ranking.png` });
  await page.locator("#title-s1").click(); await sleep(800);
  check("hide title: ranking row without the title, button says 보이기", !(await page.locator("#board-stage li").first().innerText()).includes("[s1 제패한자]") && (await page.locator("#title-s1").innerText()).includes("보이기"));
  await page.locator("#title-s1").click(); await sleep(800);
  check("show again: title back", (await page.locator("#board-stage li").first().innerText()).includes("[s1 제패한자]"));
  await ctx.close();
} finally { await browser.close(); }

// ---- 서버 ----
try {
  const post = (guest, body) => fetch(`http://127.0.0.1:${PORT}/api.php?r=score`, { method: "POST", headers: { "Content-Type": "application/json", Origin: ORIGIN.slice(0, -1), "X-Guest-Id": guest }, body: JSON.stringify(body) }).then(r => r.json());
  const me = (guest, season) => fetch(`http://127.0.0.1:${PORT}/api.php?r=me&season=${season}`, { headers: { Origin: ORIGIN.slice(0, -1), "X-Guest-Id": guest } }).then(r => r.json());
  const title = (guest, body) => fetch(`http://127.0.0.1:${PORT}/api.php?r=title`, { method: "POST", headers: { "Content-Type": "application/json", Origin: ORIGIN.slice(0, -1), "X-Guest-Id": guest }, body: JSON.stringify(body) });
  const r2 = await post("abyss-guest-02", { stage: 51, fl: 50, plvl: 80, nm: 51, hell: 51, abyss: 21 });
  const m2 = await me("abyss-guest-02", "abyss");
  check("second clearer: on the board (21) but no title", !r2.title && m2.stage === 21 && !m2.name.startsWith("[") && (m2.titles || []).length === 0, JSON.stringify([r2, m2.name]));
  const r3 = await post("abyss-guest-03", { stage: 51, fl: 50, plvl: 80, nm: 51, hell: 40, abyss: 21 });
  check("abyss record needs hell cleared (hell 51)", !(await me("abyss-guest-03", "abyss")).stageRank, JSON.stringify(r3));
  await post("abyss-guest-04", { stage: 51, fl: 50, plvl: 80, nm: 51, hell: 51, abyss: 99 });
  check("abyss record capped at 21", (await me("abyss-guest-04", "abyss")).stage === 21);
  check("someone else cannot hide the title (403)", (await title("abyss-guest-02", { id: "s1", hide: true })).status === 403);
  check("unknown title id → 400", (await title("abyss-guest-02", { id: "zz", hide: true })).status === 400);
  const lobby = await (await fetch(`http://127.0.0.1:${PORT}/api.php?r=lobby`, { method: "POST", headers: { "Content-Type": "application/json", Origin: ORIGIN.slice(0, -1), "X-Guest-Id": "abyss-test-c" }, body: JSON.stringify({ scene: "dungeon", depth: 4003 }) })).json();
  check("lobby: my name with the title, abyss floor kept (4003)", lobby.me?.name?.startsWith("[s1 제패한자] ") && lobby.players?.find(p => p.id === lobby.me.id)?.depth === 4003, JSON.stringify(lobby.me));
} finally { php.kill(); }
check("no php errors", !/Fatal|Warning|Notice|Deprecated/.test(phpErr), phpErr.slice(0, 400));
const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
