// 정식 v2 (dc#140): 장비는 숫자만 · 자동 장비(중복 강화·이어받기·분해·+4 자동 강화) · 매 층 축복 · 보스 유물 · 다시 뽑기 · 이어가기 · 보석·룬 보상
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
const require = createRequire(process.env.NODE_PATH + "/");
const { chromium } = require("playwright");
const REPO = process.argv[2], SHOTS = process.argv[3];
const ORIGIN = "https://hucksoon.github.io/hucksoon/";
const I = createRequire(import.meta.url)(path.join(REPO, "items.js"));
const B = createRequire(import.meta.url)(path.join(REPO, "blessings.js"));
const results = [];
const check = (n, ok, x = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x && !ok ? " — " + x : ""}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const HOOK = `
  window.__t = {
    s: () => { const S = stats(); return { scene, depth, zone: player.zone, gameOver, gold: player.gold, atk: S.atk, def: S.def, maxHp: S.maxHp, crit: S.crit, lifesteal: S.lifesteal, bl: { ...(player.bl || {}) }, rl: { ...(player.rl || {}) }, pq: (player.pq || []).length, rid: player.rid }; },
    boss: () => { Bless.onBoss({ kind: "boss" }); },
    take: (item) => { takeGear({ item, from: "monster" }); return { eq: Inv.equipped(), bag: Inv.bag().map(x => x.id), stones: Inv.stones(), nmStones: Inv.nmStones() }; },
    inv: () => ({ eq: Inv.equipped(), bag: Inv.bag(), stones: Inv.stones(), nmStones: Inv.nmStones(), snap: Inv.snapshot() }),
    addStones: (n) => { Inv.spendStones("stones", -0); const d = Inv.snapshot(); return d.stones; },
    clearFloor: () => { enemies = []; render(); },
    die: () => { player.hp = 0; death(); render(); },
    complete: () => { depth = RLMonsters.MAX_FLOOR; completeFloor(); },
    portal: () => portal(),
    resume: () => enterDungeon("resume"),
  };
  // ---- 시작 ----`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
async function open(storage) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 } }); const page = await ctx.newPage(); const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  const dialogs = [];
  page.on("dialog", d => { dialogs.push(d.message()); d.accept(); });
  await ctx.route(ORIGIN + "**", r => { const f = new URL(r.request().url()).pathname.replace("/hucksoon/", "") || "index.html";
    if (f === "ranking-config.js") return r.fulfill({ contentType: "text/javascript", body: `window.RANKING_API = "";` });
    const p = path.join(REPO, f); if (!fs.existsSync(p)) return r.fulfill({ status: 404, body: "" });
    let body = fs.readFileSync(p, "utf8"); if (f === "index.html") body = body.replace("  // ---- 시작 ----", HOOK);
    r.fulfill({ contentType: f.endsWith(".js") ? "text/javascript" : "text/html", body }); });
  await ctx.addInitScript((s) => { if (!sessionStorage.getItem("s")) { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); sessionStorage.setItem("rl_scene", s.__scene || "dungeon"); sessionStorage.setItem("s", 1); } }, storage);
  await page.goto(ORIGIN);
  await page.waitForFunction(() => window.__t);
  await sleep(200);
  return { ctx, page, errors, dialogs };
}
const save = (run, extra = {}) => JSON.stringify({ v: 1, f50: 1, best: 30, ...extra, run: { d: 3, hp: 200, mh: 200, a: 20, g: 50000, l: 10, x: 0, xn: 577, rid: "v2-run", k: 0, pp: 0, ...run } });
const st = (page) => page.evaluate(() => window.__t.s());
const shot = (page, n) => page.screenshot({ path: path.join(SHOTS, `v2-${n}.png`) }).catch(() => {});
const BASE = { rl_bless: "on", rl_autogear: "1", rl_device_id: "v2-dev" };

