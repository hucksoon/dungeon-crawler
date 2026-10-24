// 아이템 규칙 v4: 부위별 주 능력치, % 능력치 등급별 고정 범위, 추가 능력치 치명타 피해·공격력%, 예전 아이템 % 상한
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import crypto from "node:crypto"; import fs from "node:fs"; import path from "node:path";
const require = createRequire(process.env.NODE_PATH + "/");
const { chromium } = require("playwright");
const REPO = process.argv[2], OUT = process.argv[3];
const I = createRequire(import.meta.url)(path.join(REPO, "items.js"));
const ORIGIN = "https://game.apacimtest.com/";
const results = [];
const check = (n, ok, x = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x && !ok ? " — " + x : ""}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const find = (pred, tag, v = 4, src = "golden", lvl = 20) => { for (let n = 0; n < 3000000; n++) { const it = I.generate(`${tag}${n}|shop|d${lvl}|s${n % 6}`, src, lvl, v); if (pred(it)) return it; } throw new Error("not found " + tag); };
const R = ["common", "uncommon", "rare", "epic", "legendary", "set"];

// ---- 규칙 ----
check("RULES_VERSION 4, new items are v4", I.RULES_VERSION === 4 && I.generate("a|d3|k1", "drop", 3).v === 4);
const poolKey = (it) => it.slot === "offhand" ? (it.type === "shield" ? "shield" : "offhandWeapon") : it.type === "longsword" ? "longsword" : it.slot;
let badPool = 0, badFirst = 0, badCount = 0, badMainPct = 0, badLine = 0, badLinePct = 0, dupLine = 0, critElsewhere = 0, n = 0;
const lineSeen = new Set(), mainSeen = {};
for (let i = 0; i < 40000; i++) {
  const lvl = 1 + (i * 13) % 150;
  const it = I.generate(`r${i}|d${lvl}|k${i}`, ["drop", "box", "boss", "golden"][i % 4], lvl); n++;
  if (I.isAccessory(it)) continue;   // 장신구(r7~)는 주 능력치 규칙이 따로 → accessory-e2e
  const pool = I.MAIN_V4.pool[poolKey(it)];
  if (it.main[0][0] !== pool[0]) badFirst++;
  if (!it.main.every(([k]) => pool.includes(k))) badPool++;
  const [lo, hi] = I.MAIN_V4.count[it.rarity];
  if (it.main.length < Math.min(lo, pool.length) || it.main.length > Math.min(hi, pool.length) || new Set(it.main.map(m => m[0])).size !== it.main.length) badCount++;
  for (const [k, v] of it.main) {
    (mainSeen[poolKey(it)] ||= new Set()).add(k);
    if (I.PCT_MAIN[k]) { const [a, b] = I.mainRange(k, it); if (v < a || v > b || (it.type !== "longsword" && b !== I.PCT_MAIN[k][it.rarity][1])) badMainPct++; }
    if (k === "crit" && it.slot !== "chest" && it.slot !== "arms" && it.type !== "longsword") critElsewhere++;   // 장검(r5)도
  }
  if (it.lines.length !== I.RARITIES[it.rarity].lines || new Set(it.lines.map(l => l[0])).size !== it.lines.length) dupLine++;
  for (const [k, v] of it.lines) {
    if (k === "socket") continue;   // 홈 (r6)은 gems-e2e에서
    lineSeen.add(k);
    if (!I.STAT_KEYS_V4.includes(k)) badLine++;
    if (I.PCT_LINE[k]) { const [a, b] = I.PCT_LINE[k][it.rarity]; if (v < a || v > b) badLinePct++; }
  }
}
check("main: first option fixed per slot (atk weapons, def armor/shield)", badFirst === 0, String(badFirst));
check("main: only the slot's own candidates", badPool === 0, String(badPool));
check("main: count per rarity (common 1, uncommon 1~2, rare 2, epic+ 2~3), no duplicates", badCount === 0, String(badCount));
check("main %: inside the rarity's fixed range at any level (1~150)", badMainPct === 0, String(badMainPct));
check("crit main only on chest and arms", critElsewhere === 0 && mainSeen.chest.has("crit") && mainSeen.arms.has("crit"));
const exp = { weapon: "atk,critDmg,atkPct,lifesteal", offhandWeapon: "atk,critDmg,lifesteal", chest: "def,crit,hp", arms: "def,crit,atkPct", head: "def,hp,xp", pants: "def,hp,defPct", boots: "def,hp,gold", shield: "def,hp", longsword: "atk,def,crit,allRes" };
check("every slot candidate actually appears", Object.entries(exp).every(([k, v]) => [...mainSeen[k]].sort().join() === v.split(",").sort().join()), JSON.stringify(Object.fromEntries(Object.entries(mainSeen).map(([k, v]) => [k, [...v]]))));
check("lines: 9 kinds incl. critDmg and atkPct, all appear", badLine === 0 && lineSeen.size === 9 && lineSeen.has("critDmg") && lineSeen.has("atkPct"), [...lineSeen].join());
check("lines: % ones inside the rarity's fixed range", badLinePct === 0, String(badLinePct));
check("lines: count per rarity unchanged, no duplicates", dupLine === 0);
// 표 그대로
const T = (t, k) => R.map(r => t[k][r].join("-")).join(" ");
check("main crit table", T(I.PCT_MAIN, "crit") === "1-2 2-3 3-5 5-7 8-10 7-9");
check("main critDmg table", T(I.PCT_MAIN, "critDmg") === "5-10 10-15 15-25 25-35 40-50 35-45");
check("main atkPct = defPct table", T(I.PCT_MAIN, "atkPct") === "2-3 3-5 5-8 8-12 13-15 12-14" && T(I.PCT_MAIN, "defPct") === T(I.PCT_MAIN, "atkPct"));
check("main lifesteal table", T(I.PCT_MAIN, "lifesteal") === "1-1 1-2 2-3 3-4 5-6 4-5");
check("main xp = gold table", T(I.PCT_MAIN, "xp") === "5-8 8-12 12-18 18-25 28-35 25-30" && T(I.PCT_MAIN, "gold") === T(I.PCT_MAIN, "xp"));
check("line tables", T(I.PCT_LINE, "crit") === "1-1 1-2 2-3 3-4 4-6 4-5" && T(I.PCT_LINE, "critDmg") === "3-5 5-7 7-9 9-12 12-15 11-14" && T(I.PCT_LINE, "atkPct") === "1-2 2-3 3-4 4-6 6-8 5-7"
  && T(I.PCT_LINE, "lifesteal") === "1-1 1-1 1-2 2-3 3-4 3-3" && T(I.PCT_LINE, "gold") === "3-6 5-8 8-12 12-16 18-25 15-20" && T(I.PCT_LINE, "xp") === T(I.PCT_LINE, "gold"));
