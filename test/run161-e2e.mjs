// dc#161: 실시간 2D에서 더 자유롭게 걷기 — 옆으로 비켜 선 자리가 칸 가운데로 되돌아가지 않음, 벽 모서리에만 비켜 가기,
//   걷기 3.5칸/초, 걷는 모습은 낮고 느긋하게(서서히 켜지고 꺼짐)
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
    // 넓은 빈 마당 (내 둘레 9×9 바닥), wall: 벽으로 바꿀 칸 [[dx, dy], ...]
    yard: (walls = []) => { depth = 8; enemies = []; items = []; shots = []; floorSt.sc = 999; floorSt.sg = 0; shop = null;
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const x = player.x + dx, y = player.y + dy; if (map[y]?.[x] !== undefined) { map[y][x] = FLOOR; visible[y][x] = true; seen[y][x] = true; } }
      for (const [dx, dy] of walls) map[player.y + dy][player.x + dx] = WALL;
      enemies.push({ ...RLMonsters.makeNormal(RLMonsters.pickType(2, Math.random), "normal", 2), x: player.x + 4, y: player.y + 4, hp: 1e6, maxHp: 1e6, atk: 0, ranged: false, slow: 99 });
      player.jumpCd = 0; player.slow = 0; render(); return { x: player.x, y: player.y }; },
    // 칸 안에서 자리 옮기기 (가운데 기준 dx, dy)
    place: (dx, dy) => { LIVE.place(player.x + 0.5 + dx, player.y + 0.5 + dy); },
    at: () => ({ ...LIVE.pos(), tx: player.x, ty: player.y, t: performance.now() }),
    gait: () => { const g = LIVE.gait(), o = Anim.of(player); return { amp: g.amp, y: o.y - o.walkY, rot: o.rot }; },   // y: 걸음 높이만 (칸 안 자리는 뺌)
    speed: () => LIVE.SPEED, tile: () => TILE,
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
const save = (run = {}) => JSON.stringify({ v: 1, best: 12, run: { d: 8, hp: 1000, mh: 1000, a: 40, g: 0, l: 5, x: 0, xn: 5000, x4: 1, rid: "r161", k: 0, pp: 0, ...run } });
const T = (page, fn, ...a) => page.evaluate(([f, a]) => window.__t[f](...a), [fn, a]);
const BASE = { rl_oldtown: "off", rl_bless: "off", rl_autogear: "1", rl_market: "paused", rl_device_id: "r161-dev", rl_3d: "0", rl_live: "1", rl_tut: JSON.stringify(["intro"]), rl_tip_dodge: "1" };

try {
  const A = await open({ ...BASE, rl_save: save() });
  check(`walk speed ${await T(A.page, "speed")} tiles/s`, (await T(A.page, "speed")) === 3.5);
  // ---- 1. 옆으로 비켜 선 자리가 그대로 (예전: 오른쪽으로만 걸으면 칸 가운데 줄로 당겨짐) ----
  let s0 = await T(A.page, "yard");
  await T(A.page, "place", 0, -0.3); await sleep(80);
  const a0 = await T(A.page, "at");
  await A.page.keyboard.down("ArrowRight"); await sleep(150);
  const a1 = await T(A.page, "at"); await sleep(300);
  const a2 = await T(A.page, "at");
  await A.page.keyboard.up("ArrowRight"); await sleep(200);
  check(`walking right keeps my sidestep (y offset ${(a0.y - s0.y - 0.5).toFixed(2)} → ${(a2.y - s0.y - 0.5).toFixed(2)})`, Math.abs(a2.y - a0.y) < 0.02 && a2.x > a0.x + 0.6, JSON.stringify({ a0, a2 }));
  const v = (a2.x - a1.x) / ((a2.t - a1.t) / 1000);
  check(`really walks about 3.5 tiles/s (${v.toFixed(2)})`, v > 3.0 && v < 4.0, JSON.stringify({ a1, a2 }));
  // 위로도 똑같이
  s0 = await T(A.page, "yard"); await T(A.page, "place", 0.3, 0); await sleep(80);
  const b0 = await T(A.page, "at");
  await A.page.keyboard.down("ArrowUp"); await sleep(400); const b1 = await T(A.page, "at"); await A.page.keyboard.up("ArrowUp"); await sleep(200);
  check("walking up keeps my sidestep too", Math.abs(b1.x - b0.x) < 0.02 && b1.y < b0.y - 0.6, JSON.stringify({ b0, b1 }));
  // ---- 2. 벽 모서리: 오른쪽 위 칸이 벽이고 내가 위로 조금 치우쳐 있으면, 칸 가운데로 밀려 지나감 ----
  s0 = await T(A.page, "yard", [[1, -1], [2, -1], [3, -1]]); await T(A.page, "place", 0, -0.3); await sleep(80);
  const c0 = await T(A.page, "at");
  await A.page.keyboard.down("ArrowRight"); await sleep(600); const c1 = await T(A.page, "at"); await A.page.keyboard.up("ArrowRight"); await sleep(200);
  check(`wall corner: slides around it (x ${(c0.x - s0.x).toFixed(2)} → ${(c1.x - s0.x).toFixed(2)}, y offset → ${(c1.y - s0.y - 0.5).toFixed(2)})`, c1.x > s0.x + 1.6 && c1.y - s0.y - 0.5 > -0.21, JSON.stringify({ c0, c1 }));
  // 막다른 벽: 오른쪽 칸 줄 전체가 벽이면 그 앞에서 멈춤 (위아래로 엉뚱하게 밀리지 않음)
  s0 = await T(A.page, "yard", [[1, -1], [1, 0], [1, 1]]); await T(A.page, "place", 0, -0.2); await sleep(80);
  await A.page.keyboard.down("ArrowRight"); await sleep(400); const d1 = await T(A.page, "at"); await A.page.keyboard.up("ArrowRight"); await sleep(200);
  check("solid wall: stops in front, stays on my line", d1.x < s0.x + 1 && Math.abs(d1.y - s0.y - 0.3) < 0.02, JSON.stringify({ s0, d1 }));
  // ---- 3. 걷는 모습: 걸으면 켜지고 멈추면 서서히 꺼짐, 낮게 ----
  await T(A.page, "yard");
  await A.page.keyboard.down("ArrowRight"); await sleep(300);
  const g = []; for (let i = 0; i < 8; i++) { g.push(await T(A.page, "gait")); await sleep(30); }
  await A.page.keyboard.up("ArrowRight"); await sleep(40);
  const gStop = await T(A.page, "gait"); await sleep(500);
  const gEnd = await T(A.page, "gait");
  const TILE = await T(A.page, "tile");
  check(`walking: hop on, low (max ${Math.max(...g.map(x => -x.y)).toFixed(1)}px of ${TILE}px tile)`, g.every(x => x.amp > 0.8) && g.some(x => x.y < -0.3) && g.every(x => -x.y <= TILE * 0.07 + 1.2), JSON.stringify(g.slice(0, 3)));
  check(`stopping: fades out (amp ${gStop.amp.toFixed(2)} → ${gEnd.amp.toFixed(2)})`, gStop.amp > 0.2 && gEnd.amp < 0.05, JSON.stringify({ gStop, gEnd }));
  check("no page errors", A.errors.length === 0, A.errors.join("; "));
  await A.ctx.close();
} finally { await browser.close(); }
const pass = results.filter(Boolean).length;
console.log(`\n${pass} passed, ${results.length - pass} failed`);
process.exit(pass === results.length ? 0 : 1);
