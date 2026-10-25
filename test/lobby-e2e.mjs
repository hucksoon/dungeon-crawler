// 로비: PHP 서버(php -S) + 브라우저 두 개로 서로 보이는지, 입구·로비 이동, 쓰러진 판, 휴대폰
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
// 포탈 열기(P/L/버튼) 뒤 옆 칸의 파란 포탈로 걸어 들어감
async function stepIntoPortal(page) {
  await new Promise(r => setTimeout(r, 120));
  const L = await page.evaluate(() => JSON.parse(localStorage.getItem("rl_level") || "null"));
  if (!L?.tp) return false;
  const key = L.tp.x > L.px ? "ArrowRight" : L.tp.x < L.px ? "ArrowLeft" : L.tp.y > L.py ? "ArrowDown" : "ArrowUp";
  await page.keyboard.press(key);
  await new Promise(r => setTimeout(r, 200));
  return true;
}
const require = createRequire(process.env.NODE_PATH + "/");
const { chromium, devices } = require("playwright");
const REPO = process.argv[2], SHOTS = process.argv[3];
const DIR = path.dirname(new URL(import.meta.url).pathname) + "/php";
fs.rmSync(path.join(DIR, "test.sqlite"), { force: true });
for (const f of ["test.sqlite-wal", "test.sqlite-shm"]) fs.rmSync(path.join(DIR, f), { force: true });
const ORIGIN = "https://hucksoon.github.io/hucksoon/";
const API = "http://127.0.0.1:8093/api.php";
const SECRET = "lobby-test-secret";
const results = [];
const check = (n, ok, x = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x ? " — " + x : ""}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const waitFor = async (fn, ms = 10000) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (await fn()) return true; } catch {} await sleep(150); } return false; };
const php = spawn("php", ["-S", "127.0.0.1:8093", "-t", path.join(REPO, "ranking-php")], { env: { ...process.env, RANKING_CONFIG: path.join(DIR, "config.test.php"), TEST_JWT_SECRET: SECRET }, stdio: "ignore" });
await sleep(700);
const b64u = (s) => Buffer.from(s).toString("base64url");
const hs256 = (claims) => { const h = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" })), p = b64u(JSON.stringify(claims)); return `${h}.${p}.${crypto.createHmac("sha256", SECRET).update(`${h}.${p}`).digest("base64url")}`; };
const ping = async (who, body, raw) => {
  const headers = { "Content-Type": "application/json", Origin: "https://hucksoon.github.io" };
  if (who?.guest) headers["X-Guest-Id"] = who.guest;
  if (who?.token) headers.Authorization = `Bearer ${who.token}`;
  const res = await fetch(`${API}?r=lobby`, { method: "POST", headers, body: raw ?? JSON.stringify(body) });
  const text = await res.text(); let j = null; try { j = JSON.parse(text); } catch {}
  return { status: res.status, body: j, cors: res.headers.get("access-control-allow-origin") };
};
const db = () => new DatabaseSync(path.join(DIR, "test.sqlite"));
const row = (name) => db().prepare("SELECT * FROM presence WHERE display = ?").get(name);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
async function open(storage, opts = { viewport: { width: 1280, height: 1000 } }) {
  const ctx = await browser.newContext(opts); const page = await ctx.newPage(); const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("dialog", d => d.accept());
  await ctx.route(ORIGIN + "**", r => { const f = new URL(r.request().url()).pathname.replace("/hucksoon/", "") || "index.html";
    if (f === "ranking-config.js") return r.fulfill({ contentType: "text/javascript", body: `window.RANKING_API = ${JSON.stringify(API)};` });
    const p = path.join(REPO, f); if (!fs.existsSync(p)) return r.fulfill({ status: 404, body: "" });
    r.fulfill({ contentType: f.endsWith(".js") ? "text/javascript" : "text/html", body: fs.readFileSync(p) }); });
  await ctx.route(API + "**", async r => {
    const req = r.request();
    const res = await fetch(req.url(), { method: req.method(), headers: req.headers(), body: ["GET", "OPTIONS"].includes(req.method()) ? undefined : req.postData() });
    r.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: Buffer.from(await res.arrayBuffer()) });
  });
  await ctx.addInitScript(s => { if (!sessionStorage.getItem("s")) { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); sessionStorage.setItem("s", 1); } }, storage);
  await page.goto(ORIGIN); return { ctx, page, errors };
}
const inLobby = (page) => page.evaluate(() => document.body.classList.contains("in-lobby"));
// 마을(옆에서 보는 로비)에서 1층 문까지 걸어가 ↑로 들어감
import { goDoor } from "./town.mjs";
const walkToDoor = (page) => goDoor(page, "start");

