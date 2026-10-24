// 게임 언어 자동 설정: 서버 r=geo (나라 코드만) + 게임은 고른 언어 → IP 나라 → 브라우저 언어
import { createRequire } from "node:module";
import fs from "node:fs"; import path from "node:path";
import { spawn } from "node:child_process";
const require = createRequire(process.env.NODE_PATH + "/");
const { chromium } = require("playwright");
const REPO = process.argv[2], OUT = process.argv[3];
const ORIGIN = "https://game.apacimtest.com/", API = "https://api.test/api.php";
const results = []; const check = (n, ok, x = "") => { results.push(!!ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x && !ok ? " — " + x : ""}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const DIR = path.dirname(new URL(import.meta.url).pathname) + "/php";
const DB = path.join(DIR, "geo.sqlite"); try { fs.unlinkSync(DB); } catch {}
const CFG = path.join(DIR, "config.geo.php");
fs.writeFileSync(CFG, `<?php\n$c = require __DIR__ . '/config.test.php';\nreturn array_merge($c, ['db_dsn' => 'sqlite:${DB}']);\n`);
const php = spawn("php", ["-S", "127.0.0.1:8123", "-t", path.join(REPO, "ranking-php")], { env: { ...process.env, RANKING_CONFIG: CFG, TEST_JWT_SECRET: "geo" }, stdio: ["ignore", "ignore", "pipe"] });
let phpErr = ""; php.stderr.on("data", d => phpErr += d);
await sleep(700);
const geo = (h = {}) => fetch("http://127.0.0.1:8123/api.php?r=geo", { headers: { Origin: ORIGIN.slice(0, -1), ...h } }).then(async r => ({ status: r.status, cc: r.headers.get("cache-control"), body: await r.json() }));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
let geoHits = 0;
// country: 서버가 돌려줄 나라 (CF-IPCountry 헤더로 흉내)
async function open(dev, { country = null, locale = "en-US", store = {}, query = "", route404 = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 }, locale }); const page = await ctx.newPage(); const errors = [];
  page.on("pageerror", e => errors.push(e.message)); page.on("dialog", d => d.dismiss());
  await ctx.route(ORIGIN + "**", r => { const f = new URL(r.request().url()).pathname.slice(1) || "index.html";
    if (f === "ranking-config.js") return r.fulfill({ contentType: "text/javascript", body: `window.RANKING_API = "${API}";` });
    const p = path.join(REPO, f); if (!fs.existsSync(p)) return r.fulfill({ status: 404, body: "" });
    r.fulfill({ contentType: f.endsWith(".js") ? "text/javascript" : "text/html", body: fs.readFileSync(p) }); });
  await ctx.route("https://api.test/**", async r => { const req = r.request(), u = new URL(req.url());
    if (u.searchParams.get("r") === "geo") { geoHits++; if (route404) return r.fulfill({ status: 404, contentType: "application/json", body: '{"error":"not_found"}' }); }
    const res = await fetch(`http://127.0.0.1:8123/api.php${u.search}`, { method: req.method(), headers: { ...req.headers(), origin: ORIGIN.slice(0, -1), ...(country ? { "CF-IPCountry": country } : {}) }, body: req.method() === "GET" ? undefined : req.postData() });
    r.fulfill({ status: res.status, headers: { "content-type": "application/json", "access-control-allow-origin": "*" }, body: await res.text() }); });
  await ctx.route("https://login.xsolla.com/**", r => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await ctx.addInitScript(([dev, store]) => { if (sessionStorage.getItem("seeded")) return; sessionStorage.setItem("seeded", 1);
    localStorage.setItem("rl_device_id", dev); for (const [k, v] of Object.entries(store)) localStorage.setItem(k, v);
    for (const k of ["rl_notice_v4", "rl_notice_75", "rl_notice_1021g", "rl_notice_1021h", "rl_notice_1021i", "rl_notice_1021j", "rl_notice_1022a", "rl_notice_1022b", "rl_notice_1023a", "rl_notice_1023b", "rl_notice_1023c", "rl_notice_1023d"]) localStorage.setItem(`${k}:g:${dev}`, "1"); }, [dev, store]);
  await page.goto(ORIGIN + query); await sleep(1500);
  const st = () => page.evaluate(() => ({ lang: RLI18N.lang, html: document.documentElement.lang, geo: localStorage.getItem("rl_geo"), chosen: localStorage.getItem("rl_game_lang"), shop: localStorage.getItem("rl_lang"), sel: document.getElementById("lang-select").hidden ? null : document.getElementById("lang-select").value, opts: [...document.querySelectorAll("#lang-select option")].map(o => o.textContent), title: document.getElementById("inv-btn")?.textContent }));
  return { ctx, page, errors, st };
}
try {
  // ---- 서버 ----
  const g0 = await geo();
  check("geo: no source → country null, no-store", g0.status === 200 && g0.body.country === null && /no-store/.test(g0.cc || ""), JSON.stringify(g0));
  check("geo: CF-IPCountry JP → JP", (await geo({ "CF-IPCountry": "JP" })).body.country === "JP");
  check("geo: lower-case kr → KR", (await geo({ "CF-IPCountry": "kr" })).body.country === "KR");
  check("geo: XX / T1 (unknown, Tor) → null", (await geo({ "CF-IPCountry": "XX" })).body.country === null && (await geo({ "CF-IPCountry": "T1" })).body.country === null);
  check("geo: junk header → null", (await geo({ "CF-IPCountry": "<script>" })).body.country === null);

  // ---- 게임 ----
  let o = await open("geo-jp", { country: "JP", locale: "en-US" });
  let s = await o.st();
  check("first visit from Japan (browser en): reloads once into Japanese", s.lang === "ja" && s.html === "ja" && JSON.parse(s.geo).c === "JP" && s.chosen === null, JSON.stringify(s));
  check("select shows 🌐 Auto (日本語) selected", s.sel === "auto" && s.opts[0] === "🌐 自動 (日本語)" && s.opts.length === 4, JSON.stringify(s.opts));
  const hits = geoHits;
  await o.page.reload(); await sleep(1200);
  check("cached for a day: no second geo request on reload", geoHits === hits && (await o.st()).lang === "ja");
  await o.page.selectOption("#lang-select", "en"); await sleep(1500);
  s = await o.st();
  check("choosing English sticks (rl_game_lang), shop rl_lang untouched", s.lang === "en" && s.chosen === "en" && s.shop === null && s.sel === "en", JSON.stringify(s));
  await o.page.selectOption("#lang-select", "auto"); await sleep(1500);
  s = await o.st();
  check("Auto clears the choice → back to IP country (ja)", s.lang === "ja" && s.chosen === null && s.sel === "auto", JSON.stringify(s));
  check("no page errors (jp)", o.errors.length === 0, o.errors.join("; "));
  await o.ctx.close();

  o = await open("geo-kr", { country: "KR", locale: "ja-JP" }); s = await o.st();
  check("Korea IP beats Japanese browser → ko", s.lang === "ko" && JSON.parse(s.geo).c === "KR", JSON.stringify(s));
  await o.ctx.close();
  o = await open("geo-us", { country: "US", locale: "ko-KR" }); s = await o.st();
  check("US IP beats Korean browser → en", s.lang === "en", JSON.stringify(s));
  await o.ctx.close();
  o = await open("geo-none", { country: null, locale: "ja-JP" }); s = await o.st();
  check("server can't tell (null) → browser language ja", s.lang === "ja" && JSON.parse(s.geo).c === null, JSON.stringify(s));
  await o.ctx.close();
  o = await open("geo-none2", { country: null, locale: "fr-FR" }); s = await o.st();
  check("unknown country + French browser → en", s.lang === "en", JSON.stringify(s));
  await o.ctx.close();
  o = await open("geo-shop", { country: "KR", locale: "ko-KR", store: { rl_lang: "ja" } }); s = await o.st();
  check("shop language (rl_lang=ja) no longer drives the game → ko by IP", s.lang === "ko" && s.shop === "ja", JSON.stringify(s));
  await o.ctx.close();
  o = await open("geo-chosen", { country: "KR", store: { rl_game_lang: "ja" } }); s = await o.st();
  check("a chosen language wins over IP and skips the geo request", s.lang === "ja" && s.geo === null && s.sel === "ja", JSON.stringify(s));
  await o.ctx.close();

  // ---- 서버가 geo를 모를 때(404, 배포 전): 보관하지 않고 다음에 다시 ----
  o = await open("geo-404", { country: "JP", locale: "ja-JP", store: {}, query: "" , route404: true }); s = await o.st();
  check("geo 404 → not cached, browser language ja", s.lang === "ja" && s.geo === null, JSON.stringify(s));
  await o.ctx.close();
  o = await open("geo-preview", { country: "JP", query: "?lang=en" }); s = await o.st();
  check("preview ?lang=en still works (no Auto option)", s.lang === "en" && s.opts.length === 3 && !s.opts.some(t => t.includes("🌐")), JSON.stringify(s));
  await o.ctx.close();
} finally { await browser.close(); php.kill(); }
check("no php errors", !/Fatal|Warning|Notice|Deprecated/.test(phpErr), phpErr.slice(0, 400));
console.log(`${results.filter(Boolean).length}/${results.length} passed`);
