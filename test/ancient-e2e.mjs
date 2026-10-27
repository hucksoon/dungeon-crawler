// 고대 3% (v4 r1): 새로 얻는 레전더리·세트의 3%가 모든 능력치 최대치. 예전 v4 아이템(r 없음)은 그대로, 버전은 v4
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import crypto from "node:crypto"; import fs from "node:fs"; import path from "node:path";
const require = createRequire(process.env.NODE_PATH + "/");
const { chromium } = require("playwright");
const REPO = process.argv[2], OUT = process.argv[3];
const I = createRequire(import.meta.url)(path.join(REPO, "items.js"));
// 서버는 아이템 값만 보냄 (dc#97): 참조로 다시 만든 이름 (서버가 이름 글자를 보내면 실패)
const nameOf = (v) => (v?.ref && !("name" in v) ? I.itemName(I.fromRef(v.ref, { gems: true })) : null);
const ORIGIN = "https://game.apacimtest.com/";
const results = []; const check = (n, ok, x = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x && !ok ? " — " + x : ""}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const find = (pred, tag, lvl = 60) => { for (let n = 0; n < 2e6; n++) { const it = I.generate(`${tag}${n}|shop|d${lvl}|s${n % 6}`, "golden", lvl); if (pred(it)) return it; } throw new Error(tag); };

// ---- 규칙 ----
check("version stays v4, rev ≥ 1, chance 3%", I.RULES_VERSION === 4 && I.RULES_REV >= 1 && I.ANCIENT.chance === 0.03);
const fresh = I.generate("f1|d10|k1", "drop", 10);
check("new items: v4 with the current r (≥ 1)", fresh.v === 4 && fresh.r === I.RULES_REV);
const oldV4 = I.generate("f1|d10|k1", "drop", 10, 4);
check("saved v4 ref without r regenerates as before (no r, different id)", oldV4.v === 4 && oldV4.r === undefined && oldV4.id !== fresh.id);
let top = 0, anc = 0, low = 0, badMax = 0;
for (let i = 0; i < 400000; i++) {
  const it = I.generate(`t${i}|d${1 + i % 150}|k${i}`, "golden", 1 + i % 150);
  if (I.isAccessory(it)) continue;   // 장신구는 줄이 적어 우연한 고대가 더 많음 (accessory-e2e에서 따로)
  if (it.ancient && it.rarity !== "legendary" && it.rarity !== "set") low++;
  if (it.rarity !== "legendary" && it.rarity !== "set") continue;
  top++; if (!it.ancient) continue; anc++;
  const allMax = it.main.every(([k, v]) => v === I.mainRange(k, it)[1]) && it.lines.every(([k, v]) => v === I.lineRangeOf(k, it)[1]) && (it.parry == null || it.parry === I.PARRY.ranges[it.rarity][1]);
  if (!allMax) badMax++;
}
const rate = anc / top;
check(`ancient ≈ 3% of legendary/set (${(rate * 100).toFixed(2)}% of ${top})`, rate > 0.026 && rate < 0.034);
check("every ancient has all stats (and parry) at max", badMax === 0 && anc > 0);
check("no ancient below legendary", low === 0);
let oldAnc = 0, oldTop = 0;
for (let i = 0; i < 100000; i++) { const it = I.generate(`t${i}|d50|k${i}`, "golden", 50, 4); if (it.rarity === "legendary" || it.rarity === "set") { oldTop++; if (it.ancient) oldAnc++; } }
check(`old v4 (no r) stays rare (${oldAnc} of ${oldTop})`, oldAnc / oldTop < 0.002);
const ancShield = find(x => x.ancient && x.type === "shield", "as");
check("ancient shield parry at max (25)", ancShield.parry === 25);
const ancItem = find(x => x.ancient && x.slot === "weapon", "aw");

// ---- 게임 ----
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
try {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 1000 } }); const page = await ctx.newPage(); const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await ctx.route(ORIGIN + "**", r => { const f = new URL(r.request().url()).pathname.slice(1) || "index.html";
    if (f === "ranking-config.js") return r.fulfill({ contentType: "text/javascript", body: 'window.RANKING_API = "";' });
    const p = path.join(REPO, f); if (!fs.existsSync(p)) return r.fulfill({ status: 404, body: "" });
    r.fulfill({ contentType: f.endsWith(".js") ? "text/javascript" : "text/html", body: fs.readFileSync(p) }); });
  await ctx.route("https://login.xsolla.com/**", r => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  const eq = Object.fromEntries(I.SLOTS.map(s => [s, null]));
  await ctx.addInitScript(([inv]) => { if (sessionStorage.getItem("seeded")) return; sessionStorage.setItem("seeded", 1); sessionStorage.setItem("rl_scene", "dungeon");
    localStorage.setItem("rl_device_id", "anc-dev-0001"); localStorage.setItem("rl_inv:g:anc-dev-0001", inv); }, [JSON.stringify({ bag: [ancItem, oldV4], equip: eq, log: [], stones: 0 })]);
  await page.goto(ORIGIN); await sleep(400);
  await page.keyboard.press("i"); await sleep(200);
  check("game: ancient item listed first with 고대 name and highlight", (await page.locator(".bag-item").first().getAttribute("class")).includes("ancient") && (await page.locator(".bag-item").first().innerText()).replace(/^[▲▼] /, "").startsWith("고대 "));
  await page.locator(".bag-item").first().click(); await sleep(100);
  const det = await page.locator("#inv-detail").innerText();
  check("game: detail says all stats max, every line ▲", det.includes("모든 능력치가 최대치") && (await page.locator("#inv-detail .stat-line.max").count()) === ancItem.main.length + ancItem.lines.length + (ancItem.parry != null ? 1 : 0), det);
  check("game: no legacy notice for r1/v4 items, no errors", !(await page.locator("#notice-modal").isVisible()) && errors.length === 0, errors.join("; "));
  await page.screenshot({ path: path.join(OUT, "ancient-r1.png") });
  await ctx.close();
} finally { await browser.close(); }

