// 예전 버전이 저장한 깨진 층(좌표 없는 보스) → 불러와도 플레이어가 보이고 보스는 빈 칸으로 옮겨짐
// 플레이어 @를 흰 픽셀로 찾으므로 글자 모드(rl_gfx=text)·전체 지도(rl_view=full)로. 캔버스는 화면 좌표의 k배 (1.6)
import { createRequire } from "node:module";
import fs from "node:fs"; import path from "node:path";
const require = createRequire(process.env.NODE_PATH + "/");
const { chromium, devices } = require("playwright");
const REPO = process.argv[2], OUT = process.argv[3];
const M = createRequire(import.meta.url)(path.join(REPO, "monsters.js"));
const ORIGIN = "https://game.apacimtest.com/";
const results = []; const check = (n, ok, x = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x && !ok ? " — " + x : ""}`); };
const MAP_W = 32, MAP_H = 24, D = 70;  // 최대 층(75) 안의 깊은 보스 층
const map = Array.from({ length: MAP_H }, (_, y) => Array.from({ length: MAP_W }, (_, x) => (x < 2 || y < 2 || x > 20 || y > 14 ? 0 : 1)));
map[12][19] = 2;
// 꽉 찬 층: 바닥 대부분에 몬스터, 보스는 좌표 없이 (예전 버그: { ...null, ...boss })
const enemies = [];
for (let y = 2; y <= 14; y++) for (let x = 2; x <= 20; x++) if (map[y][x] === 1 && (x + y) % 3 && !(x === 5 && y === 5)) enemies.push({ x, y, ...M.makeMonster(M.MONSTERS[39], "normal", D) });
const boss = M.makeBoss(D);
enemies.push({ ...boss });                       // x, y 없음
enemies.push({ x: 0, y: 0, ...M.makeMonster(M.MONSTERS[38], "normal", D) });  // 벽 위
const items = [{ type: "potion" }, { x: 6, y: 5, type: "gold", amount: 10 }];
const level = JSON.stringify({ rid: "brk-run", d: D, turn: 3, map: map.map(r => r.join("")).join(""), seen: "1".repeat(MAP_W * MAP_H), px: 5, py: 5, shop: null, enemies, items });
const save = JSON.stringify({ v: 1, best: D, run: { d: D, hp: 50000, mh: 50000, a: 900, g: 1567139, p: 84, l: 31, x: 0, xn: 1e9, rid: "brk-run", k: 0, pp: 0 } });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
try {
  for (const [name, opts] of [["desktop", { viewport: { width: 1100, height: 1000 } }], ["phone", { ...devices["iPhone 13"] }]]) {
    const ctx = await browser.newContext(opts); const page = await ctx.newPage(); const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    await ctx.route(ORIGIN + "**", r => { const f = new URL(r.request().url()).pathname.slice(1) || "index.html";
      if (f === "ranking-config.js") return r.fulfill({ contentType: "text/javascript", body: 'window.RANKING_API = "";' });
      const p = path.join(REPO, f); if (!fs.existsSync(p)) return r.fulfill({ status: 404, body: "" });
      r.fulfill({ contentType: f.endsWith(".js") ? "text/javascript" : "text/html", body: fs.readFileSync(p) }); });
    await ctx.route("https://login.xsolla.com/**", r => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
    await ctx.addInitScript(([s, l]) => { if (sessionStorage.getItem("seeded")) return; sessionStorage.setItem("seeded", 1); sessionStorage.setItem("rl_scene", "dungeon");
      localStorage.setItem("rl_device_id", "brk-dev-0001"); localStorage.setItem("rl_gfx", "text"); localStorage.setItem("rl_view", "full"); localStorage.setItem("rl_save", s); localStorage.setItem("rl_level", l); }, [save, level]);
    await page.goto(ORIGIN); await page.waitForTimeout(500);
    check(`${name}: no page errors when loading the broken floor`, errors.length === 0, errors.join("; "));
    check(`${name}: HUD shows floor ${D} and HP (not --)`, (await page.locator("#depth").innerText()) === String(D) && !(await page.locator("#stats").innerText()).includes("--"), await page.locator("#stats").innerText());
    const white = await page.evaluate(([x, y]) => { const c = document.querySelector("canvas"), g = c.getContext("2d"); const k = c.width / 640, d = g.getImageData(x * 20 * k, y * 20 * k, 20 * k, 20 * k).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 240 && d[i + 1] > 240 && d[i + 2] > 240) n++; return n; }, [5, 5]);
    check(`${name}: player @ drawn at its saved spot`, white > 10, String(white));
    await page.keyboard.press("."); await page.waitForTimeout(200);
    const L = await page.evaluate(() => JSON.parse(localStorage.getItem("rl_level")));
    const bosses = L.enemies.filter(e => e.kind === "boss");
    const ok = (p) => Number.isInteger(p.x) && Number.isInteger(p.y) && map[p.y]?.[p.x] !== 0;
    check(`${name}: boss kept and moved onto a free floor tile`, bosses.length === 1 && ok(bosses[0]), JSON.stringify(bosses.map(b => [b.x, b.y])));
    check(`${name}: every enemy and item on the floor, none on the player`, L.enemies.every(ok) && L.items.every(ok) && !L.enemies.some(e => e.x === L.px && e.y === L.py));
    check(`${name}: no two enemies share a tile`, new Set(L.enemies.map(e => `${e.x},${e.y}`)).size === L.enemies.length);
    if (name === "phone") await page.screenshot({ path: path.join(OUT, "broken-level-fixed.png") });
    await ctx.close();
  }
} finally { await browser.close(); }
const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
