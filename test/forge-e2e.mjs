// 대장간(옵션 재련·홈 초기화)·+12 강화·둘러싸임 방어·나이트메어 공격력 곡선
import { createRequire } from "node:module";
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs"; import path from "node:path";
const require = createRequire(process.env.NODE_PATH + "/");
const { chromium } = require("playwright");
const REPO = process.argv[2], OUT = process.argv[3];
const I = createRequire(import.meta.url)(path.join(REPO, "items.js"));
const M = createRequire(import.meta.url)(path.join(REPO, "monsters.js"));
const ORIGIN = "https://game.apacimtest.com/", API = "https://api.test/api.php";
const results = []; const check = (n, ok, x = "") => { results.push(!!ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x && !ok ? " — " + x : ""}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
// ---- 서버 ----
const DIR = path.dirname(new URL(import.meta.url).pathname) + "/php";
const DB = path.join(DIR, "forge.sqlite"); for (const f of [DB, DB + "-wal", DB + "-shm"]) fs.rmSync(f, { force: true });
const CFG = path.join(DIR, "config.forge.php");
fs.writeFileSync(CFG, `<?php\n$c = require __DIR__ . '/config.test.php';\nreturn array_merge($c, ['db_dsn' => 'sqlite:${DB}']);\n`);
const php = spawn("php", ["-S", "127.0.0.1:8116", "-t", path.join(REPO, "ranking-php")], { env: { ...process.env, RANKING_CONFIG: CFG, TEST_JWT_SECRET: "forge" }, stdio: ["ignore", "ignore", "pipe"] });
let phpErr = ""; php.stderr.on("data", d => phpErr += d);
await sleep(700);

const MAP_W = 32, MAP_H = 24;
const map = Array.from({ length: MAP_H }, (_, y) => Array.from({ length: MAP_W }, (_, x) => (x === 0 || y === 0 || x === MAP_W - 1 || y === MAP_H - 1 ? 0 : 1)));
const lv = (d, rid, z, enemies = [], extra = {}, stairs = [28, 20]) => { const mm = map.map(r => r.slice()); mm[stairs[1]][stairs[0]] = 2; return JSON.stringify({ rid, d, z, turn: 0, map: mm.map(r => r.join("")).join(""), seen: "1".repeat(MAP_W * MAP_H), px: 10, py: 10, shop: null, enemies, items: [], ...extra }); };
const save = (d, rid, run = {}) => JSON.stringify({ v: 1, season: 4, best: 75, clr: 1, nb: 10, run: { d, hp: 300, mh: 1000, a: 30, g: 500, l: 40, x: 0, xn: 1e12, rid, k: 0, pp: 0, ...run } });
const eqOf = (...its) => { const e = Object.fromEntries(I.SLOTS.map(s => [s, null])); for (const it of its) e[it.slot] = it; return e; };
const foe = (x, y, extra = {}) => ({ x, y, id: "titan", ch: "I", name: "악몽의 타이탄", color: "#fdd835", kind: "normal", hp: 1e7, maxHp: 1e7, atk: 0, def: 0, xp: 1, nm: 1, ...extra });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
async function open(dev, seed, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 1000 } }); const page = await ctx.newPage(); const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("dialog", d => d.accept());
  await ctx.route(ORIGIN + "**", r => { const f = new URL(r.request().url()).pathname.slice(1) || "index.html";
    if (f === "ranking-config.js") return r.fulfill({ contentType: "text/javascript", body: `window.RANKING_API = "${opts.api ? API : ""}";` });
    const p = path.join(REPO, f); if (!fs.existsSync(p)) return r.fulfill({ status: 404, body: "" });
    r.fulfill({ contentType: f.endsWith(".js") ? "text/javascript" : "text/html", body: fs.readFileSync(p) }); });
  await ctx.route("https://api.test/**", async r => { const req = r.request(), u = new URL(req.url());
    const res = await fetch(`http://127.0.0.1:8116/api.php${u.search}`, { method: req.method(), headers: { ...req.headers(), origin: ORIGIN.slice(0, -1) }, body: req.method() === "GET" ? undefined : req.postData() });
    r.fulfill({ status: res.status, headers: { "content-type": "application/json", "access-control-allow-origin": "*" }, body: await res.text() }); });
  await ctx.route("https://login.xsolla.com/**", r => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await ctx.addInitScript(([seed, dev]) => { window.__shift = Number(sessionStorage.getItem("shift") || 0); const _now = Date.now; Date.now = () => _now() + window.__shift;
    if (sessionStorage.getItem("seeded")) return; sessionStorage.setItem("seeded", 1); sessionStorage.setItem("rl_scene", seed.__scene || "dungeon");
    localStorage.setItem("rl_device_id", dev); localStorage.setItem(`rl_notice_v4:g:${dev}`, "1"); localStorage.setItem(`rl_notice_75:g:${dev}`, "1"); localStorage.setItem(`rl_notice_1019:g:${dev}`, "1"); localStorage.setItem(`rl_notice_1020:g:${dev}`, "1"); localStorage.setItem(`rl_notice_1020b:g:${dev}`, "1"); localStorage.setItem(`rl_notice_1020c:g:${dev}`, "1");
    for (const [k, v] of Object.entries(seed)) localStorage.setItem(k.replace("DEV", dev), v);
    window.__log = []; document.addEventListener("DOMContentLoaded", () => new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => window.__log.push(n.textContent)))).observe(document.getElementById("log"), { childList: true })); }, [seed, dev]);
  await page.goto(ORIGIN); await sleep(450);
  return { ctx, page, errors };
}
const logs = (page) => page.evaluate(() => (window.__log || []).join("\n"));
const level = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("rl_level")));
const press = async (page, k, n = 1) => { for (let i = 0; i < n; i++) { await page.keyboard.press(k); await sleep(30); } };




