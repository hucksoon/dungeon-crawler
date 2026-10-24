// 상점 장비 상자 (웹훅 2단계): 캐시로 상자를 사면 상점은 브라우저에서 열지 않고, 게임 서버가 Xsolla 웹훅(order_paid)으로 열어
// 우편함에 넣은 결과를 받아서 보여줌. 웹훅이 늦으면 "곧 우편함에 도착" 안내, 남은 상자는 브라우저에서 열지 않음
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import crypto from "node:crypto"; import fs from "node:fs"; import path from "node:path";
const require = createRequire(process.env.NODE_PATH + "/");
const { chromium } = require("playwright");
const REPO = process.argv[2], SHOTS = process.argv[3];
const I = createRequire(import.meta.url)(path.join(REPO, "items.js"));
const ORIGIN = "https://game.apacimtest.com/", API = "https://api.test/api.php", STORE = "https://store.xsolla.com/api/v2/project/317991";
const DIR = path.dirname(new URL(import.meta.url).pathname) + "/php";
const DB = path.join(DIR, "shopbox.sqlite"); for (const f of [DB, DB + "-wal", DB + "-shm"]) fs.rmSync(f, { force: true });
const CFG = path.join(DIR, "config.shopbox.php"), HOOK_SECRET = "shopbox-hook", JWT_SECRET = "shopbox-jwt";   // 가짜 키
fs.writeFileSync(CFG, `<?php\n$c = require __DIR__ . '/config.test.php';\nreturn array_merge($c, ['db_dsn' => 'sqlite:${DB}', 'allowed_origins' => 'https://game.apacimtest.com', 'webhook_secret' => '${HOOK_SECRET}']);\n`);
const results = []; const check = (n, ok, x = "") => { results.push(!!ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x && !ok ? " — " + x : ""}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const waitFor = async (fn, ms = 10000) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (await fn()) return true; } catch {} await sleep(150); } return false; };
const php = spawn("php", ["-S", "127.0.0.1:8134", "-t", path.join(REPO, "ranking-php")], { env: { ...process.env, PHP_CLI_SERVER_WORKERS: "4", RANKING_CONFIG: CFG, TEST_JWT_SECRET: JWT_SECRET }, stdio: ["ignore", "ignore", "pipe"] });
let phpErr = ""; php.stderr.on("data", d => phpErr += d);
await sleep(700);
const sql = (q, ...a) => { for (let i = 0; ; i++) { const d = new DatabaseSync(DB); try { return d.prepare(q).all(...a); } catch (e) { if (/no such table/.test(e.message)) return []; if (!/locked|busy/.test(e.message) || i >= 50) throw e; } finally { d.close(); } Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50); } };

