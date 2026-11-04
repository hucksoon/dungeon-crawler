// dc#165: 1층에서 탄 포탈도 마을에 파란 포탈 (그 옆에 서고, 들어가면 떠난 자리로) · 포탈 없이 1층 문으로 들어가면 장비·강화석까지 모두 초기화
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { goDoor, inTown } from "./town.mjs";
const require = createRequire(process.env.NODE_PATH + "/");
const { chromium } = require("playwright");
const REPO = process.argv[2];
const ORIGIN = "https://hucksoon.github.io/hucksoon/";
const R = createRequire(import.meta.url), I = R(path.join(REPO, "items.js")), J = R(path.join(REPO, "jump.js"));
const results = [];
const check = (n, ok, x = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x && !ok ? " — " + x : ""}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const DEV = "r166-dev";
const gen = (slot, lvl, n0 = 0) => { for (let n = n0; ; n++) { const it = I.generate(`r166|${slot}|${n}`, "golden", lvl); if (it.slot === slot) return it; } };
const sword = gen("weapon", 10), chest = gen("chest", 10);
const invJson = JSON.stringify({ bag: [], equip: { ...Object.fromEntries(I.EQUIP_SLOTS.map(x => [x, null])), weapon: sword, chest }, log: [], stones: 37, nmStones: 4,
  pets: { have: { goblin: { g: "common", at: 1, s: "elite" } }, on: "goblin", pin: false } });
const HOOK = `
  window.__t = {
    s: () => ({ scene, depth, rid: player.rid, x: player.x, y: player.y, lvl: player.plvl, gold: player.gold, tp: !!player.tp, resume: resumeFloor(), over: gameOver,
      gear: Object.values(Inv.equipped()).filter(Boolean).length, stones: Inv.stones(), nm: Inv.stonesOf("nmStones"), pets: Object.keys(Inv.pets().have) }),
    logs: () => [...document.querySelectorAll("#log > *")].map(n => n.textContent),
    lvl: (n) => { player.plvl = n; player.gold = 777; saveGame(true); },
    die: () => { player.hp = 0; gameOver = true; saveGame(true); },
    startOver: () => startOver(),
  };
  // ---- 시작 ----`;
const EXE = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const browser = await chromium.launch({ executablePath: EXE });
async function open(storage) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 } }); const page = await ctx.newPage(); const errors = [], dialogs = [];
  page.on("pageerror", e => errors.push(e.message)); page.on("dialog", d => { dialogs.push(d.message()); d.accept(); });
  await ctx.route(ORIGIN + "**", r => { const f = new URL(r.request().url()).pathname.replace("/hucksoon/", "") || "index.html";
    if (f === "ranking-config.js") return r.fulfill({ contentType: "text/javascript", body: `window.RANKING_API = "";` });
    const p = path.join(REPO, f); if (!fs.existsSync(p)) return r.fulfill({ status: 404, body: "" });
    let body = fs.readFileSync(p); if (f === "index.html") body = body.toString("utf8").replace("  // ---- 시작 ----", HOOK);
    r.fulfill({ contentType: f.endsWith(".js") ? "text/javascript" : f.endsWith(".png") ? "image/png" : f.endsWith(".webp") ? "image/webp" : "text/html", body }); });
  await ctx.addInitScript((s) => { if (!sessionStorage.getItem("s")) { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); sessionStorage.setItem("rl_scene", "dungeon"); sessionStorage.setItem("s", 1); } }, storage);
  await page.goto(ORIGIN);
  await page.waitForFunction(() => window.__t);
  await sleep(500);
  return { ctx, page, errors, dialogs };
}
const save = (run = {}) => JSON.stringify({ v: 1, best: 12, run: { d: 1, hp: 500, mh: 500, a: 40, g: 100, l: 5, x: 0, xn: 5000, x4: 1, rid: "r166", k: 0, pp: 0, ...run } });
const T = (page, fn, ...a) => page.evaluate(([f, a]) => window.__t[f](...a), [fn, a]);
const BASE = { rl_oldtown: "off", rl_bless: "on", rl_autogear: "1", rl_market: "paused", rl_device_id: DEV, rl_3d: "0", rl_live: "off", rl_tut: JSON.stringify(["intro"]), rl_tip_dodge: "1" };
const door = (id) => J.TOWN.doors.find(d => d.id === id).x;

