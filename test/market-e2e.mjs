// 거래소 브라우저 테스트: 게임(로그인 2명 + 게스트) + PHP 서버 + 가짜 Xsolla Store
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { goDoor } from "./town.mjs";   // 마을(옆에서 보는 로비) 문까지 걸어가 ↑
const require = createRequire(process.env.NODE_PATH + "/");
const { chromium, devices } = require("playwright");
const REPO = process.argv[2], SHOTS = process.argv[3];
const DIR = path.dirname(new URL(import.meta.url).pathname) + "/php";
const RL = createRequire(import.meta.url)(path.join(REPO, "items.js"));
const DB = path.join(DIR, "market-e2e.sqlite");
for (const f of [DB, DB + "-wal", DB + "-shm"]) fs.rmSync(f, { force: true });
fs.writeFileSync(path.join(DIR, "config.market-e2e.php"), `<?php
$c = require __DIR__ . '/config.test.php';
return array_merge($c, ['db_dsn' => 'sqlite:${DB}', 'xsolla_store_url' => 'http://127.0.0.1:8097/store', 'xsolla_api_key' => 'test-key', 'xsolla_project_id' => 317991]);
`);
const SECRET = "market-e2e-secret";
const ORIGIN = "https://hucksoon.github.io/hucksoon/";
const API = "http://127.0.0.1:8096/api.php";
const STORE = "https://store.xsolla.com/api/v2/project/317991";
const results = [];
const check = (n, ok, x = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x ? " — " + x : ""}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const waitFor = async (fn, ms = 10000) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (await fn()) return true; } catch {} await sleep(150); } return false; };

// ---- 가짜 Xsolla Store: 서버(php)와 브라우저가 같은 잔액을 봄 ----
const bal = {};
const subOf = (h) => { try { return JSON.parse(Buffer.from(h.split(".")[1], "base64url")).sub; } catch { return null; } };
function storeHandle(method, p, auth, body) {
  if (p === "/user/virtual_currency_balance") return [200, { items: [{ sku: "cash", amount: bal[subOf(auth.slice(7))] || 0 }] }];
  if (p === "/items/virtual_items") return [200, { items: [{ sku: "revive", virtual_prices: [{ sku: "cash", amount: 50 }] }] }];
  if (p === "/user/inventory/item/consume") {
    const s = subOf(auth.slice(7)), b = JSON.parse(body);
    if ((bal[s] || 0) < b.quantity) return [422, { errorCode: 4001, errorMessage: "not enough" }];
    bal[s] -= b.quantity; return [204, null];
  }
  if (p === "/inventory/reward") {
    if (auth !== "Basic " + Buffer.from("317991:test-key").toString("base64")) return [401, { errorCode: 1501 }];
    for (const op of JSON.parse(body)) for (const it of op.items) bal[op.user.id] = (bal[op.user.id] || 0) + it.quantity;
    return [200, {}];
  }
  return [404, { errorCode: 9, errorMessage: "unmocked " + p }];
}
const mock = http.createServer((req, res) => { let b = ""; req.on("data", c => b += c); req.on("end", () => {
  const [s, o] = storeHandle(req.method, req.url.replace("/store/v2/project/317991", ""), req.headers.authorization || "", b);
  res.writeHead(s, { "Content-Type": "application/json" }); res.end(o == null ? "" : JSON.stringify(o)); }); });
await new Promise(r => mock.listen(8097, "127.0.0.1", r));
const php = spawn("php", ["-S", "127.0.0.1:8096", "-t", path.join(REPO, "ranking-php")], { env: { ...process.env, RANKING_CONFIG: path.join(DIR, "config.market-e2e.php"), TEST_JWT_SECRET: SECRET }, stdio: "ignore" });
await sleep(700);

