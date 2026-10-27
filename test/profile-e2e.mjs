// 계정 저장(서버) 브라우저 테스트: 같은 계정으로 여러 기기(브라우저) + PHP 서버
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
const require = createRequire(process.env.NODE_PATH + "/");
const { chromium, devices } = require("playwright");
const REPO = process.argv[2], SHOTS = process.argv[3];
const DIR = path.dirname(new URL(import.meta.url).pathname) + "/php";
const RL = createRequire(import.meta.url)(path.join(REPO, "items.js"));
const DB = path.join(DIR, "profile-e2e.sqlite");
for (const f of [DB, DB + "-wal", DB + "-shm"]) fs.rmSync(f, { force: true });
fs.writeFileSync(path.join(DIR, "config.profile-e2e.php"), `<?php\n$c = require __DIR__ . '/config.test.php';\nreturn array_merge($c, ['db_dsn' => 'sqlite:${DB}']);\n`);
const SECRET = "profile-e2e-secret";
const ORIGIN = "https://hucksoon.github.io/hucksoon/";
const API = "http://127.0.0.1:8094/api.php";
const results = [];
const check = (n, ok, x = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x && !ok ? " — " + x : ""}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
// PROFILE_SLOW=ms: 계정 저장 응답을 늦춰서 느린 환경(전체 테스트 실행 중)을 흉내
const SLOW = Number(process.env.PROFILE_SLOW || 0);
const waitFor = async (fn, ms = 10000) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (await fn()) return true; } catch {} await sleep(150); } return false; };

const php = spawn("php", ["-S", "127.0.0.1:8094", "-t", path.join(REPO, "ranking-php")], { env: { ...process.env, PHP_CLI_SERVER_WORKERS: "4", RANKING_CONFIG: path.join(DIR, "config.profile-e2e.php"), TEST_JWT_SECRET: SECRET }, stdio: ["ignore", "ignore", "pipe"] });
let phpErr = ""; php.stderr.on("data", d => phpErr += d);
await sleep(700);

