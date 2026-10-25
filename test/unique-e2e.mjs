// 헬 3단계: 유니크 10개 — 규칙, 네임드 보스 드롭(15%), 이름·상세 (유니크의 힘은 3단계에서 없어짐), 특수 효과(전투), 서버 검증(시드 u·랭킹)
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
const DIR = path.dirname(new URL(import.meta.url).pathname) + "/php";
const DB = path.join(DIR, "unique.sqlite"); for (const f of [DB, DB + "-wal", DB + "-shm"]) fs.rmSync(f, { force: true });
const CFG = path.join(DIR, "config.unique.php");
fs.writeFileSync(CFG, `<?php\n$c = require __DIR__ . '/config.test.php';\nreturn array_merge($c, ['db_dsn' => 'sqlite:${DB}']);\n`);
const php = spawn("php", ["-S", "127.0.0.1:8122", "-t", path.join(REPO, "ranking-php")], { env: { ...process.env, RANKING_CONFIG: CFG, TEST_JWT_SECRET: "unique" }, stdio: ["ignore", "ignore", "pipe"] });
let phpErr = ""; php.stderr.on("data", d => phpErr += d);
await sleep(700);


// ---- 규칙 ----
const UQ = I.UNIQUE.items;
check("10 unique gear + 5 unique accessories, 2 gear per named boss floor", Object.keys(UQ).length === 15 && [10, 20, 30, 40, 50].every(f => I.uniquesOf(f).length === 2));
let hits = 0; for (let i = 0; i < 4000; i++) if (I.rollUnique(`rr${i}|j30|u${i}`, 155)) hits++;
check("drop chance ≈ 15% per named kill", hits > 4000 * 0.12 && hits < 4000 * 0.18, hits);
const fang = I.generateUnique("uqt6|j10|u2", 135);
check("generate: rarity unique, fixed name/slot/lines, all main stats, hell power ×5, no ancient", fang.uq === "fang" && fang.rarity === "unique" && fang.src === "unique" && fang.slot === "weapon" && fang.type === "dagger" &&
  fang.main.map(m => m[0]).join() === "atk,critDmg,atkPct,lifesteal" && fang.lines.map(l => l[0]).join() === UQ.fang.lines.join() && I.nmPower(fang, "atk") === 5 && !fang.ancient && I.itemName({ ...fang, enh: 10 }) === "+10 송곳니", JSON.stringify(fang));
