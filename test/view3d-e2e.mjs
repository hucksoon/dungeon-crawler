// 3D 화면 (dc#109, 시험판): 1인칭 3D로 그리고, 턴을 기다리지 않고 시간이 흐름. 규칙(줍기·싸움·계단·저장)은 원래 코드 그대로
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
const require = createRequire(process.env.NODE_PATH + "/");
const { chromium } = require("playwright");
const REPO = process.argv[2], SHOTS = process.argv[3];
const I = createRequire(import.meta.url)(path.join(REPO, "items.js"));
const M = createRequire(import.meta.url)(path.join(REPO, "monsters.js"));
const ORIGIN = "https://hucksoon.github.io/hucksoon/";
const results = [];
const check = (n, ok, x = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x ? " — " + x : ""}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const DEV = "bbbb2222-0000-4000-8000-00000000cafe";
// 헤드리스에서도 WebGL (SwiftShader)
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
async function open(storage = {}, { scene = "dungeon", d3 = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 950 }, locale: "ko-KR" }); const page = await ctx.newPage(); const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await ctx.route(ORIGIN + "**", r => { const f = new URL(r.request().url()).pathname.replace("/hucksoon/", "") || "index.html";
    if (f === "ranking-config.js") return r.fulfill({ contentType: "text/javascript", body: `window.RANKING_API = "";` });
    const p = path.join(REPO, f); if (!fs.existsSync(p)) return r.fulfill({ status: 404, body: "" });
    r.fulfill({ contentType: { ".js": "text/javascript", ".png": "image/png", ".webp": "image/webp" }[path.extname(f)] || "text/html", body: fs.readFileSync(p) }); });
  await ctx.addInitScript(([s, dev, scene, d3]) => { if (sessionStorage.getItem("s")) return; sessionStorage.setItem("s", 1);
    localStorage.setItem("rl_device_id", dev); localStorage.setItem("rl_lang", "ko"); localStorage.setItem("rl_tips", JSON.stringify(["intro", "dungeon", "gear", "lowhp"]));
    if (d3) localStorage.setItem("rl_3d", "1");
    for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); sessionStorage.setItem("rl_scene", scene); }, [storage, DEV, scene, d3]);
  await page.goto(ORIGIN);
  if (d3) await page.waitForFunction(() => window.RLView3D?.active(), null, { timeout: 15000 }).catch(() => {});
  else await sleep(700);
  await sleep(300);
  return { ctx, page, errors };
}
// 지도: 바깥 벽, 가운데 넓은 방. x=20 세로 벽(아래쪽 y≥14만 열림), 계단 (28,20)
const W = 32, H = 24;
function level({ enemies = [], items = [], start = [8, 8], turn = 1 } = {}) {
  const m = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => (x === 0 || y === 0 || x === W - 1 || y === H - 1 ? 0 : 1)));
  for (let y = 1; y < 14; y++) m[y][20] = 0;
  m[20][28] = 2;
  return JSON.stringify({ rid: "v3d", d: 3, turn, map: m.map(r => r.join("")).join(""), seen: "1".repeat(W * H), px: start[0], py: start[1], shop: null, enemies, items });
}
const save = JSON.stringify({ v: 1, f50: 1, season: 4, best: 30, run: { d: 3, hp: 5000, mh: 5000, a: 200, g: 0, p: 1, l: 30, x: 0, xn: 1e9, rid: "v3d", k: 0, pp: 0 } });
const inv = JSON.stringify({ bag: [], equip: Object.fromEntries(I.EQUIP_SLOTS.map(s => [s, null])), log: [], stones: 0 });
const mob = (x, y, extra = {}) => ({ ...M.makeMonster(M.MONSTERS.find(m => m.id === "rat"), "normal", 3), x, y, hp: 1e6, maxHp: 1e6, atk: 0, ...extra });
const lvl = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("rl_level")));
const st = (page) => page.evaluate(() => ({ ...window.RLView3D.pos, active: window.RLView3D.active() }));
const hold = async (page, key, ms) => { await page.keyboard.down(key); await sleep(ms); await page.keyboard.up(key); };
// 3D 캔버스가 실제로 그려졌는지: 2D 캔버스에 옮겨 밝은 점 수를 셈
const lit = (page) => page.evaluate(() => { const c = document.getElementById("game3d"), t = document.createElement("canvas"); t.width = 160; t.height = 120; const g = t.getContext("2d"); g.drawImage(c, 0, 0, 160, 120); const d = g.getImageData(0, 0, 160, 120).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 60) n++; return n; });
const E = Math.PI / 2, WEST = -Math.PI / 2;
const store = (lv) => ({ rl_save: save, rl_level: lv, ["rl_inv:g:" + DEV]: inv });

