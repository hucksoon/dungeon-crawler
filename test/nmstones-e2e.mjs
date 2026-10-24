// 악몽 강화석: 나이트메어 아이템을 판매하면 나오고, 나이트메어 아이템은 악몽 강화석으로만 강화
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
const DB = path.join(DIR, "nms.sqlite"); for (const f of [DB, DB + "-wal", DB + "-shm"]) fs.rmSync(f, { force: true });
const CFG = path.join(DIR, "config.nms.php");
fs.writeFileSync(CFG, `<?php\n$c = require __DIR__ . '/config.test.php';\nreturn array_merge($c, ['db_dsn' => 'sqlite:${DB}']);\n`);
const php = spawn("php", ["-S", "127.0.0.1:8110", "-t", path.join(REPO, "ranking-php")], { env: { ...process.env, RANKING_CONFIG: CFG, TEST_JWT_SECRET: "nms" }, stdio: ["ignore", "ignore", "pipe"] });
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
    const res = await fetch(`http://127.0.0.1:8110/api.php${u.search}`, { method: req.method(), headers: { ...req.headers(), origin: ORIGIN.slice(0, -1) }, body: req.method() === "GET" ? undefined : req.postData() });
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
const nmE = find("nms|n4", it => it.slot === "boots" && it.rarity === "epic", 79);
const plain = find("nms|d70", it => it.slot === "chest" && it.rarity === "rare", 70);
const invOf = (bag, stones = 100, nmStones = 0) => JSON.stringify({ bag, equip: eqOf(), log: [], stones, nmStones });
const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("rl_inv:g:nmstest-a")));
const pick = async (page, it) => { await page.locator(".bag-item", { hasText: I.itemName(it) }).first().click(); await sleep(120); };
check("rules: nightmare items use 악몽 강화석, normal items 강화석", I.stoneKey(nmW) === "nmStones" && I.stoneKey(plain) === "stones" && I.STONE_NAMES.nmStones === "악몽 강화석");

