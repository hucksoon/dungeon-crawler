// 광고 보상 브라우저 테스트: 하루 입장 5회 → 광고 입장, 광고 부활, 광고로 수수료 면제, 부활 가격 10캐시
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import http from "node:http"; import crypto from "node:crypto"; import fs from "node:fs"; import path from "node:path";
const require = createRequire(process.env.NODE_PATH + "/");
const { chromium, devices } = require("playwright");
const REPO = process.argv[2], SHOTS = process.argv[3];
const DIR = path.dirname(new URL(import.meta.url).pathname) + "/php";
const RL = createRequire(import.meta.url)(path.join(REPO, "items.js"));
const DB = path.join(DIR, "ads-e2e.sqlite"); for (const f of [DB, DB + "-wal", DB + "-shm"]) fs.rmSync(f, { force: true });
fs.writeFileSync(path.join(DIR, "config.ads-e2e.php"), `<?php\n$c = require __DIR__ . '/config.test.php';\nreturn array_merge($c, ['db_dsn' => 'sqlite:${DB}', 'xsolla_store_url' => 'http://127.0.0.1:8103/store', 'xsolla_api_key' => 'test-key', 'ad_min_seconds' => 1]);\n`);
const SECRET = "ads-e2e-secret";
const ORIGIN = "https://hucksoon.github.io/hucksoon/", API = "http://127.0.0.1:8102/api.php", STORE = "https://store.xsolla.com/api/v2/project/317991";
const results = []; const check = (n, ok, x = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x ? " — " + x : ""}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const waitFor = async (fn, ms = 8000) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (await fn()) return true; } catch {} await sleep(120); } return false; };
const bal = {}; const consumed = [];
const subOf = (h) => { try { return JSON.parse(Buffer.from(h.split(".")[1], "base64url")).sub; } catch { return null; } };
function storeHandle(method, p, auth, body) {
  if (p === "/user/virtual_currency_balance") return [200, { items: [{ sku: "cash", amount: bal[subOf(auth.slice(7))] || 0 }] }];
  if (p === "/items/virtual_items") return [200, { items: [{ sku: "revive", virtual_prices: [{ sku: "cash", amount: 10 }] }] }];
  if (p === "/user/inventory/items") return [200, { items: [] }];
  if (p === "/user/inventory/item/consume") { const s = subOf(auth.slice(7)), q = JSON.parse(body).quantity; consumed.push(q); if ((bal[s] || 0) < q) return [422, {}]; bal[s] -= q; return [204, null]; }
  return [404, { errorMessage: "unmocked " + p }];
}
const mock = http.createServer((req, res) => { let b = ""; req.on("data", c => b += c); req.on("end", () => {
  const [s, o] = storeHandle(req.method, req.url.replace("/store/v2/project/317991", ""), req.headers.authorization || "", b);
  res.writeHead(s, { "Content-Type": "application/json" }); res.end(o == null ? "" : JSON.stringify(o)); }); });
await new Promise(r => mock.listen(8103, "127.0.0.1", r));
const php = spawn("php", ["-S", "127.0.0.1:8102", "-t", path.join(REPO, "ranking-php")], { env: { ...process.env, RANKING_CONFIG: path.join(DIR, "config.ads-e2e.php"), TEST_JWT_SECRET: SECRET }, stdio: "ignore" });
await sleep(700);
const b64u = (s) => Buffer.from(s).toString("base64url");
const jwt = (sub, email) => { const h = b64u(JSON.stringify({ alg: "HS256" })), p = b64u(JSON.stringify({ sub, email, exp: Math.floor(Date.now() / 1000) + 7200, xsolla_login_project_id: "30375188-893b-4b1a-ba1b-c8ba692fa5e3" })); return `${h}.${p}.${crypto.createHmac("sha256", SECRET).update(`${h}.${p}`).digest("base64url")}`; };
const HOOK = `
  window.__t = { s: () => ({ scene, depth, gameOver, revived: !!player.revived, gold: player.gold, lx: lobbyPos.x, ly: lobbyPos.y }), die: () => { player.hp = 0; death(); render(); } };
  // ---- 시작 ----`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
