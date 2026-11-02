// dc#144: 점프 대신 회피 (움직이던 쪽으로 3칸, 그동안 무적, 소리) · 가장 가까운 몬스터 공격 (2D 누른 쪽 · 3D 저절로)
//   · 휴대폰은 버튼 없이 화면을 끌어 움직이고(2D는 누른 자리가 스틱 가운데, dc#151) 톡 눌러 회피, 3D 작은 지도 크게 · 마을도 같은 조작
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
const require = createRequire(process.env.NODE_PATH + "/");
const { chromium } = require("playwright");
const REPO = process.argv[2], SHOTS = process.argv[3];
const ORIGIN = "https://hucksoon.github.io/hucksoon/";
const results = [];
const check = (n, ok, x = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x && !ok ? " — " + x : ""}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const HOOK = `
  window.__t = {
    s: () => ({ scene, x: player.x, y: player.y, hp: player.hp, cd: player.jumpCd || 0, n: enemies.length, d3: View3D.active(), dashing: View3D.dashing,
      pos: View3D.active() ? View3D.pos : null, town: Town.pos(), townDash: Town.dashing, joy: document.body.classList.contains("joy"), ov: document.querySelector(".overlay:not([hidden])")?.id || null }),
    // 적을 모두 치우고, 3칸 앞이 바닥인 방향을 찾아 그쪽을 봄
    clearFace: () => { enemies = []; items = []; for (const [dx, dy] of DIRS) { let ok = true; for (let k = 1; k <= 3; k++) if (map[player.y + dy * k]?.[player.x + dx * k] !== FLOOR) ok = false;
      if (ok) { player.face = { dx, dy }; render(); return { dx, dy }; } } return null; },
    // 몬스터 하나를 (dx, dy) 자리에 (HP 많음, 공격력 0)
    foe: (dx, dy, atk = 0) => { const e = { ...RLMonsters.makeNormal(RLMonsters.pickType(2, Math.random), "normal", 2), x: player.x + dx, y: player.y + dy }; e.hp = e.maxHp = 1e6; e.atk = atk; map[e.y][e.x] = FLOOR; enemies.push(e); visible[e.y][e.x] = true; render(); return e.hp; },
    foeHp: () => enemies[0]?.hp,
    face3d: () => { const d = window.__t.clearFace(); if (d) View3D.look(Math.atan2(d.dx, -d.dy)); return d; },
    // 회피 중 무적: 같은 몬스터 공격을 무적일 때·아닐 때
    inv: () => { const e = enemies[0]; e.atk = 50; const s = stats(); const h0 = player.hp; player.inv = 1; attack(e, player); const a = h0 - player.hp; player.inv = 0; player.hp = s.maxHp; const h1 = player.hp; attack(e, player); const b = h1 - player.hp; player.hp = s.maxHp; return { inv: a, normal: b }; },
    sounds: () => window.RLSound?.recent?.() || [],
    hp: () => { player.hp = stats().maxHp; },
    screen: () => { const p = Walk.screenOf(player.x, player.y); return p; },
    townScreen: () => { const r = canvas.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: { l: r.left, t: r.top, w: r.width, h: r.height } }; },
    map3d: () => { const c = document.getElementById("map3d"), v = document.getElementById("game3d"); return { w: c.clientWidth, cw: v.clientWidth, cls: c.className }; },
    log: () => document.getElementById("log").innerText,
  };
  // ---- 시작 ----`;
