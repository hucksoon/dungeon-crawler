// dc#159: 실시간 밸런스 — 한 층에서 정예·원거리가 새로 탄을 모으는 건 SHOTS.gap턴에 한 번만 (보스는 빼고),
//   실시간이면 원거리 몬스터가 RANGED.liveFrom층부터 (턴제는 RANGED.from층 그대로)
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
    t: () => turn, sg: () => floorSt.sg ?? 0,
    dbg: () => enemies.map(e => ({ x: e.x - player.x, y: e.y - player.y, k: e.kind, r: !!e.ranged, rcd: e.rcd, scd: e.scd, ch: !!e.charge, vis: !!visible[e.y]?.[e.x] })).concat([{ sg: floorSt.sg, turn }]),
    rOn: (d) => { const o = depth; depth = d; const v = rangedOn(); depth = o; return v; },
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
const save = (run = {}) => JSON.stringify({ v: 1, best: 12, run: { d: 6, hp: 1000, mh: 1000, a: 40, g: 0, l: 5, x: 0, xn: 5000, x4: 1, rid: "r159", k: 0, pp: 0, ...run } });
const T = (page, fn, ...a) => page.evaluate(([f, a]) => window.__t[f](...a), [fn, a]);
const BASE = { rl_oldtown: "off", rl_bless: "off", rl_autogear: "1", rl_market: "paused", rl_device_id: "r159-dev", rl_3d: "0", rl_live: "1", rl_tut: JSON.stringify(["intro"]), rl_tip_dodge: "1" };

try {
  check(`rules: SHOTS.gap ${M.SHOTS.gap} turns, live ranged from floor ${M.RANGED.liveFrom} (turn-based ${M.RANGED.from})`, M.SHOTS.gap >= 2 && M.RANGED.liveFrom < M.RANGED.from);
  check(`deep floors: one orb hits harder (x1 up to floor ${M.SHOTS.deep.from}, x${M.SHOTS.deep.mul} at ${M.SHOTS.deep.to})`, M.shotDeepMul(1) === 1 && M.shotDeepMul(M.SHOTS.deep.from) === 1 && M.shotDeepMul(M.SHOTS.deep.to) === M.SHOTS.deep.mul && M.shotDeepMul(35) > 1 && M.shotDeepMul(35) < M.SHOTS.deep.mul);
  const A = await open({ ...BASE, rl_save: save() });
  // ---- 1. 정예 둘이 같이 준비돼도 한 마리만 먼저 모음 → 다른 하나는 gap턴 뒤 ----
  await T(A.page, "yard", 8); await T(A.page, "hp", 1e6);
  // (느려짐: 두 턴에 한 번만 움직여서, 기다리는 동안 붙어 버려 못 쏘는 일이 없게)
  await T(A.page, "mon", 4, 0, { kind: "elite", atk: 1, scd: 1, slow: 99 });
  await T(A.page, "mon", 4, -3, { kind: "elite", atk: 1, scd: 1, slow: 99 });   // 둘 다 오른쪽 (시작 자리가 맵 왼쪽 끝일 수 있음)
  const starts = {}; let s1 = null;
  for (let i = 0; i < 400 && !(starts[1] != null && starts[2] != null); i++) {
    await sleep(25); s1 = await T(A.page, "st"); const t = await T(A.page, "t");
    for (const k of [1, 2]) if (s1.charge[k] && starts[k] == null) starts[k] = t;
  }
  check("two ready elites: only one starts charging first", starts[1] != null && starts[2] != null && starts[1] !== starts[2], JSON.stringify(starts));
  check(`the second waits at least ${M.SHOTS.gap} turns`, Math.abs(starts[1] - starts[2]) >= M.SHOTS.gap, JSON.stringify(starts));
  // ---- 2. 보스는 간격과 상관없이 모음 ----
  await T(A.page, "yard", 10); await T(A.page, "hp", 1e6);
  await T(A.page, "mon", 4, 0, { kind: "elite", atk: 1, scd: 1 });
  let s2 = null; for (let i = 0; i < 40 && !s2?.charge[1]; i++) { await sleep(25); s2 = await T(A.page, "st"); }
  const g2 = await T(A.page, "sg");
  await T(A.page, "mon", 0, 3, { kind: "boss", atk: 1, scd: 1, pat: "ring" });
  let s2b = null; for (let i = 0; i < 40 && !s2b?.charge[2]; i++) { await sleep(25); s2b = await T(A.page, "st"); }
  check("an elite charging (gap running) → a boss still charges right away", s2?.charge[1] && g2 > 0 && s2b?.charge[2]?.kind === "boss", JSON.stringify([s2?.charge, g2, s2b?.charge]));
  // ---- 3. 원거리도 간격을 지키고, 기다리는 동안 칸 표시(턴제 구슬)로 바뀌지 않음 ----
  await T(A.page, "yard", 25); await T(A.page, "hp", 1e6);
  await T(A.page, "mon", 4, 0, { kind: "elite", atk: 1, scd: 1 });
  let s3 = null; for (let i = 0; i < 40 && !s3?.charge[1]; i++) { await sleep(25); s3 = await T(A.page, "st"); }
  await T(A.page, "mon", 4, -3, { ranged: true, rcd: 0, atk: 1 });
  let rs = null, sawAim = false; const t3 = await T(A.page, "t");
  for (let i = 0; i < 300 && rs == null; i++) { await sleep(25); const s = await T(A.page, "st"); sawAim ||= s.aim[2]; if (s.charge[2]) rs = await T(A.page, "t"); }
  check("ranged monster waits for the gap, then charges a real orb (no tile mark)", rs != null && !sawAim, JSON.stringify({ t3, rs, sawAim, d: rs == null && await T(A.page, "dbg") }));
  // ---- 4. 원거리 몬스터가 나오는 층: 실시간 liveFrom층부터, 턴제는 from층부터 ----
  check(`real time: ranged monsters on floor ${M.RANGED.liveFrom}, not on ${M.RANGED.liveFrom - 1}`, await T(A.page, "rOn", M.RANGED.liveFrom) && !(await T(A.page, "rOn", M.RANGED.liveFrom - 1)));
  await A.page.keyboard.press("t"); await sleep(150);
  check(`turn-based: still from floor ${M.RANGED.from}`, !(await T(A.page, "rOn", M.RANGED.liveFrom)) && await T(A.page, "rOn", M.RANGED.from));
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
