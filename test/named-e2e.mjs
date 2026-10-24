// 헬 2단계: 네임드 보스 5마리 (불가사리·구미호·이무기·저승사자·염라대왕) — 규칙, 등장, 패턴, 룬 2개, 도감, 층 고르기 문
import { createRequire } from "node:module";
import fs from "node:fs"; import path from "node:path";
const require = createRequire(process.env.NODE_PATH + "/");
const { chromium } = require("playwright");
const REPO = process.argv[2], OUT = process.argv[3];
const I = createRequire(import.meta.url)(path.join(REPO, "items.js"));
const M = createRequire(import.meta.url)(path.join(REPO, "monsters.js"));
const ORIGIN = "https://game.apacimtest.com/", API = "https://api.test/api.php";
const results = []; const check = (n, ok, x = "") => { results.push(!!ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x && !ok ? " — " + x : ""}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ---- 규칙 ----
const NB = M.NAMED.bosses;
check("NAMED: 5 bosses at 10·20·30·40·50, 2 runes", Object.keys(NB).join() === "10,20,30,40,50" && M.NAMED.runes === 2 && Object.values(NB).map(b => b.name).join() === "불가사리,구미호,이무기,저승사자,염라대왕");
const b10 = M.makeNamedBoss(10), hb10 = M.makeHellBoss(10, "fire");
check("makeNamedBoss: hell boss × hpMul·atkMul, boss resist, kind boss, named color", b10.kind === "boss" && b10.named === 10 && b10.hp === Math.round(hb10.hp * NB[10].hpMul) && b10.atk === Math.round(hb10.atk * NB[10].atkMul) && b10.res.fire === 60 && b10.color === M.NAMED_COLOR && b10.shred.per === 5, JSON.stringify(b10));
check("not a named floor → null", M.makeNamedBoss(15) === null && M.namedAt(25) === null);
check("염라대왕 element: fire → ice → bolt every 3 turns", [0, 2, 3, 5, 6, 9].map(t => M.judgeElement(t, 3)).join() === "fire,fire,ice,ice,bolt,fire");
check("named bosses get stronger with depth", [10, 20, 30, 40, 50].map(n => M.makeNamedBoss(n).hp).every((h, i, a) => !i || h > a[i - 1]));

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
    const res = await fetch(`http://127.0.0.1:8121/api.php${u.search}`, { method: req.method(), headers: { ...req.headers(), origin: ORIGIN.slice(0, -1) }, body: req.method() === "GET" ? undefined : req.postData() });
    r.fulfill({ status: res.status, headers: { "content-type": "application/json", "access-control-allow-origin": "*" }, body: await res.text() }); });
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
const inLobby = (page) => page.evaluate(() => document.body.classList.contains("in-lobby"));
const save = (d, rid, extra = {}, run = {}) => JSON.stringify({ v: 1, season: 4, best: 75, clr: 1, nb: 50, nclr: 1, hb: d, ...extra, run: { d, hp: 9e6, mh: 9e6, a: 30, g: 500, l: 40, x: 0, xn: 1e12, rid, k: 0, pp: 0, z: "hell", ...run } });
const named = (n, extra = {}) => ({ x: 11, y: 10, ...M.makeNamedBoss(n), ...extra });
try {
  // 1. 헬 10층을 새로 만들면 계단 방에 불가사리 (네임드 로그)
  let { ctx, page, errors } = await open("namedtest-a", { rl_save: save(10, "nmA"), "rl_inv:g:DEV": inv(v4) });
  await press(page, " "); await sleep(150);
  let L = await stored(page, "rl_level");
  check("hell floor 10 spawns named boss 불가사리", L.d === 10 && L.enemies.filter(e => e.named).length === 1 && L.enemies.find(e => e.named).name === "불가사리", JSON.stringify(L.enemies.filter(e => e.kind === "boss").map(e => e.name)));
  await ctx.close();
  ({ ctx, page, errors } = await open("namedtest-a2", { rl_save: save(9, "nmA2"), rl_level: lv(9, "nmA2", "hell"), "rl_inv:g:DEV": inv(v4) }));
  await press(page, "ArrowRight"); await sleep(300);
  check("descend to hell 10: named boss intro log (pattern + 2 runes)", (await stored(page, "rl_save")).run.d === 10 && (await logs(page)).includes("✦ 네임드 보스 불가사리 (쇠를 먹는 괴수)이(가) 계단을 지키고 있다! 공격이 들어갈 때마다 방어력 −5%") && (await logs(page)).includes("룬 2개!"), await logs(page));
  await page.screenshot({ path: `${OUT}/named-floor10.png` });
  await ctx.close();
  // 2. 불가사리: 맞을 때마다 방어력 −5% (HUD·방어력), 쓰러뜨리면 풀리고 룬 2개
  ({ ctx, page, errors } = await open("namedtest-b", { rl_save: save(10, "nmB"), rl_level: lv(10, "nmB", "hell", [named(10, { hp: 2e9, maxHp: 2e9, atk: 5, el: null })]), "rl_inv:g:DEV": inv(v4) }));
  const def0 = +(await page.locator("#def").innerText());
  await press(page, " ", 3); await sleep(150);
  let lg = await logs(page);
  const def1 = +(await page.locator("#def").innerText());
  check("불가사리 shred: −5% per hit (log, HUD, def lower)", lg.includes("갑옷을 갉아먹었다! 방어력 −5%") && lg.includes("방어력 −15%") && (await page.locator("#status").innerText()).includes("🦷 방어력 −15%") && def1 === Math.round(def0 * 0.85), JSON.stringify([def0, def1]));
  await press(page, " ", 5); await sleep(100);
  check("shred caps at −25%", (await page.locator("#status").innerText()).includes("방어력 −25%") && !(await logs(page)).includes("−30%"));
  await page.evaluate(() => { const L = JSON.parse(localStorage.getItem("rl_level")); return L; });
  await ctx.close();
  ({ ctx, page, errors } = await open("namedtest-b2", { rl_save: save(10, "nmB2"), rl_level: lv(10, "nmB2", "hell", [named(10, { hp: 1 })]), "rl_inv:g:DEV": inv(v4) }));
  await press(page, "ArrowRight"); await sleep(250);
  L = await stored(page, "rl_level"); lg = await logs(page);
  const runes = L.items.filter(i => i.type === "rune");
  check("named kill: log + 2 runes + gear", lg.includes("네임드 보스 불가사리을(를) 쓰러뜨렸다") && runes.length === 2 && runes.every(r => r.rune >= 0 && r.rune < 14) && L.items.some(i => i.type === "gear"), JSON.stringify(L.items.map(i => i.type)));
  check("no page errors (불가사리)", errors.length === 0, errors.join("; "));
  await ctx.close();
  // 3. 구미호: HP 50% 이하가 되면 분신 2마리. 분신은 장비·골드 없음
  const g = M.makeNamedBoss(20);
  ({ ctx, page, errors } = await open("namedtest-c", { rl_save: save(20, "nmC"), rl_level: lv(20, "nmC", "hell", [named(20, { hp: Math.floor(g.maxHp * 0.5), atk: 1 })]), "rl_inv:g:DEV": inv(v4) }));
  await press(page, " "); await sleep(150);
  L = await stored(page, "rl_level");
  const clones = L.enemies.filter(e => e.clone);
  check("구미호 splits: 2 clones (구미호의 분신, 15% HP)", clones.length === 2 && clones.every(c => c.name === "구미호의 분신" && c.maxHp === Math.round(g.maxHp * 0.15)) && (await logs(page)).includes("분신 2마리"), JSON.stringify(L.enemies.map(e => [e.name, e.hp])));
  await press(page, " ", 2); await sleep(100);
  check("splits only once", (await stored(page, "rl_level")).enemies.filter(e => e.clone).length === 2);
  await ctx.close();
  const clone = { x: 11, y: 10, id: "gumiho", ch: "f", name: "구미호의 분신", color: M.NAMED_COLOR, kind: "elite", clone: true, el: "ice", res: g.res, hell: 1, hp: 1, maxHp: 100, atk: 1, def: 0, xp: 0 };
  ({ ctx, page, errors } = await open("namedtest-c2", { rl_save: save(20, "nmC2"), rl_level: lv(20, "nmC2", "hell", [clone]), "rl_inv:g:DEV": inv(v4) }));
  const gold0 = (await stored(page, "rl_save")).run.g;
  await press(page, "ArrowRight"); await sleep(200);
  L = await stored(page, "rl_level");
  check("clone kill: vanishes, no loot, no gold", L.enemies.length === 0 && L.items.length === 0 && (await stored(page, "rl_save")).run.g === gold0 && (await logs(page)).includes("연기처럼 사라졌다"), JSON.stringify([L.items, gold0]));
  check("no page errors (구미호)", errors.length === 0, errors.join("; "));
  await ctx.close();
  // 4. 이무기: 휩쓸기 예고 → 3턴마다 꼬리 휩쓸기
  ({ ctx, page, errors } = await open("namedtest-d", { rl_save: save(30, "nmD"), rl_level: lv(30, "nmD", "hell", [named(30, { hp: 2e9, maxHp: 2e9, atk: 5, el: null })], { turn: 1 }), "rl_inv:g:DEV": inv(v4) }));
  await press(page, " "); await sleep(120);
  check("이무기 telegraph before sweep", (await logs(page)).includes("꼬리를 치켜든다! 다음 턴에 2칸 안을 휩쓴다"), await logs(page));
  await press(page, " "); await sleep(120);
  lg = await logs(page);
  check("이무기 tail sweep on turn 3", lg.includes("이무기의 꼬리 휩쓸기!"), lg);
  check("no page errors (이무기)", errors.length === 0, errors.join("; "));
  await ctx.close();
  // 5. 저승사자: 보이면 포탈 봉인·흡혈 50%, 쓰러뜨리면 포탈
  ({ ctx, page, errors } = await open("namedtest-e", { rl_save: save(40, "nmE"), rl_level: lv(40, "nmE", "hell", [named(40, { hp: 2, atk: 1, el: null })]), "rl_inv:g:DEV": inv(v4) }));
  lg = await page.locator("#log").innerText();
  check("저승사자 seen → portal sealed message", lg.includes("저승사자와(과) 눈이 마주쳤다") && (await page.locator("#status").innerText()).includes("☠ 포탈 봉인 · 흡혈 50%"), lg);
  await press(page, "p"); await sleep(250);
  check("portal blocked while 저승사자 alive", !(await inLobby(page)) && (await logs(page)).includes("포탈을 열 수 없다"));
  await press(page, "ArrowRight"); await sleep(100); await press(page, "ArrowRight"); await sleep(200);
  check("저승사자 down → seal gone", !(await stored(page, "rl_level")).enemies.some(e => e.named) && !(await page.locator("#status").innerText()).includes("포탈 봉인"));
  await press(page, "p"); await sleep(350);
  check("portal works after 저승사자 dies", await inLobby(page));
  check("no page errors (저승사자)", errors.length === 0, errors.join("; "));
  await ctx.close();
  // 6. 염라대왕: 3턴마다 속성 바뀜, HP 30% 이하 분노
  const y = M.makeNamedBoss(50);
  ({ ctx, page, errors } = await open("namedtest-f", { rl_save: save(50, "nmF"), rl_level: lv(50, "nmF", "hell", [named(50, { x: 14, hp: Math.floor(y.maxHp * 0.25), atk: 1 })], { turn: 2 }), "rl_inv:g:DEV": inv(v4) }));
  await press(page, " "); await sleep(150);
  L = await stored(page, "rl_level"); lg = await logs(page);
  const yb = L.enemies.find(e => e.named);
  check("염라대왕 turns ice on turn 3 (resist follows)", yb.el === "ice" && yb.res.ice === 60 && yb.res.fire === 50 && lg.includes("이제 얼음 속성"), JSON.stringify([yb.el, yb.res]));
  check("염라대왕 enrage under 30%", yb.enraged && lg.includes("분노했다! 공격력 ×2"));
  check("no page errors (염라대왕)", errors.length === 0, errors.join("; "));
  // 도감: 헬 네임드 보스 칸
  await press(page, "b"); await sleep(200);
  const dex = await page.locator("#dex-body").innerText();
  check("dex: 헬 네임드 보스 section with 5 cards and 염라대왕 known", dex.includes("헬 네임드 보스") && dex.includes("염라대왕") && dex.includes("속성이 불 → 얼음 → 번개") && (await page.locator("#dex-count").innerText()).includes(`/${M.MONSTERS.length + M.BOSSES.length + 1 + 5}`), (await page.locator("#dex-count").innerText()));
  await page.screenshot({ path: `${OUT}/named-dex.png` });
  await ctx.close();
  // 7. 층 고르기 문: 버튼에 네임드 이름
  ({ ctx, page, errors } = await open("namedtest-g", { rl_save: JSON.stringify({ v: 1, season: 4, best: 75, clr: 1, nb: 50, nclr: 1, hb: 11, run: { d: 30, hp: 9e6, mh: 9e6, a: 30, g: 500, l: 40, x: 0, xn: 1e12, rid: "nmG", k: 0, pp: 0 } }), rl_level: lv(30, "nmG", "normal"), "rl_inv:g:DEV": inv(v4) }));
  await press(page, "p"); await sleep(300);
  await press(page, "ArrowLeft", 3); await press(page, "ArrowUp", 9); await press(page, "ArrowRight", 5); await sleep(100); await page.keyboard.press("ArrowUp"); await sleep(350);
  check("hell pick buttons show named boss names", (await page.locator("#hellpick-list").innerText()).includes("10층 · 불가사리") && (await page.locator("#hellpick-list").innerText()).includes("20층 · 구미호 (미완료)"), await page.locator("#hellpick-list").innerText());
  await page.screenshot({ path: `${OUT}/named-pick.png` });
  await ctx.close();
} finally { await browser.close(); }
const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
