// 포션 무제한·쿨타임 10턴, 보물 자리(*) = 레어 이상 1개, 나이트메어 보스 공격 ×1.1
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
const DB = path.join(DIR, "pot.sqlite"); for (const f of [DB, DB + "-wal", DB + "-shm"]) fs.rmSync(f, { force: true });
const CFG = path.join(DIR, "config.pot.php");
fs.writeFileSync(CFG, `<?php\n$c = require __DIR__ . '/config.test.php';\nreturn array_merge($c, ['db_dsn' => 'sqlite:${DB}']);\n`);
const php = spawn("php", ["-S", "127.0.0.1:8103", "-t", path.join(REPO, "ranking-php")], { env: { ...process.env, RANKING_CONFIG: CFG, TEST_JWT_SECRET: "pot" }, stdio: ["ignore", "ignore", "pipe"] });
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
    const res = await fetch(`http://127.0.0.1:8103/api.php${u.search}`, { method: req.method(), headers: { ...req.headers(), origin: ORIGIN.slice(0, -1) }, body: req.method() === "GET" ? undefined : req.postData() });
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

check("rules: nightmare boss attack ×0.588 (hp ×1.44, dc#54)", M.NIGHTMARE.bossAtk === 0.588 && M.NIGHTMARE.bossHp === 1.44);
const plain = I.generate("pot|d70|k1", "golden", 70);
try {
  // 1. 포션: 무제한, 10턴마다
  let { ctx, page, errors } = await open("pottest-a", { rl_save: save(30, "potA"), rl_level: lv(30, "potA", "normal"), "rl_inv:g:DEV": inv(plain) });
  const maxHp = +(await page.locator("#hp").innerText()).split("/")[1];
  check("potion button shows ready", (await page.locator("#tp-potion").innerText()) === "포션 (준비됨)");
  await press(page, "q"); await sleep(80);
  const hp1 = +(await page.locator("#hp").innerText()).split("/")[0];
  check("drinking heals 30% of max HP and starts a 10-turn cooldown (9 left after this turn)", hp1 === Math.min(maxHp, 300 + Math.round(maxHp * 0.3)) && (await page.locator("#tp-potion").innerText()) === "포션 (9턴)", `${hp1} ${await page.locator("#tp-potion").innerText()}`);
  const t0 = (await level(page)).turn;
  await press(page, "q"); await sleep(60);
  check("drinking during cooldown: message, no turn used", (await logs(page)).includes("포션은 9턴 뒤에 다시 마실 수 있다.") && (await level(page)).turn === t0);
  await press(page, "Space", 4); await sleep(60);
  check("cooldown counts down with turns", (await page.locator("#tp-potion").innerText()) === "포션 (5턴)");
  await page.reload(); await sleep(500);
  check("cooldown survives a reload", (await page.locator("#tp-potion").innerText()) === "포션 (5턴)" && JSON.parse(await page.evaluate(() => localStorage.getItem("rl_save"))).run.pc === 5);
  await press(page, "Space", 5); await sleep(60);
  check("ready again after 10 turns, no count limit", (await page.locator("#tp-potion").innerText()) === "포션 (준비됨)");
  await press(page, "q"); await sleep(60);
  check("drink again", (await page.locator("#tp-potion").innerText()) === "포션 (9턴)");
  check("no page errors (potion)", errors.length === 0, errors.join("; "));
  await ctx.close();

  // 2. 보물(*): 레어 이상 1개, 시드 |p, 출처 golden. 예전 저장의 포션 자리도 보물
  ({ ctx, page, errors } = await open("pottest-b", { rl_save: save(30, "potB"), rl_level: JSON.stringify({ ...JSON.parse(lv(30, "potB", "normal")), items: [{ x: 11, y: 10, type: "treasure" }, { x: 12, y: 10, type: "potion" }] }), "rl_inv:g:DEV": inv(plain) }));
  await page.screenshot({ path: path.join(OUT, "pot-treasure.png") });
  await press(page, "ArrowRight"); await sleep(80);
  await press(page, "ArrowRight"); await sleep(80);
  const bag = JSON.parse(await page.evaluate(() => localStorage.getItem("rl_inv:g:pottest-b"))).bag;
  const exp0 = I.generate("potB|d30|p0", "golden", 30), exp1 = I.generate("potB|d30|p1", "golden", 30);
  check("treasure gives a rare+ item (golden table, seed |d30|p0, lvl 30, r3)", bag.length === 2 && bag[0].id === exp0.id && bag[1].id === exp1.id && bag.every(b => b.src === "golden" && b.lvl === 30 && b.r === I.RULES_REV && b.rarity !== "common" && b.rarity !== "uncommon"), JSON.stringify(bag.map(b => [b.seed, b.src, b.rarity])));
  check("treasure log", (await logs(page)).includes("보물을 발견했다!"));
  check("no page errors (treasure)", errors.length === 0, errors.join("; "));
  await ctx.close();

  // 3. 새 층: 보물 자리 1~3곳, 포션 자리는 없음
  ({ ctx, page, errors } = await open("pottest-c", { rl_save: save(30, "potC"), rl_level: lv(30, "potC", "normal", [], {}, [11, 10]), "rl_inv:g:DEV": inv(plain) }));
  await press(page, "ArrowRight"); await sleep(250);
  const L = await level(page);
  const tr = L.items.filter(i => i.type === "treasure").length;
  check(`new floor has 1~3 treasures, no potions (${tr})`, L.d === 31 && tr >= 1 && tr <= 3 && !L.items.some(i => i.type === "potion"));
  await ctx.close();

  // 4. 서버: 보물 아이템 검증 (r3만), 예전 포션 자리 드롭은 그대로
  const post = (guest, body) => fetch("http://127.0.0.1:8103/api.php?r=score", { method: "POST", headers: { "Content-Type": "application/json", Origin: ORIGIN.slice(0, -1), "X-Guest-Id": guest }, body: JSON.stringify(body) }).then(r => r.json());
  const me = (guest) => fetch(`http://127.0.0.1:8103/api.php?r=me`, { headers: { Origin: ORIGIN.slice(0, -1), "X-Guest-Id": guest } }).then(r => r.json());
  const player = async (guest) => (await fetch(`http://127.0.0.1:8103/api.php?r=player&id=${(await me(guest)).id}`, { headers: { Origin: ORIGIN.slice(0, -1) } })).json();
  const ref = (it) => ({ seed: it.seed, src: it.src, lvl: it.lvl, v: 4, enh: 0, id: it.id, r: it.r });
  const t3 = I.generate("srvrun|d30|p4", "golden", 30), t2 = I.generate("srvrun|d30|p4", "golden", 30, 4, 2), nmT = I.generate("srvrun|n8|p0", "golden", 83);
  await post("pot-guest-0001", { stage: 76, nm: 10, plvl: 40, gear: [ref(t3), ref(nmT)] });
  check("server: treasure items (normal and nightmare, r3) verify", !(await player("pot-guest-0001")).gear.rejected);
  await post("pot-guest-0002", { stage: 76, plvl: 40, gear: [ref(t2)] });
  check("server: golden item on a potion-spot seed before r3 rejected", (await player("pot-guest-0002")).gear.rejected === 1);
  let oldDrop = null; for (let i = 0; i < 400 && !oldDrop; i++) { const sd = `srvrun|d30|p${100 + i}`; if (I.rngFrom(`v4|drop?|${sd}`)() < 0.15) oldDrop = I.generate(sd, "drop", 30, 4, 2); }
  await post("pot-guest-0003", { stage: 76, plvl: 40, gear: [ref(oldDrop)] });
  check("server: old potion-spot drop (r2) still verifies", !(await player("pot-guest-0003")).gear.rejected);
} finally { await browser.close(); php.kill(); }
check("no php errors", !/Fatal|Warning|Notice|Deprecated/.test(phpErr), phpErr.slice(0, 400));
const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
