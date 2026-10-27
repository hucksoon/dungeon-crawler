// 보조 손(보조무기·방패), 패링, 두 손 공격, 광란·견고 세트, 고대는 레전더리·세트만, 서버 검증(v3)
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import crypto from "node:crypto"; import fs from "node:fs"; import path from "node:path";
const require = createRequire(process.env.NODE_PATH + "/");
const { chromium } = require("playwright");
const REPO = process.argv[2], OUT = process.argv[3];
const I = createRequire(import.meta.url)(path.join(REPO, "items.js"));
// 서버는 아이템 값만 보냄 (dc#97): 참조로 다시 만든 이름 (서버가 이름 글자를 보내면 실패)
const nameOf = (v) => (v?.ref && !("name" in v) ? I.itemName(I.fromRef(v.ref, { gems: true })) : null);
const M = createRequire(import.meta.url)(path.join(REPO, "monsters.js"));
const ORIGIN = "https://game.apacimtest.com/";
const results = [];
const check = (n, ok, x = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x && !ok ? " — " + x : ""}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const find = (pred, tag, src = "golden", lvl = 20) => { for (let n = 0; n < 2000000; n++) { const it = I.generate(`${tag}${n}|shop|d${lvl}|s${n % 6}`, src, lvl, 3); if (pred(it)) return it; } throw new Error("not found " + tag); };

// ---- 규칙 ----
const legShield = find(x => x.type === "shield" && x.rarity === "legendary", "ls");
const rareShield = find(x => x.type === "shield" && x.rarity === "rare", "rs");
const epicShield = find(x => x.type === "shield" && x.rarity === "epic", "es");
const offDagger = find(x => x.slot === "offhand" && x.type === "dagger" && x.rarity === "rare", "od");
const mainAxe = find(x => x.slot === "weapon" && x.rarity === "rare", "ma");
const frenzyR = find(x => x.set === "frenzy" && x.slot === "weapon", "fr");
const frenzyL = find(x => x.set === "frenzy" && x.slot === "offhand", "fl");
const sturdyW = find(x => x.set === "sturdy" && x.slot === "weapon", "sw");
const sturdyS = find(x => x.set === "sturdy" && x.slot === "offhand", "ss");
check("v3 items, 7 slots incl. offhand", I.RULES_VERSION >= 3 && I.SLOTS.length === 7 && legShield.v === 3);
check("legendary shield parry in 23..25", legShield.parry >= 23 && legShield.parry <= 25, String(legShield.parry));
check("rare shield 9..11, epic 16..18", rareShield.parry >= 9 && rareShield.parry <= 11 && epicShield.parry >= 16 && epicShield.parry <= 18);
const parries = new Set(); for (let n = 0; n < 4000; n++) { const it = I.generate(`pp${n}|shop|d20|s1`, "golden", 20, 3); if (it.type === "shield" && it.rarity === "legendary") parries.add(it.parry); }
check("legendary parry takes all of 23, 24, 25", [...parries].sort().join() === "23,24,25", [...parries].join());
check("names: 방패, 보조 단검, set pieces", I.itemName(rareShield) === "레어 방패" && I.itemName(offDagger) === "레어 보조 단검" && I.itemName(frenzyR) === "광란의 오른손무기" && I.itemName(frenzyL) === "광란의 왼손무기" && I.itemName(sturdyS) === "견고의 방패", [I.itemName(rareShield), I.itemName(offDagger), I.itemName(frenzyR), I.itemName(sturdyS)].join("|"));
check("frenzy left is a weapon (dagger), sturdy offhand is shield with parry", frenzyL.type === "dagger" && !("parry" in frenzyL) && sturdyS.type === "shield" && sturdyS.parry >= 23);
const enhanced = { ...legShield, enh: 10 };
check("parry not raised by enhancement", I.totals([enhanced]).stats.parry === legShield.parry);
const t1 = I.totals([sturdyW, sturdyS]);
check("sturdy 2-set: parry = shield + 15, max 40", t1.stats.parry === Math.min(40, sturdyS.parry + 15) && t1.sets[0].full === 2 && t1.sets[0].bonuses[0].on);
check("sturdy with 25% shield caps at 40", I.totals([sturdyW, { ...sturdyS, parry: 25 }]).stats.parry === 40);
const t2 = I.totals([frenzyR, frenzyL]);
check("frenzy 2-set: splash on, dual wield on", t2.stats.splash === 1 && t2.stats.dual === 1);
check("main weapon + offhand dagger → dual; shield → no dual", I.totals([mainAxe, offDagger]).stats.dual === 1 && I.totals([mainAxe, rareShield]).stats.dual === 0);
// 고대는 레전더리·세트만
let lowAncient = 0, rares = 0; for (let n = 0; n < 30000; n++) { const it = I.generate(`an${n}|d3|k${n}`, "drop", 3, 3); if (it.ancient && it.rarity !== "legendary" && it.rarity !== "set") lowAncient++; }
check("no ancient below legendary (30k drops)", lowAncient === 0);
const fakeRareAncient = { ...rareShield, main: rareShield.main.map(([k]) => [k, I.mainRange(k, rareShield)[1]]), lines: rareShield.lines.map(([k]) => [k, I.lineRange(k, rareShield.lvl)[1]]), parry: 11 };
check("rare with all max is not ancient", I.isAncient(fakeRareAncient) === false);
const fakeLegAncient = { ...legShield, main: legShield.main.map(([k]) => [k, I.mainRange(k, legShield)[1]]), lines: legShield.lines.map(([k]) => [k, I.lineRange(k, legShield.lvl)[1]]), parry: 25 };
check("legendary with all max (incl. parry 25) is ancient; parry 24 is not", I.isAncient(fakeLegAncient) && !I.isAncient({ ...fakeLegAncient, parry: 24 }));
// 예전 v2 아이템도 그대로 다시 만들어짐 (거래소·우편함)
const v2 = I.generate("old|d5|k1", "drop", 5, 2);
check("v2 items still regenerate (6 slots, no offhand)", v2.v === 2 && v2.slot !== "offhand");