// 3D는 소프트웨어 WebGL(swiftshader)로, 나머지는 보통 브라우저로 (swiftshader 브라우저는 마을 화면의 프레임이 아주 느림)
const EXE = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const browser = await chromium.launch({ executablePath: EXE });
const browserGL = await chromium.launch({ executablePath: EXE, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
async function open(storage, { phone = false, scene = "dungeon" } = {}) {
  // 3D 휴대폰은 화면 배율 1 (소프트웨어 WebGL은 배율 2면 한 프레임이 너무 느려 톡이 길게 눌린 것처럼 됨)
  const ctx = await (storage.rl_3d === "1" ? browserGL : browser).newContext(phone ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: storage.rl_3d === "1" ? 1 : 2 } : { viewport: { width: 1280, height: 950 } });
  const page = await ctx.newPage(); const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("dialog", d => d.accept());
  await ctx.route(ORIGIN + "**", r => { const f = new URL(r.request().url()).pathname.replace("/hucksoon/", "") || "index.html";
    if (f === "ranking-config.js") return r.fulfill({ contentType: "text/javascript", body: `window.RANKING_API = "";` });
    const p = path.join(REPO, f); if (!fs.existsSync(p)) return r.fulfill({ status: 404, body: "" });
    let body = fs.readFileSync(p); if (f === "index.html") body = body.toString("utf8").replace("  // ---- 시작 ----", HOOK);
    r.fulfill({ contentType: f.endsWith(".js") ? "text/javascript" : f.endsWith(".png") ? "image/png" : f.endsWith(".webp") ? "image/webp" : "text/html", body }); });
  await ctx.addInitScript(([s, scene]) => { if (!sessionStorage.getItem("s")) { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); sessionStorage.setItem("rl_scene", scene); sessionStorage.setItem("s", 1); } }, [storage, scene]);
  await page.goto(ORIGIN);
  await page.waitForFunction(() => window.__t);
  await sleep(400);
  const cdp = phone ? await ctx.newCDPSession(page) : null;
  // 튜토리얼 안내 상자는 닫음 (휴대폰에서는 화면 위를 덮어 손가락이 그 상자에 닿음)
  if (phone) { await page.evaluate(() => { const b = document.getElementById("tip-close"); if (b && !document.getElementById("tip").hidden) b.click(); }); await sleep(150); }
  // 진짜 손가락처럼 (브라우저가 touch → pointer 이벤트로 바꿈)
  const touch = {
    tap: async (x, y) => { await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] }); await sleep(60); await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); },
    drag: async (x0, y0, x1, y1, holdMs) => {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x0, y: y0 }] });
      for (let i = 1; i <= 6; i++) { await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x0 + (x1 - x0) * i / 6, y: y0 + (y1 - y0) * i / 6 }] }); await sleep(16); }
      await sleep(holdMs);
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    },
  };
  return { ctx, page, errors, touch };
}
const save = (run = {}) => JSON.stringify({ v: 1, best: 3, run: { d: 2, hp: 300, mh: 300, a: 40, g: 0, l: 5, x: 0, xn: 100, rid: "r144", k: 0, pp: 0, ...run } });
const T = (page, fn, ...a) => page.evaluate(([f, a]) => window.__t[f](...a), [fn, a]);
// 새 규칙 (rl_oldtown off), 축복 끔, 2D
const BASE = { rl_oldtown: "off", rl_bless: "off", rl_autogear: "1", rl_market: "paused", rl_device_id: "r144-dev", rl_3d: "0", rl_tut: JSON.stringify(["intro"]) };

