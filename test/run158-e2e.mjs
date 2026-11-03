// dc#158: 실시간 탄환 — 정예(3층부터)는 세 갈래, 보스는 부채꼴·둘레 전체, 원거리 몬스터는 한 발을 2턴 모았다가 쏨.
//   화면을 실제로 날아와 몸에 닿으면 맞고, 비키거나 회피하면 안 맞고, 벽에 막힘. 턴제에서는 쏘지 않음
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
const require = createRequire(process.env.NODE_PATH + "/");
const { chromium, devices } = require("playwright");
const REPO = process.argv[2], SHOTS = process.argv[3];
const ORIGIN = "https://hucksoon.github.io/hucksoon/";
const M = createRequire(import.meta.url)(path.join(REPO, "monsters.js"));
const results = [];
const check = (n, ok, x = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x && !ok ? " — " + x : ""}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const HOOK = `
  window.__t = {
    // 넓은 빈 마당 (몬스터·아이템 없음, 내 둘레 9×9 바닥)
    yard: (d = 8) => { depth = d; enemies = []; items = []; shots = []; floorSt.sc = 999; floorSt.sg = 0; shop = null;
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const x = player.x + dx, y = player.y + dy; if (map[y]?.[x] !== undefined) { map[y][x] = FLOOR; visible[y][x] = true; seen[y][x] = true; } }
      enemies.push({ ...RLMonsters.makeNormal(RLMonsters.pickType(2, Math.random), "normal", 2), x: player.x + 4, y: player.y + 4, hp: 1e6, maxHp: 1e6, atk: 0, ranged: false });   // 층이 끝나지 않게 멀리 하나
      player.jumpCd = 0; player.potCd = 0; render(); return { x: player.x, y: player.y }; },
    mon: (dx, dy, o = {}) => { const e = { ...RLMonsters.makeNormal(RLMonsters.pickType(2, Math.random), "normal", 2), x: player.x + dx, y: player.y + dy, hp: 1e6, maxHp: 1e6, atk: 0, ranged: false, ...o }; enemies.push(e); return enemies.length - 1; },
    st: () => ({ shots: shots.map(s => ({ x: +s.x.toFixed(2), y: +s.y.toFixed(2), c: s.color })), charge: enemies.map(e => e.charge ? { ...e.charge } : null), aim: enemies.map(e => !!e.aim), log: [...document.querySelectorAll("#log > div")].slice(-3).map(d => d.textContent).join(" / "),
      x: player.x, y: player.y, pos: LIVE.pos(), turn, live: LIVE.active(), hp: player.hp, jc: player.jumpCd, inv: performance.now() < (player.invUntil || 0), dash: LIVE.dashing(),
      foeHp: enemies.map(e => e.hp), btn: document.getElementById("live-btn").textContent, body: document.body.classList.contains("live"), pc: player.potCd }),
    off: (dx, dy) => { const o = Anim.of(player); return { x: o.walkX, y: o.walkY }; },
    hp: (v) => { player.hp = v; },
    wallCol: (dx) => { for (let dy = -4; dy <= 4; dy++) { const x = player.x + dx, y = player.y + dy; if (map[y]?.[x] !== undefined) map[y][x] = WALL; } computeFOV(); render(); },
    turn: () => { Anim.newTurn(); endTurn(); },
  };
  // ---- 시작 ----`;
