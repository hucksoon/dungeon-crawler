// 새 몬스터 20종 + 황금 고블린 정예·왕 (순간이동, 드롭 개수, 예전 저장 호환)
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
const require = createRequire(process.env.NODE_PATH + "/");
const { chromium } = require("playwright");
const REPO = process.argv[2], OUT = process.argv[3];
const M = createRequire(import.meta.url)(path.join(REPO, "monsters.js"));
const ORIGIN = "https://game.apacimtest.com/";
const results = [];
const check = (n, ok, x = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x && !ok ? " — " + x : ""}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ---- 규칙 (Node) ----
check("40 regular monsters", M.MONSTERS.length === 40);
check("unique ids and glyphs (also vs bosses)", new Set(M.MONSTERS.map(m => m.id)).size === 40 && new Set([...M.MONSTERS, ...M.BOSSES].map(m => m.ch)).size === 43);
check("every floor 1..300 has monsters", Array.from({ length: 300 }, (_, i) => M.pool(i + 1).length).every(n => n >= 2));
check("floor 120 pool is the new deep monsters", M.pool(120).every(m => m.from >= 70));
check("old monsters still on their floors", M.pool(10).some(m => m.id === "minotaur") && M.pool(20).some(m => m.id === "hydra"));
let s = 7; const rand = () => (s = (s * 16807) % 2147483647) / 2147483647;
const count = (d) => { const c = { normal: 0, elite: 0, king: 0 }; for (let i = 0; i < 20000; i++) c[M.goldenRank(d, rand)]++; return c; };
const c5 = count(5), c15 = count(15), c60 = count(60);
check("floor 5: only normal golden", c5.elite === 0 && c5.king === 0);
check("floor 15: ~30% elite, no king", Math.abs(c15.elite / 20000 - 0.3) < 0.02 && c15.king === 0, JSON.stringify(c15));
check("floor 60: ~12% king, ~30% elite", Math.abs(c60.king / 20000 - 0.12) < 0.02 && Math.abs(c60.elite / 20000 - 0.3) < 0.02, JSON.stringify(c60));
const gN = M.makeGolden(60), gE = M.makeGolden(60, "elite"), gK = M.makeGolden(60, "king");
check("elite/king tougher and drop more", gE.hp === Math.round(gN.hp * 3) && gK.hp === Math.round(gN.hp * 6) && gK.def > gE.def && gE.def > gN.def && gN.drops === 2 && gE.drops === 3 && gK.drops === 4);
check("golden harder: flees sooner than before (30)", gN.fleeTurns === 24 && gE.fleeTurns === 20 && gK.fleeTurns === 16);
check("deep golden no longer one-hit (hp at 120 ≥ 800)", M.makeGolden(120).hp >= 800 && M.makeGolden(2).hp === 8);

