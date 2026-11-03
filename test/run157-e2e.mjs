// dc#157: 실시간 2D — 칸에 묶이지 않고 부드럽게 걷고(누르고 있는 동안), 시간이 흘러 TURN초마다 한 턴,
//   붙은 몬스터는 저절로 때림, 회피는 미끄러지듯(무적), 휴대폰 스틱은 끈 쪽 그대로(대각선도), T·버튼으로 턴제와 바꿈
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
const require = createRequire(process.env.NODE_PATH + "/");
const { chromium, devices } = require("playwright");
const REPO = process.argv[2], SHOTS = process.argv[3];
const ORIGIN = "https://hucksoon.github.io/hucksoon/";
const results = [];
const check = (n, ok, x = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x && !ok ? " — " + x : ""}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const HOOK = `
  window.__t = {
    // 넓은 빈 마당 (몬스터·아이템 없음, 내 둘레 9×9 바닥)
    yard: () => { enemies = []; items = []; floorSt.sc = 999; shop = null;
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const x = player.x + dx, y = player.y + dy; if (map[y]?.[x] !== undefined) { map[y][x] = FLOOR; visible[y][x] = true; seen[y][x] = true; } }
      enemies.push({ ...RLMonsters.makeNormal(RLMonsters.pickType(2, Math.random), "normal", 2), x: player.x + 4, y: player.y + 4, hp: 1e6, maxHp: 1e6, atk: 0, ranged: false });   // 층이 끝나지 않게 멀리 하나
      player.jumpCd = 0; player.potCd = 0; render(); return { x: player.x, y: player.y }; },
    mon: (dx, dy, o = {}) => { const e = { ...RLMonsters.makeNormal(RLMonsters.pickType(2, Math.random), "normal", 2), x: player.x + dx, y: player.y + dy, hp: 1e6, maxHp: 1e6, atk: 0, ranged: false, ...o }; enemies.push(e); return enemies.length - 1; },
    st: () => ({ x: player.x, y: player.y, pos: LIVE.pos(), turn, live: LIVE.active(), hp: player.hp, jc: player.jumpCd, inv: performance.now() < (player.invUntil || 0), dash: LIVE.dashing(),
      foeHp: enemies.map(e => e.hp), btn: document.getElementById("live-btn").textContent, body: document.body.classList.contains("live"), pc: player.potCd }),
    off: (dx, dy) => { const o = Anim.of(player); return { x: o.walkX, y: o.walkY }; },
    hp: (v) => { player.hp = v; },
  };
  // ---- 시작 ----`;
const EXE = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const browser = await chromium.launch({ executablePath: EXE });
async function open(storage, phone = false) {
  const ctx = await browser.newContext(phone ? { ...devices["iPhone 13"] } : { viewport: { width: 1280, height: 950 } }); const page = await ctx.newPage(); const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("dialog", d => d.accept());
  await ctx.route(ORIGIN + "**", r => { const f = new URL(r.request().url()).pathname.replace("/hucksoon/", "") || "index.html";
    if (f === "ranking-config.js") return r.fulfill({ contentType: "text/javascript", body: `window.RANKING_API = "";` });
    const p = path.join(REPO, f); if (!fs.existsSync(p)) return r.fulfill({ status: 404, body: "" });
    let body = fs.readFileSync(p); if (f === "index.html") body = body.toString("utf8").replace("  // ---- 시작 ----", HOOK);
    r.fulfill({ contentType: f.endsWith(".js") ? "text/javascript" : f.endsWith(".png") ? "image/png" : f.endsWith(".webp") ? "image/webp" : "text/html", body }); });
  await ctx.addInitScript((s) => { if (!sessionStorage.getItem("s")) { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); sessionStorage.setItem("rl_scene", "dungeon"); sessionStorage.setItem("s", 1); } }, storage);
  await page.goto(ORIGIN);
  await page.waitForFunction(() => window.__t);
  await sleep(400);
  return { ctx, page, errors };
}
const save = (run = {}) => JSON.stringify({ v: 1, best: 12, run: { d: 6, hp: 1000, mh: 1000, a: 40, g: 0, l: 5, x: 0, xn: 5000, x4: 1, rid: "r157", k: 0, pp: 0, ...run } });
const T = (page, fn, ...a) => page.evaluate(([f, a]) => window.__t[f](...a), [fn, a]);
const BASE = { rl_oldtown: "off", rl_bless: "off", rl_autogear: "1", rl_market: "paused", rl_device_id: "r157-dev", rl_3d: "0", rl_live: "1", rl_tut: JSON.stringify(["intro"]), rl_tip_dodge: "1" };

