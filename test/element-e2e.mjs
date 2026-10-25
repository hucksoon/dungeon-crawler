// 나이트메어 ③: 속성(불·얼음·번개)과 저항 — 아이템 r3, 몬스터 속성, 화상·느려짐·번개 튕김, 서버 검증·표시
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import fs from "node:fs"; import path from "node:path";
const require = createRequire(process.env.NODE_PATH + "/");
const { chromium } = require("playwright");
const REPO = process.argv[2], OUT = process.argv[3];
const I = createRequire(import.meta.url)(path.join(REPO, "items.js"));
const M = createRequire(import.meta.url)(path.join(REPO, "monsters.js"));
const ORIGIN = "https://game.apacimtest.com/", API = "https://api.test/api.php";
const results = []; const check = (n, ok, x = "") => { results.push(!!ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x && !ok ? " — " + x : ""}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const EL = M.ELEMENTS;

// ---- 규칙 ----
check("rules: r3+, NIGHTMARE atk ×0.98 (dc#54), elements fire/ice/bolt, res cap 75, nightmare resist −40", I.RULES_REV >= 3 && M.NIGHTMARE.atk === 0.98 && M.ELEMENTS.zonePenalty.nightmare === 40 && EL.list.join() === "fire,ice,bolt" && EL.resCap === 75 && I.ELEMENT_LINES.dmgCap === 11);
const nmIt = (i) => I.generate(`elt|n10|k${i}`, "golden", 85, 4, 6);   // r6 (장신구 전) 그대로
let nmEl = 0; for (let i = 0; i < 3000; i++) if (nmIt(i).lines.some(l => I.ELEMENT_LINES.keys.includes(l[0]))) nmEl++;
let normEl = 0, same = true;
for (let i = 0; i < 3000; i++) { const a = I.generate(`elt|d70|k${i}`, "golden", 70, 4, 3), b = I.generate(`elt|d70|k${i}`, "golden", 70, 4, 2);
  if (a.lines.some(l => I.ELEMENT_LINES.keys.includes(l[0]))) normEl++; if (!a.ancient && !b.ancient && JSON.stringify([a.main, a.lines, a.rarity, a.slot]) !== JSON.stringify([b.main, b.lines, b.rarity, b.slot])) same = false; }
check(`nightmare r3 items get element/resist lines (${(nmEl / 30).toFixed(0)}%), normal-floor r3 items never and match r2 (except the ancient roll)`, nmEl > 2000 && normEl === 0 && same);
check("old nightmare items (r2) keep their lines (no elements)", (() => { for (let i = 0; i < 500; i++) if (I.generate(`elt|n10|k${i}`, "golden", 85, 4, 2).lines.some(l => I.ELEMENT_LINES.keys.includes(l[0]))) return false; return true; })());
let capped = null;
for (let i = 0; i < 40000 && !capped; i++) { const it = nmIt(i); const l = it.lines.findIndex(x => I.isElementDmg(x[0])); if (l < 0) continue;
  const e = I.enhancedLines({ ...it, enh: 10 }); const boosts = [4, 6, 8, 10].filter(st => Math.floor(I.rngFrom(`enhline|${it.id}|${st}`)() * it.lines.length) === l).length;
  if (it.lines[l][1] + boosts * I.lineBoost(it, it.lines[l][0]) > 11) capped = { it, e, l }; }
check("element damage capped at 11% per line even at +10", capped && capped.e[capped.l][1] === 11 && capped.e[capped.l][2] === 11 - capped.it.lines[capped.l][1], JSON.stringify(capped?.e));
const anc = (() => { for (let i = 0; i < 200000; i++) { const it = nmIt(i); if (it.ancient && it.lines.some(l => I.isElementDmg(l[0]))) return it; } return null; })();
check("ancient nightmare item: element line at max of its range (≤ 11)", anc && anc.lines.filter(l => I.isElementDmg(l[0])).every(l => l[1] === I.lineRangeOf(l[0], anc)[1] && l[1] <= 11));
const t = I.totals([{ ...I.generate("x|n1|k1", "golden", 76), lines: [["fireRes", 34], ["allRes", 11]] }, { ...I.generate("x|n1|k2", "golden", 76), lines: [["fireRes", 34], ["iceDmg", 5]] }]).stats;
check("totals sum element damage and resists", t.fireRes === 68 && t.allRes === 11 && t.iceDmg === 5);
{ const f = I.generate("elt|n10|k13", "golden", 85, 4, 6), noEl = I.generate("elt|n10|k10", "golden", 85, 4, 6), r2 = I.generate("elt|n10|k1", "golden", 85, 4, 2), norm = I.generate("elt|d70|k1", "golden", 70);
  check("nightmare item names: 악몽의 (속성) / no element → just 악몽의, normal items unchanged", I.itemName({ ...f, enh: 3 }) === "+3 악몽의 불 레전더리 팔보호구" && I.itemName(noEl) === "악몽의 레어 도끼" && /^악몽의 (?!불 |얼음 |번개 |무속)/.test(I.itemName(r2)) && !I.itemName(norm).includes("악몽"), [I.itemName(f), I.itemName(noEl), I.itemName(r2), I.itemName(norm)].join(" / ")); }
const b = M.makeNightmareBoss(5, "fire"), m = M.makeNightmare(M.MONSTERS[38], "normal", 1, "bolt");
check("element monsters: names and el", b.el === "fire" && b.name === "악몽의 불꽃 리치 군주" && m.el === "bolt" && m.name.startsWith("악몽의 번개 ") && M.makeNightmareBoss(5).el === undefined);

// 테스트용 아이템: 속성 한 가지만 붙은 나이트메어 아이템
const findIt = (stat, slot) => { for (let i = 0; i < 20000; i++) { const it = nmIt(i); if ((!slot || it.slot === slot) && it.lines.some(l => l[0] === stat) && !it.lines.some(l => I.ELEMENT_LINES.keys.includes(l[0]) && l[0] !== stat)) return it; } };
const fireIt = findIt("fireDmg", "head"), iceIt = findIt("iceDmg", "pants"), boltIt = findIt("boltDmg", "chest"), resIt = findIt("fireRes", "boots");
const plain = I.generate("elt|d70|k1", "golden", 70);

// ---- 서버 ----
const DIR = path.dirname(new URL(import.meta.url).pathname) + "/php";
const DB = path.join(DIR, "el.sqlite"); for (const f of [DB, DB + "-wal", DB + "-shm"]) fs.rmSync(f, { force: true });
const CFG = path.join(DIR, "config.el.php");
fs.writeFileSync(CFG, `<?php\n$c = require __DIR__ . '/config.test.php';\nreturn array_merge($c, ['db_dsn' => 'sqlite:${DB}']);\n`);
const php = spawn("php", ["-S", "127.0.0.1:8102", "-t", path.join(REPO, "ranking-php")], { env: { ...process.env, RANKING_CONFIG: CFG, TEST_JWT_SECRET: "el" }, stdio: ["ignore", "ignore", "pipe"] });
let phpErr = ""; php.stderr.on("data", d => phpErr += d);
await sleep(700);

const MAP_W = 32, MAP_H = 24;
const map = Array.from({ length: MAP_H }, (_, y) => Array.from({ length: MAP_W }, (_, x) => (x === 0 || y === 0 || x === MAP_W - 1 || y === MAP_H - 1 ? 0 : 1)));
const lv = (d, rid, z, enemies = [], extra = {}, stairs = [28, 20]) => { const mm = map.map(r => r.slice()); mm[stairs[1]][stairs[0]] = 2; return JSON.stringify({ rid, d, z, turn: 0, map: mm.map(r => r.join("")).join(""), seen: "1".repeat(MAP_W * MAP_H), px: 10, py: 10, shop: null, enemies, items: [], ...extra }); };
const save = (d, rid, run = {}) => JSON.stringify({ v: 1, season: 4, best: 75, clr: 1, nb: 10, run: { d, hp: 9e6, mh: 9e6, a: 300, g: 500, p: 3, l: 40, x: 0, xn: 1e12, rid, k: 0, pp: 0, z: "nm", ...run } });
const eqOf = (...its) => { const e = Object.fromEntries(I.SLOTS.map(s => [s, null])); for (const it of its) e[it.slot] = it; return e; };
const foe = (x, y, extra = {}) => ({ x, y, id: "titan", ch: "I", name: "악몽의 타이탄", color: "#fdd835", kind: "normal", hp: 1e7, maxHp: 1e7, atk: 0, def: 0, xp: 1, nm: 1, ...extra });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
async function open(dev, seed, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 1000 } }); const page = await ctx.newPage(); const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("dialog", d => d.accept());
  await ctx.route(ORIGIN + "**", r => { const f = new URL(r.request().url()).pathname.slice(1) || "index.html";
    if (f === "ranking-config.js") return r.fulfill({ contentType: "text/javascript", body: `window.RANKING_API = "${opts.api ? API : ""}";` });
    const p = path.join(REPO, f); if (!fs.existsSync(p)) return r.fulfill({ status: 404, body: "" });
    r.fulfill({ contentType: f.endsWith(".js") ? "text/javascript" : "text/html", body: fs.readFileSync(p) }); });
  await ctx.route("https://api.test/**", async r => { const req = r.request(), u = new URL(req.url());
    const res = await fetch(`http://127.0.0.1:8102/api.php${u.search}`, { method: req.method(), headers: { ...req.headers(), origin: ORIGIN.slice(0, -1) }, body: req.method() === "GET" ? undefined : req.postData() });
    r.fulfill({ status: res.status, headers: { "content-type": "application/json", "access-control-allow-origin": "*" }, body: await res.text() }); });
  await ctx.route("https://login.xsolla.com/**", r => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await ctx.addInitScript(([seed, dev]) => { if (sessionStorage.getItem("seeded")) return; sessionStorage.setItem("seeded", 1); sessionStorage.setItem("rl_scene", "dungeon");
    localStorage.setItem("rl_device_id", dev); localStorage.setItem(`rl_notice_v4:g:${dev}`, "1"); localStorage.setItem(`rl_notice_75:g:${dev}`, "1");
    for (const [k, v] of Object.entries(seed)) localStorage.setItem(k.replace("DEV", dev), v);
    window.__log = []; document.addEventListener("DOMContentLoaded", () => new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => window.__log.push(n.textContent)))).observe(document.getElementById("log"), { childList: true })); }, [seed, dev]);
  await page.goto(ORIGIN); await sleep(450);
  return { ctx, page, errors };
}
const logs = (page) => page.evaluate(() => window.__log.join("\n"));
const level = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("rl_level")));
const press = async (page, k, n = 1) => { for (let i = 0; i < n; i++) { await page.keyboard.press(k); await sleep(30); } };
const inv = (...eq) => JSON.stringify({ bag: [], equip: eqOf(...eq), log: [], stones: 0 });
try {
  // 1. 나이트메어 층의 몬스터·보스는 모두 속성이 있음 (새 층)
  let { ctx, page, errors } = await open("eltest-a", { rl_save: save(4, "elA"), rl_level: lv(4, "elA", "nm", [], {}, [11, 10]), "rl_inv:g:DEV": inv(plain) });
  // 4층 계단 → 5층(보스 층)
  await press(page, "ArrowRight"); await sleep(250);
  const L = await level(page);
  const mobs = (L?.enemies || []).filter(e => e.kind !== "golden");
  check("boss floor: the nightmare boss has an element", L?.d === 5 && L.enemies.some(e => e.kind === "boss" && EL.list.includes(e.el)));
  check(`nightmare floor: every monster has an element (${mobs.length})`, mobs.length >= 18 && mobs.every(e => EL.list.includes(e.el) && e.name.startsWith(`악몽의 ${EL.prefix[e.el]}`)), JSON.stringify(mobs.slice(0, 2).map(e => [e.name, e.el])));
  check("all three elements appear", EL.list.every(k => mobs.some(e => e.el === k)));
  await page.screenshot({ path: path.join(OUT, "el-floor.png") });
  await ctx.close();

  // 2. 플레이어 불: 화상 → 2턴마다 공격력의 1/10, 5번
  ({ ctx, page, errors } = await open("eltest-b", { rl_save: save(3, "elB"), rl_level: lv(3, "elB", "nm", [foe(11, 10)]), "rl_inv:g:DEV": inv(fireIt) }));
  const atk = +(await page.locator("#atk").innerText());
  await press(page, "ArrowRight"); await sleep(100);
  let E = (await level(page)).enemies[0];
  check("player fire: target burns (atk/10, 5 ticks)", E.burn && E.burn.left === 5 && E.burn.dmg === Math.round(atk * 0.1), JSON.stringify(E.burn) + " atk " + atk);
  // 때린 턴(0)에 걸리고 → 1턴 없음 → 2턴 화상 → 3턴 없음
  const hp0 = E.hp;
  await press(page, "."); await sleep(60);
  E = (await level(page)).enemies[0];
  const tick1 = hp0 - E.hp;
  await press(page, "."); await sleep(60);
  const E2 = (await level(page)).enemies[0];
  check("burn ticks every 2 turns", tick1 === Math.round(atk * 0.1) && E.burn.left === 4 && E2.hp === E.hp && E2.burn.left === 4, `${tick1} ${E.hp - E2.hp} ${JSON.stringify(E2.burn)}`);
  // 다시 때리면 갱신: 남은 횟수만 5로 (그 턴 화상으로 4), 박자(at)는 그대로. 갱신이 없었으면 3
  const at0 = E2.burn.at;
  await press(page, "ArrowRight"); await sleep(60);
  E = (await level(page)).enemies[0];
  check("hitting again refreshes (left back to 5 → 4 after this turn's tick, same rhythm)", E.burn.left === 4 && E.burn.at === at0, JSON.stringify(E.burn));
  // 원래 피해에 속성 피해가 더해짐: 불 3%면 공격력의 3% (방어력 0)
  const dmgLog = (await logs(page)).split("\n").filter(l => /^악몽의 타이탄에게 \d+ 피해!/.test(l)).map(l => +l.match(/(\d+) 피해/)[1]);
  const pct = fireIt.lines.find(l => l[0] === "fireDmg")[1];
  check(`element damage added to hits (fire ${pct}%)`, dmgLog.length >= 2 && dmgLog.every(d => d >= atk + Math.round(atk * pct / 100) - 1), JSON.stringify(dmgLog) + " atk " + atk);
  // 인벤토리: 속성 피해 줄과 아이템 줄
  await press(page, "i"); await sleep(150);
  check("inventory shows element damage total", (await page.locator("#inv-summary").innerText()).includes(`속성 피해: 불 +${pct}%`));
  await page.locator(".slot", { hasText: I.itemName(fireIt) }).click(); await sleep(100);
  check("item detail shows the 불 피해 line with range", (await page.locator("#inv-detail").innerText()).includes(`불 피해 +${pct}%`));
  await page.screenshot({ path: path.join(OUT, "el-inventory.png") });
  await press(page, "Escape");
  check("no page errors (fire)", errors.length === 0, errors.join("; "));
  await ctx.close();

  // 3. 플레이어 번개: 맞은 몬스터 근처(3칸) 2마리에게 공격력 1/3, 한 마리에 한 번. 4칸 밖은 안 맞음
  ({ ctx, page, errors } = await open("eltest-c", { rl_save: save(3, "elC"), rl_level: lv(3, "elC", "nm", [foe(11, 10), foe(13, 10, { name: "B" }), foe(15, 11, { name: "C" }), foe(16, 14, { name: "D" })]), "rl_inv:g:DEV": inv(boltIt) }));
  const atkC = +(await page.locator("#atk").innerText());
  await press(page, "ArrowRight"); await sleep(100);
  const EC = Object.fromEntries((await level(page)).enemies.map(e => [e.name, 1e7 - e.hp]));
  check("player bolt: bounces to 2 nearby monsters for atk/3, not the far one", EC.B === Math.round(atkC / 3) && EC.C === Math.round(atkC / 3) && EC.D === 0, JSON.stringify(EC) + " atk " + atkC);
  check("bolt log", (await logs(page)).includes(`번개가 B에게 튕겨 ${Math.round(atkC / 3)} 피해!`));
  await ctx.close();

  // 4. 플레이어 얼음: 25% 확률로 4턴 느려짐(2턴에 한 번 행동) → 풀리면 4턴 면역
  ({ ctx, page, errors } = await open("eltest-d", { rl_save: save(3, "elD"), rl_level: lv(3, "elD", "nm", [foe(11, 10)]), "rl_inv:g:DEV": inv(iceIt) }));
  let slowed = null;
  for (let i = 0; i < 60 && !slowed; i++) { await press(page, "ArrowRight"); const e = (await level(page)).enemies[0]; if (e.slow > 0) slowed = e; }
  check("player ice: target slowed (4 turns then immune)", slowed && slowed.slow <= 4 && (await logs(page)).includes("얼어붙어 느려졌다"));
  await press(page, ".", 4);
  const ice2 = (await level(page)).enemies[0];
  check("after slow ends, immune for a while", !ice2.slow && ice2.immune > 0, JSON.stringify([ice2.slow, ice2.immune]));
  await ctx.close();

  // 5. 몬스터 불: 맞으면 화상 (들어간 피해의 1/10), HUD에 표시
  ({ ctx, page, errors } = await open("eltest-e", { rl_save: save(3, "elE"), rl_level: lv(3, "elE", "nm", [foe(11, 10, { atk: 5000, el: "fire", name: "악몽의 불꽃 타이탄" })]), "rl_inv:g:DEV": inv(plain) }));
  const hpBefore = +(await page.locator("#hp").innerText()).split("/")[0];
  await press(page, "."); await sleep(60);
  const hit = hpBefore - +(await page.locator("#hp").innerText()).split("/")[0];
  let LE = await level(page);
  check("monster fire: player burns for 1/10 of the hit (nightmare resist −40 → ×1.4)", LE.ps?.burn && LE.ps.burn.dmg === Math.round(hit * 0.1 * 1.4) && (await page.locator("#status").innerText()).includes("화상"), JSON.stringify(LE.ps) + " hit " + hit);
  await page.screenshot({ path: path.join(OUT, "el-burn.png") });
  // 불 저항 아이템이면 화상이 줄어듦
  await ctx.close();
  const res = resIt.lines.find(l => l[0] === "fireRes")[1];
  ({ ctx, page, errors } = await open("eltest-f", { rl_save: save(3, "elF"), rl_level: lv(3, "elF", "nm", [foe(11, 10, { atk: 5000, el: "fire" })]), "rl_inv:g:DEV": inv(resIt) }));
  const hpB = +(await page.locator("#hp").innerText()).split("/")[0];
  await press(page, "."); await sleep(60);
  const hitB = hpB - +(await page.locator("#hp").innerText()).split("/")[0];
  LE = await level(page);
  check(`fire resist ${res}% reduces the burn`, LE.ps?.burn && LE.ps.burn.dmg === Math.round(hitB * 0.1 * (1 - (res - 40) / 100)), JSON.stringify(LE.ps) + " hit " + hitB);
  await press(page, "i"); await sleep(120);
  check("inventory shows resist after the nightmare −40 and the gear total", (await page.locator("#inv-summary").innerText()).includes(`속성 저항: 불 ${res - 40}%`) && (await page.locator("#inv-summary").innerText()).includes(`장비 합 ${res}/0/0% − 40 (나이트메어)`), await page.locator("#inv-summary").innerText());
  await ctx.close();

  // 6. 몬스터 번개: 한 번 더 맞음 (1/3)
  ({ ctx, page, errors } = await open("eltest-g", { rl_save: save(3, "elG"), rl_level: lv(3, "elG", "nm", [foe(11, 10, { atk: 5000, el: "bolt" })]), "rl_inv:g:DEV": inv(plain) }));
  await press(page, "."); await sleep(60);
  const lg = await logs(page);
  const first = +lg.match(/에게 (\d+) 피해를 입음/)[1], second = +(lg.match(/번개가 튕겨 한 번 더 (\d+) 피해/) || [])[1];
  check("monster bolt: second hit for 1/3 of the first (resist −40 → ×1.4)", second === Math.max(1, Math.round(first / 3 * 1.4)), `${first} ${second}`);
  await ctx.close();

  // 7. 몬스터 얼음: 걸리면 2턴에 한 번만 움직임 (한 번 누를 때 몬스터가 두 번)
  ({ ctx, page, errors } = await open("eltest-h", { rl_save: save(3, "elH"), rl_level: lv(3, "elH", "nm", [foe(11, 10, { atk: 50, el: "ice" })]), "rl_inv:g:DEV": inv(plain) }));
  let got = false;
  for (let i = 0; i < 80 && !got; i++) { await press(page, "."); got = (await logs(page)).includes("몸이 얼어붙었다"); }
  const t0 = (await level(page)).turn;
  await press(page, "."); await press(page, ".");
  const t1 = (await level(page)).turn;
  check("monster ice: player slowed, a key press can take 2 turns", got && t1 - t0 >= 3 && (await logs(page)).includes("몸이 얼어 이번 턴은 움직이지 못했다"), `${got} ${t0} ${t1}`);
  check("HUD shows 느려짐 or 면역", /느려짐|면역/.test(await page.locator("#status").innerText()));
  check("no page errors (monster elements)", errors.length === 0, errors.join("; "));
  await ctx.close();

  // 8. 랭킹: 서버가 나이트메어 r3 아이템을 검증하고, 장비 보기에 속성 피해·저항
  ({ ctx, page, errors } = await open("eltest-i", { rl_save: save(10, "elI"), rl_level: lv(10, "elI", "nm"), "rl_inv:g:DEV": inv(fireIt, resIt, boltIt) }, { api: true }));
  await press(page, "."); await sleep(4000);
  const meRes = await (await fetch("http://127.0.0.1:8102/api.php?r=me&season=nm", { headers: { Origin: ORIGIN.slice(0, -1), "X-Guest-Id": "eltest-i" } })).json();
  const prof = await (await fetch(`http://127.0.0.1:8102/api.php?r=player&id=${meRes.id}&season=nm`, { headers: { Origin: ORIGIN.slice(0, -1) } })).json();
  const st = prof.gear?.stats;
  check("server: r3 nightmare gear verified, stats include element/resist", prof.gear && !prof.gear.rejected && st?.elem?.fire === fireIt.lines.find(l => l[0] === "fireDmg")[1] && st?.res?.fire === res, JSON.stringify([prof.gear?.rejected, st?.elem, st?.res]));
  check("server: item lines named 불 피해 / 불 저항", JSON.stringify(prof.gear?.items).includes("불 피해 +") && JSON.stringify(prof.gear?.items).includes("불 저항 +"));
  await page.goto(ORIGIN + `ranking.html#nm`); await sleep(900);
  await page.locator("#board-stage li", { hasText: "eltest" }).first().click().catch(() => {}); await sleep(700);
  const panel = await page.locator("body").innerText();
  check("ranking gear view shows 속성 피해 / 속성 저항", panel.includes("속성 피해") && panel.includes("속성 저항"), panel.slice(0, 300));
  await page.screenshot({ path: path.join(OUT, "el-ranking.png") });
  check("no page errors (ranking)", errors.length === 0, errors.join("; "));
  await ctx.close();
} finally { await browser.close(); php.kill(); }
check("no php errors", !/Fatal|Warning|Notice|Deprecated/.test(phpErr), phpErr.slice(0, 400));
const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
