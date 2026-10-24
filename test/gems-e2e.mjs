// 홈·보석 (r6): 규칙·예전 r5 그대로·보석 자동 합성/쪼개기·드롭·줍기·홈에 넣기·가방 전부 판매·서버 검증
import { createRequire } from "node:module";
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs"; import path from "node:path";
const require = createRequire(process.env.NODE_PATH + "/");
const { chromium } = require("playwright");
const REPO = process.argv[2], OUT = process.argv[3];
const I = createRequire(import.meta.url)(path.join(REPO, "items.js"));
const M = createRequire(import.meta.url)(path.join(REPO, "monsters.js"));
const ORIGIN = "https://game.apacimtest.com/", API = "https://api.test/api.php";
const results = []; const check = (n, ok, x = "") => { results.push(!!ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x && !ok ? " — " + x : ""}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
// ---- 서버 ----
const DIR = path.dirname(new URL(import.meta.url).pathname) + "/php";
const DB = path.join(DIR, "gems.sqlite"); for (const f of [DB, DB + "-wal", DB + "-shm"]) fs.rmSync(f, { force: true });
const CFG = path.join(DIR, "config.gems.php");
fs.writeFileSync(CFG, `<?php\n$c = require __DIR__ . '/config.test.php';\nreturn array_merge($c, ['db_dsn' => 'sqlite:${DB}']);\n`);
const php = spawn("php", ["-S", "127.0.0.1:8114", "-t", path.join(REPO, "ranking-php")], { env: { ...process.env, RANKING_CONFIG: CFG, TEST_JWT_SECRET: "gems" }, stdio: ["ignore", "ignore", "pipe"] });
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
    const res = await fetch(`http://127.0.0.1:8114/api.php${u.search}`, { method: req.method(), headers: { ...req.headers(), origin: ORIGIN.slice(0, -1) }, body: req.method() === "GET" ? undefined : req.postData() });
    r.fulfill({ status: res.status, headers: { "content-type": "application/json", "access-control-allow-origin": "*" }, body: await res.text() }); });
  await ctx.route("https://login.xsolla.com/**", r => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await ctx.addInitScript(([seed, dev]) => { window.__shift = Number(sessionStorage.getItem("shift") || 0); const _now = Date.now; Date.now = () => _now() + window.__shift;
    if (sessionStorage.getItem("seeded")) return; sessionStorage.setItem("seeded", 1); sessionStorage.setItem("rl_scene", "dungeon");
    localStorage.setItem("rl_device_id", dev); localStorage.setItem(`rl_notice_v4:g:${dev}`, "1"); localStorage.setItem(`rl_notice_75:g:${dev}`, "1"); localStorage.setItem(`rl_notice_1019:g:${dev}`, "1"); localStorage.setItem(`rl_notice_1020:g:${dev}`, "1"); localStorage.setItem(`rl_notice_1020b:g:${dev}`, "1"); localStorage.setItem(`rl_notice_1020c:g:${dev}`, "1");
    for (const [k, v] of Object.entries(seed)) localStorage.setItem(k.replace("DEV", dev), v);
    window.__log = []; document.addEventListener("DOMContentLoaded", () => new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => window.__log.push(n.textContent)))).observe(document.getElementById("log"), { childList: true })); }, [seed, dev]);
  await page.goto(ORIGIN); await sleep(450);
  return { ctx, page, errors };
}
const logs = (page) => page.evaluate(() => (window.__log || []).join("\n"));
const level = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("rl_level")));
const press = async (page, k, n = 1) => { for (let i = 0; i < n; i++) { await page.keyboard.press(k); await sleep(30); } };


const O = createRequire(import.meta.url)(path.join(path.dirname(new URL(import.meta.url).pathname), "fixtures", "items-r5.js"));   // 이번 변경 전 items.js (r5)
const findG = (pre, pred, lvl, src = "golden") => { for (let i = 0; i < 600000; i++) { const it = I.generate(`${pre}|k${i}`, src, lvl); if (pred(it)) return it; } throw new Error("nf " + pre); };
// ---- 규칙 ----
const seen = {}; let pantsSock = 0, socks = 0, N = 0;
for (let i = 0; i < 40000; i++) { const it = I.generate(`sk|d40|k${i}`, "boss", 40); N++; const c = I.socketCount(it); if (!c) continue; socks++;
  const k = it.slot === "offhand" ? (it.type === "shield" ? "shield" : "offhandWeapon") : it.type === "longsword" ? "longsword" : it.slot; (seen[k] ||= new Set()).add(c); if (it.slot === "pants") pantsSock++; }