try {
  // ---- 1. 장비 숫자 (items.js) ----
  const w = I.generate("t|e20|k1", "drop", 30);
  const wp = I.power({ ...w, slot: "weapon", rarity: "rare", enh: 0, ancient: false, seed: "t|e20|k1" });
  check("v2 power: a weapon gives attack only", wp.atk > 0 && wp.def === 0 && wp.hp === 0, JSON.stringify(wp));
  const at = (r, z, e = 0) => I.power({ slot: "chest", rarity: r, lvl: 30, enh: e, seed: z === "nm" ? "x|n5|k1" : z === "hell" ? "x|j5|k1" : "x|e5|k1", v: 4 });
  check("rarity order: legendary > epic > rare", at("legendary").def > at("epic").def && at("epic").def > at("rare").def);
  check("zone order: hell > nightmare > normal", at("rare", "hell").def > at("rare", "nm").def && at("rare", "nm").def > at("rare").def);
  check("enhance: +10 = ×2", Math.abs(at("rare", "normal", 10).def - 2 * at("rare").def) <= 1, `${at("rare", "normal", 10).def} vs ${at("rare").def}`);
  check("duplicate rule: same slot · zone · rarity", I.isDupOf({ slot: "chest", rarity: "rare", seed: "a|e3|k1", v: 4 }, { slot: "chest", rarity: "rare", seed: "b|e9|k2", v: 4 }) && !I.isDupOf({ slot: "chest", rarity: "rare", seed: "a|e3|k1", v: 4 }, { slot: "chest", rarity: "rare", seed: "b|n9|k2", v: 4 }));
  const M2 = createRequire(import.meta.url)(path.join(REPO, "monsters.js"));
  check("monsters keep their elements, but no resist penalty for the player (no resist gear)", M2.makeNightmare(M2.MONSTERS[M2.MONSTERS.length - 1], "normal", 10, "fire").el === "fire" && M2.ELEMENTS.zonePenalty.nightmare === 0 && M2.ELEMENTS.zonePenalty.hell === 0);
  check("entry ramp: nightmare floor 1 × 0.6, hell floor 1 × 0.4, full from floor 11 / 16", M2.entryMul(M2.NIGHTMARE.entry, 1) === 0.6 && M2.entryMul(M2.HELL.entry, 1) === 0.4 && M2.entryMul(M2.NIGHTMARE.entry, 11) === 1 && M2.entryMul(M2.HELL.entry, 16) === 1);
  check("reroll cost: gold = stones × rate, doubles on the same floor", (() => { const a = B.rerollCost("normal", 25, 0), b = B.rerollCost("normal", 25, 1); return a.gold === a.stones * 10 && b.stones >= a.stones * 2 - 5; })(), JSON.stringify(B.rerollCost("normal", 25, 0)));

  // ---- 2. 새 층 축복 (저장 판 3층, 2층까지 받음) ----
  const A = await open({ ...BASE, rl_save: save({ bz: { normal: 2 } }) });
  await A.page.waitForSelector("#bless-modal:not([hidden])", { timeout: 4000 }).catch(() => {});
  check("new floor: blessing pick opens with 3 cards", await A.page.locator("#bless-modal").isVisible() && (await A.page.locator(".bless-card").count()) === 3);
  await shot(A.page, "bless-pick");
  let s0 = await st(A.page);
  // 이동이 막힘
  await A.page.keyboard.press("ArrowRight"); await sleep(100);
  check("moving is blocked while picking", (await st(A.page)).depth === s0.depth && await A.page.locator("#bless-modal").isVisible());
  // 골드로 다시 뽑기
  const before = await A.page.evaluate(() => window.RLBlessGame.offer().join(","));
  const g0 = s0.gold;
  await A.page.locator("#bless-reroll-gold").click(); await sleep(100);
  const after = await A.page.evaluate(() => window.RLBlessGame.offer().join(","));
  const s1 = await st(A.page);
  check("reroll with gold: cost paid and new offer", s1.gold === g0 - B.rerollCost("normal", 3, 0).gold && before !== after, `${before} → ${after}, gold ${g0} → ${s1.gold}`);
  check("reroll price doubles on this floor", (await A.page.locator("#bless-reroll-gold").innerText()).includes(B.rerollCost("normal", 3, 1).gold.toLocaleString()));
  const first = (await A.page.evaluate(() => window.RLBlessGame.offer()))[0];
  await A.page.keyboard.press("1"); await sleep(150);
  const s2 = await st(A.page);
  check("key 1 picks the first card", s2.bl[first] === 1 && !(await A.page.locator("#bless-modal").isVisible()), JSON.stringify(s2.bl));
  check("icon bar shows the blessing", await A.page.locator("#bless-bar").isVisible() && (await A.page.locator("#bless-bar .bl-ico").count()) === 1);
  await shot(A.page, "bless-bar");
  // 유물: 보스
  await A.page.evaluate(() => window.__t.boss()); await sleep(100);
  check("boss: relic pick (gold title)", await A.page.locator("#bless-modal .modal.relic").isVisible() && (await A.page.locator("#bless-title").innerText()).includes("유물"));
  await shot(A.page, "relic-pick");
  const relic = (await A.page.evaluate(() => window.RLBlessGame.offer()))[0];
  await A.page.locator(".bless-card").first().click(); await sleep(100);
  const s3 = await st(A.page);
  check("relic picked and raises its stat", s3.rl[relic] === 1 && (relic !== "hawk" || s3.crit === 3) && (relic !== "grail" || s3.lifesteal === 2), JSON.stringify(s3.rl));
  check("bar: relic first with gold frame", await A.page.locator("#bless-bar .bl-ico.relic").first().isVisible());
  // 포탈 → 마을 → 다시: 남아 있음
  await A.page.evaluate(() => window.__t.portal()); await sleep(200);
  await A.page.evaluate(() => window.__t.resume()); await sleep(200);
  const s4 = await st(A.page);
  check("portal and back: blessings and relics stay", s4.bl[first] === 1 && s4.rl[relic] === 1 && s4.scene === "dungeon");
  // 새로고침해도
  await A.page.reload(); await A.page.waitForFunction(() => window.__t); await sleep(200);
  const s5 = await st(A.page);
  check("reload: blessings saved with the run", s5.bl[first] === 1 && s5.rl[relic] === 1, JSON.stringify(s5));
  // 쓰러지고 새로 시작: 사라짐
  await A.page.evaluate(() => window.__t.die()); await sleep(100);
  await A.page.locator("#death-restart").click(); await sleep(200);
  const s6 = await st(A.page);
  check("death and start over: blessings cleared", !Object.keys(s6.bl).length && !Object.keys(s6.rl).length, JSON.stringify(s6));
  check("A: no page errors", A.errors.length === 0, A.errors.join("; "));
  await A.ctx.close();

  // ---- 3. 정식 v2 전에 시작한 판(축복 기록 없음, 21층): 건너뛴 만큼 먼저 고르기 + 자동으로 ----
  const C = await open({ ...BASE, rl_save: save({ d: 21 }) });
  await sleep(300);
  const sc = await st(C.page);
  check("old run on floor 21: catch-up picks (10 blessings + 2 relics + this floor)", sc.pq === 13, `pq ${sc.pq}`);
  check("auto-pick button shows the count", (await C.page.locator("#bless-auto").innerText()).includes("13"));
  await C.page.locator("#bless-auto").click(); await sleep(200);
  const sc2 = await st(C.page);
  check("auto-pick: all chosen, relics too", sc2.pq === 0 && Object.values(sc2.bl).reduce((a, b) => a + b, 0) === 11 && Object.values(sc2.rl).reduce((a, b) => a + b, 0) === 2, JSON.stringify(sc2));
  check("C: no page errors", C.errors.length === 0, C.errors.join("; "));
  await C.ctx.close();

  // ---- 4. 자동 장비 ----
  const D = await open({ ...BASE, rl_bless: "off", rl_save: save({}) });
  const mk = (seed, rarity, slot = "chest", lvl = 15) => { const it = { ...I.generate(seed, "drop", lvl), rarity, slot, enh: 0, ancient: false }; delete it.type; delete it.lock; delete it.parry; return it; };
  let r = await D.page.evaluate((it) => window.__t.take(it), mk("v2t|e5|k1", "rare"));
  check("empty slot: equips at once", r.eq.chest?.rarity === "rare" && !r.bag.length);
  r = await D.page.evaluate((it) => window.__t.take(it), mk("v2t|e5|k2", "rare"));
  check("duplicate (same slot · zone · rarity): +1, no new item", r.eq.chest.enh >= 1 && !r.bag.length, JSON.stringify(r.eq.chest?.enh));
  const enhBefore = r.eq.chest.enh;
  r = await D.page.evaluate((it) => window.__t.take(it), mk("v2t|e5|k3", "common"));
  check("weaker: dismantled into stones (then auto-enhance spends them)", r.eq.chest.rarity === "rare" && (await D.page.locator("#log").innerText()).includes("분해: 강화석"));
  r = await D.page.evaluate((it) => window.__t.take(it), mk("v2t|e5|k4", "epic", "chest", 20));
  check("better (epic): swapped in, enhance carried over", r.eq.chest.rarity === "epic" && r.eq.chest.enh >= enhBefore, JSON.stringify({ r: r.eq.chest.rarity, e: r.eq.chest.enh, before: enhBefore }));
  r = await D.page.evaluate((it) => window.__t.take(it), mk("v2t|e5|k5", "legendary", "head", 1));
  r = await D.page.evaluate((it) => window.__t.take(it), mk("v2t|e5|k6", "legendary", "head", 1));
  check("legendary duplicates also merge (+1)", r.eq.head?.enh >= 1);
  r = await D.page.evaluate((it) => window.__t.take(it), mk("v2t|e5|k7", "legendary", "boots", 1));
  r = await D.page.evaluate((it) => window.__t.take(it), mk("v2t|e5|k8", "set", "boots", 40));
  check("a replaced legendary goes to the bag (not dismantled)", r.bag.length === 1);
  const logs = await D.page.locator("#log").innerText();
  check("log: duplicate / swap / dismantle lines", logs.includes("중복!") && logs.includes("분해:"));
  // 강화석으로 +4까지 (무기부터 한 번씩) — 수동 강화는 +5부터 막힘
  await D.page.keyboard.press("i"); await sleep(200);
  check("inventory: auto-gear switch and blessing section", (await D.page.locator("#inv-modal").innerText()).includes("자동 장비"));
  await shot(D.page, "inventory");
  await D.page.keyboard.press("Escape");
  check("D: no page errors", D.errors.length === 0, D.errors.join("; "));
  await D.ctx.close();

  // ---- 5. 보석·룬 보상 (한 번) ----
  const inv = JSON.stringify({ bag: [], equip: {}, log: [], stones: 10, gems: { ruby: [3, 1, 0] }, runes: [2, 0, 1] });
  const E = await open({ ...BASE, rl_bless: "off", rl_v2notice: "on", rl_save: save({}), "rl_inv:g:v2-dev": inv, __scene: "lobby" });
  await sleep(300);
  const ei = await E.page.evaluate(() => window.__t.inv());
  check("gems/runes → stones once (3×2 + 1×6 = 12, runes 2×5 + 1×11 = 21)", ei.stones === 22 && ei.nmStones === 21, JSON.stringify({ s: ei.stones, n: ei.nmStones }));
  check("gems and runes stay in the save (for later)", ei.snap.gems.ruby?.[0] === 3 && ei.snap.runes[0] === 2 && ei.snap.v2c === 1);
  check("v2 notice mentions the stones", (await E.page.locator("#notice-modal").innerText()).includes("강화석 12개와 악몽 강화석 21개"));
  await shot(E.page, "v2-notice");
  await E.page.reload(); await E.page.waitForFunction(() => window.__t); await sleep(200);
  const ei2 = await E.page.evaluate(() => window.__t.inv());
  check("no second compensation after reload", ei2.stones === 22 && ei2.nmStones === 21);
  check("E: no page errors", E.errors.length === 0, E.errors.join("; "));
  await E.ctx.close();

  // ---- 6. 일반 던전 완료 → 나이트메어로 이어가기 (축복 그대로) ----
  const F = await open({ ...BASE, rl_save: save({ d: 50, bz: { normal: 50 }, bl: { might: 3 }, rl: { hawk: 1 } }, { best: 50 }) });
  await F.page.evaluate(() => window.__t.complete()); await sleep(300);
  check("clear: continue question", F.dialogs.some(m => m.includes("나이트메어 1층으로 바로 이어갈까요")), F.dialogs.join(" | "));
  await sleep(500);
  const sf = await st(F.page);
  check("continued into nightmare 1 with the same blessings", sf.zone === "nm" && sf.depth === 1 && sf.bl.might === 3 && sf.rl.hawk === 1 && sf.scene === "dungeon", JSON.stringify(sf));
  check("nightmare floor 1: a new blessing pick", sf.pq >= 1);
  check("F: no page errors", F.errors.length === 0, F.errors.join("; "));
  await F.ctx.close();
} catch (e) {
  console.log("FAIL exception — " + e.stack);
  results.push(false);
} finally {
  await browser.close();
}
console.log(`${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