try {
  let { ctx, page, errors } = await open("nmstest-a", { rl_save: saveN("nmsA"), rl_level: lv(5, "nmsA", "nm"), "rl_inv:g:DEV": invOf([nmW, nmR, nmE, plain]) });
  await press(page, "i"); await sleep(150);
  check("header shows 악몽 강화석 0 next to 강화석 100", (await page.locator("#inv-count").innerText()).includes("강화석 100 · 악몽 강화석 0"), await page.locator("#inv-count").innerText());
  await pick(page, nmW);
  let d = await page.locator("#inv-detail").innerText();
  check("nightmare item: enhance needs 악몽 강화석 (2개, 보유 0) → button disabled even with 100 normal stones", d.includes("악몽 강화석 2개 (보유 0개") && await page.locator("#inv-detail button", { hasText: /^강화$/ }).isDisabled());
  // 나이트메어 레어 판매 → 악몽 강화석
  await pick(page, nmR);
  check("nightmare item sell button says 악몽 강화석", (await page.locator("#inv-detail").innerText()).includes(`판매 (악몽 강화석 +${I.sellStones(nmR)} · 골드`));
  await page.locator("#inv-detail button", { hasText: "판매" }).click(); await sleep(150);
  let st = await stored(page);
  check("selling a nightmare item gives 악몽 강화석, normal stones unchanged", st.nmStones === I.sellStones(nmR) && st.stones === 100 && (await page.locator("#inv-detail").innerText()).includes(`악몽 강화석 +${I.sellStones(nmR)}`), JSON.stringify([st.stones, st.nmStones]));
  // 이제 강화 가능 → 악몽 강화석만 줄어듦
  await pick(page, nmW);
  await page.locator("#inv-detail button", { hasText: /^강화$/ }).click(); await sleep(150);
  st = await stored(page);
  check("enhancing a nightmare item spends 악몽 강화석 only", st.nmStones === I.sellStones(nmR) - 2 && st.stones === 100 && [...st.bag, ...Object.values(st.equip)].find(x => x?.id === nmW.id).enh === 1, JSON.stringify([st.stones, st.nmStones]));
  // 일반 아이템 강화는 일반 강화석
  await pick(page, plain);
  check("normal item: enhance line says 강화석 1개 (보유 100개)", (await page.locator("#inv-detail").innerText()).includes("강화석 1개 (보유 100개"));
  await page.locator("#inv-detail button", { hasText: /^강화$/ }).click(); await sleep(150);
  st = await stored(page);
  check("enhancing a normal item spends normal stones", st.stones === 99 && st.nmStones === I.sellStones(nmR) - 2);
  // 가방 전부 판매: 섞여 있으면 두 가지로
  const bag = (await stored(page)).bag;
  const n0 = st.nmStones, s0 = st.stones;
  const expN = bag.filter(I.isNightmareItem).reduce((a, it) => a + I.sellStones(it), 0), expS = bag.filter(it => !I.isNightmareItem(it)).reduce((a, it) => a + I.sellStones(it), 0);
  check("sell-all button shows both stone kinds", (await page.locator("#inv-sell-all").innerText()).includes(`강화석 +${expS} · 악몽 강화석 +${expN}`) || (await page.locator("#inv-sell-ask").innerText()).includes("악몽 강화석"), await page.locator("#inv-sell-all").innerText());
  await page.locator("#inv-sell-all").click(); await sleep(150);
  if (await page.locator("#inv-sell-ask").isVisible()) { await page.locator("#inv-sell-ask button", { hasText: "모두 판매" }).click(); await sleep(150); }
  st = await stored(page);
  check("sell all: normal → 강화석, nightmare → 악몽 강화석", st.stones === s0 + expS && st.nmStones === n0 + expN, JSON.stringify([st.stones, st.nmStones, s0 + expS, n0 + expN]));
  await page.screenshot({ path: path.join(OUT, "nmstones.png") });
  // 새로고침해도 남음
  await page.reload(); await sleep(500);
  await press(page, "i"); await sleep(150);
  check("after reload: 악몽 강화석 kept", (await page.locator("#inv-count").innerText()).includes(`악몽 강화석 ${n0 + expN}`));
  check("no page errors", errors.length === 0, errors.join("; "));
  await ctx.close();

  // ---- 나이트메어 골드: 처치 ×3, 더미 ×8, 판매 ×3 ----
  check("rules: nightmare gold kill ×3, pile ×8, sell gold ×3", M.NIGHTMARE.gold.kill === 3 && M.NIGHTMARE.gold.pile === 8 && I.sellGold(nmR) === 3 * I.sellGold({ ...nmR, seed: "plain|d80|k0" }));
  const mul = M.goldMultiplier(80);
  const rat = { x: 11, y: 10, id: "rat", ch: "r", name: "쥐", color: "#aaa", kind: "normal", hp: 1, maxHp: 1, atk: 0, def: 0, xp: 1 };
  ({ ctx, page, errors } = await open("nmstest-b", { rl_save: saveN("nmsB", { g: 0 }), rl_level: lv(5, "nmsB", "nm", [rat]), "rl_inv:g:DEV": invOf([]) }));
  await press(page, "ArrowRight"); await sleep(150);
  const g1 = Number(await page.locator("#gold").innerText());
  check("nightmare kill gold ×3 (normal monster at lvl 80: 39 or 78)", [3 * Math.round(1 * mul), 3 * Math.round(2 * mul)].includes(g1), String(g1));
  await ctx.close();
  // 새로 만든 나이트메어 층의 골드 더미
  ({ ctx, page, errors } = await open("nmstest-c", { rl_save: saveN("nmsC"), "rl_inv:g:DEV": invOf([]) }));
  await press(page, " "); await sleep(200);
  const L = await level(page);
  const piles = L.items.filter(i => i.type === "gold");
  check("nightmare gold piles ×8 (each = 8 × normal pile)", L.z === "nm" && piles.length >= 2 && piles.every(p => p.amount % 8 === 0 && p.amount >= 8 * Math.round(2 * mul) && p.amount <= 8 * Math.round(8 * mul)), JSON.stringify(piles.map(p => p.amount)));
  check("no page errors (gold)", errors.length === 0, errors.join("; "));
  await ctx.close();
  // 층 돌파 보상: 나이트메어 3층 계단 → 4층, 3층 레전더리 상점 가격 × 0.75
  const reward3 = Math.round(I.shopPrice({ rarity: "legendary", lvl: 78 }) * I.NM_SHOP.priceMul * M.NIGHTMARE.gold.floor / 5) * 5;
  ({ ctx, page, errors } = await open("nmstest-d", { rl_save: saveN("nmsD", { d: 3, g: 100 }), rl_level: lv(3, "nmsD", "nm", [], {}, [11, 10]), "rl_inv:g:DEV": invOf([]) }));
  await press(page, "ArrowRight"); await sleep(300);
  check(`floor clear reward: nightmare 3층 → +${reward3} gold, now 4층`, Number(await page.locator("#gold").innerText()) === 100 + reward3 && (await level(page)).d === 4 && (await logs(page)).includes(`나이트메어 3층 돌파! 층 보상 골드 +${reward3.toLocaleString()}`), await page.locator("#gold").innerText());
  check("reward ~5,100 at floor 1 … ~8,000 at floor 50", reward3 === 5220);
  check("no page errors (floor reward)", errors.length === 0, errors.join("; "));
  await ctx.close();
  // 일반 던전은 층 보상 없음
  ({ ctx, page, errors } = await open("nmstest-e", { rl_save: JSON.stringify({ v: 1, season: 4, best: 30, run: { d: 3, hp: 3000, mh: 3000, a: 30, g: 100, l: 40, x: 0, xn: 1e12, rid: "nmsE", k: 0, pp: 0 } }), rl_level: lv(3, "nmsE", "normal", [], {}, [11, 10]), "rl_inv:g:DEV": invOf([]) }));
  await press(page, "ArrowRight"); await sleep(300);
  check("normal dungeon: no floor reward", Number(await page.locator("#gold").innerText()) === 100 && (await level(page)).d === 4);
  await ctx.close();
} finally { await browser.close(); php.kill(); }
const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
