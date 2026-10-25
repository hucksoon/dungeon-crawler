// 움직임과 플레이어 그림: 장비가 없으면 속옷만, 낀 장비는 등급 색, 공격·맞음·걷기·쓰러짐 움직임, 움직임 줄이기면 끔
// 캔버스 픽셀을 칸 단위(전체 지도, 한 칸 = 캔버스 32px)로 셈. 시간은 페이지 안에서 키를 누르고 setTimeout으로 잼
import { createRequire } from "node:module";
import fs from "node:fs"; import path from "node:path";
const require = createRequire(process.env.NODE_PATH + "/");
const { chromium } = require("playwright");
const REPO = process.argv[2], OUT = process.argv[3];
const req = createRequire(import.meta.url);
const M = req(path.join(REPO, "monsters.js")), I = req(path.join(REPO, "items.js"));
const ORIGIN = "https://game.apacimtest.com/";
const results = []; const check = (n, ok, x = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x && !ok ? " — " + x : ""}`); };

const MAP_W = 32, MAP_H = 24, D = 20;
const map = Array.from({ length: MAP_H }, (_, y) => Array.from({ length: MAP_W }, (_, x) => (x < 2 || y < 2 || x > 14 || y > 10 ? 0 : 1)));
const mob = (id, x, y, extra = {}) => ({ x, y, ...M.makeMonster(M.MONSTERS.find(m => m.id === id), "normal", D), ...extra });
const level = (enemies) => JSON.stringify({ rid: "anim-run", d: D, turn: 3, map: map.map(r => r.join("")).join(""), seen: "1".repeat(MAP_W * MAP_H), px: 5, py: 5, shop: null, enemies, items: [] });
const save = JSON.stringify({ v: 1, best: D, run: { d: D, hp: 1e6, mh: 1e6, a: 5, g: 10, p: 0, l: 5, x: 0, xn: 1e9, rid: "anim-run", k: 0, pp: 0 } });
// 그 등급의 갑옷 하나 (룬 없음)
const chestOf = (rarity) => { for (let k = 0; k < 5000; k++) { const it = I.generate(`anim|chest|${k}`, "golden", 40); if (it.slot === "chest" && it.rarity === rarity) return it; } throw new Error(rarity); };
const inv = (items) => JSON.stringify({ bag: [], equip: Object.fromEntries(I.SLOTS.map(s => [s, items.find(it => it.slot === s) || null])), log: [], stones: 0 });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
async function open({ enemies = [], gear = [], reduced = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 1000 }, reducedMotion: reduced ? "reduce" : "no-preference" });
  const page = await ctx.newPage(); const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await ctx.route(ORIGIN + "**", r => { const f = new URL(r.request().url()).pathname.slice(1) || "index.html";
    if (f === "ranking-config.js") return r.fulfill({ contentType: "text/javascript", body: 'window.RANKING_API = "";' });
    const p = path.join(REPO, f); if (!fs.existsSync(p)) return r.fulfill({ status: 404, body: "" });
    r.fulfill({ contentType: { ".js": "text/javascript", ".png": "image/png", ".webp": "image/webp" }[path.extname(f)] || "text/html", body: fs.readFileSync(p) }); });
  await ctx.route("https://login.xsolla.com/**", r => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await ctx.addInitScript(([s, l, inv]) => { if (sessionStorage.getItem("seeded")) return; sessionStorage.setItem("seeded", 1); sessionStorage.setItem("rl_scene", "dungeon");
    localStorage.setItem("rl_device_id", "anim-dev-0001"); localStorage.setItem("rl_save", s); localStorage.setItem("rl_level", l);
    localStorage.setItem("rl_inv:g:anim-dev-0001", inv); localStorage.setItem("rl_view", "full"); }, [save, level(enemies), inv(gear)]);
  await page.goto(ORIGIN); await page.waitForTimeout(900);
  return { ctx, page, errors };
}
// 칸 (x, y)의 픽셀 세기. key가 있으면 ms 뒤에 (그 키를 누른 순간부터) 잼
const measure = (page, x, y, key = null, ms = 0) => page.evaluate(([x, y, key, ms]) => new Promise(done => {
  if (key) window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  setTimeout(() => {
    const c = document.getElementById("game"), k = c.width / 640, d = c.getContext("2d").getImageData(x * 20 * k, y * 20 * k, 20 * k, 20 * k).data;
    const n = { red: 0, skin: 0, orange: 0, blue: 0, white: 0 };
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b), sat = mx ? (mx - mn) / mx : 0;
      let h = 0; if (mx !== mn) h = mx === r ? 60 * (((g - b) / (mx - mn)) % 6) : mx === g ? 60 * ((b - r) / (mx - mn) + 2) : 60 * ((r - g) / (mx - mn) + 4); if (h < 0) h += 360;
      if (r > 170 && g < 110 && b < 110) n.red++;
      if (r > 205 && g > 225 && b > 235) n.white++;
      if (r > 180 && g > 120 && g < 200 && b > 80 && b < 170 && r > g && g > b) n.skin++;
      if (sat > 0.45 && mx > 90 && h >= 18 && h <= 45) n.orange++;
      if (sat > 0.35 && mx > 90 && h >= 195 && h <= 235) n.blue++;
    }
    done(n);
  }, ms);
}), [x, y, key, ms]);

// 칸 영역(x0..x1, y0..y1)의 살색 픽셀 무게중심 (캔버스 px). 걸음 중간에 몸이 위로 뜨는지(통통) 봄
const skinCenter = (page, [x0, y0, x1, y1], key = null, ms = 0) => page.evaluate(([x0, y0, x1, y1, key, ms]) => new Promise(done => {
  if (key) window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  setTimeout(() => {
    const c = document.getElementById("game"), k = c.width / 640, T = 20 * k, w = (x1 - x0 + 1) * T, h = (y1 - y0 + 1) * T;
    const d = c.getContext("2d").getImageData(x0 * T, y0 * T, w, h).data;
    let n = 0, sx = 0, sy = 0;
    for (let i = 0; i < d.length; i += 4) { const r = d[i], g = d[i + 1], b = d[i + 2]; if (r > 180 && g > 120 && g < 200 && b > 80 && b < 170 && r > g && g > b) { n++; sx += (i / 4) % w; sy += Math.floor(i / 4 / w); } }
    done(n ? { n, x: sx / n, y: sy / n } : null);
  }, ms);
}), [x0, y0, x1, y1, key, ms]);

try {
  // ---- 플레이어 그림 ----
  let o = await open();
  const naked = await measure(o.page, 5, 5);
  check("no gear: player drawn in underwear only (lots of skin, no armor color)", naked.skin >= 60 && naked.orange < 10 && naked.blue < 10, JSON.stringify(naked));
  await o.page.locator("#game").screenshot({ path: path.join(OUT, "anim-naked.png") });
  check("no page errors", o.errors.length === 0, o.errors.join("; "));
  await o.ctx.close();
  o = await open({ gear: [chestOf("legendary")] });
  const leg = await measure(o.page, 5, 5);
  check("legendary chest: armor drawn in legendary orange, less skin showing", leg.orange >= 40 && leg.skin < naked.skin, JSON.stringify(leg));
  await o.ctx.close();
  o = await open({ gear: [chestOf("rare")] });
  const rare = await measure(o.page, 5, 5);
  check("rare chest: armor drawn in rare blue (color follows the item's rarity)", rare.blue >= 40 && rare.orange < 10, JSON.stringify(rare));
  await o.ctx.close();

  // ---- 공격: 플레이어가 찌르고 맞은 몬스터가 붉게 번쩍, 끝나면 돌아옴 ----
  o = await open({ enemies: [mob("skeleton", 6, 5, { hp: 1e9, maxHp: 1e9, atk: 0 })] });
  const before = await measure(o.page, 6, 5);
  const lunge = await measure(o.page, 6, 5, "ArrowRight", 85);
  check("attack: the player lunges into the monster's tile (skin shows there mid-attack)", lunge.skin > before.skin + 10, `${before.skin} → ${lunge.skin}`);
  const flash = await measure(o.page, 6, 5, null, 60);
  check("attack: the hit monster flashes red", flash.red >= 40 && flash.red > before.red + 30, `${before.red} → ${flash.red}`);
  await o.page.waitForTimeout(800);
  const after = await measure(o.page, 6, 5);
  check("attack: animation ends and the monster looks normal again", Math.abs(after.red - before.red) <= 8 && after.skin <= before.skin + 4, JSON.stringify([before, after]));
  // 걷기: 아래로 한 칸, 처음엔 두 칸 사이에 있다가 도착
  const walkMid = await measure(o.page, 5, 6, "ArrowDown", 35);
  await o.page.waitForTimeout(500);
  const walkEnd = await measure(o.page, 5, 6);
  check("walk: the player slides between tiles, then stands on the new tile", walkMid.skin < walkEnd.skin * 0.85 && walkEnd.skin >= 60, `${walkMid.skin} → ${walkEnd.skin}`);
  // 걷는 느낌: 걸음 가운데(75ms)에서 몸이 위로 뜨고, 옆으로 반쯤 와 있음 (왼쪽으로 한 칸). 숨쉬기(약 1.3px)와 타이머 흔들림만큼 여유
  const box = [2, 4, 8, 8], rest = await skinCenter(o.page, box);
  const hop = await skinCenter(o.page, box, "ArrowLeft", 75);
  await o.page.waitForTimeout(500);
  const land = await skinCenter(o.page, box);
  check("walk: mid-step the body hops up and is halfway to the next tile, then lands level", rest && hop && land && hop.y < Math.min(rest.y, land.y) - 1.5 && Math.abs(land.y - rest.y) < 2 && hop.x < rest.x - 4 && hop.x > land.x + 2, JSON.stringify({ rest, hop, land }));
  check("no page errors during animations", o.errors.length === 0, o.errors.join("; "));
  await o.ctx.close();

  // ---- 몬스터가 때림: 플레이어가 붉게 번쩍 (장비 없음 = 막기·피하기 없음) ----
  o = await open({ enemies: [mob("skeleton", 6, 5, { atk: 30 })] });
  const hurt = await measure(o.page, 5, 5, " ", 280);
  check("monster attack: after the player's turn the monster lunges and the player flashes red", hurt.red >= 30, JSON.stringify(hurt));
  await o.ctx.close();

  // ---- 막음: 방패를 들고 막기 확률이 늘 맞게(Math.random = 0) → 공격이 온 쪽에 하얀 빛 ----
  const shield = (() => { for (let k = 0; k < 5000; k++) { const it = I.generate(`anim|off|${k}`, "golden", 40); if (it.slot === "offhand" && !I.isWeaponLike(it)) return it; } })();
  o = await open({ enemies: [mob("skeleton", 6, 5, { atk: 30 })], gear: [shield] });
  const calm = await measure(o.page, 5, 5);
  await o.page.evaluate(() => { Math.random = () => 0; });
  const block = await measure(o.page, 5, 5, " ", 260);
  const hp = await o.page.evaluate(() => JSON.parse(localStorage.getItem("rl_save")).run.hp);
  check("block: shield parry takes no damage and a white flash shows toward the attacker", hp === 1e6 && block.white > calm.white + 6 && block.red <= calm.red + 5, JSON.stringify({ hp, calm, block }));
  await o.ctx.close();

  // ---- 쓰러짐: 없어진 뒤에도 잠깐 붉게 물들며 사라짐 ----
  o = await open({ enemies: [mob("skeleton", 6, 5, { hp: 1, maxHp: 1, atk: 0, def: 0 })] });
  const dying = await measure(o.page, 6, 5, "ArrowRight", 200);
  const gone = await o.page.evaluate(() => JSON.parse(localStorage.getItem("rl_level")).enemies.length);
  check("death: the monster is removed from the game at once", gone === 0, String(gone));
  check("death: but still fades out in red on screen for a moment", dying.red >= 20, JSON.stringify(dying));
  await o.page.waitForTimeout(800);
  const clear = await measure(o.page, 6, 5);
  check("death: then the tile is empty", clear.red <= 3, JSON.stringify(clear));
  await o.ctx.close();

  // ---- 움직임 줄이기: 번쩍임·미끄러짐 없음 ----
  o = await open({ enemies: [mob("skeleton", 6, 5, { hp: 1e9, maxHp: 1e9, atk: 0 })], reduced: true });
  const rb = await measure(o.page, 6, 5);
  const rf = await measure(o.page, 6, 5, "ArrowRight", 140);
  check("reduced motion: no red flash on hit", rf.red <= rb.red + 5, `${rb.red} → ${rf.red}`);
  const rw = await measure(o.page, 5, 6, "ArrowDown", 35);
  check("reduced motion: the player is on the new tile right away", rw.skin >= 60, JSON.stringify(rw));
  const rr = await skinCenter(o.page, [2, 5, 8, 8]), rh = await skinCenter(o.page, [2, 5, 8, 8], "ArrowLeft", 75);
  check("reduced motion: no hop (body already level on the next tile)", rr && rh && Math.abs(rh.y - rr.y) < 1.5 && rh.x < rr.x - 20, JSON.stringify({ rr, rh }));
  await o.ctx.close();
} finally {
  await browser.close();
}
console.log(`${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
