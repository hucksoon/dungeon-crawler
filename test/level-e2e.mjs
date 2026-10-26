// 레벨 (dc#95): 레벨마다 최대 HP·공격력 +2%, 쓰러진 뒤 새로 시작하면 경험치 10%를 잃음 (레벨이 내려갈 수 있음)
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
const require = createRequire(process.env.NODE_PATH + "/");
const { chromium } = require("playwright");
const REPO = process.argv[2], SHOTS = process.argv[3];
const ORIGIN = "https://hucksoon.github.io/hucksoon/";
const results = [];
const check = (n, ok, x = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x ? " — " + x : ""}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const HOOK = `
  window.__t = {
    s: () => { const S = stats(); return { scene, depth, gameOver, gold: player.gold, plvl: player.plvl, xp: player.xp, xpNext: player.xpNext, baseHp: player.maxHp, baseAtk: player.atk, maxHp: S.maxHp, atk: S.atk }; },
    die: () => { player.hp = 0; death(); render(); },
    xp: (n) => { gainXp(n); updateStats(); },
  };
  // ---- 시작 ----`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
async function open(storage) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 } }); const page = await ctx.newPage(); const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await ctx.route(ORIGIN + "**", r => { const f = new URL(r.request().url()).pathname.replace("/hucksoon/", "") || "index.html";
    if (f === "ranking-config.js") return r.fulfill({ contentType: "text/javascript", body: `window.RANKING_API = "";` });
    const p = path.join(REPO, f); if (!fs.existsSync(p)) return r.fulfill({ status: 404, body: "" });
    let body = fs.readFileSync(p, "utf8"); if (f === "index.html") body = body.replace("  // ---- 시작 ----", HOOK);
    r.fulfill({ contentType: f.endsWith(".js") ? "text/javascript" : "text/html", body }); });
  await ctx.addInitScript((s) => { if (!sessionStorage.getItem("s")) { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); sessionStorage.setItem("rl_scene", "dungeon"); sessionStorage.setItem("s", 1); } }, storage);
  await page.goto(ORIGIN);
  await page.waitForFunction(() => window.__t);
  return { ctx, page, errors };
}
// 장비 없는 저장 판: Lv l, 경험치 x / xn, 기본 최대 HP mh, 공격력 a
const save = (l, x, xn, mh, a) => JSON.stringify({ v: 1, best: 4, run: { d: 4, hp: mh, mh, a, g: 120, p: 2, l, x, xn, rid: "lvl-run", k: 0, pp: 0 } });
const st = (page) => page.evaluate(() => window.__t.s());
const logText = (page) => page.locator("#log").innerText();
const restart = async (page) => { await page.evaluate(() => window.__t.die()); await page.locator("#death-restart").click(); await sleep(150); return st(page); };

try {
  // ---- 레벨 보너스: Lv 11 → +20% ----
  const A = await open({ rl_device_id: "lvl-a", rl_save: save(11, 0, 577, 60, 13) });
  let s = await st(A.page);
  check("Lv 11 without gear: max HP 60 × 1.2 = 72, attack 13 × 1.2 = 16", s.plvl === 11 && s.maxHp === 72 && s.atk === 16, JSON.stringify(s));
  await A.page.evaluate(() => window.__t.xp(577));
  s = await st(A.page);
  check("level up → Lv 12: base +4 HP / +1 atk, then +22%", s.plvl === 12 && s.baseHp === 64 && s.baseAtk === 14 && s.maxHp === Math.round(64 * 1.22) && s.atk === Math.round(14 * 1.22), JSON.stringify(s));
  check("level-up log shows the bonus", (await logText(A.page)).includes("레벨 보너스 +22%"));
  check("stats panel shows the bonused max HP", (await A.page.locator("#stats").innerText()).includes(String(s.maxHp)));
  check("stats panel shows the level bonus next to Lv", (await A.page.locator("#lvb").innerText()).trim() === "+22%");
  check("A: no page errors", A.errors.length === 0, A.errors.join("; "));
  await A.ctx.close();

  // ---- 쓰러진 뒤 새로 시작: 경험치 10% (Lv 5 필요 49 → 4) ----
  const B = await open({ rl_device_id: "lvl-b", rl_save: save(5, 20, 49, 36, 7) });
  await B.page.evaluate(() => window.__t.die());
  s = await st(B.page);
  check("dying alone does not take XP yet (revive keeps it)", s.gameOver && s.plvl === 5 && s.xp === 20);
  check("death modal says how much XP is lost", (await B.page.locator("#death-sub").innerText()).includes("경험치를 4 잃어요"));
  await B.page.screenshot({ path: path.join(SHOTS, "level-death.png") });
  // 쓰러진 채로 다시 열어도 한 번만 잃음
  await B.page.reload(); await B.page.waitForFunction(() => window.__t);
  check("reload while dead → still Lv 5 / 20 XP, death modal open", (await st(B.page)).xp === 20 && await B.page.locator("#death-modal").isVisible());
  await B.page.locator("#death-restart").click(); await sleep(150);
  s = await st(B.page);
  check("restart → lobby, gold 0, Lv 5 kept, XP 20 → 16", s.scene === "lobby" && s.gold === 0 && s.plvl === 5 && s.xp === 16 && s.xpNext === 49 && s.baseHp === 36 && s.baseAtk === 7, JSON.stringify(s));
  check("restart log: lost 4 XP", (await logText(B.page)).includes("경험치 4을(를) 잃었다. (Lv 5)"));
  await B.page.reload(); await B.page.waitForFunction(() => window.__t);
  s = await st(B.page);
  check("reload after restart → level and XP saved", s.plvl === 5 && s.xp === 16, JSON.stringify(s));
  check("B: no page errors", B.errors.length === 0, B.errors.join("; "));
  await B.ctx.close();

  // ---- 레벨 다운: Lv 5, 경험치 2 → −4 → Lv 4 (필요 33), 경험치 31 ----
  const C = await open({ rl_device_id: "lvl-c", rl_save: save(5, 2, 49, 36, 7) });
  s = await restart(C.page);
  check("not enough XP → level down to Lv 4 with 31/33 XP, base HP 32 / atk 6", s.plvl === 4 && s.xp === 31 && s.xpNext === 33 && s.baseHp === 32 && s.baseAtk === 6, JSON.stringify(s));
  check("Lv 4 bonus is +6%", s.maxHp === Math.round(32 * 1.06) && s.atk === Math.round(6 * 1.06), JSON.stringify(s));
  check("level-down log", (await logText(C.page)).includes("레벨이 내려갔다. Lv 4"));
  // 다시 쓰러지면 Lv 4 필요의 10% = 3 → 28
  s = await restart(C.page);
  check("second restart → Lv 4, 28 XP", s.plvl === 4 && s.xp === 28, JSON.stringify(s));
  check("C: no page errors", C.errors.length === 0, C.errors.join("; "));
  await C.ctx.close();

  // ---- Lv 1은 더 내려가지 않음 ----
  const D = await open({ rl_device_id: "lvl-d", rl_save: save(1, 0, 10, 20, 3) });
  s = await restart(D.page);
  check("Lv 1 with 0 XP → stays Lv 1, 0 XP", s.plvl === 1 && s.xp === 0 && s.xpNext === 10 && s.baseHp === 20 && s.baseAtk === 3 && s.maxHp === 20 && s.atk === 3, JSON.stringify(s));
  check("D: no page errors", D.errors.length === 0, D.errors.join("; "));
  await D.ctx.close();
} finally {
  await browser.close();
}
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
