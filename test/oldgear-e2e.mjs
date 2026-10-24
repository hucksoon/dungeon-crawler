// 예전(v3까지) 장비를 낀 판은 v4 베타 랭킹 제외 (게임·서버), 이미 올라간 기록은 admin.php로 지우기
import { createRequire } from "node:module";
import { spawn, execFileSync } from "node:child_process";
import crypto from "node:crypto"; import fs from "node:fs"; import path from "node:path";
const require = createRequire(process.env.NODE_PATH + "/");
const { chromium } = require("playwright");
const REPO = process.argv[2], OUT = process.argv[3];
const I = createRequire(import.meta.url)(path.join(REPO, "items.js"));
const ORIGIN = "https://game.apacimtest.com/";
const results = []; const check = (n, ok, x = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x && !ok ? " — " + x : ""}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const v3 = I.generate("og3|shop|d20|s1", "golden", 20, 3);
const v4 = I.generate("og4|shop|d20|s2", "golden", 20, 4, 6);   // r6 (장신구 전)
const v4b = (() => { for (let n = 0; ; n++) { const it = I.generate(`og4b${n}|shop|d20|s3`, "golden", 20); if (it.slot !== v4.slot && it.slot !== v3.slot) return it; } })();
const MAP_W = 32, MAP_H = 24;
const map = Array.from({ length: MAP_H }, (_, y) => Array.from({ length: MAP_W }, (_, x) => (x === 0 || y === 0 || x === MAP_W - 1 || y === MAP_H - 1 ? 0 : 1)));
map[10][11] = 2;
const level = (d, rid) => JSON.stringify({ rid, d, turn: 0, map: map.map(r => r.join("")).join(""), seen: "1".repeat(MAP_W * MAP_H), px: 10, py: 10, shop: null, enemies: [], items: [] });
const save = (d, rid, best, run = {}) => JSON.stringify({ v: 1, season: 4, best, run: { d, hp: 900000, mh: 900000, a: 30, g: 100, p: 3, l: 30, x: 0, xn: 1e9, rid, k: 0, pp: 0, ...run } });
const eqOf = (...its) => { const e = Object.fromEntries(I.SLOTS.map(s => [s, null])); for (const it of its) e[it.slot] = it; return e; };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
async function open(dev, sv, lv, inv) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 1000 } }); const page = await ctx.newPage(); const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await ctx.route(ORIGIN + "**", r => { const f = new URL(r.request().url()).pathname.slice(1) || "index.html";
    if (f === "ranking-config.js") return r.fulfill({ contentType: "text/javascript", body: 'window.RANKING_API = "";' });
    const p = path.join(REPO, f); if (!fs.existsSync(p)) return r.fulfill({ status: 404, body: "" });
    r.fulfill({ contentType: f.endsWith(".js") ? "text/javascript" : "text/html", body: fs.readFileSync(p) }); });
  await ctx.route("https://login.xsolla.com/**", r => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await ctx.addInitScript(([s, l, inv, dev]) => { if (sessionStorage.getItem("seeded")) return; sessionStorage.setItem("seeded", 1); sessionStorage.setItem("rl_scene", "dungeon");
    localStorage.setItem("rl_device_id", dev); localStorage.setItem(`rl_notice_v4:g:${dev}`, "1"); localStorage.setItem("rl_save", s); localStorage.setItem("rl_level", l); localStorage.setItem(`rl_inv:g:${dev}`, inv);
    window.__log = []; document.addEventListener("DOMContentLoaded", () => new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => window.__log.push(n.textContent)))).observe(document.getElementById("log"), { childList: true })); },
    [sv, lv, JSON.stringify(inv), dev]);
  await page.goto(ORIGIN); await sleep(400);
  return { ctx, page, errors };
}
const sv = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("rl_save")));
try {
  // 1. v4 장비만: 내려가면 최고 층이 오름
  let { ctx, page, errors } = await open("og-a", save(10, "ogA", 10), level(10, "ogA"), { bag: [], equip: eqOf(v4), log: [], stones: 0 });
  await page.keyboard.press("ArrowRight"); await sleep(250);
  check("v4-only gear: descending raises v4 best (11)", (await page.locator("#best").innerText()) === "11" && !(await sv(page)).run.og);
  await ctx.close();

  // 2. 예전 장비를 끼고 이어 하던 판: 불러올 때 제외 표시, 내려가도 최고 층 그대로
  ({ ctx, page, errors } = await open("og-b", save(10, "ogB", 10), level(10, "ogB"), { bag: [], equip: eqOf(v4, v3), log: [], stones: 0 }));
  await page.keyboard.press("ArrowRight"); await sleep(250);
  check("old gear equipped: depth 11 but v4 best stays 10, run flagged og", (await page.locator("#depth").innerText()) === "11" && (await page.locator("#best").innerText()) === "10" && (await sv(page)).run.og === 1);
  await page.keyboard.press("i"); await sleep(150);
  check("inventory says this run is not recorded on v4 beta", (await page.locator("#inv-summary").innerText()).includes("이번 판은 예전 장비를 껴서 v4 베타 랭킹에 기록되지 않아요"));
  check("no page errors (old run)", errors.length === 0, errors.join("; "));
  await ctx.close();

  // 3. v4 판 중간에 예전 장비를 한 번 꼈다가 빼도 그 판은 제외
  ({ ctx, page, errors } = await open("og-c", save(10, "ogC", 10), level(10, "ogC"), { bag: [v3], equip: eqOf(v4), log: [], stones: 0 }));
  await page.keyboard.press("i"); await sleep(150);
  await page.locator(".bag-item", { hasText: I.itemName(v3) }).click();
  await page.getByRole("button", { name: "장착", exact: true }).click(); await sleep(150);
  const L = await page.evaluate(() => window.__log.join("\n"));
  check("equipping old gear mid-run: warning in the log", L.includes("이번 판은 v4 베타 랭킹에 기록되지 않아요"), L);
  await page.locator("#inv-equip .slot", { hasText: I.itemName(v3) }).click();
  await page.getByRole("button", { name: "해제", exact: true }).click(); await sleep(100);
  await page.keyboard.press("Escape");
  await page.keyboard.press("ArrowRight"); await sleep(250);
  check("took it off again: still excluded (best stays 10)", (await page.locator("#best").innerText()) === "10" && (await sv(page)).run.og === 1);
  await ctx.close();

  // 4. 예전 장비로 마지막 층(75) 클리어: 게임은 완료, v4 랭킹 완료는 아님
  ({ ctx, page, errors } = await open("og-d", save(75, "ogD", 40, { og: 1 }), level(75, "ogD"), { bag: [], equip: eqOf(v3), log: [], stones: 0 }));
  await page.keyboard.press("ArrowRight"); await sleep(300);
  const body = await page.locator("#notice-body").innerText();
  check("old-gear clear: lobby + notice says not recorded, not 완료", await page.evaluate(() => document.body.classList.contains("in-lobby")) && body.includes("v4 베타 랭킹에는 기록되지 않아요") && !(await sv(page)).clr && (await page.locator("#best").innerText()) === "40", body);
  check("no page errors (clear)", errors.length === 0, errors.join("; "));
  await ctx.close();
} finally { await browser.close(); }

