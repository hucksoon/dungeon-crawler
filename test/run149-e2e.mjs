// dc#149: 원거리 몬스터 — 후반(일반 20층부터)에만, 떨어져서 저주 구슬. 던지기 전 2턴 동안 3×3 붉은 표시 → 벗어나면 안 맞음
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
    floor: (d) => { depth = d; newLevel(generateDungeon()); render(); const f = enemies.filter(e => e.kind === "normal" || e.kind === "elite"); return { n: f.length, ranged: f.filter(e => e.ranged).length }; },
    // 원거리 몬스터 하나: 나에게서 오른쪽 4칸 (가는 길은 바닥), HP 많음
    one: () => { enemies = []; items = []; for (let dx = -4; dx <= 5; dx++) for (let dy = -2; dy <= 2; dy++) { const x = player.x + dx, y = player.y + dy; if (map[y]?.[x] !== undefined) { map[y][x] = FLOOR; visible[y][x] = true; } }
      const e = { ...RLMonsters.makeNormal(RLMonsters.pickType(30, Math.random), "normal", 20), x: player.x + 4, y: player.y, ranged: true, rcd: 0 }; e.hp = e.maxHp = 1e6; e.atk = 60; enemies.push(e); player.hp = player.maxHp; render(); },
    st: () => { const e = enemies[0]; return { hp: player.hp, px: player.x, py: player.y, ex: e?.x, ey: e?.y, aim: e?.aim ? { ...e.aim } : null, rcd: e?.rcd }; },
    wait: () => { Anim.newTurn(); endTurn(); },
    step: (dx, dy) => tryMove(dx, dy),
    near: () => { const e = enemies[0]; e.x = player.x + 2; e.y = player.y; e.aim = null; e.rcd = 3; },
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
const save = (run = {}) => JSON.stringify({ v: 1, best: 3, run: { d: 1, hp: 3000, mh: 3000, a: 40, g: 0, l: 10, x: 0, xn: 60, rid: "r149", k: 0, pp: 0, ...run } });
const T = (page, fn, ...a) => page.evaluate(([f, a]) => window.__t[f](...a), [fn, a]);
const BASE = { rl_oldtown: "off", rl_bless: "off", rl_autogear: "1", rl_market: "paused", rl_device_id: "r149-dev", rl_3d: "0", rl_tut: JSON.stringify(["intro"]), rl_tip_dodge: "1" };

try {
  check("ranged rule: from floor 20, ~20% (deep 25%), 2-turn warning (3D 3), 3x3, x2", M.RANGED.from === 20 && M.RANGED.windup === 2 && M.RANGED.windup3d === 3 && M.RANGED.radius === 1 && M.RANGED.mul === 2);

  // ---- 1. 초반엔 없음, 20층부터 섞여 나옴 ----
  const A = await open({ ...BASE, rl_save: save({ d: 5 }) });
  let early = 0, late = 0, lateN = 0;
  for (const d of [3, 10, 19]) early += (await T(A.page, "floor", d)).ranged;
  for (const d of [20, 30, 45]) { const f = await T(A.page, "floor", d); late += f.ranged; lateN += f.n; }
  check("no ranged monsters before floor 20", early === 0, String(early));
  check(`floor 20+: some ranged monsters (${late}/${lateN}, about 20%)`, late > 0 && late / lateN > 0.08 && late / lateN < 0.35, `${late}/${lateN}`);

  // ---- 2. 조준 → 2턴 동안 표시 → 그 자리에 있으면 맞음 ----
  await T(A.page, "floor", 25);
  await T(A.page, "one"); const s0 = await T(A.page, "st");
  await T(A.page, "wait"); const s1 = await T(A.page, "st");
  check("ranged monster aims at my tile from a distance (no damage yet, 2 turns to get out)", s1.aim && s1.aim.x === s0.px && s1.aim.y === s0.py && s1.aim.t === 2 && s1.hp === s0.hp, JSON.stringify([s0, s1]));
  await A.page.screenshot({ path: path.join(SHOTS, "run149-aim.png") }).catch(() => {});
  await T(A.page, "wait"); const s2 = await T(A.page, "st");
  check("next turn: still waiting (1 turn left), no damage", s2.aim && s2.aim.t === 1 && s2.hp === s0.hp, JSON.stringify(s2));
  await T(A.page, "wait"); const s3 = await T(A.page, "st");
  check("stayed in the red area → hit by the curse orb", !s3.aim && s3.hp < s0.hp && s3.rcd === M.RANGED.every, JSON.stringify(s3));

  // ---- 3. 표시가 뜬 뒤 방향키로 두 칸 벗어나면 안 맞음 ----
  await T(A.page, "one"); await T(A.page, "wait"); const t1 = await T(A.page, "st");
  await T(A.page, "step", 0, -1); await T(A.page, "step", 0, -1); const t2 = await T(A.page, "st");
  check("step out of the red area with arrow keys → the orb misses", t1.aim && !t2.aim && t2.hp === t1.hp && t2.py === t1.py - 2, JSON.stringify([t1, t2]));

  // ---- 4. 너무 가까우면 물러남 ----
  await T(A.page, "one"); await T(A.page, "near"); const n0 = await T(A.page, "st");
  await T(A.page, "wait"); const n1 = await T(A.page, "st");
  check("too close (2 tiles) → steps back instead of walking in", Math.max(Math.abs(n1.ex - n1.px), Math.abs(n1.ey - n1.py)) > 2, JSON.stringify([n0, n1]));
  await T(A.page, "wait"); const n2 = await T(A.page, "st");
  check("steps back only every other turn (you can catch it)", n2.ex === n1.ex && n2.ey === n1.ey, JSON.stringify([n1, n2]));
  check("no page errors (ranged)", A.errors.length === 0, A.errors.join("; "));
  await A.ctx.close();

  // ---- 5. 예전 방 던전(회귀 테스트)에는 없음 ----
  const B = await open({ ...BASE, rl_oldtown: "on", rl_save: save({ d: 25 }) });
  let old = 0; for (const d of [25, 40]) old += (await T(B.page, "floor", d)).ranged;
  check("old room dungeon: no ranged monsters", old === 0, String(old));
  await B.ctx.close();

  // ---- 6. 3D: 조준 표시가 바닥에, 구슬이 떨어져도 오류 없음 ----
  const D = await open({ ...BASE, rl_3d: "1", rl_save: save({ d: 25 }) });
  await sleep(1500);
  await T(D.page, "one");
  let a3 = null; for (let i = 0; i < 40 && !a3?.aim; i++) { await sleep(50); a3 = await T(D.page, "st"); }
  check("3D: aims with 3 turns to get out (about 1.5 s)", a3?.aim?.t === M.RANGED.windup3d, JSON.stringify(a3));
  await sleep(150); await D.page.screenshot({ path: path.join(SHOTS, "run149-3d.png") }).catch(() => {});
  await sleep(2200);
  const d3 = await T(D.page, "st");
  check("3D: then throws (stood still → hit)", !d3.aim && d3.hp < a3.hp, JSON.stringify(d3));
  check("no page errors (3D ranged)", D.errors.length === 0, D.errors.join("; "));
  await D.ctx.close();
} catch (e) {
  console.log("ERROR", e.message);
  results.push(false);
} finally {
  await browser.close(); await browserGL.close();
}
const fail = results.filter(r => !r).length;
console.log(`\n${results.length - fail} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