const b64u = (s) => Buffer.from(s).toString("base64url");
const jwt = (sub, email) => { const h = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" })), p = b64u(JSON.stringify({ sub, email, exp: Math.floor(Date.now() / 1000) + 7200, xsolla_login_project_id: "30375188-893b-4b1a-ba1b-c8ba692fa5e3" })); return `${h}.${p}.${crypto.createHmac("sha256", SECRET).update(`${h}.${p}`).digest("base64url")}`; };
const authOf = (sub, email) => JSON.stringify({ access: jwt(sub, email), refresh: "r", exp: Date.now() + 7200_000 });
const save = (gold, best = 5, rid = "pf-" + gold) => JSON.stringify({ v: 1, f50: 1, best, run: { d: best, hp: 300, mh: 300, a: 50, g: gold, p: 2, l: 5, x: 0, xn: 1e9, rid, k: 0, pp: 0 } });
const inv = (bag, stones = 0) => JSON.stringify({ bag, equip: Object.fromEntries(RL.SLOTS.map(s => [s, null])), log: [{ ev: "get", id: "old-log" }], stones });
const find = (pred, tag) => { for (let n = 0; n < 200000; n++) { const it = RL.generate(`${tag}${n}|shop|d5|s${n % 6}`, "golden", 5); if (pred(it)) return it; } };
const rare = find(x => x.rarity === "rare", "pa");
const epic = find(x => x.rarity === "epic", "pb");
const uncommon = find(x => x.rarity === "rare", "pc");
const boxItem = find(x => x.rarity === "rare", "box");

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
// attrs: 예전 방식(Xsolla 계정 속성) 저장본. login: 로그인 창 흐름용 (토큰 발급)
async function open(storage, { attrs = {}, loginAs = null, opts = { viewport: { width: 1280, height: 1000 } } } = {}) {
  const ctx = await browser.newContext(opts); const page = await ctx.newPage(); const errors = [], logs = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("dialog", d => d.accept());
  await ctx.route(ORIGIN + "**", r => { const f = new URL(r.request().url()).pathname.replace("/hucksoon/", "") || "index.html";
    if (f === "ranking-config.js") return r.fulfill({ contentType: "text/javascript", body: `window.RANKING_API = ${JSON.stringify(API)};` });
    const p = path.join(REPO, f); if (!fs.existsSync(p)) return r.fulfill({ status: 404, body: "" });
    r.fulfill({ contentType: f.endsWith(".js") ? "text/javascript" : "text/html", body: fs.readFileSync(p) }); });
  const state = { down: false, profileCalls: [], profileDone: [] };  // profileDone: 응답까지 받은 요청
  await ctx.route(API + "**", async r => {
    const req = r.request();
    if (req.url().includes("r=profile")) state.profileCalls.push(req.method());
    if (state.down) return r.fulfill({ status: 503, contentType: "application/json", body: '{"error":"down"}' });
    const res = await fetch(req.url(), { method: req.method(), headers: req.headers(), body: ["GET", "OPTIONS"].includes(req.method()) ? undefined : req.postData() });
    if (SLOW && req.url().includes("r=profile")) await sleep(SLOW);
    await r.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: Buffer.from(await res.arrayBuffer()) });
    if (req.url().includes("r=profile")) state.profileDone.push(req.method());
  });
  await ctx.route("https://login.xsolla.com/**", r => {
    const req = r.request(), u = new URL(req.url()), p = u.pathname.replace("/api", "");
    const json = (s, o) => r.fulfill({ status: s, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: o === undefined ? "" : JSON.stringify(o) });
    if (p.endsWith("/request")) return json(200, { operation_id: "op" });
    if (p.endsWith("/confirm")) return json(200, { login_url: `${ORIGIN}?code=C&state=${u.searchParams.get("state")}` });
    if (p === "/oauth2/token") return json(200, { access_token: jwt(loginAs.sub, loginAs.email), refresh_token: "R", expires_in: 3600 });
    if (p.endsWith("/attributes/users/me/get")) return json(200, Object.entries(attrs).map(([key, value]) => ({ key, permission: "private", value })));
    if (p.endsWith("/attributes/users/me/update")) { state.attrWrites = (state.attrWrites || 0) + 1; return json(204); }
    return json(404, {});
  });
  await ctx.addInitScript(s => { if (!sessionStorage.getItem("s")) { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); sessionStorage.setItem("s", 1); } }, storage);
  await page.goto(ORIGIN);
  return { ctx, page, errors, state };
}
const SUB = "pf-user", EMAIL = "pat@example.com";
const user = (extra = {}) => ({ rl_device_id: "dev-" + Math.random().toString(16).slice(2), rl_auth: authOf(SUB, EMAIL), ...extra });
const ls = (page, k) => page.evaluate(k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }, k);
const meta = (page, sub = SUB) => ls(page, `rl_profile:u:${sub}`);
const bagIds = async (page, sub = SUB) => ((await ls(page, `rl_inv:u:${sub}`))?.bag || []).map(x => x.id);
const gold = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("rl_save"))?.run?.g);
const logText = (page) => page.locator("#log").innerText();
const db = () => new DatabaseSync(DB);
const server = () => { const r = db().prepare("SELECT rev, data FROM profiles").all(); return r.length ? { rev: r[0].rev, data: JSON.parse(r[0].data) } : null; };
const synced = (page) => waitFor(async () => { const m = await meta(page); return m && !m.dirty && m.rev === server()?.rev; });