const same = I.generate(fang.seed, "unique", 135, 4, fang.r);
check("generate(seed, 'unique') rebuilds the same item", same.id === fang.id && JSON.stringify(same.main) === JSON.stringify(fang.main));
const L = { ...fang, rarity: "legendary" };
check("ranges = legendary × 1.2 (crit dmg main, level line)", JSON.stringify(I.mainRange("critDmg", fang)) === JSON.stringify([48, 60]) && I.lineRangeOf("atk", fang)[1] === Math.round(I.lineRange("atk", 135)[1] * 1.2));
const T = I.totals([{ ...I.generateUnique("uqrobe|j50|u1", 175), uq: "robe" }].map(it => ({ ...it, ...I.generateUnique(it.seed, 175) })));
const robeSeed = (() => { for (let i = 0; ; i++) { const it = I.generateUnique(`ur${i}|j50|u1`, 175); if (it.uq === "robe") return it; } })();
const T2 = I.totals([robeSeed]);
check("totals: no unique power (stats + special only)", I.UNIQUE.power === undefined && T2.stats.hpPct === 30 && T2.stats.atkPct === 0 && T2.stats.allRes >= 20 && T2.uniques.names[0] === "염라의 관복" && T2.uniques.special.lastStand === 30, JSON.stringify(T2.stats));
check("not rerollable / reforgeable", !I.canRerollAncient(fang, true) && !I.canReforge(fang));
// 세트의 힘: 3단계에서 없어짐 (지옥의 세트 조각 하나는 세트 없을 때와 같음)
const setOf = (tag, lvl) => { for (let i = 0; ; i++) { const it = I.generate(`sp${i}|${tag}|k${i}`, "boss", lvl); if (it.set && it.slot !== "weapon" && it.slot !== "offhand") return it; } };
const hs = setOf("j25", 150), ns = setOf("n25", 100), ds = setOf("d40", 40);
const t0 = I.totals([{ ...hs, set: null }]).stats, t1 = I.totals([hs]).stats;
check("set power removed: one hell set piece = same stats as without set", I.setPower === undefined && I.SET_POWER === undefined && t1.setPower === undefined && ns && ds && ["atkPct", "defPct", "hpPct", "allRes"].every(k => t1[k] === t0[k]), JSON.stringify([t1.atkPct, t0.atkPct, t1.allRes, t0.allRes]));
check("폭풍전야 vuln radius 2", I.RUNEWORD_FX.vuln.radius === 2 && I.runewordSpecialText({ vuln: 20 })[0].includes("2칸 안"));
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
    const res = await fetch(`http://127.0.0.1:8122/api.php${u.search}`, { method: req.method(), headers: { ...req.headers(), origin: ORIGIN.slice(0, -1) }, body: req.method() === "GET" ? undefined : req.postData() });
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
// 로비 포탈 위 (16,13) → 왼쪽 3칸 (13,13) → 위로 9칸 (13,4) → 오른쪽 dx칸 → 위로 한 칸: 헬 문 (14,3) / 층 고르기 문 (18,3)
async function walkToHell(page, dx = 1) { await portalOut(page); await press(page, "ArrowLeft", 3); await press(page, "ArrowUp", 9); await press(page, "ArrowRight", dx); await sleep(100); await page.keyboard.press("ArrowUp"); await sleep(350); }
const save = (d, rid, extra = {}, run = {}) => JSON.stringify({ v: 1, season: 4, best: 75, clr: 1, nb: 50, nclr: 1, hb: d, ...extra, run: { d, hp: 9e6, mh: 9e6, a: 30, g: 500, l: 40, x: 0, xn: 1e12, rid, k: 0, pp: 0, z: "hell", ...run } });
const findU = (k, f) => { for (let i = 0; ; i++) { const it = I.generateUnique(`ug${k}${i}|j${f}|u${i}`, 125 + f); if (it.uq === k) return it; } };
const mob = (extra = {}) => ({ x: 11, y: 10, ...M.makeHell(M.MONSTERS.at(-1), "normal", 5, "fire"), hp: 1e9, maxHp: 1e9, atk: 50, el: null, res: { fire: 0, ice: 0, bolt: 0 }, ...extra });
try {
  // 1. 네임드 보스(불가사리)가 유니크를 떨어뜨림 (판 ID uqt6, 처치 순번 2 → 송곳니)
  const boss = { x: 11, y: 10, ...M.makeNamedBoss(10), hp: 1 };
  let { ctx, page, errors } = await open("uqtest-a", { rl_save: save(10, "uqt6"), rl_level: lv(10, "uqt6", "hell", [boss]), "rl_inv:g:DEV": inv(v4) });
  await press(page, "ArrowRight"); await sleep(250);
  let L = await stored(page, "rl_level");
  const ug = L.items.find(i => i.type === "gear" && i.item.rarity === "unique");
  check("named boss drops unique 송곳니 (seed |j10|u2) with gold log", ug && ug.item.uq === "fang" && ug.item.seed === "uqt6|j10|u2" && ug.item.id === fang.id && (await logs(page)).includes("유니크 송곳니을(를) 떨어뜨렸다"), JSON.stringify(L.items.map(i => i.item?.rarity || i.type)));
  await page.screenshot({ path: `${OUT}/unique-drop.png` });
  // 줍고 인벤토리 상세
  await page.evaluate(({ x, y }) => { const L = JSON.parse(localStorage.getItem("rl_level")); }, ug);
  await ctx.close();
  // 2. 유니크 장착: 상세·능력치 화면, 특수 효과
  const scale = findU("ironscale", 10), boots = findU("dragonboots", 30), scythe = findU("scythe", 40), mirror = findU("mirror", 50);
  ({ ctx, page, errors } = await open("uqtest-b", { rl_save: save(5, "uqB"), rl_level: lv(5, "uqB", "hell", [mob()]), "rl_inv:g:DEV": inv(scale, boots, mirror) }));
  await press(page, ".", 12); await sleep(150);   // 업경대 패링 40%라 넉넉히 (12턴 모두 막을 확률 0.002%)
  let st = await page.locator("#status").innerText(), lg = await logs(page);
  check("쇠비늘: hit → defense +3% stacks (HUD)", st.includes("🐉 쇠비늘 방어력 +"), st);
  check("용비늘: shield every 2 turns (HUD)", st.includes("🛡 보호막"), st);
  check("업경대: reflects 30% of damage taken", lg.includes("업보:") && lg.includes("피해를 되돌렸다"), lg.slice(-600));
  await press(page, "i"); await sleep(200);
  const sum = await page.locator("#inv-summary").textContent();
  check("stats tab lists uniques and their effects", sum.includes("✦ 유니크: ") && sum.includes("쇠비늘 갑옷") && sum.includes("업보: 받은 피해의 30%"), sum.slice(0, 400));
  await page.locator("#inv-equip .slot", { hasText: "쇠비늘" }).first().click().catch(() => {}); await sleep(200);
  const det = await page.locator("#inv-detail").textContent().catch(() => "");
  check("detail: ✦ 유니크 header + boss + effect", det.includes("✦ 유니크 쇠비늘 갑옷") && det.includes("헬 10층 네임드 불가사리") && det.includes("쇠비늘: 맞을 때마다"), det.slice(0, 300));
  await page.screenshot({ path: `${OUT}/unique-detail.png` });
  check("no page errors (equip)", errors.length === 0, errors.join("; "));
  await ctx.close();
  // 3. 사자의 낫: 처치하면 공격력 +2%
  ({ ctx, page, errors } = await open("uqtest-c", { rl_save: save(5, "uqC"), rl_level: lv(5, "uqC", "hell", [mob({ hp: 1 })]), "rl_inv:g:DEV": inv(scythe) }));
  const atk0 = +(await page.locator("#atk").innerText());
  await press(page, "ArrowRight"); await sleep(200);
  check("사자의 낫: kill → attack +2% (HUD)", (await page.locator("#status").innerText()).includes("💀 영혼 수확 공격력 +2%") && +(await page.locator("#atk").innerText()) > atk0);
  await ctx.close();
  // 4. 송곳니: 때린 적에게 물어뜯기 (3턴)
  ({ ctx, page, errors } = await open("uqtest-d", { rl_save: save(5, "uqD"), rl_level: lv(5, "uqD", "hell", [mob({ atk: 1 })]), "rl_inv:g:DEV": inv(fang) }));
  await press(page, "ArrowRight"); await sleep(200);
  L = await stored(page, "rl_level");
  check("송곳니: hit enemy is bitten (+12%, 3 turns)", L.enemies[0]?.bitePct === 12 && L.enemies[0].biteUntil > L.turn, JSON.stringify(L.enemies[0] && [L.enemies[0].bitePct, L.enemies[0].biteUntil, L.turn]));
  check("no page errors (fang)", errors.length === 0, errors.join("; "));
  await ctx.close();
  // 5. 폭풍전야: 2칸 떨어진 몬스터도 속성 저항 −20%
  const storm = (() => { const w = I.RUNEWORDS.find(x => x.name === "폭풍전야"); for (let i = 0; ; i++) { const it = I.generate(`st${i}|j30|k${i}`, "boss", 155); if (it.rarity === "common" && it.type === "longsword" && I.socketCount(it) === 4) return { ...it, gems: w.runes.map(k => ["rune", k]) }; } })();
  ({ ctx, page, errors } = await open("uqtest-e", { rl_save: save(5, "uqE"), rl_level: lv(5, "uqE", "hell", [mob({ x: 12, y: 10, atk: 1 })]), "rl_inv:g:DEV": inv(storm) }));
  await press(page, "."); await sleep(200);
  L = await stored(page, "rl_level");
  check("폭풍전야: monster 2 tiles away gets resist −20%", I.runewordOf(storm)?.name === "폭풍전야" && L.enemies[0]?.vulnPct === 20, JSON.stringify(L.enemies[0] && [L.enemies[0].x, L.enemies[0].vulnPct, L.turn]));
  await ctx.close();
  // 6. 지옥의 세트: 능력치 화면에 세트의 힘 없음
  ({ ctx, page, errors } = await open("uqtest-f", { rl_save: save(5, "uqF"), rl_level: lv(5, "uqF", "hell"), "rl_inv:g:DEV": inv({ ...hs, enh: 0 }) }));
  await press(page, "i"); await sleep(200);
  check("stats tab has no 세트의 힘 for a hell set piece", !(await page.locator("#inv-summary").textContent()).includes("세트의 힘"));
  check("no page errors (set power)", errors.length === 0, errors.join("; "));
  await ctx.close();
} finally { await browser.close(); }

