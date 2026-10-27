// 일반 던전 최대 층 (dc#98부터 50층, 몬스터 레벨 1.5×층) + 드롭 늘리기 (v4 r2): 등급표·드롭 확률·보스 2개·황금 고블린 20%, 예전 아이템 그대로, 서버 검증, 업데이트 안내 줄
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import fs from "node:fs"; import path from "node:path";
const require = createRequire(process.env.NODE_PATH + "/");
const { chromium } = require("playwright");
const REPO = process.argv[2], OUT = process.argv[3];
const I = createRequire(import.meta.url)(path.join(REPO, "items.js"));
const M = createRequire(import.meta.url)(path.join(REPO, "monsters.js"));
const ORIGIN = "https://game.apacimtest.com/";
const results = []; const check = (n, ok, x = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x && !ok ? " — " + x : ""}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ---- 규칙 ----
check("max floor 50 (monster/item level up to 75), new items v4 r2 or later", M.MAX_FLOOR === 50 && M.CLEAR_STAGE === 51 && M.EFF_MAX === 75 && M.effLevel(50) === 75 && I.RULES_REV >= 2 && I.generate("a|d5|k1", "drop", 5).r === I.RULES_REV);
check("drop chances 15% / 60%, boss 2 rolls, golden goblin 20%", I.DROPS.normal.chance === 0.15 && I.DROPS.elite.chance === 0.6 && I.DROPS.boss.rolls === 2 && M.GOLDEN.chance === 0.2);
const count = (fn, n) => { const c = {}; let k = 0; for (let i = 0; k < n; i++) { const it = fn(i); if (I.isAccessory(it)) continue; k++; c[it.rarity] = (c[it.rarity] || 0) + 1; } return c; };   // 장신구(r7)는 세트 → 레전더리라 빼고
const N = 200000;
const c2 = count(i => I.generate(`r${i}|d30|k${i}`, "drop", 30), N), c1 = count(i => I.generate(`r${i}|d30|k${i}`, "drop", 30, 4, 1), N);
const pct = (c, k) => (c[k] || 0) / N * 100;
check(`r2 drop table: legendary ≈2.5% (${pct(c2, "legendary").toFixed(2)}), set ≈1% (${pct(c2, "set").toFixed(2)}), common ≈45% (${pct(c2, "common").toFixed(1)})`, Math.abs(pct(c2, "legendary") - 2.5) < 0.2 && Math.abs(pct(c2, "set") - 1) < 0.1 && Math.abs(pct(c2, "common") - 45) < 0.6);
check(`old r1 refs keep the old table: legendary ≈1% (${pct(c1, "legendary").toFixed(2)})`, Math.abs(pct(c1, "legendary") - 1) < 0.1);
const b2 = count(i => I.generate(`b${i}|d30|k${i}`, "boss", 30), 100000);
check(`r2 boss table: legendary ≈9% (${((b2.legendary || 0) / 1000).toFixed(2)})`, Math.abs((b2.legendary || 0) / 1000 - 9) < 0.4);
const same = I.generate("keep|d9|k3", "drop", 9, 4, 1), again = I.generate("keep|d9|k3", "drop", 9, 4, 1);
check("old r1 item regenerates identically (id, stats)", same.id === again.id && JSON.stringify(same.main) === JSON.stringify(again.main) && same.r === 1);
let gN = 0, gE = 0; for (let i = 0; i < 100000; i++) { if (I.rollDrop(`g${i}|d9|k${i}`, 9, "normal")) gN++; if (I.rollDrop(`e${i}|d9|k${i}`, 9, "elite")) gE++; }
check(`rollDrop gates ≈15% (${(gN / 1000).toFixed(1)}) / ≈60% (${(gE / 1000).toFixed(1)})`, Math.abs(gN / 1000 - 15) < 0.6 && Math.abs(gE / 1000 - 60) < 0.8);
// 50층 (dc#98): 드롭 확률 ×1.5 (정예는 최대 100%)
let eN = 0, eE = 0; for (let i = 0; i < 100000; i++) { if (I.rollDrop(`g${i}|e9|k${i}`, 14, "normal", 1.5)) eN++; if (I.rollDrop(`e${i}|e9|k${i}`, 14, "elite", 1.5)) eE++; }
check(`rollDrop ×1.5 gates ≈22.5% (${(eN / 1000).toFixed(1)}) / ≈90% (${(eE / 1000).toFixed(1)})`, Math.abs(eN / 1000 - 22.5) < 0.7 && Math.abs(eE / 1000 - 90) < 0.6);