try {
  // ---- 꺼져 있으면 2D 그대로 ----
  let o = await open(store(level()), { d3: false });
  check("off by default: 2D canvas, no 3D canvas, button says 3D 화면 (V)", await o.page.locator("#game").isVisible() && !(await o.page.locator("#game3d").count()) && (await o.page.locator("#view3d-btn").innerText()) === "3D 화면 (V)");
  check("off: three.js isn't downloaded", !(await o.page.evaluate(() => performance.getEntriesByType("resource").some(r => r.name.includes("three.module")))));
  // V로 켜기
  await o.page.keyboard.press("v");
  await o.page.waitForFunction(() => window.RLView3D.active(), null, { timeout: 15000 }).catch(() => {});
  await sleep(400);
  check("V → 3D: 3D canvas shown, 2D canvas hidden, button says 2D 화면 (V), saved on this device", await o.page.locator("#game3d").isVisible() && !(await o.page.locator("#game").isVisible()) && (await o.page.locator("#view3d-btn").innerText()) === "2D 화면 (V)" && await o.page.evaluate(() => localStorage.getItem("rl_3d") === "1"));
  { const n = await lit(o.page); check("3D canvas actually draws the lit room (WebGL)", n > 400, String(n)); }
  await o.page.keyboard.press("v"); await sleep(300);
  check("V again → back to 2D (setting removed)", await o.page.locator("#game").isVisible() && !(await o.page.locator("#game3d").isVisible()) && await o.page.evaluate(() => localStorage.getItem("rl_3d") === null));
  check("no page errors (toggle)", !o.errors.length, o.errors.join(" | "));
  await o.ctx.close();

  // ---- 걷기: 칸 안에서 자유롭게, 다른 칸에 들어서면 그 칸에 도착 (줍기). 벽에 막힘 ----
  o = await open(store(level({ items: [{ x: 10, y: 8, type: "gold", amount: 77 }] })));
  check("3D on at load (saved setting)", (await st(o.page)).active);
  await o.page.evaluate((a) => window.RLView3D.look(a), E);
  const g0 = await o.page.evaluate(() => Number(document.getElementById("gold").textContent.replace(/,/g, "")));
  await hold(o.page, "w", 1100);
  let p = await st(o.page), L = await lvl(o.page);
  check("hold W facing east: moves smoothly ~2.6 tiles/s, the game's tile follows (px ≥ 10)", p.x > 10.5 && L.px >= 10 && L.py === 8, JSON.stringify({ x: p.x, px: L.px }));
  check("walking onto gold picks it up (원래 줍기 규칙)", await o.page.evaluate(() => Number(document.getElementById("gold").textContent.replace(/,/g, ""))) === g0 + 77 && !L.items.length);
  await hold(o.page, "w", 4000);
  p = await st(o.page); L = await lvl(o.page);
  check("wall stops you (x=20 wall: stays left of it)", p.x < 20 - 0.2 && L.px === 19, JSON.stringify({ x: p.x, px: L.px }));
  await o.page.evaluate(() => window.RLView3D.look(Math.PI));   // 남쪽
  await hold(o.page, "d", 600);   // 옆걸음 (남쪽을 보면 D = 서쪽)
  const p2 = await st(o.page);
  check("A·D strafe sideways (facing south, D goes west)", p2.x < p.x - 0.8 && Math.abs(p2.y - p.y) < 0.05, JSON.stringify([p.x, p2.x]));
  check("no page errors (walk)", !o.errors.length, o.errors.join(" | "));
  await o.ctx.close();

  // ---- 시간이 흐름: 아무것도 안 해도 턴이 지나고, 몬스터가 다가옴. 창이 열리면 멈춤 ----
  o = await open(store(level({ enemies: [mob(12, 8, { atk: 1 })] })));
  const t0 = (await lvl(o.page)).turn;
  await sleep(2600);
  L = await lvl(o.page);
  check("turns pass on their own (0.6 s per turn)", L.turn - t0 >= 3 && L.turn - t0 <= 6, `${t0} → ${L.turn}`);
  check("monster walks up to you in real time (now next to you)", Math.abs(L.enemies[0].x - L.px) + Math.abs(L.enemies[0].y - L.py) === 1, JSON.stringify([L.enemies[0].x, L.enemies[0].y, L.px, L.py]));
  await o.page.keyboard.press("i"); await sleep(300);
  const tA = (await lvl(o.page)).turn; await sleep(1500); const tB = (await lvl(o.page)).turn;
  check("inventory open → time stops", tA === tB, `${tA} → ${tB}`);
  await o.page.keyboard.press("Escape"); await sleep(1300);
  check("closed → time moves again", (await lvl(o.page)).turn > tB);
  check("no page errors (time)", !o.errors.length, o.errors.join(" | "));
  await o.ctx.close();

  // ---- 공격: 앞의 몬스터 / 뒤에 붙은 몬스터는 돌아서 때림, 한 턴에 한 번 ----
  o = await open(store(level({ enemies: [mob(9, 8, { hp: 1, maxHp: 400 }), mob(7, 8, { hp: 3000, maxHp: 4000 })] })));
  await o.page.evaluate((a) => window.RLView3D.look(a), E);
  await o.page.keyboard.press("Space"); await sleep(250);
  L = await lvl(o.page);
  check("Space hits the monster in front (east) — it falls", !L.enemies.some(e => e.x === 9 && e.y === 8) && (await o.page.locator("#log").innerText()).includes("처치"));
  await o.page.keyboard.press("Space"); await sleep(100);
  const hp1 = (await lvl(o.page)).enemies.find(e => e.x === 7)?.hp;
  check("one swing per turn (pressing again right away does nothing)", hp1 === 3000, String(hp1));
  await sleep(700);
  await o.page.keyboard.press("Space"); await sleep(500);
  p = await st(o.page);
  const hp2 = (await lvl(o.page)).enemies.find(e => e.x === 7 && e.y === 8)?.hp;
  check("monster behind you (west): turns around and hits it", hp2 < 3000 && Math.abs(Math.atan2(Math.sin(p.yaw - WEST), Math.cos(p.yaw - WEST))) < 0.2, JSON.stringify({ hp2, yaw: p.yaw }));
  const pop = await o.page.evaluate(() => { const d = [...document.querySelectorAll("#popups .dmg")].pop(); const c = document.getElementById("game3d").getBoundingClientRect(); if (!d) return null; const r = d.getBoundingClientRect(); return { x: r.left - c.left, y: r.top - c.top, w: c.width, h: c.height }; });
  check("damage number shows on the 3D screen (over the monster)", !!pop && pop.x > 0 && pop.x < pop.w && pop.y > 0 && pop.y < pop.h, JSON.stringify(pop));
  await o.page.locator("#stage").screenshot({ path: path.join(SHOTS, "view3d-fight.png") });
  check("no page errors (attack)", !o.errors.length, o.errors.join(" | "));
  await o.ctx.close();

  // ---- 계단: 밟으면 원래처럼 다음 층, 3D도 새 층으로 ----
  o = await open(store(level({ start: [26, 20] })));
  await o.page.evaluate((a) => window.RLView3D.look(a), E);
  const d0 = (await lvl(o.page)).d;
  await hold(o.page, "w", 1300);
  await sleep(600);
  L = await lvl(o.page); p = await st(o.page);
  check("walk onto the stairs → next floor (new map), 3D stands on the new start tile", L.d === d0 + 1 && L.rid !== "v3d-x" && Math.floor(p.x) === L.px && Math.floor(p.y) === L.py, JSON.stringify({ d: L.d, px: L.px, py: L.py, x: p.x, y: p.y }));
  check("new floor is drawn (lit)", (await lit(o.page)) > 500);
  check("no page errors (stairs)", !o.errors.length, o.errors.join(" | "));
  await o.ctx.close();

  // ---- 마을은 그대로 옆에서 보는 2D ----
  o = await open(store(level()), { scene: "lobby" });
  check("lobby stays 2D (town canvas) even with 3D on", await o.page.locator("#game").isVisible() && !(await o.page.locator("#game3d").isVisible()));
  check("no page errors (lobby)", !o.errors.length, o.errors.join(" | "));
  await o.ctx.close();
} finally { await browser.close(); }
const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
