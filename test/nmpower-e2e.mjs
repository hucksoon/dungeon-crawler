// 나이트메어 아이템의 힘: 주 능력치 공격력·방어력·최대 HP ×3 (효과·화면·서버), 나이트메어 몬스터 층마다 9%
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

// ---- 서버 ----
const DIR = path.dirname(new URL(import.meta.url).pathname) + "/php";
const DB = path.join(DIR, "nmp.sqlite"); for (const f of [DB, DB + "-wal", DB + "-shm"]) fs.rmSync(f, { force: true });
const CFG = path.join(DIR, "config.nmp.php");
fs.writeFileSync(CFG, `<?php\n$c = require __DIR__ . '/config.test.php';\nreturn array_merge($c, ['db_dsn' => 'sqlite:${DB}']);\n`);
const php = spawn("php", ["-S", "127.0.0.1:8109", "-t", path.join(REPO, "ranking-php")], { env: { ...process.env, RANKING_CONFIG: CFG, TEST_JWT_SECRET: "nmp" }, stdio: ["ignore", "ignore", "pipe"] });
let phpErr = ""; php.stderr.on("data", d => phpErr += d);
await sleep(700);

const MAP_W = 32, MAP_H = 24;
const map = Array.from({ length: MAP_H }, (_, y) => Array.from({ length: MAP_W }, (_, x) => (x === 0 || y === 0 || x === MAP_W - 1 || y === MAP_H - 1 ? 0 : 1)));
const lv = (d, rid, z, enemies = [], extra = {}, stairs = [28, 20]) => { const mm = map.map(r => r.slice()); mm[stairs[1]][stairs[0]] = 2; return JSON.stringify({ rid, d, z, turn: 0, map: mm.map(r => r.join("")).join(""), seen: "1".repeat(MAP_W * MAP_H), px: 10, py: 10, shop: null, enemies, items: [], ...extra }); };
const save = (d, rid, run = {}) => JSON.stringify({ v: 1, season: 4, best: 75, clr: 1, nb: 10, run: { d, hp: 300, mh: 1000, a: 30, g: 500, l: 40, x: 0, xn: 1e12, rid, k: 0, pp: 0, ...run } });
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
    const res = await fetch(`http://127.0.0.1:8109/api.php${u.search}`, { method: req.method(), headers: { ...req.headers(), origin: ORIGIN.slice(0, -1) }, body: req.method() === "GET" ? undefined : req.postData() });
    r.fulfill({ status: res.status, headers: { "content-type": "application/json", "access-control-allow-origin": "*" }, body: await res.text() }); });
  await ctx.route("https://login.xsolla.com/**", r => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await ctx.addInitScript(([seed, dev]) => { window.__shift = Number(sessionStorage.getItem("shift") || 0); const _now = Date.now; Date.now = () => _now() + window.__shift;
    if (sessionStorage.getItem("seeded")) return; sessionStorage.setItem("seeded", 1); sessionStorage.setItem("rl_scene", "dungeon");
    localStorage.setItem("rl_device_id", dev); localStorage.setItem(`rl_notice_v4:g:${dev}`, "1"); localStorage.setItem(`rl_notice_75:g:${dev}`, "1"); localStorage.setItem(`rl_notice_1019:g:${dev}`, "1"); localStorage.setItem(`rl_notice_1020:g:${dev}`, "1"); localStorage.setItem(`rl_notice_1020b:g:${dev}`, "1"); localStorage.setItem(`rl_notice_1020c:g:${dev}`, "1"); localStorage.setItem(`rl_notice_1021:g:${dev}`, "1");
    for (const [k, v] of Object.entries(seed)) localStorage.setItem(k.replace("DEV", dev), v);
    window.__log = []; document.addEventListener("DOMContentLoaded", () => new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => window.__log.push(n.textContent)))).observe(document.getElementById("log"), { childList: true })); }, [seed, dev]);
  await page.goto(ORIGIN); await sleep(450);
  return { ctx, page, errors };
}
const logs = (page) => page.evaluate(() => (window.__log || []).join("\n"));
const level = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("rl_level")));
const press = async (page, k, n = 1) => { for (let i = 0; i < n; i++) { await page.keyboard.press(k); await sleep(30); } };
const saveN = (rid, extra = {}) => JSON.stringify({ v: 1, season: 4, best: 75, clr: 1, nb: 10, run: { d: 5, hp: 3000, mh: 3000, a: 30, g: 0, l: 40, x: 0, xn: 1e12, rid, k: 0, pp: 0, z: "nm", ...extra } });
const find = (pre, pred, lvl) => { for (let i = 0; i < 200000; i++) { const it = I.generate(`${pre}|k${i}`, "golden", lvl); if (pred(it)) return it; } throw new Error("nf"); };
const nmArmor = find("nmp|n5", it => it.slot === "chest" && it.rarity === "legendary" && I.mainStatsOf(it).some(([k]) => k === "hp"), 80);
const nmWeapon = find("nmp|n5", it => it.slot === "weapon" && it.rarity === "legendary", 80);
const plainW = find("nmp|d75", it => it.slot === "weapon" && it.rarity === "legendary", 75);
const main = (it, k) => I.mainStatsOf(it).find(([s]) => s === k)?.[1];

