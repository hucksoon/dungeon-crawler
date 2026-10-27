// 고대 다시 굴리기: 레전더리·세트를 골드로 굴려 5% 확률로 고대, 아이템마다 20번, 서버 검증(ar)
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
const EL = M.ELEMENTS;

// ---- 서버 ----
const DIR = path.dirname(new URL(import.meta.url).pathname) + "/php";
const DB = path.join(DIR, "anc.sqlite"); for (const f of [DB, DB + "-wal", DB + "-shm"]) fs.rmSync(f, { force: true });
const CFG = path.join(DIR, "config.anc.php");
fs.writeFileSync(CFG, `<?php\n$c = require __DIR__ . '/config.test.php';\nreturn array_merge($c, ['db_dsn' => 'sqlite:${DB}']);\n`);
const php = spawn("php", ["-S", "127.0.0.1:8106", "-t", path.join(REPO, "ranking-php")], { env: { ...process.env, RANKING_CONFIG: CFG, TEST_JWT_SECRET: "anc" }, stdio: ["ignore", "ignore", "pipe"] });
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
    const res = await fetch(`http://127.0.0.1:8106/api.php${u.search}`, { method: req.method(), headers: { ...req.headers(), origin: ORIGIN.slice(0, -1) }, body: req.method() === "GET" ? undefined : req.postData() });
    r.fulfill({ status: res.status, headers: { "content-type": "application/json", "access-control-allow-origin": "*" }, body: await res.text() }); });
  await ctx.route("https://login.xsolla.com/**", r => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await ctx.addInitScript(([seed, dev]) => { if (sessionStorage.getItem("seeded")) return; sessionStorage.setItem("seeded", 1); sessionStorage.setItem("rl_scene", "dungeon");
    localStorage.setItem("rl_device_id", dev); localStorage.setItem(`rl_notice_v4:g:${dev}`, "1"); localStorage.setItem(`rl_notice_75:g:${dev}`, "1");
    for (const [k, v] of Object.entries(seed)) localStorage.setItem(k.replace("DEV", dev), v);
    window.__log = []; document.addEventListener("DOMContentLoaded", () => new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => window.__log.push(n.textContent)))).observe(document.getElementById("log"), { childList: true })); }, [seed, dev]);
  await page.goto(ORIGIN); await sleep(450);
  return { ctx, page, errors };
}
const logs = (page) => page.evaluate(() => (window.__log || []).join("\n"));
const level = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("rl_level")));
const press = async (page, k, n = 1) => { for (let i = 0; i < n; i++) { await page.keyboard.press(k); await sleep(30); } };
const inv = (...eq) => JSON.stringify({ bag: [], equip: eqOf(...eq), log: [], stones: 0 });