// ---- 게임 ----
const MAP_W = 32, MAP_H = 24;
const level = (enemies) => {
  const map = Array.from({ length: MAP_H }, (_, y) => Array.from({ length: MAP_W }, (_, x) => (x === 0 || y === 0 || x === MAP_W - 1 || y === MAP_H - 1 ? 0 : 1)));
  map[20][28] = 2;
  return JSON.stringify({ rid: "oh-run", d: 20, turn: 0, map: map.map(r => r.join("")).join(""), seen: "1".repeat(MAP_W * MAP_H), px: 10, py: 10, shop: null, enemies, items: [] });
};
const save = JSON.stringify({ v: 1, best: 20, run: { d: 20, hp: 9000000, mh: 9000000, a: 30, g: 100, p: 3, l: 30, x: 0, xn: 1e9, rid: "oh-run", k: 0, pp: 0 } });
const DEV = "oh-dev-0001";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
async function open(equip, bag, enemies) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 1000 } }); const page = await ctx.newPage(); const errors = [];
  page.on("pageerror", e => errors.push(e.message + " @ " + (e.stack || "").split("\n")[1]));
  await ctx.route(ORIGIN + "**", r => { const f = new URL(r.request().url()).pathname.slice(1) || "index.html";
    if (f === "ranking-config.js") return r.fulfill({ contentType: "text/javascript", body: 'window.RANKING_API = "";' });
    const p = path.join(REPO, f); if (!fs.existsSync(p)) return r.fulfill({ status: 404, body: "" });
    r.fulfill({ contentType: f.endsWith(".js") ? "text/javascript" : "text/html", body: fs.readFileSync(p) }); });
  await ctx.route("https://login.xsolla.com/**", r => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  // 예전 6칸짜리 저장(보조 손 칸 없음)도 받아들이는지
  const eq = Object.fromEntries(["head", "chest", "arms", "pants", "boots", "weapon"].map(s => [s, null]));
  for (const it of equip) eq[it.slot] = it;
  await ctx.addInitScript(([s, inv, lv, dev]) => { if (sessionStorage.getItem("seeded")) return; sessionStorage.setItem("seeded", 1); sessionStorage.setItem("rl_scene", "dungeon");
    localStorage.setItem("rl_device_id", dev); localStorage.setItem(`rl_notice_v4:g:${dev}`, "1"); localStorage.setItem("rl_save", s); localStorage.setItem(`rl_inv:g:${dev}`, inv); localStorage.setItem("rl_level", lv);
    window.__log = []; document.addEventListener("DOMContentLoaded", () => new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => window.__log.push(n.textContent)))).observe(document.getElementById("log"), { childList: true }));
  }, [save, JSON.stringify({ bag, equip: eq, log: [], stones: 0 }), level(enemies), DEV]);
  await page.goto(ORIGIN); await page.waitForTimeout(400);
  return { page, errors };
}
const logs = (page) => page.evaluate(() => window.__log.filter(t => t && t.length < 200));
const inv = (page) => page.evaluate(k => JSON.parse(localStorage.getItem(k)), `rl_inv:g:${DEV}`);
const mon = (x, y, hp, atk = 1) => ({ x, y, id: "rat", ch: "r", name: "쥐", color: "#a58b6f", kind: "normal", hp, maxHp: hp, atk, def: 0, xp: 1 });
try {
  // 1. 견고의 세트 장착: 패링 = 방패 + 15
  let { page, errors } = await open([sturdyW], [sturdyS], [mon(11, 10, 1e9, 5)]);
  await page.click("#inv-btn"); await sleep(200);
  check("equip slots show 10 incl. 보조 (7 + 목걸이·반지 2)", await page.locator("#inv-equip .slot").count() === 10 && (await page.locator("#inv-equip").innerText()).includes("보조"));
  await page.locator(".bag-item", { hasText: "견고의 방패" }).click();
  check("shield detail shows parry line with range, not enhanceable", (await page.locator("#inv-detail").innerText()).includes(`패링 확률 +${sturdyS.parry}% [23~25%]`) && (await page.locator("#inv-detail").innerText()).includes("강화로 오르지 않음"));
  await page.getByRole("button", { name: "장착", exact: true }).click(); await sleep(100);
  const sum = await page.locator("#inv-summary").innerText();
  check("summary: parry shield+15 and sturdy (2/2)", sum.includes(`패링 ${Math.min(40, sturdyS.parry + 15)}%`) && sum.includes("견고의 세트 (2/2)"), sum);
  check("equipped into offhand slot", (await inv(page)).equip.offhand?.id === sturdyS.id);
  await page.keyboard.press("Escape");
  // 몬스터에게 200번 맞아 보기: 패링 비율 ≈ 38~40%
  for (let i = 0; i < 200; i++) await page.keyboard.press(".");
  await sleep(200);
  const L = await logs(page);
  const parried = L.filter(t => t.includes("방패로 막아냈다")).length, hurt = L.filter(t => t.includes("피해를 입음")).length;
  const rate = parried / (parried + hurt);
  check("parry rate close to shield+15% (±8%p)", Math.abs(rate * 100 - Math.min(40, sturdyS.parry + 15)) < 8, `${parried}/${parried + hurt} = ${(rate * 100).toFixed(1)}%`);
  check("no errors (sturdy)", errors.length === 0, errors.join("; "));
  await page.context().close();

  // 2. 두 손 무기: 한 번 부딪히면 두 번 공격 (두 번째는 왼손)
  ({ page, errors } = await open([mainAxe, offDagger], [], [mon(11, 10, 1e9)]));
  await page.keyboard.press("ArrowRight"); await sleep(150);
  let L2 = await logs(page);
  const hits = L2.filter(t => /쥐에게 \d+ 피해!/.test(t));
  check("dual wield: 2 hits in one turn, second is 왼손", hits.length === 2 && hits[1].startsWith("왼손 "), JSON.stringify(hits));
  const n1 = +hits[0].match(/(\d+) 피해/)[1], n2 = +hits[1].match(/(\d+) 피해/)[1];
  check("left hit weaker (~60%)", n2 < n1 || hits.some(h => h.includes("치명타")), `${n1} vs ${n2}`);
  // 첫 공격에 쓰러지면 두 번째 없음
  await page.context().close();
  ({ page, errors } = await open([mainAxe, offDagger], [], [mon(11, 10, 1)]));
  await page.keyboard.press("ArrowRight"); await sleep(150);
  L2 = await logs(page);
  check("target dies on first hit → no left hit", L2.filter(t => /쥐에게 \d+ 피해!/.test(t)).length === 1 && L2.some(t => t.includes("처치")));
  check("no errors (dual)", errors.length === 0, errors.join("; "));
  await page.context().close();

  // 3. 광란의 세트: 대상 주변 1칸의 적도 같은 공격 (두 손이라 두 번씩)
  ({ page, errors } = await open([frenzyR, frenzyL], [], [mon(11, 10, 1e9), mon(12, 11, 1e9), mon(12, 9, 1e9), mon(14, 10, 1e9)]));
  await page.keyboard.press("ArrowRight"); await sleep(150);
  const L3 = await logs(page);
  const splash = L3.filter(t => t.startsWith("광란 쥐에게"));
  check("frenzy: two neighbours of the target hit, twice each (4 splash lines)", splash.length === 4, JSON.stringify(L3.filter(t => t.includes("피해!"))));
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem("rl_level") || "null"));
  check("frenzy: far monster (2 tiles away) untouched", after.enemies.filter(e => e.hp === 1e9).length === 1 && after.enemies.filter(e => e.hp < 1e9).length === 3, JSON.stringify(after.enemies.map(e => [e.x, e.y, e.hp])));
  check("no errors (frenzy)", errors.length === 0, errors.join("; "));
  await page.context().close();

  // 4. 예전에 고대로 저장된 레어 아이템 → 고대 아님으로 보임
  const oldRare = { ...rareShield, ancient: true };
  ({ page, errors } = await open([], [oldRare], []));
  await page.click("#inv-btn"); await sleep(200);
  check("old stored low-rarity 'ancient' no longer shown as ancient", await page.locator(".bag-item.ancient").count() === 0 && !(await page.locator(".bag-item").first().innerText()).includes("고대"));
  check("no errors (normalize)", errors.length === 0, errors.join("; "));
  await page.screenshot({ path: path.join(OUT, "offhand-inv.png") });
  await page.context().close();
} finally {
  await browser.close();
}

