// 화염의 세트 (r4, 나이트메어 전용): 파이어볼 2턴마다 3×3, 4세트 피해 +50%·불 저항, 5세트 화상 + 가방 기록 200개 제한
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import fs from "node:fs"; import path from "node:path";
const require = createRequire(process.env.NODE_PATH + "/");
const { chromium } = require("playwright");
const REPO = process.argv[2], OUT = process.argv[3];
const I = createRequire(import.meta.url)(path.join(REPO, "items.js"));
const M = createRequire(import.meta.url)(path.join(REPO, "monsters.js"));
const ORIGIN = "https://game.apacimtest.com/", API = "https://api.test/api.php";
const results = []; const check = (n, ok, x = "") => { results.push(!!ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x && !ok ? " — " + x : ""}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const EL = M.ELEMENTS;

// ---- 서버 ----
const DIR = path.dirname(new URL(import.meta.url).pathname) + "/php";
const DB = path.join(DIR, "fire.sqlite"); for (const f of [DB, DB + "-wal", DB + "-shm"]) fs.rmSync(f, { force: true });
const CFG = path.join(DIR, "config.fire.php");
fs.writeFileSync(CFG, `<?php\n$c = require __DIR__ . '/config.test.php';\nreturn array_merge($c, ['db_dsn' => 'sqlite:${DB}']);\n`);
const php = spawn("php", ["-S", "127.0.0.1:8111", "-t", path.join(REPO, "ranking-php")], { env: { ...process.env, RANKING_CONFIG: CFG, TEST_JWT_SECRET: "fire" }, stdio: ["ignore", "ignore", "pipe"] });
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
    const res = await fetch(`http://127.0.0.1:8111/api.php${u.search}`, { method: req.method(), headers: { ...req.headers(), origin: ORIGIN.slice(0, -1) }, body: req.method() === "GET" ? undefined : req.postData() });
    r.fulfill({ status: res.status, headers: { "content-type": "application/json", "access-control-allow-origin": "*" }, body: await res.text() }); });
  await ctx.route("https://login.xsolla.com/**", r => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await ctx.addInitScript(([seed, dev]) => { window.__shift = Number(sessionStorage.getItem("shift") || 0); const _now = Date.now; Date.now = () => _now() + window.__shift;
    if (sessionStorage.getItem("seeded")) return; sessionStorage.setItem("seeded", 1); sessionStorage.setItem("rl_scene", "dungeon");
    localStorage.setItem("rl_device_id", dev); localStorage.setItem(`rl_notice_v4:g:${dev}`, "1"); localStorage.setItem(`rl_notice_75:g:${dev}`, "1"); localStorage.setItem(`rl_notice_1019:g:${dev}`, "1"); localStorage.setItem(`rl_notice_1020:g:${dev}`, "1"); localStorage.setItem(`rl_notice_1020b:g:${dev}`, "1"); localStorage.setItem(`rl_notice_1020c:g:${dev}`, "1"); localStorage.setItem(`rl_notice_1021:g:${dev}`, "1");
    for (const [k, v] of Object.entries(seed)) localStorage.setItem(k.replace("DEV", dev), v);
    window.__log = []; document.addEventListener("DOMContentLoaded", () => new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => window.__log.push(n.textContent)))).observe(document.getElementById("log"), { childList: true })); }, [seed, dev]);
  await page.goto(ORIGIN); await sleep(450);
  return { ctx, page, errors };
}
const logs = (page) => page.evaluate(() => (window.__log || []).join("\n"));
const level = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("rl_level")));
const press = async (page, k, n = 1) => { for (let i = 0; i < n; i++) { await page.keyboard.press(k); await sleep(30); } };
const saveN = (rid, extra = {}) => JSON.stringify({ v: 1, season: 4, best: 75, clr: 1, nb: 10, run: { d: 5, hp: 3000, mh: 3000, a: 30, g: 0, l: 40, x: 0, xn: 1e12, rid, k: 0, pp: 0, z: "nm", ...extra } });
const find = (pre, pred, lvl) => { for (let i = 0; i < 200000; i++) { const it = I.generate(`${pre}|k${i}`, "golden", lvl); if (pred(it)) return it; } throw new Error("nf"); };
const nmW = find("nms|n5", it => it.slot === "weapon" && it.rarity === "legendary", 80);
const nmR = find("nms|n5", it => it.slot === "head" && it.rarity === "rare", 80);
const FB = I.FIREBALL;
const findSet = (slot, id, lvl = 80) => { for (let i = 0; i < 400000; i++) { const it = I.generate(`fire|n5|k${i}`, "boss", lvl); if (it.slot === slot && it.set === id) return it; } throw new Error("nf " + slot); };
const ARMOR = ["head", "chest", "arms", "pants", "boots"];
const fire = Object.fromEntries(ARMOR.map(sl => [sl, findSet(sl, "inferno")]));
const eqWith = (n) => { const e = Object.fromEntries(I.SLOTS.map(s => [s, null])); ARMOR.slice(0, n).forEach(sl => e[sl] = fire[sl]); return e; };
const invE = (n, extra = {}) => JSON.stringify({ bag: [], equip: eqWith(n), log: [], stones: 0, nmStones: 0, ...extra });
const target = (x, y, id) => ({ x, y, id: "titan", ch: "I", name: `과녁${id}`, color: "#fdd835", kind: "normal", hp: 1e6, maxHp: 1e6, atk: 0, def: 9999, xp: 1 });
const hp = async (page) => (await level(page)).enemies.map(e => e.hp);
const burns = async (page) => (await level(page)).enemies.map(e => !!e.burn);

