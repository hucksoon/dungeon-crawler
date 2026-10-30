// 이벤트 (dc#130) 브라우저 테스트: 할로윈 기간이면 마을·몬스터 모습이 바뀌고, 상점에서 하루 한 번 호박 사탕 → 10개로 스킨 → 남은 것은 캐시(우편함)
//   게임에서 가진 스킨을 인벤토리 "꾸미기"로 쓰고 벗기 (2D 인형 · 3D 손의 낫), 기간 전에는 아무것도 바뀌지 않음, 포털 빌드는 배너 없음
//   브라우저 시계(page clock)와 서버 날짜(설정 event_today)를 할로윈 기간(11/2)으로 맞춤
//   하루 한 번 (dc#131): 상점이 Xsolla 무료 아이템(event_coin)을 주문 → 가짜 Xsolla 인벤토리에 들어감 → 서버가 꺼내 재화로. 하루 1개 제한도 가짜로 흉내
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import http from "node:http"; import crypto from "node:crypto"; import fs from "node:fs"; import path from "node:path";
const require = createRequire(process.env.NODE_PATH + "/");
const { chromium } = require("playwright");
const REPO = process.argv[2], SHOTS = process.argv[3];
const DIR = path.dirname(new URL(import.meta.url).pathname) + "/php";
const I = createRequire(import.meta.url)(path.join(REPO, "items.js"));
const DB = path.join(DIR, "event-e2e.sqlite"); for (const f of [DB, DB + "-wal", DB + "-shm"]) fs.rmSync(f, { force: true });
const CFG = path.join(DIR, "config.event-e2e.php");
const setDay = (day) => fs.writeFileSync(CFG, `<?php\n$c = require __DIR__ . '/config.test.php';\nreturn array_merge($c, ['db_dsn' => 'sqlite:${DB}', 'xsolla_store_url' => 'http://127.0.0.1:8133/store', 'xsolla_api_key' => 'test-key', 'event_today' => '${day}']);\n`);
setDay("2026-11-02");
const SECRET = "event-e2e-secret";
const ORIGIN = "https://hucksoon.github.io/hucksoon/", API = "http://127.0.0.1:8132/api.php";
const results = []; const check = (n, ok, x = "") => { results.push(!!ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x && !ok ? " — " + x : ""}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
// 가짜 Xsolla: 사용자 인벤토리(서버가 꺼냄)와 무료 아이템 하루 1개 제한(bought: 오늘 이미 주문함)
const xs = { inv: {}, bought: {} };
const subOf = (h) => { try { return JSON.parse(Buffer.from(String(h).replace("Bearer ", "").split(".")[1], "base64url")).sub; } catch { return null; } };
const mock = http.createServer((q, res) => { let b = ""; q.on("data", c => b += c); q.on("end", () => {
  const p = q.url.replace("/store/v2/project/317991", ""), sub = subOf(q.headers.authorization);
  const send = (s, o) => { res.writeHead(s, { "Content-Type": "application/json" }); res.end(o == null ? "" : JSON.stringify(o)); };
  if (p.startsWith("/user/inventory/items")) return send(200, { items: xs.inv[sub] ? [{ sku: "event_coin", quantity: xs.inv[sub] }] : [] });
  if (p === "/user/inventory/item/consume") { if (!(xs.inv[sub] > 0)) return send(422, { errorCode: 4001 }); xs.inv[sub]--; return send(204, null); }
  send(404, { errorCode: 9 }); }); });
await new Promise(r => mock.listen(8133, "127.0.0.1", r));
const php = spawn("php", ["-S", "127.0.0.1:8132", "-t", path.join(REPO, "ranking-php")], { env: { ...process.env, RANKING_CONFIG: CFG, TEST_JWT_SECRET: SECRET }, stdio: "ignore" });
await sleep(700);
const b64u = (s) => Buffer.from(s).toString("base64url");
const jwt = (sub, email) => { const h = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" })), p = b64u(JSON.stringify({ sub, email, exp: Math.floor(Date.now() / 1000) + 7200, xsolla_login_project_id: "30375188-893b-4b1a-ba1b-c8ba692fa5e3" })); return `${h}.${p}.${crypto.createHmac("sha256", SECRET).update(`${h}.${p}`).digest("base64url")}`; };
const NOV2 = Date.parse("2026-11-02T03:00:00Z"), OCT30 = Date.parse("2026-10-30T03:00:00Z");
const authOf = (sub, email, now) => JSON.stringify({ access: jwt(sub, email), refresh: "r", exp: now + 7200_000 });   // 브라우저 시계 기준 만료
const HOOK = `
  window.__t = { doll: () => (Doll.canvas(), Doll.key()), name: (n) => Sprites.name(n), scene: () => scene, enter: () => enterDungeon("start"), refresh: () => Events.refresh() };
  // ---- 시작 ----`;
const nulls = Object.fromEntries(I.EQUIP_SLOTS.map(s => [s, null]));
const sword = (() => { for (let i = 0; i < 20000; i++) { const it = I.generate(`ev|k${i}`, "boss", 20); if (it.slot === "weapon" && it.type === "longsword") return it; } })();
const save = JSON.stringify({ v: 1, f50: 1, season: 4, best: 5, run: { d: 1, hp: 300, mh: 300, a: 50, g: 0, p: 1, l: 5, x: 0, xn: 1e9, rid: "ev-run", k: 0, pp: 0 } });
const tips = JSON.stringify(["intro", "dungeon", "gear", "lowhp"]);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
async function open(file, storage, { now = NOV2, portal = false, scene = "lobby", q = "", setup = null } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 950 } }); const page = await ctx.newPage(); const errors = [], dialogs = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("dialog", d => { dialogs.push(d.message()); d.accept(); });
  await ctx.clock.setFixedTime(now);
  await ctx.route(ORIGIN + "**", r => { const f = new URL(r.request().url()).pathname.replace("/hucksoon/", "") || "index.html";
    if (f === "ranking-config.js") return r.fulfill({ contentType: "text/javascript", body: `window.RANKING_API = ${JSON.stringify(portal ? "" : API)};` });
    const p = path.join(REPO, f); if (!fs.existsSync(p)) return r.fulfill({ status: 404, body: "" });
    let body = fs.readFileSync(p); if (f === "index.html") body = body.toString().replace("  // ---- 시작 ----", HOOK);
    r.fulfill({ contentType: { ".js": "text/javascript", ".png": "image/png", ".webp": "image/webp", ".css": "text/css" }[path.extname(f)] || "text/html", body }); });
  await ctx.route(API + "**", async r => { const req = r.request();
    const res = await fetch(req.url(), { method: req.method(), headers: req.headers(), body: ["GET", "OPTIONS"].includes(req.method()) ? undefined : req.postData() });
    r.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: Buffer.from(await res.arrayBuffer()) }); });
  // 상점의 Xsolla 호출: 이벤트 재화 아이템(오늘 주문했으면 can_be_bought false)과 무료 주문만, 나머지 카탈로그는 막음
  await ctx.route(/store\.xsolla\.com/, r => { const q = r.request(), u = new URL(q.url()), sub = subOf(q.headers().authorization);
    const send = (s, o) => r.fulfill({ status: s, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" }, body: o == null ? "" : JSON.stringify(o) });
    if (q.method() === "OPTIONS") return send(204, null);
    if (u.pathname.endsWith("/items/virtual_items/sku/event_coin")) return send(200, { sku: "event_coin", is_free: true, can_be_bought: !xs.bought[sub] });
    if (u.pathname.endsWith("/free/item/event_coin") && q.method() === "POST") { if (xs.bought[sub]) return send(422, { errorCode: 4515, errorMessage: "limit" }); xs.bought[sub] = true; xs.inv[sub] = (xs.inv[sub] || 0) + 1; return send(200, { order_id: 1 }); }
    return r.abort(); });
  await ctx.route(/googlesyndication|cdn\.xsolla/, r => r.abort());
  await ctx.route("https://login.xsolla.com/**", r => r.fulfill({ status: 200, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: r.request().url().includes("/get") ? "[]" : "{}" }));
  if (portal) await ctx.addInitScript(() => { window.RL_PORTAL = { name: "test", loadingDone() {}, gameplay() {}, commercialBreak: async () => {}, rewardedBreak: async () => true }; });
  await ctx.addInitScript(([s, sc]) => { if (!sessionStorage.getItem("s")) { sessionStorage.setItem("rl_scene", sc); for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); sessionStorage.setItem("s", 1); } }, [{ rl_tips: tips, rl_event: "auto", ...storage }, scene]);
  if (setup) await setup(page);
  await page.goto(ORIGIN + file + q);
  if (file === "") await page.waitForFunction(() => window.__t);
  else await page.waitForFunction(() => document.getElementById("event-cards")?.children.length, null, { timeout: 6000 }).catch(() => {});   // 상점: 이벤트 칸을 그릴 때까지 (기간 밖이면 그냥 넘어감)
  await sleep(1200);
  return { ctx, page, errors, dialogs };
}
const db = () => new DatabaseSync(DB);
const hmac = (s) => crypto.createHmac("sha256", "k".repeat(40)).update(s).digest("hex");
const SUB = "event-e2e-user", KEY = hmac("u:" + SUB);
const user = (now = NOV2, equip = {}) => ({ rl_device_id: "evdev-0001", rl_auth: authOf(SUB, "eu@example.com", now), rl_save: save, [`rl_inv:u:${SUB}`]: JSON.stringify({ bag: [], equip: { ...nulls, ...equip }, log: [], stones: 0 }) });
try {
  // ---- 할로윈 기간 (11/2), 게스트: 마을·몬스터 모습, 배너 ----
  let o = await open("", { rl_save: save });
  check("Nov 2 (Korea): Halloween theme is on", await o.page.evaluate(() => window.RLEventsGame.theme()) === "halloween");
  const logoOf = (pg) => pg.evaluate(() => { const i = document.querySelector("h1.logo img"); return i.complete && i.naturalWidth ? new URL(i.src).pathname.replace(/^.*\/img\//, "/img/") : "not loaded"; });
  check("Halloween logo (img/logo-halloween.webp) loaded", await logoOf(o.page) === "/img/logo-halloween.webp", await logoOf(o.page));
  check("monsters wear witch hats (mon_rat → hw_rat); monsters without a hat sprite keep theirs", await o.page.evaluate(() => window.__t.name("mon_rat")) === "hw_rat" && await o.page.evaluate(() => window.__t.name("mon_jeoseung")) === "mon_jeoseung");
  await o.page.waitForFunction(() => !document.getElementById("event-banner").hidden, null, { timeout: 5000 }).catch(() => {});
  const bText = await o.page.locator("#event-banner").innerText().catch(() => "");
  check("lobby banner: 🎃 할로윈 이벤트 (guest: count only)", /🎃 할로윈 이벤트 · 호박 사탕 0개/.test(bText), bText);
  await o.page.locator("#stage").screenshot({ path: path.join(SHOTS, "event-lobby.png") });
  await o.page.evaluate(() => window.__t.enter()); await sleep(600);
  check("banner only in town (hidden in the dungeon)", await o.page.locator("#event-banner").isHidden());
  check("no page errors (guest)", !o.errors.length, o.errors.join(" | "));
  await o.ctx.close();
  o = await open("", { rl_save: save }, { q: "?event=off" });
  check("?event=off: original look and logo", await o.page.evaluate(() => window.RLEventsGame.theme()) === null && await o.page.evaluate(() => window.__t.name("mon_rat")) === "mon_rat" && await logoOf(o.page) === "/img/logo.webp", await logoOf(o.page));
  await o.ctx.close();

  // ---- 기간 전 (10/30): 아무것도 바뀌지 않음 ----
  setDay("2026-10-30");
  o = await open("", { rl_save: save }, { now: OCT30 });
  check("Oct 30: no theme, no banner, original logo", await o.page.evaluate(() => window.RLEventsGame.theme()) === null && await o.page.locator("#event-banner").isHidden() && await logoOf(o.page) === "/img/logo.webp");
  await o.ctx.close();
  o = await open("shop.html", user(OCT30), { now: OCT30 });
  check("Oct 30: no event section in the shop", await o.page.locator("#event-sec").isHidden());
  await o.ctx.close();
  setDay("2026-11-02");

  // ---- 상점: 게스트는 안내 + 로그인 버튼 ----
  o = await open("shop.html", {});
  check("shop (guest): event section with login buttons", await o.page.locator("#event-sec").isVisible() && (await o.page.locator("#event-cards button").first().innerText()) === "로그인하고 받기", await o.page.locator("#event-sec").innerText().catch(() => ""));
  await o.ctx.close();

  // ---- 상점: 로그인 사용자 → 받기, 스킨, 캐시 ----
  o = await open("shop.html#event", user());
  const sec = () => o.page.locator("#event-sec").innerText();
  check("shop (user): 🎃 할로윈 이벤트, period and today's free candy", /🎃 할로윈 이벤트/.test(await sec()) && /오늘의 무료 호박 사탕/.test(await sec()) && /가진 호박 사탕: 0개/.test(await sec()), await sec());
  await o.page.getByRole("button", { name: "무료로 받기" }).click();
  await o.page.waitForFunction(() => /받았어요/.test(document.getElementById("event-msg").textContent), null, { timeout: 5000 }).catch(() => {});
  check("claim → Xsolla free order, server takes it out of the inventory: 1 candy, button now 'Again at 10:00'", /호박 사탕 1개를 받았어요/.test(await o.page.locator("#event-msg").innerText()) && /가진 호박 사탕: 1개/.test(await sec())
    && await o.page.getByRole("button", { name: /오늘은 받았어요 · 오전 10시에 또 받기/ }).isDisabled() && xs.bought[SUB] === true && !xs.inv[SUB], await sec());
  check("server recorded one claim for the account (HMAC key only)", db().prepare("SELECT COUNT(*) n FROM event_claims WHERE pkey = ?").get(KEY).n === 1);
  await o.page.reload(); await sleep(1200);
  check("after reload: Xsolla says bought today → still 'Again at 10:00' (one per day)", await o.page.getByRole("button", { name: /오늘은 받았어요/ }).isDisabled());
  check("skins: not enough yet (1/6)", (await o.page.locator('#event-cards button[data-skin="pumpkin_head"]').innerText()) === "모자라요 (1/6)");
  // 열흘 넘게 모았다고 치면
  db().prepare("UPDATE event_wallet SET balance = 12, earned = 12 WHERE pkey = ?").run(KEY);
  await o.page.reload(); await sleep(1200);
  await o.page.locator('#event-cards button[data-skin="pumpkin_head"]').click();
  await o.page.waitForFunction(() => /얻었어요/.test(document.getElementById("event-msg").textContent), null, { timeout: 5000 }).catch(() => {});
  check("6 candies → Pumpkin Head (owned), 6 left, the scythe can be exchanged too", /호박 머리을\(를\) 얻었어요/.test(await o.page.locator("#event-msg").innerText()) && (await o.page.locator('#event-cards button[data-skin="pumpkin_head"]').innerText()) === "가지고 있어요"
    && (await o.page.locator('#event-cards button[data-skin="reaper_scythe"]').innerText()) === "교환하기" && /가진 호박 사탕: 6개/.test(await sec()), await sec());
  await o.page.locator("#event-sec").screenshot({ path: path.join(SHOTS, "event-shop.png") });
  check("cash exchange: the 6 leftovers", (await o.page.locator("#event-cash-n").inputValue()) === "6" && (await o.page.locator("#event-cash-btn").innerText()) === "캐시 6개로 바꾸기");
  await o.page.locator("#event-cash-btn").click();
  await o.page.waitForFunction(() => /우편함으로 보냈어요/.test(document.getElementById("event-msg").textContent), null, { timeout: 5000 }).catch(() => {});
  const mail = db().prepare("SELECT cash, state FROM mail WHERE owner_key = ? AND kind = 'gift'").all(KEY);
  check("asks first, then 6 Cash goes to the game mailbox; 0 candies left", o.dialogs.some(d => /캐시 6개로 바꿀까요/.test(d)) && mail.length === 1 && mail[0].cash === 6 && mail[0].state === "new"
    && /가진 호박 사탕: 0개/.test(await sec()) && await o.page.locator("#event-cash-btn").isDisabled(), JSON.stringify(mail) + o.dialogs.join("|"));
  // 다음 날: 무료 주문은 됐는데 게임 서버가 못 받은 채 창을 닫았다면 (인벤토리에 1개) → 상점을 열기만 해서는 안 받고, "무료로 받기"를 눌러야 꺼냄 (dc#136)
  setDay("2026-11-03"); xs.bought[SUB] = true; xs.inv[SUB] = 1;
  await sleep(2100);   // PHP가 설정 파일을 다시 읽을 때까지 (opcache 2초)
  // 서버가 바뀐 날을 늦게 읽을 때가 있어서 "무료로 받기"가 보일 때까지 두 번까지 다시 열어 봄
  for (let k = 0; k < 3; k++) { await o.page.reload(); if (await o.page.getByRole("button", { name: "무료로 받기" }).waitFor({ timeout: 4000 }).then(() => true, () => false)) break; await sleep(1500); }
  check("next day: opening the shop does not take anything (still 0, item stays in the inventory, button 'Get for free')", /가진 호박 사탕: 0개/.test(await sec()) && xs.inv[SUB] === 1 && await o.page.getByRole("button", { name: "무료로 받기" }).isEnabled({ timeout: 2000 }).catch(() => false), await sec());
  await o.page.getByRole("button", { name: "무료로 받기" }).click();
  await o.page.waitForFunction(() => /받았어요/.test(document.getElementById("event-msg").textContent), null, { timeout: 5000 }).catch(() => {});
  check("click → the ordered item is taken out: 1 candy (Xsolla limit already used, no second order)", /가진 호박 사탕: 1개/.test(await sec()) && !xs.inv[SUB] && await o.page.getByRole("button", { name: /오늘은 받았어요/ }).isDisabled(), await sec());
  check("no page errors (shop)", !o.errors.length, o.errors.join(" | "));
  await o.ctx.close();

  // ---- 게임: 가진 스킨을 인벤토리 "꾸미기"에서 쓰기 ----
  o = await open("", { ...user(NOV2, { weapon: sword }), rl_3d: "1" });   // 던전은 3D (손에 든 낫 모델)
  await o.page.waitForFunction(() => window.RLEventsGame.status()?.skins?.length, null, { timeout: 8000 }).catch(() => {});
  const bt = await o.page.locator("#event-banner").innerText().catch(() => "");
  check("user banner: already claimed today → shows the count", /🎃 할로윈 이벤트 · 호박 사탕 1개/.test(bt), bt);
  check("game knows the owned skin; not worn until chosen", JSON.stringify(await o.page.evaluate(() => window.RLEventsGame.status().skins)) === '["pumpkin_head"]' && await o.page.evaluate(() => window.RLEventsGame.wear("head")) === null);
  await o.page.keyboard.press("i");
  await o.page.locator("#inv-skins").waitFor({ timeout: 3000 }).catch(() => {});
  const skinBtn = o.page.locator("#inv-skins .skin-btn");
  check("inventory: 꾸미기 row with Pumpkin Head", (await skinBtn.count()) === 1 && /호박 머리 · 쓰기/.test(await skinBtn.innerText()), await o.page.locator("#inv-skins").innerText().catch(() => ""));
  await skinBtn.click();
  check("wear → button on, doll draws the pumpkin head (stats unchanged)", /호박 머리 · 쓰는 중/.test(await o.page.locator("#inv-skins .skin-btn").innerText()) && (await o.page.locator("#inv-skins .skin-btn").getAttribute("aria-pressed")) === "true"
    && await o.page.evaluate(() => window.RLEventsGame.wear("head")) === "pumpkin_head");
  await o.page.keyboard.press("Escape"); await sleep(300);
  check("doll: pumpkin head on top, sword still drawn (no scythe owned)", /skin_pumpkin_head/.test(await o.page.evaluate(() => window.__t.doll())) && /doll_w_longsword/.test(await o.page.evaluate(() => window.__t.doll())), await o.page.evaluate(() => window.__t.doll()));
  // 낫도 얻었다고 치면: 3D 손에 낫 모델
  db().prepare("INSERT INTO event_skins (pkey, skin, event_id, created_at) VALUES (?, 'reaper_scythe', 'halloween-2026', ?)").run(KEY, Date.now());
  await o.page.evaluate(async () => { await window.__t.refresh(); localStorage.setItem("rl_skin_wear", JSON.stringify({ head: "pumpkin_head", weapon: "reaper_scythe" })); });
  check("doll: scythe instead of the sword", /skin_scythe/.test(await o.page.evaluate(() => window.__t.doll())) && !/doll_w_longsword/.test(await o.page.evaluate(() => window.__t.doll())));
  await o.page.evaluate(() => window.__t.enter());
  await o.page.waitForFunction(() => window.RLView3D?.hands?.ready && window.RLView3D.hands.r, null, { timeout: 15000 }).catch(() => {});
  const h = await o.page.evaluate(() => window.RLView3D?.hands);
  check("3D: the right hand holds the scythe model", /^scythe\|longsword$/.test(h?.r || ""), JSON.stringify(h));
  check("no page errors (game)", !o.errors.length, o.errors.join(" | "));
  await o.ctx.close();

  // ---- 첫날 0시~10시 (dc#136): 테마는 켜졌지만 받기의 하루(오전 10시에 바뀜)는 아직 전날 → "오전 10시부터", 저절로 받지 않음 ----
  const morning = async (pg) => pg.route(/[?&]r=event_status/, async r => { const req = r.request();
    const res = await fetch(req.url(), { headers: req.headers() }); const d = await res.json();
    d.day = "2026-10-30"; d.claimed = false; d.balance = 0; d.event = { ...d.event, open: false, today: 0 };
    r.fulfill({ status: res.status, headers: { ...Object.fromEntries(res.headers), "content-type": "application/json" }, body: JSON.stringify(d) }); });
  const claimsBefore = db().prepare("SELECT COUNT(*) n FROM event_claims WHERE pkey = ?").get(KEY).n;
  o = await open("shop.html#event", user(), { setup: morning });
  await o.page.locator("#event-cash-n").waitFor({ timeout: 8000 }).catch(() => {});
  check("first morning (before 10:00): shop says 'from 10:00', not 'ended'; cash box shows 0", (await o.page.locator("#event-cards button").first().innerText()) === "오전 10시부터 받을 수 있어요" && await o.page.locator("#event-cards button").first().isDisabled()
    && (await o.page.locator("#event-cash-n").inputValue()) === "0" && await o.page.locator("#event-cash-btn").isDisabled(), await o.page.locator("#event-sec").innerText().catch(() => ""));
  await o.ctx.close();
  o = await open("", user(), { setup: morning });
  await o.page.waitForFunction(() => /오전 10시부터/.test(document.getElementById("event-banner").textContent), null, { timeout: 5000 }).catch(() => {});
  check("first morning: lobby banner says 'from 10:00', nothing received", (await o.page.locator("#event-banner").innerText()) === "🎃 할로윈 이벤트 · 오전 10시부터 호박 사탕 받기" && db().prepare("SELECT COUNT(*) n FROM event_claims WHERE pkey = ?").get(KEY).n === claimsBefore, await o.page.locator("#event-banner").innerText());
  await o.ctx.close();

  // ---- 포털 빌드: 서버·상점이 없어서 배너 없음 (모습은 바뀜) ----
  o = await open("", { rl_save: save }, { portal: true });
  check("portal build: Halloween look and logo, no event banner", await o.page.evaluate(() => window.RLEventsGame.theme()) === "halloween" && await o.page.locator("#event-banner").isHidden() && await logoOf(o.page) === "/img/logo-halloween.webp");
  await o.ctx.close();
} finally { await browser.close(); php.kill(); mock.close(); }
const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
