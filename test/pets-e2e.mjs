// 펫 서버 저장 (dc#164) 브라우저 테스트: 로그인 사용자의 펫은 서버(pets.php) 목록이 기준
//   기기에만 있던 펫(게스트·연결이 끊겼을 때 얻은 것)은 들어올 때 올림, 새 펫·고정·풀기는 서버에도, 서버가 거절하면 서버 목록으로 되돌림
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import crypto from "node:crypto"; import fs from "node:fs"; import path from "node:path";
const require = createRequire(process.env.NODE_PATH + "/");
const { chromium } = require("playwright");
const REPO = process.argv[2];
const DIR = path.dirname(new URL(import.meta.url).pathname) + "/php";
const I = createRequire(import.meta.url)(path.join(REPO, "items.js"));
const DB = path.join(DIR, "pets-e2e.sqlite"); for (const f of [DB, DB + "-wal", DB + "-shm"]) fs.rmSync(f, { force: true });
const CFG = path.join(DIR, "config.pets-e2e.php");
const setDay = (day) => fs.writeFileSync(CFG, `<?php\n$c = require __DIR__ . '/config.test.php';\nreturn array_merge($c, ['db_dsn' => 'sqlite:${DB}', 'event_today' => '${day}']);\n`);
setDay("2026-11-04");
const SECRET = "pets-e2e-secret";
const ORIGIN = "https://hucksoon.github.io/hucksoon/", API = "http://127.0.0.1:8152/api.php";
const results = []; const check = (n, ok, x = "") => { results.push(!!ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x && !ok ? " — " + x : ""}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const waitFor = async (fn, ms = 8000) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (await fn()) return true; } catch {} await sleep(150); } return false; };
const php = spawn("php", ["-S", "127.0.0.1:8152", "-t", path.join(REPO, "ranking-php")], { env: { ...process.env, RANKING_CONFIG: CFG, TEST_JWT_SECRET: SECRET }, stdio: ["ignore", "ignore", "pipe"] });
let phpErr = ""; php.stderr.on("data", d => phpErr += d);
await sleep(700);
const b64u = (s) => Buffer.from(s).toString("base64url");
const jwt = (sub, email) => { const h = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" })), p = b64u(JSON.stringify({ sub, email, exp: Math.floor(Date.now() / 1000) + 7200, xsolla_login_project_id: "30375188-893b-4b1a-ba1b-c8ba692fa5e3" })); return `${h}.${p}.${crypto.createHmac("sha256", SECRET).update(`${h}.${p}`).digest("base64url")}`; };
const db = () => { const d = new DatabaseSync(DB); d.exec("PRAGMA busy_timeout = 5000"); return d; };
const hmac = (s) => crypto.createHmac("sha256", "k".repeat(40)).update(s).digest("hex");
const SUB = "pets-e2e-user", KEY = hmac("u:" + SUB);
const rows = () => Object.fromEntries(db().prepare("SELECT pet_key, grade FROM pets WHERE pkey = ?").all(KEY).map(r => [r.pet_key, r.grade]));
const pref = () => db().prepare("SELECT on_key, pin FROM pet_prefs WHERE pkey = ?").get(KEY) || null;
const HOOK = `
  window.__t = {
    pets: () => Inv.pets(),
    logs: () => [...document.querySelectorAll("#log > *")].map(n => n.textContent),
    dropFrom: (id, kind) => { const D = RLMonsters.PETS.drop, o = { ...D }; D.elite = D.boss = D.named = 1; const r = Pet.drop({ id, kind, x: player.x + 1, y: player.y }); Object.assign(D, o); return r || null; },
  };
  // ---- 시작 ----`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
async function open(storage) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 } }); const page = await ctx.newPage(); const errors = [];
  page.on("pageerror", e => errors.push(e.message)); page.on("dialog", d => d.accept());
  await ctx.route(ORIGIN + "**", r => { const f = new URL(r.request().url()).pathname.replace("/hucksoon/", "") || "index.html";
    if (f === "ranking-config.js") return r.fulfill({ contentType: "text/javascript", body: `window.RANKING_API = ${JSON.stringify(API)};` });
    const p = path.join(REPO, f); if (!fs.existsSync(p)) return r.fulfill({ status: 404, body: "" });
    let body = fs.readFileSync(p); if (f === "index.html") body = body.toString("utf8").replace("  // ---- 시작 ----", HOOK);
    r.fulfill({ contentType: f.endsWith(".js") ? "text/javascript" : f.endsWith(".png") ? "image/png" : f.endsWith(".webp") ? "image/webp" : "text/html", body }); });
  await ctx.route(API + "**", async r => { const req = r.request();
    const res = await fetch(req.url(), { method: req.method(), headers: req.headers(), body: ["GET", "OPTIONS"].includes(req.method()) ? undefined : req.postData() });
    r.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: Buffer.from(await res.arrayBuffer()) }); });
  await ctx.route(/googlesyndication|cdn\.xsolla|store\.xsolla/, r => r.abort());
  await ctx.route("https://login.xsolla.com/**", r => r.fulfill({ status: 200, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: r.request().url().includes("/get") ? "[]" : "{}" }));
  await ctx.addInitScript((s) => { if (!sessionStorage.getItem("s")) { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); sessionStorage.setItem("rl_scene", "dungeon"); sessionStorage.setItem("s", 1); } }, storage);
  await page.goto(ORIGIN);
  await page.waitForFunction(() => window.__t);
  await sleep(800);
  return { ctx, page, errors };
}
const T = (page, fn, ...a) => page.evaluate(([f, a]) => window.__t[f](...a), [fn, a]);
const save = JSON.stringify({ v: 1, best: 12, run: { d: 8, hp: 5000, mh: 5000, a: 40, g: 100, l: 5, x: 0, xn: 5000, x4: 1, rid: "pe2e", k: 0, pp: 0, bz: { normal: 8 } } });
// 이 기기에만 있는 펫: 고블린(정예, 고정)·할로윈 트롤(보스, 전설), 떨어뜨린 종류를 모르는 오크
const localPets = { have: { goblin: { g: "common", at: 1, s: "elite" }, "troll@halloween": { g: "legend", at: 2, s: "boss" }, orc: { g: "epic", at: 3 } }, on: "goblin", pin: true };
const storage = {
  rl_oldtown: "off", rl_bless: "on", rl_autogear: "1", rl_market: "paused", rl_device_id: "pets-e2e-dev", rl_3d: "0", rl_live: "off", rl_tut: JSON.stringify(["intro"]), rl_tip_dodge: "1",
  rl_event: "halloween", rl_save: save, rl_auth: JSON.stringify({ access: jwt(SUB, "pe@example.com"), refresh: "r", exp: Date.now() + 7200_000 }),
  [`rl_inv:u:${SUB}`]: JSON.stringify({ bag: [], equip: Object.fromEntries(I.EQUIP_SLOTS.map(x => [x, null])), log: [], pets: localPets }),
};
try {
  const A = await open(storage);
  // ---- 1. 들어오면 기기에만 있던 펫을 올리고 서버 목록으로 ----
  check("on login the device's pets go up to the server (goblin, Halloween troll) with the pin", await waitFor(() => { const r = rows(); return r.goblin === "common" && r["troll@halloween"] === "legend" && pref()?.on_key === "goblin" && pref()?.pin === 1; }), JSON.stringify([rows(), pref()]));
  const p1 = await T(A.page, "pets");
  check("the game then uses the server list (old pet without a source is dropped), still pinned to goblin", !p1.have.orc && p1.have.goblin && p1.have["troll@halloween"] && p1.on === "goblin" && p1.pin === true, JSON.stringify(p1));

  // ---- 2. 새 펫 → 서버에도 ----
  const k1 = await T(A.page, "dropFrom", "ogre_chief", "boss");
  check(`new pet (${k1}) is saved on the server with the same grade`, k1 === "ogre_chief@halloween" && await waitFor(async () => rows()[k1] && rows()[k1] === (await T(A.page, "pets")).have[k1]?.g), JSON.stringify(rows()));
  // 다른 기기에서 이미 얻은 펫: 이 기기는 모르고 다시 얻음 → 서버가 거절(409) → 서버 목록(등급도 서버 것)으로
  db().prepare("INSERT INTO pets (pkey, pet_key, grade, src, day, got_at) VALUES (?, 'kobold@halloween', 'epic', 'elite', '2026-11-04', 5)").run(KEY);
  const k2 = await T(A.page, "dropFrom", "kobold", "elite");
  check("a pet already got on another device → the server's one (grade epic) replaces the local roll", k2 === "kobold@halloween" && await waitFor(async () => (await T(A.page, "pets")).have[k2]?.g === "epic") && rows()[k2] === "epic", JSON.stringify((await T(A.page, "pets")).have[k2]));

  // ---- 3. 이벤트가 끝난 뒤 이벤트 모습 펫 → 서버가 거절 → 지워짐 ----
  setDay("2026-11-20"); await sleep(3100);   // PHP가 설정 파일을 2초(초 단위로 재서 최대 3초) 동안 기억함 (opcache)
  const k3 = await T(A.page, "dropFrom", "bat", "elite");
  check("after the event, a Halloween pet is refused by the server and removed from the game", k3 === "bat@halloween" && await waitFor(async () => !(await T(A.page, "pets")).have[k3]) && !rows()[k3], `${k3} ${JSON.stringify((await T(A.page, "pets")).have)} ${JSON.stringify(rows())}`);
  setDay("2026-11-04"); await sleep(3100);   // PHP가 설정 파일을 2초(초 단위로 재서 최대 3초) 동안 기억함 (opcache)

  // ---- 4. 가방에서 고정 풀기·고정 → 서버에도 ----
  await A.page.keyboard.press("i"); await sleep(400);
  await A.page.locator("#inv-bag .bag-item.pet.sel").click(); await sleep(200);
  check("tap the pinned pet → unpinned on the server too, takes the best one", await waitFor(() => pref()?.pin === 0) && (await T(A.page, "pets")).pin === false && ["troll@halloween", "ogre_chief@halloween"].includes((await T(A.page, "pets")).on), JSON.stringify(pref()));
  await A.page.locator("#inv-bag .bag-item.pet", { hasText: "고블린" }).first().click(); await sleep(200);
  check("tap another pet → pinned on the server", await waitFor(() => pref()?.pin === 1 && /goblin/.test(pref()?.on_key || "")), JSON.stringify(pref()));
  const pinned = pref().on_key;

  // ---- 5. 다시 열면 서버 목록 그대로 ----
  db().prepare("INSERT INTO pets (pkey, pet_key, grade, src, day, got_at) VALUES (?, 'gumiho', 'legend', 'named', '2026-11-04', 9)").run(KEY);
  await A.page.reload(); await A.page.waitForFunction(() => window.__t);
  check("reload → the list comes from the server (a pet added elsewhere shows up), pin kept", await waitFor(async () => { const p = await T(A.page, "pets"); return p.have.gumiho?.g === "legend" && p.on === pinned && p.pin; }), JSON.stringify(await T(A.page, "pets")));
  check("server keeps no raw ids or emails", !JSON.stringify(db().prepare("SELECT * FROM pets").all()).includes("pets-e2e-user") && !JSON.stringify(db().prepare("SELECT * FROM pet_prefs").all()).includes("example.com"));
  check("no page errors", A.errors.length === 0, A.errors.join("; "));
  check("no PHP errors", !/Fatal|Warning|Parse error|Deprecated/.test(phpErr), phpErr.slice(0, 300));
  await A.ctx.close();
} finally { await browser.close(); php.kill(); }
const pass = results.filter(Boolean).length;
console.log(`\n${pass} passed, ${results.length - pass} failed`);
process.exit(pass === results.length ? 0 : 1);
