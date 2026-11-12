// dc#160: 실시간에서 걷는 모습(통통·기우뚱·걷는 쪽을 봄·먼지)과 베기, 계단은 멀리(dc#163부터 화면 안) + 화면 가장자리 화살표, 길잡이 축복 뺌,
//   속성 축복은 단계가 오를수록 덜 나옴, 실시간 원거리 몬스터는 2층부터 층마다 늘어남
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
    // 넓은 빈 마당 (내 둘레 9×9 바닥, 몬스터 하나는 멀리)
    yard: (d = 8) => { depth = d; enemies = []; items = []; shots = []; floorSt.sc = 999; floorSt.sg = 0; shop = null;
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const x = player.x + dx, y = player.y + dy; if (map[y]?.[x] !== undefined) { map[y][x] = FLOOR; visible[y][x] = true; seen[y][x] = true; } }
      enemies.push({ ...RLMonsters.makeNormal(RLMonsters.pickType(2, Math.random), "normal", 2), x: player.x + 4, y: player.y + 4, hp: 1e6, maxHp: 1e6, atk: 0, ranged: false });
      player.jumpCd = 0; render(); return { x: player.x, y: player.y }; },
    mon: (dx, dy, o = {}) => { enemies.push({ ...RLMonsters.makeNormal(RLMonsters.pickType(2, Math.random), "normal", 2), x: player.x + dx, y: player.y + dy, hp: 1e6, maxHp: 1e6, atk: 0, ranged: false, slow: 99, ...o }); },
    gait: () => { const g = LIVE.gait(), o = Anim.of(player); return { ...g, flip: o.flip, rot: o.rot, y: o.y, kinds: Fx.kinds() }; },
    // 이 층 몬스터를 모두 잡은 것처럼: 마지막 몬스터는 내 옆에서 쓰러짐 → 계단
    clear: () => { const last = { x: player.x + 1, y: player.y }; enemies = []; floorSt.open = false; floorSt.boss = true; floorProgress(last);
      const D = Array.from({ length: MAP_H }, () => new Array(MAP_W).fill(-1)), q = [[player.x, player.y]]; D[player.y][player.x] = 0; let max = 0;
      for (let i = 0; i < q.length; i++) { const [x, y] = q[i]; for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H || D[ny][nx] >= 0 || map[ny][nx] === WALL) continue; D[ny][nx] = D[y][x] + 1; max = Math.max(max, D[ny][nx]); q.push([nx, ny]); } }
      let st = null; for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) if (map[y][x] === STAIRS) st = { x, y };
      return { open: floorSt.open, st, d: st ? D[st.y][st.x] : -1, max, near: st ? Math.max(Math.abs(st.x - last.x), Math.abs(st.y - last.y)) : -1, log: [...document.querySelectorAll("#log > div")].slice(-1).map(d => d.textContent).join("") }; },
    arrow: () => drawStairsArrow(camera()),
    share: (d, n = 3000) => { const o = depth; depth = d; let k = 0; for (let i = 0; i < n; i++) if (ranged({ ...RLMonsters.makeNormal(RLMonsters.pickType(2, Math.random), "normal", 2) }).ranged) k++; depth = o; return k / n; },
    blessIds: () => Object.keys(RLBless.BLESSINGS), guideStat: () => stats().guide,
    // 실시간 더 세게: 같은 몬스터를 d층에서 liveHard에 넣으면 HP·공격력이 몇 배?
    hard: (d, o = {}) => { const od = depth; depth = d; const b = { ...RLMonsters.makeNormal(RLMonsters.pickType(2, () => 0.5), "normal", 2), maxHp: 1000, hp: 1000, atk: 100, ...o }; const m = liveHard({ ...b }); depth = od; return { hp: m.maxHp / 1000, atk: m.atk / 100 }; },
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
const save = (run = {}) => JSON.stringify({ v: 1, best: 12, run: { d: 8, hp: 1000, mh: 1000, a: 40, g: 0, l: 5, x: 0, xn: 5000, x4: 1, rid: "r160", k: 0, pp: 0, ...run } });
const T = (page, fn, ...a) => page.evaluate(([f, a]) => window.__t[f](...a), [fn, a]);
const BASE = { rl_oldtown: "off", rl_bless: "off", rl_autogear: "1", rl_market: "paused", rl_device_id: "r160-dev", rl_3d: "0", rl_live: "1", rl_tut: JSON.stringify(["intro"]), rl_tip_dodge: "1" };

