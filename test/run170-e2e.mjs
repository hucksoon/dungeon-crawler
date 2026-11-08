// dc#170: 유물 바닥남 (8가지 × 3번) → 새 유물 넷 + 5번까지 · 나이트메어·헬 몬스터 경험치가 층마다 늘어남 (헬에서 레벨이 멈추지 않게)
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
const require = createRequire(process.env.NODE_PATH + "/");
const { chromium } = require("playwright");
const REPO = process.argv[2];
const ORIGIN = "https://hucksoon.github.io/hucksoon/";
const R = createRequire(import.meta.url), M = R(path.join(REPO, "monsters.js")), B = R(path.join(REPO, "blessings.js"));
const results = [];
const check = (n, ok, x = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x && !ok ? " — " + x : ""}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ---- 규칙 ----
const ids = Object.keys(B.RELICS), total = ids.reduce((a, id) => a + B.RELICS[id].max, 0);
check(`12 relics, ${total} picks in all (was 8 × 3 = 24)`, ids.length === 12 && total >= 50 && ["tome", "mark", "sage", "spring"].every(k => B.RELICS[k]?.max === 5));
check("cap relics go to 5, resist relics stay at 3", ["hawk", "grail", "wall", "heart"].every(k => B.RELICS[k].max === 5) && ["resFire", "resIce", "resBolt", "resPoison"].every(k => B.RELICS[k].max === 3));
// 헬 5층 보스 = 21번째 보스: 예전 규칙이면 남은 유물 2개뿐이던 모음에서도 3개가 나옴
const have = { hawk: 3, grail: 3, wall: 3, heart: 3, resFire: 3, resPoison: 3, resIce: 2, resBolt: 1 };
check("after 21 bosses there are still 3 relics to pick", Array.from({ length: 50 }, (_, i) => B.offer(`r170|${i}`, have, true)).every(o => o.length === 3));
check("new relic texts", /스킬 피해 \+6%/.test(B.fxText(B.RELICS.tome.fx)) && /정예·보스에게 주는 피해 \+8%/.test(B.fxText(B.RELICS.mark.fx)) && /경험치 \+10%/.test(B.fxText(B.RELICS.sage.fx)) && /포션 회복량 \+20%/.test(B.fxText(B.RELICS.spring.fx)));
const r = () => 0.5, t = M.pickNightmareType(r);
const nm1 = M.makeNightmare(t, "normal", 1).xp, nm50 = M.makeNightmare(t, "normal", 50).xp, h1 = M.makeHell(t, "normal", 1).xp, h50 = M.makeHell(t, "normal", 50).xp;
check(`deep XP grows by floor: nightmare 1 → 50 (${nm1} → ${nm50}), hell 1 → 50 (${h1} → ${h50})`, nm50 > nm1 * 3 && h1 >= nm50 * 0.95 && h50 > h1 * 4);
check("nightmare boss XP grows too", M.makeNightmareBoss(50).xp > M.makeNightmareBoss(1).xp * 3 && M.makeHellBoss(50).xp > M.makeHellBoss(1).xp * 4);
check("abyss XP unchanged (divided back)", Math.abs(M.makeAbyss(t, "normal", 1).xp - 27750) < 30, String(M.makeAbyss(t, "normal", 1).xp));

// ---- 게임: 마도서(스킬 피해 +%) · 사냥꾼의 표식(정예·보스 피해 +%) ----
const HOOK = `
  window.__t = {
    yard: () => { enemies = []; items = []; shots = []; floorSt.ls = 1; floorSt.sc = 999; player.hp = 99999;
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const x = player.x + dx, y = player.y + dy; if (map[y]?.[x] !== undefined) { map[y][x] = FLOOR; visible[y][x] = true; } } },
    mon: (dx, kind) => { const m = { ...RLMonsters.makeNormal(RLMonsters.pickType(2, () => 0.5), "normal", 2), kind, x: player.x + dx, y: player.y, hp: 1e6, maxHp: 1e6, def: 0, ranged: false, slow: 99, res: {} }; enemies.push(m); return m; },
    setRl: (rl) => { player.bl = {}; player.rl = rl; updateStats(); },
    st: () => { const s = stats(); return { skillPct: s.skillPct, eliteDmg: s.eliteDmg, xp: s.xp, potPct: s.potPct }; },
    skill: (kind) => { const e = window.__t.mon(3, kind); const s = stats(); skillHit(e, 1000, false, STARTER.color, s, 0); return 1e6 - e.hp; },
  };
  // ---- 시작 ----`;
const EXE = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const browser = await chromium.launch({ executablePath: EXE });
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 } }); const page = await ctx.newPage(); const errors = [];
  page.on("pageerror", e => errors.push(e.message)); page.on("dialog", d => d.accept());
  await ctx.route(ORIGIN + "**", rr => { const f = new URL(rr.request().url()).pathname.replace("/hucksoon/", "") || "index.html";
    if (f === "ranking-config.js") return rr.fulfill({ contentType: "text/javascript", body: `window.RANKING_API = "";` });
    const p = path.join(REPO, f); if (!fs.existsSync(p)) return rr.fulfill({ status: 404, body: "" });
    let body = fs.readFileSync(p); if (f === "index.html") body = body.toString("utf8").replace("  // ---- 시작 ----", HOOK);
    rr.fulfill({ contentType: f.endsWith(".js") ? "text/javascript" : f.endsWith(".png") ? "image/png" : f.endsWith(".webp") ? "image/webp" : "text/html", body }); });
  const save = JSON.stringify({ v: 1, best: 12, run: { d: 6, hp: 500, mh: 500, a: 40, g: 100, l: 10, x: 0, xn: 5000, x4: 1, rid: "r170", k: 0, pp: 0 } });
  await ctx.addInitScript((s) => { if (!sessionStorage.getItem("s")) { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); sessionStorage.setItem("rl_scene", "dungeon"); sessionStorage.setItem("s", 1); } },
    { rl_oldtown: "off", rl_bless: "off", rl_live: "off", rl_3d: "0", rl_save: save, rl_device_id: "r170-dev", rl_tut: JSON.stringify(["intro"]), rl_tip_dodge: "1" });
  await page.goto(ORIGIN); await page.waitForFunction(() => window.__t); await sleep(400);
  const T = (fn, ...a) => page.evaluate(([f, a]) => window.__t[f](...a), [fn, a]);
  await T("yard"); await T("setRl", {});
  const base = await T("skill", "normal"), baseE = await T("skill", "elite");
  await T("setRl", { tome: 5, mark: 5, sage: 5, spring: 5 });
  const st = await T("st"), withN = await T("skill", "normal"), withE = await T("skill", "elite");
  check("relic stats: skill +30% · elite +40% · XP +50% · potion +100% at 5 each", st.skillPct === 30 && st.eliteDmg === 40 && st.xp >= 50 && st.potPct >= 100, JSON.stringify(st));
  check(`마도서 조각: skill damage ×1.3 on normal monsters (${base} → ${withN})`, Math.abs(withN / base - 1.3) < 0.01);
  check(`사냥꾼의 표식: elites take ×1.4 on top (${baseE} → ${withE})`, Math.abs(withE / baseE - 1.3 * 1.4) < 0.01);
  check("no page errors", errors.length === 0, errors.join("; "));
  await ctx.close();
} finally { await browser.close(); }
const pass = results.filter(Boolean).length;
console.log(`\n${pass} passed, ${results.length - pass} failed`);
process.exit(pass === results.length ? 0 : 1);