try {
  // ---- 1. 첫 기기: 이 브라우저에만 있던 가방·진행 상황을 서버로 올림 ----
  const A = await open(user({ rl_save: save(500), [`rl_inv:u:${SUB}`]: inv([rare], 7), [`rl_mail:u:${SUB}`]: JSON.stringify([{ item: boxItem, from: "box", order: 1, sku: "box" }]) }));
  check("A: uploads local data when server has none", await waitFor(() => server()?.rev >= 1), phpErr);
  await synced(A.page);
  let S = server();
  check("A: server has bag (incl. box item collected), stones, gold", S.data.inv.bag.some(x => x.id === rare.id) && S.data.inv.bag.some(x => x.id === boxItem.id) && S.data.inv.stones === 7 && S.data.save.run.g === 500, JSON.stringify(S.data).slice(0, 300));
  check("A: inventory log stays local (not sent)", !JSON.stringify(S.data).includes("old-log") && (await ls(A.page, `rl_inv:u:${SUB}`)).log.some(e => e.id === "old-log"));
  check("A: equip saved as object", S.data.inv.equip && !Array.isArray(S.data.inv.equip) && "weapon" in S.data.inv.equip);
  check("A: meta synced (rev, not dirty)", (await meta(A.page)).dirty === false);
  check("A: logged-in → guest note hidden", await A.page.locator("#guest-note").isHidden());
  check("A: log says saved to account", (await logText(A.page)).includes("계정에 저장한다"));
  check("A: no attribute writes when game server exists", !A.state.attrWrites);

  // ---- 2. 두 번째 기기(빈 브라우저): 서버 저장본을 받음 ----
  const B = await open(user());
  check("B: gets bag from server", await waitFor(async () => (await bagIds(B.page)).includes(rare.id)));
  check("B: gets gold/progress from server", await gold(B.page) === 500, String(await gold(B.page)));
  check("B: stats show server gold", await waitFor(async () => (await B.page.locator("#stats").innerText()).includes("500")));
  check("B: log says loaded", (await logText(B.page)).includes("계정에 저장된 진행 상황을 불러왔다"));
  check("B: box item not duplicated", (await bagIds(B.page)).filter(id => id === boxItem.id).length === 1);
  await synced(B.page);

  // ---- 3. B에서 판매 → 서버에 올라감 → A를 새로고침하면 반영 ----
  const revBefore = server().rev;
  await B.page.click("#inv-btn");
  await B.page.locator(".bag-item", { hasText: RL.itemName(rare) }).first().click();
  await B.page.getByRole("button", { name: /^판매 \(강화석 \+\d+ · 골드 \+[\d,]+\)$/ }).click();
  await B.page.keyboard.press("Escape");
  check("B: sale pushed to server within ~3s", await waitFor(() => server().rev > revBefore && !server().data.inv.bag.some(x => x.id === rare.id), 6000));
  check("B: stones increased on server", server().data.inv.stones > 7, String(server().data.inv.stones));
  await synced(B.page);
  await A.page.reload();
  check("A: after reload, server (newer) wins: sold item gone", await waitFor(async () => !(await bagIds(A.page)).includes(rare.id)));
  check("A: stones match server", await waitFor(async () => (await ls(A.page, `rl_inv:u:${SUB}`)).stones === server().data.inv.stones));
  await synced(A.page);

  // ---- 4. 두 기기가 동시에 바꾸면: 늦게 올린 쪽이 서버 기준으로 바뀜 (서로 지우지 않음) ----
  await A.page.click("#inv-btn");
  await A.page.locator(".bag-item", { hasText: RL.itemName(boxItem) }).first().click();
  await A.page.getByRole("button", { name: "장착", exact: true }).click();
  await A.page.keyboard.press("Escape");
  check("A: equip pushed", await waitFor(() => server().data.inv.equip[boxItem.slot]?.id === boxItem.id, 6000));
  // B는 아직 옛 rev → B가 바꾸면 conflict
  const bRev = (await meta(B.page)).rev;
  check("B still on older rev", bRev < server().rev);
  await B.page.evaluate(() => { const k = Object.keys(localStorage).find(k => k.startsWith("rl_dex:u:")); });
  await B.page.click("#inv-btn");
  await B.page.locator(".bag-item", { hasText: RL.itemName(boxItem) }).first().click();
  await B.page.getByRole("button", { name: /^판매 \(강화석 \+\d+ · 골드 \+[\d,]+\)$/ }).click();
  await B.page.keyboard.press("Escape");
  check("B: conflict → takes server state (A's equip), message shown", await waitFor(async () => (await logText(B.page)).includes("다른 기기에서 저장한 진행 상황으로 바꿨다"), 6000));
  const bInv = await ls(B.page, `rl_inv:u:${SUB}`);
  check("B: now has A's equipped item (sale on stale copy discarded)", bInv.equip[boxItem.slot]?.id === boxItem.id, JSON.stringify(bInv.equip));
  check("server still has A's equip", server().data.inv.equip[boxItem.slot]?.id === boxItem.id);
  check("B: meta matches server after conflict", await synced(B.page));

  // ---- 5. 서버가 잠깐 안 될 때: 게임은 계속, 나중에 올림 ----
  B.state.down = true;
  await B.page.click("#inv-btn");
  await B.page.locator(".slot", { hasText: "투구" }).or(B.page.locator(".slot").filter({ has: B.page.locator(`text=${RL.itemName(boxItem)}`) })).first().click();
  await B.page.getByRole("button", { name: "해제" }).click();
  await B.page.keyboard.press("Escape");
  check("B: server down → error logged once, dirty kept", await waitFor(async () => (await logText(B.page)).includes("계정에 저장하지 못했다") && (await meta(B.page)).dirty === true, 6000));
  check("B: no page errors while down", B.errors.length === 0, B.errors.join("; "));
  B.state.down = false;
  check("B: retries and saves when server is back", await waitFor(() => !server().data.inv.equip[boxItem.slot], 20000));
  await synced(B.page);

  // ---- 6. 로그아웃: 남은 변경을 올리고 게스트로 ----
  await B.page.click("#account-btn");
  check("B: logout → guest, guest note shown", await waitFor(async () => (await B.page.locator("#account-btn").innerText()) === "계정 연결" && await B.page.locator("#guest-note").isVisible()));

  // ---- 7. 게스트로 모은 장비를 들고 로그인: 계정 저장본 + 게스트 장비 ----
  const guestDev = "guest-dev-1234";
  const C = await open({ rl_device_id: guestDev, rl_save: save(42, 2, "guest-run"), [`rl_inv:g:${guestDev}`]: inv([epic]) }, { loginAs: { sub: SUB, email: EMAIL } });
  check("C (guest): guest note visible", await C.page.locator("#guest-note").isVisible());
  check("C (guest): no profile calls as guest", C.state.profileCalls.length === 0, C.state.profileCalls.join(","));
  await C.page.click("#account-btn");
  await C.page.fill("#login-id", EMAIL);
  await C.page.click('#step-id button[type="submit"]');
  await C.page.fill("#login-code", "123456");
  await C.page.click('#step-code button[type="submit"]');
  check("C: logged in", await waitFor(async () => (await C.page.locator("#account-btn").innerText()) === "로그아웃"));
  check("C: guest epic merged into account and saved to server", await waitFor(() => server().data.inv.bag.some(x => x.id === epic.id), 8000));
  check("C: account's server items kept too", server().data.inv.bag.some(x => x.id === boxItem.id) && server().data.inv.stones > 7);
  check("C: account progress (gold 500 + sell gold) wins over guest run (42)", await gold(C.page) === 500 + RL.sellGold(rare) && server().data.save.run.g === 500 + RL.sellGold(rare), String(await gold(C.page)));
  check("C: guest inventory removed", await ls(C.page, `rl_inv:g:${guestDev}`) === null);
  await synced(C.page);

  // ---- 8. 예전 방식(계정 속성) 저장본이 있는 사용자: 처음엔 그걸로 진행 상황을 이어서 서버에 ----
  const SUB2 = "pf-old", EMAIL2 = "old@example.com";
  const D = await open({ rl_device_id: "d-dev", rl_auth: authOf(SUB2, EMAIL2), rl_save: save(10, 1, "stale"), [`rl_inv:u:${SUB2}`]: inv([uncommon]) }, { attrs: { roguelike_save: save(777, 6, "attr-run") } });
  const s2 = () => { const r = db().prepare("SELECT rev, data FROM profiles ORDER BY updated_at DESC").all().map(x => JSON.parse(x.data)); return r.find(d => d.save?.run?.rid === "attr-run"); };
  check("D: attribute save migrated (gold 777) with local bag", await waitFor(() => s2()?.save.run.g === 777 && s2().inv.bag.some(x => x.id === uncommon.id), 8000));
  check("D: game shows migrated gold", await gold(D.page) === 777);

  // ---- 8c. 요청 줄이기: 던전에서 이동·전투는 1분에 한 번, 아이템은 2초, 탭을 숨기면 바로, 같으면 안 보냄 ----
  const SUB3 = "pf-move";
  // 새로고침 때 처음 보는 몬스터가 있으면 도감이 바뀌어 저장되므로, 미리 모두 본 것으로
  const MON = createRequire(import.meta.url)(path.join(REPO, "monsters.js"));
  const allSeen = Object.fromEntries([...MON.MONSTERS.map(m => m.id), ...MON.BOSSES.map(b => b.id), MON.GOLDEN.id].map(k => [k, true]));
  // 포션 쿨타임(pc)이 남아 있으면 턴마다 줄어서 저장 내용이 반드시 바뀜. 없으면 벽에 막히거나 몬스터가 없을 때
  // 저장 내용이 그대로라 "올릴 것 없음"이 되어 아래 확인이 무작위로 어긋남 (던전 배치는 매번 다름)
  const moveSave = JSON.stringify({ ...JSON.parse(save(300, 3, "move-run")), run: { ...JSON.parse(save(300, 3, "move-run")).run, pc: 10 } });
  const F = await open({ rl_device_id: "f-dev", rl_auth: authOf(SUB3, "mv@example.com"), rl_save: moveSave, [`rl_inv:u:${SUB3}`]: inv([]), [`rl_dex:u:${SUB3}`]: JSON.stringify({ seen: allSeen, kills: {} }) });
  const posts = () => F.state.profileCalls.filter(m => m === "POST").length;
  const fRow = () => db().prepare("SELECT rev, data FROM profiles").all().map(r => ({ rev: r.rev, data: JSON.parse(r.data) })).find(r => r.data.save?.run?.rid === "move-run");
  // 서버에 저장된 것뿐 아니라 게임이 응답까지 받아야(rev 1, 저장 완료) 새로고침해도 다시 올리지 않음
  check("F: first upload", await waitFor(async () => fRow()?.rev === 1 && (await meta(F.page, SUB3))?.rev === 1 && !(await meta(F.page, SUB3)).dirty));
  await F.page.evaluate(() => sessionStorage.setItem("rl_scene", "dungeon"));
  const gets = () => F.state.profileDone.filter(m => m === "GET").length, g0 = gets();
  await F.page.reload();
  // 새로고침 뒤 서버와 맞추기(GET)가 끝나야 이동을 "1분 뒤 저장"으로 미룸. 그 전에 움직이면 맞춘 직후 바로 올림
  // 고정 시간만 기다리면 느린 환경에서 이동 중에 맞추기가 끝나 업로드가 생김 → 응답을 받을 때까지 기다림
  check("F: synced with server after reload", await waitFor(() => gets() > g0, 15000));
  await sleep(800);
  const p0 = posts();
  check("F: reload with nothing changed → no upload", p0 === 1, String(p0));
  for (const k of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " ", " ", "ArrowLeft", "ArrowRight"]) { await F.page.keyboard.press(k); await sleep(120); }
  await sleep(4000);
  check("F: moving in dungeon → no upload within 4s (waits up to 1 minute)", posts() === p0, String(posts()));
  check("F: but marked as not yet saved", (await meta(F.page, SUB3)).dirty === true);
  await F.page.evaluate(() => { Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true }); document.dispatchEvent(new Event("visibilitychange")); });
  check("F: hiding the tab uploads right away", await waitFor(() => posts() === p0 + 1 && fRow().rev === 2, 4000), String(posts()));
  await F.page.evaluate(() => { Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true }); });
  check("F: synced after hide", await waitFor(async () => (await meta(F.page, SUB3))?.dirty === false, 6000));
  await F.page.evaluate(() => { Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true }); document.dispatchEvent(new Event("visibilitychange")); Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true }); });
  await sleep(1000);
  check("F: hiding again with no changes → no upload", posts() === p0 + 1, String(posts()));

  // ---- 8b. 로그인할 때 서버가 안 되면: 게스트 장비는 그대로 두었다가, 다음에 서버와 맞출 때 옮김 ----
  const eDev = "e-guest-dev";
  const legend = find(x => x.rarity === "legendary", "pe");
  const E = await open({ rl_device_id: eDev, [`rl_inv:g:${eDev}`]: inv([legend]) }, { loginAs: { sub: SUB, email: EMAIL } });
  E.state.down = true;
  await E.page.click("#account-btn");
  await E.page.fill("#login-id", EMAIL);
  await E.page.click('#step-id button[type="submit"]');
  await E.page.fill("#login-code", "123456");
  await E.page.click('#step-code button[type="submit"]');
  check("E: login while server down → error shown", await waitFor(async () => (await logText(E.page)).includes("계정 저장 데이터를 불러오지 못했다")));
  check("E: guest gear kept under guest key meanwhile", (await ls(E.page, `rl_inv:g:${eDev}`))?.bag.some(x => x.id === legend.id));
  check("E: nothing written to server while down", !server().data.inv.bag.some(x => x.id === legend.id));
  E.state.down = false;
  await E.page.reload();
  check("E: next sync moves leftover guest gear to account and server", await waitFor(() => server().data.inv.bag.some(x => x.id === legend.id), 8000));
  check("E: guest key removed after merge", await ls(E.page, `rl_inv:g:${eDev}`) === null);
  check("E: account progress kept (gold 500 + sell gold)", await gold(E.page) === 500 + RL.sellGold(rare), String(await gold(E.page)));

  // ---- 8d. 예전 주소에서 넘어온 계정 가방(rl_old:u:…): 서버 저장본을 받은 뒤 합쳐서 서버에 올림 ----
  const oldGear = find(x => x.rarity === "legendary", "oldsite");
  const OS = await open(user({ [`rl_old:u:${SUB}`]: JSON.stringify({ inv: inv([oldGear]) }) }));
  check("old-site gear merged after server load and saved to server", await waitFor(() => server().data.inv.bag.some(x => x.id === oldGear.id), 8000));
  check("server items kept alongside", server().data.inv.bag.some(x => x.id === epic.id));
  check("stash cleared after merge", await waitFor(async () => (await ls(OS.page, `rl_old:u:${SUB}`)) === null));
  check("old-site merge logged", (await logText(OS.page)).includes("예전 주소에 있던 장비 1개"));
  await synced(OS.page);

  // ---- 9. 휴대폰 화면: 게스트 안내 줄바꿈 확인 (스크린샷) ----
  const P = await open({ rl_device_id: "phone-dev" }, { opts: { ...devices["iPhone 13"] } });
  await P.page.screenshot({ path: path.join(SHOTS, "guest-note-phone.png") });
  const box = await P.page.locator("#guest-note").boundingBox();
  check("phone: guest note fits width", box && box.x >= 0 && box.x + box.width <= 390 + 1, JSON.stringify(box));
  await A.page.screenshot({ path: path.join(SHOTS, "profile-a.png") });

  for (const [n, x] of Object.entries({ A, B, C, D, E, F, OS, P })) check(`${n}: no page errors`, x.errors.length === 0, x.errors.join("; "));
  check("no php errors", !/Fatal|Warning|Notice|Deprecated/.test(phpErr), phpErr.slice(0, 400));
} finally {
  await browser.close();
  php.kill();
}
const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
