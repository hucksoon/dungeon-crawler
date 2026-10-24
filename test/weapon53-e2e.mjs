// dc#53: 치유 삭제, 장검 기본 공격 ×2, 여의주 검 체인이 혼자 남은 적도 다시 침, 업경대 막아도 반사
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
check("치유 removed: 11 runewords", I.RUNEWORDS.length === 11 && !I.RUNEWORDS.some(w => w.name === "치유"));
check("LONGSWORD.hitMul 2", I.LONGSWORD.hitMul === 2);
const gen = (pred, tag = "j30", lvl = 155) => { for (let i = 0; ; i++) { const it = I.generate(`w53${i}|${tag}|k${i}`, "boss", lvl); if (pred(it)) return it; } };
const findU = (k) => { const U = I.UNIQUE.items[k]; for (let i = 0; ; i++) { const it = I.generateUnique(`w53u${k}${i}|j${U.boss}|u${i}`, 125 + U.boss); if (it.uq === k) return it; } };
const ls = gen(x => x.type === "longsword" && x.rarity === "legendary"), sh = gen(x => x.type === "shield" && x.rarity === "legendary"), dg = gen(x => x.slot === "weapon" && x.type === "dagger" && x.rarity === "legendary");
const yeouiju = findU("yeouiju"), mirror = findU("mirror");
check("totals: longsword flag only with a longsword", I.totals([ls, sh]).stats.longsword === 1 && !I.totals([dg]).stats.longsword && I.totals([yeouiju]).stats.longsword === 1);
check("unique texts: 여의주 검 hits the same monster again, 업경대 reflects when blocked", I.UNIQUE.items.yeouiju.text.includes("같은 몬스터를 다시 침") && I.UNIQUE.items.mirror.text.includes("막아도"));
const phpOut = execFileSync("php", ["-r", `require "${REPO}/ranking-php/rules.php"; echo json_encode(array_column(R_RUNEWORDS, "name"), JSON_UNESCAPED_UNICODE);`]).toString();
check("PHP runewords = JS runewords (no 치유)", phpOut === JSON.stringify(I.RUNEWORDS.map(w => w.name)), phpOut);

// ---- 게임 ----
const MAP_W = 32, MAP_H = 24;
const map = Array.from({ length: MAP_H }, (_, y) => Array.from({ length: MAP_W }, (_, x) => (x === 0 || y === 0 || x === MAP_W - 1 || y === MAP_H - 1 ? 0 : 1)));
const lv = (d, rid, z, enemies = [], extra = {}) => { const mm = map.map(r => r.slice()); mm[20][28] = 2; return JSON.stringify({ rid, d, z, turn: 0, map: mm.map(r => r.join("")).join(""), seen: "1".repeat(MAP_W * MAP_H), px: 10, py: 10, shop: null, enemies, items: [], ...extra }); };
const eqOf = (...its) => { const e = Object.fromEntries(I.SLOTS.map(s => [s, null])); for (const it of its) e[it.slot] = it; return e; };
const inv = (...eq) => JSON.stringify({ bag: [], equip: eqOf(...eq), log: [], stones: 0 });
const save = (d, rid, run = {}) => JSON.stringify({ v: 1, season: 4, best: 75, clr: 1, nb: 50, nclr: 1, hb: d, run: { d, hp: 5000, mh: 9e6, a: 30, g: 500, l: 40, x: 0, xn: 1e12, rid, k: 0, pp: 0, z: "hell", ...run } });
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
    localStorage.setItem("rl_device_id", dev); for (const k of ["rl_notice_v4", "rl_notice_75", "rl_notice_1021g", "rl_notice_1021h", "rl_notice_1021i", "rl_notice_1021j", "rl_notice_1022a", "rl_notice_1022b", "rl_notice_1023a", "rl_notice_1023b", "rl_notice_1023c", "rl_notice_1023d"]) localStorage.setItem(`${k}:g:${dev}`, "1");
    for (const [k, v] of Object.entries(seed)) localStorage.setItem(k.replace("DEV", dev), v);
    window.__log = []; document.addEventListener("DOMContentLoaded", () => new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => window.__log.push(n.textContent)))).observe(document.getElementById("log"), { childList: true })); }, [seed, dev]);
  await page.goto(ORIGIN); await sleep(450);
  return { ctx, page, errors };
}
const logs = (page) => page.evaluate(() => window.__log.join("\n"));
const stored = (page, k) => page.evaluate(k => JSON.parse(localStorage.getItem(k) || "null"), k);
const press = async (page, k, n = 1) => { for (let i = 0; i < n; i++) { await page.keyboard.press(k); await sleep(40); } };
try {
  // 1. 장검: 기본 공격 ×2 (Math.random 0.99 → 치명타·패링 없음)
  let { ctx, page, errors } = await open("w53-a", { rl_save: save(5, "w53A"), rl_level: lv(5, "w53A", "hell", [mob(11, 10)]), "rl_inv:g:DEV": inv(ls, sh) });
  await page.evaluate(() => { Math.random = () => 0.99; });
  const atk = +(await page.locator("#atk").innerText());
  await press(page, "ArrowRight"); await sleep(200);
  let lg = await logs(page);
  const dmg = +((lg.match(/에게 (\d+) 피해!/) || [])[1] || 0);
  check("longsword hit ≈ 2 × attack", dmg >= atk * 1.95 && dmg <= atk * 2.6, `atk ${atk} dmg ${dmg}`);
  await press(page, "i"); await sleep(150);
  check("stats tab: 장검: 기본 공격 피해 ×2", (await page.locator("#inv-summary").textContent()).includes("장검: 기본 공격 피해 ×2"));
  check("no page errors (longsword)", errors.length === 0, errors.join("; "));
  await ctx.close();
  // 2. 여의주 검: 몬스터가 하나뿐이어도 체인이 그 몬스터를 여러 번
  ({ ctx, page, errors } = await open("w53-b", { rl_save: save(5, "w53B"), rl_level: lv(5, "w53B", "hell", [mob(12, 10)]), "rl_inv:g:DEV": inv(yeouiju, sh) }));
  await press(page, " "); await sleep(200);
  lg = await logs(page);
  const n = +((lg.match(/체인 라이트닝! (\d+)번 튕겨/) || [])[1] || 0);
  check("여의주 검: one monster, chain hits it strikes+2 times", n === I.CHAIN.strikes + 2, lg.slice(-300));
  check("no page errors (yeouiju)", errors.length === 0, errors.join("; "));
  await ctx.close();
  // 3. 업경대: 막아도 반사 (Math.random 0.01 → 늘 막음)
  ({ ctx, page, errors } = await open("w53-c", { rl_save: save(5, "w53C"), rl_level: lv(5, "w53C", "hell", [mob(11, 10, { atk: 50000 })]), "rl_inv:g:DEV": inv(ls, mirror) }));
  await page.evaluate(() => { Math.random = () => 0.01; });
  await press(page, " "); await sleep(200);
  lg = await logs(page);
  const L = await stored(page, "rl_level");
  check("업경대: parried hit still reflects (업보: 막은 …)", lg.includes("방패로 막아냈다") && lg.includes("업보: 막은") && L.enemies[0].hp < 1e7, lg.slice(-300));
  check("no page errors (mirror)", errors.length === 0, errors.join("; "));
  await ctx.close();
} finally { await browser.close(); }
const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
