// 게임 + 랭킹 화면 → 실제 PHP 서버(php -S) 연결 확인
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
const require = createRequire(process.env.NODE_PATH + "/");
const { chromium, devices } = require("playwright");
const REPO = process.argv[2], SHOTS = process.argv[3];
const DIR = path.dirname(new URL(import.meta.url).pathname) + "/php";
fs.rmSync(path.join(DIR, "test.sqlite"), { force: true });
const ORIGIN = "https://hucksoon.github.io/hucksoon/";
const API = "http://127.0.0.1:8090/api.php";
const results = [];
const check = (n, ok, x = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x ? " — " + x : ""}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const waitFor = async (fn, ms = 10000) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (await fn()) return true; } catch {} await sleep(200); } return false; };
const php = spawn("php", ["-S", "127.0.0.1:8090", "-t", path.join(REPO, "ranking-php")], { env: { ...process.env, RANKING_CONFIG: path.join(DIR, "config.test.php") }, stdio: "ignore" });
await sleep(700);
const RL = createRequire(import.meta.url)(path.join(REPO, "items.js"));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
async function open(url, storage, opts = { viewport: { width: 1280, height: 900 } }) {
  const ctx = await browser.newContext(opts); const page = await ctx.newPage(); const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await ctx.route(ORIGIN + "**", r => { const f = new URL(r.request().url()).pathname.replace("/hucksoon/", "") || "index.html";
    if (f === "ranking-config.js") return r.fulfill({ contentType: "text/javascript", body: `window.RANKING_API = ${JSON.stringify(API)};` });
    const p = path.join(REPO, f); if (!fs.existsSync(p)) return r.fulfill({ status: 404, body: "" });
    r.fulfill({ contentType: f.endsWith(".js") ? "text/javascript" : "text/html", body: fs.readFileSync(p) }); });
  // https 페이지 → 127.0.0.1 요청은 Chrome이 막으므로(로컬 네트워크 보호) Node가 대신 PHP 서버로 전달
  await ctx.route(API + "**", async r => {
    const req = r.request();
    const res = await fetch(req.url(), { method: req.method(), headers: req.headers(), body: ["GET", "OPTIONS"].includes(req.method()) ? undefined : req.postData() });
    r.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: Buffer.from(await res.arrayBuffer()) });
  });
  await ctx.addInitScript(s => { if (!sessionStorage.getItem("s")) { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); sessionStorage.setItem("s", 1); } }, storage);
  await page.goto(url); return { ctx, page, errors };
}
try {
  const G = "c0ffee12-3456-4789-8abc-def012345678";
  // 게임 형식 시드(상점 6층은 아니라 5층: 상점은 5층마다)로 장착 장비 3개 + 가방에 에픽
  const findIt = (pred) => { for (let n = 0; n < 50000; n++) { const x = RL.generate(`e2eRun${n}|shop|d5|s${n % 6}`, "golden", 5); if (pred(x)) return x; } };
  const it = findIt(x => x.rarity === "epic");
  const w = findIt(x => x.slot === "weapon"), h = findIt(x => x.slot === "head"), c = findIt(x => x.slot === "chest");
  const equip = Object.fromEntries(RL.SLOTS.map(s => [s, null]));
  equip.weapon = { ...w, enh: 4 }; equip.head = h; equip.chest = { ...c, enh: 1 };
  const inv = JSON.stringify({ bag: [{ ...it, enh: 2 }], equip, log: [] });
  const RANK = { common: 0, uncommon: 1, rare: 2, epic: 3, set: 4, legendary: 5 };
  const best = [{ ...it, enh: 2 }, ...Object.values(equip).filter(Boolean)].sort((a, b) => (RANK[b.rarity] * 1e5 + (b.enh || 0) * 1e3 + b.lvl) - (RANK[a.rarity] * 1e5 + (a.enh || 0) * 1e3 + a.lvl))[0];
  const save = JSON.stringify({ v: 1, f50: 1, season: 4, best: 7, run: { d: 7, hp: 28, mh: 28, a: 5, g: 10, p: 1, l: 3, x: 0, xn: 30, rid: "e2e", k: 0, pp: 0 } });
  const t = await open(ORIGIN, { rl_device_id: G, rl_save: save, [`rl_inv:g:${G}`]: inv });
  const db = () => new DatabaseSync(path.join(DIR, "test.sqlite"));
  check("game → PHP: guest score stored with gear snapshot", await waitFor(() => fs.existsSync(path.join(DIR, "test.sqlite")) && db().prepare("SELECT best_stage, stage_gear FROM players_v4 WHERE display = ?").get("게스트 #c0ffee")?.stage_gear));
  const hud = { atk: await t.page.locator("#atk").innerText(), def: await t.page.locator("#def").innerText(), hp: (await t.page.locator("#hp").innerText()).split("/")[1] };
  const r = db().prepare("SELECT * FROM players_v4").get();
  check("game → PHP: best item verified (same as game rules), no raw device id", r.item_name === RL.itemName(best) && !JSON.stringify(r).includes(G), r.item_name + " vs " + RL.itemName(best));
  const snap = JSON.parse(r.stage_gear);
  check("snapshot stats equal the game's HUD", String(snap.stats.atk) === hud.atk && String(snap.stats.def) === hud.def && String(snap.stats.maxHp) === hud.hp, JSON.stringify({ hud, s: snap.stats }));
  check("snapshot has 3 equipped items, none rejected", snap.items.length === 3 && snap.rejected === 0);
  check("game: no page errors", t.errors.length === 0, t.errors.join("; "));
  await t.ctx.close();
  const d = await open(ORIGIN + "ranking.html", { rl_device_id: G });
  check("dashboard ← PHP: shows guest row highlighted as me", await waitFor(async () => (await d.page.locator("#board-stage li.me").count()) === 1 && (await d.page.locator("#board-stage li").first().innerText()).includes("게스트 #c0ffee")));
  check("dashboard: my rank card", (await d.page.locator("#me").innerText()).includes("최고 층 1위 (7층)"));
  check("dashboard: live status", (await d.page.locator("#updated").innerText()).includes("실시간"));
  await d.page.screenshot({ path: path.join(SHOTS, "php-ranking.png") });
  await d.page.locator("#board-stage li").first().click();
  check("click row → equipment modal", await waitFor(async () => (await d.page.locator("#player-body .pitems").first().locator(".pitem").count()) === 7));
  const mtxt = await d.page.locator("#player-modal").innerText();
  check("modal: stats match the game", mtxt.includes(`공격력\n${hud.atk}`) && mtxt.includes(`방어력\n${hud.def}`) && mtxt.includes(`최대 HP\n${hud.hp}`), mtxt.slice(0, 300).replace(/\n/g, " | "));
  check("modal: weapon +4 with enhancement note, 4 empty slots (7 slots)", mtxt.includes(RL.itemName({ ...w, enh: 4 })) && (await d.page.locator("#player-body .pitem.empty").count()) === 4 && mtxt.includes("(강화 +"));
  check("modal: best item section", mtxt.includes("가진 적 있는 최강 아이템") && mtxt.includes(RL.itemName(best)));
  await d.page.screenshot({ path: path.join(SHOTS, "php-gear-modal.png"), fullPage: true });
  await d.page.keyboard.press("Escape");
  check("Esc closes modal", await d.page.locator("#player-modal").isHidden());
  check("dashboard: no page errors", d.errors.length === 0, d.errors.join("; "));
  await d.ctx.close();
  // 휴대폰
  const m = await open(ORIGIN + "ranking.html", { rl_device_id: G }, { ...devices["iPhone 13"] });
  await m.page.locator("#board-stage li").first().waitFor();
  await m.page.locator("#board-stage li").first().tap();
  await waitFor(async () => (await m.page.locator("#player-body .pitems").first().locator(".pitem").count()) === 6);
  check("phone: modal fits without horizontal scroll", (await m.page.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0);
  await m.page.screenshot({ path: path.join(SHOTS, "php-gear-phone.png"), fullPage: true });
  await m.ctx.close();
} finally { await browser.close(); php.kill(); }
const failed = results.filter(x => !x).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
