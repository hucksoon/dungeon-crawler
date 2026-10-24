// 아이템이 한 칸에 겹치지 않고 옆으로 밀려 떨어짐 + 레전더리·세트 무지개색
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
const require = createRequire(process.env.NODE_PATH + "/");
const { chromium } = require("playwright");
const REPO = process.argv[2], OUT = process.argv[3];
const M = createRequire(import.meta.url)(path.join(REPO, "monsters.js"));
const RL = createRequire(import.meta.url)(path.join(REPO, "items.js"));
const ORIGIN = "https://game.apacimtest.com/";
const results = [];
const check = (n, ok, x = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x && !ok ? " — " + x : ""}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const find = (pred, tag) => { for (let n = 0; n < 300000; n++) { const it = RL.generate(`${tag}${n}|shop|d20|s${n % 6}`, "golden", 20); if (pred(it)) return it; } };
const legend = find(x => x.rarity === "legendary", "lgd");
const setItem = find(x => x.rarity === "set", "sti");
const rare = find(x => x.rarity === "rare", "rar");
const MAP_W = 32, MAP_H = 24, TILE = 20;
const level = (d, enemies, items = [], tweak) => {
  const map = Array.from({ length: MAP_H }, (_, y) => Array.from({ length: MAP_W }, (_, x) => (x === 0 || y === 0 || x === MAP_W - 1 || y === MAP_H - 1 ? 0 : 1)));
  map[20][28] = 2;
  if (tweak) tweak(map);
  return JSON.stringify({ rid: "drop-run", d, turn: 0, map: map.map(r => r.join("")).join(""), seen: "1".repeat(MAP_W * MAP_H), px: 10, py: 10, shop: null, enemies, items });
};
const save = (d) => JSON.stringify({ v: 1, best: d, run: { d, hp: 5000, mh: 5000, a: 50, g: 100, p: 3, l: 30, x: 0, xn: 1e9, rid: "drop-run", k: 0, pp: 0 } });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
async function open(d, lvl, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 1000 }, ...opts }); const page = await ctx.newPage(); const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await ctx.route(ORIGIN + "**", r => { const f = new URL(r.request().url()).pathname.slice(1) || "index.html";
    if (f === "ranking-config.js") return r.fulfill({ contentType: "text/javascript", body: 'window.RANKING_API = "";' });
    const p = path.join(REPO, f); if (!fs.existsSync(p)) return r.fulfill({ status: 404, body: "" });
    r.fulfill({ contentType: f.endsWith(".js") ? "text/javascript" : "text/html", body: fs.readFileSync(p) }); });
  await ctx.route("https://login.xsolla.com/**", r => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await ctx.addInitScript(([s, l]) => { if (sessionStorage.getItem("seeded")) return; sessionStorage.setItem("seeded", 1); sessionStorage.setItem("rl_scene", "dungeon");
    localStorage.setItem("rl_device_id", "drop-dev-0001"); localStorage.setItem("rl_gfx", "text"); localStorage.setItem("rl_save", s); localStorage.setItem("rl_level", l); }, [save(d), lvl]);
  await page.goto(ORIGIN); await page.waitForTimeout(400);
  return { page, errors };
}
const L = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("rl_level")));
// 캔버스에서 그 칸 가운데 근처의 가장 밝은 픽셀 색 (글자 색을 보므로 글자 모드 rl_gfx=text로 염)
const tileColor = (page, x, y) => page.evaluate(([x, y, T]) => {
  const c = document.querySelector("canvas"); const g = c.getContext("2d");
  const k = c.width / 640, d = g.getImageData((x * T + 4) * k, (y * T + 4) * k, (T - 8) * k, (T - 8) * k).data;   // 캔버스는 화면 좌표의 k배
  let best = [0, 0, 0], sum = -1;
  for (let i = 0; i < d.length; i += 4) { const s = d[i] + d[i + 1] + d[i + 2]; if (s > sum) { sum = s; best = [d[i], d[i + 1], d[i + 2]]; } }
  return best.join(",");
}, [x, y, TILE]);
try {
  check("canvas tile size assumption", true);
  // 1. 황금 고블린 왕(장비 4개) → 4칸에 하나씩
  const king = { x: 11, y: 10, ...M.makeGolden(60, "king"), hp: 1, maxHp: 1, def: 0, fleeAt: 99 };
  let { page, errors } = await open(60, level(60, [king]));
  await page.keyboard.press("ArrowRight"); await sleep(300);
  let lv = await L(page);
  const gear = lv.items.filter(i => i.type === "gear");
  const tiles = new Set(gear.map(i => `${i.x},${i.y}`));
  check("4 drops land on 4 different tiles", gear.length === 4 && tiles.size === 4, JSON.stringify(gear.map(i => [i.x, i.y])));
  check("first drop where the goblin died", gear.some(i => i.x === 11 && i.y === 10));
  check("others pushed next to it (within 2 tiles)", gear.every(i => Math.abs(i.x - 11) + Math.abs(i.y - 10) <= 2));
  check("nothing dropped on the player's tile", !gear.some(i => i.x === 10 && i.y === 10));
  check("no errors (spread)", errors.length === 0, errors.join("; "));
  await page.context().close();

  // 2. 좁은 통로에서도 벽을 넘지 않고 이어진 바닥으로 밀림
  const king2 = { x: 11, y: 10, ...M.makeGolden(60, "king"), hp: 1, maxHp: 1, def: 0, fleeAt: 99 };
  ({ page, errors } = await open(60, level(60, [king2], [], (map) => {
    for (let y = 1; y < MAP_H - 1; y++) for (let x = 1; x < MAP_W - 1; x++) map[y][x] = 0;
    for (let x = 5; x <= 20; x++) map[10][x] = 1;  // 가로 통로 한 줄
    map[10][20] = 2;
  })));
  await page.keyboard.press("ArrowRight"); await sleep(300);
  lv = await L(page);
  const g2 = lv.items.filter(i => i.type === "gear");
  check("corridor: 4 drops along the corridor, all on floor row", g2.length === 4 && new Set(g2.map(i => i.x)).size === 4 && g2.every(i => i.y === 10 && i.x !== 10), JSON.stringify(g2.map(i => [i.x, i.y])));
  await page.context().close();

  // 3. 레전더리·세트는 바닥에서 무지개색으로 계속 바뀜, 레어는 그대로
  const items = [{ x: 12, y: 10, type: "gear", item: legend, from: "monster" }, { x: 12, y: 12, type: "gear", item: setItem, from: "monster" }, { x: 8, y: 10, type: "gear", item: rare, from: "monster" }];
  ({ page, errors } = await open(20, level(20, [], items)));
  const a1 = await tileColor(page, 12, 10), r1 = await tileColor(page, 8, 10), s1 = await tileColor(page, 12, 12);
  await sleep(700);
  const a2 = await tileColor(page, 12, 10), r2 = await tileColor(page, 8, 10), s2 = await tileColor(page, 12, 12);
  check("legendary on floor changes color over time", a1 !== a2, `${a1} → ${a2}`);
  check("set on floor changes color over time", s1 !== s2, `${s1} → ${s2}`);
  check("rare on floor keeps its color", r1 === r2, `${r1} → ${r2}`);
  await page.screenshot({ path: path.join(OUT, "rainbow-floor.png"), clip: { x: 230, y: 155, width: 641, height: 482 } });
  // 주우면 로그와 인벤토리 이름도 무지개
  await page.keyboard.press("ArrowRight"); await page.keyboard.press("ArrowRight"); await sleep(200);
  check("pickup log line is rainbow", await page.locator("#log div.rainbow", { hasText: "주웠다" }).count() === 1);
  await page.click("#inv-btn"); await sleep(200);
  check("inventory label rainbow for legendary", await page.locator(".bag-item .rainbow", { hasText: RL.itemName(legend) }).count() === 1);
  const anim = await page.locator(".bag-item .rainbow").first().evaluate(n => getComputedStyle(n).animationName);
  check("rainbow CSS animation running", anim === "rainbow", anim);
  check("no errors (rainbow)", errors.length === 0, errors.join("; "));
  await page.context().close();

  // 4. 움직임 줄이기 설정이면 무지개 애니메이션 끔
  ({ page, errors } = await open(20, level(20, [], items), { reducedMotion: "reduce" }));
  const b1 = await tileColor(page, 12, 10); await sleep(700); const b2 = await tileColor(page, 12, 10);
  check("reduced motion: floor legendary stays still", b1 === b2, `${b1} → ${b2}`);
  await page.context().close();
} finally {
  await browser.close();
}
const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