const b64u = (s) => Buffer.from(s).toString("base64url");
const jwt = (sub, email) => { const h = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" })), p = b64u(JSON.stringify({ sub, email, exp: Math.floor(Date.now() / 1000) + 7200, xsolla_login_project_id: "30375188-893b-4b1a-ba1b-c8ba692fa5e3" })); return `${h}.${p}.${crypto.createHmac("sha256", SECRET).update(`${h}.${p}`).digest("base64url")}`; };
const authOf = (sub, email) => JSON.stringify({ access: jwt(sub, email), refresh: "r", exp: Date.now() + 7200_000 });
const save = (gold, best = 5) => JSON.stringify({ v: 1, f50: 1, season: 4, best, run: { d: best, hp: 300, mh: 300, a: 50, g: gold, p: 2, l: 5, x: 0, xn: 1e9, rid: "mk-" + gold, k: 0, pp: 0 } });
const inv = (bag) => JSON.stringify({ bag, equip: Object.fromEntries(RL.SLOTS.map(s => [s, null])), log: [] });
const find = (pred, tag) => { for (let n = 0; n < 200000; n++) { const it = RL.generate(`${tag}${n}|shop|d5|s${n % 6}`, "golden", 5); if (pred(it)) return it; } };
const epic = { ...find(x => x.rarity === "epic", "ea"), enh: 2, tries: 3 };
const legend = find(x => x.rarity === "legendary", "lg");
const rare = find(x => x.rarity === "rare", "ra");

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
async function open(storage, opts = { viewport: { width: 1280, height: 1000 } }) {
  const ctx = await browser.newContext(opts); const page = await ctx.newPage(); const errors = [], dialogs = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("dialog", d => { dialogs.push(d.message()); d.accept(); });
  await ctx.route(ORIGIN + "**", r => { const f = new URL(r.request().url()).pathname.replace("/hucksoon/", "") || "index.html";
    if (f === "ranking-config.js") return r.fulfill({ contentType: "text/javascript", body: `window.RANKING_API = ${JSON.stringify(API)};` });
    const p = path.join(REPO, f); if (!fs.existsSync(p)) return r.fulfill({ status: 404, body: "" });
    r.fulfill({ contentType: f.endsWith(".js") ? "text/javascript" : "text/html", body: fs.readFileSync(p) }); });
  await ctx.route(API + "**", async r => {
    const req = r.request();
    const res = await fetch(req.url(), { method: req.method(), headers: req.headers(), body: ["GET", "OPTIONS"].includes(req.method()) ? undefined : req.postData() });
    r.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: Buffer.from(await res.arrayBuffer()) });
  });
  await ctx.route(STORE + "/**", r => { const req = r.request();
    const [s, o] = storeHandle(req.method(), new URL(req.url()).pathname.replace("/api/v2/project/317991", ""), req.headers().authorization || "", req.postData() || "");
    r.fulfill({ status: s, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: o == null ? "" : JSON.stringify(o) }); });
  await ctx.route("https://login.xsolla.com/**", r => r.fulfill({ status: 200, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: r.request().url().includes("/get") ? "[]" : "{}" }));
  await ctx.addInitScript(s => { if (!sessionStorage.getItem("s")) { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); sessionStorage.setItem("s", 1); } }, storage);
  await page.goto(ORIGIN); return { ctx, page, errors, dialogs };
}
const user = (sub, email, gold, bag) => ({ rl_device_id: sub + "-dev", rl_auth: authOf(sub, email), rl_save: save(gold), [`rl_inv:u:${sub}`]: inv(bag) });
const bagOf = (page, sub) => page.evaluate(k => JSON.parse(localStorage.getItem(k)).bag, `rl_inv:u:${sub}`);
const msg = (page) => page.locator("#market-msg").innerText();
const db = () => new DatabaseSync(DB);
// 마을에서 걸어가서 열기: 거래소 문 / 우편함
async function walkOpen(page, display, target) {
  if (await page.locator("#market-modal").isVisible()) { await page.keyboard.press("Escape"); }
  await goDoor(page, target === "mail" ? "mailbox" : "market");
  await page.locator("#market-modal").waitFor({ timeout: 3000 });
}

