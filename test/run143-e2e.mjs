// dc#143: 넓은 지역 (복도 대신 트인 동굴, 몬스터가 많을수록 넓게) · 몬스터를 다 잡으면 보스가 부하와 함께 · 마지막 적 자리에 계단
//   · 주변 2칸 아이템 자동 줍기 · 지도에 보물·계단·보스·가장 좋은 장비 표시 · 레벨이 더 쉽게 오르고 레벨 업마다 축복
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
const require = createRequire(process.env.NODE_PATH + "/");
const { chromium } = require("playwright");
const REPO = process.argv[2], SHOTS = process.argv[3];
const ORIGIN = "https://hucksoon.github.io/hucksoon/";
const results = [];
const check = (n, ok, x = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x && !ok ? " — " + x : ""}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const HOOK = `
  window.__t = {
    s: () => ({ scene, depth, w: MAP_W, h: MAP_H, n: enemies.length, open: floorSt.open, boss: floorSt.boss, stairs: map.flat().filter(c => c === STAIRS).length,
      bosses: enemies.filter(e => e.kind === "boss").length, lv: player.plvl, xpNext: player.xpNext, gold: player.gold, pend: Bless.pending(),
      title: document.getElementById("bless-title").textContent, modal: !document.getElementById("bless-modal").hidden }),
    size: (n) => openSize(n),
    floor: (d) => { depth = d; newLevel(generateDungeon()); render(); },
    // 내 자리에서 걸어서 갈 수 있는 바닥 / 전체 바닥
    reach: () => { const k = (x, y) => y * MAP_W + x, seenK = new Set([k(player.x, player.y)]), q = [[player.x, player.y]]; let total = 0;
      for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) if (map[y][x] !== WALL) total++;
      while (q.length) { const [x, y] = q.pop(); for (const [dx, dy] of DIRS) { const nx = x + dx, ny = y + dy; if (map[ny]?.[nx] !== undefined && map[ny][nx] !== WALL && !seenK.has(k(nx, ny))) { seenK.add(k(nx, ny)); q.push([nx, ny]); } } }
      return { got: seenK.size, total }; },
    killAll: () => { const last = enemies.filter(e => e.hp > 0); for (const e of last) { e.hp = 0; killEnemy(e); } render(); return last.length; },
    clear: () => { enemies = []; items = []; render(); },
    // 내 주변 r칸(대각선 포함) 거리의 빈 바닥에 골드 더미
    dropAt: (r, amount) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const x = player.x + dx, y = player.y + dy;
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || map[y]?.[x] !== FLOOR) continue; items.push({ x, y, type: "gold", amount }); return true; } return false; },
    // 가 보지 않은 먼 곳에 보물·장비, 보스 하나
    hide: () => { const far = []; for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) if (map[y][x] === FLOOR && !seen[y][x] && near8({ x, y }, player) > 8) far.push({ x, y });
      const [a, b, c, d] = far.filter((_, i) => i % 17 === 0);
      items.push({ ...a, type: "treasure" }, { ...b, type: "gear", item: (() => { for (let i = 0; ; i++) { const it = RLItems.generate("t143|g" + i, "drop", 10); if (it.rarity === "common") return it; } })() }, { ...c, type: "gear", item: RLItems.generate("t143|g2", "golden", 10) });
      enemies.push({ ...d, ...RLMonsters.makeNormalBoss(5) }); render();
      return { unseen: [a, b, c, d].every(p => !seen[p.y][p.x]), best: rarityColor(items[items.length - 1].item) }; },
    marks: () => mapMarks().map(m => m.k + (m.color ? ":" + m.color : "")),
    full: (on) => { fullMap = on; render(); },
    // 넓은 광장 (dc#145): 가장자리 띠 안쪽에서 벽(기둥) 비율, 한가운데 마당이 비었는지, 기둥 덩어리 수
    arena: () => { const A = lastArena, B = A.band + 1; let inner = 0, walls = 0, centerWalls = 0; const cx = A.ax + A.aw / 2, cy = A.ay + A.ah / 2, cr = Math.min(A.aw, A.ah) * ARENA.center - 1.5;
      for (let y = A.ay + B; y < A.ay + A.ah - B; y++) for (let x = A.ax + B; x < A.ax + A.aw - B; x++) { inner++; if (map[y][x] === WALL) { walls++; if (Math.hypot(x - cx, (y - cy) * 1.25) < cr) centerWalls++; } }
      return { inner, walls, ratio: walls / inner, centerWalls }; },
    // 위험할 때 회피 튜토리얼: 몬스터 셋을 붙이고 한 턴
    danger: () => { enemies = []; for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0]]) { const e = { ...RLMonsters.makeNormal(RLMonsters.pickType(2, Math.random), "normal", 2), x: player.x + dx, y: player.y + dy }; e.atk = 0; e.hp = e.maxHp = 1e6; map[e.y][e.x] = FLOOR; enemies.push(e); } player.jumpCd = 0; endTurn(); return store.get("rl_tip_dodge"); },
    xp: (n) => gainXp(n),
    near: (n) => { player.xp = player.xpNext - n; },
    auto: () => Bless.autoRest(),
    save: () => saveGame(true),
    turn: () => endTurn(),
  };
  // ---- 시작 ----`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
