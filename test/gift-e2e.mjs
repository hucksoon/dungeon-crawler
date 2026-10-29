// 무료 선물 (dc#105) 브라우저 테스트: 오른쪽 위 반짝이는 배너 → 광고 → 세트 3개 → 하나 골라 가방으로, 3시간 동안 배너 없음
//   원본 사이트(서버 bonus.php)와 포털 빌드(서버 없이 이 기기에서, 포털 보상 광고), 영어 화면
//   진짜 구글 보상형 광고 (dc#118): 구글 광고 스크립트 대신 가짜 스크립트(H5_STUB)로 끝까지 봄·중간에 닫음·광고 없음(안내 화면으로 대신)
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
const require = createRequire(process.env.NODE_PATH + "/");
const { chromium } = require("playwright");
const REPO = process.argv[2], SHOTS = process.argv[3];
const DIR = path.dirname(new URL(import.meta.url).pathname) + "/php";
const I = createRequire(import.meta.url)(path.join(REPO, "items.js"));
const DB = path.join(DIR, "gift-e2e.sqlite"); for (const f of [DB, DB + "-wal", DB + "-shm"]) fs.rmSync(f, { force: true });
fs.writeFileSync(path.join(DIR, "config.gift-e2e.php"), `<?php\n$c = require __DIR__ . '/config.test.php';\nreturn array_merge($c, ['db_dsn' => 'sqlite:${DB}', 'xsolla_store_url' => 'http://127.0.0.1:8121/store', 'xsolla_api_key' => 'test-key', 'ad_min_seconds' => 1]);\n`);
const ORIGIN = "https://hucksoon.github.io/hucksoon/", API = "http://127.0.0.1:8120/api.php";
const results = []; const check = (n, ok, x = "") => { results.push(!!ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x && !ok ? " — " + x : ""}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const waitFor = async (fn, ms = 8000) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (await fn()) return true; } catch {} await sleep(120); } return false; };
const mock = http.createServer((q, res) => { res.writeHead(404); res.end(); });
await new Promise(r => mock.listen(8121, "127.0.0.1", r));
const php = spawn("php", ["-S", "127.0.0.1:8120", "-t", path.join(REPO, "ranking-php")], { env: { ...process.env, RANKING_CONFIG: path.join(DIR, "config.gift-e2e.php"), TEST_JWT_SECRET: "gift-e2e" }, stdio: "ignore" });
await sleep(700);
const HOOK = `
  window.__t = { s: () => ({ scene, bag: Inv.bag().map(i => ({ id: i.id, rarity: i.rarity, seed: i.seed })), x: player.x, y: player.y, ad: Ads.isOpen() }) };
  // ---- 시작 ----`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