const findN = (pre, pred, lvl = 60, src = "boss") => { for (let i = 0; i < 600000; i++) { const it = I.generate(`${pre}|k${i}`, src, lvl); if (pred(it)) return it; } throw new Error("nf " + pre); };
const clone = (it) => JSON.parse(JSON.stringify(it));
// ---- 규칙 ----
check("nightmare: attack curve gentler than HP curve (40층 ×4.82, HP ×6.34)", M.nmAtkScale(40).toFixed(2) === "4.82" && M.nmScale(40).toFixed(2) === "6.34" && M.makeNightmare(M.MONSTERS[0], "normal", 40).atk === Math.round(M.makeMonster(M.MONSTERS[0], "normal", 75).atk * M.NIGHTMARE.atk * M.nmAtkScale(40)));
check("crowd defense: 2→0, 3→8%, 5→24%, 8→40%", [2, 3, 5, 8].map(M.crowdCut).join() === "0,0.08,0.24,0.4");
check("enhance max +12, gold from +11", I.ENHANCE.max === 12 && I.enhanceGold(10, { lvl: 50 }) === 0 && I.enhanceGold(11, { lvl: 100 }) > 0 && I.enhanceGold(12, { lvl: 100 }) === 2 * I.enhanceGold(11, { lvl: 100 }));
const L = findN("fg|n20", it => it.rarity === "legendary" && !it.ancient && !I.socketCount(it) && it.lines.length === 5, 95);
const a = clone(L); const c0 = I.reforgeCost(a); I.reforgeLine(a, 2); const c1 = I.reforgeCost(a); I.reforgeLine(a, 2); I.reforgeLine(a, 0);
const b = I.applyReforges(I.generate(L.seed, L.src, L.lvl, 4, L.r), [2, 2, 0]);
const cap = I.reforgeCost({ ...L, rf: Array(40).fill(2) });
check("reforge: replayable from rf, cost ×1.15 each time up to 5× the first", JSON.stringify(a.lines) === JSON.stringify(b.lines) && JSON.stringify(a.rf) === "[2,2,0]" && c1 === Math.round(c0 * 1.15 / 5) * 5 && Math.abs(cap - c0 * 5) <= 5, JSON.stringify([c0, c1, cap]));
check("one line per item: first reforged line is the only one (operator: any)", I.reforgeLineOf(L) === null && I.canReforgeLine(L, 0) && I.canReforgeLine(a, 2) && !I.canReforgeLine(a, 0) && I.canReforgeLine(a, 0, true));
check("reforge: other lines untouched, no duplicate stats, at most one element damage", a.lines[1][0] === L.lines[1][0] && new Set(a.lines.map(l => l[0])).size === 5 && a.lines.filter(([k]) => I.isElementDmg(k)).length <= 1);
const anc = findN("fga|n20", it => it.rarity === "legendary" && it.ancient, 95);
const ac = clone(anc); I.reforgeLine(ac, 1);
check("reforge keeps an ancient item ancient (new line at max)", ac.ancient === true && ac.lines[1][1] === I.lineRangeOf(ac.lines[1][0], ac)[1]);
const sk = findN("fgs|d60", it => it.rarity === "legendary" && I.socketCount(it) > 0);
const si = sk.lines.findIndex(([k]) => k === "socket");
check("reforge: socket line and bad indexes refused, rare items refused", I.reforgeLine(clone(sk), si) === null && I.applyReforges(clone(L), [9]) === null && I.reforgeLine(findN("fgr|d60", it => it.rarity === "rare"), 0) === null);

