// 지도 겹쳐 보기 · 화면 밀기 · 칸 눌러 자동 걷기 (dc#92)
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
const require = createRequire(process.env.NODE_PATH + "/");
const { chromium, devices } = require("playwright");
const REPO = process.argv[2], SHOTS = process.argv[3];
const I = createRequire(import.meta.url)(path.join(REPO, "items.js"));
const M = createRequire(import.meta.url)(path.join(REPO, "monsters.js"));
const ORIGIN = "https://hucksoon.github.io/hucksoon/";
const results = [];
const check = (n, ok, x = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x ? " — " + x : ""}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const DEV = "bbbb2222-0000-4000-8000-00000000cafe";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
async function open(storage = {}, { opts = { viewport: { width: 1100, height: 950 } } } = {}) {
  const ctx = await browser.newContext(opts); const page = await ctx.newPage(); const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await ctx.route(ORIGIN + "**", r => { const f = new URL(r.request().url()).pathname.replace("/hucksoon/", "") || "index.html";
    if (f === "ranking-config.js") return r.fulfill({ contentType: "text/javascript", body: `window.RANKING_API = "";` });
    const p = path.join(REPO, f); if (!fs.existsSync(p)) return r.fulfill({ status: 404, body: "" });
    r.fulfill({ contentType: { ".js": "text/javascript", ".png": "image/png", ".webp": "image/webp" }[path.extname(f)] || "text/html", body: fs.readFileSync(p) }); });
  await ctx.addInitScript(([s, dev]) => { if (sessionStorage.getItem("s")) return; sessionStorage.setItem("s", 1);
    localStorage.setItem("rl_device_id", dev); localStorage.setItem("rl_tips", JSON.stringify(["intro", "dungeon", "gear", "lowhp"]));
    for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); sessionStorage.setItem("rl_scene", "dungeon"); }, [storage, DEV]);
  await page.goto(ORIGIN); await sleep(700);
  return { ctx, page, errors };
}
// 지도: 바깥 벽, x=14 세로 벽(y 13 아래만 열림), 계단 (22,12). 가까이 보기라 화면에 보이는 칸(나를 가운데로 16×12칸)만 누름
const W = 32, H = 24;
function level(enemies = [], { unseen = [], start = [10, 8] } = {}) {
  const m = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => (x === 0 || y === 0 || x === W - 1 || y === H - 1 ? 0 : 1)));
  for (let y = 1; y < 13; y++) m[y][14] = 0;
  m[12][22] = 2;
  const seen = Array.from({ length: W * H }, (_, i) => (unseen.includes(i) ? "0" : "1")).join("");
  return JSON.stringify({ rid: "wk", d: 3, turn: 1, map: m.map(r => r.join("")).join(""), seen, px: start[0], py: start[1], shop: null, enemies, items: [] });
}
const save = JSON.stringify({ v: 1, season: 4, best: 30, run: { d: 3, hp: 5000, mh: 5000, a: 200, g: 0, p: 1, l: 30, x: 0, xn: 1e9, rid: "wk", k: 0, pp: 0 } });
const inv = JSON.stringify({ bag: [], equip: Object.fromEntries(I.EQUIP_SLOTS.map(s => [s, null])), log: [], stones: 0 });
const pos = (page) => page.evaluate(() => { const L = JSON.parse(localStorage.getItem("rl_level")); return { x: L.px, y: L.py, enemies: L.enemies }; });
const tap = async (page, x, y) => { const p = await page.evaluate(([x, y]) => window.RLWalk.screenOf(x, y), [x, y]); await page.mouse.click(p.x, p.y); };
const waitIdle = async (page, ms = 8000) => { const end = Date.now() + ms; await sleep(150); while (Date.now() < end && await page.evaluate(() => window.RLWalk.active())) await sleep(100); await sleep(150); };
const canvasHash = (page) => page.evaluate(() => { const d = document.getElementById("game").getContext("2d").getImageData(0, 0, 640, 480).data; let h = 0; for (let i = 0; i < d.length; i += 97) h = (h * 31 + d[i]) >>> 0; return h; });
const mob = (x, y, extra = {}) => ({ ...M.makeMonster(M.MONSTERS.find(m => m.id === "rat"), "normal", 3), x, y, hp: 1e6, maxHp: 1e6, atk: 0, ...extra });

