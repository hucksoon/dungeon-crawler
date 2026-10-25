// dc#51: 아이템 발견(mf) — 규칙, 보너스 드롭(시드 |f), 유니크 확률, 서버 검증 / 룬워드 남는 홈(보석) / 나무 상향
import { createRequire } from "node:module";
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs"; import path from "node:path";
const require = createRequire(process.env.NODE_PATH + "/");
const { chromium } = require("playwright");
const REPO = process.argv[2], OUT = process.argv[3];
const I = createRequire(import.meta.url)(path.join(REPO, "items.js"));
const M = createRequire(import.meta.url)(path.join(REPO, "monsters.js"));
const B = createRequire(import.meta.url)(path.join(REPO, "builds.js"));
const ORIGIN = "https://game.apacimtest.com/", API = "https://api.test/api.php";
const results = []; const check = (n, ok, x = "") => { results.push(!!ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x && !ok ? " — " + x : ""}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const DIR = path.dirname(new URL(import.meta.url).pathname) + "/php";
const DB = path.join(DIR, "find.sqlite"); for (const f of [DB, DB + "-wal", DB + "-shm"]) fs.rmSync(f, { force: true });
const CFG = path.join(DIR, "config.find.php");
fs.writeFileSync(CFG, `<?php\n$c = require __DIR__ . '/config.test.php';\nreturn array_merge($c, ['db_dsn' => 'sqlite:${DB}']);\n`);
const php = spawn("php", ["-S", "127.0.0.1:8124", "-t", path.join(REPO, "ranking-php")], { env: { ...process.env, RANKING_CONFIG: CFG, TEST_JWT_SECRET: "find" }, stdio: ["ignore", "ignore", "pipe"] });
let phpErr = ""; php.stderr.on("data", d => phpErr += d);
await sleep(700);

// ---- 규칙: 아이템 발견 ----
const UQ = I.UNIQUE.items, RW = (n) => I.RUNEWORDS.find(w => w.name === n);
check("STATS.mf 아이템 발견 (%), FIND max 150 (= most mf gear can give) / bonus 0.1 / uniqueDiv 300", I.STATS.mf?.name === "아이템 발견" && I.STATS.mf.pct && I.FIND.max === 150 && I.findCeiling() === I.FIND.max && I.FIND.bonus === 0.1 && I.FIND.uniqueDiv === 300);
check("no cap (dc#80): findPct keeps everything above 0, bonus 10% at 100 · 15% at 150, unique ×1.33 · ×1.5", I.findPct(150) === 150 && I.findPct(200) === 200 && I.findPct(-5) === 0 && I.findBonusChance(100) === 0.1 && Math.abs(I.findBonusChance(150) - 0.15) < 1e-12 && I.findBonusChance(0) === 0 && Math.abs(I.findUniqueMul(100) - 4 / 3) < 1e-9 && I.findUniqueMul(150) === 1.5);
{ const m = fs.readFileSync(path.join(REPO, "ranking-php/rules.php"), "utf8").match(/const R_FIND = \['max' => (\d+), 'bonus' => ([\d.]+), 'uniqueDiv' => (\d+)\]/);
  check("server R_FIND matches items.js FIND (max 150: server accepts rolls up to the most mf gear can give)", m && +m[1] === I.FIND.max && +m[2] === I.FIND.bonus && +m[3] === I.FIND.uniqueDiv, m?.[0]); }
check("mf on runewords 기억 25 · 몰래 25 (치유 removed dc#53)", !RW("치유") && RW("기억").stats.mf === 25 && RW("몰래").stats.mf === 25);
check("mf on uniques 송곳니 20 · 쇠이빨 20 · 여의 반지 15", UQ.fang.stats.mf === 20 && UQ.ironfang.stats.mf === 20 && UQ.yeoui.stats.mf === 15 && UQ.fang.text.includes("아이템 발견 +20%"));
check("나무 buffed: atkPct 30 · critDmg 30 (+ fire dmg/res, lifesteal)", RW("나무").stats.atkPct === 30 && RW("나무").stats.critDmg === 30 && RW("나무").stats.lifesteal === 4);
let bonus = 0, rare = 0;
for (let i = 0; i < 6000; i++) { const it = I.rollFindBonus(`fb${i}|j30|f${i}`, 155, 100); if (it) { bonus++; if (["rare", "epic", "legendary", "set"].includes(it.rarity)) rare++; } }
check("rollFindBonus at 100%: ≈10% of kills, golden table (rare+)", bonus > 6000 * 0.085 && bonus < 6000 * 0.115 && rare === bonus, `${bonus} ${rare}`);
let half = 0; for (let i = 0; i < 6000; i++) if (I.rollFindBonus(`fb${i}|j30|f${i}`, 155, 50)) half++;
check("rollFindBonus at 50% ≈ 5%, at 0% none", half > 6000 * 0.04 && half < 6000 * 0.06 && !Array.from({ length: 500 }, (_, i) => I.rollFindBonus(`fb${i}|j30|f${i}`, 155, 0)).some(Boolean), half);
let u0 = 0, u1 = 0; for (let i = 0; i < 6000; i++) { if (I.rollUnique(`ru${i}|j30|u${i}`, 155)) u0++; if (I.rollUnique(`ru${i}|j30|u${i}`, 155, 100)) u1++; }
check("unique chance 15% → 20% at mf 100 (same seeds, superset)", u0 > 6000 * 0.13 && u0 < 6000 * 0.17 && u1 > 6000 * 0.18 && u1 < 6000 * 0.22, `${u0} ${u1}`);
const findU = (k) => { const U = UQ[k]; for (let i = 0; ; i++) { const it = I.generateUnique(`fu${k}${i}|j${U.boss}|${U.acc ? "a" : "u"}${i}`, 125 + U.boss); if (it.uq === k) return it; } };
const gen = (pred, tag = "j30", lvl = 155) => { for (let i = 0; ; i++) { const it = I.generate(`fg${i}|${tag}|k${i}`, "boss", lvl); if (pred(it)) return it; } };
const rwItem = (name, pred, extra = []) => ({ ...gen(pred), gems: [...RW(name).runes.map(k => ["rune", k]), ...extra] });
const head = rwItem("기억", x => x.rarity === "common" && x.slot === "head" && I.socketCount(x) === 2);
const chest = rwItem("몰래", x => x.rarity === "common" && x.slot === "chest" && I.socketCount(x) === 4);
const fang = findU("fang"), ironfang = findU("ironfang"), yeoui1 = findU("yeoui"), yeoui2 = { ...yeoui1, id: yeoui1.id + "b", slot: "ring" };
const T = I.totals([head, chest, fang, ironfang, yeoui1, yeoui2]).stats;
check("totals: 기억 25 + 몰래 25 + 송곳니 20 + 쇠이빨 20 + 여의 15×2 = 120 (no cap: findPct → 120)", T.mf === 120 && I.findPct(T.mf) === 120, T.mf);
const farmSum = (b) => b.slots.reduce((a, s) => a + (s.rw ? RW(s.rw).stats.mf : UQ[s.uq].stats.mf), 0);
check("builds.js farm builds (early runewords 4 · late uniques) = 100% each", B.farm.builds.length === 2 && B.farm.builds.every(b => farmSum(b) === 100), B.farm.builds.map(farmSum).join());
check("builds.js early hell: 송곳니 1st, 카리스마 2nd (dc#53), 나무 3rd", B.early.builds[0].slots.weapon.uq === "fang" && B.early.builds[1].slots.weapon.rw === "카리스마" && B.early.builds[2].slots.weapon.rw === "나무" && B.early.floors.join() === "10,20,30");
check("builds.js unused: 나무·송곳니 removed (now early hell)", !B.unused.runewords.some(r => r.name === "나무") && !B.unused.uniques.some(r => r.uq === "fang"));

// ---- 규칙: 룬워드 남는 홈 (완성하면 없어짐) ----
const ls6 = gen(x => x.rarity === "common" && x.type === "longsword" && I.socketCount(x) === 6);
const pil = RW("필살일격").runes.map(k => ["rune", k]);
const cases = [
  ["exact runes on 6 sockets (2 empty)", { ...ls6, gems: pil }, "필살일격"],
  ["runes + 2 gems (can't happen in game) → not a runeword", { ...ls6, gems: [...pil, ["diamond", 2], ["ruby", 1]] }, null],
  ["3 of 4 runes", { ...ls6, gems: pil.slice(0, 3) }, null],
  ["gem first then runes", { ...ls6, gems: [["diamond", 2], ...pil] }, null],
  ["4-socket chest + 몰래 2 runes", chest, "몰래"],
];
for (const [n, it, want] of cases) check(`runewordOf: ${n} → ${want || "none"}`, (I.runewordOf(it)?.name || null) === want, I.runewordOf(it)?.name);
check("runewordsFor: 6-socket common longsword lists 4-rune longsword runewords", ["필살일격", "폭풍전야", "카리스마", "선견지명", "마음가짐"].every(n => I.runewordsFor(ls6).some(w => w.name === n)));
const done6 = { ...ls6, gems: pil };
check("completed runeword: leftover sockets removed (socketCount 6 → 4, socket line still 6)", I.socketCount(done6) === 4 && I.socketLine(done6) === 6 && I.socketCount(ls6) === 6 && I.socketCount({ ...ls6, gems: pil.slice(0, 3) }) === 6);
check("effectiveLines shows 홈 4 for the completed runeword", I.effectiveLines(done6).find(([k]) => k === "socket")?.[1] === 4);
check("socketsLostBy: last rune → 2 sockets lost, earlier rune → 0", I.socketsLostBy({ ...ls6, gems: pil.slice(0, 3) }, pil[3]) === 2 && I.socketsLostBy({ ...ls6, gems: pil.slice(0, 2) }, pil[2]) === 0 && I.socketsLostBy({ ...chest, gems: chest.gems.slice(0, 1) }, chest.gems[1]) === 2);
check("itemName +3 필살일격", I.itemName({ ...done6, enh: 3 }) === "+3 필살일격");
// PHP r_runeword_of 같은 결과
const tmp = path.join(DIR, "find-rw.json"); fs.writeFileSync(tmp, JSON.stringify(cases.map(c => c[1])));
const phpOut = execFileSync("php", ["-r", `require "${REPO}/ranking-php/rules.php"; $c = json_decode(file_get_contents("${tmp}"), true); echo json_encode(array_map(fn($x) => r_runeword_of($x)["name"] ?? null, $c), JSON_UNESCAPED_UNICODE);`]).toString();
check("PHP r_runeword_of matches JS for all cases", phpOut === JSON.stringify(cases.map(c => c[2])), phpOut);

// ---- 게임 ----
const MAP_W = 32, MAP_H = 24;
const map = Array.from({ length: MAP_H }, (_, y) => Array.from({ length: MAP_W }, (_, x) => (x === 0 || y === 0 || x === MAP_W - 1 || y === MAP_H - 1 ? 0 : 1)));
const lv = (d, rid, z, enemies = [], extra = {}) => { const mm = map.map(r => r.slice()); mm[10][11] = 2; return JSON.stringify({ rid, d, z, turn: 0, map: mm.map(r => r.join("")).join(""), seen: "1".repeat(MAP_W * MAP_H), px: 10, py: 10, shop: null, enemies, items: [], ...extra }); };
const eqOf = (...its) => { const e = Object.fromEntries(I.SLOTS.map(s => [s, null])); for (const it of its) e[it.slot === "ring" ? (e.ring1 === null ? "ring1" : "ring2") : it.slot] = it; return e; };
const inv = (...eq) => JSON.stringify({ bag: [], equip: eqOf(...eq), log: [], stones: 0 });
const save = (d, rid, run = {}) => JSON.stringify({ v: 1, season: 4, best: 75, clr: 1, nb: 50, nclr: 1, hb: d, run: { d, hp: 9e6, mh: 9e6, a: 30, g: 500, l: 40, x: 0, xn: 1e12, rid, k: 0, pp: 0, z: "hell", ...run } });
const mob = (extra = {}) => ({ x: 11, y: 10, ...M.makeHell(M.MONSTERS.at(-1), "normal", 5, "fire"), hp: 1, maxHp: 1, atk: 1, el: null, res: { fire: 0, ice: 0, bolt: 0 }, ...extra });
// 판 ID: 처치 1번째(|f1)에서 보너스가 나오는 것
let rid = null; for (let i = 0; !rid; i++) if (I.rollFindBonus(`fd${i}|j5|f1`, 130, 100)) rid = `fd${i}`;
const want = I.rollFindBonus(`${rid}|j5|f1`, 130, 100);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
async function open(dev, seed) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 1000 } }); const page = await ctx.newPage(); const errors = [];
  page.on("pageerror", e => errors.push(e.message)); page.on("dialog", d => d.accept());
  await ctx.route(ORIGIN + "**", r => { const f = new URL(r.request().url()).pathname.slice(1) || "index.html";
    if (f === "ranking-config.js") return r.fulfill({ contentType: "text/javascript", body: `window.RANKING_API = "";` });
    const p = path.join(REPO, f); if (!fs.existsSync(p)) return r.fulfill({ status: 404, body: "" });
    r.fulfill({ contentType: f.endsWith(".js") ? "text/javascript" : "text/html", body: fs.readFileSync(p) }); });
  await ctx.route("https://login.xsolla.com/**", r => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await ctx.addInitScript(([seed, dev]) => { if (sessionStorage.getItem("seeded")) return; sessionStorage.setItem("seeded", 1); sessionStorage.setItem("rl_scene", "dungeon");
    localStorage.setItem("rl_device_id", dev); for (const k of ["rl_notice_v4", "rl_notice_75", "rl_notice_1021g", "rl_notice_1021h", "rl_notice_1021i", "rl_notice_1021j", "rl_notice_1022a", "rl_notice_1022b", "rl_notice_1023a", "rl_notice_1023b", "rl_notice_1023c", "rl_notice_1023d"]) localStorage.setItem(`${k}:g:${dev}`, "1");
    for (const [k, v] of Object.entries(seed)) localStorage.setItem(k.replace("DEV", dev), v);
    window.__log = []; document.addEventListener("DOMContentLoaded", () => new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => window.__log.push(n.textContent)))).observe(document.getElementById("log"), { childList: true })); }, [seed, dev]);
  await page.goto(ORIGIN); await sleep(450);
  return { ctx, page, errors };
}
const logs = (page) => page.evaluate(() => window.__log.join("\n"));
const stored = (page, k) => page.evaluate(k => JSON.parse(localStorage.getItem(k) || "null"), k);
const press = async (page, k, n = 1) => { for (let i = 0; i < n; i++) { await page.keyboard.press(k); await sleep(30); } };
let bonusItem = null;
try {
  // 1. 아이템 발견 100%: 처치하면 보너스 아이템 (시드 |j5|f1, 출처 find)
  let { ctx, page, errors } = await open("findtest-a", { rl_save: save(5, rid), rl_level: lv(5, rid, "hell", [mob()]), "rl_inv:g:DEV": inv(head, chest, fang, ironfang, yeoui1, yeoui2) });
  await press(page, "ArrowRight"); await sleep(250);
  const L = await stored(page, "rl_level");
  const got = L.items.find(i => i.from === "find");
  bonusItem = got?.item;
  check("kill with mf 100 drops bonus item (seed |j5|f1, same as rollFindBonus)", got && got.item.seed === `${rid}|j5|f1` && got.item.id === want.id && got.item.src === "golden", JSON.stringify(L.items.map(i => [i.from, i.item?.seed])));
  check("log: 🔍 아이템 발견 line", (await logs(page)).includes("🔍 아이템 발견:"));
  await press(page, "i"); await sleep(200);
  const sum = await page.locator("#inv-summary").textContent();
  // 낀 것: 기억 25 + 몰래 25 + 송곳니 20 + 쇠이빨 20 + 여의 15 (반지 칸 하나) = 105 → 최대치 없이 그대로 (dc#80, 예전엔 100으로 잘림)
  check("stats tab: 🔍 아이템 발견 +105% (no cap), 10.5% bonus, unique ×1.35", sum.includes("🔍 아이템 발견 +105%:") && sum.includes("10.5% 확률로 보너스 아이템") && sum.includes("×1.35"), sum.slice(0, 600));
  await page.locator("#inv-equip .slot", { hasText: "몰래" }).first().click().catch(() => {}); await sleep(200);
  const det = await page.locator("#inv-detail").textContent().catch(() => "");
  check("detail: runeword 몰래 on 4-socket chest shows 아이템 발견 +25%, 홈 2/2, 남는 홈 2개 없어짐", det.includes("✦ 룬워드") && det.includes("몰래") && det.includes("아이템 발견 +25%") && det.includes("홈 2/2") && det.includes("남는 홈 2개는 룬워드를 완성하면서 없어졌어요"), det.slice(0, 600));
  await page.screenshot({ path: `${OUT}/find-detail.png` });
  check("no page errors (find)", errors.length === 0, errors.join("; "));
  await ctx.close();
  // 2. 아이템 발견 없음: 같은 판 ID여도 보너스 없음
  ({ ctx, page, errors } = await open("findtest-b", { rl_save: save(5, rid), rl_level: lv(5, rid, "hell", [mob()]), "rl_inv:g:DEV": inv(gen(x => x.slot === "weapon" && x.rarity === "legendary")) }));
  await press(page, "ArrowRight"); await sleep(250);
  check("no mf → no bonus item", !(await stored(page, "rl_level")).items.some(i => i.from === "find"));
  await ctx.close();
  // 2-1. 마지막 룬을 넣으면: 확인 창에 "남는 홈 2개는 없어져요", 넣은 뒤 홈 4/4 (더 못 넣음)
  const runes = Array(I.RUNES.length).fill(0); runes[pil[3][1]] = 1;
  ({ ctx, page, errors } = await open("findtest-r", { rl_save: save(5, "fdR"), rl_level: lv(5, "fdR", "hell"), "rl_inv:g:DEV": JSON.stringify({ bag: [], equip: eqOf({ ...ls6, gems: pil.slice(0, 3) }), log: [], stones: 0, runes }) }));
  let asked = ""; page.removeAllListeners("dialog"); page.on("dialog", dl => { asked = dl.message(); dl.accept(); });
  await press(page, "i"); await sleep(150);
  await page.locator("#inv-equip .slot", { hasText: "장검" }).first().click(); await sleep(150);
  await page.selectOption("#inv-detail select.gem-kind", "rune"); await sleep(80); await page.selectOption("#inv-detail select.gem-grade", String(pil[3][1])); await sleep(80);
  await page.locator("#inv-detail button.gem-put").click(); await sleep(250);
  check("last rune: confirm says ✦ 룬워드 필살일격 완성! 남는 홈 2개는 없어져요", asked.includes("✦ 룬워드 필살일격 완성! 남는 홈 2개는 없어져요"), asked);
  const inv2 = await stored(page, "rl_inv:g:findtest-r"), w = inv2?.equip?.weapon;
  const det2 = await page.locator("#inv-detail").textContent().catch(() => "");
  check("after: weapon is 필살일격 with 4 runes, detail 홈 4/4, no 홈에 넣기", w && I.runewordOf(w)?.name === "필살일격" && I.socketCount(w) === 4 && det2.includes("홈 4/4") && await page.locator("#inv-detail button.gem-put").count() === 0, det2.slice(0, 500));
  check("no page errors (last rune)", errors.length === 0, errors.join("; "));
  await ctx.close();
  // 3. 헬 추천 탭: 헬 초반 송곳니·파밍 줄
  ({ ctx, page, errors } = await open("findtest-c", { rl_save: save(5, "fdC"), rl_level: lv(5, "fdC", "hell"), "rl_inv:g:DEV": inv(head, chest) }));
  await press(page, "i"); await sleep(150);
  await page.locator(".inv-tab[data-tab=guide]").click(); await sleep(150);
  await page.locator(".guide-tier", { hasText: "헬" }).click(); await sleep(150);
  const g = await page.locator("#inv-guide").textContent().catch(() => "");
  check("hell guide: 헬 초반 송곳니 + 파밍 아이템 발견 50 / 150% (most gear can give)", g.includes("헬 초반 (10~30층)") && g.includes("송곳니") && g.includes("아이템 발견 50 / 150%") && g.includes("헬 초반 · 파밍"), g.slice(-500));
  check("no page errors (guide)", errors.length === 0, errors.join("; "));
  await ctx.close();
  // 4. 최고 조합 페이지: 헬 초반·파밍 탭
  ({ ctx, page, errors } = await open("findtest-d", {}));
  await page.goto(ORIGIN + "builds.html#farm"); await sleep(300);
  const farm = await page.locator("#farm").textContent();
  check("builds.html #farm: 초반 파밍(선견지명·도원결의) + 후반 파밍(쇠이빨) + ×2.34 table", !(await page.locator("#farm").isHidden()) && farm.includes("초반 파밍") && farm.includes("룬워드 선견지명") && farm.includes("룬워드 도원결의") && farm.includes("후반 파밍") && farm.includes("쇠이빨 목걸이") && farm.includes("×2.34") && farm.includes("아이템 발견 100%"), farm.slice(0, 400));
  await page.screenshot({ path: `${OUT}/builds-farm.png`, fullPage: true });
  await page.locator(".tabs button", { hasText: "헬 초반" }).click(); await sleep(150);
  const early = await page.locator("#early").textContent();
  check("builds.html early tab: 1위 송곳니, 2위 카리스마, 3위 나무, 불가사리/구미호/이무기 rows", early.includes("1위 송곳니") && early.includes("2위 카리스마") && early.includes("3위 나무") && early.includes("불가사리") && early.includes("이무기") && (await page.locator("#cond").textContent()).includes("무기·보조무기만 바꿈"), early.slice(0, 300));
  await page.screenshot({ path: `${OUT}/builds-early.png`, fullPage: true });
  check("no page errors (builds)", errors.length === 0, errors.join("; "));
  await ctx.close();
} finally { await browser.close(); }

