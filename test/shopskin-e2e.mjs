// 상점 스킬 스킨 (dc#172): 장비 상자·고대 유니크 선택 상자는 팔지 않고, 캐시 50개로 스킬 스킨(푸른 번개 · 번개 오라)을 팜
//   카탈로그의 skill_skins 그룹 → 카드(움직이는 미리보기 · 이름 · 설명 · ◆ 50 구매) → 캐시로 구매 → "보유 중"
//   이미 가진 스킨(Xsolla 인벤토리)은 처음부터 "보유 중", 캐시가 모자라면 버튼이 막힘, 로그인 안 했으면 "로그인하고 구매"
// (예전 shopbox-e2e를 대신함. 예전에 산 상자를 서버가 웹훅으로 여는 것은 webhook-api-test가 그대로 확인)
import { createRequire } from "node:module";
import crypto from "node:crypto"; import fs from "node:fs"; import path from "node:path";
const require = createRequire(process.env.NODE_PATH + "/");
const { chromium } = require("playwright");
const REPO = process.argv[2], SHOTS = process.argv[3];
const K = createRequire(import.meta.url)(path.join(REPO, "skins.js"));
const ORIGIN = "https://game.apacimtest.com/", STORE = "https://store.xsolla.com/api/v2/project/317991";
const results = []; const check = (n, ok, x = "") => { results.push(!!ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x && !ok ? " — " + x : ""}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const waitFor = async (fn, ms = 8000) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (await fn()) return true; } catch {} await sleep(120); } return false; };
const b64u = (s) => Buffer.from(s).toString("base64url");
const jwt = (sub) => { const h = b64u(JSON.stringify({ alg: "HS256" })), p = b64u(JSON.stringify({ sub, email: "buyer@example.com", exp: Math.floor(Date.now() / 1000) + 7200 })); return `${h}.${p}.${crypto.createHmac("sha256", "x").update(`${h}.${p}`).digest("base64url")}`; };
const BUYER = "e5f6a7b8-0000-4000-8000-0000000000ef";

// ---- 규칙 ----
check(`2 skill skins at ${K.PRICE} cash (blue lightning · lightning aura), different slots`, K.PRICE === 50 && K.IDS.join() === "skin_bolt_blue,skin_bolt_aura" && K.SKINS.skin_bolt_blue.slot === "bolt" && K.SKINS.skin_bolt_aura.slot === "aura");
check("names and descriptions in ko/en/ja", K.IDS.every(id => ["ko", "en", "ja"].every(l => K.name(id, l) && K.desc(id, l) && K.desc(id, l).length > 20)));
check("blue lightning is blue (not the yellow #ffe14d)", /^#4/.test(K.SKINS.skin_bolt_blue.color) && K.SKINS.skin_bolt_blue.color !== "#ffe14d");

const CATALOG = [
  ...K.IDS.map(sku => ({ sku, name: K.name(sku), description: K.desc(sku), groups: [{ external_id: "skill_skins" }], virtual_prices: [{ sku: "cash", amount: 50 }] })),
  { sku: "revive", name: "부활권", groups: [{ external_id: "game_items" }], virtual_prices: [{ sku: "cash", amount: 5 }] },
];
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const state = { balance: 120, inventory: [], purchases: [] };
async function open(login = true) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 }, locale: "ko-KR" });
  const page = await ctx.newPage(); const errors = [];
  page.on("pageerror", e => errors.push(e.message)); page.on("dialog", d => d.accept());
  await ctx.route(ORIGIN + "**", r => { const f = new URL(r.request().url()).pathname.slice(1) || "index.html";
    if (f === "ranking-config.js") return r.fulfill({ contentType: "text/javascript", body: `window.RANKING_API = "";` });
    const p = path.join(REPO, f); if (!fs.existsSync(p)) return r.fulfill({ status: 404, body: "" });
    r.fulfill({ contentType: f.endsWith(".js") ? "text/javascript" : f.endsWith(".css") ? "text/css" : f.endsWith(".png") ? "image/png" : "text/html", body: fs.readFileSync(p) }); });
  const json = (r, o, status = 200) => r.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(o) });
  await ctx.route(STORE + "/**", async r => { const req = r.request(), p = new URL(req.url()).pathname.replace("/api/v2/project/317991", "");
    if (req.method() === "OPTIONS") return r.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "Authorization, Content-Type" } });
    if (p === "/items/virtual_currency/package") return json(r, { items: [{ sku: "cash_50", name: "캐시 50개", groups: [{ external_id: "cash_packs" }], price: { amount: "5", currency: "USD" }, content: [{ sku: "cash", quantity: 50 }] }] });
    if (p === "/items/virtual_items") return json(r, { items: CATALOG });
    if (p === "/user/virtual_currency_balance") return json(r, { items: [{ sku: "cash", amount: state.balance }] });
    if (p === "/user/inventory/items") return json(r, { items: state.inventory });
    const m = /^\/payment\/item\/([^/]+)\/virtual\/cash$/.exec(p);
    if (m) {
      const sku = decodeURIComponent(m[1]);
      if (state.inventory.some(i => i.sku === sku)) return json(r, { errorCode: 1, errorMessage: "Item purchase limit exceeded", statusCode: 422 }, 422);
      if (state.balance < 50) return json(r, { errorCode: 5006, errorMessage: "Not enough virtual currency" }, 422);
      state.balance -= 50; state.purchases.push(sku); state.inventory.push({ sku, quantity: 1, type: "virtual_good" });
      return json(r, { order_id: 9100 + state.purchases.length });
    }
    return json(r, { errorCode: 0, errorMessage: "not mocked " + p }, 404); });
  await ctx.route("https://login.xsolla.com/**", r => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await ctx.addInitScript(([auth]) => { if (sessionStorage.getItem("seeded")) return; sessionStorage.setItem("seeded", 1); localStorage.setItem("rl_lang", "ko"); if (auth) localStorage.setItem("rl_auth", auth); },
    [login ? JSON.stringify({ access: jwt(BUYER), refresh: "r", exp: Date.now() + 7200_000 }) : null]);
  await page.goto(ORIGIN + "shop.html");
  return { ctx, page, errors };
}
const card = (page, sku) => page.locator(`#skins .card[data-sku="${sku}"]`);

