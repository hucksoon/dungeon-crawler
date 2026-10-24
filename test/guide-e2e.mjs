// 추천 능력치(끝판 목표) 화면: 목표와 지금 값, 부위별 추천 줄 (장착한 아이템에 있으면 ✓)
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
const DB = path.join(DIR, "guide.sqlite"); for (const f of [DB, DB + "-wal", DB + "-shm"]) fs.rmSync(f, { force: true });
const CFG = path.join(DIR, "config.guide.php");
fs.writeFileSync(CFG, `<?php\n$c = require __DIR__ . '/config.test.php';\nreturn array_merge($c, ['db_dsn' => 'sqlite:${DB}']);\n`);
const php = spawn("php", ["-S", "127.0.0.1:8118", "-t", path.join(REPO, "ranking-php")], { env: { ...process.env, RANKING_CONFIG: CFG, TEST_JWT_SECRET: "guide" }, stdio: ["ignore", "ignore", "pipe"] });
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
    const res = await fetch(`http://127.0.0.1:8118/api.php${u.search}`, { method: req.method(), headers: { ...req.headers(), origin: ORIGIN.slice(0, -1) }, body: req.method() === "GET" ? undefined : req.postData() });
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




const RC = I.RECOMMEND, R = RC.nightmare;
check("rules: tiers normal/nightmare/hell, 7 slots × 5 lines each", RC.tiers.join() === "normal,nightmare,hell" && RC.tiers.every(t => Object.keys(RC[t].slots).length === 7 && Object.values(RC[t].slots).every(s => s.lines.length === 5)));
check("rules: targets (normal no res, nightmare 75, hell 75 — penalty −40/−70 from the gear total, dc#54)", RC.normal.targets.res === 0 && R.targets.res === 75 && RC.hell.targets.res === 75 && M.ELEMENTS.zonePenalty.nightmare === 40 && M.ELEMENTS.zonePenalty.hell === 70 && RC.tiers.every(t => RC[t].targets.lifesteal === 20 && RC[t].targets.crit === 75));
const linesOf = (t) => Object.values(RC[t].slots).flatMap(s => s.lines), cntIn = (t, k) => linesOf(t).filter(x => x === k).length;
check("rules: normal has no resist lines (armor hp + def, weapon atk)", linesOf("normal").every(k => !I.isResLine(k)) && cntIn("normal", "hp") === 5 && cntIn("normal", "def") === 5 && cntIn("normal", "atk") === 2 && cntIn("normal", "lifesteal") === 2);
check("rules: nightmare res lines (dc#54): fire 2 · ice 2 · bolt 2 · all res 2, weapon fire · off-hand ice", cntIn("nightmare", "fireRes") === 2 && cntIn("nightmare", "iceRes") === 2 && cntIn("nightmare", "boltRes") === 2 && cntIn("nightmare", "allRes") === 2 && R.slots.weapon.lines.includes("fireRes") && R.slots.offhand.lines.includes("iceRes") && cntIn("nightmare", "lifesteal") === 2);
check("rules: hell recommends a unique for each of the 7 slots + unique accessories", Object.entries(RC.hell.uniques).every(([slot, k]) => I.UNIQUE.items[k]?.slot === slot) && Object.keys(RC.hell.uniques).length === 7 && RC.hell.accUniques.neck.includes("eopgyeong") && RC.hell.accUniques.ring.includes("foxfire"));
check("recommendTier: item from normal / nightmare / hell", I.recommendTier({ v: 4, seed: "a|d70|k1" }) === "normal" && I.recommendTier({ v: 4, seed: "a|n3|k1" }) === "nightmare" && I.recommendTier({ v: 4, seed: "a|j3|u1" }) === "hell");
// 나이트메어 추천 줄로 만든 고대 레전더리 +10 7부위 + 장신구 3개(속성 하나 + 모든 속성)가 정말 목표를 채우는지 (규칙 계산)
const L = 125, tmpl = {};
const base = (slot, type) => { const k = slot + type; if (tmpl[k]) return tmpl[k]; for (let i = 0; ; i++) { const it = I.generate(`g|n50|k${i}`, "boss", L); if (it.slot === slot && it.rarity === "legendary" && (!type || it.type === type)) return (tmpl[k] = it); } };
const gear = Object.entries(R.slots).map(([slot, r]) => { const it = { ...base(slot, slot === "weapon" || slot === "offhand" ? "dagger" : null), enh: 10, ancient: true }; it.main = r.main.map(k => [k, I.mainRange(k, it)[1]]); it.lines = r.lines.map(k => [k, I.lineRangeOf(k, it)[1]]); return it; });
const accOf = (slot, el) => { for (let i = 0; ; i++) { const it = I.generate(`ga|n50|k${i}`, "boss", L); if (it.slot === slot && it.rarity === "legendary") return { ...it, lines: [[el, I.ACCESSORY.res[el].legendary[1]], ["allRes", I.ACCESSORY.res.allRes.legendary[1]]] }; } };
const T0 = I.totals(gear).stats;
check("rules: without accessories the gear lacks resist", ["fire", "ice", "bolt"].every(k => T0[k + "Res"] + T0.allRes < 75));
const accs = [accOf("neck", "fireRes"), accOf("ring", "iceRes"), accOf("ring", "boltRes")];
const T = I.totals([...gear, ...accs]).stats;
check("rules: the recommended ancient +10 gear + 3 accessories reaches nightmare res 75/75/75 after −40 (gear total ≥ 115), lifesteal 20, crit 75", ["fire", "ice", "bolt"].every(k => M.playerRes(T[k + "Res"] + T.allRes, 75, "nightmare") >= 75) && T.lifesteal >= 20 && T.crit >= 75, JSON.stringify({ res: ["fire", "ice", "bolt"].map(k => T[k + "Res"] + T.allRes), ls: T.lifesteal, crit: T.crit }));
const foxorb = (() => { for (let i = 0; ; i++) { const it = I.generateUnique(`gu${i}|j20|u${i}`, 145); if (it.uq === "foxorb") return it; } })();
const hellHead = (() => { for (let i = 0; ; i++) { const it = I.generate(`gh|j40|k${i}`, "boss", 165); if (it.slot === "head" && it.rarity === "legendary") return it; } })();
const sv = (d, rid) => JSON.stringify({ v: 1, season: 4, best: 75, clr: 1, nb: 10, run: { d, hp: 3000, mh: 3000, a: 30, g: 0, l: 40, x: 0, xn: 1e12, rid, k: 0, pp: 0 } });
try {
  const eq = eqOf(...gear.slice(0, 3));   // 무기·보조무기·투구만 장착 (나이트메어 아이템)
  const shield = (() => { for (let i = 0; ; i++) { const it = I.generate(`gs|n50|k${i}`, "boss", L); if (it.type === "shield" && it.rarity === "legendary") return it; } })();
  const { ctx, page, errors } = await open("guidetest-a", { rl_save: sv(5, "gdA"), rl_level: lv(5, "gdA", "normal"), "rl_inv:g:DEV": JSON.stringify({ bag: [shield, foxorb, hellHead], equip: eq, log: [], stones: 0, nmStones: 0 }) });
  await press(page, "i"); await sleep(200);
  check("inventory opens on the 능력치 tab", await page.locator("#inv-summary").isVisible() && !(await page.locator("#inv-detail").isVisible()));
  await page.locator(".inv-tab[data-tab=guide]").click(); await sleep(200);
  let d = await page.locator("#inv-guide").innerText();
  check("guide opens on the 일반 tier (player in the normal dungeon): no resist goal, hp/def lines", d.includes("📋 추천 능력치 (일반 75층)") && !d.includes("속성 저항 불") && d.includes("고대 레전더리 3 / 7부위") && d.includes("장신구 0 / 3칸") && d.includes("+10 이상 강화 3 / 7부위") && (await page.locator(".guide-tier.on").innerText()) === "일반", d.slice(0, 500));
  check("guide: 7 slot rows + accessory row", (await page.locator("#inv-guide .guide-slot").count()) === 8);
  await page.locator(".guide-tier", { hasText: "나이트메어" }).click(); await sleep(150);
  d = await page.locator("#inv-guide").innerText();
  check("나이트메어 tier: resist goal 75%, weapon ticks, 5/5 for NM gear", d.includes("📋 추천 능력치 (나이트메어 50층)") && d.includes("/ 75%") && d.includes("저항 2줄"), d.slice(0, 500));
  const w = await page.locator("#inv-guide .guide-slot", { hasText: "무기 (단검" }).innerText();
  check("guide: equipped weapon's matching lines are ticked", w.includes("✓흡혈%") && w.includes("✓공격력%") && w.includes("✓불 저항%") && w.includes("5/5"), w);
  const boots = await page.locator("#inv-guide .guide-slot", { hasText: "장화" }).innerText();
  check("guide: empty slot has no ticks", !boots.includes("✓") && boots.includes("비어 있음"), boots);
  await page.locator(".guide-tier", { hasText: "헬" }).click(); await sleep(150);
  d = await page.locator("#inv-guide").innerText();
  check("헬 tier: short — strongest uniques ranked, resist after −10, accessory goal, no per-slot rows", d.includes("📋 추천 능력치 (헬 50층)") && d.includes("/ 75% (장비 합 −70: 145% 모으기)") && d.includes("✦ 가장 강한 유니크 (헬 50층)") && d.includes("1. 여우구슬 지팡이") && d.includes("추천 유니크 장신구 0 / 3칸") && !d.includes("부위별 추천"), d.slice(0, 700));
  const link = page.locator("#inv-guide a.guide-builds");
  check("헬 tier: 🏆 최고 조합 보기 opens builds.html in a new window", await link.isVisible() && (await link.getAttribute("href")) === "builds.html" && (await link.getAttribute("target")) === "_blank");
  const [bp] = await Promise.all([ctx.waitForEvent("page"), link.click()]);
  await bp.waitForLoadState(); await sleep(300);
  const bt = await bp.locator("main").innerText();
  check("builds page: both lists + line guide + unused items", bt.includes("최고 조합 (헬)") && bt.includes("3. 헬 초반") && bt.includes("4. 파밍") && bt.includes("1위 폭풍전야(장검) + 도원결의(방패) + 서리의 세트 5") && bt.includes("줄 고르기"));
  await bp.locator(".tabs button", { hasText: "유니크 포함" }).click(); await sleep(100);
  check("builds page: unique tab — 여우구슬 지팡이 + 사자의 낫 + 화염의 세트 5 first", (await bp.locator("#withUnique").innerText()).includes("1위 여우구슬 지팡이 + 사자의 낫 + 화염의 세트 5"));
  await bp.locator(".tabs button", { hasText: "잘 안 쓰이는" }).click(); await sleep(100);
  const ut = await bp.locator("#unused").innerText();
  check("builds page: unused runewords/uniques listed", ["몰래", "선견지명", "카리스마", "여의주 검", "송곳니", "업경대", "여의 반지", "치유는 dc#53에서 없앴어요"].every(n => ut.includes(n)), ut.slice(0, 300));
  await bp.close();
  check("equip grid: each worn NM slot shows 추천 N/5 by its own tier (5/5)", (await page.locator("#inv-equip .slot", { hasText: "무기" }).innerText()).includes("추천 5/5") && (await page.locator("#inv-equip .slot", { hasText: "머리" }).innerText()).includes("추천 5/5"));
  await page.screenshot({ path: `${OUT}/guide.png` });
  await page.locator("#inv-equip .slot", { hasText: "무기" }).click(); await sleep(200);
  check("picking an item switches to the 상세 tab", await page.locator("#inv-detail").isVisible() && await page.locator(".inv-tab.on").innerText() === "상세");
  const wd = await page.locator("#inv-detail").innerText();
  check("item detail: 이 부위 추천 (나이트메어) with 5/5 and ticks", wd.includes("📋 무기 추천 (나이트메어) · 추가 능력치 5/5") && wd.includes("✓흡혈%"), wd.slice(-400));
  await page.locator(".bag-item", { hasText: I.itemName(shield) }).first().click(); await sleep(200);
  check("bag shield: offhand recommendation explains the longsword + shield option", (await page.locator("#inv-detail").innerText()).includes("장검 + 방패 조합 (추천은 보조 단검·지팡이·도끼 (방패 말고))"));
  await page.locator(".bag-item", { hasText: "여우구슬 지팡이" }).click(); await sleep(200);
  check("unique: detail says it is the recommended hell unique", (await page.locator("#inv-detail").innerText()).includes("무기 추천 (헬) · ✓ 추천 유니크"));
  await page.locator(".bag-item", { hasText: I.itemName(hellHead) }).first().click(); await sleep(200);
  const hd = await page.locator("#inv-detail").innerText();
  check("hell legendary: 머리 추천 (헬) shows the recommended unique first", hd.includes("머리 추천 (헬)") && hd.includes("✦ 추천 유니크: 구미호의 비녀"), hd.slice(-400));
  check("no page errors", errors.length === 0, errors.join("; "));
  await ctx.close();
} finally { await browser.close(); php.kill(); }
const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