// ---- 서버: |f 시드와 유니크 확률 ----
try {
  const post = (guest, body) => fetch("http://127.0.0.1:8124/api.php?r=score", { method: "POST", headers: { "Content-Type": "application/json", Origin: ORIGIN.slice(0, -1), "X-Guest-Id": guest }, body: JSON.stringify(body) }).then(r => r.json());
  const me = (guest, season) => fetch(`http://127.0.0.1:8124/api.php?r=me&season=${season}`, { headers: { Origin: ORIGIN.slice(0, -1), "X-Guest-Id": guest } }).then(r => r.json());
  const ref = (it, x = {}) => ({ seed: it.seed, src: it.src, lvl: it.lvl, v: it.v, enh: 0, id: it.id, r: it.r, ...x });
  const body = (item) => ({ stage: 76, plvl: 40, nm: 51, hell: 11, item });
  await post("find-guest-01", body(ref(bonusItem || want)));
  let m = await me("find-guest-01", "hell");
  check("server: accepts bonus item from |f seed (golden, r8)", m.item && m.item.name === I.itemName(want), JSON.stringify(m.item || m).slice(0, 300));
  let miss = null; for (let i = 0; !miss; i++) { const s = `${rid}|j5|f${i + 2}`; if (I.rngFrom(`v4|drop?|${s}`)() >= 0.1) miss = s; }
  await post("find-guest-02", body({ seed: miss, src: "golden", lvl: 130, v: 4, enh: 0, r: 8 }));
  m = await me("find-guest-02", "hell");
  check("server: rejects |f seed whose roll is above max bonus (10%)", !m.item, JSON.stringify(m.item));
  await post("find-guest-03", body(ref(want, { r: 7, id: undefined })));
  m = await me("find-guest-03", "hell");
  check("server: rejects |f seed for rules before r8", !m.item, JSON.stringify(m.item));
  await post("find-guest-04", body(ref(want, { src: "drop", id: undefined })));
  m = await me("find-guest-04", "hell");
  check("server: rejects |f seed from the normal drop table", !m.item, JSON.stringify(m.item));
  await post("find-guest-05", body(ref(want, { lvl: 131, id: undefined })));
  m = await me("find-guest-05", "hell");
  check("server: rejects |f seed with wrong level for the floor", !m.item, JSON.stringify(m.item));
  // 유니크: 0.15 ≤ 굴림 < 0.2 → r8이면 받음 (아이템 발견), r7이면 거절
  let mid = null; for (let i = 0; !mid; i++) { const s = `fm${i}|j10|u${i}`; if (!I.rollUnique(s, 135) && I.rollUnique(s, 135, 100)) mid = I.rollUnique(s, 135, 100); }
  await post("find-guest-06", body(ref(mid)));
  m = await me("find-guest-06", "hell");
  check("server: accepts r8 unique rolled in the mf range (15~20%)", m.item?.rarity === "unique", JSON.stringify(m.item));
  await post("find-guest-07", body(ref(mid, { r: 7, id: undefined })));
  m = await me("find-guest-07", "hell");
  check("server: rejects the same roll for r7 unique", !m.item || m.item.rarity !== "unique", JSON.stringify(m.item));
} finally { php.kill(); }
check("no php errors", !/Fatal|Warning|Notice|Deprecated/.test(phpErr), phpErr.slice(0, 400));
const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
