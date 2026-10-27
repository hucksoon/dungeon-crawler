// 웨이포인트·묘비 (dc#97): 25·50·75층(나이트메어·헬 10~50층) 웨이포인트를 밟으면 활성화 → 마을 웨이포인트에서 그 층부터,
// 쓰러진 뒤 새로 시작하면 쓰러진 자리에 묘비 → 그 층에 다시 가서 밟으면 골드 90%
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { goDoor } from "./town.mjs";
const require = createRequire(process.env.NODE_PATH + "/");
const { chromium } = require("playwright");
const REPO = process.argv[2], SHOTS = process.argv[3];
const ORIGIN = "https://hucksoon.github.io/hucksoon/";
const results = [];
const check = (n, ok, x = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x ? " — " + x : ""}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const HOOK = `
  window.__t = {
    s: () => ({ scene, depth, zone: player.zone || "normal", gameOver, gold: player.gold, x: player.x, y: player.y, wp: JSON.parse(JSON.stringify(waypoints)), wpSpot, grave, tomb }),
    calm: () => { enemies = []; render(); },
    on: (p) => { const r = arrive(p.x, p.y); render(); updateStats(); return r; },
    die: () => { player.hp = 0; death(); render(); },
    gold: (g) => { player.gold = g; updateStats(); },
    // 계단 칸에 도착 (몬스터·보스는 치움): 내려갔으면 depth가 바뀜
    stairsDown: () => { enemies = []; for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) if (map[y][x] === STAIRS) { arrive(x, y); render(); return { depth }; } return { depth, none: true }; },
  };
  // ---- 시작 ----`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
async function open(storage, scene = "dungeon") {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 } }); const page = await ctx.newPage(); const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("dialog", d => d.accept());
  await ctx.route(ORIGIN + "**", r => { const f = new URL(r.request().url()).pathname.replace("/hucksoon/", "") || "index.html";
    if (f === "ranking-config.js") return r.fulfill({ contentType: "text/javascript", body: `window.RANKING_API = "";` });
    const p = path.join(REPO, f); if (!fs.existsSync(p)) return r.fulfill({ status: 404, body: "" });
    let body = fs.readFileSync(p); if (f === "index.html") body = body.toString().replace("  // ---- 시작 ----", HOOK);
    r.fulfill({ contentType: f.endsWith(".js") ? "text/javascript" : f.endsWith(".png") ? "image/png" : f.endsWith(".webp") ? "image/webp" : "text/html", body }); });
  await ctx.addInitScript(([s, sc]) => { if (!sessionStorage.getItem("s")) { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); sessionStorage.setItem("rl_scene", sc); sessionStorage.setItem("s", 1); } }, [storage, scene]);
  await page.goto(ORIGIN);
  await page.waitForFunction(() => window.__t);
  return { ctx, page, errors };
}
const SEASON = 4;
// 장비 없는 저장: run(d, z, g), extra(clr·nclr·wp·tb…)
const save = (d, { z, g = 100, hp = 5000 } = {}, extra = {}) => JSON.stringify({ v: 1, season: SEASON, best: Math.max(d, 30), ...extra, run: { d, hp, mh: hp, a: 900, g, p: 2, l: 30, x: 0, xn: 99999, rid: `wp-${d}-${z || "n"}`, k: 0, pp: 0, ...(z ? { z } : {}) } });
const st = (page) => page.evaluate(() => window.__t.s());
const logText = (page) => page.locator("#log").innerText();
const savedJson = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("rl_save")));

