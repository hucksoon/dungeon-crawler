// dc#162: 부활 — 쓰러진 자리에서 이어서(잡은 몬스터·축복·유물·능력치 그대로, 잠깐 무적, 가까운 몬스터 밀려남, 탄 사라짐),
//   5캐시, 한 판에 한 번(운영자 기기는 몇 번이든), 쓰러진 채로 새로고침해도 그 층 그대로, 랭킹에 보낼 내용에 rv
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
    // 내 둘레 9×9를 바닥으로, 붙은 몬스터 둘(공격 0) + 먼 몬스터 셋, 날아오는 탄 하나
    setup: () => { enemies = []; items = []; shots = []; floorSt.ls = 1; floorSt.sc = 999;
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const x = player.x + dx, y = player.y + dy; if (map[y]?.[x] !== undefined) { map[y][x] = FLOOR; visible[y][x] = true; seen[y][x] = true; } }
      const mk = (dx, dy) => ({ ...RLMonsters.makeNormal(RLMonsters.pickType(2, () => 0.5), "normal", 2), x: player.x + dx, y: player.y + dy, hp: 1e6, maxHp: 1e6, atk: 0, ranged: false, slow: 99 });
      enemies.push(mk(1, 0), mk(0, 1), mk(4, 4), mk(-4, 4), mk(4, -4));
      enemies[0].smash = { x: player.x, y: player.y, t: 2 };
      shots.push({ x: player.x + 3.5, y: player.y + 0.5, vx: -5, vy: 0, life: 3, atk: 1, color: "#f00", from: null });
      render(); },
    die: () => { player.hp = 0; death(); render(); },
    revive: () => doRevive("cash"),
    snap: () => ({ depth, gameOver, revived: !!player.revived, hp: player.hp, maxHp: stats().maxHp, plvl: player.plvl, gold: player.gold, atk: stats().atk,
      bl: JSON.stringify(player.bl || {}), rl: JSON.stringify(player.rl || {}), x: player.x, y: player.y,
      map: map.map(r => r.join("")).join(""), foes: enemies.filter(e => e.hp > 0).map(e => ({ x: e.x, y: e.y, d: near8(e, player), smash: !!e.smash })),
      shots: shots.length, invuln: invuln(), modal: !document.getElementById("death-modal").hidden,
      dead: JSON.parse(localStorage.getItem("rl_save") || "{}").dead || null, level: !!localStorage.getItem("rl_level"),
      revive: document.getElementById("death-revive").innerText, rv: Ranking.payload().rv || 0 }),
    turns: (n) => { for (let i = 0; i < n; i++) endTurn(); return invuln(); },
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
const save = (run = {}) => JSON.stringify({ v: 1, best: 12, run: { d: 8, hp: 1000, mh: 1000, a: 40, g: 777, l: 5, x: 0, xn: 5000, x4: 1, rid: "r162", k: 0, pp: 0, bl: { might: 2, vigor: 1 }, rl: { hawk: 1 }, bz: { normal: 8 }, ...run } });
const T = (page, fn, ...a) => page.evaluate(([f, a]) => window.__t[f](...a), [fn, a]);
const BASE = { rl_oldtown: "off", rl_bless: "on", rl_autogear: "1", rl_market: "paused", rl_device_id: "r162-dev", rl_3d: "0", rl_live: "off", rl_tut: JSON.stringify(["intro"]), rl_tip_dodge: "1" };