try {
  // 로그인 안 함: 상품은 보이고 "로그인하고 구매"
  let { ctx, page, errors } = await open(false);
  await card(page, "skin_bolt_blue").waitFor();
  check("logged out: both skins shown with 'log in to buy'", (await page.locator("#skins .card").count()) === 2 && /로그인하고 구매/.test(await card(page, "skin_bolt_aura").locator("button").innerText()));
  check("no equipment boxes, no ancient unique box, no odds table", (await page.locator("#boxes, #offers, #odds, #rates, #box-modal").count()) === 0 && !/장비 상자|고대 유니크/.test(await page.locator("main").innerText()));
  check("revive (game item) is not sold in the shop page", (await page.locator('[data-sku="revive"]').count()) === 0);
  await ctx.close();

  // 로그인: ◆ 50 구매 → 사면 보유 중
  ({ ctx, page, errors } = await open());
  const buy = card(page, "skin_bolt_blue").locator("button.primary");
  await waitFor(async () => /◆ 50 구매/.test(await buy.innerText()));
  check("card: moving preview, name, description, ◆ 50 buy button", /◆ 50 구매/.test(await buy.innerText()) && (await card(page, "skin_bolt_blue").locator("canvas").count()) === 1
    && /푸른 번개/.test(await card(page, "skin_bolt_blue").innerText()) && /노란색 대신 푸른색/.test(await card(page, "skin_bolt_blue").innerText()));
  // 미리보기가 정말 그려지는지 (가운데 줄에 파란 픽셀)
  let blue = 0;
  for (let i = 0; i < 6; i++) { blue = Math.max(blue, await page.evaluate(() => { const cv = document.querySelector('canvas[data-skin="skin_bolt_blue"]'), d = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 2] > 180 && d[i] < 140) n++; return n; })); await sleep(150); }
  check(`blue lightning preview draws blue pixels (${blue})`, blue > 50);
  await page.locator("#skins-sec").screenshot({ path: path.join(SHOTS, "shopskin-cards.png") });
  await buy.click();
  check("buying uses 50 cash and the card turns 'owned'", await waitFor(async () => /보유 중/.test(await buy.innerText()) && await buy.isDisabled()) && state.purchases.join() === "skin_bolt_blue" && state.balance === 70);
  check("bought message tells where to wear it", /푸른 번개을\(를\) 샀어요!.*꾸미기/.test(await page.locator("#skin-msg").innerText()), await page.locator("#skin-msg").innerText());
  check("balance shows 70 after buying", (await page.locator("#balance-value").innerText()).trim() === "70");
  // 남은 캐시 70 → 번개 오라도 살 수 있음, 산 뒤 20 → 둘 다 보유
  await card(page, "skin_bolt_aura").locator("button.primary").click();
  check("buy the aura too → both owned, 20 cash left", await waitFor(async () => (await page.locator("#skins .card.owned").count()) === 2) && state.balance === 20);
  check("no page errors (buy)", errors.length === 0, errors.join("; "));
  await ctx.close();

  // 다시 열기: 인벤토리에 있으면 처음부터 보유 중. 캐시가 모자라면 막힘
  state.inventory = [{ sku: "skin_bolt_aura", quantity: 1 }]; state.balance = 30;
  ({ ctx, page, errors } = await open());
  await waitFor(async () => (await page.locator("#skins .card.owned").count()) === 1);
  const b2 = card(page, "skin_bolt_blue").locator("button.primary");
  await waitFor(async () => /캐시 부족/.test(await b2.innerText()));
  check("owned skin from the inventory shows 'owned'", /보유 중/.test(await card(page, "skin_bolt_aura").locator("button").innerText()));
  check("not enough cash (30 < 50) → button disabled with 'not enough'", /캐시 부족 \(◆ 50\)/.test(await b2.innerText()) && await b2.isDisabled(), await b2.innerText());
  check("no page errors (reopen)", errors.length === 0, errors.join("; "));
  await ctx.close();

  // 영어
  ({ ctx, page, errors } = await open());
  await page.selectOption("#lang", "en"); await sleep(400);
  check("English: section title and skin text", /Skill skins/.test(await page.locator("#skins-sec h2").innerText()) && /turn blue/.test(await card(page, "skin_bolt_blue").innerText()));
  await ctx.close();
} finally { await browser.close(); }
console.log(`${results.filter(Boolean).length}/${results.length} passed`);