// 가짜 구글 광고 스크립트 (adsbygoogle.js 대신): window.__h5mode = viewed(끝까지 봄) · dismissed(중간에 닫음) · notReady(광고 없음)
//   silent(아무 답도 안 함: PC 광고 차단 확장 프로그램이 스크립트를 빈 껍데기로 바꾼 경우, dc#119) · noShow(보여 달라고 해도 광고가 안 뜸)
//   slow(2.5초 뒤에 광고가 뜸, dc#121: 그동안 기다림 창)
//   광고가 떠 있는 동안 게임이 광고 중인지(Ads.isOpen) window.__h5during에 남김
const H5_STUB = `(function () {
  function run(o) {
    if (!o || o.type !== "reward") return;
    var mode = window.__h5mode || "viewed"; window.__h5calls = (window.__h5calls || 0) + 1;
    if (mode === "silent") return;
    if (mode === "notReady") { setTimeout(function () { o.adBreakDone({ breakStatus: "notReady" }); }, 50); return; }
    if (mode === "noShow") { o.beforeReward(function () {}); return; }
    setTimeout(function () { o.beforeReward(function () {
      if (o.beforeAd) o.beforeAd();
      setTimeout(function () { window.__h5during = window.__t.s().ad; }, 100);
      setTimeout(function () {
        if (mode !== "dismissed") { if (o.adViewed) o.adViewed(); } else if (o.adDismissed) o.adDismissed();
        if (o.afterAd) o.afterAd();
        o.adBreakDone({ breakStatus: mode === "dismissed" ? "dismissed" : "viewed" });
      }, 400);
    }); }, mode === "slow" ? 2500 : 0);
  }
  var q = window.adsbygoogle || []; window.adsbygoogle = { push: run }; for (var i = 0; i < q.length; i++) run(q[i]);
})();`;
// portal: 포털 빌드처럼 (서버 없음, 보상 광고는 reward 결과). h5: 가짜 구글 광고 모드 (없으면 구글 스크립트를 막아 안내 화면으로 대신)
async function open(storage, { portal = null, scene = "lobby", lang = "", h5 = null } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 950 } }); const page = await ctx.newPage(); const errors = [], dialogs = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("dialog", d => { dialogs.push(d.message()); d.accept(); });
  await ctx.route(ORIGIN + "**", r => { const f = new URL(r.request().url()).pathname.replace("/hucksoon/", "") || "index.html";
    if (f === "ranking-config.js") return r.fulfill({ contentType: "text/javascript", body: `window.RANKING_API = ${JSON.stringify(portal ? "" : API)};` });
    const p = path.join(REPO, f); if (!fs.existsSync(p)) return r.fulfill({ status: 404, body: "" });
    let body = fs.readFileSync(p); if (f === "index.html") body = body.toString().replace("  // ---- 시작 ----", HOOK);
    r.fulfill({ contentType: { ".js": "text/javascript", ".png": "image/png", ".webp": "image/webp" }[path.extname(f)] || "text/html", body }); });
  await ctx.route(API + "**", async r => { const req = r.request();
    const res = await fetch(req.url(), { method: req.method(), headers: req.headers(), body: ["GET", "OPTIONS"].includes(req.method()) ? undefined : req.postData() });
    r.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: Buffer.from(await res.arrayBuffer()) }); });
  await ctx.route(/googlesyndication|login\.xsolla|store\.xsolla/, r => r.abort());
  if (h5) {
    await ctx.route(/googlesyndication\.com\/pagead\/js\/adsbygoogle\.js/, r => { r.fulfill({ contentType: "text/javascript", body: H5_STUB }); });
    await ctx.addInitScript((m) => { window.__h5mode = m; }, h5);
  }
  if (portal) await ctx.addInitScript((reward) => { window.__ads = 0; window.RL_PORTAL = { name: "test", loadingDone() {}, gameplay() {}, commercialBreak: async () => {}, rewardedBreak: async () => { window.__ads++; return window.__reward ?? reward; } }; }, portal.reward);
  await ctx.addInitScript(([s, sc]) => { if (!sessionStorage.getItem("s")) { sessionStorage.setItem("rl_scene", sc); for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); sessionStorage.setItem("s", 1); } }, [storage, scene]);
  await page.goto(ORIGIN + lang); await page.waitForFunction(() => window.__t); await sleep(500);
  return { ctx, page, errors, dialogs };
}
const st = (page) => page.evaluate(() => window.__t.s());
const banner = (page) => page.locator("#gift-banner");
const save = (best = 4) => ({ rl_save: JSON.stringify({ v: 1, f50: 1, season: 4, best, run: { d: best, hp: 300, mh: 300, a: 50, g: 100, p: 2, l: 5, x: 0, xn: 1e9, rid: "gift-run", k: 0, pp: 0 } }),
  rl_tips: JSON.stringify(["intro", "dungeon", "gear", "lowhp"]) });
