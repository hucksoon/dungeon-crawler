// 자물쇠(레전더리·세트) + 속성 피해 줄은 하나만 (예전 아이템도)
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
const DB = path.join(DIR, "lock.sqlite"); for (const f of [DB, DB + "-wal", DB + "-shm"]) fs.rmSync(f, { force: true });
const CFG = path.join(DIR, "config.lock.php");
fs.writeFileSync(CFG, `<?php\n$c = require __DIR__ . '/config.test.php';\nreturn array_merge($c, ['db_dsn' => 'sqlite:${DB}']);\n`);
const php = spawn("php", ["-S", "127.0.0.1:8115", "-t", path.join(REPO, "ranking-php")], { env: { ...process.env, RANKING_CONFIG: CFG, TEST_JWT_SECRET: "lock" }, stdio: ["ignore", "ignore", "pipe"] });
let phpErr = ""; php.stderr.on("data", d => phpErr += d);
await sleep(700);

const MAP_W = 32, MAP_H = 24;
const map = Array.from({ length: MAP_H }, (_, y) => Array.from({ length: MAP_W }, (_, x) => (x === 0 || y === 0 || x === MAP_W - 1 || y === MAP_H - 1 ? 0 : 1)));
const lv = (d, rid, z, enemies = [], extra = {}, stairs = [28, 20]) => { const mm = map.map(r => r.slice()); mm[stairs[1]][stairs[0]] = 2; return JSON.stringify({ rid, d, z, turn: 0, map: mm.map(r => r.join("")).join(""), seen: "1".repeat(MAP_W * MAP_H), px: 10, py: 10, shop: null, enemies, items: [], ...extra }); };
const save = (d, rid, run = {}) => JSON.stringify({ v: 1, f50: 1, season: 4, best: 50, clr: 1, nb: 10, run: { d, hp: 300, mh: 1000, a: 30, g: 500, l: 40, x: 0, xn: 1e12, rid, k: 0, pp: 0, ...run } });
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
    const res = await fetch(`http://127.0.0.1:8115/api.php${u.search}`, { method: req.method(), headers: { ...req.headers(), origin: ORIGIN.slice(0, -1) }, body: req.method() === "GET" ? undefined : req.postData() });
    r.fulfill({ status: res.status, headers: { "content-type": "application/json", "access-control-allow-origin": "*" }, body: await res.text() }); });
  await ctx.route("https://login.xsolla.com/**", r => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await ctx.addInitScript(([seed, dev]) => { window.__shift = Number(sessionStorage.getItem("shift") || 0); const _now = Date.now; Date.now = () => _now() + window.__shift;
    if (sessionStorage.getItem("seeded")) return; sessionStorage.setItem("seeded", 1); sessionStorage.setItem("rl_scene", "dungeon");
    localStorage.setItem("rl_device_id", dev); localStorage.setItem(`rl_notice_v4:g:${dev}`, "1"); localStorage.setItem(`rl_notice_75:g:${dev}`, "1"); localStorage.setItem(`rl_notice_1019:g:${dev}`, "1"); localStorage.setItem(`rl_notice_1020:g:${dev}`, "1"); localStorage.setItem(`rl_notice_1020b:g:${dev}`, "1"); localStorage.setItem(`rl_notice_1020c:g:${dev}`, "1");
    for (const [k, v] of Object.entries(seed)) localStorage.setItem(k.replace("DEV", dev), v);
    window.__log = []; document.addEventListener("DOMContentLoaded", () => new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => window.__log.push(n.textContent)))).observe(document.getElementById("log"), { childList: true })); }, [seed, dev]);
  await page.goto(ORIGIN); await sleep(450);
  return { ctx, page, errors };
}
const logs = (page) => page.evaluate(() => (window.__log || []).join("\n"));
const level = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("rl_level")));
const press = async (page, k, n = 1) => { for (let i = 0; i < n; i++) { await page.keyboard.press(k); await sleep(30); } };



