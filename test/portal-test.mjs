// 포탈(로비로 복귀) + 던전 입구 두 개(1층 / 포탈 층) + 쓰러지면 로비에서 새로 시작
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
const require = createRequire(process.env.NODE_PATH + "/");
const { chromium, devices } = require("playwright");
const REPO = process.argv[2], SHOTS = process.argv[3];
const ORIGIN = "https://hucksoon.github.io/hucksoon/";
const results = [];
const check = (n, ok, x = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x ? " — " + x : ""}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const waitFor = async (fn, ms = 6000) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (await fn()) return true; } catch {} await sleep(100); } return false; };
const HOOK = `
  window.__t = {
    s: () => ({ scene, depth, gold: player.gold, plvl: player.plvl, rid: player.rid, gameOver, lx: lobbyPos.x, ly: lobbyPos.y, near: window.RLTownPos?.()?.near ?? null,
      map: map.map(r => r.join("")).join(""), resume: resumeFloor() }),
    die: () => { player.hp = 0; death(); render(); },
  };
  // ---- 시작 ----`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
async function open(storage, { scene, opts = { viewport: { width: 1280, height: 950 } } } = {}) {
  const ctx = await browser.newContext(opts); const page = await ctx.newPage(); const errors = [], dialogs = [];
  let answer = true;
  page.on("pageerror", e => errors.push(e.message));
  page.on("dialog", d => { dialogs.push(d.message()); answer ? d.accept() : d.dismiss(); });
  await ctx.route(ORIGIN + "**", r => { const f = new URL(r.request().url()).pathname.replace("/hucksoon/", "") || "index.html";
    if (f === "ranking-config.js") return r.fulfill({ contentType: "text/javascript", body: `window.RANKING_API = "";` });
    const p = path.join(REPO, f); if (!fs.existsSync(p)) return r.fulfill({ status: 404, body: "" });
    let body = fs.readFileSync(p, "utf8"); if (f === "index.html") body = body.replace("  // ---- 시작 ----", HOOK);
    r.fulfill({ contentType: f.endsWith(".js") ? "text/javascript" : "text/html", body }); });
  await ctx.addInitScript(([s, sc]) => { if (!sessionStorage.getItem("s")) { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); if (sc) sessionStorage.setItem("rl_scene", sc); sessionStorage.setItem("s", 1); } }, [storage, scene]);
  await page.goto(ORIGIN);
  return { ctx, page, errors, dialogs, answer: (v) => { answer = v; } };
}
const st = (page) => page.evaluate(() => window.__t.s());
const near = async (page) => { await sleep(80); return (await st(page)).near; };
const logText = (page) => page.locator("#log").innerText();
// 마을(옆에서 보는 로비)에서 문까지 걸어가 ↑로 들어감
import { goDoor } from "./town.mjs";
// 포탈 열기(P/R/L/버튼) 뒤 옆 칸의 파란 포탈로 걸어 들어감
async function stepIn(page) {
  await sleep(120);
  const L = await page.evaluate(() => JSON.parse(localStorage.getItem("rl_level") || "null"));
  if (!L?.tp) return;
  await page.keyboard.press(L.tp.x > L.px ? "ArrowRight" : L.tp.x < L.px ? "ArrowLeft" : L.tp.y > L.py ? "ArrowDown" : "ArrowUp");
  await sleep(150);
}
const save = (d, gold, l = 5) => JSON.stringify({ v: 1, f50: 1, best: d, run: { d, hp: 300, mh: 300, a: 50, g: gold, p: 2, l, x: 0, xn: 1e9, rid: "portal-run", k: 0, pp: 0 } });

