// 일반 던전 75층 + 드롭 늘리기 (v4 r2): 등급표·드롭 확률·보스 2개·황금 고블린 20%, 예전 아이템 그대로, 서버 검증, 업데이트 안내 줄
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
check("max floor 75, new items v4 r2 or later", M.MAX_FLOOR === 75 && M.CLEAR_STAGE === 76 && I.RULES_REV >= 2 && I.generate("a|d5|k1", "drop", 5).r === I.RULES_REV);
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

// ---- 게임 ----
const MAP_W = 32, MAP_H = 24;
const map = Array.from({ length: MAP_H }, (_, y) => Array.from({ length: MAP_W }, (_, x) => (x === 0 || y === 0 || x === MAP_W - 1 || y === MAP_H - 1 ? 0 : 1)));
map[20][28] = 2;
const boss = { x: 11, y: 10, ...M.makeBoss(30), hp: 1 };
const level = JSON.stringify({ rid: "dr-run", d: 30, turn: 0, map: map.map(r => r.join("")).join(""), seen: "1".repeat(MAP_W * MAP_H), px: 10, py: 10, shop: null, enemies: [boss], items: [] });
const save = JSON.stringify({ v: 1, season: 4, best: 30, run: { d: 30, hp: 900000, mh: 900000, a: 9000, g: 100, p: 3, l: 30, x: 0, xn: 1e9, rid: "dr-run", k: 0, pp: 0 } });
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
  check("server clamps stage 80 → 76 (75층 완료)", (await me("dr-guest-0080")).stage === 76, JSON.stringify(await me("dr-guest-0080")));
  check("no php errors", !/Fatal|Warning|Notice|Deprecated/.test(phpErr), phpErr.slice(0, 400));
} finally { php.kill(); }
const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
