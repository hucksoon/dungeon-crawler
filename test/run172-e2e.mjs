// dc#172: 스킬 스킨 (푸른 번개 · 번개 오라, 캐시 50개) 게임 적용 · 나이트메어 점프 공격이 잘 보이게 (웅크림 → 큰 포물선 → 쿵)
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
const require = createRequire(process.env.NODE_PATH + "/");
const { chromium } = require("playwright");
const REPO = process.argv[2], SHOTS = process.argv[3];
const ORIGIN = "https://hucksoon.github.io/hucksoon/";
const R = createRequire(import.meta.url), M = R(path.join(REPO, "monsters.js")), K = R(path.join(REPO, "skins.js"));
const results = [];
const check = (n, ok, x = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x && !ok ? " — " + x : ""}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ---- 규칙 ----
const LP = M.NIGHTMARE.skills.leap;
check(`leap: real-time aims ${LP.ahead3d} tiles ahead (turn-based ${LP.ahead}), flies ${LP.fly} ms`, LP.ahead3d === 4 && LP.ahead === 2 && LP.fly >= 400 && LP.fly <= 700);
check("skill skins: 2 skins at 50 cash", K.IDS.length === 2 && K.PRICE === 50);

const HOOK = `
  window.__t = {
    yard: () => { enemies = []; items = []; shots = []; floorSt.ls = 1; floorSt.sc = 999;
      for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) { const x = player.x + dx, y = player.y + dy; if (map[y]?.[x] !== undefined) { map[y][x] = FLOOR; visible[y][x] = true; seen[y][x] = true; } }
      player.hp = 99999; render(); },
    mon: (dx, dy, o = {}) => { const m = { ...RLMonsters.makeNormal(RLMonsters.pickType(2, () => 0.5), "normal", 2), x: player.x + dx, y: player.y + dy, hp: 100000, maxHp: 100000, atk: 1, def: 0, ranged: false, ...o }; enemies.push(m); return enemies.length - 1; },
    foe: (i) => { const e = enemies[i]; return e ? { x: e.x, y: e.y, leapAt: e.leapAt || null } : null; },
    pose: (i) => { const e = enemies[i], o = Anim.of(e), lp = leapPose(e); return { y: o.y, lift: o.lift || 0, fly: lp ? +lp.lift.toFixed(2) : 0 }; },
    world: () => worldTurn(),
    me: () => ({ x: player.x, y: player.y, hp: player.hp }),
    face: (dx, dy) => { player.face = { dx, dy }; },
    move: (dx, dy) => { player.x += dx; player.y += dy; },
    rt: () => realtime(),
    sk: () => ({ bolt: SkillSkins.bolt().color, aura: SkillSkins.aura(), list: SkillSkins.list(), worn: { bolt: SkillSkins.worn("bolt"), aura: SkillSkins.worn("aura") } }),
    chain: () => { Fx.chain([player, { x: player.x + 4, y: player.y }]); },
    // 캔버스에서 (cx, cy) 둘레 r칸 안의 파란 픽셀 · 노란 픽셀 수
    // 화면 전체의 파란 픽셀 · 노란 픽셀 수 (효과 전후를 비교)
    px: () => { const cv = document.getElementById("game"), d = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data; let blue = 0, yellow = 0;
      for (let i = 0; i < d.length; i += 4) { const r = d[i], gg = d[i + 1], b = d[i + 2]; if (b > 200 && r < 150 && gg > 120) blue++; if (r > 220 && gg > 190 && b < 140) yellow++; } return { blue, yellow }; },
    openInv: () => openInventory(),
    closeInv: () => { document.getElementById("inv-close")?.click(); },
    skinBtns: () => [...document.querySelectorAll("#inv-bag .skin-btn, #inv-skins .skin-btn")].map(b => b.textContent),
    clickSkin: (name) => { const b = [...document.querySelectorAll("#inv-bag .skin-btn, #inv-skins .skin-btn")].find(b => b.textContent.includes(name)); b?.click(); return !!b; },
    redraw: () => render(),
    wear: (id, on) => { SkillSkins.setWear(id, on); render(); },
  };
  // ---- 시작 ----`;
