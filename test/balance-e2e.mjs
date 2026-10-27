// 세트 밸런스: 흡혈 합계 최대 20%, 흡혈은 실제로 깎은 HP만큼, 시험의 세트 5세트 = 받는 피해 −10%, 광란 주변 피해 50%
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
const DB = path.join(DIR, "bal.sqlite"); for (const f of [DB, DB + "-wal", DB + "-shm"]) fs.rmSync(f, { force: true });
const CFG = path.join(DIR, "config.bal.php");
fs.writeFileSync(CFG, `<?php\n$c = require __DIR__ . '/config.test.php';\nreturn array_merge($c, ['db_dsn' => 'sqlite:${DB}']);\n`);
const php = spawn("php", ["-S", "127.0.0.1:8105", "-t", path.join(REPO, "ranking-php")], { env: { ...process.env, RANKING_CONFIG: CFG, TEST_JWT_SECRET: "bal" }, stdio: ["ignore", "ignore", "pipe"] });
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
    const res = await fetch(`http://127.0.0.1:8105/api.php${u.search}`, { method: req.method(), headers: { ...req.headers(), origin: ORIGIN.slice(0, -1) }, body: req.method() === "GET" ? undefined : req.postData() });
    r.fulfill({ status: res.status, headers: { "content-type": "application/json", "access-control-allow-origin": "*" }, body: await res.text() }); });
  await ctx.route("https://login.xsolla.com/**", r => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await ctx.addInitScript(([seed, dev]) => { if (sessionStorage.getItem("seeded")) return; sessionStorage.setItem("seeded", 1); sessionStorage.setItem("rl_scene", "dungeon");
    localStorage.setItem("rl_device_id", dev); localStorage.setItem(`rl_notice_v4:g:${dev}`, "1"); localStorage.setItem(`rl_notice_75:g:${dev}`, "1");
    for (const [k, v] of Object.entries(seed)) localStorage.setItem(k.replace("DEV", dev), v);
    window.__log = []; document.addEventListener("DOMContentLoaded", () => new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => window.__log.push(n.textContent)))).observe(document.getElementById("log"), { childList: true })); }, [seed, dev]);
  await page.goto(ORIGIN); await sleep(450);
  return { ctx, page, errors };
}
const logs = (page) => page.evaluate(() => (window.__log || []).join("\n"));
const level = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("rl_level")));
const press = async (page, k, n = 1) => { for (let i = 0; i < n; i++) { await page.keyboard.press(k); await sleep(30); } };
const inv = (...eq) => JSON.stringify({ bag: [], equip: eqOf(...eq), log: [], stones: 0 });


// 테스트용 아이템 찾기
const find = (pred, lvl = 40) => { for (let i = 0; i < 300000; i++) { const it = I.generate(`bal|d${lvl}|k${i}`, "golden", lvl); if (pred(it)) return it; } throw new Error("not found"); };
const trial = ["head", "chest", "arms", "pants", "boots"].map(slot => find(it => it.set === "trial" && it.slot === slot));
const frenzy = ["weapon", "offhand"].map(slot => find(it => it.set === "frenzy" && it.slot === slot));
const lsItems = ["weapon", "chest", "arms", "pants", "boots", "head", "offhand"].map(slot => find(it => it.slot === slot && !it.set && it.type !== "longsword" && (it.lines.find(l => l[0] === "lifesteal")?.[1] || 0) + (it.main.find(l => l[0] === "lifesteal")?.[1] || 0) >= 3));
const lsSum = I.totals(lsItems.map(it => ({ ...it, enh: 0 }))).stats.lifesteal;
const raw = lsItems.reduce((s, it) => s + [...it.main, ...it.lines].filter(l => l[0] === "lifesteal").reduce((a, l) => a + l[1], 0), 0);