// ---- 서버 ----
const DIR = path.dirname(new URL(import.meta.url).pathname) + "/php";
const DB = path.join(DIR, "og.sqlite"); for (const f of [DB, DB + "-wal", DB + "-shm"]) fs.rmSync(f, { force: true });
const CFG = path.join(DIR, "config.og.php");
fs.writeFileSync(CFG, `<?php\n$c = require __DIR__ . '/config.test.php';\nreturn array_merge($c, ['db_dsn' => 'sqlite:${DB}']);\n`);
const php = spawn("php", ["-S", "127.0.0.1:8098", "-t", path.join(REPO, "ranking-php")], { env: { ...process.env, RANKING_CONFIG: CFG, TEST_JWT_SECRET: "og" }, stdio: ["ignore", "ignore", "pipe"] });
let phpErr = ""; php.stderr.on("data", d => phpErr += d);
await sleep(700);
try {
  const g = (guest, body) => fetch("http://127.0.0.1:8098/api.php?r=score", { method: "POST", headers: { "Content-Type": "application/json", Origin: ORIGIN.slice(0, -1), "X-Guest-Id": guest }, body: JSON.stringify(body) }).then(r => r.json());
  const ref = (it) => ({ seed: it.seed, src: it.src, lvl: it.lvl, v: it.v, enh: 0, id: it.id, ...(it.r ? { r: it.r } : {}) });
  const board = async () => (await (await fetch("http://127.0.0.1:8098/api.php?r=ranking&type=stage", { headers: { Origin: ORIGIN.slice(0, -1) } })).json()).rows;
  await g("og-guest-aaaa", { stage: 20, plvl: 10, gear: [ref(v4)] });
  await g("og-guest-aaaa", { stage: 30, plvl: 10, gear: [ref(v4), ref(v3)] });
  await g("og-guest-bbbb", { stage: 50, plvl: 10, gear: [ref(v3)] });
  await g("og-guest-cccc", { stage: 25, plvl: 10, gear: [ref(v4), ref(v4b)] });
  const b = await board();
  check("server: v4 gear counts (20, 25); old-gear submissions ignored (30, 50)", JSON.stringify(b.map(r => r.stage)) === "[25,20]", JSON.stringify(b.map(r => [r.name, r.stage])));
  // 예전 시즌 기록과 함께 있는 사람을 admin.php로 지움
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(DB);
  db.prepare("INSERT INTO players (pkey, pub_id, kind, display, best_stage, stage_at, item_score, updated_at) VALUES ('k1', 'aaaaaaaaaaaaaaaa', 'guest', 'v3 랭커', 172, 1, -1, 1)").run();
  db.prepare("INSERT INTO players_v4 (pkey, pub_id, kind, display, best_stage, stage_at, item_score, updated_at) VALUES ('k1', 'aaaaaaaaaaaaaaaa', 'guest', 'v3 랭커', 120, 2, -1, 2)").run();
  db.close();
  const env = { ...process.env, RANKING_CONFIG: CFG };
  const adm = (...a) => execFileSync("php", [path.join(REPO, "ranking-php/admin.php"), ...a], { env }).toString();
  const list = adm("list");
  check("admin list shows v4 board with ids", list.includes("v4 베타") && list.includes("v3 랭커") && list.includes("aaaaaaaaaaaaaaaa"), list);
  const rm = adm("remove", "aaaaaaaaaaaaaaaa");
  const b2 = await board();
  const v3b = (await (await fetch("http://127.0.0.1:8098/api.php?r=ranking&type=stage&season=v3", { headers: { Origin: ORIGIN.slice(0, -1) } })).json()).rows;
  check("admin remove: gone from v4 beta, v3 beta record kept (172)", rm.includes("지웠어요") && !b2.some(r => r.name === "v3 랭커") && v3b.some(r => r.name === "v3 랭커" && r.stage === 172), rm);
  let bad = ""; try { adm("remove", "nope"); } catch (e) { bad = String(e.stderr); }
  check("admin remove: bad id refused", bad.includes("사용법"));
  const web = await fetch("http://127.0.0.1:8098/admin.php?x=list");
  check("admin.php not runnable from the web (404)", web.status === 404);
  check("no php errors", !/Fatal|Warning|Notice|Deprecated/.test(phpErr), phpErr.slice(0, 400));
} finally { php.kill(); }
const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
