// 픽셀 그림: 그림 모음(img/sprites.png + sprites.js)에 게임의 모든 몬스터·아이템·지형이 있는지,
// 게임이 그림으로 그리고, 글자 모드 버튼이 기억되고, 그림을 못 받으면 글자로 그리는지
// 던전 시점: 기본은 플레이어 가운데 2배 확대(16×12칸), M·버튼으로 전체 지도(기억)
import { createRequire } from "node:module";
import fs from "node:fs"; import path from "node:path";
const require = createRequire(process.env.NODE_PATH + "/");
const { chromium, devices } = require("playwright");
const REPO = process.argv[2], OUT = process.argv[3];
const req = createRequire(import.meta.url);
const M = req(path.join(REPO, "monsters.js")), I = req(path.join(REPO, "items.js")), SP = req(path.join(REPO, "sprites.js"));
const ORIGIN = "https://game.apacimtest.com/";
const results = []; const check = (n, ok, x = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x && !ok ? " — " + x : ""}`); };

// ---- 그림 모음 ----
const png = fs.readFileSync(path.join(REPO, SP.src));
check("sprites.png is a PNG of cols×rows cells", png.readUInt32BE(16) === SP.cols * SP.size && png.readUInt32BE(20) === SP.rows * SP.size, `${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`);
const cells = Object.values(SP.map);
check("every sprite cell is inside the sheet and cells don't overlap", cells.every(([c, r]) => c >= 0 && c < SP.cols && r >= 0 && r < SP.rows) && new Set(cells.map(String)).size === cells.length);
const mons = [...M.MONSTERS, ...M.BOSSES, M.GOLDEN, ...Object.values(M.NAMED.bosses)].map(m => m.id);
const noMon = mons.filter(id => !SP.map[`mon_${id}`]);
check(`all ${mons.length} monsters (normal, bosses, golden goblin, named) have a sprite`, noMon.length === 0, noMon.join(","));
const itemNames = [...Object.keys(I.WEAPONS).map(t => `item_${t}`), "item_shield", ...Object.keys(I.ARMOR).map(s => `item_${s}`), "item_neck", "item_ring",
  "item_potion", "item_treasure", "gold_s", "gold_l", "rune", ...Object.keys(I.GEMS).map(g => `gem_${g}`)];
const noItem = itemNames.filter(n => !SP.map[n]);
check(`all ${itemNames.length} floor item kinds have a sprite`, noItem.length === 0, noItem.join(","));
const terrain = ["normal", "nm", "hell", "gold"].flatMap(z => [0, 1, 2, 3].flatMap(v => [`floor_${z}_${v}`, `wall_${z}_${v}`]));
check("terrain: floor and wall ×4 variants for normal / nightmare / hell / gold, plus stairs, shop, portal, player",
  [...terrain, "stairs", "shop", "portal", "player"].every(n => SP.map[n]));
const credits = fs.readFileSync(path.join(REPO, "CREDITS.md"), "utf8");
check("CREDITS.md names the CC0 tile source", /CC0/.test(credits) && credits.includes("github.com/crawl/tiles"));

// ---- 게임 화면 ----
const MAP_W = 32, MAP_H = 24, D = 5;
const map = Array.from({ length: MAP_H }, (_, y) => Array.from({ length: MAP_W }, (_, x) => (x < 2 || y < 2 || x > 14 || y > 10 ? 0 : 1)));
map[9][13] = 2;
const enemies = [{ x: 8, y: 5, ...M.makeMonster(M.MONSTERS.find(m => m.id === "goblin"), "normal", D) }];
const items = [{ x: 4, y: 4, type: "gold", amount: 10 }, { x: 4, y: 6, type: "potion" }];
const level = (z = "normal", px = 5, py = 5) => JSON.stringify({ rid: "spr-run", d: D, z, turn: 3, map: map.map(r => r.join("")).join(""), seen: "1".repeat(MAP_W * MAP_H), px, py, shop: null, enemies, items });
const save = JSON.stringify({ v: 1, f50: 1, best: D, run: { d: D, hp: 500, mh: 500, a: 90, g: 10, p: 0, l: 5, x: 0, xn: 1e9, rid: "spr-run", k: 0, pp: 0 } });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
// 그림 칸을 지도 좌표로 보는 검사는 전체 지도(view = "full")로 엶
async function open(name, opts, { noSheet = false, gfx = null, view = "full", lvl = level() } = {}) {
  const ctx = await browser.newContext(opts); const page = await ctx.newPage(); const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await ctx.route(ORIGIN + "**", r => { const f = new URL(r.request().url()).pathname.slice(1) || "index.html";
    if (f === "ranking-config.js") return r.fulfill({ contentType: "text/javascript", body: 'window.RANKING_API = "";' });
    if (noSheet && f === "img/sprites.png") return r.fulfill({ status: 404, body: "" });
    const p = path.join(REPO, f); if (!fs.existsSync(p)) return r.fulfill({ status: 404, body: "" });
    const type = { ".js": "text/javascript", ".png": "image/png", ".webp": "image/webp", ".ico": "image/x-icon" }[path.extname(f)] || "text/html";
    r.fulfill({ contentType: type, body: fs.readFileSync(p) }); });
  await ctx.route("https://login.xsolla.com/**", r => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await ctx.addInitScript(([s, l, gfx, view]) => { if (sessionStorage.getItem("seeded")) return; sessionStorage.setItem("seeded", 1); sessionStorage.setItem("rl_scene", "dungeon");
    localStorage.setItem("rl_device_id", "spr-dev-0001"); localStorage.setItem("rl_save", s); localStorage.setItem("rl_level", l); if (gfx) localStorage.setItem("rl_gfx", gfx); if (view) localStorage.setItem("rl_view", view); }, [save, lvl, gfx, view]);
  await page.goto(ORIGIN); await page.waitForTimeout(800);
  return { ctx, page, errors };
}
// 칸 (x, y)의 서로 다른 색 수 (글자 화면의 벽·바닥은 1~2색, 그림은 무늬가 있어 여러 색)
// colorful: 채도가 있는 픽셀 수 (흰 @ 글자는 0, 파란 갑옷 기사 그림은 많음)
// cell: 화면에서 한 칸의 크기 (전체 지도 20, 가까이 보기 40)
const colorsAt = (page, x, y, colorful = false, cell = 20) => page.evaluate(([x, y, colorful, cell]) => {
  const c = document.getElementById("game"), k = c.width / 640, d = c.getContext("2d").getImageData(Math.round(x * cell * k), Math.round(y * cell * k), Math.round(cell * k), Math.round(cell * k)).data;
  const s = new Set(); let n = 0;
  for (let i = 0; i < d.length; i += 4) { s.add((d[i] >> 3) << 10 | (d[i + 1] >> 3) << 5 | d[i + 2] >> 3); if (Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]) > 40) n++; }
  return colorful ? n : s.size;
}, [x, y, colorful, cell]);

try {
  for (const [name, opts] of [["desktop", { viewport: { width: 1100, height: 1000 } }], ["phone", { ...devices["iPhone 13"] }]]) {
    const { ctx, page, errors } = await open(name, opts);
    const size = await page.evaluate(() => { const c = document.getElementById("game"); return [c.width, c.height, Math.round(c.getBoundingClientRect().width)]; });
    check(`${name}: canvas is drawn at 1.6× (1024×768) and shown at 640px or the screen width`, size[0] === 1024 && size[1] === 768 && size[2] <= 640 && size[2] > 300, size.join(","));
    check(`${name}: no page errors`, errors.length === 0, errors.join("; "));
    const pic = { player: await colorsAt(page, 5, 5, true), mon: await colorsAt(page, 8, 5), wall: await colorsAt(page, 1, 1), floor: await colorsAt(page, 6, 8), stairs: await colorsAt(page, 13, 9) };
    check(`${name}: player (blue knight), monster, wall, floor and stairs are pixel sprites`, pic.player >= 20 && pic.mon >= 12 && pic.wall >= 5 && pic.floor >= 5 && pic.stairs >= 5, JSON.stringify(pic));
    // 글자로 보기 버튼은 없앰 (dc#90): 늘 그림
    check(`${name}: no text/pixel view toggle`, (await page.locator("#gfx-btn").count()) === 0);
    if (name === "desktop") {
      // 도감: 만난 몬스터는 그림으로
      await page.keyboard.press("b"); await page.waitForTimeout(300);
      check("codex shows sprites for seen monsters", (await page.locator("#dex-body .pix").count()) > 0);
      await page.screenshot({ path: path.join(OUT, "sprites-dex.png") });
      await page.keyboard.press("b");
      // 다른 지역은 다른 바닥 (헬)
      const normalWall = await page.evaluate(() => Array.from(document.getElementById("game").getContext("2d").getImageData(16, 16, 1, 1).data).join());
      await page.evaluate((l) => { localStorage.setItem("rl_level", l); const s = JSON.parse(localStorage.getItem("rl_save")); s.run.z = "hell"; localStorage.setItem("rl_save", JSON.stringify(s)); }, level("hell"));
      await page.reload(); await page.waitForTimeout(800);
      const hellWall = await page.evaluate(() => Array.from(document.getElementById("game").getContext("2d").getImageData(16, 16, 1, 1).data).join());
      check("hell floors use different (red) tiles", hellWall !== normalWall, `${normalWall} / ${hellWall}`);
    }
    await page.screenshot({ path: path.join(OUT, `sprites-${name}.png`) });
    await ctx.close();
  }
  // 던전 시점: 기본은 가까이 보기. 플레이어(13,8)가 화면 가운데(16×12칸 중 7.5~8.5, 5.5~6.5)에 크게
  {
    const { ctx, page, errors } = await open("zoom", { viewport: { width: 1100, height: 1000 } }, { view: null, lvl: level("normal", 13, 8) });
    check("zoom: no page errors", errors.length === 0, errors.join("; "));
    check("zoom: map button shows 전체 지도 (M)", (await page.locator("#map-btn").innerText()).includes("전체 지도"));
    const center = await colorsAt(page, 7.5, 5.5, true, 40);
    check("zoom (default): player knight drawn 2× at the screen center", center >= 60, String(center));
    const atFullSpot = await colorsAt(page, 13, 8, true);
    check("zoom: the camera moved — nothing colorful where the player would be on the full map", atFullSpot < 5, String(atFullSpot));
    await page.keyboard.press("m"); await page.waitForTimeout(150);
    const full = { player: await colorsAt(page, 13, 8, true), wall: await colorsAt(page, 1, 1) };
    check("M: full map — player at its map tile, map corner wall visible", full.player >= 20 && full.wall >= 5, JSON.stringify(full));
    check("full map is remembered and the button says 가까이 보기", (await page.evaluate(() => localStorage.getItem("rl_view"))) === "full" && (await page.locator("#map-btn").innerText()).includes("가까이"));
    await page.reload(); await page.waitForTimeout(800);
    check("after reload still full map", (await colorsAt(page, 13, 8, true)) >= 20);
    await page.click("#map-btn"); await page.waitForTimeout(150);
    check("button: back to close view, setting cleared", (await page.evaluate(() => localStorage.getItem("rl_view"))) === null && (await colorsAt(page, 7.5, 5.5, true, 40)) >= 60);
    // 피해 숫자는 확대된 화면에서 맞은 칸 위에: 오른쪽 칸을 공격 (몬스터를 옮겨 둠)
    await page.evaluate(() => { const L = JSON.parse(localStorage.getItem("rl_level")); L.enemies[0].x = 14; L.enemies[0].y = 8; localStorage.setItem("rl_level", JSON.stringify(L)); });
    await page.reload(); await page.waitForTimeout(800);
    await page.keyboard.press("ArrowRight"); await page.waitForTimeout(100);
    const pop = await page.evaluate(() => { const d = document.querySelector("#popups .dmg"), c = document.getElementById("game").getBoundingClientRect(); if (!d) return null; const r = d.getBoundingClientRect(); return [(r.left + r.width / 2 - c.left) / c.width * 16, (r.top + r.height / 2 - c.top) / c.height * 12]; });
    check("damage number appears over the hit monster in the zoomed view (screen tile ≈ 8.5~9.5)", pop && pop[0] > 8.3 && pop[0] < 9.7 && pop[1] > 4 && pop[1] < 7, JSON.stringify(pop));
    await page.screenshot({ path: path.join(OUT, "sprites-zoom.png") });
    await ctx.close();
  }
  // 예전에 글자로 보기를 골랐던 사람(rl_gfx=text)도 그림으로, 설정은 지움
  {
    const { ctx, page, errors } = await open("oldtext", { viewport: { width: 1100, height: 1000 } }, { gfx: "text" });
    check("old text-view setting is ignored: sprites shown and rl_gfx removed", (await colorsAt(page, 1, 1)) >= 5 && (await page.evaluate(() => localStorage.getItem("rl_gfx"))) === null && errors.length === 0);
    await ctx.close();
  }
  // 그림을 못 받으면 글자로
  const { ctx, page, errors } = await open("nosheet", { viewport: { width: 1100, height: 1000 } }, { noSheet: true });
  check("sprite sheet missing: no page errors", errors.length === 0, errors.join("; "));
  check("sprite sheet missing: glyphs drawn instead (flat wall)", (await colorsAt(page, 1, 1)) <= 3);
  await ctx.close();
} finally {
  await browser.close();
}
console.log(`${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