// 규칙
check("rules: r4, inferno only on nightmare r4 armor", I.RULES_REV >= 4 && I.setsFor("head", true).includes("inferno") && !I.setsFor("head").includes("inferno") && !I.setsFor("weapon", true).includes("inferno"));
let r3Inferno = 0, r4NormalInferno = 0;
for (let i = 0; i < 20000; i++) { if (I.generate(`chk|n5|k${i}`, "boss", 80, 4, 3).set === "inferno") r3Inferno++; if (I.generate(`chk|d70|k${i}`, "boss", 70).set === "inferno") r4NormalInferno++; }
check("rules: r3 nightmare items and normal-dungeon items never become inferno (existing items unchanged)", r3Inferno === 0 && r4NormalInferno === 0);
check("rules: nightmare set armor = trial, inferno, frost, storm", ["trial", "inferno", "frost", "storm"].every(id => I.setsFor("chest", true).includes(id)) && I.setsFor("chest").join() === "trial");
check("rules: inferno names and bonuses", I.itemName(fire.chest).includes("화염의 갑옷") && I.SETS.inferno.bonuses.map(b => b.count).join() === "2,3,5");
const T5 = I.totals(Object.values(eqWith(5)).filter(Boolean)).stats, T4 = I.totals(Object.values(eqWith(4)).filter(Boolean)).stats, T2 = I.totals(Object.values(eqWith(2)).filter(Boolean)).stats;
const T3 = I.totals(Object.values(eqWith(3)).filter(Boolean)).stats;
check("totals: 2세트 fireball, 3세트 burn, 5세트 +50%·fire res +20 (4 = 3)", T2.fireball === 1 && !T2.fireballBurn && T3.fireballBurn === 1 && !T3.fireballPct && T4.fireballBurn === 1 && !T4.fireballPct && T5.fireballPct === 50 && T5.fireRes >= 20);