const want = { head: "1,2", chest: "1,2,3,4", arms: "1,2", boots: "1,2", weapon: "1,2", offhandWeapon: "1,2", longsword: "4,5,6", shield: "1,2,3,4" };
check("r6: socket counts per kind (pants none, longsword 4~6)", I.RULES_REV >= 6 && pantsSock === 0 && Object.entries(want).every(([k, v]) => [...(seen[k] || [])].sort().join() === v), JSON.stringify(Object.fromEntries(Object.entries(seen).map(([k, v]) => [k, [...v].sort()]))));
check(`r6: socket is one extra-stat line (${(socks / N * 100).toFixed(0)}% of boss drops)`, socks / N > 0.1 && socks / N < 0.5);
// (속성 피해 줄이 여러 개였던 나이트메어 아이템은 하나로 바뀜 — lock-e2e)
const multiEl = (it) => it.lines.filter(([k]) => I.isElementDmg(k)).length > 1;
let diff = 0; for (let i = 0; i < 4000; i++) { const s = `old|${i % 2 ? "n12" : "d40"}|k${i}`, a = O.generate(s, "boss", 60, 4, 5); if (!multiEl(a) && JSON.stringify(a) !== JSON.stringify(I.generate(s, "boss", 60, 4, 5))) diff++; }
check("r5 items regenerate exactly as before", diff === 0, String(diff));
const ch = findG("skc|d60", it => it.slot === "chest" && I.socketCount(it) === 4 && it.lines.length >= 3, 60);
check("socket line never grows with enhancement", I.enhancedLines({ ...ch, enh: 10 }).find(([k]) => k === "socket")[1] === 4 && I.enhancedLines({ ...ch, enh: 10 }).find(([k]) => k === "socket")[2] === 0);
const P = I.gemPlan;
check("gemPlan: exact, combine lower (3:1), split higher, not enough", JSON.stringify(P([0, 1, 0], 1).left) === "[0,0,0]" && JSON.stringify(P([5, 0, 0], 1).left) === "[2,0,0]" && JSON.stringify(P([10, 0, 0], 2).left) === "[1,0,0]"
  && JSON.stringify(P([0, 0, 1], 0).left) === "[2,2,0]" && JSON.stringify(P([1, 0, 1], 1)) === JSON.stringify({ left: [1, 2, 0], used: [0, 0, 1], got: [0, 2, 0] }) && P([2, 2, 0], 2) === null && P(undefined, 0) === null);
const wpn = findG("skw|d60", it => it.slot === "weapon" && I.socketCount(it) === 2, 60);
check("gem effect depends on weapon vs armor", JSON.stringify(I.gemStats({ ...wpn, gems: [["ruby", 2], ["sapphire", 0]] })) === '{"atkPct":6,"critDmg":5}' && JSON.stringify(I.gemStats({ ...ch, gems: [["ruby", 2], ["emerald", 1]] })) === '{"hpPct":6,"dmgReduce":2}');
check("gems beyond the socket count are ignored", JSON.stringify(I.gemStats({ ...wpn, gems: [["ruby", 0], ["ruby", 0], ["ruby", 0]] })) === '{"atkPct":4}');
const T = I.totals([{ ...ch, gems: Array(4).fill(["emerald", 2]) }, { ...findG("ska|d60", it => it.slot === "arms" && I.socketCount(it) === 2, 60), gems: [["emerald", 2], ["emerald", 2]] },
  { ...findG("skb|d60", it => it.slot === "boots" && I.socketCount(it) === 2, 60), gems: [["emerald", 2], ["emerald", 2]] }, { ...findG("sks|d60", it => it.type === "shield" && I.socketCount(it) === 4, 60), gems: Array(4).fill(["emerald", 2]) }]).stats;