try {
  // ---- 1. PC 2D: Space 회피 · 쿨타임 · 무적 · 소리 ----
  const A = await open({ ...BASE, rl_save: save() });
  let a = await T(A.page, "s");
  check("new controls are on (body.joy) in the new rules", a.joy && a.scene === "dungeon", JSON.stringify(a));
  const dir = await T(A.page, "clearFace");
  a = await T(A.page, "s");
  await A.page.keyboard.press(" "); await sleep(500);
  let b = await T(A.page, "s");
  check("Space: dodge 3 tiles in the facing direction", dir && b.x === a.x + dir.dx * 3 && b.y === a.y + dir.dy * 3, JSON.stringify([dir, a, b]));
  check("dodge starts a 4-turn cooldown (shared with the old jump slot)", b.cd === 3 || b.cd === 4, JSON.stringify(b));
  check("dodge sound plays", (await T(A.page, "sounds")).includes("roll"));
  await A.page.keyboard.press(" "); await sleep(200);
  const c = await T(A.page, "s");
  check("dodge again during cooldown: no move, log says when", c.x === b.x && c.y === b.y && (await T(A.page, "log")).includes("회피는"), JSON.stringify(c));
  await T(A.page, "foe", 1, 0);
  const inv = await T(A.page, "inv");
  check("invulnerable while dodging: a hit does 0 damage (normally it hurts)", inv.inv === 0 && inv.normal > 0, JSON.stringify(inv));
  await A.page.screenshot({ path: path.join(SHOTS, "run144-dodge.png") }).catch(() => {});

  // ---- 2. 가장 가까운 몬스터 공격 (대각선도), 반대쪽은 걸어서 멀어짐 ----
  await T(A.page, "clearFace"); await T(A.page, "hp");
  // 오른쪽 위 대각선 몬스터 → → 누르면 공격 (움직이지 않음)
  const pos0 = await T(A.page, "s");
  const hp0 = await T(A.page, "foe", 1, -1);
  await A.page.keyboard.press("ArrowRight"); await sleep(300);
  const pos1 = await T(A.page, "s"), hp1 = await T(A.page, "foeHp");
  check("diagonal monster on the pressed side → attacked (nearest), player stays", hp1 < hp0 && pos1.x === pos0.x && pos1.y === pos0.y, JSON.stringify([pos0, pos1, hp0, hp1]));
  check("no page errors (PC 2D)", A.errors.length === 0, A.errors.join("; "));
  await A.ctx.close();

  // ---- 3. PC 3D: Space 회피(미끄러짐) · 붙은 몬스터 저절로 공격 ----
  const D = await open({ ...BASE, rl_3d: "1", rl_save: save() });
  await D.page.waitForFunction(() => window.RLView3D?.ready ?? true, null, { timeout: 15000 }).catch(() => {});
  await sleep(1500);
  let d = await T(D.page, "s");
  if (d.d3) {
    await T(D.page, "clearFace"); await sleep(200);
    const p0 = (await T(D.page, "s")).pos;
    await D.page.keyboard.press(" "); await sleep(80);
    const mid = await T(D.page, "s");
    await sleep(600);
    const p1 = (await T(D.page, "s")).pos;
    const moved = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    check(`3D Space: dash (${moved.toFixed(2)} tiles) with dodge sound`, mid.dashing !== undefined && moved > 1 && moved <= 3.05 && (await T(D.page, "sounds")).includes("roll"), JSON.stringify([p0, p1]));
    const before = await T(D.page, "foe", 1, 0);
    await sleep(1600);
    check("3D: a monster next to me is attacked by itself (nearest)", (await T(D.page, "foeHp")) < before);
  } else check("3D view available in the test browser", false, "3D not active");
  check("no page errors (PC 3D)", D.errors.length === 0, D.errors.join("; "));
  await D.ctx.close();

  // ---- 4. PC 마을: Space 회피 + 소리 ----
  const L = await open({ ...BASE, rl_save: save() }, { scene: "lobby" });
  await sleep(500);
  const t0 = (await T(L.page, "s")).town;
  await L.page.keyboard.press(" "); await sleep(1300);   // 느린 테스트 브라우저에서는 한 프레임 시간이 길어 조금 더
  const t1 = (await T(L.page, "s")).town;
  check("town: Space dashes about 3 tiles (no jump)", Math.abs(t1.x - t0.x) > 2.5 && Math.abs(t1.x - t0.x) <= 3.05 && t1.ground, JSON.stringify([t0, t1]));
  check("town: dodge sound plays", (await T(L.page, "sounds")).includes("roll"));
  check("no page errors (town)", L.errors.length === 0, L.errors.join("; "));
  await L.ctx.close();

  // ---- 5. 휴대폰 2D: 버튼 없음, 끌어서 걷기, 톡 회피 ----
  const P = await open({ ...BASE, rl_save: save() }, { phone: true });
  const vis = await P.page.evaluate(() => Object.fromEntries(["tp-jump", "tp-attack", "tp-inv", "tp-potion", "tp-portal"].map(id => [id, !!document.getElementById(id)?.offsetParent]).concat([["dpad", [...document.querySelectorAll("#touch-pad .dpad button")].some(b => b.offsetParent)]])));
  check("phone: no direction / jump / attack buttons, small menu stays", !vis["tp-jump"] && !vis["tp-attack"] && !vis.dpad && vis["tp-inv"] && vis["tp-potion"] && vis["tp-portal"], JSON.stringify(vis));
  await P.page.screenshot({ path: path.join(SHOTS, "run144-phone.png") }).catch(() => {});
  const pdir = await T(P.page, "clearFace");
  let p = await T(P.page, "s");
  const me = await T(P.page, "screen");
  await P.touch.tap(me.x + 30, me.y + 30); await sleep(500);
  let q = await T(P.page, "s");
  check("phone 2D: tap the screen → dodge 3 tiles", pdir && q.x === p.x + pdir.dx * 3 && q.y === p.y + pdir.dy * 3, JSON.stringify([pdir, p, q]));
  // 누른 자리가 스틱 가운데 (dc#151): 캐릭터 반대쪽에서 눌러도, 누른 자리에서 끈 쪽으로 걸음
  const wdir = await T(P.page, "clearFace");
  p = await T(P.page, "s");
  const m2 = await T(P.page, "screen");
  const sx = m2.x - wdir.dx * 110 + wdir.dy * 40, sy = m2.y - wdir.dy * 110 + wdir.dx * 40;   // 캐릭터에서 반대쪽으로 떨어진 곳
  await P.touch.drag(sx, sy, sx + wdir.dx * 70, sy + wdir.dy * 70, 420);
  await sleep(200);
  q = await T(P.page, "s");
  const steps = (q.x - p.x) * wdir.dx + (q.y - p.y) * wdir.dy;
  check(`phone 2D: press anywhere and drag → walks the way you dragged, from where you pressed (${steps} steps)`, steps >= 2, JSON.stringify([wdir, p, q]));
  check("no page errors (phone 2D)", P.errors.length === 0, P.errors.join("; "));
  await P.ctx.close();

  // ---- 6. 휴대폰 3D: 끌어서 앞으로, 톡 회피, 작은 지도 크게 ----
  const Q = await open({ ...BASE, rl_3d: "1", rl_save: save() }, { phone: true });
  await sleep(1800);
  let qd = await T(Q.page, "s");
  if (qd.d3) {
    await T(Q.page, "face3d"); await sleep(100);
    const box = await Q.page.locator("#game3d").boundingBox();
    const s0 = (await T(Q.page, "s")).pos;
    await Q.touch.drag(box.x + box.width / 2, box.y + box.height * 0.7, box.x + box.width / 2, box.y + box.height * 0.7 - 80, 1000);
    await sleep(100);
    const s1 = (await T(Q.page, "s")).pos;
    check("phone 3D: drag up = move (one finger stick)", Math.hypot(s1.x - s0.x, s1.y - s0.y) > 0.3, JSON.stringify([s0, s1]));
    await sleep(2200);   // 쿨타임이 끝나게
    await T(Q.page, "face3d"); await sleep(100);   // 앞 3칸이 바닥인 쪽을 봄
    const s2 = (await T(Q.page, "s")).pos;
    await Q.touch.tap(box.x + box.width / 2, box.y + box.height / 2); await sleep(1200);
    const s3 = (await T(Q.page, "s")).pos;
    check("phone 3D: tap = dodge (dash)", Math.hypot(s3.x - s2.x, s3.y - s2.y) > 1 && (await T(Q.page, "sounds")).includes("roll"), JSON.stringify([s2, s3]));
    const mp = await T(Q.page, "map3d");
    check(`phone 3D: small map is big (${mp.w}px of ${mp.cw}px)`, mp.cls === "small" && mp.w >= mp.cw * 0.4, JSON.stringify(mp));
    await Q.page.screenshot({ path: path.join(SHOTS, "run144-phone3d.png") }).catch(() => {});
  } else check("phone 3D view available", false);
  check("no page errors (phone 3D)", Q.errors.length === 0, Q.errors.join("; "));
  await Q.ctx.close();

  // ---- 7. 휴대폰 마을: 끌어서 걷기, 톡 회피 ----
  const W = await open({ ...BASE, rl_save: save() }, { phone: true, scene: "lobby" });
  await sleep(600);
  const wv = await W.page.evaluate(() => [...document.querySelectorAll("#touch-pad button")].filter(b => b.offsetParent).map(b => b.id || b.className));
  check("phone town: only inventory and dex buttons", wv.join() === "tp-inv,tp-dex", wv.join());
  const tw0 = (await T(W.page, "s")).town, sc = await T(W.page, "townScreen");
  await W.touch.drag(sc.x, sc.y + 40, sc.x + 120, sc.y + 40, 500);
  await sleep(150);
  const tw1 = (await T(W.page, "s")).town;
  check("phone town: drag to the right of the player → walks right", tw1.x > tw0.x + 0.5, JSON.stringify([tw0, tw1]));
  await W.touch.tap(sc.x, sc.y); await sleep(1300);
  const tw2 = (await T(W.page, "s")).town;
  check("phone town: tap → dash 3 tiles", Math.abs(tw2.x - tw1.x) > 2.5, JSON.stringify([tw1, tw2]));
  await W.page.screenshot({ path: path.join(SHOTS, "run144-town.png") }).catch(() => {});
  check("no page errors (phone town)", W.errors.length === 0, W.errors.join("; "));
  await W.ctx.close();
} catch (e) {
  console.log("ERROR", e.message);
  results.push(false);
} finally {
  await browser.close(); await browserGL.close();
}
const fail = results.filter(r => !r).length;
console.log(`\n${results.length - fail} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