try {
  check("rules: revive price 5 cash (default) in the game", /const REVIVE = \{ sku: "revive", cash: "cash", price: 5 \}/.test(fs.readFileSync(path.join(REPO, "index.html"), "utf8")));
  const A = await open({ ...BASE, rl_save: save() });
  await T(A.page, "setup"); await sleep(100);
  const s0 = await T(A.page, "snap");
  await T(A.page, "die"); await sleep(300);
  const s1 = await T(A.page, "snap");
  check("death: death screen with revive offer, floor kept for revive, dead save kept", s1.gameOver && s1.modal && s1.level && !!s1.dead && /캐시 5개로도 부활/.test(s1.revive), JSON.stringify({ level: s1.level, dead: !!s1.dead, revive: s1.revive }));
  await T(A.page, "revive"); await sleep(200);
  const s2 = await T(A.page, "snap");
  check("revive: alive, HP full, same floor and tile", !s2.gameOver && s2.revived && s2.hp === s2.maxHp && s2.depth === s0.depth && s2.x === s0.x && s2.y === s0.y && !s2.modal, JSON.stringify({ hp: s2.hp, max: s2.maxHp, d: s2.depth }));
  check("revive: same map, same monsters (none respawned)", s2.map === s0.map && s2.foes.length === s0.foes.length, JSON.stringify({ before: s0.foes.length, after: s2.foes.length }));
  check("revive: blessings, relics, level, attack, gold all kept", s2.bl === s0.bl && s2.rl === s0.rl && s2.plvl === s0.plvl && s2.atk === s0.atk && s2.gold === s0.gold && s2.bl.includes("might"), JSON.stringify({ bl: s2.bl, rl: s2.rl, gold: s2.gold }));
  check("revive: monsters next to me pushed away (more than 2 tiles), warnings and shots cleared", s2.foes.every(f => f.d > 2 && !f.smash) && s2.shots === 0, JSON.stringify(s2.foes));
  await sleep(2100);   // 2초 무적이 끝난 뒤 턴 무적(3턴)만 남음
  check("revive: briefly invulnerable (2 s + 3 turns), then not", s2.invuln === true && (await T(A.page, "turns", 1)) === true && (await T(A.page, "turns", 2)) === false);
  check("ranking payload carries rv after revive", s2.rv === 1 && s0.rv === 0);
  // 두 번째로 쓰러지면: 이번 판은 이미 부활 → 부활 없음, 쓰러진 층·부활할 판은 남기지 않음
  await T(A.page, "die"); await sleep(300);
  const s3 = await T(A.page, "snap");
  check("second death: no more revive this run (once per run)", s3.gameOver && /이미 부활했어요/.test(s3.revive) && !s3.dead && !s3.level, JSON.stringify({ revive: s3.revive, dead: !!s3.dead, level: s3.level }));
  check("no page errors", A.errors.length === 0, A.errors.join("; "));
  await A.ctx.close();
  // ---- 쓰러진 채로 새로고침해도 그 층 그대로 → 부활하면 그 자리 ----
  const Bp = await open({ ...BASE, rl_save: save({ rid: "r162b" }) });
  await T(Bp.page, "setup"); await sleep(100);
  const b0 = await T(Bp.page, "snap");
  await T(Bp.page, "die"); await sleep(300);
  await Bp.page.reload(); await Bp.page.waitForFunction(() => window.__t); await sleep(600);
  const b1 = await T(Bp.page, "snap");
  check("reload while dead: still dead with the same floor and monsters", b1.gameOver && b1.map === b0.map && b1.foes.length === b0.foes.length && b1.x === b0.x && b1.y === b0.y, JSON.stringify({ over: b1.gameOver, same: b1.map === b0.map, foes: b1.foes.length }));
  await T(Bp.page, "revive"); await sleep(200);
  const b2 = await T(Bp.page, "snap");
  check("revive after reload: same floor, same tile, HP full", !b2.gameOver && b2.map === b0.map && b2.x === b0.x && b2.y === b0.y && b2.hp === b2.maxHp);
  check("no page errors (reload)", Bp.errors.length === 0, Bp.errors.join("; "));
  await Bp.ctx.close();
} finally { await browser.close(); }
const pass = results.filter(Boolean).length;
console.log(`\n${pass} passed, ${results.length - pass} failed`);
process.exit(pass === results.length ? 0 : 1);
