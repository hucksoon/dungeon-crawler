// 점프 (dc#81): J(휴대폰은 점프 버튼) + 방향 → 2칸. 가운데 몬스터·아이템은 넘고 벽은 못 넘음, 내려설 칸이 비어 있어야 함
// 한 턴을 쓰고 쿨타임 5턴 (저장됨), 취소(J·Esc), 공중에서는 높이 떠서 그림자, 동작 줄이기면 바로 착지
import { createRequire } from "node:module";
import fs from "node:fs"; import path from "node:path";
const require = createRequire(process.env.NODE_PATH + "/");
const { chromium, devices } = require("playwright");
const REPO = process.argv[2], OUT = process.argv[3];
const M = createRequire(import.meta.url)(path.join(REPO, "monsters.js"));
const ORIGIN = "https://game.apacimtest.com/";
const results = []; const check = (n, ok, x = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x && !ok ? " — " + x : ""}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const MAP_W = 32, MAP_H = 24, D = 12;
const map = Array.from({ length: MAP_H }, (_, y) => Array.from({ length: MAP_W }, (_, x) => (x < 2 || y < 2 || x > 14 || y > 10 ? 0 : 1)));
const mob = (x, y, extra = {}) => ({ x, y, ...M.makeMonster(M.MONSTERS.find(m => m.id === "orc"), "normal", D), hp: 1e9, maxHp: 1e9, atk: 0, ...extra });
const level = ({ px = 5, py = 5, enemies = [], items = [] } = {}) => JSON.stringify({ rid: "jump-run", d: D, turn: 3, map: map.map(r => r.join("")).join(""), seen: "1".repeat(MAP_W * MAP_H), px, py, shop: null, enemies, items });
const save = (run = {}) => JSON.stringify({ v: 1, best: D, run: { d: D, hp: 1e6, mh: 1e6, a: 5, g: 10, p: 0, l: 5, x: 0, xn: 1e9, rid: "jump-run", k: 0, pp: 0, ...run } });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
async function open(lv, { opts = { viewport: { width: 1100, height: 1000 } }, sv = save() } = {}) {
  const ctx = await browser.newContext(opts); const page = await ctx.newPage(); const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await ctx.route(ORIGIN + "**", r => { const f = new URL(r.request().url()).pathname.slice(1) || "index.html";
    if (f === "ranking-config.js") return r.fulfill({ contentType: "text/javascript", body: 'window.RANKING_API = "";' });
    const p = path.join(REPO, f); if (!fs.existsSync(p)) return r.fulfill({ status: 404, body: "" });
    r.fulfill({ contentType: { ".js": "text/javascript", ".png": "image/png", ".webp": "image/webp" }[path.extname(f)] || "text/html", body: fs.readFileSync(p) }); });
  await ctx.route("https://login.xsolla.com/**", r => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await ctx.addInitScript(([s, l]) => { if (sessionStorage.getItem("seeded")) return; sessionStorage.setItem("seeded", 1); sessionStorage.setItem("rl_scene", "dungeon");
    localStorage.setItem("rl_device_id", "jump-dev-0001"); localStorage.setItem("rl_save", s); localStorage.setItem("rl_level", l); localStorage.setItem("rl_view", "full");
    window.__log = []; document.addEventListener("DOMContentLoaded", () => new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => window.__log.push(n.textContent)))).observe(document.getElementById("log"), { childList: true })); }, [sv, lv]);
  await page.goto(ORIGIN); await sleep(800);
  return { ctx, page, errors };
}
const L = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("rl_level")));
const S = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("rl_save")));
const logs = (page) => page.evaluate(() => window.__log.join("\n"));
const press = async (page, keys) => { for (const k of keys) { await page.keyboard.press(k); await sleep(60); } };
// 살색 픽셀 무게중심 (전체 지도, 칸 = 캔버스 32px). ms 뒤에 (키를 누른 순간부터)
const skin = (page, keys = [], ms = 0) => page.evaluate(([keys, ms]) => new Promise(done => {
  for (const key of keys) window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  setTimeout(() => {
    const c = document.getElementById("game"), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    let n = 0, sx = 0, sy = 0;
    for (let i = 0; i < d.length; i += 4) { const r = d[i], g = d[i + 1], b = d[i + 2]; if (r > 180 && g > 120 && g < 200 && b > 80 && b < 170 && r > g && g > b) { n++; sx += (i / 4) % c.width; sy += Math.floor(i / 4 / c.width); } }
    done(n ? { n, x: sx / n / 32, y: sy / n / 32 } : null);   // 칸 단위
  }, ms);
}), [keys, ms]);

