// 장신구 1단계 (r7): 목걸이 1·반지 2 — 규칙(저항 줄 수·공방HP 줄·일반 절반·고대는 드롭으로만), 인벤토리 10칸·반지 고르기, 서버 검증·랭킹 장비
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import fs from "node:fs"; import path from "node:path";
import { goDoor } from "./town.mjs";   // 마을(옆에서 보는 로비) 문까지 걸어가 ↑
const require = createRequire(process.env.NODE_PATH + "/");
const { chromium } = require("playwright");
const REPO = process.argv[2], OUT = process.argv[3];
const I = createRequire(import.meta.url)(path.join(REPO, "items.js"));
// 서버는 아이템 값만 보냄 (dc#97): 참조로 다시 만든 이름 (서버가 이름 글자를 보내면 실패)
const nameOf = (v) => (v?.ref && !("name" in v) ? I.itemName(I.fromRef(v.ref, { gems: true })) : null);
const M = createRequire(import.meta.url)(path.join(REPO, "monsters.js"));
const ORIGIN = "https://game.apacimtest.com/", API = "https://api.test/api.php";
const results = []; const check = (n, ok, x = "") => { results.push(!!ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x && !ok ? " — " + x : ""}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const DIR = path.dirname(new URL(import.meta.url).pathname) + "/php";
const DB = path.join(DIR, "acc.sqlite"); for (const f of [DB, DB + "-wal", DB + "-shm"]) fs.rmSync(f, { force: true });
const CFG = path.join(DIR, "config.acc.php");
fs.writeFileSync(CFG, `<?php\n$c = require __DIR__ . '/config.test.php';\nreturn array_merge($c, ['db_dsn' => 'sqlite:${DB}']);\n`);
const php = spawn("php", ["-S", "127.0.0.1:8123", "-t", path.join(REPO, "ranking-php")], { env: { ...process.env, RANKING_CONFIG: CFG, TEST_JWT_SECRET: "acc" }, stdio: ["ignore", "ignore", "pipe"] });
let phpErr = ""; php.stderr.on("data", d => phpErr += d);
await sleep(700);



// ---- 규칙 ----
const findA = (tag, lvl, pred) => { for (let i = 0; ; i++) { const it = I.generate(`acc${i}|${tag}|k${i}`, "boss", lvl); if (I.isAccessory(it) && pred(it)) return it; } };
check("r8: rules rev 8, 9 item slots (neck·ring), 10 equip slots", I.RULES_REV >= 8 && I.SLOTS_R7.length === 9 && I.EQUIP_SLOTS.join() === "head,chest,arms,pants,boots,weapon,offhand,neck,ring1,ring2");
const old = I.generate("x|d40|k1", "boss", 40, 4, 6);
check("r6 items unchanged (no accessory slots)", I.SLOTS.includes(old.slot) && old.r === 6);
const counts = (tag) => { const c = {}; for (let i = 0; i < 6000; i++) { const it = I.generate(`c${i}|${tag}|k${i}`, "boss", 100); if (I.isAccessory(it)) c[it.lines.length] = (c[it.lines.length] || 0) + 1; } return c; };
const cn = counts("d40"), cm = counts("n30"), ch = counts("j30");
check("resist lines: normal 0~1, nightmare 1~2, hell 1~3", Object.keys(cn).join() === "0,1" && Object.keys(cm).join() === "1,2" && Object.keys(ch).join() === "1,2,3", JSON.stringify([cn, cm, ch]));
const hl = findA("j30", 155, it => it.rarity === "legendary"), nl = findA("d40", 40, it => it.rarity === "legendary");
const A = I.ACCESSORY, flatR = (k, lv, mul) => { const [lo, hi] = { atk: [1 + Math.floor(lv * 0.3), 3 + Math.floor(lv * 0.6)], def: [1 + Math.floor(lv * 0.2), 2 + Math.floor(lv * 0.5)], hp: [2 + lv, 4 + lv * 2] }[k]; const a = Math.max(1, Math.round(lo * mul)); return [a, Math.max(a, Math.round(hi * mul))]; };
check("r8 main = 공격력·방어력·최대 HP (flat ranges by level, normal × 0.55); extra lines = resist only; no socket", hl.main.map(([k]) => k).join() === "atk,def,hp" && ["atk", "def", "hp"].every(k => I.mainRange(k, hl).join() === flatR(k, 155, 1.75 * A.flat[k]).join() && I.mainRange(k, nl).join() === flatR(k, 40, 1.75 * A.flat[k] * A.normalMul).join()) && hl.lines.every(([k]) => I.ACCESSORY.resKeys.includes(k)) && !I.socketCount(hl), JSON.stringify([hl.main, hl.lines, I.mainRange("hp", hl)]));
const o7 = (() => { for (let i = 0; ; i++) { const it = I.generate(`o7${i}|j30|k${i}`, "boss", 155, 4, 7); if (I.isAccessory(it) && it.rarity === "legendary") return it; } })();
check("r7 accessories unchanged: power 15~25%, adds atk/def/hp %", o7.main.length === 1 && o7.main[0][0] === "power" && I.mainRange("power", o7).join() === "15,25" && I.totals([o7]).stats.atkPct === o7.main[0][1]);
check("resist line ranges: element 20~30, all 8~11 (legendary)", I.lineRangeOf("fireRes", hl).join() === "20,30" && I.lineRangeOf("allRes", hl).join() === "8,11");
const two = findA("j30", 155, it => it.lines.length >= 2 && it.lines[0][0] === it.lines[1][0]);
const t2 = I.totals([two]).stats;
check("same resist twice adds up; atk/def/hp × 지옥의 힘 5 added to totals", t2[two.lines[0][0]] === two.lines.filter(([k]) => k === two.lines[0][0]).reduce((a, [, v]) => a + v, 0) && ["atk", "def", "hp"].every(k => t2[k] === two.main.find(([x]) => x === k)[1] * 5) && t2.atkPct === 0, JSON.stringify(two.lines));
check("ancient only from drop: no ancient reroll / reforge for accessories", !I.canRerollAncient(hl, true) && !I.canReforge(hl));
const anc = findA("j30", 155, it => it.ancient);
check("ancient accessory exists from drop (all lines max)", anc.rarity === "legendary" && anc.main.every(([k, v]) => v === I.mainRange(k, anc)[1]) && anc.lines.every(([k, v]) => v === I.lineRangeOf(k, anc)[1]));
{ const rate = (tag, lvl) => { let n = 0, a = 0; for (let i = 0; i < 60000; i++) { const it = I.generate(`ar${i}|${tag}|k${i}`, "boss", lvl); if (I.isAccessory(it) && it.rarity === "legendary") { n++; if (it.ancient) a++; } } return a / n; };
  const rn = rate("d40", 40), rh = rate("j30", 155);
  check(`ancient legendary accessories ≈ 3% drop roll (normal ${(rn * 100).toFixed(1)}%, hell ${(rh * 100).toFixed(1)}%) — 3 even rolls on wide ranges`, rn > 0.02 && rn < 0.05 && rh > 0.02 && rh < 0.05); }
check("names: 지옥의 레전더리 반지 / 목걸이, kind", /^(고대 )?지옥의 레전더리 (반지|목걸이)$/.test(I.itemName(hl)) && I.SLOT_NAMES.ring1 === "반지 1");
{ const e0 = I.enhancedBase(hl), e10 = I.enhancedBase({ ...hl, enh: 10 });
  check("enhance: r8 atk/def/hp rise like other gear (+10 = ×2), resist lines don't; r7 power doesn't", ["atk", "def", "hp"].every(k => e10[k] === e0[k] * 2) && JSON.stringify(I.enhancedLines({ ...hl, enh: 12 })) === JSON.stringify(I.enhancedLines(hl)) && JSON.stringify(I.enhancedBase({ ...o7, enh: 12 })) === JSON.stringify(I.enhancedBase(o7)), JSON.stringify([e0, e10])); }
// ---- 유니크 장신구 ----
const UA = Object.entries(I.UNIQUE.items).filter(([, u]) => u.acc);
check("5 unique accessories, one per named floor (neck·ring)", UA.length === 5 && [10, 20, 30, 40, 50].every(f => I.uniquesOf(f, true).length === 1 && I.uniquesOf(f).length === 2) && UA.every(([, u]) => ["neck", "ring"].includes(u.slot)));
let ah = 0; for (let i = 0; i < 6000; i++) if (I.rollUniqueAcc(`ua${i}|j30|a${i}`, 155)) ah++;
check(`unique accessory drop ≈ 10% per named kill (${(ah / 60).toFixed(1)}%)`, ah > 480 && ah < 720);
const ua = I.generateUnique("uz|j20|a2", 145);
const dropRef = (() => { for (let i = 0; ; i++) { const sd = `srv${i}|j20|a${i}`; const it = I.rollUniqueAcc(sd, 145); if (it) return it; } })();
check("unique accessory: atk/def/hp = legendary × 1.2, 2~3 resist lines only, name", ua.uq === "foxfire" && ua.slot === "ring" && ua.main.map(([k]) => k).join() === "atk,def,hp" && ["atk", "def", "hp"].every(k => I.mainRange(k, ua).join() === flatR(k, 145, 1.75 * A.flat[k] * 1.2).join()) && ua.lines.length >= 2 && ua.lines.length <= 3 && ua.lines.every(([k]) => I.ACCESSORY.resKeys.includes(k)) && I.itemName(ua) === "여우불 반지", JSON.stringify(ua));
const t1 = I.totals([ua]).stats, t2x = I.totals([ua, { ...ua, id: "dup" }]).stats;
check("two 여우불 반지 stack (crit +3 → +6, crit dmg +10 → +20)", t2x.crit - t1.crit === 3 && t2x.critDmg - t1.critDmg === 10);
const mb = (() => { for (let i = 0; ; i++) { const it = I.generateUnique(`mb${i}|j40|a${i}`, 165); if (it.uq === "myeongbu") return it; } })();
check("명부의 반지: lifesteal cap +2 (20 → 22)", I.totals([mb]).stats.lsCap === 22);
const ep = (() => { for (let i = 0; ; i++) { const it = I.generateUnique(`ep${i}|j50|a${i}`, 175); if (it.uq === "eopgyeong") return it; } })();
check("업경 목걸이: all resist cap +5", I.totals([ep]).stats.allResMax === 5);
const u7 = I.generateUnique("z|j10|u1", 135);
check("uniques r7+: ancient roll on drop (~3%)", u7.r === I.RULES_REV && (() => { let n = 0; for (let i = 0; i < 4000; i++) if (I.generateUnique(`ua${i}|j20|u${i}`, 145).ancient) n++; return n > 60 && n < 190; })());
// ---- 게임 ----
const MAP_W = 32, MAP_H = 24;
const map = Array.from({ length: MAP_H }, (_, y) => Array.from({ length: MAP_W }, (_, x) => (x === 0 || y === 0 || x === MAP_W - 1 || y === MAP_H - 1 ? 0 : 1)));
const lv = (d, rid, z, enemies = [], extra = {}) => { const mm = map.map(r => r.slice()); mm[10][11] = 2; return JSON.stringify({ rid, d, z, turn: 0, map: mm.map(r => r.join("")).join(""), seen: "1".repeat(MAP_W * MAP_H), px: 10, py: 10, shop: null, enemies, items: [], ...extra }); };
const v4 = I.generate("hlv4|shop|d70|s1", "golden", 70);
const eqOf = (...its) => { const e = Object.fromEntries(I.SLOTS.map(s => [s, null])); for (const it of its) e[it.slot] = it; return e; };
const inv = (...eq) => JSON.stringify({ bag: [], equip: eqOf(...eq), log: [], stones: 0 });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
async function open(dev, seed, api = false) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 1000 } }); const page = await ctx.newPage(); const errors = [];
  page.on("pageerror", e => errors.push(e.message)); page.on("dialog", d => d.accept());
  await ctx.route(ORIGIN + "**", r => { const f = new URL(r.request().url()).pathname.slice(1) || "index.html";
    if (f === "ranking-config.js") return r.fulfill({ contentType: "text/javascript", body: `window.RANKING_API = "${api ? API : ""}";` });
    const p = path.join(REPO, f); if (!fs.existsSync(p)) return r.fulfill({ status: 404, body: "" });
    r.fulfill({ contentType: f.endsWith(".js") ? "text/javascript" : "text/html", body: fs.readFileSync(p) }); });
  await ctx.route("https://api.test/**", async r => { const req = r.request(), u = new URL(req.url());
    const res = await fetch(`http://127.0.0.1:8123/api.php${u.search}`, { method: req.method(), headers: { ...req.headers(), origin: ORIGIN.slice(0, -1) }, body: req.method() === "GET" ? undefined : req.postData() });
    r.fulfill({ status: res.status, headers: { "content-type": "application/json", "access-control-allow-origin": "*" }, body: await res.text() }); });
  await ctx.route("https://login.xsolla.com/**", r => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await ctx.addInitScript(([seed, dev]) => { if (sessionStorage.getItem("seeded")) return; sessionStorage.setItem("seeded", 1); sessionStorage.setItem("rl_scene", "dungeon");
    localStorage.setItem("rl_device_id", dev); for (const k of ["rl_notice_v4", "rl_notice_75", "rl_notice_1021g", "rl_notice_1021h", "rl_notice_1021i", "rl_notice_1021j", "rl_notice_1022a", "rl_notice_1022b", "rl_notice_1023a", "rl_notice_1023b", "rl_notice_1023c", "rl_notice_1023d", "rl_notice_1025a"]) localStorage.setItem(`${k}:g:${dev}`, "1");
    for (const [k, v] of Object.entries(seed)) localStorage.setItem(k.replace("DEV", dev), v);
    window.__log = []; document.addEventListener("DOMContentLoaded", () => new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => window.__log.push(n.textContent)))).observe(document.getElementById("log"), { childList: true })); }, [seed, dev]);
  await page.goto(ORIGIN); await sleep(450);
  return { ctx, page, errors };
}
const logs = (page) => page.evaluate(() => window.__log.join("\n"));
const stored = (page, k) => page.evaluate(k => JSON.parse(localStorage.getItem(k) || "null"), k);
const press = async (page, k, n = 1) => { for (let i = 0; i < n; i++) { await page.keyboard.press(k); await sleep(30); } };
const inLobby = (page) => page.evaluate(() => document.body.classList.contains("in-lobby"));
async function portalOut(page) {
  await page.keyboard.press("p"); await sleep(150);
  const L = await page.evaluate(() => JSON.parse(localStorage.getItem("rl_level")));
  if (L?.tp) await page.keyboard.press(L.tp.x > L.px ? "ArrowRight" : L.tp.x < L.px ? "ArrowLeft" : L.tp.y > L.py ? "ArrowDown" : "ArrowUp"); await sleep(200);
}
// 포탈로 마을에 나와서 헬 문(dx 1) / 층 고르기 문(dx 5)까지 걸어가 ↑
async function walkToHell(page, dx = 1) { await portalOut(page); await goDoor(page, dx === 5 ? "hellPick" : "hell"); await sleep(100); }
const save = (d, rid, extra = {}, run = {}) => JSON.stringify({ v: 1, f50: 1, season: 4, best: 50, clr: 1, nb: 50, nclr: 1, hb: d, ...extra, run: { d, hp: 9e6, mh: 9e6, a: 30, g: 500, l: 40, x: 0, xn: 1e12, rid, k: 0, pp: 0, z: "hell", ...run } });
const neck = findA("j30", 155, it => it.slot === "neck" && it.rarity === "legendary"), r1 = findA("j35", 160, it => it.slot === "ring" && it.rarity === "legendary"), r2 = findA("j40", 165, it => it.slot === "ring" && it.rarity === "epic"), r3 = findA("j45", 170, it => it.slot === "ring" && it.rarity === "rare");
const invAcc = () => JSON.stringify({ bag: [neck, r1, r2, r3], equip: Object.fromEntries(I.EQUIP_SLOTS.map(s => [s, null])), log: [], stones: 0 });
try {
  let { ctx, page, errors } = await open("acctest-a", { rl_save: save(5, "acA"), rl_level: lv(5, "acA", "hell"), "rl_inv:g:DEV": invAcc() });
  await press(page, "i"); await sleep(200);
  const pickB = async (it) => { await page.locator(".bag-item", { hasText: I.itemName(it) }).first().click(); await sleep(150); };
  const slotsText = await page.locator("#inv-equip").innerText();
  check("inventory shows 10 equip slots incl. 목걸이 · 반지 1 · 반지 2", (await page.locator("#inv-equip .slot").count()) === 10 && slotsText.includes("목걸이") && slotsText.includes("반지 1") && slotsText.includes("반지 2"), slotsText);
  for (const it of [neck, r1, r2]) { await pickB(it); await page.locator("#inv-detail button", { hasText: "장착" }).first().click(); await sleep(150); }
  let inv = await page.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => k.startsWith("rl_inv:")))));
  check("equip: neck → 목걸이, rings fill 반지 1 then 반지 2", inv.equip.neck?.id === neck.id && inv.equip.ring1?.id === r1.id && inv.equip.ring2?.id === r2.id, JSON.stringify(Object.fromEntries(Object.entries(inv.equip).map(([k, v]) => [k, v?.id]))));
  await pickB(r3);
  const det = await page.locator("#inv-detail").innerText();
  check("third ring: choose 반지 1 / 반지 2 to swap, both shown as worn", det.includes("반지 1 자리에 끼기") && det.includes("반지 2 자리에 끼기") && det.includes("지금 낀 것 (반지 1)") && det.includes("지금 낀 것 (반지 2)") && det.includes("지금 낀 것과 비교) · 반지 1"), det.slice(0, 400));
  await page.locator("#inv-detail button", { hasText: "반지 2 자리에 끼기" }).click(); await sleep(150);
  inv = await page.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => k.startsWith("rl_inv:")))));
  check("swap into 반지 2: r2 back to bag, r1 stays", inv.equip.ring2?.id === r3.id && inv.equip.ring1?.id === r1.id && inv.bag.some(x => x.id === r2.id));
  await page.locator("#inv-equip .slot", { hasText: "목걸이" }).click(); await sleep(150);
  const nd = await page.locator("#inv-detail").innerText();
  check("detail: accessory note (enhance raises it, 지옥의 힘), atk/def/hp ★ with ranges, resist lines ◆", nd.includes("장신구: ★ 공격력·방어력·최대 HP(강화하면 오름, 지옥의 힘 ×5)") && /★ 공격력 \+\d+ \[\d+~\d+\]/.test(nd) && /★ 최대 HP \+\d+ \[\d+~\d+\]/.test(nd) && /◆ (불|얼음|번개|모든 속성) 저항/.test(nd), nd.slice(0, 500));
  await page.screenshot({ path: `${OUT}/acc-inv.png` });
  check("no page errors (inventory)", errors.length === 0, errors.join("; "));
  await ctx.close();
  // 네임드 보스: 유니크 장신구 드롭 (시드 |a처치 순번)
  const ridA = (() => { for (let i = 0; ; i++) if (I.rollUniqueAcc(`uqa${i}|j20|a2`, 145) && !I.rollUnique(`uqa${i}|j20|u2`, 145)) return `uqa${i}`; })();
  ({ ctx, page, errors } = await open("acctest-b", { rl_save: save(20, ridA), rl_level: lv(20, ridA, "hell", [{ x: 11, y: 10, ...M.makeNamedBoss(20), hp: 1 }]), "rl_inv:g:DEV": invAcc() }));
  await press(page, "ArrowRight"); await sleep(250);
  const LA = await page.evaluate(() => JSON.parse(localStorage.getItem("rl_level")));
  const dropA = LA.items.find(i => i.type === "gear" && i.item.rarity === "unique");
  check("구미호 drops unique accessory 여우불 반지 (seed |j20|a2)", dropA?.item.uq === "foxfire" && dropA.item.seed === `${ridA}|j20|a2` && (await logs(page)).includes("유니크 장신구 여우불 반지"), JSON.stringify(LA.items.map(i => i.item?.uq || i.type)));
  await ctx.close();
  // 업경 목걸이: 저항 최대치 80% (능력치 화면)
  // 유니크의 힘(모든 저항 +5)이 없어져서 목걸이 저항 줄도 채움 (11 × 8 = 88 → 최대 80)
  const resGear = [{ ...ep, lines: [["allRes", 11], ["allRes", 11]] }, ...[0, 1].map(j => ({ ...findA("j45", 170, it => it.slot === "ring" && it.rarity === "legendary"), lines: [["allRes", 11], ["allRes", 11], ["allRes", 11]], id: `rg${j}` }))];
  ({ ctx, page, errors } = await open("acctest-c", { rl_save: save(5, "acC", {}, { z: "normal" }), rl_level: lv(5, "acC", "normal"), "rl_inv:g:DEV": JSON.stringify({ bag: [], equip: { ...Object.fromEntries(I.EQUIP_SLOTS.map(s => [s, null])), neck: resGear[0], ring1: resGear[1], ring2: resGear[2] }, log: [], stones: 0 }) }));
  await press(page, "i"); await sleep(200);
  const sumT = await page.locator("#inv-summary").textContent();
  check("업경 목걸이 + resist: resist shown up to 80% (최대 80%)", /불 80%/.test(sumT) && sumT.includes("(최대 80%)"), sumT.slice(0, 600));
  check("no page errors (unique accessory)", errors.length === 0, errors.join("; "));
  await ctx.close();
} finally { await browser.close(); }