try {
  // ---- 처음 온 사람 ----
  const N = await open({ rl_device_id: "new-player" });
  let s = await st(N.page);
  check("new player starts in the village (lobby), no portal floor", s.scene === "lobby" && s.resume === 0);
  check("dungeon buttons: 포탈 only (no 재시작/로비로)", !(await N.page.locator("#portal-btn").isVisible()) && (await N.page.locator("#restart-btn").count()) === 0 && (await N.page.locator("#lobby-btn").count()) === 0);
  check("no right door (best − 10) anymore: waypoints instead (dc#97)", await N.page.evaluate(() => !window.RLJump.TOWN.doors.some(d => d.id === "skip") && window.RLJump.TOWN.doors.some(d => d.id === "waypoint")));
  await goDoor(N.page, "start");
  s = await st(N.page);
  check("left door → floor 1", s.scene === "dungeon" && s.depth === 1 && (await logText(N.page)).includes("던전 1층에 발을 들였다"));
  check("포탈 button visible in dungeon", await N.page.locator("#portal-btn").isVisible() && (await N.page.locator("#portal-btn").innerText()) === "포탈 (P)");
  check("new player: no confirm when entering floor 1", N.dialogs.length === 0);
  check("new player: no page errors", N.errors.length === 0, N.errors.join("; "));
  await N.ctx.close();

  // ---- 6층에서 포탈 ----
  const P = await open({ rl_device_id: "porter", rl_save: save(6, 333) }, { scene: "dungeon" });
  const before = await st(P.page);
  check("starts in dungeon floor 6 (came back from shop/reload)", before.scene === "dungeon" && before.depth === 6 && before.gold === 333);
  await P.page.keyboard.press("p");
  await stepIn(P.page);
  s = await st(P.page);
  check("P → village right away, gold and level kept", s.scene === "lobby" && s.gold === 333 && s.plvl === 5 && (await P.page.locator("#gold").innerText()) === "333");
  check("portal log message", (await logText(P.page)).includes("포탈을 타고 로비로 돌아왔다. HP와 포션이 모두 회복됐다. (골드 333 · Lv 5)"));
  check("standing at the village portal door (6층)", (await near(P.page)) === "resume" && s.ly === 10 && s.resume === 6);
  check("no confirm for portal", P.dialogs.length === 0);
  await P.page.screenshot({ path: path.join(SHOTS, "portal-village.png") });
  // 새로고침해도 로비, 포탈 층 기억
  await P.page.reload();
  s = await st(P.page);
  check("reload keeps village and portal floor", s.scene === "lobby" && s.resume === 6);
  await goDoor(P.page, "resume");  // 새로고침하면 마을 아무 데서나 → 파란 포탈 문으로
  s = await st(P.page);
  check("lobby portal → back to floor 6, same map", s.scene === "dungeon" && s.depth === 6 && s.map === before.map && s.rid === before.rid && (await logText(P.page)).includes("포탈을 타고 6층의 떠난 자리로 돌아왔다"));
  // R, L도 포탈 열기
  await P.page.keyboard.press("r"); await stepIn(P.page);
  check("R also opens a portal (no reset)", (await st(P.page)).scene === "lobby" && (await st(P.page)).depth === 6 && (await st(P.page)).gold === 333);
  await P.page.keyboard.press("ArrowUp");   // 포탈로 돌아오면 파란 포탈 문 앞 → ↑로 다시 들어감
  await P.page.keyboard.press("l"); await stepIn(P.page);
  check("L also opens a portal", (await st(P.page)).scene === "lobby");
  // 왼쪽 문: 취소하면 그대로
  P.answer(false);
  await goDoor(P.page, "start");
  s = await st(P.page);
  check("left door asks first; cancel keeps floor 6", s.scene === "lobby" && s.depth === 6 && P.dialogs.some(d => d.includes("포탈로 돌아갈 수 있는 층(6층)은 사라져요")));
  P.answer(true);
  await P.page.keyboard.press("ArrowUp");
  s = await st(P.page);
  check("left door (accept) → floor 1, gold/level kept, new map id", s.scene === "dungeon" && s.depth === 1 && s.gold === 333 && s.plvl === 5 && s.rid !== before.rid);
  await P.page.keyboard.press("p"); await stepIn(P.page);
  check("portal from floor 1 → no lobby portal, standing at the floor-1 door", (await st(P.page)).resume === 0 && (await near(P.page)) === "start" && !(await logText(P.page)).split("\n").pop().includes("오른쪽 문"));
  check("porter: no page errors", P.errors.length === 0, P.errors.join("; "));
  await P.ctx.close();

  // ---- 쓰러지면 로비에서 새로 시작 ----
  // Lv 5 (필요 경험치 49), 경험치 20: 새로 시작하면 4를 잃고 Lv 5 그대로 (dc#95)
  const D = await open({ rl_device_id: "dier", rl_save: JSON.stringify({ v: 1, f50: 1, best: 4, run: { d: 4, hp: 36, mh: 36, a: 7, g: 210, p: 2, l: 5, x: 20, xn: 49, rid: "portal-run", k: 0, pp: 0 } }) }, { scene: "dungeon" });
  await D.page.evaluate(() => window.__t.die());
  check("death modal with village restart", await D.page.locator("#death-modal").isVisible() && (await D.page.locator("#death-restart").innerText()) === "로비에서 새로 시작 (R)" && (await D.page.locator("#death-modal").innerText()).includes("골드는 처음으로 돌아가고, 경험치를 4 잃어요"));
  check("old 로비로 나가기 button removed", (await D.page.locator("#death-lobby").count()) === 0);
  await D.page.keyboard.press("p");
  check("portal while dead does nothing but keep the death modal", (await st(D.page)).scene === "dungeon" && await D.page.locator("#death-modal").isVisible());
  await D.page.locator("#death-restart").click();
  s = await st(D.page);
  check("로비에서 새로 시작 → village, gold 0, Lv 5 kept, floor 1", s.scene === "lobby" && s.gold === 0 && s.plvl === 5 && s.depth === 1 && !s.gameOver && (await near(D.page)) === "start");
  check("death restart log (level kept, lost 4 XP)", (await logText(D.page)).includes("레벨과 장비는 그대로다") && (await logText(D.page)).includes("경험치 4을(를) 잃었다. (Lv 5)"));
  check("no portal floor after death", s.resume === 0);
  check("dier: no page errors", D.errors.length === 0, D.errors.join("; "));
  await D.ctx.close();

  // 쓰러진 채로 로비에 온 경우: 입구에서 쓰러진 창
  const dead = JSON.stringify({ v: 1, f50: 1, best: 5, run: null, dead: { d: 5, hp: 0, mh: 30, a: 5, g: 99, p: 0, l: 3, x: 0, xn: 30, rid: "dead-run", k: 0, pp: 0 } });
  const E = await open({ rl_device_id: "dead-one", rl_save: dead });
  check("dead run: village, right door closed", (await st(E.page)).scene === "lobby" && (await st(E.page)).resume === 0 && await E.page.locator("#death-modal").isHidden());
  await goDoor(E.page, "start");
  check("door → death modal over the village", await E.page.locator("#death-modal").isVisible() && (await st(E.page)).scene === "lobby");
  await E.page.keyboard.press("r");
  s = await st(E.page);
  check("R → new start in the village", s.scene === "lobby" && !s.gameOver && s.gold === 0 && await E.page.locator("#death-modal").isHidden());
  check("dead-one: no page errors", E.errors.length === 0, E.errors.join("; "));
  await E.ctx.close();

  // ---- 휴대폰 ----
  const M = await open({ rl_device_id: "phone", rl_save: save(3, 50) }, { scene: "dungeon", opts: { ...devices["iPhone 13"] } });
  check("phone dungeon: 포션/인벤토리/도감/포탈", await M.page.locator("#tp-portal").isVisible() && (await M.page.locator("#tp-portal").innerText()) === "포탈" && (await M.page.locator("#tp-restart").count()) === 0);
  check("phone: no horizontal overflow", await M.page.evaluate(() => [...document.querySelectorAll("#touch-pad button")].every(b => !b.offsetParent || b.getBoundingClientRect().right <= innerWidth)));
  await M.page.screenshot({ path: path.join(SHOTS, "portal-phone-dungeon.png") });
  await M.page.locator("#tp-portal").tap(); await stepIn(M.page);
  check("phone: 포탈 tap opens it, stepping in → village with gold", (await st(M.page)).scene === "lobby" && (await st(M.page)).gold === 50 && !(await M.page.locator("#tp-portal").isVisible()));
  await M.page.screenshot({ path: path.join(SHOTS, "portal-phone-village.png") });
  check("phone: no page errors", M.errors.length === 0, M.errors.join("; "));
} finally {
  await browser.close();
}
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