try {
  const A = await open({ ...BASE, rl_save: save() });
  const a0 = await T(A.page, "yard");
  const s0 = await T(A.page, "st");
  check("real-time 2D is on (button says 실시간, body.live)", s0.live && s0.body && /실시간/.test(s0.btn), JSON.stringify(s0));
  // ---- 1. 시간이 흐름: 아무것도 안 해도 턴이 지나감 ----
  await sleep(1300); const s1 = await T(A.page, "st");
  check(`time flows: ${s1.turn - s0.turn} turns in 1.3 s without input (TURN 0.4 s)`, s1.turn - s0.turn >= 2 && s1.turn - s0.turn <= 4, JSON.stringify([s0.turn, s1.turn]));
  // ---- 2. 누르고 있는 동안 부드럽게 걸음 (칸 사이에도 멈춤) ----
  await A.page.keyboard.down("ArrowRight"); await sleep(250); const m1 = await T(A.page, "st"); await sleep(400); const m2 = await T(A.page, "st"); await A.page.keyboard.up("ArrowRight"); await sleep(80);
  const m3 = await T(A.page, "st");
  check("holding → walks smoothly (position grows between frames, not whole tiles)", m2.pos.x > m1.pos.x + 0.5 && m1.pos.x > a0.x + 0.5 + 0.2 && Math.abs(m1.pos.x % 1 - 0.5) > 0.01, JSON.stringify([a0, m1.pos, m2.pos]));
  check("the tile follows the body (player.x is the tile under it)", m3.x === Math.floor(m3.pos.x) && m3.x > a0.x, JSON.stringify(m3));
  await sleep(300); const m4 = await T(A.page, "st");
  check("let go → stops", Math.abs(m4.pos.x - m3.pos.x) < 0.25, JSON.stringify([m3.pos, m4.pos]));
  // 대각선
  await A.page.keyboard.down("ArrowDown"); await A.page.keyboard.down("ArrowLeft"); await sleep(400); await A.page.keyboard.up("ArrowDown"); await A.page.keyboard.up("ArrowLeft"); await sleep(60);
  const d1 = await T(A.page, "st");
  check("two keys → diagonal", d1.pos.x < m4.pos.x - 0.3 && d1.pos.y > m4.pos.y + 0.3, JSON.stringify([m4.pos, d1.pos]));
  const off = await T(A.page, "off");
  check("the character is drawn at the real position (offset from the tile centre)", Math.abs(off.x - (d1.pos.x - 0.5 - d1.x) * 32) < 2 || Math.abs(off.x) > 0.5, JSON.stringify([off, d1]));
  // ---- 3. 붙은 몬스터는 저절로 때림 ----
  const p3 = await T(A.page, "yard"); const i3 = await T(A.page, "mon", 1, 0);
  const h0 = (await T(A.page, "st")).foeHp[i3]; await sleep(1300); const h1 = (await T(A.page, "st")).foeHp[i3];
  check("monster next to me → I hit it by myself every turn (no key)", h1 < h0, JSON.stringify([h0, h1]));
  // ---- 4. 회피: 미끄러지듯 3칸, 그동안 무적, 쿨타임 ----
  await T(A.page, "yard"); const r0 = await T(A.page, "st");
  await A.page.keyboard.down("ArrowUp"); await sleep(120); await A.page.keyboard.press("Space"); await sleep(60); const r1 = await T(A.page, "st");
  await sleep(300); await A.page.keyboard.up("ArrowUp"); const r2 = await T(A.page, "st");
  check("Space while walking up → dash: invulnerable, cooldown set", r1.dash && r1.inv && r1.jc > 0, JSON.stringify(r1));
  check("the dash carries ~3 tiles up in 0.3 s", r0.pos.y - r2.pos.y > 2.6, JSON.stringify([r0.pos, r2.pos]));
  // ---- 5. 몬스터에게 맞고, 물러나면 피함 (시간이 흐르니 가만히 있으면 맞음) ----
  await T(A.page, "yard"); await T(A.page, "hp", 1000); await T(A.page, "mon", 1, 0, { atk: 60 });
  await sleep(1400); const w1 = await T(A.page, "st");
  check("standing next to an attacking monster → time passes and it hits me", w1.hp < 1000, JSON.stringify(w1));
  // ---- 6. 포션은 턴을 더 쓰지 않음 ----
  await T(A.page, "yard"); await T(A.page, "hp", 200); const q0 = await T(A.page, "st"); await A.page.keyboard.press("q"); const q1 = await T(A.page, "st");
  check("potion heals without spending an extra turn", q1.hp > 200 && q1.turn === q0.turn && q1.pc > 0, JSON.stringify([q0, q1]));
  // ---- 7. 창이 열리면 시간이 멈춤 ----
  await A.page.keyboard.press("i"); await sleep(200); const t0 = (await T(A.page, "st")).turn; await sleep(1000); const t1 = (await T(A.page, "st")).turn;
  check("inventory open → time stops", t1 === t0, JSON.stringify([t0, t1]));
  await A.page.keyboard.press("Escape"); await sleep(200);
  await A.page.screenshot({ path: path.join(SHOTS, "run157-live.png") }).catch(() => {});
  // ---- 8. T로 턴제 ↔ 실시간 (기기에 기억) ----
  await A.page.keyboard.press("t"); await sleep(100); const k0 = await T(A.page, "st"); await sleep(1000); const k1 = await T(A.page, "st");
  check("T → turn-based: button says 턴제, time stops", !k0.live && /턴제/.test(k0.btn) && k1.turn === k0.turn && (await A.page.evaluate(() => localStorage.getItem("rl_live"))) === "off", JSON.stringify([k0, k1]));
  await A.page.keyboard.press("ArrowRight"); await sleep(60); const k2 = await T(A.page, "st");
  check("turn-based again: one key press = one tile, one turn", k2.x === k0.x + 1 && k2.turn === k0.turn + 1, JSON.stringify([k0, k2]));
  await A.page.click("#live-btn"); await sleep(100); const k3 = await T(A.page, "st");
  check("button → back to real time", k3.live && /실시간/.test(k3.btn), JSON.stringify(k3));
  check("no page errors (PC)", A.errors.length === 0, A.errors.join("; "));
  await A.ctx.close();

  // ---- 9. 휴대폰: 누른 자리 스틱이 끈 쪽 그대로(대각선) ----
  const P = await open({ ...BASE, rl_save: save() }, true);
  await T(P.page, "yard"); const ph0 = await T(P.page, "st");
  const cv = await P.page.locator("#game").boundingBox();
  const cdp = await P.ctx.newCDPSession(P.page);
  const x0 = cv.x + cv.width * 0.5, y0 = cv.y + cv.height * 0.5;
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x0, y: y0 }] });
  for (let i = 1; i <= 6; i++) { await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x0 + 9 * i, y: y0 + 9 * i }] }); await sleep(16); }
  await sleep(600);
  const ph1 = await T(P.page, "st");
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); await sleep(250);
  const ph2 = await T(P.page, "st");
  check("phone: drag down-right → walks diagonally while held", ph1.pos.x > ph0.pos.x + 0.6 && ph1.pos.y > ph0.pos.y + 0.6, JSON.stringify([ph0.pos, ph1.pos]));
  check("phone: lift the finger → stops", Math.hypot(ph2.pos.x - ph1.pos.x, ph2.pos.y - ph1.pos.y) < 0.6, JSON.stringify([ph1.pos, ph2.pos]));
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x0, y: y0 }] }); await sleep(60);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); await sleep(60);
  const ph3 = await T(P.page, "st");
  check("phone: tap → dodge", ph3.dash || ph3.jc > 0, JSON.stringify(ph3));
  check("no page errors (phone)", P.errors.length === 0, P.errors.join("; "));
  await P.ctx.close();
} catch (e) {
  console.log("ERROR", e.message);
  results.push(false);
} finally {
  await browser.close();
}
const fail = results.filter(r => !r).length;
console.log(`\n${results.length - fail} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
