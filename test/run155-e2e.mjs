// dc#155: 긴장감 — 강타(붙은 근접 몬스터가 내 칸을 노려 2턴 뒤 크게 내려침, 한 칸 옮기거나 회피하면 0) ·
//   회복 구슬(HP가 낮을 때 처치하면 확률로 빨간 구슬) · 버티기(층마다 한 번 쓰러질 피해를 HP 1로)
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
    // d층 새 층: 몬스터·아이템을 비우고 내 둘레 7×7을 바닥으로
    setup: (d) => { depth = d; newLevel(generateDungeon()); enemies = []; items = [];
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const x = player.x + dx, y = player.y + dy; if (map[y]?.[x] !== undefined) { map[y][x] = FLOOR; visible[y][x] = true; } }
      player.jumpCd = 0; player.potCd = 0; render(); return { x: player.x, y: player.y }; },
    // 내 옆(dx, dy)에 몬스터 (기본: 안 죽고 공격력 0)
    mon: (dx, dy, o = {}) => { const e = { ...RLMonsters.makeNormal(RLMonsters.pickType(monLevel(), Math.random), o.kind || "normal", depth), x: player.x + dx, y: player.y + dy, hp: 1e6, maxHp: 1e6, atk: 0, ...o }; enemies.push(e); render(); return enemies.length - 1; },
    sc: (n) => { floorSt.sc = n; },
    turn: () => { endTurn(); return window.__t.st(); },
    step: (dx, dy) => { tryMove(dx, dy); return window.__t.st(); },
    dodge: (dx, dy) => { dodge(dx, dy); return window.__t.st(); },
    hp: (v) => { player.hp = v; updateStats(); },
    kill: (i) => { const e = enemies[i]; e.hp = 0; killEnemy(e); render(); return window.__t.st(); },
    rand: (v) => { window.__r0 ||= Math.random; Math.random = v == null ? window.__r0 : () => v; },
    st: () => ({ hp: player.hp, max: stats().maxHp, x: player.x, y: player.y, over: gameOver, sc: floorSt.sc, ls: floorSt.ls || 0, jc: player.jumpCd, pc: player.potCd,
      smash: enemies.map(e => e.smash ? { ...e.smash } : null), heals: items.filter(i => i.type === "heal").map(i => ({ x: i.x, y: i.y })),
      flash: document.getElementById("guard-flash").classList.contains("on"), warn3d: !!document.getElementById("warn3d")?.classList.contains("on"), status: skillHud().join(" | "),
      log: [...document.querySelectorAll("#log > div")].slice(-4).map(d => d.textContent).join(" / ") }),
    pct: (kind) => RLMonsters.smashPct(kind, depth, false),
    reload: () => { saveGame(true); saveLevel(); },
    is3d: () => View3D.active(),
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
const save = (run = {}) => JSON.stringify({ v: 1, best: 12, run: { d: 10, hp: 1000, mh: 1000, a: 40, g: 0, l: 5, x: 0, xn: 5000, x4: 1, rid: "r155", k: 0, pp: 0, ...run } });
const T = (page, fn, ...a) => page.evaluate(([f, a]) => window.__t[f](...a), [fn, a]);
const BASE = { rl_oldtown: "off", rl_bless: "off", rl_autogear: "1", rl_market: "paused", rl_device_id: "r155-dev", rl_3d: "0", rl_tut: JSON.stringify(["intro"]), rl_tip_dodge: "1" };