// 레벨과 상관없음: 같은 등급이면 1층과 150층 범위가 같음
const legChest = find(x => x.slot === "chest" && x.rarity === "legendary" && x.main.some(m => m[0] === "crit"), "lc");
check("% range independent of level", JSON.stringify(I.statRange({ ...legChest, lvl: 1 }, "main", "crit")) === JSON.stringify(I.statRange({ ...legChest, lvl: 150 }, "main", "crit")) && I.statRange(legChest, "main", "crit")[1] === 10);
check("flat def still grows with level", I.mainRange("def", { ...legChest, lvl: 100 })[1] > I.mainRange("def", { ...legChest, lvl: 10 })[1]);
// 강화: % 주 능력치는 2단계마다 +1
const legArms = find(x => x.slot === "arms" && x.rarity === "legendary" && x.main.length === 3, "la", 4, "golden", 120);
const e10 = I.enhancedBase({ ...legArms, enh: 10 });
check("enhance +10: % main only +5, def +100%", legArms.main.every(([k, v]) => k === "def" ? e10[k] === v * 2 : e10[k] === v + 5), JSON.stringify([legArms.main, e10]));
const legW = find(x => x.slot === "weapon" && x.rarity === "legendary" && x.lines.some(l => l[0] === "critDmg"), "lw");
const boosts = I.enhancedLines({ ...legW, enh: 10 });
check("enhance line boost for v4 % line = 20% of max (min 1)", boosts.every(([k, v, plus], i) => plus % I.lineBoost(legW, k) === 0) && I.lineBoost(legW, "critDmg") === 3 && I.lineBoost(legW, "lifesteal") === 1);
// 치명타: 갑옷+팔 레전더리 주 능력치 최대치 = 20%, 추가 능력치 포함해도 75% 상한 밑
const maxCrit = I.PCT_MAIN.crit.legendary[1] * 2 + 7 * I.PCT_LINE.crit.legendary[1];
check("max crit from all gear well under the 75% cap (2 main + 7 lines = " + maxCrit + "%)", maxCrit < 75);
// 고대: 새 범위 기준
const legAll = { ...legChest, main: legChest.main.map(([k]) => [k, I.mainRange(k, legChest)[1]]), lines: legChest.lines.map(([k]) => [k, I.lineRangeOf(k, legChest)[1]]) };
check("ancient uses v4 ranges (all max → ancient, one below → not)", I.isAncient(legAll) && !I.isAncient({ ...legAll, lines: legAll.lines.map(([k, v], i) => [k, i ? v : v - 1]) }));
let anc = 0, low = 0; for (let i = 0; i < 60000; i++) { const it = I.generate(`an${i}|d40|k${i}`, "golden", 40); if (it.ancient) { anc++; if (it.rarity !== "legendary" && it.rarity !== "set") low++; } }
check(`ancient only legendary/set (${anc} in 60k golden)`, low === 0 && anc > 0);
// 예전 아이템 (2번): 아이템은 그대로, % 능력치만 효과 계산 때 v4 최대치로
const oldV3 = find(x => x.rarity === "legendary" && x.main.some(m => m[0] === "crit" && m[1] > 20) && x.lines.some(l => l[0] === "gold" && l[1] > 40), "o3", 3, "golden", 120);
const oldV3crit = oldV3.main.find(m => m[0] === "crit")[1], oldV3gold = oldV3.lines.find(l => l[0] === "gold")[1];
check("old v3 item regenerates unchanged (v3, same id)", I.generate(oldV3.seed, oldV3.src, oldV3.lvl, 3).id === oldV3.id && oldV3.v === 3);
const effB = I.effectiveBase(oldV3), effL = I.effectiveLines(oldV3);
check("old v3: crit main capped to legendary max 10, gold line to 25", effB.crit === 10 && effL.find(l => l[0] === "gold")[1] === 25, JSON.stringify([oldV3.main, effB, effL]));
check("old v3: atk/def/hp untouched", oldV3.main.filter(([k]) => !I.STATS[k].pct).every(([k, v]) => effB[k] === v) && effL.filter(l => !I.STATS[l[0]].pct).every((l, i) => l[1] === I.enhancedLines(oldV3).filter(x => !I.STATS[x[0]].pct)[i][1]));
const oldE10 = { ...oldV3, enh: 10 };
check("old v3 +10: cap includes enhancement allowance (crit 10+5)", I.effectiveBase(oldE10).crit === 15);
check("old v3 totals use the capped value", I.totals([oldV3]).stats.crit === effB.crit + effL.filter(l => l[0] === "crit").reduce((s, l) => s + l[1], 0));
const oldV2 = find(x => x.rarity === "rare" && x.main.some(m => m[0] === "lifesteal" && m[1] > 3), "o2", 2, "golden", 120);
check("old v2 also capped (rare lifesteal → 3)", I.effectiveBase(oldV2).lifesteal === 3, JSON.stringify(oldV2.main));
const smallOld = find(x => x.rarity === "legendary" && x.main.some(m => m[0] === "crit" && m[1] <= 3), "so", 3, "golden", 3);
check("old item under the cap keeps its value", I.effectiveBase(smallOld).crit === smallOld.main.find(m => m[0] === "crit")[1]);
const newLeg = find(x => x.rarity === "legendary", "nl");
check("v4 items never capped", JSON.stringify(I.effectiveBase({ ...newLeg, enh: 10 })) === JSON.stringify(I.enhancedBase({ ...newLeg, enh: 10 })));

