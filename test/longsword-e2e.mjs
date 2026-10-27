// 장검 (r5, 방패 전용): 규칙·JS==예전 r4·견고의 도끼 → 장검·장착 제한·서버 검증
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import fs from "node:fs"; import path from "node:path";
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
// ---- 서버 ----
const DIR = path.dirname(new URL(import.meta.url).pathname) + "/php";
const DB = path.join(DIR, "longsword.sqlite"); for (const f of [DB, DB + "-wal", DB + "-shm"]) fs.rmSync(f, { force: true });
const CFG = path.join(DIR, "config.longsword.php");
fs.writeFileSync(CFG, `<?php\n$c = require __DIR__ . '/config.test.php';\nreturn array_merge($c, ['db_dsn' => 'sqlite:${DB}']);\n`);
const php = spawn("php", ["-S", "127.0.0.1:8113", "-t", path.join(REPO, "ranking-php")], { env: { ...process.env, RANKING_CONFIG: CFG, TEST_JWT_SECRET: "longsword" }, stdio: ["ignore", "ignore", "pipe"] });
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
    const res = await fetch(`http://127.0.0.1:8113/api.php${u.search}`, { method: req.method(), headers: { ...req.headers(), origin: ORIGIN.slice(0, -1) }, body: req.method() === "GET" ? undefined : req.postData() });
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