const EXE = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const browser = await chromium.launch({ executablePath: EXE });
async function open(storage) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 } }); const page = await ctx.newPage(); const errors = [];
  page.on("pageerror", e => errors.push(e.message)); page.on("dialog", d => d.accept());
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
const save = (run = {}) => JSON.stringify({ v: 1, best: 12, run: { d: 6, hp: 500, mh: 500, a: 40, g: 100, l: 10, x: 0, xn: 5000, x4: 1, rid: "r172", k: 0, pp: 0, ...run } });
const T = (page, fn, ...a) => page.evaluate(([f, a]) => window.__t[f](...a), [fn, a]);
const BASE = { rl_oldtown: "off", rl_bless: "off", rl_autogear: "1", rl_market: "paused", rl_device_id: "r172-dev", rl_3d: "0", rl_live: "off", rl_tut: JSON.stringify(["intro"]), rl_tip_dodge: "1" };

try {
  // ---- 1. 스킨 없음: 노란 번개, 오라 없음 ----
  let { ctx, page: P, errors } = await open({ ...BASE, rl_save: save() });
  let sk = await T(P, "sk");
  check("no skins owned → yellow lightning, no aura, no skin buttons", sk.bolt === "#ffe14d" && !sk.aura && sk.list.length === 0, JSON.stringify(sk));
  await T(P, "yard"); await sleep(150);
  const base0 = await T(P, "px");
  await T(P, "chain"); await sleep(120);
  const pxY = await T(P, "px"), dY = { yellow: pxY.yellow - base0.yellow, blue: pxY.blue - base0.blue };
  check(`chain lightning is yellow without the skin (+yellow ${dY.yellow}, +blue ${dY.blue})`, dY.yellow > 30 && dY.blue < dY.yellow / 4, JSON.stringify(dY));
  await ctx.close();

  // ---- 2. 둘 다 가짐 (상점에서 산 것을 기기에 기억) → 처음부터 씀 ----
  ({ ctx, page: P, errors } = await open({ ...BASE, rl_save: save(), rl_sskin_own: JSON.stringify(["skin_bolt_blue", "skin_bolt_aura"]) }));
  sk = await T(P, "sk");
  check("owned skins are worn right away: blue lightning + blue aura", sk.bolt === K.SKINS.skin_bolt_blue.color && sk.aura?.color === K.SKINS.skin_bolt_blue.color, JSON.stringify(sk));
  await T(P, "yard"); await sleep(200);
  const aura0 = await T(P, "px");
  check(`aura draws around my character (blue ${aura0.blue} vs ${base0.blue} without)`, aura0.blue > base0.blue + 30, JSON.stringify(aura0));
  await P.locator("#game").screenshot({ path: path.join(SHOTS, "r172-aura.png") });
  await T(P, "wear", "skin_bolt_aura", false); await sleep(150);   // 오라는 깜빡여서 번개만 비교할 때는 잠깐 벗음
  const base1 = await T(P, "px");
  await T(P, "chain"); await sleep(120);
  const pxB = await T(P, "px"), dB = { blue: pxB.blue - base1.blue, yellow: pxB.yellow - base1.yellow };
  check(`chain lightning turns blue with the skin (+blue ${dB.blue}, +yellow ${dB.yellow})`, dB.blue > 60 && dB.yellow < dB.blue / 3, JSON.stringify(dB));
  await T(P, "wear", "skin_bolt_aura", true);
  await P.locator("#game").screenshot({ path: path.join(SHOTS, "r172-blue-chain.png") });
  // 인벤토리: 꾸미기에서 쓰고 벗기
  await T(P, "openInv"); await sleep(300);
  let btns = await T(P, "skinBtns");
  check("inventory shows both skill skins as worn", btns.some(t => /푸른 번개 · 쓰는 중/.test(t)) && btns.some(t => /번개 오라 · 쓰는 중/.test(t)), JSON.stringify(btns));
  await P.locator("#inv-modal").screenshot({ path: path.join(SHOTS, "r172-inv.png") }).catch(() => {});
  await T(P, "clickSkin", "푸른 번개"); await sleep(150);
  sk = await T(P, "sk");
  check("take off blue lightning → yellow lightning, aura turns yellow", sk.bolt === "#ffe14d" && sk.aura?.color === K.SKINS.skin_bolt_aura.color, JSON.stringify(sk));
  await T(P, "clickSkin", "번개 오라"); await sleep(150);
  sk = await T(P, "sk");
  check("take off the aura → no aura", !sk.aura && sk.list.length === 2, JSON.stringify(sk));
  await P.reload(); await P.waitForFunction(() => window.__t); await sleep(300);
  sk = await T(P, "sk");
  check("choices are kept after reload (both off)", sk.bolt === "#ffe14d" && !sk.aura && sk.worn.bolt === null, JSON.stringify(sk));
  await T(P, "openInv"); await sleep(200); await T(P, "clickSkin", "푸른 번개"); await sleep(100);
  sk = await T(P, "sk");
  check("put blue lightning back on", sk.bolt === K.SKINS.skin_bolt_blue.color && !sk.aura, JSON.stringify(sk));
  check("no page errors (skins)", errors.length === 0, errors.join("; "));
  await ctx.close();

  // ---- 3. 점프 공격 (턴제): 웅크림 → 날아감(높이) → 착지 ----
  ({ ctx, page: P, errors } = await open({ ...BASE, rl_save: save() }));
  await T(P, "yard"); await T(P, "face", 0, 1);
  const lp = await T(P, "mon", 4, 0, { leap: { cd: 0 }, atk: 0 });
  await T(P, "world");
  const me0 = await T(P, "me"), f0 = await T(P, "foe", lp);
  check("turn-based: aims 2 tiles ahead", f0.leapAt && f0.leapAt.y === me0.y + 2 && f0.leapAt.x === me0.x, JSON.stringify([f0, me0]));
  await sleep(100);
  const crouch = await T(P, "pose", lp);
  check(`winding up: the monster crouches down (y +${crouch.y.toFixed(1)}) and stays on the ground`, crouch.y > 1 && crouch.lift === 0 && crouch.fly === 0, JSON.stringify(crouch));
  await P.locator("#game").screenshot({ path: path.join(SHOTS, "r172-leap-windup.png") });
  await T(P, "move", 0, 2);
  await T(P, "world"); await T(P, "world");
  await sleep(LP.fly * 0.45);
  const mid = await T(P, "pose", lp), fl = await T(P, "foe", lp);
  check(`landing: it flies high in an arc (2D lift ${Math.round(mid.lift)}px, 3D ${mid.fly} tiles) toward the spot`, mid.lift > 20 && mid.fly > 1 && !fl.leapAt, JSON.stringify(mid));
  await P.locator("#game").screenshot({ path: path.join(SHOTS, "r172-leap-fly.png") });
  await sleep(LP.fly);
  const end = await T(P, "pose", lp), me1 = await T(P, "me");
  check("after the flight it stands on the landing spot (no lift) and I got hit", end.lift === 0 && end.fly === 0 && me1.hp < me0.hp, JSON.stringify([end, me0.hp, me1.hp]));
  check("no page errors (leap)", errors.length === 0, errors.join("; "));
  await ctx.close();

  // ---- 4. 점프 공격 (실시간 2D): 4칸 앞을 노림 ----
  ({ ctx, page: P, errors } = await open({ ...BASE, rl_live: "1", rl_save: save() }));
  await T(P, "yard"); await T(P, "face", 0, 1);
  const lp2 = await T(P, "mon", 5, 0, { leap: { cd: 0 }, atk: 0 });
  await T(P, "world");
  const me2 = await T(P, "me"), f2 = await T(P, "foe", lp2), rt = await T(P, "rt");
  check("real-time: aims 4 tiles ahead (I keep walking while it winds up)", rt && f2.leapAt && f2.leapAt.y === me2.y + 4 && f2.leapAt.x === me2.x, JSON.stringify([rt, f2, me2]));
  check("no page errors (live)", errors.length === 0, errors.join("; "));
  await ctx.close();

  // ---- 5. 3D: 오라는 두 손의 번개 빛 ----
  ({ ctx, page: P, errors } = await open({ ...BASE, rl_3d: "1", rl_sskin_own: JSON.stringify(["skin_bolt_blue", "skin_bolt_aura"]), rl_save: save() }));
  const on3d = await P.waitForFunction(() => document.body.classList.contains("view-3d"), null, { timeout: 15000 }).then(() => true).catch(() => false);
  await sleep(800);
  const filt = await P.evaluate(() => document.getElementById("hand3d")?.style.filter || "");
  check("3D: hands glow with the aura color", on3d && /drop-shadow/.test(filt) && /77, 163, 255|#4da3ff/i.test(filt), filt);
  await P.locator("#stage").screenshot({ path: path.join(SHOTS, "r172-3d-aura.png") });
  check("no page errors (3D)", errors.length === 0, errors.join("; "));
  await ctx.close();
} finally { await browser.close(); }
console.log(`${results.filter(Boolean).length}/${results.length} passed`);