// ---- 게임 ----
const MAP_W = 32, MAP_H = 24;
const map = Array.from({ length: MAP_H }, (_, y) => Array.from({ length: MAP_W }, (_, x) => (x === 0 || y === 0 || x === MAP_W - 1 || y === MAP_H - 1 ? 0 : 1)));
map[20][28] = 2;
const boss = { x: 11, y: 10, ...M.makeBoss(30), hp: 1 };
const level = JSON.stringify({ rid: "dr-run", d: 30, turn: 0, map: map.map(r => r.join("")).join(""), seen: "1".repeat(MAP_W * MAP_H), px: 10, py: 10, shop: null, enemies: [boss], items: [] });
const save = JSON.stringify({ v: 1, f50: 1, season: 4, best: 30, run: { d: 30, hp: 900000, mh: 900000, a: 9000, g: 100, p: 3, l: 30, x: 0, xn: 1e9, rid: "dr-run", k: 0, pp: 0 } });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
async function open(dev, seed) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 1000 } }); const page = await ctx.newPage(); const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await ctx.route(ORIGIN + "**", r => { const f = new URL(r.request().url()).pathname.slice(1) || "index.html";
    if (f === "ranking-config.js") return r.fulfill({ contentType: "text/javascript", body: 'window.RANKING_API = "";' });
    const p = path.join(REPO, f); if (!fs.existsSync(p)) return r.fulfill({ status: 404, body: "" });
    r.fulfill({ contentType: f.endsWith(".js") ? "text/javascript" : "text/html", body: fs.readFileSync(p) }); });
  await ctx.route("https://login.xsolla.com/**", r => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await ctx.addInitScript(([seed, dev]) => { if (sessionStorage.getItem("seeded")) return; sessionStorage.setItem("seeded", 1); sessionStorage.setItem("rl_scene", "dungeon");
    localStorage.setItem("rl_device_id", dev); for (const [k, v] of Object.entries(seed)) localStorage.setItem(k.replace("DEV", dev), v); }, [seed, dev]);
  await page.goto(ORIGIN); await sleep(400);
  return { ctx, page, errors };
}
try {
  // 보스를 잡으면 장비 2개 (r2), 기존 사용자에게 업데이트 안내 줄
  const v4 = I.generate("dr|shop|d20|s1", "golden", 20);
  let { ctx, page, errors } = await open("dr-a", { rl_save: save, rl_level: level, "rl_inv:g:DEV": JSON.stringify({ bag: [v4], equip: Object.fromEntries(I.SLOTS.map(s => [s, null])), log: [], stones: 0 }) });
  check("existing player: update banner (나이트메어 아이템 ×3, 시간 상점, 골드 던전)", await page.locator("#update-note").isVisible() && (await page.locator("#update-note").innerText()).includes("보석") && (await page.locator("#update-note").innerText()).includes("장검"));
  await page.keyboard.press("ArrowRight"); await sleep(250);
  const L = await page.evaluate(() => JSON.parse(localStorage.getItem("rl_level")));
  const gear = L.items.filter(i => i.type === "gear" && i.from === "boss");
  check("banner doesn't block play; boss drops 2 items, both v4 latest rev", !L.enemies.length && gear.length === 2 && gear.every(g => g.item.v === 4 && g.item.r === I.RULES_REV), JSON.stringify(gear.map(g => [g.item.rarity, g.item.r])));
  await page.screenshot({ path: path.join(OUT, "update-banner.png") });
  await page.locator("#update-close").click(); await sleep(100);
  await page.reload(); await sleep(400);
  check("banner closed stays closed after reload", !(await page.locator("#update-note").isVisible()));
  check("no page errors", errors.length === 0, errors.join("; "));
  await ctx.close();
  ({ ctx, page, errors } = await open("dr-new", {}));
  check("brand-new player: no update banner", !(await page.locator("#update-note").isVisible()));
  await ctx.close();
} finally { await browser.close(); }

