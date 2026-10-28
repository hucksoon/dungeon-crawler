// 무료 선물 (dc#105) 브라우저 테스트: 오른쪽 위 반짝이는 배너 → 광고 → 세트 3개 → 하나 골라 가방으로, 3시간 동안 배너 없음
//   원본 사이트(서버 bonus.php)와 포털 빌드(서버 없이 이 기기에서, 포털 보상 광고), 영어 화면
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
  window.__t = { s: () => ({ scene, bag: Inv.bag().map(i => ({ id: i.id, rarity: i.rarity, seed: i.seed })), x: player.x, y: player.y }) };
  // ---- 시작 ----`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
// portal: 포털 빌드처럼 (서버 없음, 보상 광고는 reward 결과)
async function open(storage, { portal = null, scene = "lobby", lang = "" } = {}) {
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

  // ---- 영어 ----
  ({ ctx, page, errors } = await open({ rl_device_id: "giftguest-e2e-0003", ...save() }, { lang: "?lang=en" }));
  check("English banner", await waitFor(() => banner(page).isVisible()) && (await banner(page).innerText()).includes("Free gift"), await banner(page).innerText().catch(() => ""));
  await ctx.close();
} finally { await browser.close(); php.kill(); mock.close(); }
const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
