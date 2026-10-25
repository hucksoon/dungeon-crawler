// 로비 시간 상점: 매 시간 정각에 진열이 바뀜, 던전 상점과 같은 가격·바꾸기, 사람마다 다른 진열, 서버 검증
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import fs from "node:fs"; import path from "node:path";
import { goDoor } from "./town.mjs";   // 마을(옆에서 보는 로비) 문까지 걸어가 ↑
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
const DB = path.join(DIR, "hs.sqlite"); for (const f of [DB, DB + "-wal", DB + "-shm"]) fs.rmSync(f, { force: true });
const CFG = path.join(DIR, "config.hs.php");
fs.writeFileSync(CFG, `<?php\n$c = require __DIR__ . '/config.test.php';\nreturn array_merge($c, ['db_dsn' => 'sqlite:${DB}']);\n`);
const php = spawn("php", ["-S", "127.0.0.1:8107", "-t", path.join(REPO, "ranking-php")], { env: { ...process.env, RANKING_CONFIG: CFG, TEST_JWT_SECRET: "hs" }, stdio: ["ignore", "ignore", "pipe"] });
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
    const res = await fetch(`http://127.0.0.1:8107/api.php${u.search}`, { method: req.method(), headers: { ...req.headers(), origin: ORIGIN.slice(0, -1) }, body: req.method() === "GET" ? undefined : req.postData() });
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
const inv = (...eq) => JSON.stringify({ bag: [], equip: eqOf(...eq), log: [], stones: 0 });


const inLobby = (page) => page.evaluate(() => document.body.classList.contains("in-lobby"));
const saveB = (d, rid, best, g) => JSON.stringify({ v: 1, season: 4, best, run: { d, hp: 900, mh: 1000, a: 30, g, l: 20, x: 0, xn: 1e12, rid, k: 0, pp: 0 } });
// 포탈로 마을에 온 뒤 시간 상점 문으로 걸어가 ↑
async function toHourShop(page) {
  // 새로고침 직후에는 키를 아직 안 받을 수 있음 → 마을에 올 때까지 P
  for (let i = 0; i < 10 && !(await page.evaluate(() => document.body.classList.contains("in-lobby"))); i++) { await press(page, "p"); await sleep(300); }
  await goDoor(page, "hourshop");
}
// 새로고침은 던전에서 하고 (로비 시작 자리는 무작위라) 다시 포탈로 나와서 상점으로
async function reloadToShop(page) {
  await page.evaluate(() => sessionStorage.setItem("rl_scene", "dungeon"));
  await page.reload(); await sleep(500);
  await toHourShop(page);
}
const cards = (page) => page.locator("#shop-items .shop-card h3").allInnerTexts();
const gold = async (page) => Number(await page.locator("#gold").innerText());
const shift = (page, ms) => page.evaluate((ms) => { window.__shift += ms; sessionStorage.setItem("shift", window.__shift); }, ms);
const hs = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("rl_hourshop:g:hstest-a00")));

check("rules: hourIndex = hours since epoch, ownerTag 8 hex", I.hourIndex(7200000) === 2 && /^[0-9a-f]{8}$/.test(I.ownerTag("g:x")) && I.ownerTag("g:x") !== I.ownerTag("g:y"));
const A = I.lobbyShopStock(I.ownerTag("g:a"), 500000, 30), B = I.lobbyShopStock(I.ownerTag("g:b"), 500000, 30);
check("rules: 6 golden items, level fixed, rare or better", A.length === 6 && A.every(it => it.lvl === 30 && ["rare", "epic", "legendary", "set"].includes(it.rarity) && it.seed.startsWith("lobby|")));
check("rules: different people get different stock", A.map(i => i.id).join() !== B.map(i => i.id).join());
check("rules: same hour → same stock, next hour / reroll → different", I.lobbyShopStock(I.ownerTag("g:a"), 500000, 30).map(i => i.id).join() === A.map(i => i.id).join()
  && I.lobbyShopStock(I.ownerTag("g:a"), 500001, 30).map(i => i.id).join() !== A.map(i => i.id).join() && I.lobbyShopStock(I.ownerTag("g:a"), 500000, 30, 1)[0].seed.endsWith("|r1|s0"));