async function open(storage, opts = { viewport: { width: 1280, height: 950 } }) {
  const ctx = await browser.newContext(opts); const page = await ctx.newPage(); const errors = [], dialogs = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("dialog", d => { dialogs.push(d.message()); d.accept(); });
  await ctx.route(ORIGIN + "**", r => { const f = new URL(r.request().url()).pathname.replace("/hucksoon/", "") || "index.html";
    if (f === "ranking-config.js") return r.fulfill({ contentType: "text/javascript", body: `window.RANKING_API = ${JSON.stringify(API)};` });
    const p = path.join(REPO, f); if (!fs.existsSync(p)) return r.fulfill({ status: 404, body: "" });
    let body = fs.readFileSync(p, "utf8"); if (f === "index.html") body = body.replace("  // ---- 시작 ----", HOOK);
    r.fulfill({ contentType: f.endsWith(".js") ? "text/javascript" : "text/html", body }); });
  await ctx.route(API + "**", async r => { const req = r.request();
    const res = await fetch(req.url(), { method: req.method(), headers: req.headers(), body: ["GET", "OPTIONS"].includes(req.method()) ? undefined : req.postData() });
    r.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: Buffer.from(await res.arrayBuffer()) }); });
  await ctx.route(STORE + "/**", r => { const req = r.request();
    const [s, o] = storeHandle(req.method(), new URL(req.url()).pathname.replace("/api/v2/project/317991", ""), req.headers().authorization || "", req.postData() || "");
    r.fulfill({ status: s, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: o == null ? "" : JSON.stringify(o) }); });
  await ctx.route("https://login.xsolla.com/**", r => r.fulfill({ status: 200, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: r.request().url().includes("/get") ? "[]" : "{}" }));
  await ctx.addInitScript(s => { if (!sessionStorage.getItem("s")) { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); sessionStorage.setItem("s", 1); } }, storage);
  await page.goto(ORIGIN); return { ctx, page, errors, dialogs };
}
const st = (page) => page.evaluate(() => window.__t.s());
const logText = (page) => page.locator("#log").innerText();
const info = (page) => page.locator("#entry-info").innerText();
const press = async (page, k, n) => { for (let i = 0; i < n; i++) { await page.keyboard.press(k); await sleep(15); } };
// 마을 문까지 걸어가 ↑ (예전 칸 x: 5 = 거래소, 15 = 1층 문)
import { goDoor } from "./town.mjs";
const walkTo = (page, tx) => goDoor(page, { 5: "market", 15: "start" }[tx]);
const user = (sub, email, gold, extra = {}) => ({ rl_device_id: sub + "-dev", rl_auth: JSON.stringify({ access: jwt(sub, email), refresh: "r", exp: Date.now() + 7200_000 }),
  rl_save: JSON.stringify({ v: 1, f50: 1, best: 4, run: { d: 4, hp: 300, mh: 300, a: 50, g: gold, p: 2, l: 5, x: 0, xn: 1e9, rid: "ads-" + sub, k: 0, pp: 0 } }), ...extra });
