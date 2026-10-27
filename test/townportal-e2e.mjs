// 포탈 열기(던전에 파란 *, 걸어 들어가면 로비), 로비의 파란 포탈로 떠난 자리로, 웨이포인트(예전 오른쪽 문 자리), 보물은 !
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import fs from "node:fs"; import path from "node:path";
import { goDoor } from "./town.mjs";   // 마을(옆에서 보는 로비) 문까지 걸어가 ↑
const require = createRequire(process.env.NODE_PATH + "/");
const { chromium } = require("playwright");
const REPO = process.argv[2], OUT = process.argv[3];
const I = createRequire(import.meta.url)(path.join(REPO, "items.js"));
const M = createRequire(import.meta.url)(path.join(REPO, "monsters.js"));
const ORIGIN = "https://game.apacimtest.com/", API = "https://api.test/api.php";
const results = []; const check = (n, ok, x = "") => { results.push(!!ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x && !ok ? " — " + x : ""}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const EL = M.ELEMENTS;

// ---- 서버 ----
const DIR = path.dirname(new URL(import.meta.url).pathname) + "/php";
const DB = path.join(DIR, "tp.sqlite"); for (const f of [DB, DB + "-wal", DB + "-shm"]) fs.rmSync(f, { force: true });
const CFG = path.join(DIR, "config.tp.php");
fs.writeFileSync(CFG, `<?php\n$c = require __DIR__ . '/config.test.php';\nreturn array_merge($c, ['db_dsn' => 'sqlite:${DB}']);\n`);
const php = spawn("php", ["-S", "127.0.0.1:8104", "-t", path.join(REPO, "ranking-php")], { env: { ...process.env, RANKING_CONFIG: CFG, TEST_JWT_SECRET: "tp" }, stdio: ["ignore", "ignore", "pipe"] });
let phpErr = ""; php.stderr.on("data", d => phpErr += d);
await sleep(700);

const MAP_W = 32, MAP_H = 24;
const map = Array.from({ length: MAP_H }, (_, y) => Array.from({ length: MAP_W }, (_, x) => (x === 0 || y === 0 || x === MAP_W - 1 || y === MAP_H - 1 ? 0 : 1)));
const lv = (d, rid, z, enemies = [], extra = {}, stairs = [28, 20]) => { const mm = map.map(r => r.slice()); mm[stairs[1]][stairs[0]] = 2; return JSON.stringify({ rid, d, z, turn: 0, map: mm.map(r => r.join("")).join(""), seen: "1".repeat(MAP_W * MAP_H), px: 10, py: 10, shop: null, enemies, items: [], ...extra }); };
const save = (d, rid, run = {}) => JSON.stringify({ v: 1, season: 4, best: 75, clr: 1, nb: 10, run: { d, hp: 300, mh: 1000, a: 30, g: 500, l: 40, x: 0, xn: 1e12, rid, k: 0, pp: 0, ...run } });
const eqOf = (...its) => { const e = Object.fromEntries(I.SLOTS.map(s => [s, null])); for (const it of its) e[it.slot] = it; return e; };
const foe = (x, y, extra = {}) => ({ x, y, id: "titan", ch: "I", name: "악몽의 타이탄", color: "#fdd835", kind: "normal", hp: 1e7, maxHp: 1e7, atk: 0, def: 0, xp: 1, nm: 1, ...extra });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
async function open(dev, seed, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 1000 } }); const page = await ctx.newPage(); const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("dialog", d => d.accept());
  await ctx.route(ORIGIN + "**", r => { const f = new URL(r.request().url()).pathname.slice(1) || "index.html";
    if (f === "ranking-config.js") return r.fulfill({ contentType: "text/javascript", body: `window.RANKING_API = "${opts.api ? API : ""}";` });
    const p = path.join(REPO, f); if (!fs.existsSync(p)) return r.fulfill({ status: 404, body: "" });
    r.fulfill({ contentType: f.endsWith(".js") ? "text/javascript" : "text/html", body: fs.readFileSync(p) }); });
  await ctx.route("https://api.test/**", async r => { const req = r.request(), u = new URL(req.url());
    const res = await fetch(`http://127.0.0.1:8104/api.php${u.search}`, { method: req.method(), headers: { ...req.headers(), origin: ORIGIN.slice(0, -1) }, body: req.method() === "GET" ? undefined : req.postData() });
    r.fulfill({ status: res.status, headers: { "content-type": "application/json", "access-control-allow-origin": "*" }, body: await res.text() }); });
  await ctx.route("https://login.xsolla.com/**", r => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await ctx.addInitScript(([seed, dev]) => { if (sessionStorage.getItem("seeded")) return; sessionStorage.setItem("seeded", 1); sessionStorage.setItem("rl_scene", "dungeon");
    localStorage.setItem("rl_device_id", dev); localStorage.setItem(`rl_notice_v4:g:${dev}`, "1"); localStorage.setItem(`rl_notice_75:g:${dev}`, "1");
    for (const [k, v] of Object.entries(seed)) localStorage.setItem(k.replace("DEV", dev), v);
    window.__log = []; document.addEventListener("DOMContentLoaded", () => new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => window.__log.push(n.textContent)))).observe(document.getElementById("log"), { childList: true })); }, [seed, dev]);
  await page.goto(ORIGIN); await sleep(450);
  return { ctx, page, errors };
}
const logs = (page) => page.evaluate(() => (window.__log || [...document.querySelectorAll("#log div")].map(d => d.textContent)).join("\n"));
const level = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("rl_level")));
const press = async (page, k, n = 1) => { for (let i = 0; i < n; i++) { await page.keyboard.press(k); await sleep(30); } };
const inv = (...eq) => JSON.stringify({ bag: [], equip: eqOf(...eq), log: [], stones: 0 });