try {
  const A = await open({ ...BASE, rl_save: save() });
  // ---- 1. 강타: 예고 → 그대로 있으면 최대 HP × 30% ----
  const p0 = await T(A.page, "setup", 10);
  await T(A.page, "mon", 1, 0);
  await T(A.page, "sc", 1);
  const s1 = await T(A.page, "turn");
  check("smash: the beat runs out next to a melee monster → it aims at my tile for 2 turns (orange warning in the log)", s1.smash[0] && s1.smash[0].x === p0.x && s1.smash[0].y === p0.y && s1.smash[0].t === 2 && /크게 내려칠/.test(s1.log) && s1.sc === M.SMASH.every, JSON.stringify(s1));
  await sleep(150); await A.page.screenshot({ path: path.join(SHOTS, "run155-smash-warn.png") }).catch(() => {});
  const s2 = await T(A.page, "turn");
  check("one turn later the countdown shows 1 and nothing hit yet", s2.smash[0]?.t === 1 && s2.hp === s1.hp, JSON.stringify(s2));
  const s3 = await T(A.page, "turn");
  const want = Math.round(s3.max * M.SMASH.pct.normal);
  check(`stay on the tile → smash lands for max HP × ${M.SMASH.pct.normal} (${want})`, !s3.smash[0] && s2.hp - s3.hp === want && /강타에 맞아/.test(s3.log), JSON.stringify([s2.hp, s3.hp, want, s3.log]));
  // ---- 2. 한 칸 옮기면 0 ----
  await T(A.page, "setup", 10); await T(A.page, "hp", 1000);
  await T(A.page, "mon", 1, 0); await T(A.page, "sc", 1);
  const d1 = await T(A.page, "turn");
  const d2 = await T(A.page, "step", 0, -1);
  const d3 = await T(A.page, "turn");
  check("step one tile off the orange tile → the smash misses (no damage, \"피했다\")", d1.smash[0] && !d3.smash[0] && d3.hp === d1.hp && /강타를 피했다/.test(d3.log), JSON.stringify([d1, d2.hp, d3]));
  // ---- 3. 회피로도 0 (제자리 근처로 굴러도 무적) ----
  await T(A.page, "setup", 10); await T(A.page, "hp", 1000);
  await T(A.page, "mon", 1, 0); await T(A.page, "sc", 1);
  const r1 = await T(A.page, "turn"); await T(A.page, "turn");
  const r3 = await T(A.page, "dodge", -1, 0);
  check("dodge roll on the landing turn → no damage", !r3.smash[0] && r3.hp === r1.hp, JSON.stringify([r1.hp, r3]));
  // ---- 4. 예고 중에 쓰러뜨리면 취소 ----
  await T(A.page, "setup", 10); await T(A.page, "hp", 1000);
  const i4 = await T(A.page, "mon", 1, 0); const keep = await T(A.page, "mon", -3, -3); await T(A.page, "sc", 1);
  await T(A.page, "turn"); await T(A.page, "kill", i4);
  const k2 = await T(A.page, "turn"); const k3 = await T(A.page, "turn");
  check("kill the monster while it winds up → no smash", k3.hp === 1000 && !/강타에 맞아/.test(k3.log) && k2.smash.every(x => !x), JSON.stringify(k3));
  // ---- 5. 보스·정예가 먼저, 원거리·황금 고블린은 안 함 ----
  await T(A.page, "setup", 10);
  await T(A.page, "mon", 1, 0); await T(A.page, "mon", -1, 0, { kind: "elite" }); await T(A.page, "sc", 1);
  const e1 = await T(A.page, "turn");
  check("an elite next to me smashes before a normal monster", !e1.smash[0] && e1.smash[1], JSON.stringify(e1.smash));
  await T(A.page, "setup", 10);
  await T(A.page, "mon", 1, 0, { ranged: true, rcd: 99 }); await T(A.page, "mon", -1, 0, { kind: "golden", fleeAt: 1e9 }); await T(A.page, "sc", 1);
  const g1 = await T(A.page, "turn");
  check("ranged monsters and golden goblins never smash", g1.smash.every(x => !x), JSON.stringify(g1.smash));
  // ---- 6. 보통 공격은 ×0.8 ----
  await T(A.page, "setup", 10); await T(A.page, "hp", 1000);
  await T(A.page, "mon", 1, 0, { atk: 100, ready: true, el: null }); await T(A.page, "sc", 99);
  const h0 = await T(A.page, "turn");
  const hit = 1000 - h0.hp;
  check(`normal hits are ×${M.SMASH.hitMul} (attack 100, no armour → ${hit})`, hit >= 75 && hit <= 82, String(hit));
  // ---- 7. 회복 구슬 ----
  await T(A.page, "setup", 10); await T(A.page, "hp", 900); await T(A.page, "rand", 0);
  const o1 = await T(A.page, "mon", 2, 0); await T(A.page, "mon", -3, 3);
  const q1 = await T(A.page, "kill", o1);
  check("HP above half → no heal orb even on a lucky roll", q1.heals.length === 0, JSON.stringify(q1.heals));
  await T(A.page, "hp", 300); const o2 = await T(A.page, "mon", 2, 0);
  const q2 = await T(A.page, "kill", o2);
  check("HP below half → a red heal orb drops where the monster fell", q2.heals.length === 1 && q2.heals[0].x === q2.x + 2, JSON.stringify(q2));
  await sleep(150); await A.page.screenshot({ path: path.join(SHOTS, "run155-heal-orb.png") }).catch(() => {});
  await T(A.page, "rand", 0.99);
  const o3 = await T(A.page, "mon", 2, 1); const q3 = await T(A.page, "kill", o3);
  const o4 = await T(A.page, "mon", 2, -1, { kind: "elite" }); const q4 = await T(A.page, "kill", o4);
  check(`normal monster drops it only by chance (${M.RESCUE.chance * 100}%), an elite always`, q3.heals.length === 1 && q4.heals.length === 2, JSON.stringify([q3.heals, q4.heals]));
  await T(A.page, "rand", null);
  const before = (await T(A.page, "st")).hp;
  const q5 = await T(A.page, "step", 1, 0);
  check(`walk next to the 2 orbs → each heals max HP × ${M.RESCUE.heal}`, q5.heals.length === 0 && q5.hp === Math.min(q5.max, before + 2 * Math.round(q5.max * M.RESCUE.heal)) && /회복 구슬/.test(q5.log), JSON.stringify([before, q5]));
  // ---- 8. 버티기: 층마다 한 번 ----
  await T(A.page, "setup", 10); await T(A.page, "hp", 50);
  await T(A.page, "mon", 1, 0); await T(A.page, "sc", 1);
  const g0 = await T(A.page, "st");
  check("guard ready is the normal state: nothing extra in the status line (keeps the phone layout)", !/버티기/.test(g0.status), g0.status);
  await T(A.page, "turn"); await T(A.page, "turn");
  await T(A.page, "mon", 0, 1, { atk: 100, ready: true });   // 강타 다음 차례에 때리는 몬스터 (같은 턴)
  const z1 = await T(A.page, "turn");
  check("a lethal smash → guard: HP 1, the rest of that turn's hits are blocked, dodge and potion ready, red flash", !z1.over && z1.hp === 1 && z1.ls === 1 && z1.jc === 0 && z1.pc === 0 && z1.flash && /버티기/.test(z1.log), JSON.stringify(z1));
  await sleep(120); await A.page.screenshot({ path: path.join(SHOTS, "run155-guard.png") }).catch(() => {});
  check("status shows the guard is used", /버티기 사용함/.test(z1.status), z1.status);
  const z2 = await T(A.page, "turn");
  check("second lethal hit on the same floor → down", z2.over, JSON.stringify(z2));
  check("no page errors (2D)", A.errors.length === 0, A.errors.join("; "));
  await A.ctx.close();

  // ---- 9. 버티기·강타 박자는 저장되고 다음 층에서 다시 ----
  const B = await open({ ...BASE, rl_save: save() });
  await T(B.page, "setup", 10); await T(B.page, "hp", 5); await T(B.page, "mon", 1, 0, { atk: 100, ready: true }); await T(B.page, "sc", 4);
  const b1 = await T(B.page, "turn");
  check("guard used on floor 10", b1.ls === 1 && b1.hp === 1, JSON.stringify(b1));
  await T(B.page, "reload"); await B.page.reload(); await B.page.waitForFunction(() => window.__t); await sleep(300);
  const b2 = await T(B.page, "st");
  check("reload keeps \"guard used\" and the smash beat on this floor", b2.ls === 1 && b2.sc === b1.sc, JSON.stringify([b1.sc, b2]));
  await T(B.page, "setup", 11); const b3 = await T(B.page, "st");
  check("next floor: the guard is ready again", b3.ls === 0 && !/버티기/.test(b3.status), JSON.stringify(b3));
  check("no page errors (save)", B.errors.length === 0, B.errors.join("; "));
  await B.ctx.close();

  // ---- 10. 3D: 예고가 3턴 (한 턴 0.5초) ----
  const C = await open({ ...BASE, rl_3d: "1", rl_save: save() });
  await sleep(1500);
  await T(C.page, "setup", 10); await T(C.page, "mon", 1, 0); await T(C.page, "sc", 1);
  let c1 = null; for (let i = 0; i < 40 && !c1?.smash[0]; i++) { await sleep(50); c1 = await T(C.page, "st"); }   // 3D는 시계가 턴을 돌림
  check("3D: the smash warning lasts 3 turns (~1.5 s)", c1.smash[0]?.t === M.SMASH.windup3d, JSON.stringify(c1.smash));
  await sleep(100); const c2 = await T(C.page, "st");
  check("3D: the mark is under my feet (out of view) → the screen edge glows orange with the turns left", c2.warn3d, JSON.stringify(c2));
  await sleep(200); await C.page.screenshot({ path: path.join(SHOTS, "run155-3d.png") }).catch(() => {});
  check("no page errors (3D)", C.errors.length === 0, C.errors.join("; "));
  await C.ctx.close();
} catch (e) {
  console.log("ERROR", e.message);
  results.push(false);
} finally {
  await browser.close(); await browserGL.close();
}
const fail = results.filter(r => !r).length;
console.log(`\n${results.length - fail} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