async function call(route, token, body) {
  const r = await fetch(`${API}?r=${route}`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, Origin: "https://hucksoon.github.io" }, body: JSON.stringify(body) });
  return r.json();
}
try {
  // ---- 게스트: 1층 문 하루 5회 무료 → 광고 ----
  const G = await open({ rl_device_id: "adsguest-e2e-0001" });
  check("lobby shows today's free entries 5/5", await waitFor(async () => (await info(G.page)).includes("오늘 1층 무료 입장 5/5회 남음")), await info(G.page).catch(() => ""));
  for (let i = 1; i <= 5; i++) {
    await walkTo(G.page, 15);
    await waitFor(async () => (await st(G.page)).scene === "dungeon");
    if (i === 1) check("1st entry is free, log shows 4/5 left", (await logText(G.page)).includes("오늘 1층 무료 입장 4/5회 남음"));
    await G.page.keyboard.press("p");
  }
  check("after 5 entries: 0/5 + ad hint", await waitFor(async () => (await info(G.page)).includes("0/5회 남음") && (await info(G.page)).includes("광고를 보면")), await info(G.page));
  // 6번째: 광고를 끝까지 봄
  await walkTo(G.page, 15);
  check("6th entry asks to watch an ad", await waitFor(async () => G.dialogs.some(d => d.includes("광고를 보고 입장할까요?"))));
  check("ad modal opens with countdown", await waitFor(() => G.page.locator("#ad-modal").isVisible()) && (await G.page.locator("#ad-count").innerText()).includes("초 남음") && await G.page.locator("#ad-claim").isDisabled());
  await G.page.screenshot({ path: path.join(SHOTS, "ad-entry.png") });
  check("game keys ignored while the ad shows", await (async () => { await G.page.keyboard.press("p"); return (await st(G.page)).scene === "lobby"; })());
  await waitFor(async () => !(await G.page.locator("#ad-claim").isDisabled()), 4000);
  await G.page.locator("#ad-claim").click();
  check("after the ad → entered floor 1", await waitFor(async () => (await st(G.page)).scene === "dungeon" && (await logText(G.page)).includes("광고를 보고 던전에 입장했다")));
  await G.page.keyboard.press("p");
  // 7번째: 광고를 닫으면 못 들어감
  G.dialogs.length = 0;
  await walkTo(G.page, 15);
  await waitFor(() => G.page.locator("#ad-modal").isVisible());
  await G.page.locator("#ad-close").click();
  check("closing the ad early → stay in the lobby", await waitFor(async () => (await logText(G.page)).includes("광고를 끝까지 보지 않아서")) && (await st(G.page)).scene === "lobby");

  // ---- 게스트: 광고로 부활 ----
  await sleep(300);
  await walkTo(G.page, 15);
  await waitFor(() => G.page.locator("#ad-modal").isVisible());
  await waitFor(async () => !(await G.page.locator("#ad-claim").isDisabled()), 4000);
  await G.page.locator("#ad-claim").click();
  await waitFor(async () => (await st(G.page)).scene === "dungeon");
  await G.page.evaluate(() => window.__t.die());
  const adRevive = G.page.locator("#revive-ad-btn");
  check("death screen offers revive by ad (guest, once a day)", await waitFor(() => adRevive.isVisible()) && (await adRevive.innerText()) === "광고 보고 부활 (오늘 1회 남음)");
  check("guest: cash revive needs an account (10 cash)", (await G.page.locator("#death-revive").innerText()).includes("캐시 10개로도 부활"));
  await G.page.screenshot({ path: path.join(SHOTS, "ad-revive.png") });
  await adRevive.click();
  await waitFor(() => G.page.locator("#ad-modal").isVisible());
  await waitFor(async () => !(await G.page.locator("#ad-claim").isDisabled()), 4000);
  await G.page.locator("#ad-claim").click();
  check("revived by ad", await waitFor(async () => { const s = await st(G.page); return !s.gameOver && s.revived; }) && (await logText(G.page)).includes("광고를 보고 부활했다"));
  await G.page.evaluate(() => window.__t.die());
  check("second death: already revived this run", await waitFor(async () => (await G.page.locator("#death-revive").innerText()).includes("이미 부활했어요")));
  check("guest: no page errors", G.errors.length === 0, G.errors.join("; "));
  await G.ctx.close();

  // ---- 거래소: 캐시 0인 사람이 광고로 수수료 면제하고 골드 아이템 사기 ----
  const A = jwt("ads-seller", "seller@example.com");
  let it; for (let n = 0; !it; n++) { const x = RL.generate(`adm${n}|shop|d4|s${n % 6}`, "golden", 4); if (x.rarity === "rare") it = x; }
  const l = await call("market_list", A, { item: { seed: it.seed, src: it.src, lvl: it.lvl, v: it.v, enh: 0, id: it.id, ...(it.r ? { r: it.r } : {}) }, gold: 40, cash: 0, stage: 4 });
  check("seller listed a gold-only item", !!l.listing, JSON.stringify(l).slice(0, 200));
  bal["ads-buyer"] = 0;
  const B = await open(user("ads-buyer", "buyer@example.com", 100));
  await sleep(1300);
  await walkTo(B.page, 5);
  await B.page.locator("#market-modal").waitFor();
  const card = B.page.locator(".shop-card", { hasText: RL.itemName(it) });
  await card.waitFor();
  check("buy note shows fee ads left 3/3", (await B.page.locator("#market-body").innerText()).includes("광고를 보면 수수료가 면제돼요 (오늘 3/3회 남음)"));
  check("0 cash: normal buy disabled (needs ◆1 fee)", await card.locator("button.primary").isDisabled() && (await card.locator("button.primary").innerText()).includes("캐시 부족"));
  const adBtn = card.locator("button.ad-buy");
  check("ad buy button: 수수료 면제 · 캐시 0 + 40 골드", (await adBtn.innerText()) === "광고 보고 수수료 면제 · 캐시 0 + 40 골드" && !(await adBtn.isDisabled()));
  await B.page.screenshot({ path: path.join(SHOTS, "ad-market.png") });
  await adBtn.click();
  check("ad modal over the market", await waitFor(() => B.page.locator("#ad-modal").isVisible()));
  await waitFor(async () => !(await B.page.locator("#ad-claim").isDisabled()), 4000);
  await B.page.locator("#ad-claim").click();
  check("bought with no cash: item in bag, gold -40, no Xsolla charge", await waitFor(async () => (await B.page.locator("#market-msg").innerText()).includes("가방에 넣었어요")) && (await st(B.page)).gold === 60 && consumed.length === 0, await B.page.locator("#market-msg").innerText());
  check("log says fee waived by ad", (await logText(B.page)).includes("광고로 수수료 면제"));
  await B.page.locator('#market-tabs [data-tab="mine"]').click();
  check("history: 광고로 수수료 면제", await waitFor(async () => (await B.page.locator("#market-body").innerText()).includes("(광고로 수수료 면제)")));
  await B.page.locator('#market-tabs [data-tab="buy"]').click();
  check("fee ads left 2/3 after one", await waitFor(async () => (await B.page.locator("#market-body").innerText()).includes("(오늘 2/3회 남음)")));
  await B.page.keyboard.press("Escape");
  // 로그인 사용자 쓰러짐: 캐시 10개 부활 + 광고 부활
  bal["ads-buyer"] = 20;
  await walkTo(B.page, 15);
  await waitFor(async () => (await st(B.page)).scene === "dungeon");
  await B.page.evaluate(() => window.__t.die());
  check("logged-in death: cash revive costs 10 + ad revive offered", await waitFor(async () => (await B.page.locator("#revive-btn").innerText()) === "캐시 10개로 부활") && await B.page.locator("#revive-ad-btn").isVisible());
  check("buyer: no page errors", B.errors.length === 0, B.errors.join("; "));
  await B.ctx.close();

  // ---- 서버가 없을 때: 입장 제한 없음, 광고 버튼 없음 ----
  {
    const ctx = await browser.newContext(); const page = await ctx.newPage(); const errors = [];
    page.on("pageerror", e => errors.push(e.message)); page.on("dialog", d => d.accept());
    await ctx.route(ORIGIN + "**", r => { const f = new URL(r.request().url()).pathname.replace("/hucksoon/", "") || "index.html";
      if (f === "ranking-config.js") return r.fulfill({ contentType: "text/javascript", body: `window.RANKING_API = "";` });
      let body = fs.readFileSync(path.join(REPO, f), "utf8"); if (f === "index.html") body = body.replace("  // ---- 시작 ----", HOOK);
      r.fulfill({ contentType: f.endsWith(".js") ? "text/javascript" : "text/html", body }); });
    await page.goto(ORIGIN);
    await walkTo(page, 15);
    check("no server: entry not limited, no info line", await waitFor(async () => (await st(page)).scene === "dungeon") && await page.locator("#entry-info").isHidden() && errors.length === 0, errors.join("; "));
    await ctx.close();
  }
  // ---- 휴대폰: 광고 창 ----
  const P = await open({ rl_device_id: "adsphone-0001" }, { ...devices["iPhone 13"] });
  check("phone: entry info visible", await waitFor(async () => (await info(P.page)).includes("5/5")));
  await P.page.evaluate(() => {});
  check("phone: no horizontal overflow in lobby", await P.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await P.ctx.close();
} finally {
  await browser.close(); php.kill(); mock.close();
}
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
