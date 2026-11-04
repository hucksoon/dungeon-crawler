// dc#168: 속성 축복 상한 없앰 · 독구름(4번째 속성)과 각성 역병 · 융합 스킬 6가지 (두 속성 Lv 10)
//   나이트메어: 몬스터 수 늘림(헬은 그대로)·입구 배율 없음·강화 미사일 2개·점프 공격 · 맵 조금 작게 · 강화 절반만 이어받기
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
const require = createRequire(process.env.NODE_PATH + "/");
const { chromium } = require("playwright");
const REPO = process.argv[2];
const ORIGIN = "https://hucksoon.github.io/hucksoon/";
const R = createRequire(import.meta.url), M = R(path.join(REPO, "monsters.js")), B = R(path.join(REPO, "blessings.js")), I = R(path.join(REPO, "items.js"));
const results = [];
const check = (n, ok, x = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x && !ok ? " — " + x : ""}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ---- 규칙 (blessings.js · monsters.js · items.js) ----
check("element cap removed (no ELEM_CAP)", B.ELEM_CAP === undefined);
check("4 elements: fire · ice · bolt · poison", JSON.stringify(B.ELEM_IDS) === JSON.stringify(["fire", "ice", "bolt", "poison"]) && B.BLESSINGS.poison.tier === "elem" && B.BLESSINGS.poison.max === 10);
const offered = (have, id) => Array.from({ length: 300 }, (_, i) => B.offer(`r168|${i}`, have)).some(o => o.includes(id));
check("with fire 10 · ice 10 · bolt 10 (old cap 30 > 20) element cards still come (poison)", offered({ fire: 10, ice: 10, bolt: 10 }, "poison"));
check("poison grows: area 1 → 4 → 9 → 16 tiles, alternating with damage / duration", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(l => B.ELEM.poison(l).size).join() === "1,1,2,2,3,3,3,3,4,4"
  && B.ELEM.poison(2).pct > B.ELEM.poison(1).pct && B.ELEM.poison(4).turns > B.ELEM.poison(3).turns && B.ELEM.poison(6).pct > B.ELEM.poison(5).pct && B.ELEM.poison(7).every < B.ELEM.poison(6).every);
check("awakened plague needs poison Lv 10", !offered({ poison: 9 }, "poisonAw") && offered({ poison: 10 }, "poisonAw") && B.BLESSINGS.poisonAw.name.startsWith("각성 "));
check("6 fusion skills, one per pair of elements", Object.keys(B.FUSE_IDS).length === 6 && new Set(Object.values(B.FUSE_IDS).map(p => [...p].sort().join("+"))).size === 6);
check("fusion appears only when both elements are Lv 10", !offered({ fire: 10, bolt: 9 }, "flamebolt") && offered({ fire: 10, bolt: 10 }, "flamebolt") && !offered({ fire: 10, bolt: 10 }, "steam"));
check("fusion cards say what they do", Object.keys(B.FUSE_IDS).every(id => /Lv 1: /.test(B.cardText(id, 1)) && B.BLESSINGS[id].max === B.FUSE_MAX));
check("nightmare has more monsters, hell keeps the old count", M.nmMonsterCount(1) > 20 && M.nmMonsterCount(50) > 50 && M.hellMonsterCount(1) === 20 && M.hellMonsterCount(50) === 50);
check("nightmare has no entry ramp any more", M.entryMul(M.NIGHTMARE.entry, 1) === 1 && M.entryMul(M.HELL.entry, 1) < 1);
check("enhancement: half carries over (7 → 3, 12 → 6)", I.inheritEnh(7) === 3 && I.inheritEnh(12) === 6 && I.inheritEnh(0) === 0);

