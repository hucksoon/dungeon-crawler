// 랭킹에 갔다가 "게임으로 돌아가기": 같은 탭에서 있던 층·자리 그대로 (PC·휴대폰), 로비에서 갔으면 로비로
import { createRequire } from "node:module";
import fs from "node:fs"; import path from "node:path";
const require = createRequire(process.env.NODE_PATH + "/");
const { chromium, devices } = require("playwright");
const REPO = process.argv[2], OUT = process.argv[3];
const ORIGIN = "https://game.apacimtest.com/";
const results = []; const check = (n, ok, x = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x && !ok ? " — " + x : ""}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const MAP_W = 32, MAP_H = 24;
const map = Array.from({ length: MAP_H }, (_, y) => Array.from({ length: MAP_W }, (_, x) => (x === 0 || y === 0 || x === MAP_W - 1 || y === MAP_H - 1 ? 0 : 1)));
map[20][28] = 2;
const level = JSON.stringify({ rid: "nav-run", d: 37, turn: 5, map: map.map(r => r.join("")).join(""), seen: "1".repeat(MAP_W * MAP_H), px: 10, py: 10, shop: null, enemies: [], items: [{ x: 3, y: 3, type: "gold", amount: 7 }] });
const save = JSON.stringify({ v: 1, f50: 1, season: 4, best: 37, run: { d: 37, hp: 500, mh: 500, a: 30, g: 123, p: 3, l: 20, x: 0, xn: 1e9, rid: "nav-run", k: 0, pp: 0 } });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
try {
  for (const [name, opts] of [["desktop", { viewport: { width: 1100, height: 1000 } }], ["phone", { ...devices["iPhone 13"] }]]) {
    const ctx = await browser.newContext(opts); const page = await ctx.newPage(); const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    await ctx.route(ORIGIN + "**", r => { const f = new URL(r.request().url()).pathname.slice(1) || "index.html";
      if (f === "ranking-config.js") return r.fulfill({ contentType: "text/javascript", body: 'window.RANKING_API = "";' });
      const p = path.join(REPO, f); if (!fs.existsSync(p)) return r.fulfill({ status: 404, body: "" });
      r.fulfill({ contentType: f.endsWith(".js") ? "text/javascript" : f.endsWith(".png") ? "image/png" : "text/html", body: fs.readFileSync(p) }); });
    await ctx.route("https://login.xsolla.com/**", r => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
    await ctx.route("https://pagead2.googlesyndication.com/**", r => r.fulfill({ status: 200, contentType: "text/javascript", body: "" }));
    await ctx.addInitScript(([s, l]) => { if (sessionStorage.getItem("seeded")) return; sessionStorage.setItem("seeded", 1); sessionStorage.setItem("rl_scene", "dungeon");
      localStorage.setItem("rl_device_id", "nav-dev-0001"); localStorage.setItem("rl_save", s); localStorage.setItem("rl_level", l); }, [save, level]);
    await page.goto(ORIGIN); await page.waitForTimeout(400);
    // 조금 움직임: 오른쪽 2칸, 아래 1칸
    for (const k of ["ArrowRight", "ArrowRight", "ArrowDown"]) { await page.keyboard.press(k); await sleep(80); }
    const before = await page.evaluate(() => JSON.parse(localStorage.getItem("rl_level")));
    check(`${name}: moved to (12, 11) on floor 37`, before.px === 12 && before.py === 11 && before.d === 37);
    const pages0 = ctx.pages().length;
    const rank = page.locator("#rank-btn");
    if (!(await rank.isVisible())) { check(`${name}: ranking button visible`, false); await ctx.close(); continue; }
    await rank.click(); await page.waitForURL(/ranking\.html/); await sleep(300);
    check(`${name}: ranking opens in the same tab (no new tab)`, ctx.pages().length === pages0 && page.url().endsWith("ranking.html"));
    await page.getByRole("link", { name: "게임으로 돌아가기" }).click(); await page.waitForURL(u => !String(u).includes("ranking")); await sleep(500);
    const inLobby = await page.evaluate(() => document.body.classList.contains("in-lobby"));
    const after = await page.evaluate(() => JSON.parse(localStorage.getItem("rl_level")));
    check(`${name}: back in the dungeon on floor 37 (not the lobby)`, !inLobby && (await page.locator("#depth").innerText()) === "37", `lobby=${inLobby} depth=${await page.locator("#depth").innerText()}`);
    check(`${name}: same floor and same spot (map, position, gold pile)`, after.map === before.map && after.px === 12 && after.py === 11 && after.items.some(i => i.type === "gold" && i.x === 3 && i.y === 3));
    check(`${name}: gold and HP kept`, (await page.locator("#gold").innerText()) === "123");
    // 로비에서 랭킹 → 돌아오면 로비
    await page.keyboard.press("p"); await sleep(150);  // 포탈 열기 → 옆 칸의 파란 포탈로 걸어 들어감
    { const L = await page.evaluate(() => JSON.parse(localStorage.getItem("rl_level")));
      if (L?.tp) await page.keyboard.press(L.tp.x > L.px ? "ArrowRight" : L.tp.x < L.px ? "ArrowLeft" : L.tp.y > L.py ? "ArrowDown" : "ArrowUp"); await sleep(300); }
    check(`${name}: portal to lobby`, await page.evaluate(() => document.body.classList.contains("in-lobby")));
    await page.locator("#rank-btn").click(); await page.waitForURL(/ranking\.html/); await sleep(200);
    await page.getByRole("link", { name: "게임으로 돌아가기" }).click(); await page.waitForURL(u => !String(u).includes("ranking")); await sleep(500);
    check(`${name}: from the lobby → back to the lobby with the portal floor kept`, await page.evaluate(() => document.body.classList.contains("in-lobby")) && (await page.evaluate(() => JSON.parse(localStorage.getItem("rl_save")).run.d)) === 37);
    check(`${name}: no page errors`, errors.length === 0, errors.join("; "));
    await ctx.close();
  }
} finally { await browser.close(); }
const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