try {
  // 5세트: 3마리가 모여 있으면 한 번에, 화상까지
  let { ctx, page, errors } = await open("firetest-a", { rl_save: saveN("fireA"), rl_level: lv(5, "fireA", "nm", [target(12, 10, 1), target(13, 10, 2), target(12, 11, 3), target(16, 10, 4)]), "rl_inv:g:DEV": invE(5) });
  check("HUD: 🔥 파이어볼 준비됨", (await page.locator("#status").innerText()).includes("파이어볼 준비됨"));
  await press(page, " "); await sleep(200);
  let h = await hp(page);
  const lg = await logs(page);
  check("cast: nearest (2 tiles) center, 3×3 hits 3, far one (6 tiles) not hit", h[0] < 1e6 && h[1] < 1e6 && h[2] < 1e6 && h[3] === 1e6 && lg.includes("🔥 파이어볼! 3마리에게"), JSON.stringify(h));
  check("fireball ignores defense (def 9999 targets still take damage)", h[0] < 1e6 - 10);
  check("5세트: all hit targets burn", (await burns(page)).slice(0, 3).every(Boolean) && !(await burns(page))[3]);
  await page.screenshot({ path: path.join(OUT, "fireball.png") });
  const d1 = 1e6 - h[1];
  await press(page, " "); await sleep(200);
  check("next turn: cooldown (HUD 1턴), no cast", (await hp(page))[3] === 1e6 && (await page.locator("#status").innerText()).includes("파이어볼 1턴") && ((await logs(page)).match(/🔥 파이어볼!/g) || []).length === 1);
  await press(page, " "); await sleep(200);
  check("every 2 turns: cast again", ((await logs(page)).match(/🔥 파이어볼!/g) || []).length === 2);
  await press(page, "i"); await sleep(150);
  check("inventory: 화염의 세트 (5/5), fireball row", (await page.locator("#inv-summary").innerText()).includes("화염의 세트 (5/5)") && (await page.locator("#inv-summary").innerText()).includes("파이어볼: 2턴마다 3×3"));
  check("no page errors", errors.length === 0, errors.join("; "));
  await ctx.close();

  // 2세트: 화상 없음, 피해는 4세트보다 작음. 3칸 넘으면 안 나감
  ({ ctx, page, errors } = await open("firetest-b", { rl_save: saveN("fireB"), rl_level: lv(5, "fireB", "nm", [target(14, 10, 1)]), "rl_inv:g:DEV": invE(2) }));
  await press(page, " "); await sleep(200);
  check("out of range (4 tiles): no cast, stays ready", (await hp(page))[0] === 1e6 && (await page.locator("#status").innerText()).includes("준비됨"));
  await press(page, "ArrowRight"); await sleep(200);   // 3칸이 됨 → 바로 나감
  const h2 = (await hp(page))[0];
  check("2세트: casts when in range, no burn", h2 < 1e6 && !(await burns(page))[0]);
  check("no page errors (2세트)", errors.length === 0, errors.join("; "));
  await ctx.close();

  // 가방 기록은 200개까지
  const bigLog = Array.from({ length: 500 }, (_, i) => ({ t: "x", ev: "get", id: `id${i}` }));
  ({ ctx, page, errors } = await open("firetest-c", { rl_save: saveN("fireC"), rl_level: lv(5, "fireC", "nm"), "rl_inv:g:DEV": invE(0, { log: bigLog, bag: [fire.head] }) }));
  await press(page, "i"); await sleep(150);
  await page.locator(".bag-item").first().click(); await sleep(100);
  await page.locator("#inv-detail button", { hasText: "장착" }).click(); await sleep(150);
  const st = JSON.parse(await page.evaluate(() => localStorage.getItem("rl_inv:g:firetest-c")));
  check("inventory log trimmed to the last 200", st.log.length === 200 && st.log[st.log.length - 1].ev === "equip" || st.log.length === 200, String(st.log.length));
  await ctx.close();

  // ---- 서리의 세트: 프로스트 노바 (주변 8칸), 5세트 느려짐 ----
  const frost = Object.fromEntries(ARMOR.map(sl => [sl, findSet(sl, "frost")]));
  const storm = Object.fromEntries(ARMOR.map(sl => [sl, findSet(sl, "storm")]));
  const eqOfSet = (set, n) => { const e = Object.fromEntries(I.SLOTS.map(s => [s, null])); ARMOR.slice(0, n).forEach(sl => e[sl] = set[sl]); return e; };
  const invS = (set, n) => JSON.stringify({ bag: [], equip: eqOfSet(set, n), log: [], stones: 0, nmStones: 0 });
  ({ ctx, page, errors } = await open("firetest-d", { rl_save: saveN("fireD"), rl_level: lv(5, "fireD", "nm", [target(11, 10, 1), target(10, 11, 2), target(12, 10, 3)]), "rl_inv:g:DEV": invS(frost, 5) }));
  check("HUD: ❄ 노바 준비됨", (await page.locator("#status").innerText()).includes("노바 준비됨"));
  await press(page, " "); await sleep(200);
  let L = await level(page);
  check("nova: hits the 2 adjacent only (not the one 2 tiles away)", L.enemies[0].hp < 1e6 && L.enemies[1].hp < 1e6 && L.enemies[2].hp === 1e6 && (await logs(page)).includes("❄ 프로스트 노바! 2마리에게"), JSON.stringify(L.enemies.map(e => e.hp)));
  check("nova 5세트: hit enemies slowed", L.enemies[0].slow > 0 && L.enemies[1].slow > 0 && !(L.enemies[2].slow > 0));
  await page.screenshot({ path: path.join(OUT, "nova.png") });
  check("no page errors (frost)", errors.length === 0, errors.join("; "));
  await ctx.close();
  ({ ctx, page, errors } = await open("firetest-e", { rl_save: saveN("fireE"), rl_level: lv(5, "fireE", "nm", [target(12, 10, 1)]), "rl_inv:g:DEV": invS(frost, 2) }));
  await press(page, " "); await sleep(200);
  check("nova: nobody adjacent → no cast, stays ready", (await hp(page))[0] === 1e6 && (await page.locator("#status").innerText()).includes("노바 준비됨"));
  await ctx.close();

  // ---- 뇌전의 세트: 체인 라이트닝 ----
  ({ ctx, page, errors } = await open("firetest-f", { rl_save: saveN("fireF"), rl_level: lv(5, "fireF", "nm", [target(12, 10, 1), target(13, 10, 2), target(14, 10, 3)]), "rl_inv:g:DEV": invS(storm, 2) }));
  await press(page, " "); await sleep(200);
  let hs = await hp(page);
  check("chain 2세트: 2 strikes on 2 different enemies (nearest first)", hs[0] < 1e6 && hs[1] < 1e6 && hs[2] === 1e6 && (await logs(page)).includes("⚡ 체인 라이트닝! 2번 튕겨"), JSON.stringify(hs));
  check("chain 2세트: no shock", !(await level(page)).enemies.some(e => e.shock));
  await ctx.close();
  ({ ctx, page, errors } = await open("firetest-g", { rl_save: saveN("fireG"), rl_level: lv(5, "fireG", "nm", [target(12, 10, 1)]), "rl_inv:g:DEV": invS(storm, 2) }));
  await press(page, " "); await sleep(200);
  const one2 = 1e6 - (await hp(page))[0];
  check("chain 2세트, one enemy: 1 strike only", (await logs(page)).includes("⚡ 체인 라이트닝! 1번 튕겨"));
  await ctx.close();
  ({ ctx, page, errors } = await open("firetest-h", { rl_save: saveN("fireH"), rl_level: lv(5, "fireH", "nm", [target(12, 10, 1)]), "rl_inv:g:DEV": invS(storm, 5) }));
  await press(page, " "); await sleep(200);
  L = await level(page);
  const turnNow = L.turn;
  check("chain 5세트, one enemy: hit 4 times + shock", (await logs(page)).includes("⚡ 체인 라이트닝! 4번 튕겨") && L.enemies[0].shock > turnNow, JSON.stringify([L.enemies[0].hp, L.enemies[0].shock, turnNow]));
  check("HUD: ⚡ 체인 2턴 after cast", (await page.locator("#status").innerText()).includes("체인 2턴"));
  await page.screenshot({ path: path.join(OUT, "chain.png") });
  await press(page, "i"); await sleep(150);
  check("inventory: 뇌전의 세트 (5/5), chain row with 4번 튕김 · 감전", (await page.locator("#inv-summary").innerText()).includes("뇌전의 세트 (5/5)") && (await page.locator("#inv-summary").innerText()).includes("4번 튕김"));
  check("no page errors (storm)", errors.length === 0, errors.join("; "));
  await ctx.close();
} finally { await browser.close(); }