// ---- 게임 ----
const MAP_W = 32, MAP_H = 24;
const map = Array.from({ length: MAP_H }, (_, y) => Array.from({ length: MAP_W }, (_, x) => (x === 0 || y === 0 || x === MAP_W - 1 || y === MAP_H - 1 ? 0 : 1)));
map[20][28] = 2;
const level = JSON.stringify({ rid: "v4-run", d: 120, turn: 0, map: map.map(r => r.join("")).join(""), seen: "1".repeat(MAP_W * MAP_H), px: 10, py: 10, shop: null, enemies: [], items: [] });
const save = JSON.stringify({ v: 1, best: 120, run: { d: 120, hp: 900, mh: 900, a: 30, g: 100, p: 3, l: 30, x: 0, xn: 1e9, rid: "v4-run", k: 0, pp: 0 } });
const DEV = "v4-dev-0001";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
try {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 1000 } }); const page = await ctx.newPage(); const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await ctx.route(ORIGIN + "**", r => { const f = new URL(r.request().url()).pathname.slice(1) || "index.html";
    if (f === "ranking-config.js") return r.fulfill({ contentType: "text/javascript", body: 'window.RANKING_API = "";' });
    const p = path.join(REPO, f); if (!fs.existsSync(p)) return r.fulfill({ status: 404, body: "" });
    r.fulfill({ contentType: f.endsWith(".js") ? "text/javascript" : "text/html", body: fs.readFileSync(p) }); });
  await ctx.route("https://login.xsolla.com/**", r => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  const eq = Object.fromEntries(I.SLOTS.map(s => [s, null])); eq[oldV3.slot] = oldV3;
  await ctx.addInitScript(([s, inv, lv, dev]) => { if (sessionStorage.getItem("seeded")) return; sessionStorage.setItem("seeded", 1); sessionStorage.setItem("rl_scene", "dungeon");
    localStorage.setItem("rl_device_id", dev); localStorage.setItem(`rl_notice_v4:g:${dev}`, "1"); localStorage.setItem("rl_save", s); localStorage.setItem(`rl_inv:g:${dev}`, inv); localStorage.setItem("rl_level", lv); },
    [save, JSON.stringify({ bag: [legArms, legW], equip: eq, log: [], stones: 0 }), level, DEV]);
  await page.goto(ORIGIN); await page.waitForTimeout(400);
  await page.click("#inv-btn"); await sleep(200);
  const sum = await page.locator("#inv-summary").innerText();
  const expCrit = Math.min(75, I.totals([oldV3]).stats.crit);
  check("summary crit uses the capped old item", sum.includes(`치명타 ${expCrit}%`), sum);
  await page.locator("#inv-equip .slot", { hasText: I.itemName(oldV3) }).first().click(); await sleep(100);
  const det = await page.locator("#inv-detail").innerText();
  check("old item detail: original value kept + (적용 10%) + old-rule note", det.includes(`치명타 확률 +${oldV3crit}%`) && det.includes("(적용 10%)") && det.includes(`(적용 25%)`) && det.includes("예전 규칙(v3) 아이템"), det);
  await page.locator(".bag-item", { hasText: I.itemName(legW) }).click(); await sleep(100);
  const det2 = await page.locator("#inv-detail").innerText();
  check("v4 weapon detail: 치명타 피해 line with fixed range, no (적용", det2.includes("치명타 피해 +") && det2.includes("[12~15%]") && !det2.includes("적용") && !det2.includes("예전 규칙"), det2);
  await page.getByRole("button", { name: "장착", exact: true }).click(); await sleep(100);
  await page.locator(".bag-item", { hasText: I.itemName(legArms) }).click(); await sleep(100);
  await page.getByRole("button", { name: "장착", exact: true }).click(); await sleep(100);
  const sum2 = await page.locator("#inv-summary").innerText();
  const t = I.totals([legW, legArms]).stats;
  check("summary shows atk% and crit damage multiplier from v4 items", (t.atkPct ? sum2.includes(`+${t.atkPct}%`) : true) && sum2.includes(`피해 ×${(2 + t.critDmg / 100).toFixed(1)}`), sum2 + JSON.stringify(t));
  check("no page errors", errors.length === 0, errors.join("; "));
  await page.screenshot({ path: path.join(OUT, "v4-inv.png") });
  await ctx.close();
} finally { await browser.close(); }