// ---- 서버 ----
try {
  const post = (guest, body) => fetch("http://127.0.0.1:8123/api.php?r=score", { method: "POST", headers: { "Content-Type": "application/json", Origin: ORIGIN.slice(0, -1), "X-Guest-Id": guest }, body: JSON.stringify(body) }).then(r => r.json());
  const me = (guest, season) => fetch(`http://127.0.0.1:8123/api.php?r=me&season=${season}`, { headers: { Origin: ORIGIN.slice(0, -1), "X-Guest-Id": guest } }).then(r => r.json());
  const ref = (it, extra = {}) => ({ seed: it.seed, src: it.src, lvl: it.lvl, v: it.v, enh: 0, id: it.id, r: it.r, ...extra });
  await post("acc-guest-01", { stage: 76, plvl: 40, nm: 51, hell: 46, item: ref(hl), gear: [ref(neck), ref(r1), ref(r3)] });
  let m = await me("acc-guest-01", "hell");
  check("server: accessory accepted as best item (r7)", nameOf(m.item) === I.itemName(hl), JSON.stringify(m.item).slice(0, 300));
  const pl = await (await fetch(`http://127.0.0.1:8123/api.php?r=player&season=hell&id=${m.id}`, { headers: { Origin: ORIGIN.slice(0, -1) } })).json();
  const gi = pl.gear?.items || [];
  check("server gear snapshot: neck + two rings accepted (ring + ring2, r8 atk/def/hp)", gi.length === 3 && gi.filter(x => x.slot === "ring").length === 2 && pl.gear.rejected === 0 && gi.every(x => x.main.some(l => l.k === "hp")) && pl.gear.stats.atk > 50, JSON.stringify([gi.map(x => [x.slot, x.lines.map(l => l.k)]), pl.gear?.rejected]));
  await post("acc-guest-02", { stage: 76, plvl: 40, nm: 51, hell: 40, item: ref(hl, { ar: 3 }) });
  m = await me("acc-guest-02", "hell");
  check("server: rejects ancient reroll count (ar) on an accessory from a non-operator", !m.item || m.item.id !== hl.id && m.item?.name !== I.itemName(hl), JSON.stringify(m.item));
  const uaRef = { seed: dropRef.seed, src: "unique", lvl: dropRef.lvl, v: 4, enh: 0, id: dropRef.id, r: dropRef.r };
  await post("acc-guest-03", { stage: 76, plvl: 40, nm: 51, hell: 46, item: uaRef });
  m = await me("acc-guest-03", "hell");
  check("server: unique accessory accepted (seed |a, named floor)", nameOf(m.item) === "여우불 반지" && m.item?.rarity === "unique", JSON.stringify(m.item));
  let offA = null; for (let i = 0; !offA; i++) if (I.rngFrom(`v4|uniqueacc?|xa${i}|j15|a1`)() < 0.1) offA = `xa${i}|j15|a1`;
  await post("acc-guest-04", { stage: 76, plvl: 40, nm: 51, hell: 46, item: { seed: offA, src: "unique", lvl: 140, v: 4, enh: 0, r: 7 } });
  m = await me("acc-guest-04", "hell");
  check("server: rejects unique accessory on a non-named floor", !m.item || m.item.rarity !== "unique", JSON.stringify(m.item));
} finally { php.kill(); }
check("no php errors", !/Fatal|Warning|Notice|Deprecated/.test(phpErr), phpErr.slice(0, 400));
const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