// 서버: r4 화염 세트 아이템 검증, 장비 보기에 세트
try {
  const post = (guest, body) => fetch("http://127.0.0.1:8111/api.php?r=score", { method: "POST", headers: { "Content-Type": "application/json", Origin: ORIGIN.slice(0, -1), "X-Guest-Id": guest }, body: JSON.stringify(body) }).then(r => r.json());
  const me = (guest, season = "") => fetch(`http://127.0.0.1:8111/api.php?r=me${season ? "&season=" + season : ""}`, { headers: { Origin: ORIGIN.slice(0, -1), "X-Guest-Id": guest } }).then(r => r.json());
  const player = async (guest, season) => (await fetch(`http://127.0.0.1:8111/api.php?r=player&id=${(await me(guest, season)).id}${season ? "&season=" + season : ""}`, { headers: { Origin: ORIGIN.slice(0, -1) } })).json();
  const ref = (it) => ({ seed: it.seed, src: it.src, lvl: it.lvl, v: 4, enh: 0, id: it.id, r: it.r });
  await post("fire-guest-0001", { stage: 76, nm: 6, plvl: 40, gear: ARMOR.map(sl => ref(fire[sl])) });
  const p = await player("fire-guest-0001", "nm");
  const fs5 = p.gear?.sets?.find(s => s.name === "화염의 세트");
  check("server: r4 fire set items verify, set 5/5 with bonuses", p.gear && !p.gear.rejected && p.gear.items.length === 5 && fs5?.count === 5 && fs5.bonuses.every(b => b.on), JSON.stringify(p.gear?.sets));
  const findSet2 = (slot, id) => { for (let i = 0; i < 400000; i++) { const it = I.generate(`fire|n5|k${i}`, "boss", 80); if (it.slot === slot && it.set === id) return it; } };
  await post("fire-guest-0003", { stage: 76, nm: 6, plvl: 40, gear: [...["head", "chest", "arms"].map(sl => ref(findSet2(sl, "frost"))), ...["pants", "boots"].map(sl => ref(findSet2(sl, "storm")))] });
  const p3 = await player("fire-guest-0003", "nm");
  check("server: frost 3 + storm 2 verify, both sets listed", !p3.gear.rejected && p3.gear.sets.find(x => x.name === "서리의 세트")?.count === 3 && p3.gear.sets.find(x => x.name === "뇌전의 세트")?.count === 2, JSON.stringify(p3.gear.sets));
  await post("fire-guest-0002", { stage: 76, nm: 6, plvl: 40, gear: [{ ...ref(fire.head), r: 3 }] });
  check("server: same seed as r3 is a different item → rejected (id mismatch)", (await player("fire-guest-0002", "nm")).gear.rejected === 1);
} finally { php.kill(); }
check("no php errors", !/Fatal|Warning|Notice|Deprecated/.test(phpErr), phpErr.slice(0, 400));
const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