// 규칙
check("rules: NM_POWER = ×3 on atk/def/hp, nightmare items only", I.NM_POWER.mul === 3 && I.NM_POWER.stats.join() === "atk,def,hp" && I.nmPower(nmWeapon, "atk") === 3 && I.nmPower(plainW, "atk") === 1 && I.nmPower(nmWeapon, "critDmg") === 1);
check("rules: enhancedBase ×3 for nightmare atk/def/hp (+0)", I.enhancedBase(nmWeapon).atk === 3 * main(nmWeapon, "atk") && I.enhancedBase(nmArmor).def === 3 * main(nmArmor, "def") && I.enhancedBase(nmArmor).hp === 3 * main(nmArmor, "hp"));
check("rules: normal items unchanged", I.enhancedBase(plainW).atk === main(plainW, "atk"));
const e10 = { ...nmWeapon, enh: 10 };
check("rules: enhancement grows from the ×3 value", I.enhancedBase(e10).atk === 3 * main(nmWeapon, "atk") + Math.max(10, Math.round(3 * main(nmWeapon, "atk") * I.ENHANCE.statPerLevel * 10)));
check("rules: % main stats not multiplied", I.mainStatsOf(nmWeapon).filter(([k]) => I.STATS[k].pct).every(([k, v]) => I.enhancedBase(nmWeapon)[k] === v));
check("rules: nightmare enhance stones ×2, ancient roll gold ×2, normal unchanged", I.enhanceCost(5, nmWeapon) === 10 && I.enhanceCost(5, plainW) === 5 && I.enhanceCost(5) === 5
  && I.ancientRerollCost(nmWeapon) === 2 * I.ancientRerollCost({ rarity: nmWeapon.rarity, lvl: nmWeapon.lvl }) && I.ancientRerollCost(plainW) === I.ancientRerollCost({ rarity: plainW.rarity, lvl: plainW.lvl }));
check("rules: nightmare gold dungeon reward = 20 nightmare ancient rolls", I.goldDungeonReward(80, 20, true) === 20 * I.ancientRerollCost({ ...nmWeapon, lvl: 80, rarity: "legendary" }));
check("monsters: nightmare floor scale 1 + 2%·k + 0.3%·k² (floor 1 = 1, floor 11 = 1.5)", M.nmScale(1) === 1 && Math.abs(M.nmScale(11) - 1.5) < 1e-9);