// ---- 게임 ----
const MAP_W = 32, MAP_H = 24;
const level = (d, enemies, extra = {}) => {
  const map = Array.from({ length: MAP_H }, (_, y) => Array.from({ length: MAP_W }, (_, x) => (x === 0 || y === 0 || x === MAP_W - 1 || y === MAP_H - 1 ? 0 : 1)));
  map[20][28] = 2;
  return JSON.stringify({ rid: "mon-run", d, turn: 0, map: map.map(r => r.join("")).join(""), seen: "1".repeat(MAP_W * MAP_H), px: 10, py: 10, shop: null, enemies, items: [], ...extra });
};
const save = (d) => JSON.stringify({ v: 1, best: d, run: { d, hp: 5000, mh: 5000, a: 50, g: 100, p: 3, l: 30, x: 0, xn: 1e9, rid: "mon-run", k: 0, pp: 0 } });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
async function open(d, lvl) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 1000 } }); const page = await ctx.newPage(); const errors = [];
  page.on("pageerror", e => errors.push(e.message + " @ " + (e.stack || "").split("\n")[1]));
  await ctx.route(ORIGIN + "**", r => { const f = new URL(r.request().url()).pathname.slice(1) || "index.html";
    if (f === "ranking-config.js") return r.fulfill({ contentType: "text/javascript", body: 'window.RANKING_API = "";' });
    const p = path.join(REPO, f); if (!fs.existsSync(p)) return r.fulfill({ status: 404, body: "" });
    r.fulfill({ contentType: f.endsWith(".js") ? "text/javascript" : "text/html", body: fs.readFileSync(p) }); });
  await ctx.route("https://login.xsolla.com/**", r => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await ctx.addInitScript(([s, l]) => { if (sessionStorage.getItem("seeded")) return; sessionStorage.setItem("seeded", 1); sessionStorage.setItem("rl_scene", "dungeon");
    localStorage.setItem("rl_device_id", "mon-dev-0001"); localStorage.setItem("rl_save", s); if (l) localStorage.setItem("rl_level", l); }, [save(d), lvl]);
  await page.goto(ORIGIN); await page.waitForTimeout(400);
  return { page, errors };
}
const L = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("rl_level")));
const logText = (page) => page.locator("#log").innerText();
try {
  // 깊은 층(보스 층 포함)을 여러 번 새로 만들어도 오류 없음, 새 몬스터가 나옴
  const ids = new Set();
  let errs = [];
  for (const d of [45, 95, 120, 125, 150, 200]) for (let i = 0; i < 3; i++) {
    const { page, errors } = await open(d, null);
    await page.keyboard.press(" "); await sleep(150);  // 한 턴 쉬면 층이 저장됨
    errs.push(...errors);
    (await L(page))?.enemies?.forEach(e => ids.add(e.id));
    await page.context().close();
  }
  check("deep floors (45~200, boss floors) build without errors", errs.length === 0, errs.slice(0, 3).join("; "));
  check("new monsters appear on deep floors", ["ancient_dragon", "void_lord", "manticore"].some(id => ids.has(id)), [...ids].join(","));
  check("bosses still spawn on deep boss floors", [...ids].some(id => ["goblin_king", "ogre_chief", "lich_lord"].includes(id)));

  // 황금 고블린 왕: 잡으면 장비 4개
  const king = { x: 11, y: 10, ...M.makeGolden(60, "king"), hp: 1, maxHp: 1, def: 0, fleeAt: 99 };
  let { page, errors } = await open(60, level(60, [king]));
  await page.screenshot({ path: path.join(OUT, "golden-king.png") });
  await page.keyboard.press("ArrowRight"); await sleep(300);
  let lv = await L(page);
  check("king killed → 4 gear drops", lv.enemies.length === 0 && lv.items.filter(i => i.type === "gear").length === 4, JSON.stringify(lv.items.map(i => i.type)));
  check("king kill log uses its name", (await logText(page)).includes("황금 고블린 왕을(를) 잡았다"));
  check("king drops use golden table (rare+)", lv.items.filter(i => i.type === "gear").every(i => ["rare", "epic", "legendary", "set"].includes(i.item.rarity) && i.item.src === "golden"));
  check("no errors (king)", errors.length === 0, errors.join("; "));
  await page.context().close();

  // 정예 황금 고블린: 맞고 살아남으면 순간이동 (확률 1로 고정한 저장본)
  const elite = { x: 11, y: 10, ...M.makeGolden(60, "elite"), hp: 99999, maxHp: 99999, def: 0, blink: 1, fleeAt: 99 };
  ({ page, errors } = await open(60, level(60, [elite])));
  await page.keyboard.press("ArrowRight"); await sleep(300);
  lv = await L(page);
  const g = lv.enemies[0];
  check("elite blinks away after a hit (4+ tiles)", g && Math.abs(g.x - 10) + Math.abs(g.y - 10) >= 4, JSON.stringify(g && { x: g.x, y: g.y }));
  check("blink log shown", (await logText(page)).includes("연막을 터뜨리고 순간이동했다"));
  check("no errors (elite)", errors.length === 0, errors.join("; "));
  await page.context().close();

  // 예전에 저장한 황금 고블린(등급 정보 없음)도 그대로: 잡으면 2개, 움직임 오류 없음
  const old = { x: 11, y: 10, id: "golden_goblin", ch: "g", name: "황금 고블린", color: "#ffd700", kind: "golden", hp: 1, maxHp: 1, atk: 0, def: 0, xp: 10, fleeAt: null };
  const oldFar = { ...old, x: 20, y: 15, hp: 50, maxHp: 50 };
  ({ page, errors } = await open(8, level(8, [old, oldFar])));
  for (let i = 0; i < 4; i++) { await page.keyboard.press(i ? " " : "ArrowRight"); await sleep(120); }
  lv = await L(page);
  check("old saved golden: 2 drops", lv.items.filter(i => i.type === "gear").length === 2);
  check("old saved golden: flee timer from default (24)", (await logText(page)).includes("24턴 안에"));
  check("no errors (old save)", errors.length === 0, errors.join("; "));

  // 도감: 40 + 보스 3 + 황금 1, 황금 고블린 카드 3장
  await page.keyboard.press("b"); await sleep(200);
  check("dex total 49 (+5 named)", (await page.locator("#dex-count").innerText()).includes("/49"));
  const dexText = await page.locator("#dex-modal").innerText();
  check("dex golden section explains elite and king", dexText.includes("정예(금색 테두리)") && dexText.includes("왕(빨간 테두리)"));
  check("dex shows 3 golden cards", await page.locator("#dex-modal .dex-grid").nth(1).locator(".dex-card").count() === 3);
  await page.screenshot({ path: path.join(OUT, "dex-golden.png") });
} finally {
  await browser.close();
}
const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