const EXE = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const browser = await chromium.launch({ executablePath: EXE });
async function open(storage, phone = false) {
  const ctx = await browser.newContext(phone ? { ...devices["iPhone 13"] } : { viewport: { width: 1280, height: 950 } }); const page = await ctx.newPage(); const errors = [];
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
const save = (run = {}) => JSON.stringify({ v: 1, best: 12, run: { d: 6, hp: 1000, mh: 1000, a: 40, g: 0, l: 5, x: 0, xn: 5000, x4: 1, rid: "r158", k: 0, pp: 0, ...run } });
const T = (page, fn, ...a) => page.evaluate(([f, a]) => window.__t[f](...a), [fn, a]);
const BASE = { rl_oldtown: "off", rl_bless: "off", rl_autogear: "1", rl_market: "paused", rl_device_id: "r158-dev", rl_3d: "0", rl_live: "1", rl_tut: JSON.stringify(["intro"]), rl_tip_dodge: "1" };

try {
  const A = await open({ ...BASE, rl_save: save() });
  // ---- 1. 정예: 2턴 모았다가 세 갈래 → 가만히 있으면 가운데 구슬에 맞음 ----
  await T(A.page, "yard", 8); await T(A.page, "hp", 1000);
  await T(A.page, "mon", 4, 0, { kind: "elite", atk: 60, scd: 1 });
  let c1 = null; for (let i = 0; i < 20 && !c1?.charge[1]; i++) { await sleep(60); c1 = await T(A.page, "st"); }
  check("elite 4 tiles away starts charging (2 turns, three-way)", c1?.charge[1]?.kind === "elite" && c1.charge[1].pat === "fan3" && c1.charge[1].t === M.SHOTS.elite.windup, JSON.stringify(c1?.charge));
  await sleep(150); await A.page.screenshot({ path: path.join(SHOTS, "run158-charge.png") }).catch(() => {});
  let f1 = null; for (let i = 0; i < 30 && !(f1?.shots.length); i++) { await sleep(30); f1 = await T(A.page, "st"); }
  check(`then fires ${M.SHOTS.elite.n} orbs that fly toward me`, f1?.shots.length === M.SHOTS.elite.n && f1.shots.every(s => s.x < c1.x + 4.5), JSON.stringify(f1?.shots));
  await sleep(80); await A.page.screenshot({ path: path.join(SHOTS, "run158-shots.png") }).catch(() => {});
  await sleep(900); const h1 = await T(A.page, "st");
  check("standing still → the middle orb hits (\"탄에 맞아\")", h1.hp < 1000 && /탄에 맞아/.test(h1.log), JSON.stringify([h1.hp, h1.log]));
  // ---- 2. 모으는 걸 보고 위로 걸어가면 안 맞음 ----
  await T(A.page, "yard", 8); await T(A.page, "hp", 1000);
  await T(A.page, "mon", 4, 0, { kind: "elite", atk: 60, scd: 1 });
  let c2 = null; for (let i = 0; i < 40 && !c2?.shots.length; i++) { await sleep(25); c2 = await T(A.page, "st"); }
  await A.page.keyboard.down("ArrowUp"); await sleep(750); await A.page.keyboard.up("ArrowUp"); await sleep(600);
  const h2 = await T(A.page, "st");
  check("orbs fired → walk sideways out of the spread → no orb hits", c2?.shots.length === M.SHOTS.elite.n && h2.hp === 1000, JSON.stringify([c2?.shots, h2.hp, h2.log]));
  // ---- 3. 벽에 막힘 ----
  await T(A.page, "yard", 8); await T(A.page, "hp", 1000);
  await T(A.page, "wallCol", 2);
  await T(A.page, "mon", 4, 0, { kind: "elite", atk: 60, scd: 1 });
  await sleep(2600); const h3 = await T(A.page, "st");
  check("a wall between us blocks the orbs (or it never sees me)", h3.hp === 1000 && h3.shots.length === 0, JSON.stringify(h3));
  // ---- 4. 보스: 둘레 전체 12발 ----
  await T(A.page, "yard", 10); await T(A.page, "hp", 1000);
  await T(A.page, "mon", 3, 0, { kind: "boss", atk: 1, scd: 1, pat: "fan" });
  let f4 = null; for (let i = 0; i < 60 && !(f4?.shots.length); i++) { await sleep(30); f4 = await T(A.page, "st"); }
  check(`boss: a ring of ${M.SHOTS.boss.ring.n} orbs in every direction`, f4?.shots.length === M.SHOTS.boss.ring.n && /둘레로/.test(f4.log), JSON.stringify([f4?.shots.length, f4?.log]));
  await sleep(60); await A.page.screenshot({ path: path.join(SHOTS, "run158-ring.png") }).catch(() => {});
  // ---- 5. 원거리 몬스터: 칸 표시 대신 진짜 구슬 한 발 ----
  await T(A.page, "yard", 25); await T(A.page, "hp", 1000);
  await T(A.page, "mon", 4, 0, { ranged: true, rcd: 0, atk: 60 });
  let f5 = null; for (let i = 0; i < 60 && !(f5?.shots.length); i++) { await sleep(30); f5 = await T(A.page, "st"); }
  check("ranged monster (real time): one real orb, no tile mark", f5?.shots.length === 1 && !f5.aim.some(Boolean), JSON.stringify(f5));
  // ---- 6. 창이 열리면 구슬도 멈춤 ----
  await A.page.keyboard.press("i"); await sleep(150); const p6 = (await T(A.page, "st")).shots[0];
  await sleep(400); const q6 = (await T(A.page, "st")).shots[0];
  check("inventory open → orbs stop in the air", p6 && q6 && p6.x === q6.x && p6.y === q6.y, JSON.stringify([p6, q6]));
  await A.page.keyboard.press("Escape"); await sleep(100);
  // ---- 7. 2층 정예는 아직 안 쏨 · 턴제에서는 안 쏨 ----
  await T(A.page, "yard", 2); await T(A.page, "mon", 4, 0, { kind: "elite", atk: 1, scd: 1 }); await sleep(1300);
  const s7 = await T(A.page, "st");
  check(`elites shoot only from floor ${M.SHOTS.elite.from}`, !s7.charge[1] && s7.shots.length === 0, JSON.stringify(s7));
  await A.page.keyboard.press("t"); await T(A.page, "yard", 8); await T(A.page, "mon", 4, 0, { kind: "elite", atk: 1, scd: 1 });
  for (let i = 0; i < 4; i++) await T(A.page, "turn");
  const s8 = await T(A.page, "st");
  check("turn-based: elites don't shoot", !s8.live && !s8.charge[1] && s8.shots.length === 0, JSON.stringify(s8));
  check("no page errors", A.errors.length === 0, A.errors.join("; "));
  await A.ctx.close();
} catch (e) {
  console.log("ERROR", e.message);
  results.push(false);
} finally {
  await browser.close();
}
const fail = results.filter(r => !r).length;
console.log(`\n${results.length - fail} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
