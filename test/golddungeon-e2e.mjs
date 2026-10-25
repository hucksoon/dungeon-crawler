// 고대 굴리기 골드 표시·20/20 실패 고정, 골드 던전 (75층 완료 후, 75층 난이도, 완료 보상 = 75레벨 레전더리 고대 굴리기 20번)
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import fs from "node:fs"; import path from "node:path";
import { goDoor } from "./town.mjs";   // 마을(옆에서 보는 로비) 문까지 걸어가 ↑
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
const DB = path.join(DIR, "gd.sqlite"); for (const f of [DB, DB + "-wal", DB + "-shm"]) fs.rmSync(f, { force: true });
const CFG = path.join(DIR, "config.gd.php");
fs.writeFileSync(CFG, `<?php\n$c = require __DIR__ . '/config.test.php';\nreturn array_merge($c, ['db_dsn' => 'sqlite:${DB}']);\n`);
const php = spawn("php", ["-S", "127.0.0.1:8108", "-t", path.join(REPO, "ranking-php")], { env: { ...process.env, RANKING_CONFIG: CFG, TEST_JWT_SECRET: "gd" }, stdio: ["ignore", "ignore", "pipe"] });
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
    const res = await fetch(`http://127.0.0.1:8108/api.php${u.search}`, { method: req.method(), headers: { ...req.headers(), origin: ORIGIN.slice(0, -1) }, body: req.method() === "GET" ? undefined : req.postData() });
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
const inv = (...eq) => JSON.stringify({ bag: [], equip: eqOf(...eq), log: [], stones: 0 });
const inLobby = (page) => page.evaluate(() => document.body.classList.contains("in-lobby"));
const saveG = (d, rid, g, extra = {}, run = {}) => JSON.stringify({ v: 1, season: 4, best: 75, clr: 1, ...extra, run: { d, hp: 5000, mh: 5000, a: 300, g, l: 60, x: 0, xn: 1e12, rid, k: 0, pp: 0, ...run } });
const gold = async (page) => Number(await page.locator("#gold").innerText());
const REWARD = I.goldDungeonReward(75, 20);
const pick = async (page, it) => { await page.locator(".bag-item", { hasText: I.itemName(it) }).first().click(); await sleep(120); };

const find = (pred) => { for (let i = 0; i < 400000; i++) { const it = I.generate(`gd|d75|k${i}`, "golden", 75); if (!I.isAccessory(it) && pred(it)) return it; } throw new Error("nf"); };
const leg = find(it => it.rarity === "legendary" && !it.ancient && !I.ancientRerollHit(it, 1));
const done = { ...find(it => it.rarity === "set" && !it.ancient), ar: 20 };
check("rules: reward = 20 × ancient roll cost of a lvl 75 legendary = 22,400", REWARD === 20 * I.ancientRerollCost({ rarity: "legendary", lvl: 75 }) && REWARD === 22400 && M.GOLD_DUNGEON.floor === 75);