check("rules: lifesteal total capped at 20%", I.LIFESTEAL.max === 20 && raw > 20 && lsSum === 20, `${raw} → ${lsSum}`);
const t5 = I.totals(trial).stats;
check("rules: trial 5-set = damage taken −10%, no lifesteal from the set", t5.dmgReduce === 10 && I.SETS.trial.bonuses[2].stats.lifesteal === undefined && I.SETS.trial.bonuses[2].text.includes("받는 피해 −10%"));
check("rules: frenzy splash 50%", I.SPLASH.mul === 0.5 && I.SETS.frenzy.bonuses[0].text.includes("50%"));
const plain = I.generate("bal|d40|k999999", "golden", 40);
const foe2 = (x, y, extra = {}) => ({ x, y, id: "titan", ch: "I", name: "타이탄", color: "#fdd835", kind: "normal", hp: 1e7, maxHp: 1e7, atk: 0, def: 0, xp: 1, ...extra });
const saveB = (rid, run = {}) => JSON.stringify({ v: 1, season: 4, best: 40, run: { d: 40, hp: 500, mh: 1000, a: 300, g: 0, l: 20, x: 0, xn: 1e12, rid, k: 0, pp: 0, ...run } });
const hpOf = async (page) => +(await page.locator("#hp").innerText()).split("/")[0];
try {
  // 1. 흡혈: 실제로 깎은 HP만큼만 (HP 1 남은 적을 쓰러뜨리면 회복 0)
  let { ctx, page, errors } = await open("baltest-a", { rl_save: saveB("balA"), rl_level: lv(40, "balA", "normal", [foe2(11, 10, { hp: 1, maxHp: 1 })]), "rl_inv:g:DEV": inv(...lsItems) });
  const h0 = await hpOf(page);
  await press(page, "ArrowRight"); await sleep(80);
  check("overkill gives no extra lifesteal (1 HP enemy → no heal)", (await hpOf(page)) === h0, `${h0} → ${await hpOf(page)}`);
  await ctx.close();
  ({ ctx, page, errors } = await open("baltest-b", { rl_save: saveB("balB"), rl_level: lv(40, "balB", "normal", [foe2(11, 10)]), "rl_inv:g:DEV": inv(...lsItems) }));
  const h1 = await hpOf(page);
  await press(page, "ArrowRight"); await sleep(80);
  // 두 손 무기면 왼손 공격도 있음: 공격마다 내림해서 더함
  const lgB = await logs(page);
  const hitsB = [...lgB.matchAll(/타이탄에게 (\d+) 피해!/g)].map(m => +m[1]);
  const takenB = [...lgB.matchAll(/타이탄에게 (\d+) 피해를 입음/g)].reduce((s, m) => s + +m[1], 0);  // 몬스터 반격 (공격 0이라 1)
  const healed = (await hpOf(page)) - h1 + takenB;
  check("lifesteal on a big enemy: 20% of the damage (capped)", healed > 0 && healed === hitsB.reduce((s, h) => s + Math.floor(h * 0.2), 0), `hits ${hitsB} healed ${healed}`);
  await press(page, "i"); await sleep(120);
  check("inventory shows 흡혈 20% (최대 20%)", (await page.locator("#inv-summary").innerText()).includes("흡혈 20% (최대 20%)"));
  await ctx.close();

  // 2. 시험의 세트 5세트: 받는 피해 −10%
  ({ ctx, page, errors } = await open("baltest-c", { rl_save: saveB("balC", { hp: 9e6, mh: 9e6 }), rl_level: lv(40, "balC", "normal", [foe2(11, 10, { atk: 3000 })]), "rl_inv:g:DEV": inv(...trial) }));
  const def = +(await page.locator("#def").innerText());
  await press(page, "."); await sleep(80);
  const got = +((await logs(page)).match(/에게 (\d+) 피해를 입음/) || [])[1];
  const exp = [3000, 3001].map(a => Math.max(1, Math.round(M.damageToPlayer(a, def) * 0.9)));
  check("trial 5-set: damage taken −10%", exp.includes(got), `got ${got}, expected ${exp} (def ${def})`);
  await press(page, "i"); await sleep(120);
  const inv1 = await page.locator("#inv-summary").textContent();   // 세트 단계는 접힌 칸 안
  check("inventory shows 받는 피해 −10% and the new 5-set text", inv1.includes("받는 피해 −10%") && inv1.includes("5세트: 치명타 피해 +100%, 받는 피해 −10%"));
  await ctx.close();

  // 3. 광란: 주변 적은 피해의 50%
  ({ ctx, page, errors } = await open("baltest-d", { rl_save: saveB("balD"), rl_level: lv(40, "balD", "normal", [foe2(11, 10, { name: "A" }), foe2(12, 11, { name: "B" })]), "rl_inv:g:DEV": inv(...frenzy) }));
  await press(page, "ArrowRight"); await sleep(80);
  const lg = await logs(page);
  const main = +(lg.match(/^A에게 (\d+) 피해/m) || [])[1], spl = +(lg.match(/광란 B에게 (\d+) 피해/) || [])[1];
  check("frenzy: neighbor takes half of the hit", main > 0 && Math.abs(spl - main / 2) <= 1, `${main} / ${spl}`);
  check("no page errors", errors.length === 0, errors.join("; "));
  await ctx.close();

  // 4. 서버: 흡혈 상한, 받는 피해 감소가 장비 보기에
  const post = (guest, body) => fetch("http://127.0.0.1:8105/api.php?r=score", { method: "POST", headers: { "Content-Type": "application/json", Origin: ORIGIN.slice(0, -1), "X-Guest-Id": guest }, body: JSON.stringify(body) }).then(r => r.json());
  const me = (guest) => fetch(`http://127.0.0.1:8105/api.php?r=me`, { headers: { Origin: ORIGIN.slice(0, -1), "X-Guest-Id": guest } }).then(r => r.json());
  const player = async (guest) => (await fetch(`http://127.0.0.1:8105/api.php?r=player&id=${(await me(guest)).id}`, { headers: { Origin: ORIGIN.slice(0, -1) } })).json();
  const ref = (it) => ({ seed: it.seed, src: it.src, lvl: it.lvl, v: 4, enh: 0, id: it.id, r: it.r });
  await post("bal-guest-0001", { stage: 40, plvl: 20, gear: lsItems.map(ref) });
  check("server: lifesteal capped at 20", (await player("bal-guest-0001")).gear.stats.lifesteal === 20);
  await post("bal-guest-0002", { stage: 40, plvl: 20, gear: trial.map(ref) });
  const pg = await player("bal-guest-0002");
  // 세트 효과 글자는 서버가 보내지 않음 (dc#97): 세트 id로 화면이 지금 규칙의 문구를 그림
  check("server: trial 5-set → dmgReduce 10, set id only (page shows the new text)", pg.gear.stats.dmgReduce === 10 && pg.gear.sets.some(s => s.id === "trial") && !/[가-힣]/.test(JSON.stringify(pg.gear.sets)) && I.SETS.trial.bonuses[2].text.includes("받는 피해 −10%"));
  // 5. 예전에 저장된 장비 기록(흡혈 26%, 5세트 흡혈 +8% 설명)도 보여줄 때 지금 규칙으로
  {
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(DB);
    const row = db.prepare("SELECT pkey, stage_gear FROM players_v4 WHERE pub_id = ?").get((await me("bal-guest-0002")).id);
    const g = JSON.parse(row.stage_gear);
    delete g.bal; g.stats.lifesteal = 26; delete g.stats.dmgReduce;
    g.sets = g.sets.map(st => st.name === "시험의 세트" ? { ...st, bonuses: st.bonuses.map(b => b.count === 5 ? { ...b, text: "치명타 피해 +100%, 흡혈 +8%, 적을 쓰러뜨리면 최대 HP의 15% 회복" } : b) } : st);
    db.prepare("UPDATE players_v4 SET stage_gear = ? WHERE pkey = ?").run(JSON.stringify(g), row.pkey);
    db.close();
    const old = await player("bal-guest-0002");
    check("old ranking snapshot shown with the new rules (26 − 8 = 18%, 받는 피해 −10%, new text)", old.gear.stats.lifesteal === 18 && old.gear.stats.dmgReduce === 10 && old.gear.sets.some(s => s.id === "trial") && !JSON.stringify(old.gear.sets).includes("흡혈 +8%"), JSON.stringify(old.gear.stats));
  }
} finally { await browser.close(); php.kill(); }
check("no php errors", !/Fatal|Warning|Notice|Deprecated/.test(phpErr), phpErr.slice(0, 400));
const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
