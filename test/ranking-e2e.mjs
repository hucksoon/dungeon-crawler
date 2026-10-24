// 랭킹 E2E: 실제 게임/대시보드 + PHP 서버(api.php, sqlite) + HS256 테스트 토큰
// (예전에는 Cloudflare Worker 버전을 검사했음 → ranking-e2e.worker-old.mjs.bak. 지금 운영 서버는 PHP)
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
const require = createRequire(process.env.NODE_PATH + "/");
const { chromium, devices } = require("playwright");

const REPO = process.argv[2];
const SHOTS = process.argv[3];
const RL = createRequire(import.meta.url)(path.join(REPO, "items.js"));
const ORIGIN = "https://hucksoon.github.io/hucksoon/";
const API = "http://127.0.0.1:8128/api.php";
const PROJECT = "30375188-893b-4b1a-ba1b-c8ba692fa5e3";
const SECRET = "ranking-e2e-secret";

const results = [];
const check = (n, ok, x = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x && !ok ? " — " + x : ""}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const waitFor = async (fn, ms = 10000) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (await fn()) return true; } catch {} await sleep(200); } return false; };

// ---- PHP 서버 (dev_emails: dev1@example.com, Dev2@Example.com — config.test.php)
const DIR = path.dirname(new URL(import.meta.url).pathname) + "/php";
const DBF = path.join(DIR, "ranking-e2e.sqlite");
for (const f of [DBF, DBF + "-wal", DBF + "-shm"]) fs.rmSync(f, { force: true });
const CFG = path.join(DIR, "config.ranking-e2e.php");
fs.writeFileSync(CFG, `<?php\n$c = require __DIR__ . '/config.test.php';\nreturn array_merge($c, ['db_dsn' => 'sqlite:${DBF}']);\n`);
const php = spawn("php", ["-S", "127.0.0.1:8128", "-t", path.join(REPO, "ranking-php")], { env: { ...process.env, RANKING_CONFIG: CFG, TEST_JWT_SECRET: SECRET }, stdio: ["ignore", "ignore", "pipe"] });
let phpErr = ""; php.stderr.on("data", d => phpErr += d);
await sleep(700);