// ---- 서버 ----
const DIR = path.dirname(new URL(import.meta.url).pathname) + "/php";
const DB = path.join(DIR, "anc.sqlite"); for (const f of [DB, DB + "-wal", DB + "-shm"]) fs.rmSync(f, { force: true });
fs.writeFileSync(path.join(DIR, "config.anc.php"), `<?php\n$c = require __DIR__ . '/config.test.php';\nreturn array_merge($c, ['db_dsn' => 'sqlite:${DB}']);\n`);
const SECRET = "anc-secret";
const php = spawn("php", ["-S", "127.0.0.1:8097", "-t", path.join(REPO, "ranking-php")], { env: { ...process.env, RANKING_CONFIG: path.join(DIR, "config.anc.php"), TEST_JWT_SECRET: SECRET }, stdio: ["ignore", "ignore", "pipe"] });
let phpErr = ""; php.stderr.on("data", d => phpErr += d);
await sleep(700);
try {
  const b64u = (s) => Buffer.from(s).toString("base64url");
  const h = b64u(JSON.stringify({ alg: "HS256" })), pl = b64u(JSON.stringify({ sub: "anc-user", email: "anc@example.com", exp: Math.floor(Date.now() / 1000) + 3600, xsolla_login_project_id: "30375188-893b-4b1a-ba1b-c8ba692fa5e3" }));
  const token = `${h}.${pl}.${crypto.createHmac("sha256", SECRET).update(`${h}.${pl}`).digest("base64url")}`;
  const call = async (route, body) => (await fetch(`http://127.0.0.1:8097/api.php?r=${route}`, { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, Origin: ORIGIN.slice(0, -1) }, body: body && JSON.stringify(body) })).json();
  const ref = (it) => ({ seed: it.seed, src: it.src, lvl: it.lvl, v: it.v, enh: 0, id: it.id, ...(it.r ? { r: it.r } : {}) });
  await call("score", { stage: 60, plvl: 20, item: ref(ancItem), gear: [ref(ancItem), ref(oldV4)] });
  const rk = await call("ranking&type=item");
  const p = await call(`player&id=${rk.rows[0].id}`);
  check("server: r1 ancient verified, item board shows 고대 name", nameOf(rk.rows[0].item) === I.itemName(ancItem) && I.itemName(ancItem).startsWith("고대 "), JSON.stringify(rk.rows[0]));
  check("server: old v4 (no r) still verifies as gear, nothing rejected", !p.gear.rejected && p.gear.items.length === 2, JSON.stringify(p.gear.rejected));
  check("server view: ancient flag and all lines max", p.bestItem.ancient === true && [...p.bestItem.main, ...p.bestItem.lines].every(l => l.max));
  // 위조: r을 빼거나 다른 값으로 바꾸면 ID가 안 맞음, v3에 r 붙이기·r 2는 거부
  const forged = await call("score", { stage: 60, plvl: 20, item: { ...ref(ancItem), r: undefined }, gear: [{ ...ref(oldV4), r: 2 }, { ...ref(I.generate("q|d5|k1", "drop", 5, 3)), r: 1 }] });
  const p2 = await call(`player&id=${rk.rows[0].id}`);
  check("server: wrong r rejected (id mismatch / r2 / v3+r)", forged.ok && nameOf((await call("me")).item) === I.itemName(ancItem));
  const l = await call("market_list", { item: ref(ancItem), gold: 10, cash: 1, stage: 60 });
  check("market: new item listed, ref keeps its r and id", l.listing?.ref?.r === ancItem.r && l.listing.ref.id === ancItem.id && I.generate(l.listing.ref.seed, l.listing.ref.src, l.listing.ref.lvl, l.listing.ref.v, l.listing.ref.r).id === ancItem.id, JSON.stringify(l.listing?.ref));
  const l0 = await call("market_list", { item: ref(oldV4), gold: 10, cash: 0, stage: 60 });
  check("market: old v4 item ref has r:0 and regenerates", (l0.listing?.ref?.r ?? 0) === 0 && I.generate(l0.listing.ref.seed, l0.listing.ref.src, l0.listing.ref.lvl, l0.listing.ref.v, l0.listing.ref.r || 0).id === oldV4.id, JSON.stringify(l0));
  check("no php errors", !/Fatal|Warning|Notice|Deprecated/.test(phpErr), phpErr.slice(0, 400));
} finally { php.kill(); }
const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
