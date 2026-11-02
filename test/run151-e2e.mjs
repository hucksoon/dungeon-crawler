// dc#151: 경험치 구슬 (몬스터가 쓰러지면 바닥에, 주워야 경험치) · 축복 상점 (층 아무 곳, 축복 하나 공짜)
// dc#152: 경험치가 많으면 구슬 여러 개가 사방으로 · 레벨마다 필요한 경험치 ×4 (예전 판은 한 번 ×4)
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
const require = createRequire(process.env.NODE_PATH + "/");
const { chromium } = require("playwright");
const REPO = process.argv[2], SHOTS = process.argv[3];
const ORIGIN = "https://hucksoon.github.io/hucksoon/";
const M = createRequire(import.meta.url)(path.join(REPO, "monsters.js"));
const results = [];
const check = (n, ok, x = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x && !ok ? " — " + x : ""}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const HOOK = `
  window.__t = {
    floor: (d) => { depth = d; newLevel(generateDungeon()); render(); return { shop, px: player.x, py: player.y }; },
    // 3칸 떨어진 몬스터 하나를 바로 쓰러뜨림 (스킬로 잡은 것처럼)
    killFar: () => { enemies = []; items = []; for (let dx = -1; dx <= 4; dx++) { const x = player.x + dx, y = player.y; if (map[y]?.[x] !== undefined) { map[y][x] = FLOOR; visible[y][x] = true; } }
      const e = { ...RLMonsters.makeNormal(RLMonsters.pickType(2, Math.random), "normal", 2), x: player.x + 3, y: player.y, hp: 0 }; enemies.push(e); killEnemy(e); render(); },
    st: () => ({ xp: player.xp, lv: player.plvl, x: player.x, y: player.y, orbs: items.filter(i => i.type === "xp").map(i => ({ x: i.x, y: i.y, n: i.amount })), shop, modal: !document.getElementById("bless-modal").hidden, title: document.getElementById("bless-title").textContent, pend: Bless.pending() }),
    step: (dx, dy) => tryMove(dx, dy),
    big: (xp) => { items = []; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const x = player.x + 4 + dx, y = player.y + dy; if (map[y]?.[x] !== undefined) { map[y][x] = FLOOR; visible[y][x] = true; } } dropXp({ x: player.x + 4, y: player.y }, xp); render();
      const o = items.filter(i => i.type === "xp"); return { n: o.length, sum: o.reduce((a, i) => a + i.amount, 0), tiles: new Set(o.map(i => i.x + "," + i.y)).size, far: Math.max(...o.map(i => Math.max(Math.abs(i.x - player.x - 4), Math.abs(i.y - player.y)))) }; },
    need: () => ({ xn: player.xpNext, fresh: FRESH.xpNext }),
    toShop: () => { const s = shop; player.x = s.x - 1; player.y = s.y; map[s.y][s.x - 1] = FLOOR; enemies = []; render(); return s; },
  };
  // ---- 시작 ----`;