const b64u = (s) => Buffer.from(s).toString("base64url");
const jwt = (sub) => { const h = b64u(JSON.stringify({ alg: "HS256" })), p = b64u(JSON.stringify({ sub, email: "buyer@example.com", exp: Math.floor(Date.now() / 1000) + 7200, xsolla_login_project_id: "30375188-893b-4b1a-ba1b-c8ba692fa5e3" })); return `${h}.${p}.${crypto.createHmac("sha256", JWT_SECRET).update(`${h}.${p}`).digest("base64url")}`; };
const BUYER = "e5f6a7b8-0000-4000-8000-0000000000ee";
const apiCall = (route, method = "GET", body) => fetch(`http://127.0.0.1:8134/api.php?r=${route}`, { method, headers: { Authorization: `Bearer ${jwt(BUYER)}`, "Content-Type": "application/json", Origin: ORIGIN.slice(0, -1) }, body: body && JSON.stringify(body) }).then(r => r.json());
// 게임에 로그인해서 저장한 적 있는 사용자 (최고 층 30)
await apiCall("profile", "POST", { rev: 0, data: { v: 1, save: { v: 1, best: 30, run: null, dead: null }, inv: { bag: [], equip: {}, stones: 0 }, dex: { seen: {}, kills: {} }, boxMail: [] } });
// Xsolla가 보내는 웹훅 흉내 (나뉜 방식, 캐시로 산 상자)
const sendHook = async (orderId, sku) => {
  const raw = JSON.stringify({ notification_type: "order_paid", items: [{ sku, type: "virtual_good", quantity: 1 }], order: { id: orderId, mode: "default", currency_type: "virtual", currency: "cash", amount: "10" }, user: { external_id: BUYER, email: "buyer@example.com" } });
  return fetch("http://127.0.0.1:8134/webhook.php", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Signature ${crypto.createHash("sha1").update(raw + HOOK_SECRET).digest("hex")}` }, body: raw }).then(r => r.status);
};

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const state = { order: 7700000, hookDelay: 1500, sendHooks: true, consumed: [], purchases: [], inventory: [], boxOrderCalls: 0 };
async function open() {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 }, locale: "ko-KR" });
  const page = await ctx.newPage(); const errors = [];
  page.on("pageerror", e => errors.push(e.message)); page.on("dialog", d => d.accept());
  await ctx.route(ORIGIN + "**", r => { const f = new URL(r.request().url()).pathname.slice(1) || "index.html";
    if (f === "ranking-config.js") return r.fulfill({ contentType: "text/javascript", body: `window.RANKING_API = "${API}";` });
    const p = path.join(REPO, f); if (!fs.existsSync(p)) return r.fulfill({ status: 404, body: "" });
    r.fulfill({ contentType: f.endsWith(".js") ? "text/javascript" : f.endsWith(".css") ? "text/css" : "text/html", body: fs.readFileSync(p) }); });
  await ctx.route("https://api.test/**", async r => { const req = r.request(), u = new URL(req.url());
    if (u.searchParams.get("r") === "box_order") state.boxOrderCalls++;
    if (req.method() === "OPTIONS") return r.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "Authorization, Content-Type" } });
    const res = await fetch(`http://127.0.0.1:8134/api.php${u.search}`, { method: req.method(), headers: { ...req.headers(), origin: ORIGIN.slice(0, -1) }, body: req.method() === "GET" ? undefined : req.postData() });
    r.fulfill({ status: res.status, headers: { "content-type": "application/json", "access-control-allow-origin": "*" }, body: await res.text() }); });
  const json = (r, o, status = 200) => r.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(o) });
  await ctx.route(STORE + "/**", async r => { const req = r.request(), p = new URL(req.url()).pathname.replace("/api/v2/project/317991", "");
    if (req.method() === "OPTIONS") return r.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "Authorization, Content-Type" } });
    if (p === "/items/virtual_currency/package") return json(r, { items: [] });
    if (p === "/items/virtual_items") return json(r, { items: [{ sku: "box_equipment_10", name: "장비 상자 10회", description: "장비 10개", groups: [{ external_id: "equipment_boxes" }], virtual_prices: [{ sku: "cash", amount: 10 }] }] });
    if (p === "/user/virtual_currency_balance") return json(r, { items: [{ sku: "cash", amount: 500 }] });
    if (p === "/user/inventory/items") return json(r, { items: state.inventory });
    if (p === "/user/inventory/item/consume") { state.consumed.push(JSON.parse(req.postData()).sku); return r.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } }); }
    const m = /^\/payment\/item\/([^/]+)\/virtual\/cash$/.exec(p);
    if (m) {
      const orderId = ++state.order; state.purchases.push(orderId);
      // Xsolla는 결제 뒤 잠시 있다가 웹훅을 보냄
      if (state.sendHooks) setTimeout(() => sendHook(orderId, decodeURIComponent(m[1])).then(s => state.lastHook = s), state.hookDelay);
      return json(r, { order_id: orderId });
    }
    return json(r, { errorCode: 0, errorMessage: "not mocked " + p }, 404); });
  await ctx.route("https://login.xsolla.com/**", r => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await ctx.addInitScript(([auth]) => { if (sessionStorage.getItem("seeded")) return; sessionStorage.setItem("seeded", 1); localStorage.setItem("rl_auth", auth); localStorage.setItem("rl_lang", "ko"); localStorage.setItem("rl_save", JSON.stringify({ v: 1, best: 30 })); },
    [JSON.stringify({ access: jwt(BUYER), refresh: "r", exp: Date.now() + 7200_000 })]);
  await page.goto(ORIGIN + "shop.html");
  return { ctx, page, errors };
}
const localMail = (page) => page.evaluate((o) => JSON.parse(localStorage.getItem(`rl_mail:u:${o}`) || "[]").length, BUYER);
const pending = (page) => page.evaluate((o) => JSON.parse(localStorage.getItem(`rl_box_pending:u:${o}`) || "[]").length, BUYER);