check("damage reduction from gems capped at 30%", T.dmgReduce === 30);
let drops = 0, grades = [0, 0, 0], nmG = [0, 0, 0];
for (let i = 0; i < 50000; i++) { const g = I.rollGem(`t|d10|g${i}`, "normal"); if (g) { drops++; grades[g[1]]++; } const b = I.rollGem(`t|n10|g${i}`, "boss", true); if (b) nmG[b[1]]++; }
check(`gem drops: normal monsters ~2% mostly shards, nightmare bosses higher grades (${grades} / ${nmG})`, drops / 50000 > 0.015 && drops / 50000 < 0.025 && grades[0] / drops > 0.8 && nmG[1] + nmG[2] > nmG[0]);

const sv = (d, rid) => JSON.stringify({ v: 1, season: 4, best: 75, clr: 1, nb: 10, run: { d, hp: 3000, mh: 3000, a: 30, g: 500, l: 40, x: 0, xn: 1e12, rid, k: 0, pp: 0 } });
const invOf = () => page => page.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => k.startsWith("rl_inv:")))));
const readInv = invOf();
// 처치하면 보석이 떨어지는 판 ID (첫 처치, 일반 몬스터 2%)
let rid = null; for (let i = 0; i < 100000 && !rid; i++) if (I.rollGem(`gemrid${i}|d5|g1`, "normal", false)) rid = `gemrid${i}`;
const dropped = I.rollGem(`${rid}|d5|g1`, "normal", false);
try {
  const plain = findG("skp|d60", it => it.slot === "head" && !I.socketCount(it), 60);
  const { ctx, page, errors } = await open("gemtest-a", { rl_save: sv(5, rid), rl_level: lv(5, rid, "normal", [foe(11, 10, { hp: 1, maxHp: 1, kind: "normal", nm: 0, id: "rat", name: "쥐" })], { items: [{ x: 9, y: 10, type: "gem", gem: "topaz", grade: 2 }] }),
    "rl_inv:g:DEV": JSON.stringify({ bag: [ch, plain], equip: eqOf(wpn), log: [], stones: 0, nmStones: 0, gems: { ruby: [5, 0, 0], sapphire: [0, 0, 1] } }) });
  await press(page, "ArrowLeft"); await sleep(120);
  let inv = await readInv(page);
  check("walk onto a gem on the floor → picked up into the pouch", JSON.stringify(inv.gems.topaz) === "[0,0,1]" && (await logs(page)).includes("완벽한 토파즈을(를) 주웠다"), JSON.stringify(inv.gems));
  await press(page, "ArrowRight"); await press(page, "ArrowRight"); await sleep(150);
  check("killing a monster can drop a gem (♦ on the floor)", (await logs(page)).includes(`${I.gemName(dropped[0], dropped[1])}을(를) 떨어뜨렸다`), await logs(page));
  await press(page, "i"); await sleep(150);
  check("summary shows the gem pouch", (await page.locator("#inv-summary").innerText()).includes("보석 주머니"));
  const pick = async (name) => { await page.locator(".bag-item", { hasText: name }).first().click(); await sleep(120); };
  await pick(I.itemName(ch));
  let d = await page.locator("#inv-detail").innerText();
  check("detail: 홈 0/4, four empty sockets", d.includes("홈 0/4") && (d.match(/◇ 빈 홈/g) || []).length === 4 && d.includes("홈 4개"));
  await page.selectOption("#inv-detail select.gem-kind", "ruby"); await sleep(80);
  await page.selectOption("#inv-detail select.gem-grade", "1"); await sleep(80);
  d = await page.locator("#inv-detail").innerText();
  check("plan: 3 ruby shards combine into a ruby", d.includes("루비 조각 3개를 합쳐서 넣어요") && d.includes("최대 HP +4%"), d);
  await page.locator("#inv-detail button.gem-put").click(); await sleep(150);
  inv = await readInv(page);
  let item = inv.bag.find(x => x.id === ch.id);
  check("put: pouch 5 shards → 2 left, socket has a ruby", JSON.stringify(inv.gems.ruby) === "[2,0,0]" && JSON.stringify(item.gems) === '[["ruby",1]]', JSON.stringify([inv.gems, item.gems]));
  await page.selectOption("#inv-detail select.gem-kind", "sapphire"); await sleep(80);
  await page.selectOption("#inv-detail select.gem-grade", "0"); await sleep(80);
  check("plan: split a perfect sapphire", (await page.locator("#inv-detail").innerText()).includes("완벽한 사파이어 1개를 쪼개서 넣어요"));
  await page.locator("#inv-detail button.gem-put").click(); await sleep(150);
  inv = await readInv(page); item = inv.bag.find(x => x.id === ch.id);
  check("put: perfect sapphire → 2 sapphires + 2 shards left", JSON.stringify(inv.gems.sapphire) === "[2,2,0]" && item.gems.length === 2 && (await page.locator("#inv-detail").innerText()).includes("홈 2/4"));
  await page.selectOption("#inv-detail select.gem-kind", "emerald"); await sleep(80);
  check("no emeralds → button disabled", await page.locator("#inv-detail button.gem-put").isDisabled() && (await page.locator("#inv-detail").innerText()).includes("에메랄드 조각이(가) 없어요"));
  // 가방 전부 판매: 보석 넣은 갑옷은 남김
  check("sell-all button skips the socketed item", (await page.locator("#inv-sell-all").innerText()).includes("잠금·보석 1개 빼고"));
  await page.locator("#inv-sell-all").click(); await sleep(200);
  inv = await readInv(page);
  check("sell-all keeps the socketed chest", inv.bag.length === 1 && inv.bag[0].id === ch.id);
  await pick(I.itemName(ch));
  await page.locator("#inv-detail button", { hasText: "장착" }).click(); await sleep(150);
  check("stats include gem bonuses", (await page.locator("#inv-summary").innerText()).includes("최대 HP"));
  await page.screenshot({ path: `${OUT}/gems.png` });
  check("no page errors", errors.length === 0, errors.join("; "));
  await ctx.close();
} finally { await browser.close(); }

