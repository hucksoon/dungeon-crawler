// 내 플레이어 ID (dc#174): 디스코드 상점 봇(/shop)에 넣는 ID = Xsolla Login 사용자 ID (로그인 토큰의 sub)
//   게스트는 버튼이 없음 · 로그인하면 계정 줄에 "🆔 플레이어 ID" → 창에 ID와 복사 버튼 → 클립보드에 복사 · Esc로 닫기 · 영어
import { createRequire } from "node:module";
import fs from "node:fs"; import path from "node:path";
const require = createRequire(process.env.NODE_PATH + "/");
const { chromium } = require("playwright");
const REPO = process.argv[2], SHOTS = process.argv[3];
const ORIGIN = "https://hucksoon.github.io/hucksoon/";
const results = []; const check = (n, ok, x = "") => { results.push(!!ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x && !ok ? " — " + x : ""}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const b64u = (s) => Buffer.from(s).toString("base64url");
const jwt = (sub, email) => `${b64u(JSON.stringify({ alg: "HS256" }))}.${b64u(JSON.stringify({ sub, email, exp: Math.floor(Date.now() / 1000) + 7200, xsolla_login_project_id: "30375188-893b-4b1a-ba1b-c8ba692fa5e3" }))}.sig`;
const SUB = "3f9c2a1e-7b4d-4c8e-9a10-5d6e7f8a9b0c";
const EXE = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const browser = await chromium.launch({ executablePath: EXE });
async function open(storage) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ["clipboard-read", "clipboard-write"] });
  const page = await ctx.newPage(); const errors = [];
  page.on("pageerror", e => errors.push(e.message)); page.on("dialog", d => d.accept());
  await ctx.route(ORIGIN + "**", r => { const f = new URL(r.request().url()).pathname.replace("/hucksoon/", "") || "index.html";
    if (f === "ranking-config.js") return r.fulfill({ contentType: "text/javascript", body: `window.RANKING_API = "";` });
    const p = path.join(REPO, f); if (!fs.existsSync(p)) return r.fulfill({ status: 404, body: "" });
    r.fulfill({ contentType: f.endsWith(".js") ? "text/javascript" : f.endsWith(".png") ? "image/png" : f.endsWith(".webp") ? "image/webp" : "text/html", body: fs.readFileSync(p) }); });
  await ctx.route(/store\.xsolla\.com|login\.xsolla\.com/, r => r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: '{"items":[]}' }));
  await ctx.addInitScript((s) => { if (!sessionStorage.getItem("s")) { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); sessionStorage.setItem("s", 1); } }, storage);
  await page.goto(ORIGIN); await sleep(900);
  return { ctx, page, errors };
}
const BASE = { rl_oldtown: "off", rl_device_id: "pid-dev", rl_tut: JSON.stringify(["intro"]), rl_tip_dodge: "1", rl_game_lang: "ko", rl_lang: "ko" };
try {
  // 게스트: 버튼 없음
  let { ctx, page, errors } = await open(BASE);
  check("guest: no player ID button", await page.locator("#pid-btn").isHidden());
  await ctx.close();
  // 로그인: 버튼 → 창 → 복사
  ({ ctx, page, errors } = await open({ ...BASE, rl_auth: JSON.stringify({ access: jwt(SUB, "pid@example.com"), refresh: "r", exp: Date.now() + 7200_000 }) }));
  const btn = page.locator("#pid-btn");
  check("logged in: '🆔 플레이어 ID' button in the account bar", await btn.isVisible() && /플레이어 ID/.test(await btn.innerText()), await btn.innerText().catch(() => ""));
  await btn.click(); await sleep(200);
  check("window shows my Xsolla user ID and the Discord /shop hint", await page.locator("#pid-modal").isVisible() && (await page.locator("#pid-value").innerText()) === SUB && /\/shop/.test(await page.locator("#pid-modal").innerText()));
  await page.locator("#pid-copy").click(); await sleep(250);
  const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => "");
  check("copy puts the ID on the clipboard and says so", clip === SUB && /복사했어요/.test(await page.locator("#pid-msg").innerText()), clip);
  await page.locator("#pid-modal .modal").screenshot({ path: path.join(SHOTS, "pid-modal.png") });
  await page.keyboard.press("Escape"); await sleep(100);
  check("Esc closes the window", await page.locator("#pid-modal").isHidden());
  check("the ID is not stored anywhere new (no extra localStorage key holds it)", await page.evaluate((sub) => Object.keys(localStorage).filter(k => k !== "rl_auth" && (localStorage.getItem(k) || "").includes(sub) && !k.includes(sub)).length === 0, SUB));
  check("no page errors", errors.length === 0, errors.join("; "));
  await ctx.close();
  // 영어
  ({ ctx, page, errors } = await open({ ...BASE, rl_game_lang: "en", rl_lang: "en", rl_auth: JSON.stringify({ access: jwt(SUB, "pid@example.com"), refresh: "r", exp: Date.now() + 7200_000 }) }));
  await page.locator("#pid-btn").click(); await sleep(200);
  check("English: 'My Player ID' window with Copy", /My Player ID/.test(await page.locator("#pid-title").innerText()) && /Copy/.test(await page.locator("#pid-copy").innerText()));
  await ctx.close();
} finally { await browser.close(); }
console.log(`${results.filter(Boolean).length}/${results.length} passed`);