let bought, boughtN;
try {
  const DEV = "hstest-a00", tag = I.ownerTag(`g:${DEV}`);
  let { ctx, page, errors } = await open(DEV, { rl_save: saveB(20, "hsA", 34, 20000), rl_level: lv(20, "hsA", "normal"), "rl_inv:g:DEV": inv() });
  await toHourShop(page);
  const h0 = await page.evaluate(() => Math.floor(Date.now() / 3600000));
  const want = I.lobbyShopStock(tag, h0, 34);
  check("walking into the lobby building opens 시간 상점", await inLobby(page) && !(await page.locator("#shop-modal").isHidden()) && (await page.locator("#shop-title").innerText()) === "시간 상점");
  check("sub text says it changes on the hour, with minutes left and item level", /매 시간 정각에 진열이 새로 바뀌어요 \(다음 갱신까지 \d+분\)\. 아이템 레벨 34\./.test(await page.locator("#shop-sub").innerText()), await page.locator("#shop-sub").innerText());
  check("stock = lobbyShopStock(my tag, this hour, best floor)", (await cards(page)).join("|") === want.map(I.itemName).join("|"), (await cards(page)).join("|"));
  await page.screenshot({ path: path.join(OUT, "hourshop.png") });
  // 구매
  const g0 = await gold(page), price = I.shopPrice(want[0]);
  await page.locator("#shop-items .shop-card").nth(0).locator("button").click(); await sleep(150);
  const bag = JSON.parse(await page.evaluate((d) => localStorage.getItem(`rl_inv:g:${d}`), DEV)).bag;
  check("buy: gold goes down by the dungeon shop price, item in bag", (await gold(page)) === g0 - price && bag.some(x => x.id === want[0].id) && (await page.locator("#shop-msg").innerText()).includes("골드에 샀어요"));
  check("buy: card shows 판매 완료, saved per owner", (await page.locator("#shop-items .shop-card").nth(0).innerText()).includes("판매 완료") && JSON.stringify((await hs(page)).b) === "[0]" && (await hs(page)).h === h0 && (await hs(page)).lv === 34);
  bought = bag.find(x => x.id === want[0].id);
  // 닫고 다시 열기 / 새로고침해도 같은 진열, 산 칸 유지
  await press(page, "Escape"); await sleep(100);
  await page.screenshot({ path: path.join(OUT, "hourshop-lobby.png") });
  await reloadToShop(page);
  check("after reload: same stock, slot still sold", (await cards(page)).join("|") === want.map(I.itemName).join("|") && (await page.locator("#shop-items .shop-card").nth(0).innerText()).includes("판매 완료"));
  // 진열 바꾸기
  const g1 = await gold(page), rc = I.rerollCost(34, 0);
  await page.locator("#shop-reroll").click(); await sleep(150);
  const want1 = I.lobbyShopStock(tag, h0, 34, 1);
  check("reroll: same cost as the dungeon shop, new stock, sold marks reset", (await gold(page)) === g1 - rc && (await cards(page)).join("|") === want1.map(I.itemName).join("|") && !(await page.locator("#shop-items").innerText()).includes("판매 완료") && (await hs(page)).r === 1);
  // 정각이 지난 뒤 (창을 연 채로) 누르면 사지 않고 새 진열
  await shift(page, 3600000);
  const g2 = await gold(page);
  await page.locator("#shop-items .shop-card").nth(1).locator("button").click(); await sleep(150);
  const want2 = I.lobbyShopStock(tag, h0 + 1, 34);
  check("past the hour with the window open: click is ignored, new stock shown", (await gold(page)) === g2 && (await page.locator("#shop-msg").innerText()).includes("정각이 지나") && (await cards(page)).join("|") === want2.map(I.itemName).join("|"));
  check("new hour: rerolls back to 3", (await page.locator("#shop-reroll").innerText()).includes("남은 횟수 3/3"));
  // 같은 아이템을 다시 사려고 하면 막음 (다른 기기에서 이미 산 경우)
  await press(page, "Escape");
  await page.evaluate(() => { const k = "rl_hourshop:g:hstest-a00"; localStorage.setItem(k, JSON.stringify({ ...JSON.parse(localStorage.getItem(k)), r: 0, b: [] })); });
  await shift(page, -3600000);
  await reloadToShop(page);
  // 산 칸 기록만 지운 셈 (다른 기기) → 0번 칸은 이미 가진 아이템
  const g3 = await gold(page);
  await page.locator("#shop-items .shop-card").nth(0).locator("button").click(); await sleep(150);
  check("already-owned item: not bought twice", (await gold(page)) === g3 && (await page.locator("#shop-msg").innerText()).includes("이미 가지고 있는") && JSON.parse(await page.evaluate((d) => localStorage.getItem(`rl_inv:g:${d}`), DEV)).bag.filter(x => x.id === want[0].id).length === 1);
  // 던전 상점은 그대로
  await press(page, "Escape");
  check("no page errors", errors.length === 0, errors.join("; "));
  await ctx.close();

  // 던전 상점은 예전 그대로 (같은 창을 같이 씀)
  ({ ctx, page, errors } = await open("hstest-c00", { rl_save: saveB(4, "hsC", 4, 5000), rl_level: lv(4, "hsC", "normal", [], { shop: { x: 11, y: 10 } }), "rl_inv:g:DEV": inv() }));
  await press(page, "ArrowRight"); await sleep(150);
  const ds = I.shopStock("hsC", 4, 0);
  check("dungeon shop: title 상점, floor text, stock by (run, floor)", (await page.locator("#shop-title").innerText()) === "상점" && (await page.locator("#shop-sub").innerText()).includes("이 층에서만") && (await cards(page)).join("|") === ds.map(I.itemName).join("|"));
  const dg = await gold(page);
  await page.locator("#shop-items .shop-card").nth(2).locator("button").click(); await sleep(150);
  const run = JSON.parse(await page.evaluate(() => localStorage.getItem("rl_save"))).run;
  check("dungeon shop: buy saves in the run (not the hourly state)", (await gold(page)) === dg - I.shopPrice(ds[2]) && JSON.stringify(run.sb) === "[2]" && !(await page.evaluate(() => localStorage.getItem("rl_hourshop:g:hstest-c00"))));
  await page.locator("#shop-reroll").click(); await sleep(150);
  check("dungeon shop: reroll → (run, floor, 1)", (await cards(page)).join("|") === I.shopStock("hsC", 4, 1).map(I.itemName).join("|") && JSON.parse(await page.evaluate(() => localStorage.getItem("rl_save"))).run.sr === 1);
  check("no page errors (dungeon shop)", errors.length === 0, errors.join("; "));
  await ctx.close();

  // 나이트메어 기록이 있으면 나이트메어 아이템 (레벨 75 + 나이트메어 최고 층), 가격·바꾸기 ×2
  const hourNow = Math.floor(Date.now() / 3600000);
  ({ ctx, page, errors } = await open("hstest-n00", { "rl_hourshop:g:DEV": JSON.stringify({ h: hourNow, lv: 75, b: [0, 1], r: 2 }), rl_save: JSON.stringify({ v: 1, season: 4, best: 75, clr: 1, nb: 10, run: { d: 20, hp: 900, mh: 1000, a: 30, g: 50000, l: 20, x: 0, xn: 1e12, rid: "hsN", k: 0, pp: 0 } }), rl_level: lv(20, "hsN", "normal"), "rl_inv:g:DEV": inv() }));
  await toHourShop(page);
  const hn = await page.evaluate(() => Math.floor(Date.now() / 3600000));
  // (상태는 이 시간에 업데이트 전 형식으로 이미 저장돼 있었음 → n이 없으면 새로 만듦: 아래 open에서 미리 넣음)
  const wantN = I.lobbyShopStock(I.ownerTag("g:hstest-n00"), hn, 85, 0, 10);
  check("old-format state saved this hour (no n) is rebuilt: rerolls back to 3", (await page.locator("#shop-reroll").innerText()).includes("남은 횟수 3/3") && !(await page.locator("#shop-items").innerText()).includes("판매 완료"));
  check("nightmare player: nightmare stock lvl 85 (악몽의 …)", (await cards(page)).join("|") === wantN.map(I.itemName).join("|") && wantN.every(it => it.lvl === 85 && I.isNightmareItem(it) && it.seed.includes("|n10|h")) && (await page.locator("#shop-sub").innerText()).includes("나이트메어 아이템 (나이트메어 10층 · 아이템 레벨 85)"));
  check("nightmare stock: price ×2, reroll ×2", I.shopPrice(wantN[0]) === 2 * I.shopPrice({ rarity: wantN[0].rarity, lvl: 85 }) && (await page.locator("#shop-items .shop-card").nth(0).innerText()).includes(`${I.shopPrice(wantN[0])} 골드`) && (await page.locator("#shop-reroll").innerText()).includes(`${I.rerollCost(85, 0, true)} 골드`) && I.rerollCost(85, 0, true) === 2 * I.rerollCost(85, 0));
  const gN = await gold(page);
  await page.locator("#shop-items .shop-card").nth(0).locator("button").click(); await sleep(150);
  check("nightmare stock: buy takes ×2 price", (await gold(page)) === gN - I.shopPrice(wantN[0]));
  boughtN = wantN[0];
  check("no page errors (nightmare stock)", errors.length === 0, errors.join("; "));
  await ctx.close();

  // 레벨은 최고 층(75 넘으면 75), 게스트마다 다른 진열
  ({ ctx, page, errors } = await open("hstest-b00", { rl_save: saveB(20, "hsB", 75, 100), rl_level: lv(20, "hsB", "normal"), "rl_inv:g:DEV": inv() }));
  await toHourShop(page);
  const hb = await page.evaluate(() => Math.floor(Date.now() / 3600000));
  check("other guest: own stock at level 75, buttons disabled without gold", (await cards(page)).join("|") === I.lobbyShopStock(I.ownerTag("g:hstest-b00"), hb, 75).map(I.itemName).join("|")
    && (await page.locator("#shop-items button").first().isDisabled()) && (await page.locator("#shop-sub").innerText()).includes("아이템 레벨 75"));
  await ctx.close();
} finally { await browser.close(); }