const sv = (d, rid, gold = 500, extra = {}) => JSON.stringify({ v: 1, season: 4, best: 75, clr: 1, nb: 10, run: { d, hp: 3000, mh: 3000, a: 30, g: gold, l: 40, x: 0, xn: 1e12, rid, k: 0, pp: 0, ...extra } });
const readInv = (page) => page.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => k.startsWith("rl_inv:")))));
const goldOf = async (page) => Number((await page.locator("#gold").innerText()).replace(/[^0-9]/g, ""));
const gemmed = { ...findN("fgg|d60", it => it.slot === "chest" && I.socketCount(it) >= 2 && it.rarity === "legendary"), gems: [["ruby", 2], ["ruby", 1]] };
const e10 = { ...findN("fge|d60", it => it.rarity === "epic"), enh: 10 };
try {
  const { ctx, page, errors } = await open("forgetest-a", { rl_save: sv(5, "fgA", 500000), rl_level: lv(5, "fgA", "normal"),
    "rl_inv:g:DEV": JSON.stringify({ bag: [L, gemmed, e10], equip: eqOf(), log: [], stones: 100, nmStones: 100 }) });
  // 포탈(P)로 로비에 나오면 포탈 바로 위(16,13). 포탈을 피해 왼쪽으로 돌아 대장간 문(16,19)까지
  await press(page, "p"); await sleep(250);
  await press(page, "ArrowLeft"); await press(page, "ArrowDown", 5); await press(page, "ArrowRight"); await press(page, "ArrowDown"); await sleep(250);
  check("walking into the forge door opens the inventory as 대장간", !(await page.locator("#inv-modal").isHidden()) && (await page.locator("#inv-title").innerText()) === "대장간", await page.locator("#inv-title").innerText());
  const pick = async (it) => { await page.locator(".bag-item", { hasText: I.itemName(it) }).first().click(); await sleep(120); };
  await pick(L);
  const cost = I.reforgeCost(L), g0 = await goldOf(page);
  check("forge section: one reforge button per extra line with the cost", (await page.locator("#inv-detail button.reforge-btn").count()) === 5 && (await page.locator("#inv-detail").innerText()).includes(`재련 (${cost.toLocaleString()}골드)`));
  await page.locator("#inv-detail button.reforge-btn").nth(3).click(); await sleep(150);
  let inv = await readInv(page); const got = inv.bag.find(x => x.id === L.id);
  const want = clone(L); I.reforgeLine(want, 3);
  check("reforge in game = rules (line 3 rerolled, rf saved, gold paid)", JSON.stringify(got.lines) === JSON.stringify(want.lines) && JSON.stringify(got.rf) === "[3]" && (await goldOf(page)) === g0 - cost, JSON.stringify([got.lines, want.lines, g0, await goldOf(page)]));
  check("after the first reforge only that line has a button, others say 재련 불가", (await page.locator("#inv-detail button.reforge-btn").count()) === 1 && ((await page.locator("#inv-detail").innerText()).match(/재련 불가/g) || []).length === 4);
  await pick(gemmed);
  const rc = I.socketResetCost(gemmed);
  await page.locator("#inv-detail button.socket-reset-btn").click(); await sleep(150);
  inv = await readInv(page);
  check("socket reset: gems gone, sockets stay, fee paid", !inv.bag.find(x => x.id === gemmed.id).gems && (await page.locator("#inv-detail").innerText()).includes("홈 0/") && (await goldOf(page)) === g0 - cost - rc);
  await pick(e10);
  const eg = I.enhanceGold(11, e10);
  check("+11 shows stones + gold", (await page.locator("#inv-detail").innerText()).includes(`+ ${eg.toLocaleString()}골드`) && (await page.locator("#inv-detail button", { hasText: `강화 (${eg.toLocaleString()}골드)` }).isEnabled()));
  await page.locator("#inv-detail button", { hasText: "강화 (" }).click(); await sleep(150);
  inv = await readInv(page);
  const ee = inv.bag.find(x => x.id === e10.id);
  check("+11 attempt: gold and 11 stones paid, tries counted", ee.tries === 1 && inv.stones === 100 - 11 && (await goldOf(page)) === g0 - cost - rc - eg);
  await page.locator("#inv-close").click(); await sleep(100);
  await press(page, "i"); await sleep(150);
  check("normal inventory (I) has no forge section", (await page.locator("#inv-title").innerText()) === "인벤토리" && !(await page.locator("#inv-detail").innerText()).includes("⚒ 대장간"));
  await page.screenshot({ path: `${OUT}/forge.png` });
  check("no page errors", errors.length === 0, errors.join("; "));
  await ctx.close();

  // 둘러싸임: 4마리가 붙어 있으면 −16%, 화면 위에 표시
  const ATK = 400;
  const foes = [[9, 10], [11, 10], [10, 9], [10, 11]].map(([x, y], i) => foe(x, y, { id: "rat", name: "쥐", hp: 1e7, maxHp: 1e7, atk: ATK, def: 0, nm: 0, kind: "normal" }));
  const r2 = await open("forgetest-b", { rl_save: sv(5, "fgB", 0, { hp: 100000, mh: 100000 }), rl_level: lv(5, "fgB", "normal", foes), "rl_inv:g:DEV": JSON.stringify({ bag: [], equip: eqOf(), log: [], stones: 0 }) });
  await press(r2.page, " "); await sleep(200);
  const st = await r2.page.locator("#status").innerText();
  const hits = [...(await logs(r2.page)).matchAll(/쥐에게 (\d+) 피해를 입음/g)].map(m => +m[1]);
  check("4 adjacent → HUD 🛡 둘러싸임 −16%", st.includes("둘러싸임 −16%"), st);
  check("each hit is cut by 16% (vs. no crowd)", hits.length === 4 && hits.every(h => h < ATK * 0.9 && h > ATK * 0.6), JSON.stringify(hits));
  check("no page errors (crowd)", r2.errors.length === 0, r2.errors.join("; "));
  await r2.ctx.close();
} finally { await browser.close(); }