try {
  const post = (guest, body) => fetch("http://127.0.0.1:8114/api.php?r=score", { method: "POST", headers: { "Content-Type": "application/json", Origin: ORIGIN.slice(0, -1), "X-Guest-Id": guest }, body: JSON.stringify(body) }).then(r => r.json());
  const me = (guest) => fetch(`http://127.0.0.1:8114/api.php?r=me`, { headers: { Origin: ORIGIN.slice(0, -1), "X-Guest-Id": guest } }).then(r => r.json());
  const player = async (guest) => (await fetch(`http://127.0.0.1:8114/api.php?r=player&id=${(await me(guest)).id}`, { headers: { Origin: ORIGIN.slice(0, -1) } })).json();
  const ref = (it, g) => ({ seed: it.seed, src: it.src, lvl: it.lvl, v: it.v, enh: 0, id: it.id, r: it.r, ...(g ? { g } : {}) });
  await post("gems-guest-01", { stage: 70, plvl: 40, gear: [ref(ch, [["ruby", 2], ["emerald", 2]]), ref(wpn, [["ruby", 0], ["ruby", 0], ["ruby", 0]])] });
  const p = await player("gems-guest-01");
  const c = p.gear?.items?.find(x => x.slot === "chest");
  check("server: socketed chest shows gems and stats include them", p.gear?.rejected === 1 && c?.gems?.length === 2 && c.gems[0].name === "완벽한 루비" && c.gems[1].text === "받는 피해 감소 +3%" && c.lines.some(l => l.text === "홈 4개") && p.gear.stats.dmgReduce === 3, JSON.stringify([p.gear?.rejected, c?.gems, p.gear?.stats?.dmgReduce]));
  await post("gems-guest-02", { stage: 70, plvl: 40, gear: [ref(ch, [["opal", 2]])] });
  check("server: unknown gem rejected", (await player("gems-guest-02")).gear?.rejected === 1);
  const pv = (inv) => execFileSync("php", ["-r", `require "${path.join(REPO, "ranking-php/profile.php")}"; echo profile_valid(json_decode($argv[1], true)) ? "ok" : "bad";`, JSON.stringify({ inv })]).toString();
  check("profile: gem pouch validated", pv({ bag: [], equip: {}, gems: { ruby: [1, 2, 3] } }) === "ok" && pv({ bag: [], equip: {}, gems: { ruby: [1, -2, 3] } }) === "bad" && pv({ bag: [], equip: {}, gems: { ruby: [1, 2] } }) === "bad");
} finally { php.kill(); }
check("no php errors", !/Fatal|Warning|Notice|Deprecated/.test(phpErr), phpErr.slice(0, 400));
const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