try {
  // 화면: 상세에 악몽의 힘, 값·범위 ×3, 장착하면 공격력이 그만큼
  const { ctx, page, errors } = await open("nmptest-a", { rl_save: saveN("nmpA"), rl_level: lv(5, "nmpA", "nm"), "rl_inv:g:DEV": JSON.stringify({ bag: [nmWeapon, plainW], equip: eqOf(), log: [], stones: 0 }) });
  const atk0 = Number(await page.locator("#atk").innerText());
  await press(page, "i"); await sleep(150);
  await page.locator(".bag-item", { hasText: I.itemName(nmWeapon) }).first().click(); await sleep(120);
  const d = await page.locator("#inv-detail").innerText();
  const r = I.statRange(nmWeapon, "main", "atk");
  check("detail: 악몽의 힘 ×3 note", d.includes("악몽의 힘: 주 능력치 공격력·방어력·최대 HP ×3"));
  check("detail: attack shown ×3 with ×3 range, no fake (강화 +N)", d.includes(`★ 공격력 +${3 * main(nmWeapon, "atk")} [${3 * r[0]}~${3 * r[1]}]`) && !/★ 공격력 [^\n]*강화/.test(d), d.split("\n").filter(l => l.includes("공격력")).join(" / "));
  check("detail: enhance +1 costs 2 stones, ancient roll shows ×2 gold", d.includes("다음 강화 +1: 성공 100% · 악몽 강화석 2개") && d.includes(`${I.ancientRerollCost(nmWeapon).toLocaleString()}골드 (보유`), d.split("\n").filter(l => l.includes("강화석") || l.includes("굴리기")).join(" / "));
  await page.locator("#inv-detail button", { hasText: "장착" }).click(); await sleep(150);
  await press(page, "Escape");
  check("equipping adds the ×3 attack", Number(await page.locator("#atk").innerText()) - atk0 >= 3 * main(nmWeapon, "atk"), `${atk0} → ${await page.locator("#atk").innerText()}`);
  await press(page, "i"); await sleep(150);
  await page.locator(".bag-item", { hasText: I.itemName(plainW) }).first().click(); await sleep(120);
  check("normal item: no 악몽의 힘 note", !(await page.locator("#inv-detail").innerText()).includes("악몽의 힘"));
  await page.screenshot({ path: path.join(OUT, "nmpower-detail.png") });
  check("no page errors", errors.length === 0, errors.join("; "));
  await ctx.close();
} finally { await browser.close(); }

// 서버: 랭킹 장비 보기도 ×3
try {
  const post = (guest, body) => fetch("http://127.0.0.1:8109/api.php?r=score", { method: "POST", headers: { "Content-Type": "application/json", Origin: ORIGIN.slice(0, -1), "X-Guest-Id": guest }, body: JSON.stringify(body) }).then(r => r.json());
  const me = (guest, season = "") => fetch(`http://127.0.0.1:8109/api.php?r=me${season ? "&season=" + season : ""}`, { headers: { Origin: ORIGIN.slice(0, -1), "X-Guest-Id": guest } }).then(r => r.json());
  const player = async (guest, season) => (await fetch(`http://127.0.0.1:8109/api.php?r=player&id=${(await me(guest, season)).id}${season ? "&season=" + season : ""}`, { headers: { Origin: ORIGIN.slice(0, -1) } })).json();
  const ref = (it) => ({ seed: it.seed, src: it.src, lvl: it.lvl, v: 4, enh: 0, id: it.id, r: it.r });
  await post("nmp-guest-0001", { stage: 76, nm: 6, plvl: 40, gear: [ref(nmWeapon), ref(nmArmor)] });
  const p = await player("nmp-guest-0001", "nm");
  const w = p.gear?.items?.find(x => x.slot === "weapon"), a = p.gear?.items?.find(x => x.slot === "chest");
  const r = I.statRange(nmWeapon, "main", "atk");
  check("server view: nightmare weapon attack ×3 with ×3 range, plus 0", w && w.main[0].k === "atk" && w.main[0].v === 3 * main(nmWeapon, "atk") && w.main[0].range === `${3 * r[0]}~${3 * r[1]}` && w.main[0].plus === 0, JSON.stringify(w?.main));
  check("server view: chest def/hp ×3", a && a.main.some(m => m.k === "def" && m.v === 3 * main(nmArmor, "def")) && a.main.some(m => m.k === "hp" && m.v === 3 * main(nmArmor, "hp")), JSON.stringify(a?.main));
  const T = I.totals([nmWeapon, nmArmor]).stats;
  check("server stats use the ×3 values (def = JS totals, atk ≥ item atk)", p.gear.stats.def === T.def && p.gear.stats.atk >= T.atk, JSON.stringify([p.gear.stats, T.atk, T.def]));
} finally { php.kill(); }
check("no php errors", !/Fatal|Warning|Notice|Deprecated/.test(phpErr), phpErr.slice(0, 400));
const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