try {
  const A = await open({ ...BASE, rl_save: save(), [`rl_inv:g:${DEV}`]: invJson });
  await T(A.page, "lvl", 6);
  const s0 = await T(A.page, "s");
  check("starts on floor 1 with gear and stones", s0.scene === "dungeon" && s0.depth === 1 && s0.gear === 2 && s0.stones === 37 && !s0.tp, JSON.stringify(s0));

  // ---- 1. 1층에서 포탈 → 마을의 파란 포탈 옆 ----
  await A.page.keyboard.press("p"); await sleep(400);
  const s1 = await T(A.page, "s"), pos1 = await A.page.evaluate(() => window.RLTownPos());
  check("portal on floor 1 → town, the blue portal is there (resume floor 1)", s1.scene === "lobby" && (await inTown(A.page)) && s1.resume === 1 && s1.tp, JSON.stringify(s1));
  check(`stand next to the blue portal (x ${pos1?.x}), not at the floor 1 gate (x ${door("start")})`, Math.abs(pos1.x - door("resume")) < 0.6 && Math.abs(pos1.x - door("start")) > 2, JSON.stringify(pos1));
  check("log says the blue portal leads back to floor 1", (await T(A.page, "logs")).some(l => /파란 포탈로 .*1층/.test(l)));

  // ---- 2. 새로고침해도 파란 포탈이 남음 ----
  await A.page.reload(); await A.page.waitForFunction(() => window.__t); await sleep(500);
  const s2 = await T(A.page, "s");
  check("reload in town → still able to go back to floor 1 (saved)", s2.scene === "lobby" && s2.resume === 1 && s2.tp, JSON.stringify(s2));

  // ---- 3. 파란 포탈 → 떠난 자리 (같은 지도·같은 레벨·장비 그대로) ----
  await goDoor(A.page, "resume"); await sleep(400);
  const s3 = await T(A.page, "s");
  check("blue portal → back to the same floor 1 spot, same run, level and gear kept", s3.scene === "dungeon" && s3.depth === 1 && s3.rid === s0.rid && s3.x === s0.x && s3.y === s0.y && s3.lvl === 6 && s3.gear === 2 && s3.stones === 37 && !s3.tp, JSON.stringify(s3));
  check("no confirm dialog for the blue portal", A.dialogs.length === 0, A.dialogs.join(" | "));

  // ---- 4. 다시 포탈 → 1층 문 (새 판): 확인 창 → 모두 초기화 ----
  await A.page.keyboard.press("p"); await sleep(400);
  await goDoor(A.page, "start"); await sleep(500);
  const s4 = await T(A.page, "s");
  check("floor 1 gate asks first (the portal floor will be gone, no gear)", A.dialogs.length === 1 && /맨몸/.test(A.dialogs[0]) && /1층/.test(A.dialogs[0]), A.dialogs.join(" | "));
  check("new run from the gate: level 1, gold 0, no gear, no stones (all kinds), new map", s4.scene === "dungeon" && s4.depth === 1 && s4.lvl === 1 && s4.gold === 0 && s4.gear === 0 && s4.stones === 0 && s4.nm === 0 && s4.rid !== s0.rid && !s4.tp, JSON.stringify(s4));
  check("pets stay (collection)", s4.pets.includes("goblin"));
  check("log: gear and stones cleared", (await T(A.page, "logs")).some(l => /새 판: 장비 2개와 강화석을 모두 비우고/.test(l)));
  await A.page.reload(); await A.page.waitForFunction(() => window.__t); await sleep(400);
  const s5 = await T(A.page, "s");
  check("still empty after reload (saved)", s5.gear === 0 && s5.stones === 0 && s5.lvl === 1, JSON.stringify(s5));
  check("no page errors", A.errors.length === 0, A.errors.join("; "));
  await A.ctx.close();

  // ---- 5. 쓰러진 뒤 로비에서 새로 시작 → 1층 문 = 맨몸 (파란 포탈 없음) ----
  const B = await open({ ...BASE, rl_save: save({ d: 7, rid: "r166b" }), [`rl_inv:g:${DEV}`]: invJson });
  await T(B.page, "die"); await T(B.page, "startOver"); await sleep(400);
  const b1 = await T(B.page, "s");
  check("after death: lobby, level 1 · gold 0, gear still on until the gate, no blue portal", b1.scene === "lobby" && b1.lvl === 1 && b1.gold === 0 && b1.gear === 2 && b1.resume === 0 && !b1.tp, JSON.stringify(b1));
  check("death messages say the next run starts with no gear", (await T(B.page, "logs")).some(l => /1층 문으로 들어가면 장비·강화석도 비우고/.test(l)));
  await goDoor(B.page, "start"); await sleep(500);
  const b2 = await T(B.page, "s");
  check("gate asks (you have gear) and then clears everything", B.dialogs.length === 1 && /맨몸/.test(B.dialogs[0]) && b2.scene === "dungeon" && b2.gear === 0 && b2.stones === 0 && b2.lvl === 1, JSON.stringify([B.dialogs, b2]));
  // 맨몸이면 묻지 않음
  await B.page.keyboard.press("p"); await sleep(300);
  check("portal from the fresh floor 1 → blue portal again", (await T(B.page, "s")).resume === 1);
  check("no page errors (death)", B.errors.length === 0, B.errors.join("; "));
  await B.ctx.close();

  // ---- 6. 2층 이상은 예전과 같이 ----
  const C = await open({ ...BASE, rl_bless: "off", rl_save: save({ d: 4, rid: "r166c" }), [`rl_inv:g:${DEV}`]: invJson });   // 축복 고르기 창 없이
  await C.page.keyboard.press("Escape"); await C.page.keyboard.press("p"); await sleep(400);
  const c1 = await T(C.page, "s"), cp = await C.page.evaluate(() => window.RLTownPos());
  check(`portal on floor ${c1.resume} → next to the blue portal (as before)`, c1.resume >= 2 && c1.scene === "lobby" && Math.abs(cp.x - door("resume")) < 0.6, JSON.stringify([c1, cp]));
  await C.ctx.close();
} finally { await browser.close(); }
const pass = results.filter(Boolean).length;
console.log(`\n${pass} passed, ${results.length - pass} failed`);
process.exit(pass === results.length ? 0 : 1);
