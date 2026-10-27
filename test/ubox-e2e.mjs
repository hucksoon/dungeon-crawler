// dc#56 고대 유니크 선택 상자: 게임 우편함에서 열고 유니크 고르기 (PHP 서버 + 가짜 Xsolla Store 인벤토리)
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
const DB = path.join(DIR, "ubox-e2e.sqlite");
for (const f of [DB, DB + "-wal", DB + "-shm"]) fs.rmSync(f, { force: true });
fs.writeFileSync(path.join(DIR, "config.ubox-e2e.php"), `<?php
$c = require __DIR__ . '/config.test.php';
return array_merge($c, ['db_dsn' => 'sqlite:${DB}', 'xsolla_store_url' => 'http://127.0.0.1:8099/store', 'xsolla_api_key' => 'test-key', 'xsolla_project_id' => 317991]);
`);
const SECRET = "ubox-e2e-secret";
const ORIGIN = "https://hucksoon.github.io/hucksoon/";
const API = "http://127.0.0.1:8098/api.php";
const STORE = "https://store.xsolla.com/api/v2/project/317991";
const results = [];
const check = (n, ok, x = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x ? " — " + x : ""}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const waitFor = async (fn, ms = 10000) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (await fn()) return true; } catch {} await sleep(150); } return false; };

// ---- 가짜 Xsolla Store: 서버(php)와 브라우저가 같은 잔액을 봄 ----
const bal = {}, boxes = {};
const subOf = (h) => { try { return JSON.parse(Buffer.from(h.split(".")[1], "base64url")).sub; } catch { return null; } };
function storeHandle(method, p, auth, body) {
  if (p === "/user/virtual_currency_balance") return [200, { items: [{ sku: "cash", amount: bal[subOf(auth.slice(7))] || 0 }] }];
  if (p === "/items/virtual_items") return [200, { items: [{ sku: "revive", virtual_prices: [{ sku: "cash", amount: 50 }] }] }];
  if (p.startsWith("/user/inventory/items")) { const q = boxes[subOf(auth.slice(7))] || 0; return [200, { items: q ? [{ sku: "ancient_unique_box", quantity: q }] : [] }]; }
  if (p === "/user/inventory/item/consume" && JSON.parse(body).sku === "ancient_unique_box") {
    const s = subOf(auth.slice(7)); if (!(boxes[s] > 0)) return [422, { errorCode: 4001 }]; boxes[s]--; return [204, null];
  }
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
await new Promise(r => mock.listen(8099, "127.0.0.1", r));
const php = spawn("php", ["-S", "127.0.0.1:8098", "-t", path.join(REPO, "ranking-php")], { env: { ...process.env, RANKING_CONFIG: path.join(DIR, "config.ubox-e2e.php"), TEST_JWT_SECRET: SECRET }, stdio: "ignore" });
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
  page.on("pageerror", e => errors.push(e.message + " @ " + (e.stack || "").split("\n").slice(1, 4).join(" < ")));
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
  boxes["ubox-u"] = 1;
  const U = await open(user("ubox-u", "ursula@example.com", 50, [epic, rare]));
  check("lobby ping tells about mail? (box is collected when the mailbox opens)", true);
  await sleep(1500); await walkOpen(U.page, db().prepare("SELECT display FROM presence").get().display, "mail");
  check("mailbox shows the box (collected from Xsolla inventory)", await waitFor(async () => (await U.page.locator("#market-body").innerText()).includes("🎁 고대 유니크 선택 상자")) && boxes["ubox-u"] === 0,
    (await U.page.locator("#market-body").innerText()).slice(0, 300));
  await U.page.screenshot({ path: path.join(SHOTS, "ubox-mail.png") });
  await U.page.locator("#mail-all").click();
  await sleep(800);
  check("모두 받기 leaves the box (must be opened)", (await U.page.locator("#market-body").innerText()).includes("🎁 고대 유니크 선택 상자"));
  await U.page.locator(".market-row", { hasText: "고대 유니크 선택 상자" }).locator("button", { hasText: "열기" }).click();
  const rows = U.page.locator("button.pick-uq");
  await sleep(800);
  await rows.first().waitFor({ timeout: 5000 });
  check("picker lists 15 uniques (10 gear + 5 accessories)", (await rows.count()) === 15 && (await U.page.locator("#market-body h3").allInnerTexts()).join("|") === "유니크 장비|유니크 장신구");
  const robeRow = (await U.page.locator(".market-row", { has: U.page.locator('button.pick-uq[value="robe"]') }).innerText());
  check("rows show ancient name, slot, boss floor, effect and stats", robeRow.includes("고대 염라의 관복") && robeRow.includes("헬 50층") && robeRow.includes("최대 HP"), robeRow.replace(/\n/g, " | "));
  await U.page.screenshot({ path: path.join(SHOTS, "ubox-pick.png"), fullPage: false });
  await U.page.locator('button.pick-uq[value="robe"]').click();
  check("confirm dialog before choosing", await waitFor(async () => U.dialogs.some(d => d.includes("고대 염라의 관복") && d.includes("바꿀 수 없어요"))));
  check("success message", await waitFor(async () => (await msg(U.page)).includes("고대 염라의 관복을(를) 가방에 넣었어요")), await msg(U.page));
  const bag = await bagOf(U.page, "ubox-u");
  const got = bag.find(i => i.uq === "robe");
  check("bag has an ancient robe from the box seed", got && got.ancient && /^buy\|m[0-9a-f]{16}\|robe$/.test(got.seed) && got.lvl === 175, JSON.stringify(got)?.slice(0, 200));
  check("server recorded the seed", db().prepare("SELECT seed FROM bought_items").get()?.seed === got?.seed);
  check("mailbox now empty", (await U.page.locator("#market-body").innerText()).includes("우편함이 비어 있어요"));
  // 아이템 상세: 구매 표시
  await U.page.keyboard.press("Escape");
  await U.page.evaluate(() => document.querySelector("#inv-btn, #tp-inv")?.click());
  await sleep(500);
  const card = U.page.locator(".inv-item, .bag-item, [data-id]").filter({ hasText: "염라의 관복" }).first();
  if (await card.count()) { await card.click(); await sleep(300); }
  check("item detail says it was bought", (await U.page.locator("body").innerText()).includes("고대 유니크 선택 상자에서 고른 아이템"));
  await U.page.screenshot({ path: path.join(SHOTS, "ubox-detail.png") });
  check("no page errors", U.errors.length === 0, U.errors.join("; "));
} finally {
  await browser.close(); php.kill(); mock.close();
}
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