const O = createRequire(import.meta.url)(path.join(path.dirname(new URL(import.meta.url).pathname), "fixtures", "items-r4.js"));   // 이번 변경 전 items.js (r4)
const findG = (pre, pred, lvl, v, r, src = "golden") => { for (let i = 0; i < 600000; i++) { const it = I.generate(`${pre}|k${i}`, src, lvl, v, r); if (pred(it)) return it; } throw new Error("nf " + pre); };
// ---- 규칙 ----
let ls = 0, w = 0, offLs = 0;
for (let i = 0; i < 20000; i++) { const it = I.generate(`ls|d40|k${i}`, "drop", 40); if (it.slot === "weapon") { w++; if (it.type === "longsword") ls++; } if (it.slot === "offhand" && it.type === "longsword") offLs++; }
check("r5: about 1/4 of weapons are longswords, never in the off hand", I.RULES_REV >= 5 && ls / w > 0.18 && ls / w < 0.32 && offLs === 0, `${ls}/${w} off ${offLs}`);
let same = 0, diff = [], sturdyW = 0;
for (let i = 0; i < 6000; i++) {
  const seed = `old|${i % 2 ? "n12" : "d40"}|k${i}`, a = O.generate(seed, "boss", 60, 4, 4), b = I.generate(seed, "boss", 60, 4, 4);
  if (a.set === "sturdy" && a.slot === "weapon") { sturdyW++; continue; }
  if (a.lines.filter(([k]) => I.isElementDmg(k)).length > 1) continue;   // 속성 피해 줄 여러 개 → 하나 (lock-e2e)
  if (JSON.stringify(a) === JSON.stringify(b)) same++; else diff.push(i);
}
check("r4 items regenerate exactly as before (except sturdy weapons)", diff.length === 0 && same > 5000, `diff ${diff.slice(0, 5)}`);
const oldSt = (() => { for (let i = 0; i < 900000; i++) { const it = O.generate(`st|d50|k${i}`, "boss", 50, 4, 4); if (it.set === "sturdy" && it.slot === "weapon") return it; } })();
const newSt = I.generate(oldSt.seed, oldSt.src, oldSt.lvl, 4, 4);
check("old 견고의 도끼 → 견고의 장검 (same id, longsword pool)", oldSt.type === "axe" && O.itemName(oldSt) === "견고의 도끼" && newSt.type === "longsword" && I.itemName(newSt) === "견고의 장검" && newSt.id === oldSt.id && newSt.main.every(([k]) => ["atk", "def", "crit", "allRes"].includes(k)), JSON.stringify(newSt.main));
const v3St = (() => { for (let i = 0; i < 900000; i++) { const it = I.generate(`st3|d20|k${i}`, "golden", 20, 3); if (it.set === "sturdy" && it.slot === "weapon") return it; } })();
check("v3 sturdy weapon is a longsword too", v3St.type === "longsword" && I.itemName(v3St) === "견고의 장검");
const L = findG("lsr|d60", it => it.type === "longsword" && it.rarity === "legendary" && !it.set, 60, undefined, undefined, "boss");
const ax = { ...L, type: "axe" }, dg = { ...L, type: "dagger" };
const r = (k, it) => I.mainRange(k, it);
check("longsword atk ×1.5 (axe ×1.3)", r("atk", L)[1] > r("atk", ax)[1] && Math.abs(r("atk", L)[1] - r("atk", dg)[1] * 1.5) <= 1, JSON.stringify([r("atk", L), r("atk", ax), r("atk", dg)]));
check("longsword crit/all res ranges", JSON.stringify(r("crit", L)) === "[12,15]" && JSON.stringify(r("allRes", L)) === "[6,11]");
const chest = { slot: "chest", rarity: "legendary", lvl: 60, v: 4, type: null };
check("longsword def = chest def range ×1.5", Math.abs(r("def", L)[1] - r("def", chest)[1] * 1.5) <= 1, JSON.stringify([r("def", L), r("def", chest)]));
const LR = findG("lsres|d60", it => it.type === "longsword" && it.main.some(([k]) => k === "allRes"), 60);
const resV = LR.main.find(([k]) => k === "allRes")[1];
check("all res main does not grow with enhancement", I.enhancedBase({ ...LR, enh: 10 }).allRes === resV && I.enhancedBase({ ...LR, enh: 10 }).atk > I.enhancedBase(LR).atk);
const offDg = findG("lsoff|d60", it => it.slot === "offhand" && it.type === "dagger" && it.rarity === "legendary", 60);
const shield = findG("lssh|d60", it => it.slot === "offhand" && it.type === "shield" && it.rarity === "legendary", 60);
const T1 = I.totals([L, offDg]).stats, T0 = I.totals([L]).stats, Td = I.totals([dg, offDg]).stats;
check("totals: longsword + off-hand weapon → off-hand ignored (no dual, no stats)", T1.dual === 0 && JSON.stringify(T1) === JSON.stringify(T0) && Td.dual === 1);
check("totals: longsword + shield counts the shield", I.totals([L, shield]).stats.parry > 0);
const G = I.totals([L, shield]).stats, G0 = I.totals([L]).stats, Gd = I.totals([{ ...L, type: "dagger" }, shield]).stats;
check("longsword + shield: lifesteal +10, cap 30 (guard); longsword alone or dagger + shield: no", G.guard === 1 && G.lifesteal === Math.min(30, G0.lifesteal + I.totals([shield]).stats.lifesteal + 10) && !G0.guard && !Gd.guard, JSON.stringify([G.lifesteal, G0.lifesteal, G.guard]));
const lsMax = [L, shield].map(it => ({ ...it, lines: it.lines.map(([k]) => ["lifesteal", 4]) }));
check("longsword + shield: lifesteal capped at 30, not 20", I.totals(lsMax).stats.lifesteal === 30);