// ---- 서버: 유니크 검증 ----
try {
  const post = (guest, body) => fetch("http://127.0.0.1:8122/api.php?r=score", { method: "POST", headers: { "Content-Type": "application/json", Origin: ORIGIN.slice(0, -1), "X-Guest-Id": guest }, body: JSON.stringify(body) }).then(r => r.json());
  const me = (guest, season) => fetch(`http://127.0.0.1:8122/api.php?r=me&season=${season}`, { headers: { Origin: ORIGIN.slice(0, -1), "X-Guest-Id": guest } }).then(r => r.json());
  const ref = (it) => ({ seed: it.seed, src: it.src, lvl: it.lvl, v: it.v, enh: 10, id: it.id, r: it.r });
  await post("uq-guest-01", { stage: 76, plvl: 40, nm: 51, hell: 11, item: ref(fang) });
  let m = await me("uq-guest-01", "hell");
  check("server: unique 송곳니 accepted as best item (name, rarity unique)", m.item?.rarity === "unique" && m.item?.name === "+10 송곳니", JSON.stringify(m.item || m).slice(0, 300));
  // 위조: 유니크가 안 나오는 처치 순번 / 네임드가 아닌 층
  let miss = null; for (let i = 0; !miss; i++) if (!I.rollUnique(`uqt6|j10|u${i}`, 135, I.FIND.max)) miss = `uqt6|j10|u${i}`;   // 아이템 발견 최대에서도 안 나오는 순번
  await post("uq-guest-02", { stage: 76, plvl: 40, nm: 51, hell: 11, item: { ...ref(fang), seed: miss, id: undefined } });
  m = await me("uq-guest-02", "hell");
  check("server: rejects unique from a seed that doesn't drop one", !m.item || m.item.rarity !== "unique", JSON.stringify(m.item));
  let off = null; for (let i = 0; !off; i++) { try { if (I.rngFrom(`v4|unique?|x${i}|j15|u1`)() < 0.15) off = `x${i}|j15|u1`; } catch {} }
  await post("uq-guest-03", { stage: 76, plvl: 40, nm: 51, hell: 16, item: { seed: off, src: "unique", lvl: 140, v: 4, enh: 0, r: 6 } });
  m = await me("uq-guest-03", "hell");
  check("server: rejects unique on a non-named floor (15)", !m.item || m.item.rarity !== "unique", JSON.stringify(m.item));
} finally { php.kill(); }
check("no php errors", !/Fatal|Warning|Notice|Deprecated/.test(phpErr), phpErr.slice(0, 400));
const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