try {
  // ---- 칸 클릭: 길을 찾아 자동으로 걸어감 (벽을 돌아서) ----
  let o = await open({ rl_save: save, rl_level: level(), ["rl_inv:g:" + DEV]: inv });
  await tap(o.page, 17, 8);   // x=14 벽 너머: 아래로 돌아가야 함
  await waitIdle(o.page);
  let p = await pos(o.page);
  check("click a far tile behind a wall: walks around it and arrives", p.x === 17 && p.y === 8, JSON.stringify(p));
  // 계단을 누르면 거기까지 걸어가 다음 층
  await tap(o.page, 22, 12); await waitIdle(o.page);
  check("click the stairs: walks there and goes down a floor", (await o.page.locator("#depth").innerText()) === "4");
  check("click-walk: no page errors", o.errors.length === 0, o.errors.join("; "));
  await o.ctx.close();

  // ---- 가 본 적 없는 칸·벽은 무시, 키를 누르면 멈춤 ----
  o = await open({ rl_save: save, rl_level: level([], { unseen: [5 * W + 25] }), ["rl_inv:g:" + DEV]: inv });
  await tap(o.page, 25, 5); await sleep(300);
  check("unexplored tile: does nothing", (await pos(o.page)).x === 10 && !(await o.page.evaluate(() => window.RLWalk.active())));
  await tap(o.page, 14, 5); await sleep(300);
  check("wall tile: does nothing", (await pos(o.page)).x === 10);
  await tap(o.page, 10, 13); await sleep(300);
  await o.page.keyboard.press("ArrowLeft"); await sleep(400);
  p = await pos(o.page);
  check("a key press stops the auto-walk", !(await o.page.evaluate(() => window.RLWalk.active())) && p.y > 8 && p.y < 13 && p.x === 9, JSON.stringify(p));
  await o.ctx.close();

  // ---- 몬스터를 누르면 옆까지 가서 공격, 새 몬스터가 보이면 멈춤 ----
  o = await open({ rl_save: save, rl_level: level([mob(10, 12)]), ["rl_inv:g:" + DEV]: inv });
  await tap(o.page, 10, 12); await waitIdle(o.page);
  p = await pos(o.page);
  check("click a monster: follows it, ends next to it and attacks", Math.abs(p.x - p.enemies[0].x) + Math.abs(p.y - p.enemies[0].y) === 1 && p.enemies[0].hp < 1e6, JSON.stringify({ x: p.x, y: p.y, m: [p.enemies[0].x, p.enemies[0].y], hp: p.enemies[0].hp }));
  await o.ctx.close();
  o = await open({ rl_save: save, rl_level: level([mob(9, 14)], { start: [4, 8] }), ["rl_inv:g:" + DEV]: inv });
  await tap(o.page, 4, 13); await waitIdle(o.page);
  p = await pos(o.page);
  check("a monster coming into sight stops the walk before arriving", p.x === 4 && p.y > 8 && p.y < 13 && !(await o.page.evaluate(() => window.RLWalk.active())), JSON.stringify({ x: p.x, y: p.y }));
  await o.ctx.close();

  // ---- 지도 겹쳐 보기: Tab ----
  o = await open({ rl_save: save, rl_level: level(), ["rl_inv:g:" + DEV]: inv });
  const h0 = await canvasHash(o.page);
  await o.page.keyboard.press("Tab"); await sleep(200);
  check("Tab: map overlay on (whole explored map drawn over the game)", await o.page.evaluate(() => window.RLWalk.overlay()) && (await canvasHash(o.page)) !== h0);
  await o.page.screenshot({ path: path.join(SHOTS, "walk-overlay.png") });
  await o.page.keyboard.press("ArrowDown"); await sleep(250);
  check("overlay stays on while playing", await o.page.evaluate(() => window.RLWalk.overlay()));
  await o.page.reload(); await sleep(700);
  check("overlay remembered after reload", await o.page.evaluate(() => window.RLWalk.overlay()));
  await o.page.keyboard.press("Tab"); await sleep(150);
  check("Tab again: overlay off", !(await o.page.evaluate(() => window.RLWalk.overlay())));
  check("overlay: no page errors", o.errors.length === 0, o.errors.join("; "));
  await o.ctx.close();

  // ---- 휴대폰: 화면 밀기, 누르고 있으면 계속, 지도 버튼 ----
  o = await open({ rl_save: save, rl_level: level(), ["rl_inv:g:" + DEV]: inv }, { opts: { ...devices["iPhone 13"] } });
  const swipe = (dx, dy, holdMs = 0) => o.page.evaluate(async ([dx, dy, holdMs]) => {
    const c = document.getElementById("game"), r = c.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    const ev = (type, cx, cy) => c.dispatchEvent(new PointerEvent(type, { pointerId: 7, bubbles: true, clientX: cx, clientY: cy, pointerType: "touch", isPrimary: true }));
    ev("pointerdown", x, y); ev("pointermove", x + dx / 2, y + dy / 2); ev("pointermove", x + dx, y + dy);
    await new Promise(r => setTimeout(r, holdMs || 30)); ev("pointerup", x + dx, y + dy);
  }, [dx, dy, holdMs]);
  let q = await pos(o.page);
  await swipe(60, 0); await sleep(250);
  p = await pos(o.page);
  check("phone: swipe right → one tile right", p.x === q.x + 1 && p.y === q.y, JSON.stringify([q, p]));
  q = p;
  await swipe(0, 60, 1000); await sleep(250);
  p = await pos(o.page);
  check("phone: swipe down and hold → keeps walking down", p.y >= q.y + 3 && p.x === q.x, JSON.stringify([q, p]));
  const tapAt = async (x, y) => { const s = await o.page.evaluate(([x, y]) => window.RLWalk.screenOf(x, y), [x, y]); await o.page.touchscreen.tap(s.x, s.y); };
  await tapAt(p.x - 3, p.y); await waitIdle(o.page);
  check("phone: tap a tile → walks there", (await pos(o.page)).x === p.x - 3);
  check("phone dungeon: 지도 button in the menu row", await o.page.locator("#tp-map").isVisible() && (await o.page.locator("#tp-map").innerText()) === "지도");
  await o.page.locator("#tp-map").tap(); await sleep(200);
  check("phone: 지도 button toggles the overlay (pressed look)", await o.page.evaluate(() => window.RLWalk.overlay()) && await o.page.locator("#tp-map").evaluate(b => b.classList.contains("on")));
  check("phone: no horizontal overflow", await o.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && [...document.querySelectorAll("#touch-pad button")].every(b => !b.offsetParent || b.getBoundingClientRect().right <= innerWidth)));
  await o.page.locator("#touch-pad").scrollIntoViewIfNeeded(); await o.page.screenshot({ path: path.join(SHOTS, "walk-phone.png") });
  check("phone: no page errors", o.errors.length === 0, o.errors.join("; "));
  await o.ctx.close();

  // ---- 처음 안내 말풍선에 밀기·누르기·지도 ----
  o = await (async () => { const ctx = await browser.newContext({ viewport: { width: 1100, height: 950 } }); const page = await ctx.newPage(); const errors = []; page.on("pageerror", e => errors.push(e.message));
    await ctx.route(ORIGIN + "**", r => { const f = new URL(r.request().url()).pathname.replace("/hucksoon/", "") || "index.html";
      if (f === "ranking-config.js") return r.fulfill({ contentType: "text/javascript", body: `window.RANKING_API = "";` });
      const p = path.join(REPO, f); if (!fs.existsSync(p)) return r.fulfill({ status: 404, body: "" });
      r.fulfill({ contentType: { ".js": "text/javascript", ".png": "image/png" }[path.extname(f)] || "text/html", body: fs.readFileSync(p) }); });
    await page.goto(ORIGIN); await sleep(700); return { ctx, page, errors }; })();
  const intro = await o.page.locator("#tip-text").innerText();
  // 튜토리얼은 하나씩 (dc#97): 걷기·Tab 지도는 ② 던전 탐험의 단계
  check("tutorial starts with ① (town); click-to-walk and the Tab map are steps of ②", intro.includes("① 던전에 들어가기"), intro);
  await o.page.keyboard.press("Tab"); await sleep(200);
  check("Tab in the town: focus stays on the game (doesn't jump to the menu), note that the map is for the dungeon",
    await o.page.evaluate(() => document.activeElement === document.body) && (await o.page.locator("#log").innerText()).includes("지도 겹쳐 보기(Tab)는 던전에서 써요"));
  await o.ctx.close();
} finally {
  await browser.close();
}
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