// ---- 서버 ----
const DIR = path.dirname(new URL(import.meta.url).pathname) + "/php";
const DB = path.join(DIR, "drops.sqlite"); for (const f of [DB, DB + "-wal", DB + "-shm"]) fs.rmSync(f, { force: true });
const CFG = path.join(DIR, "config.drops.php");
fs.writeFileSync(CFG, `<?php\n$c = require __DIR__ . '/config.test.php';\nreturn array_merge($c, ['db_dsn' => 'sqlite:${DB}']);\n`);
const php = spawn("php", ["-S", "127.0.0.1:8099", "-t", path.join(REPO, "ranking-php")], { env: { ...process.env, RANKING_CONFIG: CFG, TEST_JWT_SECRET: "dr" }, stdio: ["ignore", "ignore", "pipe"] });
let phpErr = ""; php.stderr.on("data", d => phpErr += d);
await sleep(700);
try {
  const gate = (seed) => I.rngFrom(`v4|drop?|${seed}`)();
  const findSeed = (fmt, lo, hi) => { for (let i = 0; ; i++) { const s = fmt(i); const g = gate(s); if (g >= lo && g < hi) return s; } };
  const killSeed = findSeed(i => `drrun|d20|k${i}`, 0.4, 0.6);     // r2 정예 확률 안, 예전 확률 밖
  const potSeed = findSeed(i => `drrun|d20|p${i}`, 0.08, 0.15);    // r2 포션 자리 확률 안, 예전 확률 밖
  const ref = (seed, r) => { const it = I.generate(seed, "drop", 20, 4, r); return { seed, src: "drop", lvl: 20, v: 4, enh: 0, id: it.id, ...(r ? { r } : {}) }; };
  const submit = (guest, gear) => fetch("http://127.0.0.1:8099/api.php?r=score", { method: "POST", headers: { "Content-Type": "application/json", Origin: ORIGIN.slice(0, -1), "X-Guest-Id": guest }, body: JSON.stringify({ stage: 20, plvl: 10, gear }) }).then(r => r.json());
  const me = (guest) => fetch("http://127.0.0.1:8099/api.php?r=me", { headers: { Origin: ORIGIN.slice(0, -1), "X-Guest-Id": guest } }).then(r => r.json());
  const player = async (guest) => (await fetch(`http://127.0.0.1:8099/api.php?r=player&id=${(await me(guest)).id}`, { headers: { Origin: ORIGIN.slice(0, -1) } })).json();
  await submit("dr-guest-0001", [ref(killSeed, 2)]);
  await submit("dr-guest-0002", [ref(killSeed, 1)]);
  await submit("dr-guest-0003", [ref(potSeed, 2)]);
  await submit("dr-guest-0004", [ref(potSeed, 0)]);
  const g1 = (await player("dr-guest-0001")).gear, g2 = (await player("dr-guest-0002")).gear, g3 = (await player("dr-guest-0003")).gear, g4 = (await player("dr-guest-0004")).gear;
  check("server: r2 monster drop in the 40~60% gate accepted, same seed as r1 rejected", !g1.rejected && g1.items.length === 1 && g2.rejected === 1, JSON.stringify([g1.rejected, g2.rejected]));
  check("server: r2 potion-spot drop in the 8~15% gate accepted, as r0 rejected", !g3.rejected && g4.rejected === 1);
  const bossIt = I.generate("drrun|d20|k99", "boss", 20, 4, 2);
  const g5 = await submit("dr-guest-0005", [{ seed: bossIt.seed, src: "boss", lvl: 20, v: 4, enh: 0, id: bossIt.id, r: 2 }]);
  check("server: r2 boss item verifies", !(await player("dr-guest-0005")).gear.rejected);
  check("server: r with old version rejected (v3 + r2)", (await submit("dr-guest-0006", [{ ...ref(killSeed, 2), v: 3 }])).ok && (await player("dr-guest-0006")).gear.rejected === 1);
  const r80 = await fetch("http://127.0.0.1:8099/api.php?r=score", { method: "POST", headers: { "Content-Type": "application/json", Origin: ORIGIN.slice(0, -1), "X-Guest-Id": "dr-guest-0080" }, body: JSON.stringify({ stage: 80, plvl: 10, gear: [] }) }).then(r => r.json());
  check("server: old-format stage 80 (no fl) → 51 (50층 완료)", (await me("dr-guest-0080")).stage === 51, JSON.stringify(await me("dr-guest-0080")));
  // 층 기준 (dc#98): fl 50이면 그대로, 없으면 예전 75층 기준으로 보고 50층 기준으로 바꿈 (올림)
  const post = (guest, body) => fetch("http://127.0.0.1:8099/api.php?r=score", { method: "POST", headers: { "Content-Type": "application/json", Origin: ORIGIN.slice(0, -1), "X-Guest-Id": guest }, body: JSON.stringify({ plvl: 10, gear: [], ...body }) }).then(r => r.json());
  await post("dr-guest-0081", { stage: 40, fl: 50 }); await post("dr-guest-0082", { stage: 60 }); await post("dr-guest-0083", { stage: 51, fl: 50 }); await post("dr-guest-0084", { stage: 70, fl: 50 });
  check("server: stage with fl 50 kept (40), old 60 → 40, 51 = cleared, fl 50 above 51 clamped", (await me("dr-guest-0081")).stage === 40 && (await me("dr-guest-0082")).stage === 40 && (await me("dr-guest-0083")).stage === 51 && (await me("dr-guest-0084")).stage === 51,
    JSON.stringify([(await me("dr-guest-0081")).stage, (await me("dr-guest-0082")).stage, (await me("dr-guest-0084")).stage]));
  // 50층 시드 |e층| (v4 r8): 아이템 레벨 = 1.5 × 층, 드롭 확률 ×1.5 안
  const eKill = findSeed(i => `drrun|e20|k${i}`, 0.6, 0.9), ePot = findSeed(i => `drrun|e20|p${i}`, 0.15, 0.225), eOut = findSeed(i => `drrun|e20|k${i}`, 0.9, 1);
  const eref = (seed, src = "drop", lvl = 30, r = 8) => { const it = I.generate(seed, src, lvl, 4, r); return { seed, src, lvl, v: 4, enh: 0, id: it.id, r }; };
  check("client: e20 = item level 30", M.effLevel(20) === 30);
  const submitE = (guest, gear) => post(guest, { stage: 20, fl: 50, gear });   // 50층 기준 20층 (레벨 30까지)
  await submitE("dr-guest-0101", [eref(eKill)]); await submitE("dr-guest-0102", [eref(ePot)]); await submitE("dr-guest-0103", [eref(eOut)]);
  check("server: e-seed kill drop in 60~90% (×1.5) accepted, potion spot in 15~22.5% accepted, above 90% rejected", 
    !(await player("dr-guest-0101")).gear.rejected && !(await player("dr-guest-0102")).gear.rejected && (await player("dr-guest-0103")).gear.rejected === 1, JSON.stringify(await Promise.all(["0101", "0102", "0103"].map(async n => (await player("dr-guest-" + n)).gear))));
  await submitE("dr-guest-0105", [eref(eKill, "drop", 20)]); await submitE("dr-guest-0106", [eref(eKill, "drop", 30, 7)]);
  check("server: e-seed with wrong level (20 ≠ 30) or before r8 rejected", (await player("dr-guest-0105")).gear.rejected === 1 && (await player("dr-guest-0106")).gear.rejected === 1);
  await submitE("dr-guest-0107", [eref("drrun|e10|k5", "boss", 15)]); await submitE("dr-guest-0108", [eref("drrun|e12|k5", "boss", 18)]); await submitE("dr-guest-0109", [eref("drrun|e51|k5", "golden", 77)]);
  check("server: e boss on floor 10 (lvl 15) accepted, boss on 12 rejected, floor 51 rejected", !(await player("dr-guest-0107")).gear.rejected && (await player("dr-guest-0108")).gear.rejected === 1 && (await player("dr-guest-0109")).gear.rejected === 1);
  const shopIt = I.shopStock("drrun", 9, 0, { tag: "e", level: 14 })[0];
  await submitE("dr-guest-0110", [{ seed: shopIt.seed, src: shopIt.src, lvl: shopIt.lvl, v: 4, enh: 0, id: shopIt.id, r: shopIt.r }]);
  check("server: shop on floor 9 (e9, lvl 14) accepted", shopIt.lvl === 14 && shopIt.seed.includes("|shop|e9|") && !(await player("dr-guest-0110")).gear.rejected, shopIt.seed);
  check("no php errors", !/Fatal|Warning|Notice|Deprecated/.test(phpErr), phpErr.slice(0, 400));
} finally { php.kill(); }