try {
  // ---- 몬스터 넘기 + 쿨타임 ----
  let { ctx, page, errors } = await open(level({ enemies: [mob(6, 5)], items: [{ x: 6, y: 5, type: "gold", amount: 99 }, { x: 7, y: 5, type: "gold", amount: 50 }] }));
  const g0 = (await S(page)).run.g, t0 = (await L(page)).turn;
  await press(page, ["j"]);
  check("J: asks for a direction (log) and the jump button shows aiming", (await logs(page)).includes("점프할 방향을 고르세요") && (await page.locator("#tp-jump").getAttribute("class") || "").includes("aiming"));
  await press(page, ["ArrowRight"]); await sleep(150);
  let lv = await L(page), sv = await S(page);
  check("jump right over the monster: lands 2 tiles away", lv.px === 7 && lv.py === 5, JSON.stringify([lv.px, lv.py]));
  check("one turn used, monster unhurt (jumping is not an attack)", lv.turn === t0 + 1 && lv.enemies[0].hp === 1e9, JSON.stringify([t0, lv.turn, lv.enemies[0].hp]));
  check("picks up gold on the landing tile only (not the one jumped over)", sv.run.g === g0 + 50 && lv.items.some(i => i.x === 6 && i.y === 5), JSON.stringify([g0, sv.run.g, lv.items]));
  check("cooldown saved: jc 4 after the jump turn (5-turn cooldown)", sv.run.jc === 4, JSON.stringify(sv.run.jc));
  await press(page, ["j"]);
  check("J during cooldown: refused with turns left, no aiming", (await logs(page)).includes("점프는 4턴 뒤에 다시 할 수 있다") && !((await page.locator("#tp-jump").getAttribute("class")) || "").includes("aiming"));
  await page.reload(); await sleep(800);
  check("cooldown survives reload", (await S(page)).run.jc === 4);
  // 제자리 대기 4번 (페이지 버튼에 포커스가 있어도 게임으로 가게 window에 바로 보냄)
  for (let i = 0; i < 4; i++) { await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }))); await sleep(60); }
  sv = await S(page);
  check("after 4 more turns the jump is ready again", sv.run?.jc === 0, JSON.stringify(sv).slice(0, 300));
  check("no page errors", errors.length === 0, errors.join("; "));
  await ctx.close();

  // ---- 벽·내려설 칸의 몬스터·취소 ----
  ({ ctx, page, errors } = await open(level({ px: 3, py: 5, enemies: [mob(4, 6), mob(3, 7)] })));
  let before = await L(page);
  await press(page, ["j", "ArrowLeft"]);
  lv = await L(page);
  check("wall: can't jump into the wall (stays, no turn used)", lv.px === 3 && lv.turn === before.turn && (await logs(page)).includes("벽 때문에"), JSON.stringify([lv.px, lv.turn]));
  await press(page, ["j", "ArrowDown"]);
  lv = await L(page);
  check("landing tile has a monster: refused, stays, no turn", lv.py === 5 && lv.turn === before.turn && (await logs(page)).includes("내려설 칸에 몬스터"), JSON.stringify([lv.py, lv.turn]));
  await press(page, ["j", "j", "ArrowRight"]);
  lv = await L(page);
  check("J twice cancels: the arrow is a normal 1-tile step", (await logs(page)).includes("점프를 취소했다") && lv.px === 4, JSON.stringify(lv.px));
  await press(page, ["j", "Escape", "ArrowRight"]);
  lv = await L(page);
  check("Esc cancels too", lv.px === 5, JSON.stringify(lv.px));
  await ctx.close();

  // ---- 높이 뛰는 그림: 공중(0.16초)에서는 몸이 착지 때보다 위에 ----
  ({ ctx, page, errors } = await open(level({ px: 5, py: 6 })));
  const rest = await skin(page);
  const air = await skin(page, ["j", "ArrowRight"], 160);
  await sleep(600);
  const land = await skin(page);
  check("jump arc: mid-air the body is high above the ground and between tiles, then lands 2 tiles over", rest && air && land && air.y < land.y - 0.3 && air.x > rest.x + 0.5 && air.x < land.x - 0.5 && Math.abs(land.x - rest.x - 2) < 0.2, JSON.stringify({ rest, air, land }));
  await page.screenshot({ path: path.join(OUT, "jump.png") });
  await ctx.close();

  // ---- 휴대폰: 점프 버튼 → 방향 버튼 ----
  ({ ctx, page, errors } = await open(level({ enemies: [mob(6, 5)] }), { opts: { ...devices["iPhone 13"] } }));
  await page.locator("#tp-jump").tap(); await sleep(100);
  check("phone: jump button shows the direction prompt", (await page.locator("#tp-jump").innerText()).includes("방향"));
  check("phone: touch buttons stay on screen (no overflow)", await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && [...document.querySelectorAll("#touch-pad button")].every(b => !b.offsetParent || b.getBoundingClientRect().right <= innerWidth)));
  await page.locator('#touch-pad [data-dir="1,0"]').dispatchEvent("pointerdown"); await page.locator('#touch-pad [data-dir="1,0"]').dispatchEvent("pointerup"); await sleep(200);
  lv = await L(page);
  check("phone: ▶ after the jump button jumps 2 tiles over the monster", lv.px === 7, JSON.stringify(lv.px));
  check("phone: button shows the cooldown", (await page.locator("#tp-jump").innerText()).includes("4턴"), await page.locator("#tp-jump").innerText());
  check("phone: no page errors", errors.length === 0, errors.join("; "));
  await ctx.close();

  // ---- 동작 줄이기: 바로 착지 ----
  ({ ctx, page, errors } = await open(level({ px: 5, py: 6 }), { opts: { viewport: { width: 1100, height: 1000 }, reducedMotion: "reduce" } }));
  const r0 = await skin(page), r1 = await skin(page, ["j", "ArrowRight"], 60);
  check("reduced motion: lands at once (no arc)", r0 && r1 && Math.abs(r1.x - r0.x - 2) < 0.2 && Math.abs(r1.y - r0.y) < 0.1, JSON.stringify({ r0, r1 }));
  await ctx.close();
} finally {
  await browser.close();
}
console.log(`${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
