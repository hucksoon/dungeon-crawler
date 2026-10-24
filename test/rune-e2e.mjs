// 룬: 가~하 14개 규칙·드롭 확률(하 0.3%)·3:1 합치기·나이트메어 50층 보스 2개·줍기·홈에 넣기·50층 문·서버 검증
import { createRequire } from "node:module";
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs"; import path from "node:path";
const require = createRequire(process.env.NODE_PATH + "/");
const { chromium } = require("playwright");
const REPO = process.argv[2], OUT = process.argv[3];
const I = createRequire(import.meta.url)(path.join(REPO, "items.js"));
const M = createRequire(import.meta.url)(path.join(REPO, "monsters.js"));
const ORIGIN = "https://game.apacimtest.com/";
const results = []; const check = (n, ok, x = "") => { results.push(!!ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x && !ok ? " — " + x : ""}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const DIR = path.dirname(new URL(import.meta.url).pathname) + "/php";
const DB = path.join(DIR, "runes.sqlite"); for (const f of [DB, DB + "-wal", DB + "-shm"]) fs.rmSync(f, { force: true });
const CFG = path.join(DIR, "config.runes.php");
fs.writeFileSync(CFG, `<?php\n$c = require __DIR__ . '/config.test.php';\nreturn array_merge($c, ['db_dsn' => 'sqlite:${DB}']);\n`);
const php = spawn("php", ["-S", "127.0.0.1:8119", "-t", path.join(REPO, "ranking-php")], { env: { ...process.env, RANKING_CONFIG: CFG, TEST_JWT_SECRET: "runes" }, stdio: ["ignore", "ignore", "pipe"] });
let phpErr = ""; php.stderr.on("data", d => phpErr += d);
await sleep(700);

// ---- 규칙 ----
const R = I.RUNES, P = I.runePlan;
check("14 runes 가~하", R.length === 14 && R.map(r => r.name).join("") === "가나다라마바사아자차카타파하");
const odds = I.RUNE_ODDS;
check(`odds: sum 1, 가 ~30%, 하 ~0.3% (${(odds[0] * 100).toFixed(2)} / ${(odds[13] * 100).toFixed(3)})`, Math.abs(odds.reduce((a, b) => a + b) - 1) < 1e-9 && Math.abs(odds[0] - 0.3005) < 0.002 && Math.abs(odds[13] - 0.003) < 0.0002 && odds.every((p, k) => !k || p < odds[k - 1]));
const cnt = Array(14).fill(0); let n = 0;
for (let i = 0; i < 100000; i++) { const r = I.rollRunes(`t|n50|r${i}`); n += r.length; for (const k of r) cnt[k]++; }
check(`rollRunes: always ${I.RUNE_DROP.count}, observed 가 ${(cnt[0] / n * 100).toFixed(1)}% 하 ${(cnt[13] / n * 100).toFixed(2)}%`, n === 200000 && Math.abs(cnt[0] / n - 0.3) < 0.01 && cnt[13] / n > 0.0022 && cnt[13] / n < 0.0038);
check("rollRunes is seeded (same seed → same runes)", JSON.stringify(I.rollRunes("x|n50|r3")) === JSON.stringify(I.rollRunes("x|n50|r3")));
const z = (o) => { const a = Array(14).fill(0); for (const [k, v] of Object.entries(o)) a[k] = v; return a; };
check("runePlan: have it → use it", JSON.stringify(P(z({ 4: 1 }), 4).used) === JSON.stringify(z({ 4: 1 })));
check("runePlan: 9 가 → 다 (3:1 twice)", JSON.stringify(P(z({ 0: 10 }), 2)) === JSON.stringify({ left: z({ 0: 1 }), used: z({ 0: 9 }) }));
check("runePlan: higher first (나 2 + 가 3 → 다)", JSON.stringify(P(z({ 0: 5, 1: 2 }), 2)) === JSON.stringify({ left: z({ 0: 2 }), used: z({ 0: 3, 1: 2 }) }));
check("runePlan: not enough (가 2 + 나 2 → 다) / no splitting down", P(z({ 0: 2, 1: 2 }), 2) === null && P(z({ 13: 1 }), 0) === null && P(undefined, 0) === null);
check("runePlan: 하 from 3^13 가", P(z({ 0: 3 ** 13 }), 13)?.used[0] === 3 ** 13 && P(z({ 0: 3 ** 13 - 1 }), 13) === null);
const find = (pre, pred, lvl = 100) => { for (let i = 0; i < 600000; i++) { const it = I.generate(`${pre}|k${i}`, "boss", lvl); if (pred(it)) return it; } throw new Error("nf " + pre); };
const ch = find("rc|n40", it => it.slot === "chest" && I.socketCount(it) === 4), wpn = find("rw|n40", it => it.slot === "weapon" && I.socketCount(it) === 2);
check("rune effect is the same in weapon and armor", JSON.stringify(I.gemStats({ ...wpn, gems: [["rune", 4]] })) === JSON.stringify(I.gemStats({ ...ch, gems: [["rune", 4]] })) && JSON.stringify(I.gemStats({ ...ch, gems: [["rune", 4]] })) === '{"atkPct":8}');
check("runes and gems mix in one item", JSON.stringify(I.gemStats({ ...ch, gems: [["ruby", 2], ["rune", 13], ["rune", 12]] })) === JSON.stringify({ hpPct: 18, atkPct: 12, defPct: 12, fireDmg: 10, iceDmg: 10, boltDmg: 10 }));
check("bad rune entries ignored (index 14, wrong shape)", !I.isRune(["rune", 14]) && !I.isRune(["rune", "1"]) && JSON.stringify(I.gemStats({ ...ch, gems: [["rune", 14], ["rune", -1]] })) === "{}");
const fireSet = Object.entries(I.SETS.inferno.pieces).map(([slot]) => find(`rf${slot}|n40`, it => it.set === "inferno" && it.slot === slot));
const T1 = I.totals([...fireSet, { ...wpn, gems: [["rune", 11], ["rune", 11]] }]).stats, T0 = I.totals([...fireSet, wpn]).stats;
check("타 rune: skill damage adds to fireball/nova/chain", T1.fireballPct - T0.fireballPct === 30 && T1.novaPct - T0.novaPct === 30 && T1.chainPct - T0.chainPct === 30 && T1.skillPct === 30);
const TK = I.totals([{ ...ch, gems: Array(4).fill(["rune", 10]) }, { ...wpn, gems: [["rune", 10], ["rune", 10]] }, find("rs|n40", it => it.type === "shield" && I.socketCount(it) === 4)]).stats;
check("카 rune: damage reduction still capped at 30%", I.totals([{ ...ch, gems: Array(4).fill(["rune", 10]) }]).stats.dmgReduce === 16 && TK.dmgReduce <= 30);
// 룬워드: 이름 초성 = 룬, 커먼 + 홈 개수 = 글자 수 + 베이스
const RW = I.RUNEWORDS, seq = (w) => w.runes.map(k => R[k].name).join("");
check("11 runewords (치유 removed in dc#53), runes from the name's initial consonants", RW.length === 11 && !RW.some(w => w.name === "치유") && seq(RW[0]) === "차하마자" && seq(RW[1]) === "파파자아" && seq(RW[7]) === "다아가아" && RW[7].name === "도원결의" && JSON.stringify(I.runesOfName("수수께끼")) === "[6,6,0,0]" && JSON.stringify(I.runesOfName("신기루")) === "[6,0,3]");
const units = (w) => w.runes.reduce((a, k) => a + 3 ** k, 0);
check("runewords get cheaper by rank, top 5 use high runes (차~하)", RW.every((w, i) => !i || units(w) < units(RW[i - 1])) && RW.slice(0, 5).every(w => w.runes.some(k => k >= 9)));
const findC = (pre, pred) => find(pre, it => it.rarity === "common" && pred(it));
const cChest4 = findC("rwc|n40", it => it.slot === "chest" && I.socketCount(it) === 4), cHead2 = findC("rwh|n40", it => it.slot === "head" && I.socketCount(it) === 2);
const rChest4 = find("rwr|n40", it => it.slot === "chest" && it.rarity === "rare" && I.socketCount(it) === 4), cChest3 = findC("rwc3|n40", it => it.slot === "chest" && I.socketCount(it) === 3);
// dc#51: 홈이 룬보다 많아도 됨 → 홈 4개 갑옷은 2글자 갑옷 룬워드(태산·몰래)도
check("runewordsFor: common chest 4 → 천하무적·태산·몰래, common helm 2 → 기억", I.runewordsFor(cChest4).map(w => w.name).join() === "천하무적,태산,몰래" && I.runewordsFor(cHead2).map(w => w.name).join() === "기억");
check("not a base: rare chest 4, no sockets; common chest 3 → 2-rune chest words only (태산·몰래)", !I.runewordsFor(rChest4).length && I.runewordsFor(cChest3).map(w => w.name).join() === "태산,몰래" && !I.runewordsFor(find("rwn|n40", it => it.rarity === "common" && !I.socketCount(it))).length);
check("runewordsFor follows the runes already put (right order keeps it, wrong rune or gem breaks it)", I.runewordsFor({ ...cChest4, gems: [["rune", 9], ["rune", 13]] }).length === 1 && !I.runewordsFor({ ...cChest4, gems: [["rune", 13]] }).length && !I.runewordsFor({ ...cChest4, gems: [["ruby", 0]] }).length
  && I.runewordsFor({ ...cHead2, gems: [["rune", 0]] }).map(w => w.name).join() === "기억" && !I.runewordsFor({ ...cHead2, gems: [["rune", 9]] }).length);
// JS == PHP (룬이 든 장비의 합계)
const sets = [[{ ...ch, gems: [["rune", 13], ["rune", 7], ["ruby", 1], ["rune", 9]] }, { ...wpn, gems: [["rune", 11], ["rune", 8]] }], [...fireSet, { ...wpn, gems: [["rune", 11], ["rune", 12]] }]];
const phpTot = (eq) => JSON.parse(execFileSync("php", ["-r", `require "${path.join(REPO, "ranking-php/rules.php")}"; echo json_encode(r_totals(json_decode($argv[1], true))["stats"]);`, JSON.stringify(eq)]).toString());
check("server rules: totals with runes match the game (JS == PHP)", sets.every(eq => { const a = I.totals(eq).stats, b = phpTot(eq); return Object.keys(a).every(k => a[k] === b[k]); }), JSON.stringify(sets.map(eq => { const a = I.totals(eq).stats, b = phpTot(eq); return Object.keys(a).filter(k => a[k] !== b[k]).map(k => [k, a[k], b[k]]); })));

// ---- 게임 ----
const MAP_W = 32, MAP_H = 24;
const map = Array.from({ length: MAP_H }, (_, y) => Array.from({ length: MAP_W }, (_, x) => (x === 0 || y === 0 || x === MAP_W - 1 || y === MAP_H - 1 ? 0 : 1)));
const lv = (d, rid, z, enemies = [], extra = {}) => { const mm = map.map(r => r.slice()); mm[20][28] = 2; return JSON.stringify({ rid, d, z, turn: 0, map: mm.map(r => r.join("")).join(""), seen: "1".repeat(MAP_W * MAP_H), px: 10, py: 10, shop: null, enemies, items: [], ...extra }); };
const save = (d, rid, extra = {}, run = {}) => JSON.stringify({ v: 1, season: 4, best: 75, clr: 1, nb: 50, ...extra, run: { d, hp: 9e6, mh: 9e6, a: 30, g: 500, l: 40, x: 0, xn: 1e12, rid, k: 0, pp: 0, z: "nm", ...run } });
const eqOf = (...its) => { const e = Object.fromEntries(I.SLOTS.map(s => [s, null])); for (const it of its) e[it.slot] = it; return e; };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
async function open(dev, seed) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 1000 } }); const page = await ctx.newPage(); const errors = [];
  page.on("pageerror", e => errors.push(e.message)); page.on("dialog", d => d.accept());
  await ctx.route(ORIGIN + "**", r => { const f = new URL(r.request().url()).pathname.slice(1) || "index.html";
    if (f === "ranking-config.js") return r.fulfill({ contentType: "text/javascript", body: `window.RANKING_API = "";` });
    const p = path.join(REPO, f); if (!fs.existsSync(p)) return r.fulfill({ status: 404, body: "" });
    r.fulfill({ contentType: f.endsWith(".js") ? "text/javascript" : "text/html", body: fs.readFileSync(p) }); });
  await ctx.route("https://login.xsolla.com/**", r => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await ctx.addInitScript(([seed, dev]) => { if (sessionStorage.getItem("seeded")) return; sessionStorage.setItem("seeded", 1); sessionStorage.setItem("rl_scene", "dungeon");
    localStorage.setItem("rl_device_id", dev); for (const k of ["rl_notice_v4", "rl_notice_75", "rl_notice_1021g", "rl_notice_1021h", "rl_notice_1021i", "rl_notice_1021j", "rl_notice_1022a", "rl_notice_1022b", "rl_notice_1023a", "rl_notice_1023b", "rl_notice_1023c", "rl_notice_1023d"]) localStorage.setItem(`${k}:g:${dev}`, "1");
    for (const [k, v] of Object.entries(seed)) localStorage.setItem(k.replace("DEV", dev), v);
    window.__log = []; document.addEventListener("DOMContentLoaded", () => new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => window.__log.push(n.textContent)))).observe(document.getElementById("log"), { childList: true })); }, [seed, dev]);
  await page.goto(ORIGIN); await sleep(450);
  return { ctx, page, errors };
}
const logs = (page) => page.evaluate(() => window.__log.join("\n"));
const stored = (page, k) => page.evaluate(k => JSON.parse(localStorage.getItem(k) || "null"), k);
const readInv = (page) => page.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => k.startsWith("rl_inv:")))));
const inLobby = (page) => page.evaluate(() => document.body.classList.contains("in-lobby"));
const press = async (page, k, n = 1) => { for (let i = 0; i < n; i++) { await page.keyboard.press(k); await sleep(30); } };
async function portalOut(page) {
  await page.keyboard.press("p"); await sleep(150);
  const L = await page.evaluate(() => JSON.parse(localStorage.getItem("rl_level")));
  if (L?.tp) await page.keyboard.press(L.tp.x > L.px ? "ArrowRight" : L.tp.x < L.px ? "ArrowLeft" : L.tp.y > L.py ? "ArrowDown" : "ArrowUp"); await sleep(200);
}
// 로비 포탈 위 (16,13) → 오른쪽 12칸 (28,13) → 위로 두 번: 나이트메어 오른쪽 문 (28,11)
async function walkToRuneDoor(page) { await portalOut(page); await press(page, "ArrowRight", 12); await press(page, "ArrowUp"); await page.keyboard.press("ArrowUp"); await sleep(300); }
const v4 = I.generate("rnv4|shop|d70|s1", "golden", 70);
try {
  // 1. 나이트메어 50층 보스 → 룬 2개 (무지개 ♦), 49층 보스는 없음
  const boss = (d) => ({ x: 11, y: 10, ...M.makeNightmareBoss(d), hp: 1 });
  let { ctx, page, errors } = await open("runetest-a", { rl_save: save(50, "rnA"), rl_level: lv(50, "rnA", "nm", [boss(50)]), "rl_inv:g:DEV": JSON.stringify({ bag: [], equip: eqOf(v4), log: [], stones: 0 }) });
  await press(page, "ArrowRight"); await sleep(250);
  let L = await stored(page, "rl_level");
  const runes = L.items.filter(i => i.type === "rune");
  check("nightmare 50 boss drops 2 runes on the floor", runes.length === 2 && runes.every(r => Number.isInteger(r.rune) && r.rune >= 0 && r.rune < 14) && ((await logs(page)).match(/룬을\(를\) 떨어뜨렸다/g) || []).length === 2, JSON.stringify(L.items.map(i => i.type)));
  await page.screenshot({ path: `${OUT}/rune-drop.png` });
  check("no page errors (drop)", errors.length === 0, errors.join("; "));
  await ctx.close();
  ({ ctx, page, errors } = await open("runetest-b", { rl_save: save(49, "rnB"), rl_level: lv(45, "rnB", "nm", [boss(45)]), "rl_inv:g:DEV": JSON.stringify({ bag: [], equip: eqOf(v4), log: [], stones: 0 }) }));
  await press(page, "ArrowRight"); await sleep(250);
  check("nightmare 45 boss: no runes", !(await stored(page, "rl_level")).items.some(i => i.type === "rune"));
  await ctx.close();
  ({ ctx, page, errors } = await open("runetest-c", { rl_save: save(50, "rnC", {}, { z: undefined }), rl_level: lv(50, "rnC", "normal", [{ x: 11, y: 10, ...M.makeBoss(50), hp: 1 }]), "rl_inv:g:DEV": JSON.stringify({ bag: [], equip: eqOf(v4), log: [], stones: 0 }) }));
  await press(page, "ArrowRight"); await sleep(250);
  check("normal dungeon 50 boss: no runes", !(await stored(page, "rl_level")).items.some(i => i.type === "rune"));
  await ctx.close();

  // 2. 줍기 → 룬 주머니, 인벤토리에서 3:1로 합쳐 넣기
  ({ ctx, page, errors } = await open("runetest-d", { rl_save: save(50, "rnD"), rl_level: lv(50, "rnD", "nm", [], { items: [{ x: 9, y: 10, type: "rune", rune: 13 }] }),
    "rl_inv:g:DEV": JSON.stringify({ bag: [ch], equip: eqOf(v4), log: [], stones: 0, runes: z({ 0: 5, 1: 2 }) }) }));
  await page.screenshot({ path: `${OUT}/rune-floor.png` });
  await press(page, "ArrowLeft"); await sleep(150);
  let inv = await readInv(page);
  check("walk onto a rune → rune pouch (하 1)", inv.runes[13] === 1 && (await logs(page)).includes("하 룬을(를) 주웠다"), JSON.stringify(inv.runes));
  await press(page, "i"); await sleep(150);
  check("stats tab: 룬 주머니 (8개)", (await page.locator("#inv-summary").innerText()).includes("룬 주머니 (8개)"));
  await page.locator(".bag-item").first().click(); await sleep(120);
  await page.selectOption("#inv-detail select.gem-kind", "rune"); await sleep(80);
  check("rune list in the second select (가 룬 (5) … 하 룬 (1))", (await page.locator("#inv-detail select.gem-grade option").count()) === 14 && (await page.locator("#inv-detail select.gem-grade option").first().innerText()) === "가 룬 (5)");
  await page.selectOption("#inv-detail select.gem-grade", "2"); await sleep(80);
  let d = await page.locator("#inv-detail").innerText();
  check("plan: 다 룬 from 가 3 + 나 2", d.includes("가 룬 3개, 나 룬 2개를 합쳐서 넣어요") && d.includes("다 룬: 최대 HP +8%"), d);
  await page.locator("#inv-detail button.gem-put").click(); await sleep(150);
  inv = await readInv(page);
  let item = inv.bag.find(x => x.id === ch.id);
  check("put: pouch 가 5 나 2 → 가 2, socket has 다 룬", JSON.stringify(inv.runes) === JSON.stringify(z({ 0: 2, 13: 1 })) && JSON.stringify(item.gems) === '[["rune",2]]', JSON.stringify([inv.runes, item.gems]));
  check("detail shows the rune in rainbow", (await page.locator("#inv-detail .stat-line.rainbow").first().innerText()).includes("♦ 다 룬: 최대 HP +8%"));
  await page.selectOption("#inv-detail select.gem-kind", "rune"); await sleep(80);
  await page.selectOption("#inv-detail select.gem-grade", "12"); await sleep(80);
  check("not enough for 파 → disabled with message", await page.locator("#inv-detail button.gem-put").isDisabled() && (await page.locator("#inv-detail").innerText()).includes("파 룬이(가) 없어요"));
  await page.selectOption("#inv-detail select.gem-grade", "13"); await sleep(80);
  await page.locator("#inv-detail button.gem-put").click(); await sleep(150);
  inv = await readInv(page); item = inv.bag.find(x => x.id === ch.id);
  check("put 하 룬 (owned)", JSON.stringify(item.gems) === '[["rune",2],["rune",13]]' && inv.runes[13] === 0);
  check("sell-all keeps the rune-socketed item", (await page.locator("#inv-sell-all").innerText()) === "가방 전부 판매" && await page.locator("#inv-sell-all").isDisabled());
  await page.locator("#inv-detail button", { hasText: "장착" }).click(); await sleep(150);
  const sum = await page.locator("#inv-summary").textContent();
  check("equipped: stats include rune bonuses (공격력 +12% from 하)", /공격력 \d+ \(장비 \+\d+, \+\d+%\)/.test(sum));
  await page.screenshot({ path: `${OUT}/rune-inv.png` });
  check("no page errors (socket)", errors.length === 0, errors.join("; "));
  await ctx.close();

  // 2-1. 룬워드 재료 (일반·악몽의 아이템): 표시 없음, 상세에만 (접힌 채로), 순서가 틀리면 경고
  const junk = Array.from({ length: 3 }, (_, i) => findC(`rwj${i}|n40`, it => !I.socketCount(it) && it.slot === "boots"));
  const rwOpen = async (dev, hell) => {
    const o = await open(dev, { rl_save: save(50, "rn" + dev), rl_level: lv(50, "rn" + dev, "nm", [], { items: [{ x: 9, y: 10, type: "gear", item: cChest4, from: "monster" }] }),
      "rl_inv:g:DEV": JSON.stringify({ bag: [...junk, rChest4, cHead2], equip: eqOf(v4), log: [], stones: 0, runes: z({ 13: 1 }) }) });
    // 헬(지옥의) 아이템은 아직 없음 → 표시 경로는 단계 판정을 바꿔서 확인
    if (hell) await o.page.evaluate(() => { RLItems.runewordHighlight = (it) => RLItems.runewordsFor(it).length > 0; });
    await press(o.page, "ArrowLeft"); await sleep(150);
    await press(o.page, "i"); await sleep(150);
    return o;
  };
  ({ ctx, page, errors } = await rwOpen("runetest-g", false));
  check("normal/nightmare base: no pickup shout, no ✦ tag, not lockable", !(await logs(page)).includes("✦ 룬워드 재료!") && await page.locator(".bag-item.rw-base").count() === 0 && !(await page.locator(".bag-item").allInnerTexts()).some(t => t.includes("✦")));
  check("tier rules: itemTier normal/nightmare, highlight only for hell", I.itemTier(cChest4) === "nightmare" && I.itemTier(findC("rwd|d40", () => true)) === "normal" && !I.runewordHighlight(cChest4) && JSON.stringify(I.RUNEWORD_HIGHLIGHT_TIERS) === '["hell"]');
  await page.locator(".bag-item", { hasText: "커먼 갑옷" }).first().click(); await sleep(150);
  d = await page.locator("#inv-detail").innerText();
  check("detail still lists the runeword (folded): 1위 천하무적 — 차·하·마·자", (await page.locator("#inv-detail details.fold", { hasText: "✦ 룬워드 재료" }).count()) === 1 && (await page.locator("#inv-detail details.fold[open]", { hasText: "✦ 룬워드 재료" }).count()) === 0
    && (await page.locator("#inv-detail details.fold", { hasText: "✦ 룬워드 재료" }).textContent()).includes("1위 천하무적 — 차·하·마·자 (0/4 넣음, 다음 차 룬)") && await page.locator("#inv-detail button.lock-btn").count() === 0, d);
  let asked = "";
  page.removeAllListeners("dialog"); page.on("dialog", dl => { asked = dl.message(); dl.dismiss(); });
  await page.selectOption("#inv-detail select.gem-kind", "rune"); await sleep(80); await page.selectOption("#inv-detail select.gem-grade", "13"); await sleep(80);
  await page.locator("#inv-detail button.gem-put").click(); await sleep(150);
  check("putting the wrong rune first still warns that 천하무적 can't be made", asked.includes("⚠ 이걸 넣으면 룬워드(천하무적, 태산, 몰래)를 만들 수 없게 돼요"), asked);
  check("sell-all treats normal/nightmare bases like any common (no extra question)", (await page.locator("#inv-sell-all").innerText()).includes("6개"));
  check("no page errors (quiet bases)", errors.length === 0, errors.join("; "));
  await ctx.close();
  // 헬 아이템이라면: 줍기 로그, ✦ 룬워드 표시, 위로 정렬, 잠금, 가방 전부 판매에서 물어봄
  ({ ctx, page, errors } = await rwOpen("runetest-h", true));
  check("hell base: pickup log ✦ 룬워드 재료! … 천하무적", (await logs(page)).includes("✦ 룬워드 재료! 홈 4개 커먼 — 천하무적, 태산, 몰래을(를) 만들 수 있다"), await logs(page));
  const bagTexts = await page.locator(".bag-item").allInnerTexts();
  check("hell base: listed first with ✦ 룬워드 tag", bagTexts[0].includes("✦ 룬워드") && bagTexts[1].includes("✦ 룬워드") && !bagTexts[2].includes("✦ 룬워드") && await page.locator(".bag-item.rw-base").count() === 2, JSON.stringify(bagTexts));
  await page.locator(".bag-item.rw-base", { hasText: "갑옷" }).click(); await sleep(150);
  check("hell base: runeword section open, can be locked", (await page.locator("#inv-detail details.fold[open]", { hasText: "✦ 룬워드 재료" }).count()) === 1 && await page.locator("#inv-detail button.lock-btn").count() === 1);
  await page.locator("#inv-sell-all").click(); await sleep(200);
  check("hell base: sell-all asks about runeword bases", (await page.locator("#inv-sell-ask").innerText()).includes("룬워드 재료 2개도 같이 팔까요?"), await page.locator("#inv-sell-ask").innerText());
  await page.locator("#inv-sell-ask button.primary").click(); await sleep(200);
  inv = await readInv(page);
  check("keep them: only the 4 others sold", inv.bag.length === 2 && inv.bag.every(it => I.runewordsFor(it).length), JSON.stringify(inv.bag.map(it => it.rarity)));
  await page.screenshot({ path: `${OUT}/runeword-bag.png` });
  check("no page errors (hell bases)", errors.length === 0, errors.join("; "));
  await ctx.close();

  // 3. 나이트메어 50층 문 (나이트메어 건물 오른쪽 28,11): 완료 전 닫힘, 완료 후 50층으로
  ({ ctx, page, errors } = await open("runetest-e", { rl_save: save(30, "rnE", { nb: 30 }, { z: "normal" }), rl_level: lv(30, "rnE", "normal"), "rl_inv:g:DEV": JSON.stringify({ bag: [], equip: eqOf(v4), log: [], stones: 0 }) }));
  await walkToRuneDoor(page);
  check("50층 door before clearing nightmare: closed", await inLobby(page) && (await logs(page)).includes("문은 나이트메어를 완료하면 열린다"), await logs(page));
  await ctx.close();
  ({ ctx, page, errors } = await open("runetest-f", { rl_save: save(30, "rnF", { nb: 50, nclr: 1 }, { z: "normal" }), rl_level: lv(30, "rnF", "normal"), "rl_inv:g:DEV": JSON.stringify({ bag: [], equip: eqOf(v4), log: [], stones: 0 }) }));
  await portalOut(page); await press(page, "ArrowRight", 12); await sleep(200);
  await page.screenshot({ path: `${OUT}/rune-lobby.png` });
  await press(page, "ArrowUp"); await page.keyboard.press("ArrowUp"); await sleep(300);
  const S = await stored(page, "rl_save");
  check("50층 door after clearing: straight to nightmare 50 (boss floor)", !(await inLobby(page)) && (await page.locator("#zone").innerText()).includes("나이트메어") && (await page.locator("#depth").innerText()) === "50" && S.run.z === "nm" && S.run.d === 50
    && (await stored(page, "rl_level")).enemies.some(e => e.kind === "boss") && (await logs(page)).includes("룬 2개를 떨어뜨린다"), JSON.stringify(S.run));
  check("no page errors (door)", errors.length === 0, errors.join("; "));
  await ctx.close();
} finally { await browser.close(); }

