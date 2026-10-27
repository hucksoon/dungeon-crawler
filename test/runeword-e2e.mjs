// 룬워드 효과: 이름·색·상세, 능력치(단계 배율)·주 능력치 레전더리 수준, 전투 특수 효과(불사·텔레포트·보호막·포션 자동·약한 파이어볼·스킬 흡혈·스킬 더 자주·속성 저항 감소·체인), 서버
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import fs from "node:fs"; import path from "node:path";
const require = createRequire(process.env.NODE_PATH + "/");
const { chromium } = require("playwright");
const REPO = process.argv[2], OUT = process.argv[3];
const I = createRequire(import.meta.url)(path.join(REPO, "items.js"));
// 서버는 아이템 값만 보냄 (dc#97): 참조로 다시 만든 이름 (서버가 이름 글자를 보내면 실패)
const nameOf = (v) => (v?.ref && !("name" in v) ? I.itemName(I.fromRef(v.ref, { gems: true })) : null);
const ORIGIN = "https://game.apacimtest.com/";
const results = []; const check = (n, ok, x = "") => { results.push(!!ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x && !ok ? " — " + x : ""}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const DIR = path.dirname(new URL(import.meta.url).pathname) + "/php";
const DB = path.join(DIR, "runewords.sqlite"); for (const f of [DB, DB + "-wal", DB + "-shm"]) fs.rmSync(f, { force: true });
const CFG = path.join(DIR, "config.runewords.php");
fs.writeFileSync(CFG, `<?php\n$c = require __DIR__ . '/config.test.php';\nreturn array_merge($c, ['db_dsn' => 'sqlite:${DB}']);\n`);
const php = spawn("php", ["-S", "127.0.0.1:8120", "-t", path.join(REPO, "ranking-php")], { env: { ...process.env, RANKING_CONFIG: CFG, TEST_JWT_SECRET: "rw" }, stdio: ["ignore", "ignore", "pipe"] });
let phpErr = ""; php.stderr.on("data", d => phpErr += d);
await sleep(700);

// ---- 아이템 ----
const find = (pre, pred, lvl = 100) => { for (let i = 0; i < 3000000; i++) { const it = I.generate(`${pre}|k${i}`, "boss", lvl); if (pred(it)) return it; } throw new Error("nf " + pre); };
const KIND = { chest: (it) => it.slot === "chest", head: (it) => it.slot === "head", shield: (it) => it.type === "shield", longsword: (it) => it.type === "longsword", weapon: (it) => it.slot === "weapon" && it.type === "dagger", staff: (it) => it.slot === "weapon" && it.type === "staff" };
const rw = (name, base, tier = "n40", lvl = 100) => { const w = I.RUNEWORDS.find(x => x.name === name); base ||= w.bases[0];
  const b = find(`rwt${w.rank}${base}|${tier}`, x => x.rarity === "common" && I.socketCount(x) === w.runes.length && KIND[base](x), lvl);
  return { ...b, gems: w.runes.map(k => ["rune", k]) }; };
// ---- 규칙 ----
const ch = rw("천하무적"), chD = rw("천하무적", "chest", "d70");
check("runewordOf: complete runeword, not when a rune is missing", I.runewordOf(ch)?.name === "천하무적" && !I.runewordOf({ ...ch, gems: ch.gems.slice(0, 3) }));
check("stats by tier: nightmare ×0.75, normal ×0.5 (35 → 26 / 18)", I.runewordStats(ch).atkPct === 26 && I.runewordStats(chD).atkPct === 18 && I.itemTier(chD) === "normal");
const mk = I.mainStatsOf(ch)[0], raw = ch.main[0];
const leg = I.mainRange(mk[0], { ...ch, rarity: "legendary" }), com = I.mainRange(raw[0], ch);
check("main stats at legendary level (same place in the range)", mk[1] >= leg[0] && mk[1] <= leg[1] && JSON.stringify(I.statRange(ch, "main", mk[0])) === JSON.stringify(leg) && (raw[1] === com[1] ? mk[1] === leg[1] : true), JSON.stringify([raw, mk, com, leg]));
check("name: '천하무적' (+10 천하무적), gold color", I.itemName(ch) === "천하무적" && I.itemName({ ...ch, enh: 10 }) === "+10 천하무적" && I.RUNEWORD_COLOR === "#ffd27f");
const T2 = I.totals([rw("카리스마"), rw("기억")]);
check("same special doesn't stack: lsCap 카리스마 3 + 기억 2 → +3 (cap 23)", T2.stats.lsCap === 23 && T2.runewords.special.lsCap === 3 && T2.runewords.names.join() === "카리스마,기억");
const T3 = I.totals([rw("태산", "chest"), rw("선견지명")]);
check("shield: 태산 20% (선견지명 is 회전 베기 now, dc#52)", T3.runewords.special.shield === 20 && T3.runewords.special.whirl === 50);
check("필살일격 gives splash, 폭풍전야 gives chain without a set", I.totals([rw("필살일격")]).stats.splash === 1 && I.totals([rw("폭풍전야")]).stats.chain === 1);
check("도원결의: parry +15·lifesteal +5·HP +15%·발견 +25 at hell level (nightmare 11·4·11·19)", JSON.stringify(I.runewordStats(rw("도원결의"))) === JSON.stringify({ allRes: 8, dmgReduce: 4, parry: 11, lifesteal: 4, hpPct: 11, mf: 19 }), JSON.stringify(I.runewordStats(rw("도원결의"))));

// ---- 게임 ----
const MAP_W = 32, MAP_H = 24;
const map = Array.from({ length: MAP_H }, (_, y) => Array.from({ length: MAP_W }, (_, x) => (x === 0 || y === 0 || x === MAP_W - 1 || y === MAP_H - 1 ? 0 : 1)));
const lv = (d, rid, z, enemies = [], extra = {}) => { const mm = map.map(r => r.slice()); mm[20][28] = 2; return JSON.stringify({ rid, d, z, turn: 0, map: mm.map(r => r.join("")).join(""), seen: "1".repeat(MAP_W * MAP_H), px: 10, py: 10, shop: null, enemies, items: [], ...extra }); };
const save = (d, rid, run = {}) => JSON.stringify({ v: 1, f50: 1, season: 4, best: 50, clr: 1, nb: 50, nclr: 1, run: { d, hp: 3000, mh: 3000, a: 30, g: 500, l: 40, x: 0, xn: 1e12, rid, k: 0, pp: 0, z: "nm", ...run } });
const eqOf = (...its) => { const e = Object.fromEntries(I.SLOTS.map(s => [s, null])); for (const it of its) e[it.slot] = it; return e; };
const foe = (x, y, extra = {}) => ({ x, y, id: "titan", ch: "I", name: "악몽의 타이탄", color: "#fdd835", kind: "normal", hp: 1e9, maxHp: 1e9, atk: 0, def: 0, xp: 1, nm: 1, ...extra });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
async function open(dev, seed, api = false) {
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
const hp = async (page) => (await stored(page, "rl_save")).run.hp;
const inv = (...eq) => JSON.stringify({ bag: [], equip: eqOf(...eq), log: [], stones: 0 });
try {
  // 1. 천하무적: 이름·상세, 텔레포트(보이는 적 없음 → 3칸, 지나가는 칸의 아이템), 불사(층마다 1번)
  let { ctx, page, errors } = await open("rwtest-a", { rl_save: save(30, "rwA"), rl_level: lv(30, "rwA", "nm", [], { items: [{ x: 11, y: 10, type: "gem", gem: "ruby", grade: 0 }, { x: 12, y: 10, type: "gem", gem: "topaz", grade: 1 }] }), "rl_inv:g:DEV": inv({ ...ch, enh: 3 }) });
  await press(page, "ArrowRight"); await sleep(150);
  let L = await stored(page, "rl_level"), Ii = await stored(page, "rl_inv:g:rwtest-a");
  check("teleport: one key press → 3 tiles, picks up items on the way", L.px === 13 && L.py === 10 && Ii.gems?.ruby?.[0] === 1 && Ii.gems?.topaz?.[1] === 1, JSON.stringify([L.px, Ii.gems]));
  await press(page, "i"); await sleep(150);
  await page.locator("#inv-equip .slot", { hasText: "가슴" }).click(); await sleep(150);
  const d = await page.locator("#inv-detail").innerText();
  check("detail: gold name +3 천하무적, ✦ 룬워드 1위 section with stats ×0.75 and specials", d.includes("+3 천하무적") && d.includes("✦ 룬워드 1위 천하무적 (차·하·마·자)") && d.includes("악몽의 아이템이라 능력치 75%") && d.includes("✦ 공격력 +26%") && d.includes("✦ 불사:") && d.includes("✦ 텔레포트:"), d);
  check("stats tab lists the runeword and its specials", (await page.locator("#inv-summary").textContent()).includes("✦ 룬워드: 천하무적"));
  await press(page, "Escape"); await ctx.close();
  // 적이 보이면 1칸
  ({ ctx, page, errors } = await open("rwtest-b", { rl_save: save(30, "rwB"), rl_level: lv(30, "rwB", "nm", [foe(15, 10)]), "rl_inv:g:DEV": inv(ch) }));
  await press(page, "ArrowRight"); await sleep(150);
  check("teleport: an enemy in sight → normal 1 tile", (await stored(page, "rl_level")).px === 11);
  await ctx.close();
  // 불사
  ({ ctx, page, errors } = await open("rwtest-c", { rl_save: save(30, "rwC", { hp: 50 }), rl_level: lv(30, "rwC", "nm", [foe(11, 10, { atk: 1e7 })]), "rl_inv:g:DEV": inv(ch) }));
  await press(page, "."); await sleep(200);
  check("undying: lethal hit → HP 1, still alive, log", (await hp(page)) === 1 && (await logs(page)).includes("천하무적: 쓰러질 피해를 버텨냈다") && await page.locator("#death-modal").isHidden().catch(() => true));
  await press(page, "."); await sleep(250);
  check("undying only once per floor: next lethal hit kills", (await logs(page)).includes("쓰러졌다"), await logs(page));
  check("no page errors (천하무적)", errors.length === 0, errors.join("; "));
  await ctx.close();

  // 2. 태산(갑옷) 보호막: 2턴마다 최대 HP 20%가 먼저 막음
  ({ ctx, page, errors } = await open("rwtest-d", { rl_save: save(30, "rwD", { hp: 3000 }), rl_level: lv(30, "rwD", "nm", [foe(11, 10, { atk: 400 })]), "rl_inv:g:DEV": inv(rw("태산", "chest")) }));
  await press(page, ".", 3); await sleep(200);
  check("shield: monster hits absorbed (보호막이 … 막음)", (await logs(page)).includes("보호막이") && (await page.locator("#skill-hud, #hud, body").first().innerText()).length > 0, await logs(page));
  check("no page errors (태산)", errors.length === 0, errors.join("; "));
  await ctx.close();

  // 3. 치유는 없어짐 (dc#53): 예전 치유 투구(차·아 룬)는 룬워드가 아니고 룬 효과만
  const oldChiyu = { ...find("rwchiyu|n40", x => x.rarity === "common" && x.slot === "head" && I.socketCount(x) === 2), gems: [["rune", 9], ["rune", 7]] };
  check("치유 removed: old 차·아 helm is not a runeword, runes still give their own stats", !I.runewordOf(oldChiyu) && !I.RUNEWORDS.some(w => w.name === "치유") && Object.keys(I.gemStats(oldChiyu)).length > 0);
  // 4. 나무(지팡이) 약한 파이어볼 + 몰래(스킬 흡혈) + 마음가짐 없이 3턴마다
  ({ ctx, page, errors } = await open("rwtest-f", { rl_save: save(30, "rwF", { hp: 500, mh: 3000, a: 5000 }), rl_level: lv(30, "rwF", "nm", [foe(12, 10)]), "rl_inv:g:DEV": inv(rw("나무"), rw("몰래")) }));
  const hf0 = await hp(page);
  await press(page, ".", 3); await sleep(200);
  const lg = await logs(page);
  check("나무: weak fireball without the fire set", lg.includes("🔥 파이어볼!"), lg);
  check("몰래: skill damage heals (lifesteal on set skills)", (await hp(page)) > hf0, `${hf0} → ${await hp(page)}`);
  await press(page, "i"); await sleep(150);
  check("stats: 파이어볼(나무) every 3 turns", (await page.locator("#inv-summary").textContent()).includes("파이어볼(나무): 3턴마다"));
  await ctx.close();
  // 마음가짐: 1턴 더 자주 (나무 파이어볼 3 → 2턴)
  ({ ctx, page, errors } = await open("rwtest-g", { rl_save: save(30, "rwG"), rl_level: lv(30, "rwG", "nm"), "rl_inv:g:DEV": inv(rw("나무"), rw("마음가짐", "shield")) }));
  await press(page, "i"); await sleep(150);
  check("마음가짐 on a shield: skills 1 turn sooner (나무 fireball every 2)", (await page.locator("#inv-summary").textContent()).includes("파이어볼(나무): 2턴마다"));
  await ctx.close();

  // 5. 폭풍전야: 체인 라이트닝 + 2턴마다 주변 몬스터 속성 저항 −20% → 속성 피해 ×1.2
  const sd = rw("폭풍전야");
  ({ ctx, page, errors } = await open("rwtest-h", { rl_save: save(30, "rwH", { a: 1000 }), rl_level: lv(30, "rwH", "nm", [foe(11, 10), foe(12, 10, { name: "B" }), foe(14, 10, { name: "C" })]), "rl_inv:g:DEV": inv(sd) }));
  await press(page, ".", 2); await sleep(200);
  L = await stored(page, "rl_level");
  check("폭풍전야: chain lightning fires without the bolt set", (await logs(page)).includes("⚡ 체인 라이트닝!"));
  const byName = (n) => L.enemies.find(e => e.name === n);
  check("폭풍전야: monsters within 2 tiles get −20% element resistance (not 4 tiles away)", L.enemies[0].vulnPct === 20 && L.enemies[0].vulnUntil > 0 && byName("B")?.vulnPct === 20 && !byName("C")?.vulnPct, JSON.stringify(L.enemies.map(e => [e.name, e.x, e.vulnPct])));
  check("no page errors (폭풍전야)", errors.length === 0, errors.join("; "));
  await ctx.close();
} finally { await browser.close(); }

// ---- 서버 ----
try {
  const ORIGIN_H = ORIGIN.slice(0, -1);
  const post = (guest, body) => fetch("http://127.0.0.1:8120/api.php?r=score", { method: "POST", headers: { "Content-Type": "application/json", Origin: ORIGIN_H, "X-Guest-Id": guest }, body: JSON.stringify(body) }).then(r => r.json());
  const me = (guest) => fetch(`http://127.0.0.1:8120/api.php?r=me`, { headers: { Origin: ORIGIN_H, "X-Guest-Id": guest } }).then(r => r.json());
  const player = async (guest) => (await fetch(`http://127.0.0.1:8120/api.php?r=player&id=${(await me(guest)).id}`, { headers: { Origin: ORIGIN_H } })).json();
  const c2 = rw("천하무적", "chest", "d60", 60);   // 서버는 층(d60)과 레벨을 맞춰 봄
  const ref = (it) => ({ seed: it.seed, src: it.src, lvl: it.lvl, v: it.v, enh: 0, id: it.id, r: it.r, g: it.gems });
  await post("rw-guest-01", { stage: 70, plvl: 40, gear: [ref(c2)] });
  const p = await player("rw-guest-01"), c = p.gear?.items?.find(x => x.slot === "chest");
  const js = I.totals([c2]).stats;
  check("server: runeword chest named 천하무적, runeword field, stats match the game", nameOf(c) === "천하무적" && !("runeword" in c) && p.gear.stats.def === Math.round(js.def * (1 + js.defPct / 100)), JSON.stringify([nameOf(c), c?.runeword, p.gear?.stats?.def, js.def, js.defPct]));
} finally { php.kill(); }
check("no php errors", !/Fatal|Warning|Notice|Deprecated/.test(phpErr), phpErr.slice(0, 400));
const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