// ---- 서버 (v3 아이템 검증, 7칸 저장) ----
const DIR = path.dirname(new URL(import.meta.url).pathname) + "/php";
const DB = path.join(DIR, "offhand.sqlite"); for (const f of [DB, DB + "-wal", DB + "-shm"]) fs.rmSync(f, { force: true });
fs.writeFileSync(path.join(DIR, "config.offhand.php"), `<?php\n$c = require __DIR__ . '/config.test.php';\nreturn array_merge($c, ['db_dsn' => 'sqlite:${DB}']);\n`);
const SECRET = "offhand-secret";
const php = spawn("php", ["-S", "127.0.0.1:8092", "-t", path.join(REPO, "ranking-php")], { env: { ...process.env, RANKING_CONFIG: path.join(DIR, "config.offhand.php"), TEST_JWT_SECRET: SECRET }, stdio: ["ignore", "ignore", "pipe"] });
let phpErr = ""; php.stderr.on("data", d => phpErr += d);
await sleep(700);
try {
  const b64u = (s) => Buffer.from(s).toString("base64url");
  const h = b64u(JSON.stringify({ alg: "HS256" })), pl = b64u(JSON.stringify({ sub: "oh-user", email: "oh@example.com", exp: Math.floor(Date.now() / 1000) + 3600, xsolla_login_project_id: "30375188-893b-4b1a-ba1b-c8ba692fa5e3" }));
  const token = `${h}.${pl}.${crypto.createHmac("sha256", SECRET).update(`${h}.${pl}`).digest("base64url")}`;
  const call = async (route, body) => (await fetch(`http://127.0.0.1:8092/api.php?r=${route}`, { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, Origin: ORIGIN.slice(0, -1) }, body: body && JSON.stringify(body) })).json();
  const ref = (it) => ({ seed: it.seed, src: it.src, lvl: it.lvl, v: it.v, enh: 0, id: it.id });
  const r = await call("score", { stage: 20, plvl: 10, item: { ...ref(sturdyS), rarity: sturdyS.rarity, name: I.itemName(sturdyS) }, gear: [ref(sturdyW), ref(sturdyS)] });
  check("server accepts v3 gear (no rejects)", r.ok === true, JSON.stringify(r));
  const me = await call("me");
  // 예전 장비를 낀 기록은 층 랭킹에 안 올라가서, 내 공개 ID는 me로 찾음
  const rk = { rows: [{ id: (await call("me")).id }] };
  const p = await call(`player&id=${rk.rows[0].id}`);
  const shieldView = p.gear.items.find(i => i.slot === "offhand");
  check("server view: offhand 견고의 방패 with parry line", shieldView && shieldView.slot === "offhand" && !("slotName" in shieldView) && nameOf(shieldView) === "견고의 방패" && shieldView.main.some(m => m.k === "parry" && m.v === sturdyS.parry), JSON.stringify(shieldView));
  check("server stats: parry shield+15, sturdy set full 2", p.gear.stats.parry === Math.min(40, sturdyS.parry + 15) && p.gear.sets[0].full === 2 && p.gear.sets[0].bonuses[0].on, JSON.stringify(p.gear.stats));
  check("server: no rejected gear", !p.gear.rejected);
  const prof = await call("profile", { rev: 0, data: { v: 1, inv: { bag: [], equip: Object.fromEntries(I.SLOTS.map(s => [s, null])), stones: 0 }, dex: { seen: {}, kills: {} } } });
  check("profile save accepts 7 equip slots", prof.ok === true, JSON.stringify(prof));
  // 예전(v2) 아이템도, 새(v3) 방패도 거래소에 올릴 수 있고, 올린 기록에 버전이 그대로 남음
  const oldItem = I.generate("oldrun|shop|d20|s2", "golden", 20, 2);
  const l2 = await call("market_list", { item: ref(oldItem), gold: 10, cash: 0, stage: 20 });
  check("market: v2 item can still be listed", l2.listing?.id, JSON.stringify(l2));
  const l3 = await call("market_list", { item: ref(legShield), gold: 10, cash: 1, stage: 20 });
  check("market: v3 shield can be listed", l3.listing?.id, JSON.stringify(l3));
  const br = await call("market");
  const refs = (br.listings || br.rows || []).map(x => x.ref);
  check("market: refs keep their version (2 and 3)", refs.some(r => r?.v === 2 && r.id === oldItem.id) && refs.some(r => r?.v === 3 && r.id === legShield.id), JSON.stringify(refs));
  check("no php errors", !/Fatal|Warning|Notice|Deprecated/.test(phpErr), phpErr.slice(0, 400));
} finally { php.kill(); }
const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