try {
  // ---- 원본 사이트 (게스트): 배너 → 테스트 광고 → 3개 → 고르기 ----
  let { ctx, page, errors, dialogs } = await open({ rl_device_id: "giftguest-e2e-0001", ...save() });
  check("ready → glowing gift banner on the game screen", await waitFor(() => banner(page).isVisible()) && (await banner(page).innerText()).includes("무료 선물"));
  const [bb, sb] = [await banner(page).boundingBox(), await page.locator("#stage").boundingBox()];
  check("banner sits at the top-right of the game screen", bb && sb && sb.x + sb.width - (bb.x + bb.width) < 20 && bb.y - sb.y < 20 && bb.x > sb.x + sb.width / 2, JSON.stringify([bb, sb]));
  check("banner glows (animated)", await banner(page).evaluate(e => getComputedStyle(e).animationName.includes("gift-shine")));
  await page.screenshot({ path: path.join(SHOTS, "gift-banner.png") });
  await banner(page).click();
  check("click → ad first (test ad window)", await waitFor(() => page.locator("#ad-modal").isVisible(), 4000));
  await waitFor(() => page.locator("#ad-claim").isEnabled(), 4000); await page.locator("#ad-claim").click();
  check("after the ad: gift window with 3 set items", await waitFor(() => page.locator("#gift-modal").isVisible(), 6000) && (await page.locator(".gift-card").count()) === 3);
  const names = await page.locator(".gift-card b").allInnerTexts();
  check("cards show item names, slot · level and stats", names.length === 3 && (await page.locator(".gift-card .meta").first().innerText()).includes("레벨") && (await page.locator(".gift-card .lines").first().innerText()).length > 5, names.join(" / "));
  await page.screenshot({ path: path.join(SHOTS, "gift-modal.png") });
  const before = await st(page);
  await page.keyboard.press("ArrowRight"); await sleep(200);
  check("game keys don't move the player while the window is open", (await st(page)).x === before.x);
  await page.keyboard.press("Escape"); await sleep(200);
  check("Esc = choose later: window closes, banner now says 'choose'", await page.locator("#gift-modal").isHidden() && (await banner(page).innerText()).includes("선물 고르기"));
  await banner(page).click(); await sleep(400);
  check("banner again → same gifts, no second ad", await page.locator("#gift-modal").isVisible() && await page.locator("#ad-modal").isHidden() && JSON.stringify(await page.locator(".gift-card b").allInnerTexts()) === JSON.stringify(names));
  await page.locator(".gift-card").nth(1).click();
  check("pick → confirm, then the item goes into the bag", await waitFor(async () => (await st(page)).bag.length === before.bag.length + 1) && dialogs.some(d => d.includes("고를까요")), dialogs.join(" | "));
  const got = (await st(page)).bag.at(-1);
  check("the picked one (#2), a server gift seed", got.rarity === "set" && /^bonus\|[0-9a-f]{16}\|e\d+\|s1_\d+$/.test(got.seed) && (await page.locator("#log").innerText()).includes("무료 선물로"), JSON.stringify(got));
  check("window closes and the banner goes away (next in 3 hours)", await page.locator("#gift-modal").isHidden() && await waitFor(async () => !(await banner(page).isVisible())));
  await page.reload(); await page.waitForFunction(() => window.__t); await sleep(800);
  check("after reload: still no banner (server cooldown)", !(await banner(page).isVisible()));
  check("no page errors (site)", errors.length === 0, errors.join("; "));
  await ctx.close();

  // ---- 던전에서도 배너 ----
  ({ ctx, page, errors } = await open({ rl_device_id: "giftguest-e2e-0002", ...save(6) }, { scene: "dungeon" }));
  check("dungeon: banner shows too", await waitFor(() => banner(page).isVisible()) && (await st(page)).scene === "dungeon");
  await ctx.close();

  // ---- 포털 빌드: 서버 없이, 포털 보상 광고, 이 기기에 3시간 ----
  ({ ctx, page, errors } = await open({ rl_device_id: "giftportal-0001", ...save(8) }, { portal: { reward: false } }));
  check("portal: banner shows without a server", await waitFor(() => banner(page).isVisible()));
  await banner(page).click(); await sleep(400);
  check("portal: ad not finished → no gift, message", await page.evaluate(() => window.__ads) === 1 && await page.locator("#gift-modal").isHidden() && (await page.locator("#log").innerText()).includes("광고를 끝까지 보지 않아서"));
  await page.evaluate(() => { window.__reward = true; });
  await banner(page).click();
  check("portal: rewarded ad → 3 gifts", await waitFor(() => page.locator("#gift-modal").isVisible(), 6000) && (await page.locator(".gift-card").count()) === 3);
  const pb = (await st(page)).bag.length;
  await page.locator(".gift-card").first().click(); await sleep(200);
  check("portal: in-game confirm (no native dialog)", await page.locator("#ask-modal").isVisible());
  await page.locator("#ask-yes").click();
  check("portal: picked item in the bag, normal-dungeon set at the best floor's level", await waitFor(async () => (await st(page)).bag.length === pb + 1) && (await st(page)).bag.at(-1).rarity === "set" && /\|e8\|s0_/.test((await st(page)).bag.at(-1).seed), JSON.stringify((await st(page)).bag.at(-1)));
  const L = await page.evaluate(() => Object.entries(localStorage).filter(([k]) => k.startsWith("rl_gift:")).map(([, v]) => JSON.parse(v)));
  check("portal: time saved on this device, nothing pending", L.length === 1 && L[0].pending === null && Date.now() - L[0].at < 60000, JSON.stringify(L));
  await page.reload(); await page.waitForFunction(() => window.__t); await sleep(600);
  check("portal: after reload no banner for 3 hours", !(await banner(page).isVisible()));
  await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith("rl_gift:")) { const v = JSON.parse(localStorage.getItem(k)); v.at -= 3 * 3600000 + 1000; localStorage.setItem(k, JSON.stringify(v)); } });
  await page.reload(); await page.waitForFunction(() => window.__t); await sleep(600);
  check("portal: 3 hours later the banner is back", await banner(page).isVisible());
  check("no page errors (portal)", errors.length === 0, errors.join("; "));
  await ctx.close();

  // ---- 진짜 구글 보상형 광고 (dc#118, ads-config.js provider h5) ----
  ({ ctx, page, errors } = await open({ rl_device_id: "gifth5-e2e-0001", ...save() }, { h5: "viewed" }));
  await waitFor(() => banner(page).isVisible());
  check("h5 (dc#120): Google ad code is loaded in <head> when the page opens (before any ad button)", await page.evaluate(() => !![...document.head.querySelectorAll("script")].find(s => s.src.includes("adsbygoogle.js?client=ca-pub-6503525638904411")) && !window.__h5calls));
  await banner(page).click();
  check("h5: Google reward ad plays (no stand-in window), game counts as 'ad open' while it shows", await waitFor(() => page.evaluate(() => window.__h5during === true), 6000) && await page.locator("#ad-modal").isHidden() && await page.evaluate(() => window.__h5calls) === 1);
  check("h5: watched to the end → 3 gifts", await waitFor(() => page.locator("#gift-modal").isVisible(), 6000) && (await page.locator(".gift-card").count()) === 3 && !(await st(page)).ad);
  const src = await page.evaluate(() => [...document.scripts].find(s => s.src.includes("adsbygoogle"))?.outerHTML || "");
  check("h5: our publisher ID, not in test mode", src.includes("client=ca-pub-6503525638904411") && !src.includes("data-adbreak-test"), src);
  check("no page errors (h5 viewed)", errors.length === 0, errors.join("; "));
  await ctx.close();
  ({ ctx, page, errors } = await open({ rl_device_id: "gifth5-e2e-0002", ...save() }, { h5: "dismissed" }));
  await waitFor(() => banner(page).isVisible()); await banner(page).click();
  check("h5: closed the ad early → no gift, message, no stand-in window", await waitFor(async () => (await page.locator("#log").innerText()).includes("광고를 끝까지 보지 않아서"), 6000) && await page.locator("#gift-modal").isHidden() && await page.locator("#ad-modal").isHidden() && !(await st(page)).ad);
  await ctx.close();
  ({ ctx, page, errors } = await open({ rl_device_id: "gifth5-e2e-0003", ...save() }, { h5: "notReady", lang: "?adtest=1" }));
  await waitFor(() => banner(page).isVisible()); await banner(page).click();
  check("h5: no ad to show → 5-second stand-in window instead", await waitFor(() => page.locator("#ad-modal").isVisible(), 6000) && (await page.locator("#ad-box").innerText()).includes("지금은 광고를 불러올 수 없어요"));
  await waitFor(() => page.locator("#ad-claim").isEnabled(), 4000); await page.locator("#ad-claim").click();
  check("h5: …and the gift still comes", await waitFor(() => page.locator("#gift-modal").isVisible(), 6000) && (await page.locator(".gift-card").count()) === 3);
  check("h5: ?adtest=1 → Google test ads", (await page.evaluate(() => [...document.scripts].find(s => s.src.includes("adsbygoogle"))?.getAttribute("data-adbreak-test"))) === "on");
  check("no page errors (h5 fallback)", errors.length === 0, errors.join("; "));
  await ctx.close();
  // dc#121: 광고가 늦게 뜨면 그동안 "광고를 불러오는 중" 창 + 취소
  ({ ctx, page, errors } = await open({ rl_device_id: "gifth5-e2e-0006", ...save() }, { h5: "slow" }));
  await waitFor(() => banner(page).isVisible()); await banner(page).click();
  check("h5 slow: right after the click a 'loading the ad' window with a Cancel button", await waitFor(() => page.locator("#ad-wait").isVisible(), 1500) && (await page.locator("#ad-wait").innerText()).includes("광고를 불러오는 중이에요") && await page.locator("#ad-wait-cancel").isVisible() && (await st(page)).ad);
  await page.screenshot({ path: path.join(SHOTS, "ad-wait.png") });
  check("h5 slow: when the ad shows, the loading window closes by itself", await waitFor(() => page.evaluate(() => window.__h5during === true), 6000) && await page.locator("#ad-wait").isHidden());
  check("h5 slow: …and after the ad, the gift", await waitFor(() => page.locator("#gift-modal").isVisible(), 6000) && (await page.locator(".gift-card").count()) === 3);
  check("no page errors (h5 slow)", errors.length === 0, errors.join("; "));
  await ctx.close();
  ({ ctx, page, errors } = await open({ rl_device_id: "gifth5-e2e-0007", ...save() }, { h5: "slow" }));
  await waitFor(() => banner(page).isVisible()); await banner(page).click();
  await waitFor(() => page.locator("#ad-wait").isVisible(), 1500); await sleep(300);
  await page.locator("#ad-wait-cancel").click();
  check("h5 cancel: the window closes right away, message, no gift", await waitFor(() => page.locator("#ad-wait").isHidden(), 500) && await waitFor(async () => (await page.locator("#log").innerText()).includes("광고를 취소했어요"), 2000) && await page.locator("#gift-modal").isHidden());
  await sleep(4000);
  check("h5 cancel: the late ad never shows, no stand-in window, game not paused", !(await page.evaluate(() => window.__h5during)) && await page.locator("#ad-modal").isHidden() && await page.locator("#gift-modal").isHidden() && !(await st(page)).ad && await banner(page).isVisible());
  check("no page errors (h5 cancel)", errors.length === 0, errors.join("; "));
  await ctx.close();
  // dc#119: PC에서 광고 버튼이 멈춤 — 구글 스크립트가 아무 답도 안 하면 6초 뒤 안내 화면으로 대신
  for (const [i, mode] of [[4, "silent"], [5, "noShow"]]) {
    ({ ctx, page, errors } = await open({ rl_device_id: `gifth5-e2e-000${i}`, ...save() }, { h5: mode }));
    await waitFor(() => banner(page).isVisible()); const t0 = Date.now(); await banner(page).click();
    const shown = await waitFor(() => page.locator("#ad-modal").isVisible(), 12000), took = Date.now() - t0;
    check(`h5 ${mode}: no answer from Google → stand-in window after ~6 s (not stuck)`, shown && took > 4000, `${shown} ${took}ms`);
    await waitFor(() => page.locator("#ad-claim").isEnabled(), 4000); await page.locator("#ad-claim").click();
    check(`h5 ${mode}: …and the gift still comes`, await waitFor(() => page.locator("#gift-modal").isVisible(), 6000) && (await page.locator(".gift-card").count()) === 3);
    check(`no page errors (h5 ${mode})`, errors.length === 0, errors.join("; "));
    await ctx.close();
  }

  // ---- 영어 ----
  ({ ctx, page, errors } = await open({ rl_device_id: "giftguest-e2e-0003", ...save() }, { lang: "?lang=en" }));
  check("English banner", await waitFor(() => banner(page).isVisible()) && (await banner(page).innerText()).includes("Free gift"), await banner(page).innerText().catch(() => ""));
  await ctx.close();
} finally { await browser.close(); php.kill(); mock.close(); }
const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
