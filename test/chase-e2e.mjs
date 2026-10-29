// 몬스터가 알아채는 거리 (dc#115): 보이는 곳에서 가로+세로 5칸 안이면 쫓아오고, 6칸이면 아직 모름
// 배회(3번에 1번 아무 쪽으로)를 빼려고 Math.random을 고정. 2D 화면에서 제자리 대기(.)로 한 턴씩
import { createRequire } from "node:module";
import fs from "node:fs"; import path from "node:path";
const require = createRequire(process.env.NODE_PATH + "/");
const { chromium } = require("playwright");
const REPO = process.argv[2], OUT = process.argv[3];
const M = createRequire(import.meta.url)(path.join(REPO, "monsters.js"));
const ORIGIN = "https://game.apacimtest.com/";
const results = []; const check = (n, ok, x = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x && !ok ? " — " + x : ""}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const MAP_W = 32, MAP_H = 24, D = 5;
// 벽 없는 넓은 방 (x 2~20, y 2~10). 플레이어는 (5, 5)
const map = Array.from({ length: MAP_H }, (_, y) => Array.from({ length: MAP_W }, (_, x) => (x < 2 || y < 2 || x > 20 || y > 10 ? 0 : 1)));
const mob = (x, y) => ({ x, y, ...M.makeMonster(M.MONSTERS.find(m => m.id === "rat"), "normal", D) });
const level = (enemies) => JSON.stringify({ rid: "chase-run", d: D, turn: 3, map: map.map(r => r.join("")).join(""), seen: "1".repeat(MAP_W * MAP_H), px: 5, py: 5, shop: null, enemies, items: [] });
const save = JSON.stringify({ v: 1, f50: 1, best: D, run: { d: D, hp: 1e6, mh: 1e6, a: 5, g: 10, p: 0, l: 5, x: 0, xn: 1e9, rid: "chase-run", k: 0, pp: 0 } });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
async function open(enemies) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 1000 } });
  const page = await ctx.newPage(); const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await ctx.route(ORIGIN + "**", r => { const f = new URL(r.request().url()).pathname.slice(1) || "index.html";
    if (f === "ranking-config.js") return r.fulfill({ contentType: "text/javascript", body: 'window.RANKING_API = "";' });
    const p = path.join(REPO, f); if (!fs.existsSync(p)) return r.fulfill({ status: 404, body: "" });
    r.fulfill({ contentType: { ".js": "text/javascript", ".png": "image/png", ".webp": "image/webp" }[path.extname(f)] || "text/html", body: fs.readFileSync(p) }); });
  await ctx.route("https://login.xsolla.com/**", r => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await ctx.addInitScript(([s, l]) => { Math.random = () => 0.95;   // rnd(3) = 2: 배회하지 않음
    if (sessionStorage.getItem("seeded")) return; sessionStorage.setItem("seeded", 1); sessionStorage.setItem("rl_scene", "dungeon");
    localStorage.setItem("rl_device_id", "chase-dev-0001"); localStorage.setItem("rl_save", s); localStorage.setItem("rl_level", l); }, [save, level(enemies)]);
  await page.goto(ORIGIN); await sleep(900);
  return { ctx, page, errors };
}
const lvl = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("rl_level")));
const gap = (L, i = 0) => Math.abs(L.enemies[i].x - L.px) + Math.abs(L.enemies[i].y - L.py);
try {
  // 5칸 (가로 3 + 세로 2): 알아채고 한 칸 다가옴
  let o = await open([mob(8, 7)]);
  await o.page.keyboard.press("."); await sleep(300);
  let L = await lvl(o.page);
  check("5 tiles away (in sight): notices you and steps closer (5 → 4)", L.turn === 4 && gap(L) === 4, JSON.stringify([L.turn, L.enemies[0].x, L.enemies[0].y]));
  check("no page errors (5)", o.errors.length === 0, o.errors.join("; "));
  await o.ctx.close();
  // 6칸: 아직 모름 (예전에는 6칸부터 쫓아옴)
  o = await open([mob(11, 5)]);
  for (let k = 0; k < 3; k++) { await o.page.keyboard.press("."); await sleep(200); }
  L = await lvl(o.page);
  check("6 tiles away: does not notice you (stays 6 for 3 turns)", L.turn === 6 && gap(L) === 6, JSON.stringify([L.turn, L.enemies[0].x, L.enemies[0].y]));
  // 내가 한 칸 다가가면 5칸 → 쫓아옴
  await o.page.keyboard.press("ArrowRight"); await sleep(300);
  L = await lvl(o.page);
  check("step toward it (6 → 5): it notices and closes in (→ 4)", L.px === 6 && gap(L) === 4, JSON.stringify([L.px, L.enemies[0].x, L.enemies[0].y]));
  check("no page errors (6)", o.errors.length === 0, o.errors.join("; "));
  await o.ctx.close();
} finally { await browser.close(); }
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