try {
  const post = (guest, body) => fetch("http://127.0.0.1:8116/api.php?r=score", { method: "POST", headers: { "Content-Type": "application/json", Origin: ORIGIN.slice(0, -1), "X-Guest-Id": guest }, body: JSON.stringify(body) }).then(r => r.json());
  const me = (guest) => fetch(`http://127.0.0.1:8116/api.php?r=me`, { headers: { Origin: ORIGIN.slice(0, -1), "X-Guest-Id": guest } }).then(r => r.json());
  const player = async (guest, season = "") => (await fetch(`http://127.0.0.1:8116/api.php?r=player&id=${(await me(guest)).id}${season ? "&season=" + season : ""}`, { headers: { Origin: ORIGIN.slice(0, -1) } })).json();
  const ref = (it, extra = {}) => ({ seed: it.seed, src: it.src, lvl: it.lvl, v: 4, enh: it.enh || 0, id: it.id, r: it.r, ...extra });
  const want = clone(L); I.reforgeLine(want, 2); I.reforgeLine(want, 4);
  await post("forge-guest-01", { stage: 76, nm: 21, plvl: 40, gear: [ref(L, { rf: [2, 4], enh: 12 }), ref(e10, { rf: [0] })] });
  const p = await player("forge-guest-01", "nm");
  const it = p.gear?.items?.find(x => x.slot === L.slot);
  check("server: reforged lines replayed, +12 accepted, rare/epic reforge rejected", it && it.enh === 12 && it.lines.length === want.lines.length && it.lines.every((l, i) => l.text.startsWith(I.STATS[want.lines[i][0]].name)) && p.gear.rejected === 1, JSON.stringify([it?.lines?.map(l => l.text), want.lines, p.gear?.rejected]));
  await post("forge-guest-02", { stage: 76, nm: 21, plvl: 40, gear: [ref(L, { rf: [7] })] });
  check("server: bad reforge index rejected", (await player("forge-guest-02", "nm")).gear?.rejected === 1);
} finally { php.kill(); }
check("no php errors", !/Fatal|Warning|Notice|Deprecated/.test(phpErr), phpErr.slice(0, 400));
const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