async function open(storage) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 } }); const page = await ctx.newPage(); const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("dialog", d => d.accept());
  await ctx.route(ORIGIN + "**", r => { const f = new URL(r.request().url()).pathname.replace("/hucksoon/", "") || "index.html";
    if (f === "ranking-config.js") return r.fulfill({ contentType: "text/javascript", body: `window.RANKING_API = "";` });
    const p = path.join(REPO, f); if (!fs.existsSync(p)) return r.fulfill({ status: 404, body: "" });
    let body = fs.readFileSync(p, "utf8"); if (f === "index.html") body = body.replace("  // ---- 시작 ----", HOOK);
    r.fulfill({ contentType: f.endsWith(".js") ? "text/javascript" : "text/html", body }); });
  await ctx.addInitScript((s) => { if (!sessionStorage.getItem("s")) { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); sessionStorage.setItem("rl_scene", "dungeon"); sessionStorage.setItem("s", 1); } }, storage);
  await page.goto(ORIGIN);
  await page.waitForFunction(() => window.__t);
  await sleep(200);
  return { ctx, page, errors };
}
const save = (run) => JSON.stringify({ v: 1, best: 3, run: { d: 1, hp: 200, mh: 200, a: 40, g: 0, l: 5, x: 0, xn: 100, rid: "r143", k: 0, pp: 0, ...run } });
const T = (page, fn, ...a) => page.evaluate(([f, a]) => window.__t[f](...a), [fn, a]);
// 새 규칙 (rl_oldtown off), 축복 끔 (창이 막지 않게)
const BASE = { rl_oldtown: "off", rl_bless: "off", rl_autogear: "1", rl_market: "paused", rl_device_id: "r143-dev" };