const b64u = (s) => Buffer.from(s).toString("base64url");
const token = (sub, email) => { const h = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" })), p = b64u(JSON.stringify({ sub, email, exp: Math.floor(Date.now() / 1000) + 7200, xsolla_login_project_id: PROJECT })); return `${h}.${p}.${crypto.createHmac("sha256", SECRET).update(`${h}.${p}`).digest("base64url")}`; };
const authOf = (sub, email) => JSON.stringify({ access: token(sub, email), refresh: "r", exp: Date.now() + 7200_000 });

// 서버가 시드로 다시 만들 수 있는 아이템 (상점 시드 모양, 5레벨)
const find = (rarity, tag) => { for (let n = 0; n < 200000; n++) { const it = RL.generate(`${tag}${n}|shop|d5|s${n % 6}`, "golden", 5); if (it.rarity === rarity && !RL.isAccessory(it)) return it; } throw new Error("not found " + rarity); };
const ref = (it, enh = 0) => ({ seed: it.seed, src: it.src, lvl: it.lvl, v: it.v, enh, id: it.id, ...(it.r ? { r: it.r } : {}) });

let apiCalls = [];
const routeOf = (u) => new URL(u).searchParams.get("r") || "";
async function serveApi(route) {
  const req = route.request();
  apiCalls.push(`${req.method()} ${routeOf(req.url())}`);
  const res = await fetch(req.url(), { method: req.method(), headers: { ...req.headers(), origin: "https://hucksoon.github.io" }, body: ["GET", "OPTIONS"].includes(req.method()) ? undefined : req.postData() });
  await route.fulfill({ status: res.status, headers: { "content-type": "application/json", "access-control-allow-origin": "*" }, body: await res.text() });
}

// 다른 플레이어 기록을 미리 넣어 둠
async function seed(headers, body) {
  const r = await fetch(API + "?r=score", { method: "POST", headers: { "Content-Type": "application/json", ...headers, Origin: "https://hucksoon.github.io" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(await r.text());
}
const epicAxe = find("epic", "rk-e"), legHelm = find("legendary", "rk-l");
await seed({ Authorization: `Bearer ${token("s1", "seojun.kim@gmail.com")}` }, { stage: 12, plvl: 10, item: ref(epicAxe, 7) });
await seed({ Authorization: `Bearer ${token("s2", "minji@naver.com")}` }, { stage: 5, plvl: 5, item: ref(legHelm, 1) });
await seed({ "X-Guest-Id": "77aa88bb-1111-4000-8000-000000000000" }, { stage: 3, plvl: 3, item: null });

// ---- 브라우저
function invData(bag) { return JSON.stringify({ bag, equip: Object.fromEntries(RL.SLOTS.map(s => [s, null])), log: [] }); }
async function open(browser, { config = API, storage = {}, ctxOpts = { viewport: { width: 1280, height: 860 } }, url = ORIGIN } = {}) {
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  const t = { ctx, page, errors: [] };
  page.on("pageerror", e => t.errors.push(e.message));
  page.on("dialog", d => d.dismiss());
  await ctx.route(ORIGIN + "**", r => {
    const f = new URL(r.request().url()).pathname.replace("/hucksoon/", "") || "index.html";
    if (f === "ranking-config.js") return r.fulfill({ contentType: "text/javascript", body: `window.RANKING_API = ${JSON.stringify(config)};` });
    const p = path.join(REPO, f);
    if (!fs.existsSync(p)) return r.fulfill({ status: 404 });
    return r.fulfill({ contentType: f.endsWith(".js") ? "text/javascript" : "text/html", body: fs.readFileSync(p) });
  });
  await ctx.route(API + "**", serveApi);
  await ctx.route("https://login.xsolla.com/**", r => r.fulfill({ contentType: "application/json", body: r.request().url().includes("/get") ? "[]" : "{}" }));
  await ctx.addInitScript(s => { if (!sessionStorage.getItem("seeded")) { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); sessionStorage.setItem("seeded", "1"); } }, storage);
  await page.goto(url);
  return t;
}
const db = new DatabaseSync(DBF);
const rows = () => db.prepare("SELECT * FROM players_v4").all();
const save = (d) => JSON.stringify({ v: 1, season: 4, best: d, run: { d, hp: 40, mh: 40, a: 5, g: 10, p: 1, l: 3, x: 0, xn: 30, rid: "e2e" + d, k: 0, pp: 0 } });
const notices = (dev) => Object.fromEntries(["rl_notice_v4", "rl_notice_75", "rl_notice_1021g", "rl_notice_1021h", "rl_notice_1021i", "rl_notice_1021j", "rl_notice_1022a", "rl_notice_1022b", "rl_notice_1023a", "rl_notice_1023b", "rl_notice_1023c", "rl_notice_1023d"].map(k => [`${k}:${dev}`, "1"]));

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
try {
  // 1) 게스트: 7층 + 레어+9 / 에픽+2 → 에픽+2가 최고 (등급 먼저)
  const GUEST = "c0ffee12-3456-4789-8abc-def012345678";
  {
    apiCalls = [];
    const bag = [{ ...find("rare", "g-r"), enh: 9 }, { ...find("epic", "g-e"), enh: 2 }];
    const t = await open(browser, { storage: { rl_device_id: GUEST, rl_save: save(7), [`rl_inv:g:${GUEST}`]: invData(bag), ...notices("g:" + GUEST) } });
    check("game: ranking button links to ranking.html", (await t.page.locator("#rank-btn").getAttribute("href")) === "ranking.html" && await t.page.locator("#rank-btn").isVisible());
    const ok = await waitFor(() => rows().some(r => r.display === "게스트 #c0ffee"));
    const r = rows().find(r => r.display === "게스트 #c0ffee");
    check("guest score submitted after boot", ok && r.best_stage === 7, JSON.stringify(r));
    check("guest best item = epic +2 (rarity before enhancement)", r?.item_rarity === "epic" && r.item_enh === 2, `${r?.item_rarity} +${r?.item_enh}`);
    check("guest row stores no device id", !JSON.stringify(rows()).includes(GUEST));
    // 아무것도 안 바뀌면 다시 보내지 않음 (로비 위치 알림은 따로 계속)
    const n = apiCalls.filter(c => c === "POST score").length;
    for (let i = 0; i < 5; i++) await t.page.keyboard.press(" ");
    await sleep(3500);
    check("no resubmit when nothing changed", apiCalls.filter(c => c === "POST score").length === n && n === 1, apiCalls.filter(c => c.includes("score")).join(","));
    check("game: no page errors", t.errors.length === 0, t.errors.join("; "));
    await t.ctx.close();
  }

  // 2) 로그인 사용자: 토큰으로 제출, 가린 이메일
  {
    const t = await open(browser, { storage: { rl_auth: authOf("s-user", "hyunwoo.park@xsolla.example"), rl_save: save(9), rl_device_id: "dddddddd-0000", [`rl_inv:u:s-user`]: invData([{ ...find("legendary", "u-l"), enh: 3 }]), ...notices("u:s-user") } });
    const ok = await waitFor(() => rows().some(r => r.kind === "user" && r.best_stage === 9), 15000);
    const r = rows().find(r => r.best_stage === 9);
    check("logged-in user submitted with masked email", ok && r.display === "hyu***@xsolla.example", r?.display);
    check("raw email not in DB", !JSON.stringify(rows()).includes("hyunwoo.park"));
    check("user item legendary +3", r?.item_rarity === "legendary" && r.item_enh === 3, `${r?.item_rarity} +${r?.item_enh}`);
    await t.ctx.close();
  }

  // 3) 개발자 계정: 보내도 기록되지 않음
  {
    const before = rows().length;
    apiCalls = [];
    const t = await open(browser, { storage: { rl_auth: authOf("s-dev", "Dev1@Example.com"), rl_save: save(30), [`rl_inv:u:s-dev`]: invData([{ ...find("legendary", "d-l"), enh: 10 }]), ...notices("u:s-dev") } });
    await waitFor(() => apiCalls.includes("POST score"), 15000);
    await sleep(600);
    check("developer submission sent but not stored", apiCalls.includes("POST score") && rows().length === before && !rows().some(r => r.best_stage === 30), apiCalls.filter(c => c.includes("score")).join(","));
    await t.page.goto(ORIGIN + "ranking.html");
    await t.page.waitForSelector("#board-stage li");
    await waitFor(async () => (await t.page.locator("#me").innerText()).length > 0);
    check("dashboard tells developer they're excluded", (await t.page.locator("#me").innerText()).includes("개발자 계정"), await t.page.locator("#me").innerText());
    await t.ctx.close();
  }

  // 4) 대시보드 (게스트 본인 시점)
  {
    const t = await open(browser, { url: ORIGIN + "ranking.html", storage: { rl_device_id: GUEST } });
    await t.page.waitForSelector("#board-stage li");
    await t.page.waitForSelector("#board-item li");
    const stage = await t.page.locator("#board-stage li").allInnerTexts();
    const item = await t.page.locator("#board-item li").allInnerTexts();
    console.log("stage board:", stage.map(s => s.replace(/\s+/g, " ")).join(" | "));
    console.log("item board: ", item.map(s => s.replace(/\s+/g, " ")).join(" | "));
    check("stage board order 12,9,7,5,3", stage.map(s => (s.match(/(\d+)층/) || [])[1]).join(",") === "12,9,7,5,3");
    check("item board: legendary first, then epic +7 before epic +2", item.length === 4 && /레전더리/.test(item[0]) && /레전더리/.test(item[1]) && item[2].includes("+7") && item[3].includes("게스트 #c0ffee"), JSON.stringify(item));
    await waitFor(async () => (await t.page.locator("#me").innerText()).includes("최고 층"));
    check("my rows highlighted (stage 3rd, item 4th)", (await t.page.locator("#board-stage li.me .rank").innerText()) === "🥉" && (await t.page.locator("#board-item li.me .rank").innerText()) === "4");
    check("my rank card", (await t.page.locator("#me").innerText()).includes("최고 층 3위 (7층)"), await t.page.locator("#me").innerText());
    const html = await t.page.content();
    check("no raw emails on page", !/seojun\.kim|minji@|hyunwoo\.park|dev1@/i.test(html));
    check("masked names shown", html.includes("seo***@gmail.com") && html.includes("m***@naver.com") && html.includes("게스트 #77aa88"));
    check("live status shows count", /실시간 .* 5명/.test(await t.page.locator("#updated").innerText()), await t.page.locator("#updated").innerText());
    await t.page.screenshot({ path: path.join(SHOTS, "ranking-desktop.png"), fullPage: true });
    // 새 기록이 생기면 10초 안에 반영
    await seed({ Authorization: `Bearer ${token("s9", "newbie@kakao.com")}` }, { stage: 20, plvl: 20, item: null });
    const live = await waitFor(async () => (await t.page.locator("#board-stage li").first().innerText()).includes("ne***@kakao.com"), 13000);
    check("auto-refresh picks up new #1 within 10s", live);
    check("dashboard: no page errors", t.errors.length === 0, t.errors.join("; "));
    await t.ctx.close();
  }

  // 5) 휴대폰 화면
  {
    const t = await open(browser, { storage: { rl_device_id: GUEST, ...notices("g:" + GUEST) }, ctxOpts: { ...devices["iPhone 13"] } });
    await sleep(500);
    check("phone: touch pad shown, top restart hidden", await t.page.locator("#touch-pad").isVisible() && await t.page.locator("#restart-btn").isHidden());
    check("phone: ranking button visible in game", await t.page.locator("#rank-btn").isVisible());
    const of2 = await t.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check("phone: game top bar doesn't overflow", of2 <= 0, String(of2));
    await t.page.screenshot({ path: path.join(SHOTS, "game-phone-top.png") });
    await t.page.goto(ORIGIN + "ranking.html");
    await t.page.waitForSelector("#board-item li");
    const overflow = await t.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check("phone: no horizontal scroll", overflow <= 0, String(overflow));
    await t.page.screenshot({ path: path.join(SHOTS, "ranking-phone.png"), fullPage: true });
    await t.ctx.close();
  }

  // 6) 서버 주소가 비어 있으면: 게임은 요청하지 않고, 대시보드는 준비 중
  {
    apiCalls = [];
    const t = await open(browser, { config: "", storage: { rl_device_id: GUEST, rl_save: save(4) } });
    await sleep(3500);
    check("disabled: game sends nothing", apiCalls.length === 0, apiCalls.join(","));
    await t.page.goto(ORIGIN + "ranking.html");
    check("disabled: dashboard says 준비 중", (await t.page.locator("#notice").innerText()).includes("준비"));
    check("disabled: no errors", t.errors.length === 0, t.errors.join("; "));
    await t.ctx.close();
  }

  // 7) 서버가 죽어도 게임은 정상
  {
    const t = await open(browser, { config: "https://down.test/api.php", storage: { rl_device_id: GUEST, rl_save: save(4) } });
    await t.ctx.route("https://down.test/**", r => r.abort());
    for (let i = 0; i < 3; i++) await t.page.keyboard.press(" ");
    await sleep(3500);
    check("server down: game has no errors", t.errors.length === 0, t.errors.join("; "));
    await t.page.goto(ORIGIN + "ranking.html");
    await sleep(800);
    check("server down: dashboard shows connection message", (await t.page.locator("#updated").innerText()).includes("연결하지 못했어요"));
    await t.ctx.close();
  }
} finally { await browser.close(); php.kill(); }
check("no php errors", !/Fatal|Warning|Notice|Deprecated/.test(phpErr), phpErr.slice(0, 400));
const failed = results.filter(x => !x).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