try {
  // ---- 인벤토리: 골드 표시, 20/20 실패 고정 ----
  let { ctx, page, errors } = await open("gdtest-a00", { rl_save: saveG(20, "gdA", 5000), rl_level: lv(20, "gdA", "normal"), "rl_inv:g:DEV": JSON.stringify({ bag: [leg, done], equip: eqOf(), log: [], stones: 0 }) });
  await press(page, "i"); await sleep(150);
  check("inventory header shows gold", (await page.locator("#inv-count").innerText()).startsWith("골드 5,000 · 강화석"), await page.locator("#inv-count").innerText());
  await pick(page, leg);
  const cost = I.ancientRerollCost(leg);
  check("ancient roll line shows cost and gold on hand", (await page.locator("#inv-detail").innerText()).includes(`${cost.toLocaleString()}골드 (보유 5,000골드)`));
  await page.locator("#inv-detail button", { hasText: "고대 굴리기" }).click(); await sleep(150);
  check("failure message shows gold left, header updates", (await page.locator("#inv-detail").innerText()).includes(`남은 골드 ${(5000 - cost).toLocaleString()}`) && (await page.locator("#inv-count").innerText()).startsWith(`골드 ${(5000 - cost).toLocaleString()}`));
  await pick(page, done);
  const btn = page.locator("#inv-detail button", { hasText: "20/20번 실패" });
  check("20 rolls used: fixed disabled button 고대 굴리기 20/20번 실패", (await btn.count()) === 1 && await btn.isDisabled() && (await page.locator("#inv-detail").innerText()).includes("20번 모두 실패했어요"));
  await press(page, "Escape");
  // 골드가 모자라면 버튼에 골드 부족
  await page.evaluate(() => {});
  // ---- 완료 전에는 골드 던전 문이 닫혀 있음 ----
  await press(page, "p"); await sleep(200);
  await page.evaluate(() => {});
  check("no page errors (inventory)", errors.length === 0, errors.join("; "));
  await ctx.close();

  ({ ctx, page, errors } = await open("gdtest-b00", { rl_save: saveG(20, "gdB", 100, { best: 40, clr: 0 }), rl_level: lv(20, "gdB", "normal"), "rl_inv:g:DEV": inv() }));
  await press(page, "p"); await sleep(200);
  await goDoor(page, "golddungeon"); await sleep(150);
  check("not cleared: gold dungeon closed", await inLobby(page) && (await logs(page)).includes("골드 던전은 일반 던전 75층을 완료해야"));
  await page.screenshot({ path: path.join(OUT, "gd-lobby-closed.png") });
  await ctx.close();

  // ---- 완료한 사람: 들어가기 ----
  ({ ctx, page, errors } = await open("gdtest-c00", { rl_save: saveG(20, "gdC", 1000), rl_level: lv(20, "gdC", "normal"), "rl_inv:g:DEV": inv() }, { api: true }));
  await press(page, "p"); await sleep(200);
  await page.screenshot({ path: path.join(OUT, "gd-lobby.png") });
  await goDoor(page, "golddungeon"); await sleep(300);
  const L = await level(page);
  const sv = JSON.parse(await page.evaluate(() => localStorage.getItem("rl_save")));
  check("cleared: enters the gold dungeon (zone gold, floor 75 monsters + boss)", !(await inLobby(page)) && L.z === "gold" && L.d === 75 && sv.run.z === "gold" && sv.run.d === 75
    && L.enemies.some(e => e.kind === "boss") && L.enemies.length >= 60, JSON.stringify([L.z, L.d, L.enemies.length]));
  // 바닥에는 골드 더미만 (75층은 몬스터가 많아 빈칸이 없으면 더미가 안 놓일 때도 있음)
  check("no treasure, no golden goblin (floor items are gold piles only)", L.items.every(i => i.type === "gold") && !L.enemies.some(e => e.kind === "golden"));
  check("status bar says 골드 던전", (await page.locator("#zone").innerText()).includes("골드 던전") && (await logs(page)).includes(`골드 ${REWARD.toLocaleString()}`));
  check("others see 골드 던전 탐험 중", await (async () => { for (let i = 0; i < 20; i++) { if ((await page.locator("#lobby-list").innerText()).includes("골드 던전 탐험 중")) return true; await sleep(200); } return false; })(), await page.locator("#lobby-list").innerText());
  await page.screenshot({ path: path.join(OUT, "gd-in.png") });
  // 새로고침해도 골드 던전
  await page.reload(); await sleep(500);
  check("reload keeps the gold dungeon", (await level(page)).z === "gold" && (await page.locator("#zone").innerText()).includes("골드 던전"));
  check("no page errors (enter)", errors.length === 0, errors.join("; "));
  await ctx.close();

  // ---- 처치: 장비 없음, 골드는 75층 ----
  const weak = { x: 11, y: 10, id: "rat", ch: "r", name: "쥐", color: "#aaa", kind: "elite", hp: 1, maxHp: 1, atk: 0, def: 0, xp: 1 };
  ({ ctx, page, errors } = await open("gdtest-d00", { rl_save: saveG(75, "gdD", 0, {}, { z: "gold" }), rl_level: lv(75, "gdD", "gold", [weak]), "rl_inv:g:DEV": inv() }));
  await press(page, "ArrowRight"); await sleep(150);
  const LD = await level(page);
  check("kill in the gold dungeon: gold yes, no gear drop", (await gold(page)) > 0 && !LD.items.some(i => i.type === "gear") && JSON.parse(await page.evaluate(() => localStorage.getItem("rl_save"))).run.k === 0, String(await gold(page)));
  await ctx.close();

  // ---- 완료: 계단 → 보상 ----
  ({ ctx, page, errors } = await open("gdtest-e00", { rl_save: saveG(75, "gdE", 300, {}, { z: "gold" }), rl_level: lv(75, "gdE", "gold", [], {}, [11, 10]), "rl_inv:g:DEV": inv() }));
  await press(page, "ArrowRight"); await sleep(300);
  check("stairs after the boss: reward gold, back to the lobby", (await gold(page)) === 300 + REWARD && await inLobby(page) && (await logs(page)).includes(`보상 골드 +${REWARD.toLocaleString()}`), String(await gold(page)));
  check("notice explains the reward", (await page.locator("body").innerText()).includes("골드 던전 완료!") && (await page.locator("body").innerText()).includes("고대 굴리기 20번"));
  await page.screenshot({ path: path.join(OUT, "gd-clear.png") });
  await press(page, "Escape"); await sleep(100);
  // 로비 포탈로 새 골드 던전 (새 지도)
  const sv2 = JSON.parse(await page.evaluate(() => localStorage.getItem("rl_save")));
  check("after clear: run stays in the gold zone with a new map", sv2.run.z === "gold" && sv2.run.g === 300 + REWARD && (await level(page)).enemies.some(e => e.kind === "boss"));
  await press(page, "ArrowUp"); await sleep(200);   // 마을 파란 포탈 문 앞에서 ↑
  check("lobby portal goes into the new gold dungeon", !(await inLobby(page)) && (await level(page)).z === "gold" && (await logs(page)).includes("골드 던전의 떠난 자리로"));
  // 1층 문으로 들어가면 일반 던전
  await press(page, "p"); await sleep(200);
  await goDoor(page, "start"); await sleep(300);
  check("left door: back to the normal dungeon", (await level(page)).z !== "gold" && (await page.locator("#depth").innerText()) === "1" && !(await page.locator("#zone").innerText()).includes("골드"));
  check("no page errors (clear)", errors.length === 0, errors.join("; "));
  await ctx.close();

  // ---- 나이트메어 난이도 (오른쪽 문) ----
  ({ ctx, page, errors } = await open("gdtest-f00", { rl_save: saveG(20, "gdF", 100, { nb: 0 }), rl_level: lv(20, "gdF", "normal"), "rl_inv:g:DEV": inv() }));
  await press(page, "p"); await sleep(200);
  await goDoor(page, "golddungeonNM"); await sleep(200);
  check("right door closed without nightmare progress", await inLobby(page) && (await logs(page)).includes("나이트메어에 들어가 본 뒤에 열린다"));
  await ctx.close();
  ({ ctx, page, errors } = await open("gdtest-g00", { rl_save: saveG(20, "gdG", 100, { nb: 10 }), rl_level: lv(20, "gdG", "normal"), "rl_inv:g:DEV": inv() }));
  await press(page, "p"); await sleep(200);
  await page.screenshot({ path: path.join(OUT, "gd-lobby-doors.png") });
  await goDoor(page, "golddungeonNM"); await sleep(300);
  const LN = await level(page), svN = JSON.parse(await page.evaluate(() => localStorage.getItem("rl_save")));
  const boss = LN.enemies.find(e => e.kind === "boss");
  check("right door: nightmare floor 10 difficulty (nightmare monsters + boss on floor 10)", !(await inLobby(page)) && LN.z === "gold" && LN.d === 10 && svN.run.gn === 10
    && boss?.name.startsWith("악몽의") && LN.enemies.filter(e => e.kind !== "boss").length >= M.nmMonsterCount(10) - 3 && LN.enemies.every(e => e.kind === "boss" || e.name.startsWith("악몽의")), JSON.stringify([LN.z, LN.d, svN.run.gn, boss?.name, LN.enemies.length]));
  const RN = I.goldDungeonReward(85, 20, true);
  check("right door: status/log show nightmare gold dungeon and ×2 reward", (await page.locator("#zone").innerText()).includes("골드 던전 · 나이트메어") && (await logs(page)).includes(`골드 ${RN.toLocaleString()}`) && RN === 2 * 20 * I.ancientRerollCost({ rarity: "legendary", lvl: 85 }), String(RN));
  check("no shop in the gold dungeon", !LN.shop);
  // 포탈로 나갔다 돌아오기 (1층이어도 포탈 가능해야)
  await press(page, "p"); await sleep(200);
  check("portal out of nightmare gold dungeon keeps the floor", await inLobby(page) && (await logs(page)).includes("골드 던전(악몽 10층)"));
  await ctx.close();
  ({ ctx, page, errors } = await open("gdtest-h00", { rl_save: saveG(10, "gdH", 300, { nb: 10 }, { z: "gold", gn: 10 }), rl_level: lv(10, "gdH", "gold", [], {}, [11, 10]), "rl_inv:g:DEV": inv() }));
  await press(page, "ArrowRight"); await sleep(300);
  check("nightmare gold clear: reward ×2 of lvl 85 legendary × 20 rolls", (await gold(page)) === 300 + RN && await inLobby(page), String(await gold(page)));
  check("no page errors (nightmare gold)", errors.length === 0, errors.join("; "));
  await ctx.close();
} finally { await browser.close(); php.kill(); }
check("no php errors", !/Fatal|Warning|Notice|Deprecated/.test(phpErr), phpErr.slice(0, 400));
const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