const HOOK = `
  window.__t = {
    yard: () => { enemies = []; items = []; shots = []; floorSt.ls = 1; floorSt.sc = 999; toxCloud.clear(); fireTrail.clear();
      for (const k of ["poisonCd", "fboltCd", "steamCd", "igniteCd", "neuroCd", "fbCd", "novaCd", "chainCd", "starterCd", "fieldCd"]) player[k] = 0;
      for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) { const x = player.x + dx, y = player.y + dy; if (map[y]?.[x] !== undefined) { map[y][x] = FLOOR; visible[y][x] = true; seen[y][x] = true; } }
      player.hp = 99999; render(); },
    mon: (dx, dy, o = {}) => { const m = { ...RLMonsters.makeNormal(RLMonsters.pickType(2, () => 0.5), "normal", 2), x: player.x + dx, y: player.y + dy, hp: 100000, maxHp: 100000, atk: 1, def: 0, ranged: false, ...o }; enemies.push(m); return enemies.length - 1; },
    foe: (i) => { const e = enemies[i]; return e ? { hp: e.hp, maxHp: e.maxHp, x: e.x, y: e.y, tox: e.tox > turn, stun: e.stun > turn, slow: e.slow || 0, shock: e.shock > turn, burn: !!e.burn, leapAt: e.leapAt || null, aim: e.aim || null } : null; },
    alive: (i) => enemies.includes(window.__t._m[i]),
    keep: () => { window.__t._m = [...enemies]; },
    setBl: (bl) => { player.bl = bl; player.rl = {}; updateStats(); },
    cast: () => castSkills(stats()),
    world: () => worldTurn(),
    clouds: () => [...toxCloud.keys()],
    me: () => ({ x: player.x, y: player.y, hp: player.hp, maxHp: stats().maxHp }),
    face: (dx, dy) => { player.face = { dx, dy }; },
    move: (dx, dy) => { player.x += dx; player.y += dy; },
    hud: () => skillHud(),
    logs: () => [...document.querySelectorAll("#log > *")].map(n => n.textContent),
    aimCells: (i) => aimCells(enemies[i].aim).length,
    cnt: () => ({ nm: deepCount(5) }),
    size: (n) => openSize(n),
    zone: (z) => { player.zone = z; },
    nmSkill: (n) => { const o = player.zone; player.zone = "nm"; let leap = 0, twin = 0, rg = 0; for (let i = 0; i < n; i++) { const m = nmSkill({ kind: "normal", ranged: i % 2 === 0 }); if (m.leap) leap++; if (m.twin) twin++; if (m.ranged) rg++; } player.zone = o; return { leap, twin, rg }; },
    swap: () => { const keys = Object.keys(Inv.equipped()); const old = Inv.equipped().weapon; return { old: old?.enh, keys }; },
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
const save = (run = {}) => JSON.stringify({ v: 1, best: 12, run: { d: 6, hp: 500, mh: 500, a: 40, g: 100, l: 10, x: 0, xn: 5000, x4: 1, rid: "r168", k: 0, pp: 0, ...run } });
const T = (page, fn, ...a) => page.evaluate(([f, a]) => window.__t[f](...a), [fn, a]);
const BASE = { rl_oldtown: "off", rl_bless: "off", rl_autogear: "1", rl_market: "paused", rl_device_id: "r168-dev", rl_3d: "0", rl_live: "off", rl_tut: JSON.stringify(["intro"]), rl_tip_dodge: "1" };

try {
  const A = await open({ ...BASE, rl_save: save() });
  const P = A.page;
  await P.keyboard.press("Escape");

  // ---- 1. 독구름: 적 자리에 구름, 구름 위의 적은 피해 + 중독 ----
  await T(P, "yard"); await T(P, "setBl", { poison: 5 });
  const a = await T(P, "mon", 2, 0); await T(P, "mon", 3, 0); await T(P, "mon", 2, 1);
  await T(P, "cast");
  const c1 = await T(P, "clouds"), f1 = await T(P, "foe", a);
  check(`poison Lv 5 lays a 3×3 cloud on an enemy (${c1.length} tiles)`, c1.length === 9, JSON.stringify(c1));
  check("enemy in the cloud is hurt and poisoned", f1.hp < f1.maxHp && f1.tox, JSON.stringify(f1));
  check("log says 독구름", (await T(P, "logs")).some(l => /☁ 독구름! 9칸에 4턴/.test(l)));
  check("HUD shows the poison cloud", (await T(P, "hud")).some(h => /☁ 독구름/.test(h)));

  // ---- 2. 각성 역병: 중독된 적이 쓰러지면 둘레 적에게 그 적 최대 HP의 % ----
  await T(P, "yard"); await T(P, "setBl", { poison: 10, poisonAw: 10 });
  const weak = await T(P, "mon", 3, 0, { hp: 1, maxHp: 50000 }); const nb = await T(P, "mon", 4, 0, { hp: 100000, maxHp: 100000 });   // 마력탄(2칸)이 먼저 잡지 않게 3칸
  await T(P, "keep");
  await T(P, "cast");
  const fNb = await T(P, "foe", 0);   // weak는 쓰러져서 enemies[0]이 이웃
  check("poisoned enemy dies → plague bursts on its neighbour (26% of 50000 = 13000)", fNb && fNb.maxHp - fNb.hp >= 13000 && fNb.tox, JSON.stringify(fNb));
  check("log says 역병", (await T(P, "logs")).some(l => /☣ 역병! 중독된 적 \d+마리가 터져/.test(l)));

  // ---- 3. 융합 스킬 ----
  // 불꽃 번개: 불 번개 + 화상
  await T(P, "yard"); await T(P, "setBl", { fire: 10, bolt: 10, flamebolt: 1 });
  const fb = await T(P, "mon", 4, 0); await T(P, "cast");
  check("🌩 flamebolt: fire chain + burn", (await T(P, "foe", fb)).burn && (await T(P, "logs")).some(l => /🌩 불꽃 번개!/.test(l)));
  // 증기 폭발: 느려진 적은 2배
  await T(P, "yard"); await T(P, "setBl", { steam: 1 });   // 화염구 등이 같이 맞히지 않게 융합 스킬만
  const s1 = await T(P, "mon", 3, 0, { slow: 9 }), s2 = await T(P, "mon", 3, 1, { immune: 99 });
  await T(P, "cast");
  const fs1 = await T(P, "foe", s1), fs2 = await T(P, "foe", s2), d1 = fs1.maxHp - fs1.hp, d2 = fs2.maxHp - fs2.hp;
  check(`💨 steam: frozen enemy takes about double (${d1} vs ${d2})`, d2 > 0 && d1 > d2 * 1.6, JSON.stringify([fs1, fs2]));
  // 독가스 점화: 독구름 위의 적에게 불 + 화상
  await T(P, "yard"); await T(P, "setBl", { fire: 10, poison: 10, ignite: 1 });
  const ig = await T(P, "mon", 2, 0, { immune: 99 }); await T(P, "cast");
  check("💥 ignite: enemy on the poison cloud gets fire + burn", (await T(P, "foe", ig)).burn && (await T(P, "logs")).some(l => /💥 독가스 점화!/.test(l)));
  // 번개 눈보라: 주변 적 느려짐 + 감전
  await T(P, "yard"); await T(P, "setBl", { storm: 3 });
  const st1 = await T(P, "mon", 2, 0); const st2 = await T(P, "mon", 5, 0); await T(P, "cast");
  const fst1 = await T(P, "foe", st1), fst2 = await T(P, "foe", st2);
  check("🌨 storm: enemy within 2 tiles slowed + shocked, far one untouched by it", fst1.slow > 0 && fst1.shock && !fst2.shock, JSON.stringify([fst1, fst2]));
  // 서리 독안개: 구름 위의 적이 느려짐
  await T(P, "yard"); await T(P, "setBl", { ice: 10, poison: 10, frostfog: 1 });
  const ff = await T(P, "mon", 2, 0); await T(P, "cast");
  check("🌫 frost fog: enemy on the cloud is slowed", (await T(P, "foe", ff)).slow > 0);
  // 신경독: 중독된 적에게 번개 + 마비 → 그 턴에 움직이지 못함
  await T(P, "yard"); await T(P, "setBl", { bolt: 10, poison: 10, neuro: 1 });
  const nu = await T(P, "mon", 3, 0, { immune: 99 }); await T(P, "cast"); await T(P, "cast");
  const fnu = await T(P, "foe", nu);
  check("🧬 neuro: poisoned enemy is stunned", fnu.stun && (await T(P, "logs")).some(l => /🧬 신경독!/.test(l)), JSON.stringify(fnu));
  const before = await T(P, "foe", nu); await T(P, "world"); const after = await T(P, "foe", nu);
  check("stunned enemy does not move that turn", before.x === after.x && before.y === after.y, JSON.stringify([before, after]));

  // ---- 4. 나이트메어 기술 ----
  const sk = await T(P, "nmSkill", 4000);
  check(`nightmare: some ranged get twin missiles (${sk.twin}/${sk.rg}) and some melee get jump attack (${sk.leap}/${4000 - sk.rg})`, sk.twin > sk.rg * 0.4 && sk.twin < sk.rg * 0.6 && sk.leap > 150 && sk.leap < 500, JSON.stringify(sk));
  // 점프 공격: 가던 쪽 2칸 앞을 노림 → 그대로 있으면 맞고, 피하면 안 맞음
  await T(P, "yard"); await T(P, "setBl", {}); await T(P, "face", 0, 1);
  const lp = await T(P, "mon", 4, 0, { leap: { cd: 0 }, atk: 0 });
  await T(P, "world");
  const me0 = await T(P, "me"), fl = await T(P, "foe", lp);
  check("jump attack aims 2 tiles ahead of where I was going", fl.leapAt && fl.leapAt.x === me0.x && fl.leapAt.y === me0.y + 2, JSON.stringify([fl, me0]));
  check("log warns about the jump", (await T(P, "logs")).some(l => /높이 뛰어오른다/.test(l)));
  await T(P, "move", 0, 2);   // 가던 길로 그대로 → 맞음
  await T(P, "world"); await T(P, "world");
  const me1 = await T(P, "me"), fl2 = await T(P, "foe", lp);
  check("kept going → jump lands on me (about 10% of max HP)", me1.hp < me0.hp && !fl2.leapAt && Math.abs(fl2.x - me1.x) <= 1, JSON.stringify([me0, me1, fl2]));
  // 강화 미사일: 두 곳을 조준
  await T(P, "yard"); await T(P, "face", 0, 1);
  const tw = await T(P, "mon", 4, 0, { ranged: true, twin: true, rcd: 0 });
  await T(P, "world");
  const ftw = await T(P, "foe", tw), me2 = await T(P, "me");
  check("twin missile aims at me and 2 tiles ahead", ftw.aim && ftw.aim.x === me2.x && ftw.aim.b && ftw.aim.b.y === me2.y + 2 && (await T(P, "aimCells", tw)) === 2, JSON.stringify(ftw));
  check("log warns about 2 missiles", (await T(P, "logs")).some(l => /강화 미사일 2개를 겨눈다/.test(l)));

  // ---- 5. 맵 조금 작게 ----
  const sz = await T(P, "size", 200), old = Math.round(Math.sqrt((20 + 200 * 12) / 0.65 * 4 / 3));
  check(`arena for 200 monsters is a bit smaller (${sz.aw} < ${old})`, sz.aw < old && sz.aw >= old * 0.85);
  check("no page errors", A.errors.length === 0, A.errors.join("; "));
  await A.ctx.close();

  // ---- 6. 모든 스킬을 켜고 몇 턴 (턴제·실시간) 오류 없이 ----
  const ALL = { fire: 10, ice: 10, bolt: 10, poison: 10, fireAw: 10, iceAw: 10, boltAw: 10, poisonAw: 10, flamebolt: 5, steam: 5, ignite: 5, storm: 5, frostfog: 5, neuro: 5 };
  for (const live of ["off", "on"]) {
    const C = await open({ ...BASE, rl_live: live, rl_save: save({ bl: ALL, d: 8 }) });
    await C.page.keyboard.press("Escape");
    for (let i = 0; i < 12; i++) { await C.page.keyboard.press(i % 4 < 2 ? "ArrowRight" : "ArrowLeft"); await sleep(live === "on" ? 260 : 60); }
    check(`all 14 element skills on, ${live === "on" ? "real-time" : "turn"} mode: no page errors`, C.errors.length === 0, C.errors.join("; "));
    await C.ctx.close();
  }
} finally { await browser.close(); }
const pass = results.filter(Boolean).length;
console.log(`\n${pass} passed, ${results.length - pass} failed`);
process.exit(pass === results.length ? 0 : 1);