// ---- 서버 ----
try {
  const post = (guest, body) => fetch("http://127.0.0.1:8119/api.php?r=score", { method: "POST", headers: { "Content-Type": "application/json", Origin: ORIGIN.slice(0, -1), "X-Guest-Id": guest }, body: JSON.stringify(body) }).then(r => r.json());
  const me = (guest) => fetch(`http://127.0.0.1:8119/api.php?r=me`, { headers: { Origin: ORIGIN.slice(0, -1), "X-Guest-Id": guest } }).then(r => r.json());
  const player = async (guest) => (await fetch(`http://127.0.0.1:8119/api.php?r=player&id=${(await me(guest)).id}`, { headers: { Origin: ORIGIN.slice(0, -1) } })).json();
  const ref = (it, g) => ({ seed: it.seed, src: it.src, lvl: it.lvl, v: it.v, enh: 0, id: it.id, r: it.r, ...(g ? { g } : {}) });
  const c2 = find("rsc|d60", it => it.slot === "chest" && I.socketCount(it) >= 2 && !I.isNightmareItem(it), 60);
  await post("runes-guest-01", { stage: 70, plvl: 40, gear: [ref(c2, [["rune", 10], ["ruby", 2]])] });
  const p = await player("runes-guest-01");
  const c = p.gear?.items?.find(x => x.slot === "chest");
  check("server: rune in a socket accepted, shown with name/effect, stats include it", p.gear?.rejected === 0 && c?.gems?.[0]?.name === "카 룬" && c.gems[0].text === "받는 피해 감소 +4%" && c.gems[0].rune === true && p.gear.stats.dmgReduce === 4, JSON.stringify([p.gear?.rejected, c?.gems, p.gear?.stats?.dmgReduce]));
  await post("runes-guest-02", { stage: 70, plvl: 40, gear: [ref(c2, [["rune", 14]])] });
  check("server: unknown rune rejected", (await player("runes-guest-02")).gear?.rejected === 1);
  const pv = (inv) => execFileSync("php", ["-r", `require "${path.join(REPO, "ranking-php/profile.php")}"; echo profile_valid(json_decode($argv[1], true)) ? "ok" : "bad";`, JSON.stringify({ inv })]).toString();
  check("profile: rune pouch validated", pv({ bag: [], equip: {}, runes: z({ 0: 3, 13: 1 }) }) === "ok" && pv({ bag: [], equip: {}, runes: [1, -1] }) === "bad" && pv({ bag: [], equip: {}, runes: Array(15).fill(0) }) === "bad");
} finally { php.kill(); }
check("no php errors", !/Fatal|Warning|Notice|Deprecated/.test(phpErr), phpErr.slice(0, 400));
const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