try {
  // ---- 1. 규칙 값 ----
  check(`rules: live ranged from floor ${M.RANGED.liveFrom}, share grows ${M.rangedLiveShare(2).toFixed(2)} → ${M.rangedLiveShare(26).toFixed(2)} → ${M.rangedLiveShare(50).toFixed(2)}`,
    M.RANGED.liveFrom === 2 && M.rangedLiveShare(2) < M.rangedLiveShare(26) && M.rangedLiveShare(26) < M.rangedLiveShare(50) && M.rangedLiveShare(60) === M.rangedLiveShare(50));
  check("guide (길잡이) blessing is gone", !B.BLESSINGS.guide && !Object.values(B.BLESSINGS).some(b => b.fx.guide));
  // 속성 축복: dc#160에는 Lv 9이면 처음보다 훨씬 덜 나왔음 → dc#178: 단계와 상관없이 같은 확률
  const seen = (have) => { let k = 0; for (let i = 0; i < 4000; i++) if (B.offer(`e${i}|0`, have).includes("fire")) k++; return k / 4000; };
  const s0 = seen({}), s9 = seen({ fire: 9 });
  check(`dc#178: element blessing no longer fades as it levels (fire offered ${Math.round(s0 * 100)}% at Lv 0 → ${Math.round(s9 * 100)}% at Lv 9)`, B.ELEM_SLOW === undefined && s9 > s0 * 0.8, JSON.stringify({ s0, s9 }));

  const A = await open({ ...BASE, rl_save: save() });
  // ---- 2. 걷는 모습 ----
  await T(A.page, "yard", 8);
  await A.page.keyboard.down("ArrowRight"); await sleep(350);
  const r1 = []; for (let i = 0; i < 6; i++) { r1.push(await T(A.page, "gait")); await sleep(40); }
  await A.page.keyboard.up("ArrowRight");
  check("walking right: moving, faces right, hops and sways", r1.every(g => g.moving && g.face === 1 && g.flip === 1) && r1.some(g => g.y < -0.5) && new Set(r1.map(g => g.rot.toFixed(2))).size > 1, JSON.stringify(r1.slice(0, 3)));
  await A.page.keyboard.down("ArrowLeft"); await sleep(300);
  const l1 = await T(A.page, "gait"); await A.page.keyboard.up("ArrowLeft"); await sleep(250);
  const s1 = await T(A.page, "gait");
  check("walking left: faces left (sprite flipped)", l1.moving && l1.face === -1 && l1.flip === -1, JSON.stringify(l1));
  check("stopped: no hop, still faces left", !s1.moving && s1.flip === -1 && Math.abs(s1.y) < 1.5, JSON.stringify(s1));
  // ---- 3. 베기 ----
  await T(A.page, "mon", 1, 0);
  let slash = false; for (let i = 0; i < 30 && !slash; i++) { await sleep(40); slash = (await T(A.page, "gait")).kinds.includes("slash"); }
  check("next to a monster: auto attack draws a slash", slash);
  // ---- 4. 계단: dc#163부터는 화면 안, 너무 가깝지 않게 (dc#160은 멀리 → 바꿈. 자세한 확인은 run163) ----
  const st = await T(A.page, "clear");
  check(`stairs appear on screen, not next to the last kill (walk ${st.d})`, st.open && st.st && st.d >= 5 && st.near > 1 && !(await T(A.page, "arrow")), JSON.stringify(st));
  check("log says the stairs appeared nearby", /가까운 곳/.test(st.log), st.log);
  // ---- 5. 원거리 몬스터 비율 ----
  const f1 = await T(A.page, "share", 1), f2 = await T(A.page, "share", 2), f40 = await T(A.page, "share", 40);
  check(`real time: ranged share floor 1 ${f1.toFixed(2)}, floor 2 ${f2.toFixed(2)}, floor 40 ${f40.toFixed(2)}`, f1 === 0 && Math.abs(f2 - M.rangedLiveShare(2)) < 0.04 && Math.abs(f40 - M.rangedLiveShare(40)) < 0.05 && f40 > f2 * 2);
  // ---- 6. 실시간은 더 세게 (1층 ×1 → 8층부터 다 셈, 보스는 그대로) ----
  const H = M.LIVE_HARD, h1 = await T(A.page, "hard", 1), h8 = await T(A.page, "hard", 8), h30 = await T(A.page, "hard", 30), hb = await T(A.page, "hard", 30, { kind: "boss" });
  check(`real time harder: floor 1 ×${h1.hp}, floor 8+ HP ×${h8.hp} atk ×${h8.atk}, boss unchanged`, h1.hp === 1 && h1.atk === 1 && h8.hp === H.hp && h8.atk === H.atk && h30.hp === H.hp && hb.hp === 1 && hb.atk === 1 && M.liveHardMul(4).hp > 1 && M.liveHardMul(4).hp < H.hp, JSON.stringify({ h1, h8, h30, hb }));
  await A.page.keyboard.press("t"); await sleep(150);
  const t10 = await T(A.page, "share", 10), t25 = await T(A.page, "share", 25);
  check(`turn-based: none before floor ${M.RANGED.from}, then ${Math.round(M.RANGED.share * 100)}%`, t10 === 0 && Math.abs(t25 - M.RANGED.share) < 0.04, JSON.stringify({ t10, t25 }));
  const tb = await T(A.page, "hard", 30);
  check("turn-based: monsters not made stronger", tb.hp === 1 && tb.atk === 1, JSON.stringify(tb));
  check("no page errors", A.errors.length === 0, A.errors.join("; "));
  await A.ctx.close();
  // ---- 7. 예전 저장에 길잡이가 있어도 ----
  const G = await open({ ...BASE, rl_bless: "on", rl_save: save({ bl: { guide: 1, might: 2 } }) });
  check("old save with 길잡이: loads fine, no guide effect, not in the blessing list", !(await T(G.page, "guideStat")) && !(await T(G.page, "blessIds")).includes("guide") && G.errors.length === 0, G.errors.join("; "));
  await G.ctx.close();
} catch (e) {
  console.log("ERROR", e.message);
  results.push(false);
} finally {
  await browser.close();
}
const fail = results.filter(r => !r).length;
console.log(`\n${results.length - fail} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