const O = createRequire(import.meta.url)(path.join(path.dirname(new URL(import.meta.url).pathname), "fixtures", "items-r5.js"));   // 속성 줄 정리 전 items.js
const dmgN = (it) => it.lines.filter(([k]) => I.isElementDmg(k)).length;
const findO = (pre, pred, lvl, r = 5) => { for (let i = 0; i < 600000; i++) { const it = O.generate(`${pre}|k${i}`, "boss", lvl, 4, r); if (pred(it)) return it; } throw new Error("nf " + pre); };
// ---- 규칙 ----
const multi = findO("lk|n20", it => dmgN(it) >= 2 && it.rarity === "legendary", 95);
const fixed = I.generate(multi.seed, multi.src, multi.lvl, 4, 5);
const big = Math.max(...multi.lines.filter(([k]) => I.isElementDmg(k)).map(l => l[1]));
check("old item with 2+ element damage lines → only the biggest kept, others become other stats", dmgN(fixed) === 1 && fixed.lines.find(([k]) => I.isElementDmg(k))[1] === big && fixed.id === multi.id && fixed.lines.length === multi.lines.length && I.itemElement(fixed) === O.itemElement(multi), JSON.stringify([multi.lines, fixed.lines]));
check("non-element lines and main stats unchanged", JSON.stringify(fixed.main) === JSON.stringify(multi.main) && multi.lines.every((l, i) => I.isElementDmg(l[0]) || JSON.stringify(fixed.lines[i]) === JSON.stringify(l)));
let many = 0, withEl = 0; for (let i = 0; i < 40000; i++) { const it = I.generate(`lkn|n30|k${i}`, "boss", 105); if (dmgN(it) > 1) many++; if (dmgN(it)) withEl++; }
check(`new nightmare items: never more than one element damage line (${withEl} with one)`, many === 0 && withEl > 5000);
let same = 0, tot = 0; for (let i = 0; i < 6000; i++) { const s = `lkd|${i % 2 ? "n12" : "d40"}|k${i}`; for (const r of [2, 3, 4, 5]) { const a = O.generate(s, "boss", 60, 4, r); if (dmgN(a) > 1) continue; tot++; if (JSON.stringify(a) === JSON.stringify(I.generate(s, "boss", 60, 4, r))) same++; } }
check("items with 0~1 element damage lines are unchanged", same === tot, `${same}/${tot}`);