const EXE = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const browser = await chromium.launch({ executablePath: EXE });
const browserGL = await chromium.launch({ executablePath: EXE, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
async function open(storage) {
  const ctx = await (storage.rl_3d === "1" ? browserGL : browser).newContext({ viewport: { width: 1280, height: 950 } }); const page = await ctx.newPage(); const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("dialog", d => d.accept());
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
const save = (run = {}) => JSON.stringify({ v: 1, best: 3, run: { d: 1, hp: 3000, mh: 3000, a: 40, g: 0, l: 3, x: 0, xn: 500, rid: "r151", k: 0, pp: 0, ...run } });
const T = (page, fn, ...a) => page.evaluate(([f, a]) => window.__t[f](...a), [fn, a]);
const BASE = { rl_oldtown: "off", rl_bless: "off", rl_autogear: "1", rl_market: "paused", rl_device_id: "r151-dev", rl_3d: "0", rl_tut: JSON.stringify(["intro"]), rl_tip_dodge: "1" };

try {
  // ---- 1. 경험치 구슬 ----
  const A = await open({ ...BASE, rl_save: save({ d: 2 }) });
  const x0 = await T(A.page, "st");
  await T(A.page, "killFar"); const x1 = await T(A.page, "st");
  check("monster killed 3 tiles away: no XP yet, a green XP orb lies where it fell", x1.xp === x0.xp && x1.orbs.length === 1 && x1.orbs[0].x === x1.x + 3 && x1.orbs[0].n > 0, JSON.stringify([x0, x1]));
  await A.page.screenshot({ path: path.join(SHOTS, "run151-orb.png") }).catch(() => {});
  await T(A.page, "step", 1, 0); const x2 = await T(A.page, "st");
  check("one step closer (2 tiles away): still not picked up", x2.xp === x0.xp && x2.orbs.length === 1, JSON.stringify(x2));
  await T(A.page, "step", 1, 0); const x3 = await T(A.page, "st");
  check("walk next to the orb → it is picked up and XP goes up", x3.orbs.length === 0 && x3.xp === x0.xp + x1.orbs[0].n, JSON.stringify([x1.orbs, x3]));
  // dc#152: 경험치가 많을수록 여러 개로 나뉘어 사방으로
  const g1 = await T(A.page, "big", 3), g2 = await T(A.page, "big", 48), g3 = await T(A.page, "big", 240);
  check(`orbs split by XP: 3 → ${g1.n}, 48 → ${g2.n}, 240 → ${g3.n} (sum kept)`, g1.n === 1 && g2.n >= 3 && g3.n >= 7 && g1.sum === 3 && g2.sum === 48 && g3.sum === 240, JSON.stringify([g1, g2, g3]));
  check("many orbs spread over several tiles around (up to 2 tiles away)", g3.tiles >= 5 && g3.far <= 2 && g2.far <= 1, JSON.stringify([g2, g3]));
  await sleep(120); await A.page.screenshot({ path: path.join(SHOTS, "run152-spread.png") }).catch(() => {});
  check("no page errors (XP orbs)", A.errors.length === 0, A.errors.join("; "));
  await A.ctx.close();

  // ---- 1b. 레벨 경험치 ×4: 새 판 24, 예전 판(x4 없음)은 불러올 때 한 번 ×4 ----
  const C = await open({ ...BASE, rl_save: JSON.stringify({ v: 1, best: 3, run: { d: 2, hp: 300, mh: 300, a: 40, g: 0, l: 3, x: 5, xn: 13, rid: "r152", k: 0, pp: 0 } }) });
  const n1 = await T(C.page, "need");
  check("level XP ×4: a new run needs 24 for Lv 2; an older save's next level ×4 once (13 → 52)", n1.fresh === 24 && n1.xn === 52, JSON.stringify(n1));
  await C.page.reload(); await C.page.waitForFunction(() => window.__t); await sleep(300);
  const n2 = await T(C.page, "need");
  check("reloading does not multiply again", n2.xn === 52, JSON.stringify(n2));
  await C.ctx.close();

  // ---- 2. 축복 상점: 시작 자리 옆이 아니라 광장 아무 곳, 밟으면 축복 하나 ----
  const B = await open({ ...BASE, rl_bless: "on", rl_save: save({ d: 3, bz: { normal: 9 } }) });
  let far = 0, n = 0;
  for (let i = 0; i < 6; i++) { const f = await T(B.page, "floor", 4); if (f.shop) { n++; if (Math.max(Math.abs(f.shop.x - f.px), Math.abs(f.shop.y - f.py)) > 6) far++; } }
  check(`shop floor (4): the blessing shop is somewhere in the arena, not next to the start (${far}/${n} far)`, n === 6 && far >= 5, `${far}/${n}`);
  await T(B.page, "toShop"); const b0 = await T(B.page, "st");
  await T(B.page, "step", 1, 0); await sleep(200);
  const b1 = await T(B.page, "st");
  check("step on the shop → pick a blessing for free (\"축복 상점\"), the shop is gone", b1.modal && b1.title.includes("축복 상점") && !b1.shop && b1.pend === b0.pend + 1, JSON.stringify([b0, b1]));
  await B.page.screenshot({ path: path.join(SHOTS, "run151-shrine.png") }).catch(() => {});
  check("no page errors (blessing shop)", B.errors.length === 0, B.errors.join("; "));
  await B.ctx.close();
} catch (e) {
  console.log("ERROR", e.message);
  results.push(false);
} finally {
  await browser.close(); await browserGL.close();
}
const fail = results.filter(r => !r).length;
console.log(`\n${results.length - fail} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
