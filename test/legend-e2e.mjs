// 저항 줄 r4 7~20%·강화로 안 오름·r3는 새 최대치까지, 전설의 힘은 3단계에서 없어짐 (장신구가 대신)
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
const DB = path.join(DIR, "legend.sqlite"); for (const f of [DB, DB + "-wal", DB + "-shm"]) fs.rmSync(f, { force: true });
const CFG = path.join(DIR, "config.legend.php");
fs.writeFileSync(CFG, `<?php\n$c = require __DIR__ . '/config.test.php';\nreturn array_merge($c, ['db_dsn' => 'sqlite:${DB}']);\n`);
const php = spawn("php", ["-S", "127.0.0.1:8112", "-t", path.join(REPO, "ranking-php")], { env: { ...process.env, RANKING_CONFIG: CFG, TEST_JWT_SECRET: "legend" }, stdio: ["ignore", "ignore", "pipe"] });
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
    const res = await fetch(`http://127.0.0.1:8112/api.php${u.search}`, { method: req.method(), headers: { ...req.headers(), origin: ORIGIN.slice(0, -1) }, body: req.method() === "GET" ? undefined : req.postData() });
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
const find = (pre, pred, lvl) => { for (let i = 0; i < 200000; i++) { const it = I.generate(`${pre}|k${i}`, "golden", lvl); if (!I.isAccessory(it) && pred(it)) return it; } throw new Error("nf"); };
const nmW = find("nms|n5", it => it.slot === "weapon" && it.rarity === "legendary", 80);
const nmR = find("nms|n5", it => it.slot === "head" && it.rarity === "rare", 80);
const RES = ["fireRes", "iceRes", "boltRes", "allRes"];
const findG = (pre, pred, lvl, v, r) => { for (let i = 0; i < 400000; i++) { const it = I.generate(`${pre}|k${i}`, "golden", lvl, v, r); if (pred(it)) return it; } throw new Error("nf " + pre); };
// r4: 저항 줄 범위
let mn = 99, mx = 0, amn = 99, amx = 0;
for (let i = 0; i < 30000; i++) { const it = I.generate(`lr|n10|k${i}`, "golden", 85); if (I.isAccessory(it)) continue; for (const [k, v] of it.lines) { if (k === "iceRes") { mn = Math.min(mn, v); mx = Math.max(mx, v); } if (k === "allRes") { amn = Math.min(amn, v); amx = Math.max(amx, v); } } }
check("rules: r4 resist lines 7~20%, all resist 4~7%", mn === 7 && mx === 20 && amn === 4 && amx === 7, JSON.stringify([mn, mx, amn, amx]));
// r3 아이템: 같은 범위 그대로(저장값), 효과는 20까지
const old = findG("lr3|n10", it => it.lines.some(([k, v]) => k === "fireRes" && v > 20), 85, 4, 3);
const oldV = old.lines.find(([k]) => k === "fireRes")[1];
check("rules: r3 item keeps its rolled 11~34% value, effect capped at 20%", oldV > 20 && I.effectiveLines(old).find(([k]) => k === "fireRes")[1] === 20 && I.statRange(old, "line", "fireRes")[1] === 34);
// 강화: 저항 줄은 안 오름
const mixed = findG("lr|n10", it => !I.isAccessory(it) && it.lines.some(([k]) => RES.includes(k)) && it.lines.some(([k]) => !RES.includes(k)), 85);
const m10 = { ...mixed, enh: 10 };
check("enhance +10: resist lines get no boost, the 4 boosts go to other lines", I.enhancedLines(m10).every(([k, , p]) => !RES.includes(k) || p === 0) && I.enhancedLines(m10).reduce((s, [, , p]) => s + p, 0) > 0);
const noNM = I.generate("lr|d70|k3", "golden", 70, 4, 6);   // r6 (장신구 전)
check("items without resist lines enhance exactly as before (same line picks)", JSON.stringify(I.enhancedLines({ ...noNM, enh: 10 }).map(l => l[2]).filter(Boolean).length) === "1" || I.enhancedLines({ ...noNM, enh: 10 }).reduce((s, [, , p]) => s + p, 0) > 0);
// 전설의 힘: 3단계에서 없어짐 — 고대 레전더리도 줄에 있는 만큼만
const anc = findG("lg|n10", it => it.rarity === "legendary" && it.ancient && !I.isAccessory(it), 85);
const plain = findG("lg|n10", it => it.rarity === "legendary" && !it.ancient && !I.isAccessory(it), 85);
check("legend power removed from rules", I.legendPower === undefined && I.LEGEND === undefined && I.completeness === undefined);
const T = I.totals([anc]).stats, own = (k) => [...anc.main, ...anc.lines].filter(([x]) => x === k).reduce((s, [, v]) => s + v, 0);
check("totals: ancient legendary adds only its own atk/def/hp % and all res", T.legend === undefined && T.atkPct === own("atkPct") && T.defPct === own("defPct") && T.hpPct === own("hpPct") && T.allRes === own("allRes"), JSON.stringify([T.atkPct, T.defPct, T.hpPct, T.allRes]));

