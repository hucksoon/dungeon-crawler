// dc#146: 몬스터 무리 (한 층 몬스터 ×2, 한 마리당 경험치·드롭·골드 ×0.5) · 처음부터 기본 스킬 마력탄 (2칸 거리 몬스터)
//   · 첫 레벨 업이 금방 (다음 레벨까지 6) · 첫 레벨 업에는 속성 스킬 셋 중에서 · 2칸 자동 줍기는 3D에서도
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
    s: () => ({ scene, depth, n: enemies.filter(e => e.kind !== "golden" && e.kind !== "boss").length, lv: player.plvl, xp: player.xp, xpNext: player.xpNext, gold: player.gold, d3: View3D.active(),
      pend: Bless.pending(), title: document.getElementById("bless-title").textContent, modal: !document.getElementById("bless-modal").hidden }),
    floor: (d) => { depth = d; newLevel(generateDungeon()); render(); },
    foes: () => enemies.filter(e => e.kind === "normal" || e.kind === "elite").slice(0, 3).map(e => ({ xp: e.xp, dropMul: e.dropMul, goldMul: e.goldMul, kind: e.kind })),
    rawXp: (d) => { const m = RLMonsters.makeNormal(RLMonsters.pickType(monLevel(), Math.random), "normal", d); return m; },
    fresh: () => FRESH.xpNext,
    // 몬스터 둘: 바로 옆(1칸)과 2칸 거리. 둘 다 HP 많고 공격 0
    two: () => { enemies = []; items = []; const mk = (dx, dy) => { const e = { ...RLMonsters.makeNormal(RLMonsters.pickType(2, Math.random), "normal", 2), x: player.x + dx, y: player.y + dy }; e.hp = e.maxHp = 1e6; e.atk = 0; map[e.y][e.x] = FLOOR; visible[e.y][e.x] = true; enemies.push(e); return e; };
      for (let k = 1; k <= 2; k++) map[player.y][player.x + k] = FLOOR; const far = mk(2, 0); render(); return far.hp; },
    farHp: () => enemies[0]?.hp,
    wait: () => { Anim.newTurn(); endTurn(); },
    xp: (n) => gainXp(n),
    // 2칸 거리 빈 바닥에 골드 더미
    dropAt: (r, amount) => { enemies = []; for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const x = player.x + dx, y = player.y + dy;
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || map[y]?.[x] !== FLOOR) continue; items.push({ x, y, type: "gold", amount }); return true; } return false; },
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
const save = (run = {}) => JSON.stringify({ v: 1, best: 3, run: { d: 1, hp: 300, mh: 300, a: 40, g: 0, l: 1, x: 0, xn: 6, rid: "r146", k: 0, pp: 0, ...run } });
const T = (page, fn, ...a) => page.evaluate(([f, a]) => window.__t[f](...a), [fn, a]);
const BASE = { rl_oldtown: "off", rl_bless: "off", rl_autogear: "1", rl_market: "paused", rl_device_id: "r146-dev", rl_3d: "0", rl_tut: JSON.stringify(["intro"]), rl_tip_dodge: "1" };

try {
  // ---- 1. 규칙 ----
  check("swarm rule: monsters ×2, xp/drop/gold ×0.5", M.SWARM.count === 2 && M.SWARM.xp === 0.5 && M.SWARM.drop === 0.5 && M.SWARM.gold === 0.5);

  // ---- 2. 몬스터 수 ×2, 한 마리당 경험치·드롭·골드 절반 ----
  const A = await open({ ...BASE, rl_save: save() });
  await T(A.page, "floor", 6);
  const a = await T(A.page, "s"), L = M.effLevel(6);
  check(`floor 6: about twice the monsters (${a.n}, before ${4 + L}~${6 + 2 * L})`, a.n >= (4 + L) * 2 - 2, JSON.stringify(a));
  const foes = await T(A.page, "foes");
  check("each monster: half xp, drop ×0.5, gold ×0.5", foes.length > 0 && foes.every(f => f.dropMul === 0.5 && f.goldMul === 0.5 && f.xp >= 1), JSON.stringify(foes));
  check("first level comes quickly: next level needs 6 xp in a new run", (await T(A.page, "fresh")) === 6);

  // ---- 3. 기본 스킬 마력탄: 2칸 거리 몬스터를 때림 ----
  const h0 = await T(A.page, "two");
  for (let i = 0; i < 3; i++) await T(A.page, "wait");
  const h1 = await T(A.page, "farHp");
  check("starter skill hits the monster 2 tiles away (no blessing needed)", h1 < h0, JSON.stringify([h0, h1]));
  check("no page errors (swarm · starter)", A.errors.length === 0, A.errors.join("; "));
  await A.ctx.close();

  // ---- 4. 첫 레벨 업: 속성 스킬 셋 중에서 ----
  const B = await open({ ...BASE, rl_bless: "on", rl_save: save({ bz: { normal: 1 } }) });
  await sleep(200);
  await T(B.page, "xp", 6); await sleep(200);
  const b = await T(B.page, "s");
  const cards = await B.page.locator("#bless-cards .bless-card b").allInnerTexts();
  check("first level up → pick a first skill: fireball / frost / lightning only", b.lv === 2 && b.modal && b.title.includes("첫 스킬") && cards.length === 3 && cards.every(c => ["화염구", "얼음 폭발", "연쇄 번개"].includes(c)), JSON.stringify([b, cards]));
  await B.page.screenshot({ path: path.join(SHOTS, "run146-first-skill.png") }).catch(() => {});
  check("no page errors (first skill)", B.errors.length === 0, B.errors.join("; "));
  await B.ctx.close();

  // ---- 5. 3D에서도 2칸 자동 줍기 ----
  const D = await open({ ...BASE, rl_3d: "1", rl_save: save({ d: 2 }) });
  await sleep(1500);
  const d0 = await T(D.page, "s");
  const put = await T(D.page, "dropAt", 2, 777);
  await sleep(1500);   // 3D는 0.5초마다 한 턴
  const d1 = await T(D.page, "s");
  check("3D: gold 2 tiles away is picked up by itself", d0.d3 && put && d1.gold - d0.gold >= 777, JSON.stringify([d0, d1, put]));
  check("no page errors (3D pickup)", D.errors.length === 0, D.errors.join("; "));
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