try {
  // ---- 1. 넓은 지역: 몬스터가 많을수록 넓게, 모든 바닥이 이어짐 ----
  const A = await open({ ...BASE, rl_save: save({}) });
  const z1 = await T(A.page, "size", 8), z2 = await T(A.page, "size", 60), z3 = await T(A.page, "size", 2000);
  check("arena grows with monsters (8 → 60 monsters): small at first (about 19×14, walls around fill the screen), up to 94×70", z1.aw < 22 && z1.ah < 17 && z1.w >= 24 && z1.h >= 18 && z2.aw > z1.aw && z2.ah > z1.ah && z3.aw === 94 && z3.ah === 70 && z3.w === 96, JSON.stringify([z1, z2, z3]));
  let a = await T(A.page, "s");
  check("floor 1: small open area, no stairs yet, stairs closed", a.scene === "dungeon" && a.w >= 24 && a.w < 30 && a.stairs === 0 && a.open === false, JSON.stringify(a));
  const r1 = await T(A.page, "reach");
  check("every floor tile can be reached from the start (floor 1)", r1.got === r1.total && r1.total > 12 * 9 * 0.6, JSON.stringify(r1));
  await T(A.page, "floor", 40);
  a = await T(A.page, "s");
  const r40 = await T(A.page, "reach");
  check(`floor 40 is bigger (${a.w}×${a.h}, ${a.n} monsters) and all connected`, a.w > 55 && a.h > 40 && r40.got === r40.total, JSON.stringify([a, r40]));
  const ar = await T(A.page, "arena");
  check(`open arena with pillars: inner area mostly open (${(ar.ratio * 100).toFixed(1)}% pillars), center yard empty`, ar.ratio > 0.01 && ar.ratio < 0.12 && ar.centerWalls === 0, JSON.stringify(ar));
  await A.page.screenshot({ path: path.join(SHOTS, "run143-open.png") }).catch(() => {});

  // ---- 2. 일반 층: 다 잡으면 마지막 적 자리에 계단 ----
  await T(A.page, "floor", 3);
  const killed = await T(A.page, "killAll");
  a = await T(A.page, "s");
  check("floor 3 (no boss): all monsters down → stairs appear, no boss", killed > 0 && a.stairs === 1 && a.open && a.bosses === 0, JSON.stringify(a));
  check("log says the stairs appeared", (await A.page.locator("#log").innerText()).includes("계단이 나타났다"));

  // ---- 3. 보스 층: 다 잡으면 보스가 부하와 함께 → 보스까지 잡으면 계단 ----
  await T(A.page, "floor", 5);
  a = await T(A.page, "s");
  check("floor 5 starts without a boss", a.bosses === 0 && !a.boss && a.stairs === 0, JSON.stringify(a));
  await T(A.page, "killAll");
  a = await T(A.page, "s");
  check("floor 5: all monsters down → boss + 2 adds appear, still no stairs", a.bosses === 1 && a.boss && a.n === 3 && a.stairs === 0, JSON.stringify(a));
  check("log says the boss came with adds", (await A.page.locator("#log").innerText()).includes("부하 2마리와 함께 나타났다"));
  await T(A.page, "killAll");
  a = await T(A.page, "s");
  check("boss and adds down → stairs appear", a.bosses === 0 && a.stairs === 1 && a.open, JSON.stringify(a));

  // ---- 4. 주변 2칸 자동 줍기 ----
  await T(A.page, "floor", 2); await T(A.page, "clear");
  const g0 = (await T(A.page, "s")).gold;
  const d2 = await T(A.page, "dropAt", 1, 1000), d3 = await T(A.page, "dropAt", 2, 50000);   // dc#147: 1칸
  await T(A.page, "turn"); await sleep(100);
  const g1 = (await T(A.page, "s")).gold;
  check("gold 1 tile away is picked up by itself, 2 tiles away is not (dc#147)", d2 && d3 && g1 - g0 >= 1000 && g1 - g0 < 50000, JSON.stringify({ d2, d3, g0, g1 }));

  // ---- 5. 지도 표시: 가 보지 않은 곳의 보물·보스·가장 좋은 장비·계단 ----
  await T(A.page, "floor", 6); await T(A.page, "clear");
  const hid = await T(A.page, "hide");
  let mk = await T(A.page, "marks");
  check("map marks unseen treasure, boss and the best gear (golden drop, its rarity color)", hid.unseen && mk.includes("treasure") && mk.includes("boss") && mk.includes(`best:${hid.best}`) && mk.filter(k => k.startsWith("best")).length === 1, JSON.stringify([hid, mk]));
  check("no stairs mark before the floor is cleared", !mk.includes("stairs"));
  await T(A.page, "full", true); await sleep(150);
  await A.page.screenshot({ path: path.join(SHOTS, "run143-fullmap.png") }).catch(() => {});
  await A.page.keyboard.press("Tab"); await sleep(100);
  await T(A.page, "full", false); await sleep(150);
  check("no page errors (open floors · boss · pickup · map)", A.errors.length === 0, A.errors.join("; "));

  // ---- 5b. 위험할 때 회피: 튜토리얼로 한 번만 ----
  await T(A.page, "floor", 3);
  const tip1 = await T(A.page, "danger");
  const log1 = await A.page.locator("#log").innerText();
  await T(A.page, "danger");
  const log2 = await A.page.locator("#log").innerText();
  const count = (t) => t.split("위험할 때는 회피").length - 1;
  check("surrounded by 3 monsters → one-time dodge tutorial, not repeated", tip1 === "1" && count(log1) === 1 && count(log2) === 1, JSON.stringify([tip1, count(log1), count(log2)]));
  // ---- 6. 크기는 저장했다가 그대로 불러옴 ----
  await T(A.page, "floor", 40); await T(A.page, "save");
  const before = await T(A.page, "s");
  await A.page.reload(); await A.page.waitForFunction(() => window.__t); await sleep(300);
  const after = await T(A.page, "s");
  check("reload keeps the floor size and depth", after.w === before.w && after.h === before.h && after.depth === 40, JSON.stringify([before, after]));
  check("no page errors (reload)", A.errors.length === 0, A.errors.join("; "));
  await A.ctx.close();

  // ---- 7. 레벨: 다음 레벨까지 ×1.3, 레벨 업마다 축복 ----
  const L = await open({ ...BASE, rl_bless: "on", rl_save: save({ l: 5, x: 0, xn: 100 }) });
  await T(L.page, "auto"); await sleep(100);
  let l = await T(L.page, "s");
  check("blessings on: floor blessing picked, nothing waiting", l.pend === 0 && !l.modal, JSON.stringify(l));
  await T(L.page, "near", 1); await T(L.page, "xp", 3); await sleep(150);
  l = await T(L.page, "s");
  check("level up 5 → 6: next level needs ×1.3 (100 → 130)", l.lv === 6 && l.xpNext === 130, JSON.stringify(l));
  check("level up opens a blessing pick titled level up", l.pend === 1 && l.modal && l.title.includes("레벨 업") && l.title.includes("6"), JSON.stringify(l));
  await L.page.screenshot({ path: path.join(SHOTS, "run143-levelup.png") }).catch(() => {});
  await T(L.page, "auto"); await sleep(100);
  l = await T(L.page, "s");
  check("picking it closes the window", l.pend === 0 && !l.modal, JSON.stringify(l));
  check("no page errors (level)", L.errors.length === 0, L.errors.join("; "));
  await L.ctx.close();

  // ---- 8. 큰 층에서 3D 화면 ----
  const D = await open({ ...BASE, rl_3d: "1", rl_save: save({ d: 30 }) });
  await sleep(1200);
  const d = await T(D.page, "s");
  check("3D view on a big open floor: no page errors", d.w > 40 && D.errors.length === 0, JSON.stringify(d) + D.errors.join("; "));
  await D.ctx.close();
} catch (e) {
  console.log("ERROR", e.message);
  results.push(false);
} finally {
  await browser.close();
}
const fail = results.filter(r => !r).length;
console.log(`\n${results.length - fail} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