const sv = (d, rid) => JSON.stringify({ v: 1, season: 4, best: 75, clr: 1, nb: 10, run: { d, hp: 300, mh: 1000, a: 30, g: 500, l: 40, x: 0, xn: 1e12, rid, k: 0, pp: 0 } });
try {
  // 예전 저장본: 견고의 도끼(옛 규칙으로 만든 그대로) + 보조 단검을 끼고 있음
  const oldDg = offDg;
  const { ctx, page, errors } = await open("longswordtest-a", { rl_save: sv(5, "lsA"), rl_level: lv(5, "lsA", "d"), "rl_inv:g:DEV": JSON.stringify({ bag: [L, shield], equip: eqOf({ ...oldSt, enh: 3, tries: 4 }, oldDg), log: [], stones: 0, nmStones: 0 }) });
  const inv = await page.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => k.startsWith("rl_inv:")))));
  check("load: saved 견고의 도끼 becomes 견고의 장검, keeps +3 and tries", inv.equip.weapon?.type === "longsword" && inv.equip.weapon.id === oldSt.id && inv.equip.weapon.enh === 3 && inv.equip.weapon.tries === 4, JSON.stringify(inv.equip.weapon));
  check("load: off-hand dagger moved to the bag", inv.equip.offhand === null && inv.bag.some(x => x.id === offDg.id), JSON.stringify(inv.equip.offhand) + " bag " + inv.bag.map(x => x.id));
  await page.locator("#update-note").waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
  check("banner mentions 장검", (await page.locator("#update-text").innerText()).includes("장검") && await page.locator("#update-note").isVisible());
  await press(page, "i"); await sleep(150);
  const pick = async (name) => { await page.locator(".bag-item", { hasText: name }).first().click(); await sleep(120); };
  await pick(I.itemName(offDg));
  await page.locator("#inv-detail button", { hasText: "장착" }).click(); await sleep(150);
  const inv2 = await page.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => k.startsWith("rl_inv:")))));
  check("equip off-hand dagger while longsword worn → longsword to bag + message", inv2.equip.offhand?.id === offDg.id && inv2.equip.weapon === null && inv2.bag.some(x => x.id === oldSt.id) && (await page.locator("#inv-detail").innerText()).includes("장검은 보조 손에 방패만"), await page.locator("#inv-detail").innerText());
  await pick(I.itemName(L));
  check("detail: 장검 note", (await page.locator("#inv-detail").innerText()).includes("장검: 보조 손에는 방패만 낄 수 있어요"));
  await page.locator("#inv-detail button", { hasText: "장착" }).click(); await sleep(150);
  const inv3 = await page.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => k.startsWith("rl_inv:")))));
  check("equip longsword while off-hand dagger worn → dagger to bag", inv3.equip.weapon?.id === L.id && inv3.equip.offhand === null && inv3.bag.some(x => x.id === offDg.id));
  await pick(I.itemName(shield));
  await page.locator("#inv-detail button", { hasText: "장착" }).click(); await sleep(150);
  const inv4 = await page.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => k.startsWith("rl_inv:")))));
  check("longsword + shield both worn", inv4.equip.weapon?.id === L.id && inv4.equip.offhand?.id === shield.id && (await page.locator("#inv-summary").innerText()).includes("패링"));
  await page.screenshot({ path: `${OUT}/longsword.png` });
  check("no page errors", errors.length === 0, errors.join("; "));
  await ctx.close();
} finally { await browser.close(); }

try {
  const post = (guest, body) => fetch("http://127.0.0.1:8113/api.php?r=score", { method: "POST", headers: { "Content-Type": "application/json", Origin: ORIGIN.slice(0, -1), "X-Guest-Id": guest }, body: JSON.stringify(body) }).then(r => r.json());
  const me = (guest) => fetch(`http://127.0.0.1:8113/api.php?r=me`, { headers: { Origin: ORIGIN.slice(0, -1), "X-Guest-Id": guest } }).then(r => r.json());
  const player = async (guest) => (await fetch(`http://127.0.0.1:8113/api.php?r=player&id=${(await me(guest)).id}`, { headers: { Origin: ORIGIN.slice(0, -1) } })).json();
  const ref = (it) => ({ seed: it.seed, src: it.src, lvl: it.lvl, v: it.v, enh: it.enh || 0, id: it.id, ...(it.r ? { r: it.r } : {}) });
  await post("longsword-guest-01", { stage: 70, plvl: 40, gear: [ref(L), ref(offDg)] });
  const p = await player("longsword-guest-01");
  check("server accepts r5 longsword, ignores the off-hand weapon (no dual)", p.gear?.rejected === 0 && p.gear?.items?.some(x => nameOf(x)?.includes("장검")) && p.gear?.stats?.dual === false, JSON.stringify(p.gear?.stats) + JSON.stringify(p.gear?.items?.map(nameOf)));
  await post("longsword-guest-02", { stage: 70, plvl: 40, gear: [ref(oldSt)] });
  const p2 = await player("longsword-guest-02");
  check("server: old sturdy ref shows as 견고의 장검", nameOf(p2.gear?.items?.[0]) === "견고의 장검", JSON.stringify(p2.gear?.items?.[0]));
} finally { php.kill(); }
check("no php errors", !/Fatal|Warning|Notice|Deprecated/.test(phpErr), phpErr.slice(0, 400));
const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
