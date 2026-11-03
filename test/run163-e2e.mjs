// dc#163: 마지막 몬스터를 잡으면 계단은 내 화면(시야) 안, 너무 가깝지 않은 곳(걸어서 5칸 넘게)에 — 20층이 넘는 넓은 층에서도 멀지 않게
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
const require = createRequire(process.env.NODE_PATH + "/");
const { chromium } = require("playwright");
const REPO = process.argv[2];
const ORIGIN = "https://hucksoon.github.io/hucksoon/";
const R = createRequire(import.meta.url), M = R(path.join(REPO, "monsters.js")), B = R(path.join(REPO, "blessings.js"));
const results = [];
const check = (n, ok, x = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x && !ok ? " — " + x : ""}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const HOOK = `
  window.__t = {
    // d층을 새로 만들고, 아무 몬스터 자리로 가서 이 층 몬스터를 모두 잡은 것처럼 → 계단 (마지막 몬스터는 내 옆)
    floor: (d) => { depth = d; newLevel(generateDungeon()); const far = enemies.filter(e => e.hp > 0)[3] || enemies[0];
      if (far) { player.x = far.x; player.y = far.y; }
      enemies = []; floorSt.open = false; floorSt.boss = true; computeFOV(); render();
      const last = { x: player.x + 1, y: player.y }; floorProgress(last); render();
      const D = Array.from({ length: MAP_H }, () => new Array(MAP_W).fill(-1)), q = [[player.x, player.y]]; D[player.y][player.x] = 0; let max = 0;
      for (let i = 0; i < q.length; i++) { const [x, y] = q[i]; for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H || D[ny][nx] >= 0 || map[ny][nx] === WALL) continue; D[ny][nx] = D[y][x] + 1; max = Math.max(max, D[ny][nx]); q.push([nx, ny]); } }
      const st = floorSt.stairs, cam = camera();
      const on = st && st.x >= cam.x / TILE && st.x < cam.x / TILE + CAM_W && st.y >= cam.y / TILE && st.y < cam.y / TILE + CAM_H;
      return { d, w: MAP_W, h: MAP_H, open: floorSt.open, st, walk: st ? D[st.y][st.x] : -1, max, on, vis: !!(st && visible[st.y][st.x]), arrow: drawStairsArrow(cam), tile: st ? map[st.y][st.x] === STAIRS : false };
    },
  };
  // ---- 시작 ----`;
const EXE = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const browser = await chromium.launch({ executablePath: EXE });
async function open(storage) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 } }); const page = await ctx.newPage(); const errors = [];
  page.on("pageerror", e => errors.push(e.message)); page.on("dialog", d => d.accept());
  await ctx.route(ORIGIN + "**", r => { const f = new URL(r.request().url()).pathname.replace("/hucksoon/", "") || "index.html";
    if (f === "ranking-config.js") return r.fulfill({ contentType: "text/javascript", body: `window.RANKING_API = "";` });
    const p = path.join(REPO, f); if (!fs.existsSync(p)) return r.fulfill({ status: 404, body: "" });
    let body = fs.readFileSync(p); if (f === "index.html") body = body.toString("utf8").replace("  // ---- 시작 ----", HOOK);
    r.fulfill({ contentType: f.endsWith(".js") ? "text/javascript" : f.endsWith(".png") ? "image/png" : f.endsWith(".webp") ? "image/webp" : "text/html", body }); });
  await ctx.addInitScript((s) => { if (!sessionStorage.getItem("s")) { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); sessionStorage.setItem("rl_scene", "dungeon"); sessionStorage.setItem("s", 1); } }, storage);
  await page.goto(ORIGIN);
  await page.waitForFunction(() => window.__t);
  await sleep(400);
  return { ctx, page, errors };
}
const save = (run = {}) => JSON.stringify({ v: 1, best: 12, run: { d: 8, hp: 1000, mh: 1000, a: 40, g: 0, l: 5, x: 0, xn: 5000, x4: 1, rid: "r163", k: 0, pp: 0, ...run } });
const T = (page, fn, ...a) => page.evaluate(([f, a]) => window.__t[f](...a), [fn, a]);
const BASE = { rl_oldtown: "off", rl_bless: "off", rl_autogear: "1", rl_market: "paused", rl_device_id: "r163-dev", rl_3d: "0", rl_live: "1", rl_tut: JSON.stringify(["intro"]), rl_tip_dodge: "1" };

try {
  const A = await open({ ...BASE, rl_save: save({ d: 30, l: 30 }) });
  const rs = [];
  for (const d of [22, 30, 30, 40, 45, 50]) rs.push(await T(A.page, "floor", d));
  const big = rs.filter(r => r.max > 30);
  check(`wide floors (${rs.map(r => r.w + "×" + r.h).join(", ")}): stairs opened on every floor`, rs.every(r => r.open && r.st && r.tile), JSON.stringify(rs));
  check(`stairs on screen every time (walk ${rs.map(r => r.walk).join(", ")} of farthest ${rs.map(r => r.max).join(", ")})`, rs.every(r => r.on), JSON.stringify(rs));
  check("stairs not too close: at least 5 tiles walk", rs.every(r => r.walk >= 5), JSON.stringify(rs.map(r => r.walk)));
  check("stairs in sight (a tile I can see now) when possible", rs.filter(r => r.vis).length >= rs.length - 1, JSON.stringify(rs.map(r => r.vis)));
  check("on screen → no edge arrow needed", rs.every(r => !r.arrow));
  check(`much nearer than before on wide floors (old rule: ≥60% of farthest)`, big.length > 0 && big.every(r => r.walk < Math.round(r.max * 0.6)), JSON.stringify(big.map(r => [r.walk, r.max])));
  check("no page errors", A.errors.length === 0, A.errors.join("; "));
  await A.ctx.close();
} finally { await browser.close(); }
const pass = results.filter(Boolean).length;
console.log(`\n${pass} passed, ${results.length - pass} failed`);
process.exit(pass === results.length ? 0 : 1);