// ---- 서버: 정식 v1 기록을 50층 기준으로 한 번 바꿈 (dc#98). 클로즈 베타·나이트메어는 그대로 ----
{
  const { DatabaseSync } = await import("node:sqlite");
  const DB2 = path.join(DIR, "floors50.sqlite"); for (const f of [DB2, DB2 + "-wal", DB2 + "-shm"]) fs.rmSync(f, { force: true });
  const CFG2 = path.join(DIR, "config.floors50.php");
  fs.writeFileSync(CFG2, `<?php\n$c = require __DIR__ . '/config.test.php';\nreturn array_merge($c, ['db_dsn' => 'sqlite:${DB2}']);\n`);
  const start = () => spawn("php", ["-S", "127.0.0.1:8140", "-t", path.join(REPO, "ranking-php")], { env: { ...process.env, RANKING_CONFIG: CFG2, TEST_JWT_SECRET: "dr" }, stdio: ["ignore", "ignore", "pipe"] });
  let p2 = start(), err2 = ""; p2.stderr.on("data", d => err2 += d); await sleep(700);
  const board = (q = "") => fetch(`http://127.0.0.1:8140/api.php?r=ranking&type=stage${q}`, { headers: { Origin: ORIGIN.slice(0, -1) } }).then(r => r.json());
  await board();   // 표 만들기 (빈 표라 바꿀 것 없이 끝났다고 남음)
  // 예전(75층 기준) 기록을 넣고, 끝났다는 표시를 지워 배포 직후처럼 만듦
  let db = new DatabaseSync(DB2);
  db.prepare("DELETE FROM meta WHERE k = 'floors50'").run();
  const ins = (t, key, pub, stage, gear) => db.prepare(`INSERT INTO ${t} (pkey, pub_id, kind, display, best_stage, stage_at, stage_gear, item_score, updated_at) VALUES (?, ?, 'guest', ?, ?, 1000, ?, -1, 1000)`).run(key, pub, `게스트 #${key}`, stage, gear);
  ins("players_v4", "old76", "00000000000000a1", 76, JSON.stringify({ stage: 76, gear: [] }));
  ins("players_v4", "old60", "00000000000000a2", 60, null);
  ins("players_v4", "old1", "00000000000000a3", 1, JSON.stringify({ stage: 1, gear: [] }));
  ins("players", "old172", "00000000000000a4", 172, null);
  ins("players_nm", "nm40", "00000000000000a5", 40, JSON.stringify({ stage: 40, gear: [] }));
  db.close();
  const b4 = await board(), b3 = await board("&season=v3"), bn = await board("&season=nm");
  const st = (b, n) => b.rows.find(r => r.name === `게스트 #${n}`)?.stage;
  check("migration: v1 76 → 51 (완료), 60 → 40, 1 → 1", st(b4, "old76") === 51 && st(b4, "old60") === 40 && st(b4, "old1") === 1, JSON.stringify(b4.rows.map(r => [r.name, r.stage])));
  check("migration: closed beta 172 and nightmare 40 untouched", st(b3, "old172") === 172 && st(bn, "nm40") === 40, JSON.stringify([b3.rows, bn.rows].map(x => x.map(r => [r.name, r.stage]))));
  db = new DatabaseSync(DB2);
  const g76 = JSON.parse(db.prepare("SELECT stage_gear FROM players_v4 WHERE pkey = 'old76'").get().stage_gear), flag = db.prepare("SELECT v FROM meta WHERE k = 'floors50'").get();
  // 한 번만: 다시 예전 값을 넣어도 다음 요청에서 또 바꾸지 않음
  db.prepare("UPDATE players_v4 SET best_stage = 60 WHERE pkey = 'old60'").run();
  db.close();
  check("migration: gear record stage 76 → 51, done mark saved", g76.stage === 51 && !!flag?.v, JSON.stringify([g76, flag]));
  p2.kill(); await sleep(200); p2 = start(); p2.stderr.on("data", d => err2 += d); await sleep(700);
  check("migration runs only once", st(await board(), "old60") === 60);
  check("no php errors (migration)", !/Fatal|Warning|Notice|Deprecated/.test(err2), err2.slice(0, 400));
  p2.kill();
}
const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