// ---- 서버 ----
const DIR = path.dirname(new URL(import.meta.url).pathname) + "/php";
const DB = path.join(DIR, "v4.sqlite"); for (const f of [DB, DB + "-wal", DB + "-shm"]) fs.rmSync(f, { force: true });
fs.writeFileSync(path.join(DIR, "config.v4.php"), `<?php\n$c = require __DIR__ . '/config.test.php';\nreturn array_merge($c, ['db_dsn' => 'sqlite:${DB}']);\n`);
const SECRET = "v4-secret";
const php = spawn("php", ["-S", "127.0.0.1:8094", "-t", path.join(REPO, "ranking-php")], { env: { ...process.env, RANKING_CONFIG: path.join(DIR, "config.v4.php"), TEST_JWT_SECRET: SECRET }, stdio: ["ignore", "ignore", "pipe"] });
let phpErr = ""; php.stderr.on("data", d => phpErr += d);
await sleep(700);
try {
  const b64u = (s) => Buffer.from(s).toString("base64url");
  const h = b64u(JSON.stringify({ alg: "HS256" })), pl = b64u(JSON.stringify({ sub: "v4-user", email: "v4@example.com", exp: Math.floor(Date.now() / 1000) + 3600, xsolla_login_project_id: "30375188-893b-4b1a-ba1b-c8ba692fa5e3" }));
  const token = `${h}.${pl}.${crypto.createHmac("sha256", SECRET).update(`${h}.${pl}`).digest("base64url")}`;
  const call = async (route, body) => (await fetch(`http://127.0.0.1:8094/api.php?r=${route}`, { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, Origin: ORIGIN.slice(0, -1) }, body: body && JSON.stringify(body) })).json();
  const ref = (it) => ({ seed: it.seed, src: it.src, lvl: it.lvl, v: it.v, enh: it.enh || 0, id: it.id });
  const r = await call("score", { stage: 120, plvl: 30, item: { ...ref(legW), rarity: legW.rarity, name: I.itemName(legW) }, gear: [ref(legW), ref(legArms), ref(oldV3)] });
  check("server accepts v4 gear plus an old v3 item", r.ok === true, JSON.stringify(r));
  // 예전 장비를 낀 기록은 층 랭킹에 안 올라가서, 내 공개 ID는 me로 찾음
  const rk = { rows: [{ id: (await call("me")).id }] };
  const p = await call(`player&id=${rk.rows[0].id}`);
  check("server: no rejected gear", !p.gear.rejected, JSON.stringify(p.gear.rejected));
  check("server: record with old v3 gear stays off the v4 floor board", ((await call("ranking")).rows || []).length === 0);
  check("server totals equal the game's (old item capped)", p.gear.stats.crit === Math.min(75, I.totals([legW, legArms, oldV3]).stats.crit) && p.gear.stats.atk > 0, JSON.stringify(p.gear.stats));
  const oldView = p.gear.items.find(i => i.slot === oldV3.slot);
  check("server view: old item shows (적용) value", oldView.main.some(m => m.text === `치명타 확률 +${oldV3crit}%` && m.eff === "10%") && oldView.lines.some(l => l.eff === "25%"), JSON.stringify(oldView));
  const wView = p.gear.items.find(i => i.slot === "weapon");
  check("server view: v4 weapon fixed ranges, no eff", wView.lines.some(l => l.text.startsWith("치명타 피해") && l.range === "12~15%") && [...wView.main, ...wView.lines].every(l => !l.eff), JSON.stringify(wView));
  const l4 = await call("market_list", { item: ref(newLeg), gold: 10, cash: 1, stage: 120 });
  check("market: v4 item can be listed and keeps v4", l4.listing?.id && l4.listing.ref.v === 4 && l4.listing.ref.id === newLeg.id, JSON.stringify(l4));
  const fake = await call("score", { stage: 120, plvl: 30, item: { ...ref(legW), id: "0000000000000000" }, gear: [] });
  check("server rejects a forged v4 id", !fake.item && !(await call(`player&id=${rk.rows[0].id}`)).item?.id?.startsWith("0000"), JSON.stringify(fake));
  check("no php errors", !/Fatal|Warning|Notice|Deprecated/.test(phpErr), phpErr.slice(0, 400));
} finally { php.kill(); }
const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