try {
  let { ctx, page, errors } = await open();
  const btn = page.locator('#boxes .card[data-sku="box_equipment_10"] button.primary');
  await btn.waitFor();
  check("box card shows cash price", (await btn.innerText()).includes("◆ 10"), await btn.innerText());
  await btn.click();
  check("shows the box items the server opened (10) with the mailbox message", await waitFor(async () => (await page.locator("#box-msg").innerText()).includes("장비 10개를 얻었어요! 게임 우편함") && (await page.locator("#box-items > div").count()) === 10, 15000), await page.locator("#box-msg").innerText());
  const order = state.purchases[0];
  const want = Array.from({ length: 10 }, (_, i) => I.generate(`box|o${order}|${i}`, "box", 30)).map(it => I.itemName(it)).sort();
  const shown = (await page.locator("#box-items > div > span").allInnerTexts()).sort();
  check("shown items = server-made items (seed box|o<order>|i, best floor 30)", JSON.stringify(shown) === JSON.stringify(want), JSON.stringify(shown.slice(0, 3)));
  check("webhook accepted (204) and 10 box mails for the buyer", state.lastHook === 204 && sql("SELECT COUNT(*) n FROM mail WHERE kind = 'box' AND state = 'new'")[0].n === 10);
  check("shop waited for the webhook (polled box_order more than once)", state.boxOrderCalls >= 2, String(state.boxOrderCalls));
  check("not opened in the browser: no local box mail (rl_mail)", await localMail(page) === 0);
  check("bought box consumed from Xsolla inventory, nothing left pending", await waitFor(async () => state.consumed.length === 1 && await pending(page) === 0));
  await page.screenshot({ path: path.join(SHOTS, "shopbox-server.png") });
  await page.locator("#box-close").click();

  // 웹훅이 오지 않음 (늦어짐) → 결제는 됐고 곧 우편함으로 온다는 안내
  state.sendHooks = false;
  await btn.click();
  check("webhook late → 'arrives in your mailbox soon' after waiting", await waitFor(async () => (await page.locator("#box-msg").innerText()).includes("곧 게임 우편함"), 30000), await page.locator("#box-msg").innerText());
  check("still nothing opened in the browser", await localMail(page) === 0 && (await page.locator("#box-items > div").count()) === 0);
  const late = state.purchases[1];
  check("late webhook arrives later → items go to the mailbox", await sendHook(late, "box_equipment_10") === 204 && sql("SELECT COUNT(*) n FROM box_items WHERE order_id = ?", String(late))[0].n === 10);
  check("no page errors (shop)", errors.length === 0, errors.join("; "));
  await ctx.close();

  // 다음에 상점을 열 때: 인벤토리에 남은 상자(예: 다른 기기에서 산 것)는 서버가 이미 우편함에 넣었으므로 브라우저에서 열지 않음
  state.inventory = [{ sku: "box_equipment_10", quantity: 1, instance_id: null }];
  const consumedBefore = state.consumed.length;
  ({ ctx, page, errors } = await open());
  await page.locator('#boxes .card button.primary').waitFor();
  await sleep(1500);
  check("leftover box in inventory is not opened in the browser", await localMail(page) === 0 && await page.locator("#box-modal").isHidden() && state.consumed.length === consumedBefore);
  check("no page errors (reopen)", errors.length === 0, errors.join("; "));
  await ctx.close();
} finally { await browser.close(); php.kill(); }
check("no php errors", !/Fatal|Warning|Deprecated/.test(phpErr), phpErr.slice(0, 400));
console.log(`${results.filter(Boolean).length}/${results.length} passed`);