// 서버: lobby 시드 검증
const post = (guest, body) => fetch("http://127.0.0.1:8107/api.php?r=score", { method: "POST", headers: { "Content-Type": "application/json", Origin: ORIGIN.slice(0, -1), "X-Guest-Id": guest }, body: JSON.stringify(body) }).then(r => r.json());
const me = (guest) => fetch(`http://127.0.0.1:8107/api.php?r=me`, { headers: { Origin: ORIGIN.slice(0, -1), "X-Guest-Id": guest } }).then(r => r.json());
const player = async (guest) => (await fetch(`http://127.0.0.1:8107/api.php?r=player&id=${(await me(guest)).id}`, { headers: { Origin: ORIGIN.slice(0, -1) } })).json();
const ref = (it) => ({ seed: it.seed, src: it.src, lvl: it.lvl, v: 4, enh: 0, id: it.id, r: it.r });
try {
  await post("hs-guest-0001", { stage: 34, plvl: 20, gear: [ref(bought)] });
  const p1 = await player("hs-guest-0001");
  check("server: bought lobby item accepted", p1.gear?.items?.some(x => x.slot === bought.slot) && !p1.gear.rejected, JSON.stringify(p1.gear));
  const future = I.lobbyShopStock(I.ownerTag("g:z"), I.hourIndex() + 5, 30)[0];
  await post("hs-guest-0002", { stage: 34, plvl: 20, gear: [ref(future)] });
  check("server: item from a future hour rejected", (await player("hs-guest-0002")).gear.rejected === 1);
  const high = I.lobbyShopStock(I.ownerTag("g:z"), I.hourIndex(), 60)[0];
  await post("hs-guest-0003", { stage: 34, plvl: 20, gear: [ref(high)] });
  check("server: level above best floor rejected", (await player("hs-guest-0003")).gear.rejected === 1);
  const fake = { ...ref(bought), seed: bought.seed.replace(/^lobby\|/, "lobby|zz") };
  await post("hs-guest-0004", { stage: 34, plvl: 20, gear: [fake] });
  check("server: bad lobby seed rejected", (await player("hs-guest-0004")).gear.rejected === 1);
  await post("hs-guest-0005", { stage: 76, nm: 10, plvl: 30, gear: [ref(boughtN)] });
  const p5 = await (async () => { const id = (await me("hs-guest-0005")).id; return (await fetch(`http://127.0.0.1:8107/api.php?r=player&id=${id}&season=nm`, { headers: { Origin: ORIGIN.slice(0, -1) } })).json(); })();
  check("server: nightmare lobby item (|n10|, lvl 85) accepted", p5.gear && !p5.gear.rejected && p5.gear.items.length === 1, JSON.stringify(p5.gear));
  const wrong = { ...ref(boughtN), seed: boughtN.seed.replace("|n10|", "|n12|") };
  await post("hs-guest-0006", { stage: 76, nm: 20, plvl: 30, gear: [wrong] });
  const p6 = await (async () => { const id = (await me("hs-guest-0006")).id; return (await fetch(`http://127.0.0.1:8107/api.php?r=player&id=${id}&season=nm`, { headers: { Origin: ORIGIN.slice(0, -1) } })).json(); })();
  check("server: nightmare lobby item with wrong floor/level rejected", p6.gear?.rejected === 1, JSON.stringify(p6.gear));
} finally { php.kill(); }
check("no php errors", !/Fatal|Warning|Notice|Deprecated/.test(phpErr), phpErr.slice(0, 400));
const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
