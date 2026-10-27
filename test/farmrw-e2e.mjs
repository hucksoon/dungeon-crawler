// dc#52: 장검·방패 파밍 룬워드 — 선견지명 회전 베기, 카리스마 처치 폭발, 도원결의 반격 (모두 흡혈) + 아이템 발견 +25
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import fs from "node:fs"; import path from "node:path";
const require = createRequire(process.env.NODE_PATH + "/");
const { chromium } = require("playwright");
const REPO = process.argv[2], OUT = process.argv[3];
const I = createRequire(import.meta.url)(path.join(REPO, "items.js"));
const M = createRequire(import.meta.url)(path.join(REPO, "monsters.js"));
const ORIGIN = "https://game.apacimtest.com/";
const results = []; const check = (n, ok, x = "") => { results.push(!!ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x && !ok ? " — " + x : ""}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ---- 규칙 ----
const RW = (n) => I.RUNEWORDS.find(w => w.name === n);
check("선견지명: 공격력 +20·치명타 +8·경험치 +25·발견 +25, 회전 베기 50%", JSON.stringify(RW("선견지명").stats) === JSON.stringify({ atkPct: 20, crit: 8, xp: 25, mf: 25 }) && RW("선견지명").special.whirl === 50 && !RW("선견지명").special.shield);
check("카리스마: 흡혈 +8·발견 +25, 처치 폭발 20%·흡혈 최대치 +3", RW("카리스마").stats.lifesteal === 8 && RW("카리스마").stats.mf === 25 && RW("카리스마").special.blast === 20 && RW("카리스마").special.lsCap === 3);
check("도원결의: 패링 +15·흡혈 +5·발견 +25, 반격 60%", RW("도원결의").stats.parry === 15 && RW("도원결의").stats.mf === 25 && RW("도원결의").special.counter === 60);
check("RUNEWORD_FX.whirl every 2", I.RUNEWORD_FX.whirl.every === 2);
const txt = I.runewordSpecialText({ whirl: 50, blast: 20, counter: 60 });
check("special text: 회전 베기 · 처치 폭발 · 반격 (흡혈 됨)", txt.length === 3 && txt[0].startsWith("회전 베기: 2턴마다 주변 8칸") && txt[1].startsWith("처치 폭발:") && txt[2].startsWith("반격: 방패로 막으면") && txt.every(t => t.includes("흡혈 됨")), JSON.stringify(txt));
const gen = (pred, tag = "j30", lvl = 155) => { for (let i = 0; ; i++) { const it = I.generate(`fr${i}|${tag}|k${i}`, "boss", lvl); if (pred(it)) return it; } };
const rwItem = (name, pred) => ({ ...gen(x => x.rarity === "common" && pred(x) && I.socketCount(x) === RW(name).runes.length), gems: RW(name).runes.map(k => ["rune", k]) });
const sword = rwItem("선견지명", x => x.type === "longsword"), char = rwItem("카리스마", x => x.type === "longsword"), shield = rwItem("도원결의", x => x.type === "shield");
const head = rwItem("기억", x => x.slot === "head"), chest = rwItem("몰래", x => x.slot === "chest");
check("early farm: 기억 + 몰래 + 선견지명 + 도원결의 = 아이템 발견 100%", I.totals([head, chest, sword, shield]).stats.mf === 100 && I.totals([head, chest, char, shield]).stats.mf === 100);
const tmp = path.join(path.dirname(new URL(import.meta.url).pathname), "php", "farmrw.json");
fs.writeFileSync(tmp, JSON.stringify([sword, char, shield]));
const phpOut = execFileSync("php", ["-r", `require "${REPO}/ranking-php/rules.php"; $c = json_decode(file_get_contents("${tmp}"), true); echo json_encode(array_map(fn($x) => [r_runeword_of($x)["name"], r_runeword_of($x)["special"], r_runeword_stats($x)], $c), JSON_UNESCAPED_UNICODE);`]).toString();
const jsOut = JSON.stringify([sword, char, shield].map(x => [I.runewordOf(x).name, I.runewordOf(x).special, I.runewordStats(x)]));
check("PHP mirror: same runeword, special, stats", phpOut === jsOut, phpOut + " vs " + jsOut);

// ---- 게임 ----
const MAP_W = 32, MAP_H = 24;
const map = Array.from({ length: MAP_H }, (_, y) => Array.from({ length: MAP_W }, (_, x) => (x === 0 || y === 0 || x === MAP_W - 1 || y === MAP_H - 1 ? 0 : 1)));
const lv = (d, rid, z, enemies = [], extra = {}) => { const mm = map.map(r => r.slice()); mm[20][28] = 2; return JSON.stringify({ rid, d, z, turn: 0, map: mm.map(r => r.join("")).join(""), seen: "1".repeat(MAP_W * MAP_H), px: 10, py: 10, shop: null, enemies, items: [], ...extra }); };
const eqOf = (...its) => { const e = Object.fromEntries(I.SLOTS.map(s => [s, null])); for (const it of its) e[it.slot] = it; return e; };
const inv = (...eq) => JSON.stringify({ bag: [], equip: eqOf(...eq), log: [], stones: 0 });
const save = (d, rid, run = {}) => JSON.stringify({ v: 1, f50: 1, season: 4, best: 50, clr: 1, nb: 50, nclr: 1, hb: d, run: { d, hp: 5000, mh: 9e6, a: 30, g: 500, l: 40, x: 0, xn: 1e12, rid, k: 0, pp: 0, z: "hell", ...run } });
const mob = (x, y, extra = {}) => ({ x, y, ...M.makeHell(M.MONSTERS.at(-1), "normal", 5, "fire"), hp: 1e7, maxHp: 1e7, atk: 1, def: 0, el: null, res: { fire: 0, ice: 0, bolt: 0 }, ...extra });
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
    localStorage.setItem("rl_device_id", dev); for (const k of ["rl_notice_v4", "rl_notice_75", "rl_notice_1021g", "rl_notice_1021h", "rl_notice_1021i", "rl_notice_1021j", "rl_notice_1022a", "rl_notice_1022b", "rl_notice_1023a", "rl_notice_1023b", "rl_notice_1023c", "rl_notice_1023d", "rl_notice_1025a"]) localStorage.setItem(`${k}:g:${dev}`, "1");
    for (const [k, v] of Object.entries(seed)) localStorage.setItem(k.replace("DEV", dev), v);
    window.__log = []; document.addEventListener("DOMContentLoaded", () => new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => window.__log.push(n.textContent)))).observe(document.getElementById("log"), { childList: true })); }, [seed, dev]);
  await page.goto(ORIGIN); await sleep(450);
  return { ctx, page, errors };
}
const logs = (page) => page.evaluate(() => window.__log.join("\n"));
const stored = (page, k) => page.evaluate(k => JSON.parse(localStorage.getItem(k) || "null"), k);
const press = async (page, k, n = 1) => { for (let i = 0; i < n; i++) { await page.keyboard.press(k); await sleep(40); } };
try {
  // 1. 선견지명 회전 베기: 주변 3마리 모두 맞음, 흡혈로 HP 회복, HUD 표시
  let { ctx, page, errors } = await open("farmrw-a", { rl_save: save(5, "frA"), rl_level: lv(5, "frA", "hell", [mob(11, 10), mob(9, 9), mob(10, 11)]), "rl_inv:g:DEV": inv(sword, shield) });
  const hp0 = (await stored(page, "rl_save")).run.hp;
  await press(page, "."); await sleep(200);
  let L = await stored(page, "rl_level"), lg = await logs(page);
  check("회전 베기: 3 adjacent monsters all hit, log 🌀", lg.includes("🌀 회전 베기! 3마리") && L.enemies.every(e => e.hp < 1e7) && (lg.match(/회전 베기: /g) || []).length === 3, lg.slice(-500));
  check("회전 베기 lifesteal heals", (await page.evaluate(() => +document.getElementById("hp").innerText.split("/")[0])) > hp0, `${hp0}`);
  check("HUD: 🌀 회전 베기 cooldown", (await page.locator("#status").innerText()).includes("🌀 회전 베기 "), await page.locator("#status").innerText());
  await press(page, "i"); await sleep(150);
  const sum = await page.locator("#inv-summary").textContent();
  check("stats tab: 회전 베기 · 반격 lines, 아이템 발견 +50%", sum.includes("회전 베기: 2턴마다 주변 8칸") && sum.includes("반격: 방패로 막으면") && sum.includes("🔍 아이템 발견 +50%"), sum.slice(0, 700));
  check("no page errors (whirl)", errors.length === 0, errors.join("; "));
  await ctx.close();
  // 2. 도원결의 반격: 막으면 그 몬스터에게 반격 (Math.random을 0.01로 고정 → 늘 막음)
  ({ ctx, page, errors } = await open("farmrw-b", { rl_save: save(5, "frB"), rl_level: lv(5, "frB", "hell", [mob(11, 10, { atk: 500 })]), "rl_inv:g:DEV": inv(gen(x => x.type === "longsword" && x.rarity === "legendary"), shield) }));
  await page.evaluate(() => { Math.random = () => 0.01; });
  await press(page, "."); await sleep(200);
  lg = await logs(page);
  check("반격: parry → 🛡 반격 hit on the attacker", lg.includes("방패로 막아냈다") && lg.includes("🛡 반격: "), lg.slice(-400));
  check("no page errors (counter)", errors.length === 0, errors.join("; "));
  await ctx.close();
  // 3. 카리스마 처치 폭발: 약한 몬스터(최대 HP 10000)를 쓰러뜨리면 주변이 2000씩 맞음 → 이어서 터짐
  ({ ctx, page, errors } = await open("farmrw-c", { rl_save: save(5, "frC"), rl_level: lv(5, "frC", "hell", [mob(11, 10, { hp: 1, maxHp: 10000 }), mob(12, 10, { hp: 1500, maxHp: 10000 }), mob(13, 10, { hp: 1500, maxHp: 1500 }), mob(14, 10, { hp: 1e7 })]), "rl_inv:g:DEV": inv(char, shield) }));
  await press(page, "ArrowRight"); await sleep(250);
  L = await stored(page, "rl_level"); lg = await logs(page);
  const far = L.enemies.find(e => e.maxHp === 1e7);
  check("처치 폭발 chains: 3 monsters die (2000, then 2000, then 300 to the far one)", L.enemies.length === 1 && far && far.hp === 1e7 - 300 && (lg.match(/💥 처치 폭발!/g) || []).length === 3, JSON.stringify(L.enemies.map(e => [e.x, e.hp])) + lg.slice(-300));
  check("no page errors (blast)", errors.length === 0, errors.join("; "));
  await page.screenshot({ path: `${OUT}/farmrw-blast.png` });
  await ctx.close();
  // 4. 추천 탭 🔍 파밍: 부위별 파밍 장비, 착용 중 ✓ · 가방에 있음 · 얻는 곳
  ({ ctx, page, errors } = await open("farmrw-d", { rl_save: save(5, "frD"), rl_level: lv(5, "frD", "hell"), "rl_inv:g:DEV": JSON.stringify({ bag: [sword], equip: eqOf(head, chest), log: [], stones: 0 }) }));
  await press(page, "i"); await sleep(150);
  await page.locator(".inv-tab[data-tab=guide]").click(); await sleep(150);
  check("guide tiers: 일반 · 나이트메어 · 헬 · 🔍 파밍", (await page.locator(".guide-tier").allInnerTexts()).join() === "일반,나이트메어,헬,🔍 파밍");
  await page.locator(".guide-tier", { hasText: "파밍" }).click(); await sleep(150);
  const fg = await page.locator("#inv-guide").innerText();
  check("파밍 추천: 아이템 발견 50 / 150% (most gear can give), two builds", fg.includes("🔍 파밍 추천 (아이템 발견 50 / 150%)") && fg.includes("초반 파밍") && fg.includes("후반 파밍"), fg.slice(0, 400));
  check("파밍 추천: 기억·몰래 ✓ 착용 중, 선견지명 가방에 있음, 도원결의 rune recipe, 여의 반지 boss", /룬워드 기억 \+25% · ✓ 착용 중/.test(fg) && /룬워드 몰래 \+25% · ✓ 착용 중/.test(fg) && /룬워드 선견지명 \+25% · 가방에 있음/.test(fg)
    && fg.includes(`룬워드 도원결의 +25% · 커먼 방패 홈 4개 이상에 ${RW("도원결의").runes.map(k => I.RUNES[k].name).join("·")} 룬`) && fg.includes("✦ 여의 반지 +15% · 헬 30층 이무기") && fg.includes("🏆 파밍 조합 자세히"), fg);
  check("파밍 추천: 2nd 여의 반지 row also listed (two ring rows)", (fg.match(/여의 반지 \+15%/g) || []).length === 2);
  await page.screenshot({ path: `${OUT}/farm-guide.png` });
  check("no page errors (farm guide)", errors.length === 0, errors.join("; "));
  await ctx.close();
} finally { await browser.close(); }
const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