const AR = I.ANCIENT_REROLL;
check("rules: 5% per roll, 20 rolls per item, cost = 1/3 shop price", AR.chance === 0.05 && AR.max === 20 && Math.abs(AR.costMul - 1 / 3) < 1e-9);
const find = (pred) => { for (let i = 0; i < 400000; i++) { const it = I.generate(`anc|d50|k${i}`, "golden", 50); if (pred(it)) return it; } throw new Error("not found"); };
const lucky = find(it => it.rarity === "legendary" && !it.ancient && I.ancientRerollHit(it, 1));
const unlucky = find(it => it.rarity === "set" && it.slot !== lucky.slot && !it.ancient && !I.ancientRerollHit(it, 1) && !I.ancientRerollHit(it, 2));
const epic = find(it => it.rarity === "epic");
const cost = I.ancientRerollCost(lucky), cost2 = I.ancientRerollCost(unlucky);
check(`cost at lvl 50 = 1/3 of shop price: legendary ${cost}, set ${cost2}`, cost === Math.round(I.shopPrice(lucky) / 3 / 5) * 5 && cost2 === Math.round(I.shopPrice(unlucky) / 3 / 5) * 5 && cost === 785);
const saveG = (rid, gold) => JSON.stringify({ v: 1, f50: 1, season: 4, best: 50, run: { d: 50, hp: 900, mh: 1000, a: 300, g: gold, l: 20, x: 0, xn: 1e12, rid, k: 0, pp: 0 } });
const invOf = (page, dev) => page.evaluate((k) => JSON.parse(localStorage.getItem(k)), `rl_inv:g:${dev}`);
const pick = async (page, it) => { await page.locator(".bag-item", { hasText: I.itemName(it) }).first().click(); await sleep(100); };
try {
  let { ctx, page, errors } = await open("anctest-a", { rl_save: saveG("ancA", 100000), rl_level: lv(50, "ancA", "normal"), "rl_inv:g:DEV": JSON.stringify({ bag: [lucky, unlucky, epic], equip: Object.fromEntries(I.SLOTS.map(s => [s, null])), log: [], stones: 0 }) });
  await press(page, "i"); await sleep(150);
  // 에픽은 굴리기 없음
  await pick(page, epic);
  check("no ancient roll for epic", !(await page.locator("#inv-detail").innerText()).includes("고대 굴리기"));
  // 세트: 실패 → 골드 빠짐, 남은 횟수 19/20
  await pick(page, unlucky);
  check("set item shows the ancient roll (5%, cost, 20/20)", (await page.locator("#inv-detail").innerText()).match(new RegExp(`고대 굴리기: 5% 확률로 고대\\(모든 능력치 최대치\\) · ${cost2.toLocaleString()}골드 \\(보유 [\\d,]+골드\\) · 남은 횟수 20/20`)));
  await page.locator("#inv-detail button", { hasText: "고대 굴리기" }).click(); await sleep(150);
  let inv = await invOf(page, "anctest-a");
  const u = inv.bag.find(x => x.id === unlucky.id);
  check("failed roll: gold spent, ar 1, still not ancient, 19 left", u.ar === 1 && !u.ancient && (await page.locator("#gold").innerText()) === String(100000 - cost2) && (await page.locator("#inv-detail").innerText()).includes("남은 횟수 19/20") && (await page.locator("#inv-detail").innerText()).includes("고대 굴리기 실패"), `${JSON.stringify([u.ar, u.ancient])} gold ${await page.locator("#gold").innerText()}`);
  // 레전더리: 첫 굴림에 고대
  await pick(page, lucky);
  await page.locator("#inv-detail button", { hasText: "고대 굴리기" }).click(); await sleep(150);
  inv = await invOf(page, "anctest-a");
  const l = inv.bag.find(x => x.id === lucky.id);
  const maxed = l.main.every(([k, v]) => v === I.mainRange(k, l)[1]) && l.lines.every(([k, v]) => v === I.lineRangeOf(k, l)[1]);
  check("lucky roll: becomes ancient (all stats max), name 고대, gold spent", l.ancient && l.ar === 1 && maxed && (await page.locator("#inv-detail").innerText()).includes("고대가 됐어요!") && (await page.locator("#gold").innerText()) === String(100000 - cost2 - cost));
  check("ancient item has no more roll button", !(await page.locator("#inv-detail button", { hasText: "고대 굴리기" }).count()));
  check("log line", (await logs(page)).includes("고대가 됐어요!"));
  await page.screenshot({ path: path.join(OUT, "ancient-roll.png") });
  // 새로고침해도 고대 유지
  await page.reload(); await sleep(500);
  inv = await invOf(page, "anctest-a");
  check("ancient survives a reload", inv.bag.find(x => x.id === lucky.id).ancient === true);
  check("no page errors", errors.length === 0, errors.join("; "));
  await ctx.close();

  // 골드 부족 / 20번 다 씀
  ({ ctx, page, errors } = await open("anctest-b", { rl_save: saveG("ancB", 10), rl_level: lv(50, "ancB", "normal"), "rl_inv:g:DEV": JSON.stringify({ bag: [unlucky, { ...lucky, ar: 20 }], equip: Object.fromEntries(I.SLOTS.map(s => [s, null])), log: [], stones: 0 }) }));
  await press(page, "i"); await sleep(150);
  await pick(page, unlucky);
  check("not enough gold → button disabled", await page.locator("#inv-detail button", { hasText: "고대 굴리기" }).isDisabled());
  await pick(page, lucky);
  check("20 rolls used → fixed disabled 20/20번 실패 button, message", (await page.locator("#inv-detail button", { hasText: "고대 굴리기" }).count()) === 1 && await page.locator("#inv-detail button", { hasText: "고대 굴리기 20/20번 실패" }).isDisabled() && (await page.locator("#inv-detail").innerText()).includes("20번 모두 실패했어요"));
  await ctx.close();

  // 판매하면 강화석과 골드
  ({ ctx, page, errors } = await open("anctest-c", { rl_save: saveG("ancC", 1000), rl_level: lv(50, "ancC", "normal"), "rl_inv:g:DEV": JSON.stringify({ bag: [epic], equip: Object.fromEntries(I.SLOTS.map(s => [s, null])), log: [], stones: 0 }) }));
  await press(page, "i"); await sleep(150);
  await pick(page, epic);
  page.removeAllListeners("dialog"); page.on("dialog", d => d.accept());
  await page.locator("#inv-detail button", { hasText: "판매" }).click(); await sleep(150);
  check(`selling gives gold too (epic lvl 50: +${I.sellGold(epic)})`, (await page.locator("#gold").innerText()) === String(1000 + I.sellGold(epic)) && I.sellGold(epic) === 90 && (await page.locator("#inv-detail").innerText()).includes(`골드 +${I.sellGold(epic)}`));
  await ctx.close();

  // 서버: ar로 다시 계산
  const post = (guest, body) => fetch("http://127.0.0.1:8106/api.php?r=score", { method: "POST", headers: { "Content-Type": "application/json", Origin: ORIGIN.slice(0, -1), "X-Guest-Id": guest }, body: JSON.stringify(body) }).then(r => r.json());
  const me = (guest) => fetch(`http://127.0.0.1:8106/api.php?r=me`, { headers: { Origin: ORIGIN.slice(0, -1), "X-Guest-Id": guest } }).then(r => r.json());
  const player = async (guest) => (await fetch(`http://127.0.0.1:8106/api.php?r=player&id=${(await me(guest)).id}`, { headers: { Origin: ORIGIN.slice(0, -1) } })).json();
  const ref = (it, ar) => ({ seed: it.seed, src: it.src, lvl: it.lvl, v: 4, enh: 0, id: it.id, r: it.r, ...(ar ? { ar } : {}) });
  await post("anc-guest-0001", { stage: 50, plvl: 20, item: { ...ref(lucky, 1), rarity: "legendary", name: "x" }, gear: [ref(lucky, 1), ref(unlucky, 2)] });
  const p1 = await player("anc-guest-0001");
  const lv1 = p1.gear.items.find(x => x.slot === lucky.slot), uv = p1.gear.items.find(x => x.slot === unlucky.slot);
  check("server: ar 1 hit → ancient, ar 2 misses → not ancient", lv1?.ancient === true && nameOf(lv1)?.startsWith("고대") && uv && !uv.ancient && !p1.gear.rejected, JSON.stringify([nameOf(lv1), nameOf(uv), p1.gear.rejected]));
  check("server: best item shows 고대", p1.bestItem?.ancient === true);
  await post("anc-guest-0002", { stage: 50, plvl: 20, gear: [ref(lucky, 21)] });
  check("server: ar over 20 rejected", (await player("anc-guest-0002")).gear.rejected === 1);
} finally { await browser.close(); php.kill(); }
check("no php errors", !/Fatal|Warning|Notice|Deprecated/.test(phpErr), phpErr.slice(0, 400));
const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