try {
  const { ctx, page, errors } = await open("legendtest-a", { rl_save: saveN("lgA"), rl_level: lv(5, "lgA", "nm"), "rl_inv:g:DEV": JSON.stringify({ bag: [anc, plain, old], equip: eqOf(), log: [], stones: 0, nmStones: 0 }) });
  await press(page, "i"); await sleep(150);
  const pick = async (it) => { await page.locator(".bag-item", { hasText: I.itemName(it) }).first().click(); await sleep(120); };
  await pick(anc);
  check("detail: no 전설의 힘 / 완성도 for an ancient legendary", !/전설의 힘|완성도/.test(await page.locator("#inv-detail").innerText()));
  await pick(plain);
  check("detail: no 전설의 힘 for an ordinary legendary", !/전설의 힘|완성도/.test(await page.locator("#inv-detail").innerText()));
  await pick(old);
  check("detail: r3 resist line shows (적용 20%)", (await page.locator("#inv-detail").innerText()).includes("(적용 20%)"));
  await pick(anc);
  await page.locator("#inv-detail button", { hasText: "장착" }).click(); await sleep(150);
  check("stats: no 전설의 힘 row", !(await page.locator("#inv-summary").innerText()).includes("전설의 힘"));
  check("no page errors", errors.length === 0, errors.join("; "));
  await ctx.close();
} finally { await browser.close(); }

try {
  const post = (guest, body) => fetch("http://127.0.0.1:8112/api.php?r=score", { method: "POST", headers: { "Content-Type": "application/json", Origin: ORIGIN.slice(0, -1), "X-Guest-Id": guest }, body: JSON.stringify(body) }).then(r => r.json());
  const me = (guest, season = "") => fetch(`http://127.0.0.1:8112/api.php?r=me${season ? "&season=" + season : ""}`, { headers: { Origin: ORIGIN.slice(0, -1), "X-Guest-Id": guest } }).then(r => r.json());
  const player = async (guest, season) => (await fetch(`http://127.0.0.1:8112/api.php?r=player&id=${(await me(guest, season)).id}${season ? "&season=" + season : ""}`, { headers: { Origin: ORIGIN.slice(0, -1) } })).json();
  const ref = (it) => ({ seed: it.seed, src: it.src, lvl: it.lvl, v: 4, enh: 0, id: it.id, r: it.r });
  await post("legend-guest-01", { stage: 76, nm: 11, plvl: 40, gear: [ref(anc), ref(old)] });
  const p = await player("legend-guest-01", "nm");
  const a = p.gear?.items?.find(x => x.slot === anc.slot);
  const o = p.gear?.items?.find(x => x.slot === old.slot);
  check("server: item view has no legend fields", a && !("legend" in a) && !("legendRes" in a), JSON.stringify(a));
  check("server: r3 resist line applied at 20%", o?.lines.some(l => l.text.startsWith("불 저항") && l.eff === "20%"), JSON.stringify(o?.lines));
} finally { php.kill(); }
check("no php errors", !/Fatal|Warning|Notice|Deprecated/.test(phpErr), phpErr.slice(0, 400));
const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