try {
  bal["seller-a"] = 0; bal["buyer-b"] = 10; bal["full-c"] = 20;
  // ---- A: 판매 등록 ----
  const A = await open(user("seller-a", "alice@example.com", 50, [epic, legend, rare]));
  await A.page.waitForTimeout(800);
  check("no 거래소/우편함 buttons (map only)", (await A.page.locator("#market-btn, #mail-btn, #tp-market, #tp-mail").count()) === 0);
  await A.page.keyboard.press("t");
  check("T no longer opens the market", await A.page.locator("#market-modal").isHidden());
  await walkOpen(A.page, "a***@example.com", "market");
  check("walking into the 거래소 door opens the market", await A.page.locator("#market-modal").isVisible() && (await A.page.locator("#market-title").innerText()) === "거래소");
  await A.page.locator('#market-tabs [data-tab="sell"]').click();
  await A.page.locator(".bag-item", { hasText: RL.itemName(epic) }).click();
  await A.page.fill("#sell-gold", "120"); await A.page.fill("#sell-cash", "3");
  await A.page.keyboard.press("ArrowLeft");  // 입력 중 방향키로 캐릭터가 움직이지 않아야 함
  await A.page.locator("#sell-submit").click();
  check("A lists the epic (+2) for 120 gold + 3 cash", await waitFor(async () => (await msg(A.page)).includes("올렸어요")), await msg(A.page));
  check("listing removes it from A's bag", !(await bagOf(A.page, "seller-a")).some(x => x.id === epic.id));
  check("confirm dialog shows price", A.dialogs.some(d => d.includes("◆ 3 + 120 골드")));
  // 레전더리를 캐시 0으로
  await A.page.locator(".bag-item", { hasText: RL.itemName(legend) }).click();
  check("legendary: cash field starts at 1", (await A.page.inputValue("#sell-cash")) === "1");
  await A.page.fill("#sell-gold", "300"); await A.page.fill("#sell-cash", "0");
  await A.page.locator("#sell-submit").click();
  check("legendary with 0 cash is refused", (await msg(A.page)).includes("캐시를 1개 이상"));
  await A.page.fill("#sell-cash", "5");
  await A.page.locator("#sell-submit").click();
  await waitFor(async () => (await msg(A.page)).includes("올렸어요"));
  await A.page.locator('#market-tabs [data-tab="mine"]').click();
  check("내 거래: 2 active listings with time left", await waitFor(async () => { const t = await A.page.locator("#market-body").innerText(); return t.includes("올린 아이템 (2/10)") && t.includes("23시간"); }));
  await A.page.screenshot({ path: path.join(SHOTS, "market-mine.png") });
  await A.page.keyboard.press("Escape");
  check("Esc closes market", await A.page.locator("#market-modal").isHidden());

  // ---- B: 구매 ----
  const B = await open(user("buyer-b", "bob@example.com", 500, []));
  await B.page.waitForTimeout(800);
  await walkOpen(B.page, "b***@example.com", "market");
  const card = B.page.locator(".shop-card", { hasText: RL.itemName(epic) });
  check("B sees A's listing with seller, price and fee", await waitFor(async () => { const t = await card.innerText(); return t.includes("판매자 a***@example.com") && t.includes("◆ 3 + 120 골드") && t.includes("수수료 ◆1") && t.includes("구매 · ◆4 + 120 골드"); }), await card.innerText().catch(() => ""));
  check("B's wallet shows gold and cash", (await B.page.locator("#market-wallet").innerText()).includes("이번 판 골드 500") && (await B.page.locator("#market-wallet").innerText()).includes("◆ 10"));
  const legCard = B.page.locator(".shop-card", { hasText: RL.itemName(legend) });
  check("stat lines shown on the card", (await card.locator(".stat-line").count()) > 0);
  await B.page.screenshot({ path: path.join(SHOTS, "market-buy.png") });
  await card.locator("button.primary").click();
  check("B buys: item goes into the bag", await waitFor(async () => (await msg(B.page)).includes("가방에 넣었어요")), await msg(B.page));
  check("confirm dialog shows fee", B.dialogs.some(d => d.includes("캐시 ◆3 + 수수료 ◆1 = ◆4")));
  const bBag = await bagOf(B.page, "buyer-b");
  check("B's bag has the same item with +2 and tries", bBag.length === 1 && bBag[0].id === epic.id && bBag[0].enh === 2 && bBag[0].tries === 3);
  check("B paid 120 gold (HUD) and 4 cash (Xsolla)", (await B.page.locator("#gold").innerText()) === "380" && bal["buyer-b"] === 6);
  check("listing disappears from the market", await waitFor(async () => (await B.page.locator(".shop-card", { hasText: RL.itemName(epic) }).count()) === 0));
  // B는 캐시 6: 레전더리(5+1=6) 살 수 있음 → 버튼 활성. 잔액이 모자란 경우는 비활성
  bal["buyer-b"] = 2;
  await B.page.locator(".market-filters button").click();
  check("not enough cash → button disabled", await waitFor(async () => (await legCard.locator("button.primary").innerText()).includes("캐시 부족") && await legCard.locator("button.primary").isDisabled()));
  await B.page.keyboard.press("Escape");

  // ---- A: 우편함 ----
  check("A is told about new mail (lobby ping)", await waitFor(async () => (await A.page.locator("#log").innerText()).includes("우편함에 새 우편이 왔다. (로비 거래소 옆 우편함)"), 6000));
  await walkOpen(A.page, "a***@example.com", "mail");
  check("walking into the small mailbox opens the mail tab titled 우편함", (await A.page.locator("#market-title").innerText()) === "우편함" && (await A.page.locator('#market-tabs [data-tab="mail"]').innerText()) === "우편함 (1)");
  await A.page.locator(".market-row", { hasText: "판매 대금" }).waitFor();
  check("mail row: proceeds and buyer", (await A.page.locator("#market-body").innerText()).includes("b***@example.com에게 판매"));
  await A.page.screenshot({ path: path.join(SHOTS, "market-mail.png") });
  await A.page.locator(".market-row", { hasText: "판매 대금" }).locator("button").click();
  check("A claims: +120 gold in game, +3 cash from Xsolla", await waitFor(async () => (await A.page.locator("#gold").innerText()) === "170" && bal["seller-a"] === 3), `${await A.page.locator("#gold").innerText()} ${bal["seller-a"]}`);
  check("mailbox now empty, badge cleared", (await A.page.locator("#market-body").innerText()).includes("우편함이 비어 있어요") && (await A.page.locator('#market-tabs [data-tab="mail"]').innerText()) === "우편함");
  await A.page.locator('#market-tabs [data-tab="mine"]').click();
  check("history: sold to bob", await waitFor(async () => (await A.page.locator("#market-body").innerText()).includes("판매 완료 · ◆ 3 + 120 골드 · 구매자 b***@example.com")));

  // 내리기 → 우편함 → 받기
  await A.page.locator(".market-row", { hasText: RL.itemName(legend) }).locator("button").click();
  check("cancel → back to mailbox", await waitFor(async () => (await msg(A.page)).includes("내렸어요")));
  await A.page.locator('#market-tabs [data-tab="mail"]').click();
  await A.page.locator("#mail-all").waitFor();
  await A.page.locator("#mail-all").click();
  check("모두 받기 → legendary back in the bag", await waitFor(async () => (await bagOf(A.page, "seller-a")).some(x => x.id === legend.id)));

  // 24시간 지난 아이템
  await A.page.locator('#market-tabs [data-tab="sell"]').click();
  await A.page.locator(".bag-item", { hasText: RL.itemName(rare) }).click();
  await A.page.fill("#sell-gold", "40"); await A.page.fill("#sell-cash", "0");
  await A.page.locator("#sell-submit").click();
  await waitFor(async () => (await msg(A.page)).includes("올렸어요"));
  db().prepare("UPDATE listings SET expires_at = ? WHERE item_id = ?").run(Date.now() - 1000, rare.id);
  await A.page.locator('#market-tabs [data-tab="mail"]').click();
  check("after 24h the item is in the mailbox", await waitFor(async () => (await A.page.locator("#market-body").innerText()).includes("24시간이 지나 돌아온 아이템")));
  // 운영자 선물: 서버 명령으로 넣고 로비 우편함에서 받기
  {
    const { spawnSync } = await import("node:child_process");
    const r = spawnSync("php", [path.join(REPO, "ranking-php/gift.php"), "alice@example.com", "99999", "99999", "테스터 지급"], { env: { ...process.env, RANKING_CONFIG: path.join(DIR, "config.market-e2e.php"), TEST_JWT_SECRET: SECRET }, encoding: "utf8" });
    check("gift.php puts a gift in A's mailbox", r.status === 0, r.stdout + r.stderr);
    const gold0 = Number(await A.page.locator("#gold").innerText()), cash0 = bal["seller-a"];
    await A.page.locator('#market-tabs [data-tab="mine"]').click();
    await A.page.locator('#market-tabs [data-tab="mail"]').click();
    const row = A.page.locator(".market-row", { hasText: "운영자 선물" });
    check("gift row: 운영자 선물 · 테스터 지급 · ◆ 99999 + 99,999 골드", await waitFor(async () => (await row.innerText()).includes("◆ 99999 + 99,999 골드") && (await row.innerText()).includes("테스터 지급")));
    await A.page.screenshot({ path: path.join(SHOTS, "gift-mail.png") });
    await row.locator("button").click();
    check("claim gift → +99999 gold in game, +99999 cash", await waitFor(async () => Number(await A.page.locator("#gold").innerText()) === gold0 + 99999 && bal["seller-a"] === cash0 + 99999), `${await A.page.locator("#gold").innerText()} ${bal["seller-a"]}`);
  }
  check("A: no page errors", A.errors.length === 0, A.errors.join("; "));

  // ---- 가방이 가득 찬 C ----
  const full = []; for (let n = 0; full.length < 48; n++) { const it = RL.generate(`fill${n}|d1|k${n}`, "drop", 1); full.push(it); }
  // A가 다시 레전더리를 올림 (캐시 5)
  await A.page.locator('#market-tabs [data-tab="sell"]').click();
  await A.page.locator(".bag-item", { hasText: RL.itemName(legend) }).click();
  await A.page.fill("#sell-gold", "0"); await A.page.fill("#sell-cash", "5");
  await A.page.locator("#sell-submit").click();
  await waitFor(async () => (await msg(A.page)).includes("올렸어요"));
  const C = await open(user("full-c", "carol@example.com", 0, full));
  await C.page.waitForTimeout(600);
  await walkOpen(C.page, "c***@example.com", "market");
  const lc = C.page.locator(".shop-card", { hasText: RL.itemName(legend) });
  await lc.waitFor();
  await lc.locator("button.primary").click();
  check("full bag: bought item waits in the mailbox", await waitFor(async () => (await msg(C.page)).includes("우편함에 있어요")), await msg(C.page));
  check("C paid 5 + 1 cash", bal["full-c"] === 14);
  await C.page.locator('#market-tabs [data-tab="mail"]').click();
  await C.page.locator(".market-row", { hasText: "산 아이템" }).locator("button").click();
  check("claim with a full bag → clear message, mail kept", await waitFor(async () => (await msg(C.page)).includes("가방이 가득 찼어요")) && (await C.page.locator(".market-row", { hasText: "산 아이템" }).count()) === 1);
  // 하나 팔고 다시 받기
  await C.page.evaluate(() => { const k = Object.keys(localStorage).find(k => k.startsWith("rl_inv:u:")); const d = JSON.parse(localStorage.getItem(k)); d.bag.pop(); localStorage.setItem(k, JSON.stringify(d)); });
  await C.page.reload();
  await C.page.waitForTimeout(600);
  await walkOpen(C.page, "c***@example.com", "mail");
  await C.page.locator(".market-row", { hasText: "산 아이템" }).locator("button").click();
  check("after making room, claim works", await waitFor(async () => (await bagOf(C.page, "full-c")).some(x => x.id === legend.id)));
  check("C: no page errors", C.errors.length === 0, C.errors.join("; "));

  // ---- 서버 기록 ----
  const rows = db().prepare("SELECT * FROM listings ORDER BY created_at").all();
  check("server stored every listing with seller/buyer/price/fee", rows.length === 4 && rows.filter(r => r.state === "sold").length === 2 && rows.every(r => r.fee_cash === 1 && r.seller_display === "a***@example.com") && rows.find(r => r.item_id === epic.id).buyer_display === "b***@example.com", JSON.stringify(rows.map(r => [r.state, r.buyer_display])));

  // ---- 게스트 ----
  const D = await open({ rl_device_id: "guest-d-0000" });
  await walkOpen(D.page, "게스트 #guest-", "market");
  check("guest sees listings but must connect to buy", await waitFor(async () => (await D.page.locator("#market-body").innerText()).includes("사려면 계정을 연결해야 해요")) || (await D.page.locator("#market-body").innerText()).includes("올라온 아이템이 없어요"));
  await D.page.locator('#market-tabs [data-tab="sell"]').click();
  check("guest sell tab: connect account", (await D.page.locator("#market-body").innerText()).includes("계정을 연결해야 해요"));
  check("guest: no page errors", D.errors.length === 0, D.errors.join("; "));
  await D.ctx.close();

  // ---- 로비에서 걸어서 거래소 문으로 ----
  await A.page.keyboard.press("Escape");
  await goDoor(A.page, "market");
  check("walking into the 거래소 door opens the market", await A.page.locator("#market-modal").isVisible());
  // 오른쪽 건물은 나이트메어 입구: 일반 던전을 완료하지 않았으면 안내만
  {
    await A.page.keyboard.press("Escape");
    await goDoor(A.page, "nightmare");
    check("right building = nightmare entrance, refused before a 50 clear", await A.page.locator("#market-modal").isHidden() && (await A.page.locator("#log").innerText()).includes("50층을 완료해야 들어갈 수 있다"));
  }
  await A.page.keyboard.press("Escape");
  await A.page.screenshot({ path: path.join(SHOTS, "market-lobby.png") });

  // ---- 휴대폰 ----
  const P = await open(user("phone-p", "pat@example.com", 100, [rare]), { ...devices["iPhone 13"] });
  await P.page.waitForTimeout(600);
  check("phone lobby: only 인벤토리/도감 buttons", await P.page.locator("#tp-inv").isVisible() && await P.page.locator("#tp-dex").isVisible() && (await P.page.locator("#tp-market, #tp-mail").count()) === 0 && !(await P.page.locator("#tp-potion").isVisible()));
  await walkOpen(P.page, "p***@example.com", "market");
  await waitFor(async () => (await P.page.locator("#market-body").innerText()).includes("올라온 아이템이 없어요") || (await P.page.locator(".shop-card").count()) > 0);
  check("phone: market fits without horizontal scroll", await P.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.querySelector(".modal.market").getBoundingClientRect().right <= innerWidth));
  await P.page.screenshot({ path: path.join(SHOTS, "market-phone.png") });
  check("phone: no page errors", P.errors.length === 0, P.errors.join("; "));
  check("B: no page errors", B.errors.length === 0, B.errors.join("; "));
} finally {
  await browser.close(); php.kill(); mock.close();
}
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