const plain = I.generate("tp|d70|k1", "golden", 70);
const saveB = (d, rid, best, extra = {}) => JSON.stringify({ v: 1, season: 4, best, ...extra, run: { d, hp: 900, mh: 1000, a: 30, g: 777, l: 20, x: 0, xn: 1e12, rid, k: 0, pp: 0 } });
const inLobby = (page) => page.evaluate(() => document.body.classList.contains("in-lobby"));
try {
  // 1. 포탈(P) → 바로 로비 (턴 없음), 로비 파란 포탈로 떠난 자리로
  let { ctx, page, errors } = await open("tptest-a", { rl_save: saveB(20, "tpA", 25), rl_level: JSON.stringify({ ...JSON.parse(lv(20, "tpA", "normal")), items: [{ x: 10, y: 12, type: "treasure" }] }), "rl_inv:g:DEV": inv(plain) });
  await page.screenshot({ path: path.join(OUT, "tp-dungeon.png") });
  await press(page, "q"); await sleep(80);  // 포션 마심 → 쿨타임
  const hpBefore = await page.locator("#hp").innerText();
  const t0 = (await level(page)).turn;
  await press(page, "p"); await sleep(200);
  const [hpNow, hpMax] = (await page.locator("#hp").innerText()).split("/");
  check("portal heals to full and resets the potion cooldown", hpNow === hpMax && (await page.locator("#tp-potion").innerText()) === "포션 (준비됨)" && (await logs(page)).includes("HP와 포션이 모두 회복됐다") && JSON.parse(await page.evaluate(() => localStorage.getItem("rl_save"))).run.pc === 0, `${hpBefore} → ${hpNow}/${hpMax}`);
  check("P goes to the lobby right away (no turn used)", await inLobby(page) && (await level(page)).turn === t0 && (await logs(page)).includes("바로 앞 파란 포탈로 20층의 떠난 자리에 다시 들어갈 수 있다"));
  await page.screenshot({ path: path.join(OUT, "tp-lobby.png") });
  // 마을 파란 포탈 문 앞에 섬 → ↑로 들어가면 떠난 자리
  await press(page, "ArrowUp"); await sleep(200);
  const L = await level(page);
  check("back in the dungeon with full HP", (() => true)() && (await page.locator("#hp").innerText()).split("/")[0] === (await page.locator("#hp").innerText()).split("/")[1]);
  check("lobby portal returns to the same spot", !(await inLobby(page)) && (await page.locator("#depth").innerText()) === "20" && L.px === 10 && L.py === 10 && (await logs(page)).includes("떠난 자리로 돌아왔다"), JSON.stringify([L.px, L.py]));
  // 로비에서 새로고침해도 포탈 층을 기억
  await press(page, "p"); await sleep(200);
  await page.reload(); await sleep(500);
  check("reload in the lobby keeps the portal floor", await inLobby(page) && (await logs(page)).includes("파란 포탈로 20층에 돌아갈 수 있다"));
  check("no page errors (portal)", errors.length === 0, errors.join("; "));
  await ctx.close();

  // 2. 던전 입구 오른쪽 문(최고 층 − 10층)은 없어지고 웨이포인트로 (dc#97). 최고 층만으로는 웨이포인트가 켜지지 않음
  ({ ctx, page, errors } = await open("tptest-b", { rl_save: saveB(1, "tpB", 40), rl_level: lv(1, "tpB", "normal"), "rl_inv:g:DEV": inv(plain) }));
  await press(page, "p"); await sleep(200);
  // 1층에서 나오면 로비 포탈 없음, 1층 문 앞
  check("leaving from floor 1: no lobby portal (nothing to return to)", await inLobby(page) && !(await logs(page)).includes("파란 포탈로"));
  check("no right door (best − 10) in the town anymore", await page.evaluate(() => !window.RLJump.TOWN.doors.some(d => d.id === "skip")));
  await goDoor(page, "waypoint"); await sleep(200);
  check("best 40 but never stepped on a waypoint: 25층 locked", await page.locator("#wp-list .wp-row").nth(0).locator("button", { hasText: "25층" }).isDisabled());
  await ctx.close();

  // 3. 75층 완료자: 웨이포인트가 모두 켜져 있음 → 75층부터, 포탈 층이 있으면 확인 창 (사라진다는 안내)
  ({ ctx, page, errors } = await open("tptest-d", { rl_save: saveB(75, "tpD", 76, { clr: 1 }), rl_level: lv(75, "tpD", "normal"), "rl_inv:g:DEV": inv(plain) }));
  let dlg = ""; page.on("dialog", d => { dlg = d.message(); });
  await press(page, "p"); await sleep(200);
  await goDoor(page, "waypoint"); await sleep(200);
  await page.locator("#wp-list .wp-row").nth(0).locator("button", { hasText: "50층" }).click(); await sleep(300);
  check("cleared: waypoint 50 (on for completed players), confirms that the portal floor goes away", (await page.locator("#depth").innerText()) === "50" && dlg.includes("50층부터 새로 들어갈까요?") && dlg.includes("75층"), dlg);
  check("no page errors (doors)", errors.length === 0, errors.join("; "));
  await ctx.close();
} finally { await browser.close(); php.kill(); }
const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