try {
  // ---- 일반 던전 25층: 시작 자리 옆 웨이포인트 → 밟으면 활성화 ----
  const A = await open({ rl_device_id: "wp-a", rl_save: save(25, { g: 1000 }), rl_tips: JSON.stringify(["intro", "dungeon", "gear", "lowhp"]) });
  await A.page.evaluate(() => window.__t.calm());
  let s = await st(A.page);
  check("floor 25: a waypoint next to the start", !!s.wpSpot && Math.abs(s.wpSpot.x - s.x) + Math.abs(s.wpSpot.y - s.y) === 1, JSON.stringify(s.wpSpot));
  check("floor 25: log says step on it to activate", (await logText(A.page)).includes("바로 옆에 웨이포인트가 있다"));
  await A.page.screenshot({ path: path.join(SHOTS, "wp-floor.png") });
  const key = s.wpSpot.x > s.x ? "ArrowRight" : s.wpSpot.x < s.x ? "ArrowLeft" : s.wpSpot.y > s.y ? "ArrowDown" : "ArrowUp";
  await A.page.keyboard.press(key); await sleep(250);
  s = await st(A.page);
  check("stepping on it activates floor 25", s.wp.normal.join() === "25" && (await logText(A.page)).includes("웨이포인트 활성화"), JSON.stringify(s.wp));
  check("saved in the account save (wp.n)", (await savedJson(A.page)).wp?.n?.join() === "25");
  await A.page.keyboard.press(key === "ArrowRight" ? "ArrowLeft" : key === "ArrowLeft" ? "ArrowRight" : key === "ArrowUp" ? "ArrowDown" : "ArrowUp"); await sleep(150);
  const n1 = (await logText(A.page)).split("웨이포인트 활성화").length;
  await A.page.keyboard.press(key); await sleep(200);
  check("stepping on it again doesn't activate twice", (await logText(A.page)).split("웨이포인트 활성화").length === n1 && (await st(A.page)).wp.normal.join() === "25");
  // 새로고침해도 이어서 (층 저장에 웨이포인트 자리)
  await A.page.reload(); await A.page.waitForFunction(() => window.__t);
  s = await st(A.page);
  check("reload: same waypoint spot, still active", !!s.wpSpot && s.wp.normal.join() === "25");

  // ---- 마을 웨이포인트 → 25층부터 ----
  await A.page.keyboard.press("p"); await sleep(400);
  await goDoor(A.page, "waypoint");
  check("town waypoint opens the picker", await A.page.locator("#wp-modal").isVisible());
  const btn = (z, n) => A.page.locator("#wp-list .wp-row").nth(["normal", "nm", "hell"].indexOf(z)).locator("button", { hasText: `${n}층` });
  check("picker: 25 enabled, 50·75 and nightmare/hell locked", await btn("normal", 25).isEnabled() && !(await btn("normal", 50).isEnabled()) && !(await btn("normal", 75).isEnabled()) && !(await btn("nm", 10).isEnabled()) && !(await btn("hell", 10).isEnabled()));
  await A.page.screenshot({ path: path.join(SHOTS, "wp-picker.png") });
  await A.page.keyboard.press("Escape"); await sleep(150);
  check("Esc closes the picker", await A.page.locator("#wp-modal").isHidden());
  await A.page.keyboard.press("ArrowUp"); await sleep(250);
  await btn("normal", 25).click(); await sleep(500);
  s = await st(A.page);
  check("25층 button → normal dungeon floor 25 with a waypoint", s.scene === "dungeon" && s.depth === 25 && s.zone === "normal" && !!s.wpSpot && (await logText(A.page)).includes("웨이포인트를 타고 25층에 왔다"), JSON.stringify(s));

  // ---- 묘비: 골드 1000을 들고 쓰러짐 → 새로 시작 → 25층 쓰러진 자리에 묘비, 밟으면 900 ----
  await A.page.evaluate(() => { window.__t.calm(); window.__t.gold(1000); });
  const deadAt = await st(A.page);
  await A.page.evaluate(() => window.__t.die());
  check("death modal: a tombstone keeps 900 gold (90%)", (await A.page.locator("#death-sub").innerText()).includes("묘비가 남아요. 다시 와서 밟으면 골드 900(90%)"));
  await A.page.locator("#death-restart").click(); await sleep(300);
  s = await st(A.page);
  check("restart: gold 0, tombstone on floor 25 at the death spot with 900", s.scene === "lobby" && s.gold === 0 && s.tomb?.d === 25 && s.tomb.z === "normal" && s.tomb.g === 900 && s.tomb.x === deadAt.x && s.tomb.y === deadAt.y, JSON.stringify(s.tomb));
  check("restart log tells where the tombstone is", (await logText(A.page)).includes("25층의 쓰러진 자리에 묘비를 남겼다. 다시 가서 밟으면 골드 900"));
  check("tombstone saved (tb)", (await savedJson(A.page)).tb?.g === 900);
  await goDoor(A.page, "waypoint"); await btn("normal", 25).click(); await sleep(500);
  s = await st(A.page);
  check("back on floor 25 via waypoint: tombstone placed on a floor tile near the death spot", s.depth === 25 && !!s.grave && (await logText(A.page)).includes("내 묘비가 있다. 찾아서 밟으면 골드 900"), JSON.stringify([s.grave, s.tomb]));
  await A.page.evaluate(() => window.__t.calm());
  await A.page.screenshot({ path: path.join(SHOTS, "wp-grave.png") });
  await A.page.evaluate(() => window.__t.on(window.__t.s().grave));
  s = await st(A.page);
  check("stepping on the tombstone gives 900 gold and removes it", s.gold === 900 && !s.tomb && !s.grave && (await logText(A.page)).includes("묘비에서 골드 900을(를) 되찾았다"), JSON.stringify(s));
  check("tombstone gone from the save", !(await savedJson(A.page)).tb);

  // ---- 또 쓰러지면 새 묘비로 바뀜 (예전 묘비는 사라짐) ----
  await A.page.evaluate(() => { window.__t.gold(500); window.__t.die(); });
  await A.page.locator("#death-restart").click(); await sleep(300);
  await goDoor(A.page, "start"); await sleep(500);
  await A.page.evaluate(() => { window.__t.gold(200); window.__t.die(); });
  check("death modal warns the old tombstone (450) will be lost", (await A.page.locator("#death-sub").innerText()).includes("전에 남긴 묘비의 골드 450은 사라져요"));
  await A.page.locator("#death-restart").click(); await sleep(300);
  s = await st(A.page);
  check("second death: new tombstone on floor 1 (180), old one gone", s.tomb?.d === 1 && s.tomb.g === 180 && (await logText(A.page)).includes("예전 묘비(골드 450)는 사라졌다"), JSON.stringify(s.tomb));
  // 골드 없이 쓰러지면 묘비 없음 (예전 묘비는 그대로)
  await goDoor(A.page, "start"); await sleep(500);
  await A.page.evaluate(() => { window.__t.gold(0); window.__t.die(); });
  check("no gold: no tombstone line in the death modal", !(await A.page.locator("#death-sub").innerText()).includes("묘비"));
  await A.page.locator("#death-restart").click(); await sleep(300);
  check("no gold: the earlier tombstone stays", (await st(A.page)).tomb?.g === 180);
  check("A: no page errors", A.errors.length === 0, A.errors.join("; "));
  await A.ctx.close();

  // ---- 웨이포인트를 밟기 전에는 계단이 안 열림, 밟으면 열림 (꼭 지나가게, dc#97) ----
  const G = await open({ rl_device_id: "wp-g", rl_save: save(25) });
  let down = await G.page.evaluate(() => window.__t.stairsDown());
  check("before stepping on the waypoint, the stairs stay closed", down.depth === 25 && (await logText(G.page)).includes("웨이포인트를 먼저 밟아야 계단이 열린다"), JSON.stringify(down));
  await G.page.evaluate(() => window.__t.on(window.__t.s().wpSpot));
  down = await G.page.evaluate(() => window.__t.stairsDown());
  check("after stepping on it, the stairs open (floor 26)", down.depth === 26, JSON.stringify(down));
  await G.ctx.close();

  // ---- 24층에는 웨이포인트 없음 ----
  const B = await open({ rl_device_id: "wp-b", rl_save: save(24) });
  check("floor 24: no waypoint", !(await st(B.page)).wpSpot);
  await B.ctx.close();

  // ---- 나이트메어 10층 · 헬 20층 ----
  const C = await open({ rl_device_id: "wp-c", rl_save: save(10, { z: "nm" }, { clr: 1, nb: 10 }) });
  await C.page.evaluate(() => window.__t.calm());
  await C.page.evaluate(() => window.__t.on(window.__t.s().wpSpot));
  check("nightmare 10: activates", (await st(C.page)).wp.nm.join() === "10");
  await C.page.keyboard.press("p"); await sleep(400);
  await goDoor(C.page, "waypoint");
  await C.page.locator("#wp-list .wp-row").nth(1).locator("button", { hasText: "10층" }).click(); await sleep(500);
  let c = await st(C.page);
  check("nightmare 10 via waypoint (not cleared nightmare)", c.scene === "dungeon" && c.zone === "nm" && c.depth === 10, JSON.stringify(c));
  check("C: no page errors", C.errors.length === 0, C.errors.join("; "));
  await C.ctx.close();
  const D = await open({ rl_device_id: "wp-d", rl_save: save(20, { z: "hell" }, { clr: 1, nb: 50, nclr: 1, hb: 20 }) });
  await D.page.evaluate(() => window.__t.calm());
  await D.page.evaluate(() => window.__t.on(window.__t.s().wpSpot));
  check("hell 20: activates", (await st(D.page)).wp.hell.join() === "20");
  await D.page.keyboard.press("p"); await sleep(400);
  await goDoor(D.page, "waypoint");
  await D.page.locator("#wp-list .wp-row").nth(2).locator("button", { hasText: "20층" }).click(); await sleep(500);
  c = await st(D.page);
  check("hell 20 via waypoint (20층 not completed)", c.scene === "dungeon" && c.zone === "hell" && c.depth === 20, JSON.stringify(c));
  check("D: no page errors", D.errors.length === 0, D.errors.join("; "));
  await D.ctx.close();

  // ---- 이미 완료한 사람: 그 던전 웨이포인트는 모두 켜져 있음 (dc#97) ----
  const F = await open({ rl_device_id: "wp-f", rl_save: save(3, {}, { clr: 1, nb: 50, nclr: 1 }) }, "lobby");
  const fw = (await st(F.page)).wp;
  check("completed normal + nightmare: their waypoints all on, hell not", fw.normal.join() === "25,50,75" && fw.nm.join() === "10,20,30,40,50" && fw.hell.length === 0, JSON.stringify(fw));
  await F.ctx.close();

  // ---- 처음 사람: 웨이포인트 창에 안내 ----
  const E = await open({ rl_device_id: "wp-e", rl_save: save(3) }, "lobby");
  await goDoor(E.page, "waypoint");
  check("no waypoints yet: picker says so, all buttons locked", await E.page.locator("#wp-empty").isVisible() && (await E.page.locator("#wp-list button:not([disabled])").count()) === 0);
  await E.ctx.close();
} finally {
  await browser.close();
}
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