try {
  // ---- API ----
  check("lobby: no identity → 401", (await ping(null, { scene: "lobby", x: 1, y: 1 })).status === 401);
  check("lobby: bad json → 400", (await ping({ guest: "aaaaaaaa-0000" }, null, "{")).status === 400);
  const a1 = await ping({ guest: "a1a1a1a1-0000" }, { scene: "lobby", x: 5, y: 6 });
  check("lobby: guest ping → me + list with my position, CORS ok", a1.status === 200 && a1.body.me.name === "게스트 #a1a1a1" && /^[0-9a-f]{16}$/.test(a1.body.me.id)
    && a1.body.players.some(p => p.id === a1.body.me.id && p.x === 5 && p.y === 6 && p.scene === "lobby") && a1.cors === "https://hucksoon.github.io", JSON.stringify(a1.body));
  const u = await ping({ token: hs256({ sub: "user-lobby-1", email: "Someone.Long@Example.com", exp: Math.floor(Date.now() / 1000) + 600, xsolla_login_project_id: "30375188-893b-4b1a-ba1b-c8ba692fa5e3" }) }, { scene: "dungeon", depth: 7, x: 3, y: 3 });
  check("lobby: logged-in user shown masked, dungeon depth kept, no x/y", u.status === 200 && u.body.me.name === "som***@example.com" && u.body.players.some(p => p.name === "som***@example.com" && p.depth === 7 && p.x === undefined), JSON.stringify(u.body));
  const c = await ping({ guest: "c1c1c1c1-0000" }, { scene: "lobby", x: 999, y: -5 });
  check("lobby: coordinates clamped", c.body.players.find(p => p.name === "게스트 #c1c1c1")?.x === 63 && c.body.players.find(p => p.name === "게스트 #c1c1c1")?.y === 0);
  check("lobby: big body → 413", (await ping({ guest: "c1c1c1c1-0000" }, { scene: "lobby", pad: "x".repeat(2000) })).status === 413);
  const all = JSON.stringify(db().prepare("SELECT * FROM presence").all());
  check("presence table: no raw device id or email", !all.includes("a1a1a1a1-0000") && !/someone/i.test(all) && !all.includes("user-lobby-1"));
  // 같은 사람은 한 줄
  await ping({ guest: "a1a1a1a1-0000" }, { scene: "lobby", x: 7, y: 7 });
  check("same person updates one row", db().prepare("SELECT COUNT(*) n FROM presence WHERE display = '게스트 #a1a1a1'").get().n === 1 && row("게스트 #a1a1a1").x === 7);
  // 오래된 줄은 목록에서 빠짐 (로비 8초)
  db().prepare("UPDATE presence SET seen_at = seen_at - 9000 WHERE display = '게스트 #a1a1a1'").run();
  check("stale lobby entry dropped from list", !(await ping({ guest: "c1c1c1c1-0000" }, { scene: "lobby", x: 2, y: 2 })).body.players.some(p => p.name === "게스트 #a1a1a1"));
  db().prepare("DELETE FROM presence").run();

  // ---- 브라우저 두 개 ----
  const GA = "aaaaaa11-2222-4333-8444-555555555555", GB = "bbbbbb11-2222-4333-8444-555555555555";
  const A = await open({ rl_device_id: GA }), B = await open({ rl_device_id: GB });
  check("A starts in the lobby", await inLobby(A.page));
  check("A sees B in the list", await waitFor(async () => (await A.page.locator("#lobby-list").innerText()).includes("게스트 #bbbbbb")));
  check("B sees A in the list, with own name marked", await waitFor(async () => { const t = await B.page.locator("#lobby-list").innerText(); return t.includes("게스트 #aaaaaa") && t.includes("게스트 #bbbbbb (나)"); }));
  check("count line", (await A.page.locator("#lobby-count").innerText()).includes("2명 접속 중 · 로비 2명"), await A.page.locator("#lobby-count").innerText());
  check("dungeon-only buttons hidden in lobby", !(await A.page.locator("#portal-btn").isVisible()) && await A.page.locator("#inv-btn").isVisible());
  // B를 A 근처로 옮겨 그림에 둘 다 보이게
  await sleep(600);
  await A.page.screenshot({ path: path.join(SHOTS, "lobby-desktop.png"), fullPage: true });

  // A 움직임 → 서버
  const before = row("게스트 #aaaaaa");
  const walk = before.x < 32 ? "ArrowRight" : "ArrowLeft";
  await A.page.keyboard.down(walk); await sleep(400); await A.page.keyboard.up(walk);
  check("A's move reaches the server quickly (town x, ground row 10)", await waitFor(() => row("게스트 #aaaaaa").x !== before.x && row("게스트 #aaaaaa").y === 10, 2000));
  check("potion/space do nothing in lobby (no turn)", await (async () => { await A.page.keyboard.press("q"); await A.page.keyboard.press("."); return (await A.page.locator("#log").innerText()).includes("로비에 들어왔다") && !(await A.page.locator("#log").innerText()).includes("포션"); })());

  // A → 던전 입구
  await walkToDoor(A.page);
  check("walking into the door enters the dungeon", await waitFor(async () => !(await inLobby(A.page))), await A.page.locator("#log").innerText());
  check("dungeon log line", (await A.page.locator("#log").innerText()).includes("던전 1층에 발을 들였다"));
  check("server: A in dungeon floor 1", await waitFor(() => row("게스트 #aaaaaa")?.scene === "dungeon" && row("게스트 #aaaaaa").depth === 1));
  check("B's list: A exploring floor 1", await waitFor(async () => (await B.page.locator("#lobby-list").innerText()).includes("1층 탐험 중")));
  check("portal button visible in dungeon", await A.page.locator("#portal-btn").isVisible());
  await A.page.screenshot({ path: path.join(SHOTS, "lobby-dungeon.png") });
  // 새로고침해도 던전
  await A.page.reload();
  check("reload keeps the dungeon", !(await inLobby(A.page)) && (await A.page.locator("#log").innerText()).includes("1층에서 이어서 시작한다. (떠났던 그 자리)"));
  // L → 로비, 입구 앞
  await A.page.keyboard.press("l");
  await stepIntoPortal(A.page);
  check("L opens a portal, stepping in returns to the village", await inLobby(A.page) && (await A.page.locator("#log").innerText()).includes("포탈을 타고 로비로 돌아왔다"));
  check("server: A back in the village in front of the floor-1 door (portal from floor 1)", await waitFor(() => { const r = row("게스트 #aaaaaa"); return r.scene === "lobby" && r.x === 30 && r.y === 10; }));
  await A.page.keyboard.press("ArrowUp");
  check("one step up enters the dungeon again", await waitFor(async () => !(await inLobby(A.page))));
  check("game: no page errors (A, B)", A.errors.length + B.errors.length === 0, [...A.errors, ...B.errors].join("; "));
  await A.ctx.close();
  check("A disappears from B's list after leaving (in dungeon: ~25s)", await waitFor(async () => !(await B.page.locator("#lobby-list").innerText()).includes("게스트 #aaaaaa"), 35000));
  await B.ctx.close();

  // ---- 쓰러진 판: 로비에서는 창이 안 뜨고, 입구로 들어가면 뜸 ----
  const GD = "dddddd11-2222-4333-8444-555555555555";
  const dead = JSON.stringify({ v: 1, best: 4, run: null, dead: { d: 4, hp: 0, mh: 30, a: 5, g: 10, p: 0, l: 3, x: 0, xn: 30, rid: "deadrun", k: 0, pp: 0 } });
  const D = await open({ rl_device_id: GD, rl_save: dead });
  check("dead run: lobby first, no death modal", await inLobby(D.page) && await D.page.locator("#death-modal").isHidden());
  await walkToDoor(D.page);
  check("dead run: door opens the death modal", await waitFor(() => D.page.locator("#death-modal").isVisible()));
  check("death modal stays over the village", await inLobby(D.page));
  await D.page.locator("#death-restart").click();
  check("로비에서 새로 시작 → village, then left door → floor 1", await inLobby(D.page) && await D.page.locator("#death-modal").isHidden() && (await D.page.locator("#log").innerText()).includes("로비에서 새로 시작한다"));
  await D.page.keyboard.press("ArrowUp");
  check("left door after restart → floor 1", await waitFor(async () => !(await inLobby(D.page)) && (await D.page.locator("#depth").innerText()) === "1"));
  check("dead flow: no page errors", D.errors.length === 0, D.errors.join("; "));
  await D.ctx.close();

  // ---- 서버가 없을 때 ----
  {
    const ctx = await browser.newContext(); const page = await ctx.newPage(); const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    await ctx.route(ORIGIN + "**", r => { const f = new URL(r.request().url()).pathname.replace("/hucksoon/", "") || "index.html";
      if (f === "ranking-config.js") return r.fulfill({ contentType: "text/javascript", body: `window.RANKING_API = "";` });
      r.fulfill({ contentType: f.endsWith(".js") ? "text/javascript" : "text/html", body: fs.readFileSync(path.join(REPO, f)) }); });
    await page.goto(ORIGIN);
    check("no server: lobby still works with a note", await inLobby(page) && (await page.locator("#lobby-list").innerText()).includes("불러오지 못했어요") && errors.length === 0, errors.join("; "));
    await ctx.close();
  }

  // ---- 로비에서 각자 포탈 층이 보임 ----
  {
    const runAt = (d) => JSON.stringify({ v: 1, best: d, run: { d, hp: 300, mh: 300, a: 50, g: 10, p: 1, l: 4, x: 0, xn: 1e9, rid: "pv" + d, k: 0, pp: 0 } });
    const api = await ping({ guest: "portal77-0000" }, { scene: "lobby", x: 4, y: 4, portal: 7 });
    check("API: village ping keeps portal floor", api.body.players.find(p => p.name === "게스트 #portal")?.portal === 7);
    const dz = await ping({ guest: "dungeon5-0000" }, { scene: "dungeon", depth: 5, portal: 9 });
    check("API: dungeon rows have depth, no portal", dz.body.players.find(p => p.name === "게스트 #dungeo")?.depth === 5 && dz.body.players.find(p => p.name === "게스트 #dungeo")?.portal === undefined);
    db().prepare("DELETE FROM presence").run();
    const X = await open({ rl_device_id: "aaaa7777-0000-4000-8000-000000000000", rl_save: runAt(7) });
    const Y = await open({ rl_device_id: "bbbb3333-0000-4000-8000-000000000000", rl_save: runAt(3) });
    const Z = await open({ rl_device_id: "cccc0000-0000-4000-8000-000000000000" });
    check("X sees Y's portal floor and Z without one", await waitFor(async () => { const t = await X.page.locator("#lobby-list").innerText(); return t.includes("게스트 #bbbb33\n로비 · 포탈 3층") && /게스트 #cccc00\n로비(\n|$)/.test(t); }), await X.page.locator("#lobby-list").innerText());
    check("Y sees X at 7층, own row shows 3층", await waitFor(async () => { const t = await Y.page.locator("#lobby-list").innerText(); return t.includes("게스트 #aaaa77\n로비 · 포탈 7층") && t.includes("(나)\n로비 · 포탈 3층"); }), await Y.page.locator("#lobby-list").innerText());
    check("server presence keeps each portal floor", db().prepare("SELECT depth FROM presence WHERE display = '게스트 #aaaa77'").get()?.depth === 7 && db().prepare("SELECT depth FROM presence WHERE display = '게스트 #bbbb33'").get()?.depth === 3);
    // Y가 1층 문으로 들어가면 포탈 층이 사라짐 → X 화면에서 탐험 중으로
    await walkToDoor(Y.page);
    check("Y enters floor 1 → X sees '1층 탐험 중'", await waitFor(async () => (await X.page.locator("#lobby-list").innerText()).includes("게스트 #bbbb33\n1층 탐험 중")));
    await sleep(500);
    await X.page.screenshot({ path: path.join(SHOTS, "village-portal-floors.png") });
    check("portal-floor view: no page errors", X.errors.length + Y.errors.length + Z.errors.length === 0, [...X.errors, ...Y.errors, ...Z.errors].join("; "));
    for (const c of [X, Y, Z]) await c.ctx.close();
  }

  // ---- 휴대폰 ----
  const GP = "eeeeee11-2222-4333-8444-555555555555", GQ = "ffffff11-2222-4333-8444-555555555555";
  const Q = await open({ rl_device_id: GQ });
  const P = await open({ rl_device_id: GP }, { ...devices["iPhone 13"] });
  check("phone: lobby touch buttons = inventory + bestiary only", await P.page.locator("#tp-inv").isVisible() && await P.page.locator("#tp-dex").isVisible() && !(await P.page.locator("#tp-potion").isVisible()) && !(await P.page.locator("#tp-portal").isVisible()));
  await waitFor(async () => (await P.page.locator("#lobby-list").innerText()).includes("게스트 #ffffff"));
  const pb = row("게스트 #eeeeee");
  await P.page.locator("#touch-pad .left").dispatchEvent("pointerdown"); await sleep(400); await P.page.locator("#touch-pad .left").dispatchEvent("pointerup");
  check("phone: holding ◀ walks left in the town", await waitFor(() => row("게스트 #eeeeee").x < pb.x, 2000));
  check("phone: big jump button and ▲ 들어가기 in the town", await P.page.locator("#tp-jump").isVisible() && (await P.page.locator("#touch-pad .up").innerText()).includes("들어가기") && !(await P.page.locator("#touch-pad .down").isVisible()));
  check("phone: no horizontal scroll", await P.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await P.page.screenshot({ path: path.join(SHOTS, "lobby-phone.png") });
  await walkToDoor(P.page);
  check("phone: in dungeon, 포탈 button", await waitFor(async () => !(await inLobby(P.page))) && await P.page.locator("#tp-portal").isVisible() && await P.page.locator("#tp-potion").isVisible());
  check("phone dungeon: no horizontal overflow", await P.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && [...document.querySelectorAll("#touch-pad button")].every(b => !b.offsetParent || b.getBoundingClientRect().right <= innerWidth)));
  await P.page.screenshot({ path: path.join(SHOTS, "lobby-phone-dungeon.png") });
  await P.page.locator("#tp-portal").tap();
  await stepIntoPortal(P.page);
  check("phone: 포탈 button opens a portal, stepping in returns to the village", await inLobby(P.page));
  check("phone: no page errors", P.errors.length + Q.errors.length === 0, [...P.errors, ...Q.errors].join("; "));
} finally {
  await browser.close();
  php.kill();
}
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
