// 로비 왕관: 층 랭킹 1~3위 이름 왼쪽에 금·은·동 (서버 + 브라우저)
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import crypto from "node:crypto"; import fs from "node:fs"; import path from "node:path";
import { goDoor } from "./town.mjs";   // 마을(옆에서 보는 로비) 문까지 걸어가 ↑
const require = createRequire(process.env.NODE_PATH + "/");
const { chromium, devices } = require("playwright");
const REPO = process.argv[2], OUT = process.argv[3];
const DIR = path.dirname(new URL(import.meta.url).pathname) + "/php";
const DB = path.join(DIR, "crown.sqlite"); for (const f of [DB, DB + "-wal", DB + "-shm"]) fs.rmSync(f, { force: true });
fs.writeFileSync(path.join(DIR, "config.crown.php"), `<?php\n$c = require __DIR__ . '/config.test.php';\nreturn array_merge($c, ['db_dsn' => 'sqlite:${DB}', 'dev_emails' => 'dev@example.com']);\n`);
const SECRET = "crown-secret";
const results = []; const check = (n, ok, x = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x && !ok ? " — " + x : ""}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const php = spawn("php", ["-S", "127.0.0.1:8093", "-t", path.join(REPO, "ranking-php")], { env: { ...process.env, PHP_CLI_SERVER_WORKERS: "4", RANKING_CONFIG: path.join(DIR, "config.crown.php"), TEST_JWT_SECRET: SECRET }, stdio: ["ignore", "ignore", "pipe"] });
let phpErr = ""; php.stderr.on("data", d => phpErr += d);
await sleep(700);
const API = "http://127.0.0.1:8093/api.php";
const b64u = (s) => Buffer.from(s).toString("base64url");
const jwt = (sub, email) => { const h = b64u(JSON.stringify({ alg: "HS256" })), p = b64u(JSON.stringify({ sub, email, exp: Math.floor(Date.now() / 1000) + 7200, xsolla_login_project_id: "30375188-893b-4b1a-ba1b-c8ba692fa5e3" })); return `${h}.${p}.${crypto.createHmac("sha256", SECRET).update(`${h}.${p}`).digest("base64url")}`; };
const U = (sub, email) => ({ sub, email, token: jwt(sub, email) });
const A = U("cr-a", "alice@example.com"), B = U("cr-b", "bob@example.com"), C = U("cr-c", "carol@example.com"), D = U("cr-d", "zed@example.com"), DEV = U("cr-dev", "dev@example.com");
async function call(route, who, body) {
  const headers = { "Content-Type": "application/json", Origin: "https://game.apacimtest.com" };
  if (who.token) headers.Authorization = `Bearer ${who.token}`; else headers["X-Guest-Id"] = who.guest;
  const r = await fetch(`${API}?r=${route}`, { method: body ? "POST" : "GET", headers, body: body && JSON.stringify(body) });
  return r.json();
}
const ping = (who, x = 12) => call("lobby", who, { scene: "lobby", x, y: 16, portal: 0 });
const crownOf = (res, name) => res.players.find(p => p.name.startsWith(name))?.crown;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
try {
  for (const [who, stage] of [[A, 60], [B, 40], [C, 25], [D, 5], [DEV, 999]]) await call("score", who, { stage, plvl: 10 });
  for (const [i, w] of [A, B, C, D, DEV].entries()) await ping(w, 10 + i);
  let r = await ping(D);
  check("1st/2nd/3rd get crowns 1/2/3", crownOf(r, "a***") === 1 && crownOf(r, "b***") === 2 && crownOf(r, "c***") === 3, JSON.stringify(r.players.map(p => [p.name, p.crown])));
  check("4th place has no crown", crownOf(r, "z***") === undefined && r.me.crown === undefined);
  check("developer (not ranked) has no crown", r.players.find(p => p.name === "운영자")?.crown === undefined);
  check("me.crown for a ranker", (await ping(A)).me.crown === 1);
  check("crown does not leak internal keys", !JSON.stringify(r).match(/[0-9a-f]{64}/));
  // 운영자: 이름은 "운영자", 이메일(가린 것도) 없음, staff 표시
  const op = r.players.find(p => p.staff);
  check("operator shown as '운영자' with staff flag", op && op.name === "운영자" && !op.crown, JSON.stringify(op));
  check("operator email not in lobby response at all", !JSON.stringify(r).includes("d***") && !JSON.stringify(r).includes("dev@"));
  const meDev = (await ping(DEV)).me;
  check("operator's own me: name 운영자, staff", meDev.name === "운영자" && meDev.staff === true);
  check("non-operator me has no staff flag", (await ping(A)).me.staff === undefined);
  // 같은 층이면 먼저 세운 사람이 위
  await call("score", D, { stage: 40 });
  r = await ping(D);
  check("tie on floor: earlier record keeps the higher crown", crownOf(r, "b***") === 2 && r.me.crown === 3 && crownOf(r, "c***") === undefined, JSON.stringify(r.players.map(p => [p.name, p.crown])));
  // D가 1위로 → 모두 한 칸씩 내려가고 C는 왕관이 사라짐
  await call("score", D, { stage: 65 });
  r = await ping(C);
  check("new #1 takes gold, others shift down", crownOf(r, "z***") === 1 && crownOf(r, "a***") === 2 && crownOf(r, "b***") === 3, JSON.stringify(r.players.map(p => [p.name, p.crown])));
  check("pushed out of top 3 → crown removed", r.me.crown === undefined);

  // ---- 브라우저: 로비 목록과 캔버스 ----
  const ORIGIN = "https://game.apacimtest.com/";
  async function open(who, opts = { viewport: { width: 1100, height: 1000 } }) {
    const ctx = await browser.newContext(opts); const page = await ctx.newPage(); const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    await ctx.route(ORIGIN + "**", rt => { const f = new URL(rt.request().url()).pathname.slice(1) || "index.html";
      if (f === "ranking-config.js") return rt.fulfill({ contentType: "text/javascript", body: `window.RANKING_API = ${JSON.stringify(API)};` });
      const p = path.join(REPO, f); if (!fs.existsSync(p)) return rt.fulfill({ status: 404, body: "" });
      rt.fulfill({ contentType: f.endsWith(".js") ? "text/javascript" : "text/html", body: fs.readFileSync(p) }); });
    await ctx.route(API + "**", async rt => { const q = rt.request();
      const res = await fetch(q.url(), { method: q.method(), headers: q.headers(), body: ["GET", "OPTIONS"].includes(q.method()) ? undefined : q.postData() });
      rt.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: Buffer.from(await res.arrayBuffer()) }); });
    await ctx.route("https://login.xsolla.com/**", rt => rt.fulfill({ status: 200, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: "[]" }));
    await ctx.addInitScript(([s]) => { if (sessionStorage.getItem("s")) return; sessionStorage.setItem("s", 1); for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); },
      [{ rl_device_id: who.sub + "-dev", rl_auth: JSON.stringify({ access: who.token, refresh: "r", exp: Date.now() + 7200e3 }) }]);
    await page.goto(ORIGIN);
    return { page, errors };
  }
  const pA = await open(A), pD = await open(D);
  // 다른 사람(B, C)도 로비에 있게
  const keep = setInterval(() => { ping(B, 14); ping(C, 18); ping(DEV, 20); }, 700);
  await sleep(3000);
  const items = await pD.page.locator("#lobby-list li").evaluateAll(lis => lis.map(li => ({ text: li.innerText, crown: li.querySelector(".crown")?.getAttribute("aria-label") || null })));
  const find = (s) => items.find(i => i.text.includes(s));
  check("list: my row (#1) has gold crown 1", find("(나)")?.crown === "랭킹 1위", JSON.stringify(items));
  check("list: alice crown 2, bob crown 3", find("a***")?.crown === "랭킹 2위" && find("b***")?.crown === "랭킹 3위");
  check("list: carol (4th) no crown", find("c***") && !find("c***").crown);
  check("list: operator row shows 운영자 with GM badge", find("운영자")?.crown === "운영자", JSON.stringify(find("운영자")));
  // 마을은 내 주변 16칸만 보임 → 운영자(x 20) 옆 우편함 앞으로 걸어감
  await goDoor(pD.page, "mailbox", { enter: false }); await sleep(300);
  const staffPx = await pD.page.evaluate(() => {
    const c = document.querySelector("canvas"), g = c.getContext("2d");
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] === 95 && d[i + 1] === 212 && d[i + 2] === 255) n++;
    return n;
  });
  check("canvas: GM badge / operator name drawn in sky blue", staffPx > 20, String(staffPx));
  check("no masked operator email on screen", !(await pD.page.locator("#lobby-list").innerText()).includes("d***"));
  // 캔버스: 내 이름 왼쪽 위치에 금색 픽셀이 있는지
  const gold = await pD.page.evaluate(() => {
    const c = document.querySelector("canvas"), g = c.getContext("2d");
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] === 255 && d[i + 1] === 210 && d[i + 2] === 63) n++;
    return n;
  });
  check("canvas: gold crown drawn", gold > 20, String(gold));
  await pD.page.screenshot({ path: path.join(OUT, "crown-lobby.png") });
  const box = await pD.page.locator("#lobby-list").boundingBox();
  await pD.page.screenshot({ path: path.join(OUT, "crown-list.png"), clip: { x: box.x, y: box.y, width: box.width, height: Math.min(box.height, 160) } });
  // 랭킹에서 밀리면 다음 요청부터 사라짐 (A는 지금 2위 → C가 74층으로 1위가 되면 A는 3위, B는 사라짐)
  await call("score", C, { stage: 74 });
  await sleep(2500);
  const after = await pA.page.locator("#lobby-list li").evaluateAll(lis => lis.map(li => ({ text: li.innerText, crown: li.querySelector(".crown")?.getAttribute("aria-label") || null })));
  check("after C jumps to #1: my (alice) crown becomes 3", after.find(i => i.text.includes("(나)"))?.crown === "랭킹 3위", JSON.stringify(after));
  check("after C jumps: bob loses crown, carol gets gold", !after.find(i => i.text.includes("b***"))?.crown && after.find(i => i.text.includes("c***"))?.crown === "랭킹 1위");
  clearInterval(keep);
  // 운영자 본인 화면: 위쪽 계정 표시도 "운영자"
  const pG = await open(DEV);
  await sleep(2500);
  check("operator's own account bar says 운영자 (no email)", (await pG.page.locator("#account-status").innerText()) === "운영자 로그인됨", await pG.page.locator("#account-status").innerText());
  check("operator's own list row: 운영자 (나) with badge", (await pG.page.locator("#lobby-list li.me").innerText()).includes("운영자 (나)") && await pG.page.locator("#lobby-list li.me .crown").count() === 1);
  await pG.page.screenshot({ path: path.join(OUT, "staff-lobby.png") });
  // 휴대폰에서도 목록이 넘치지 않음
  const pP = await open(B, { ...devices["iPhone 13"] });
  await sleep(2000);
  const sw = await pP.page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
  check("phone: no horizontal overflow with crowns", sw[0] <= sw[1], JSON.stringify(sw));
  for (const [n, x] of Object.entries({ pA, pD, pP, pG })) check(`${n}: no page errors`, x.errors.length === 0, x.errors.join("; "));
  check("no php errors", !/Fatal|Warning|Notice|Deprecated/.test(phpErr), phpErr.slice(0, 300));
} finally {
  await browser.close();
  php.kill();
}
const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