const findN = (pre, pred, lvl = 60) => { for (let i = 0; i < 600000; i++) { const it = I.generate(`${pre}|k${i}`, "boss", lvl); if (pred(it)) return it; } throw new Error("nf " + pre); };
const A = findN("lka|d60", it => it.rarity === "legendary" && !it.ancient), B = findN("lkb|d60", it => it.rarity === "legendary" && !it.ancient && it.slot !== A.slot);
const C = findN("lkc|d60", it => it.rarity === "set"), D = findN("lkd|d60", it => it.rarity === "rare");
const sv = (d, rid) => JSON.stringify({ v: 1, f50: 1, season: 4, best: 50, clr: 1, nb: 10, run: { d, hp: 3000, mh: 3000, a: 30, g: 500, l: 40, x: 0, xn: 1e12, rid, k: 0, pp: 0 } });
const readInv = (page) => page.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => k.startsWith("rl_inv:")))));
try {
  const { ctx, page, errors } = await open("locktest-a", { rl_save: sv(5, "lkA"), rl_level: lv(5, "lkA", "normal"),
    "rl_inv:g:DEV": JSON.stringify({ bag: [A, B, C, D, { ...multi, enh: 4, tries: 5 }], equip: eqOf(), log: [], stones: 0, nmStones: 0 }) });
  let inv = await readInv(page);
  const e = inv.bag.find(x => x.id === multi.id);
  check("load: saved item with 2+ element damage lines remade (one left, +4 and tries kept)", e && dmgN(e) === 1 && e.enh === 4 && e.tries === 5 && JSON.stringify(e.lines) === JSON.stringify(fixed.lines));
  await press(page, "i"); await sleep(150);
  const pick = async (it) => { await page.locator(".bag-item", { hasText: I.itemName(it) }).first().click(); await sleep(120); };
  await pick(D);
  check("rare items have no lock button", (await page.locator("#inv-detail button.lock-btn").count()) === 0);
  await pick(A);
  await page.locator("#inv-detail button.lock-btn").click(); await sleep(120);
  inv = await readInv(page);
  check("lock: saved, 🔒 in the bag, sell button disabled", inv.bag.find(x => x.id === A.id).lock === true && (await page.locator(".bag-item", { hasText: I.itemName(A) }).innerText()).includes("🔒")
    && await page.locator("#inv-detail button", { hasText: "판매 (잠김)" }).isDisabled() && (await page.locator("#inv-detail button.lock-btn").innerText()).includes("잠금 풀기"));
  check("sell-all button counts the locked item out", (await page.locator("#inv-sell-all").innerText()).includes("잠금·보석 1개 빼고"));
  await page.locator("#inv-sell-all").click(); await sleep(150);
  const ask = await page.locator("#inv-sell-ask").innerText();
  check("sell-all asks about the other (unlocked) legendary/set only", ask.includes(`레전더리·세트 ${[B, C, multi].filter(x => x.rarity === "legendary" || x.rarity === "set").length}개도 같이 팔까요?`) && !ask.includes(I.itemName(A)), ask);
  await page.locator("#inv-sell-ask button", { hasText: "모두 판매" }).click(); await sleep(200);
  inv = await readInv(page);
  check("모두 판매 → only the locked legendary is left", inv.bag.length === 1 && inv.bag[0].id === A.id, inv.bag.map(x => x.id).join());
  await pick(A);
  await page.locator("#inv-detail button.lock-btn").click(); await sleep(120);
  inv = await readInv(page);
  check("unlock → sell button back", !inv.bag[0].lock && (await page.locator("#inv-detail button", { hasText: "판매 (" }).first().isEnabled()) && !(await page.locator(".bag-item").first().innerText()).includes("🔒"));
  await page.locator("#inv-detail button.lock-btn").click(); await sleep(120);
  await page.locator("#inv-detail button", { hasText: "장착" }).click(); await sleep(150);
  check("equipped legendary can be locked/unlocked too (lock kept)", (await page.locator("#inv-detail button.lock-btn").count()) === 1 && (await readInv(page)).equip[A.slot]?.lock === true);
  check("banner mentions lock", (await page.locator("#update-text").innerText()).includes("잠글 수"));
  await page.screenshot({ path: `${OUT}/lock.png` });
  check("no page errors", errors.length === 0, errors.join("; "));
  await ctx.close();
} finally { await browser.close(); }

try {
  const post = (guest, body) => fetch("http://127.0.0.1:8115/api.php?r=score", { method: "POST", headers: { "Content-Type": "application/json", Origin: ORIGIN.slice(0, -1), "X-Guest-Id": guest }, body: JSON.stringify(body) }).then(r => r.json());
  const me = (guest) => fetch(`http://127.0.0.1:8115/api.php?r=me`, { headers: { Origin: ORIGIN.slice(0, -1), "X-Guest-Id": guest } }).then(r => r.json());
  const player = async (guest, season = "") => (await fetch(`http://127.0.0.1:8115/api.php?r=player&id=${(await me(guest)).id}${season ? "&season=" + season : ""}`, { headers: { Origin: ORIGIN.slice(0, -1) } })).json();
  await post("lock-guest-001", { stage: 76, nm: 21, plvl: 40, gear: [{ seed: multi.seed, src: multi.src, lvl: multi.lvl, v: 4, enh: 0, id: multi.id, r: 5 }] });
  const p = await player("lock-guest-001", "nm");
  const it = p.gear?.items?.[0];
  check("server: old item shows one element damage line", it && it.lines.filter(l => ["fireDmg", "iceDmg", "boltDmg"].includes(l.k)).length === 1 && p.gear.rejected === 0, JSON.stringify(it?.lines));
} finally { php.kill(); }
check("no php errors", !/Fatal|Warning|Notice|Deprecated/.test(phpErr), phpErr.slice(0, 400));
const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
