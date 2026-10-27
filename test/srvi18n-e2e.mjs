// 6단계: 서버가 보내는 문구 — 랭킹 장비 보기·우편 메모·게스트 이름이 고른 언어로 (서버는 한국어 + 키·참조)
import { createRequire } from "node:module";
import { spawn, spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { goDoor } from "./town.mjs";   // 마을(옆에서 보는 로비) 문까지 걸어가 ↑
const require = createRequire(process.env.NODE_PATH + "/");
const { chromium, devices } = require("playwright");
const REPO = process.argv[2], SHOTS = process.argv[3];
const DIR = path.dirname(new URL(import.meta.url).pathname) + "/php";
const RL = createRequire(import.meta.url)(path.join(REPO, "items.js"));
const DB = path.join(DIR, "srvi18n.sqlite");
for (const f of [DB, DB + "-wal", DB + "-shm"]) fs.rmSync(f, { force: true });
fs.writeFileSync(path.join(DIR, "config.srvi18n.php"), `<?php
$c = require __DIR__ . '/config.test.php';
return array_merge($c, ['db_dsn' => 'sqlite:${DB}', 'xsolla_store_url' => 'http://127.0.0.1:8127/store', 'xsolla_api_key' => 'test-key', 'xsolla_project_id' => 317991]);
`);
const SECRET = "srvi18n-secret";
const ORIGIN = "https://hucksoon.github.io/hucksoon/";
const API = "http://127.0.0.1:8126/api.php";
const STORE = "https://store.xsolla.com/api/v2/project/317991";
const results = [];
const check = (n, ok, x = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x ? " — " + x : ""}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const waitFor = async (fn, ms = 10000) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (await fn()) return true; } catch {} await sleep(150); } return false; };

// ---- 가짜 Xsolla Store: 서버(php)와 브라우저가 같은 잔액을 봄 ----
const bal = {};
const subOf = (h) => { try { return JSON.parse(Buffer.from(h.split(".")[1], "base64url")).sub; } catch { return null; } };
function storeHandle(method, p, auth, body) {
  if (p === "/user/virtual_currency_balance") return [200, { items: [{ sku: "cash", amount: bal[subOf(auth.slice(7))] || 0 }] }];
  if (p === "/items/virtual_items") return [200, { items: [{ sku: "revive", virtual_prices: [{ sku: "cash", amount: 50 }] }] }];
  if (p === "/user/inventory/item/consume") {
    const s = subOf(auth.slice(7)), b = JSON.parse(body);
    if ((bal[s] || 0) < b.quantity) return [422, { errorCode: 4001, errorMessage: "not enough" }];
    bal[s] -= b.quantity; return [204, null];
  }
  if (p === "/inventory/reward") {
    if (auth !== "Basic " + Buffer.from("317991:test-key").toString("base64")) return [401, { errorCode: 1501 }];
    for (const op of JSON.parse(body)) for (const it of op.items) bal[op.user.id] = (bal[op.user.id] || 0) + it.quantity;
    return [200, {}];
  }
  return [404, { errorCode: 9, errorMessage: "unmocked " + p }];
}
const mock = http.createServer((req, res) => { let b = ""; req.on("data", c => b += c); req.on("end", () => {
  const [s, o] = storeHandle(req.method, req.url.replace("/store/v2/project/317991", ""), req.headers.authorization || "", b);
  res.writeHead(s, { "Content-Type": "application/json" }); res.end(o == null ? "" : JSON.stringify(o)); }); });
await new Promise(r => mock.listen(8127, "127.0.0.1", r));
const php = spawn("php", ["-S", "127.0.0.1:8126", "-t", path.join(REPO, "ranking-php")], { env: { ...process.env, RANKING_CONFIG: path.join(DIR, "config.srvi18n.php"), TEST_JWT_SECRET: SECRET }, stdio: "ignore" });
await sleep(700);

const b64u = (s) => Buffer.from(s).toString("base64url");
const jwt = (sub, email) => { const h = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" })), p = b64u(JSON.stringify({ sub, email, exp: Math.floor(Date.now() / 1000) + 7200, xsolla_login_project_id: "30375188-893b-4b1a-ba1b-c8ba692fa5e3" })); return `${h}.${p}.${crypto.createHmac("sha256", SECRET).update(`${h}.${p}`).digest("base64url")}`; };
const authOf = (sub, email) => JSON.stringify({ access: jwt(sub, email), refresh: "r", exp: Date.now() + 7200_000 });
const save = (gold, best = 5) => JSON.stringify({ v: 1, season: 4, best, run: { d: best, hp: 300, mh: 300, a: 50, g: gold, p: 2, l: 5, x: 0, xn: 1e9, rid: "mk-" + gold, k: 0, pp: 0 } });
const inv = (bag) => JSON.stringify({ bag, equip: Object.fromEntries(RL.SLOTS.map(s => [s, null])), log: [] });
const find = (pred, tag) => { for (let n = 0; n < 200000; n++) { const it = RL.generate(`${tag}${n}|shop|d5|s${n % 6}`, "golden", 5); if (pred(it)) return it; } };
const epic = { ...find(x => x.rarity === "epic", "ea"), enh: 2, tries: 3 };
const legend = find(x => x.rarity === "legendary", "lg");
const rare = find(x => x.rarity === "rare", "ra");

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
async function open(storage, opts = { viewport: { width: 1280, height: 1000 } }) {
  const ctx = await browser.newContext(opts); const page = await ctx.newPage(); const errors = [], dialogs = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("dialog", d => { dialogs.push(d.message()); d.accept(); });
  await ctx.route(ORIGIN + "**", r => { const f = new URL(r.request().url()).pathname.replace("/hucksoon/", "") || "index.html";
    if (f === "ranking-config.js") return r.fulfill({ contentType: "text/javascript", body: `window.RANKING_API = ${JSON.stringify(API)};` });
    const p = path.join(REPO, f); if (!fs.existsSync(p)) return r.fulfill({ status: 404, body: "" });
    r.fulfill({ contentType: f.endsWith(".js") ? "text/javascript" : "text/html", body: fs.readFileSync(p) }); });
  await ctx.route(API + "**", async r => {
    const req = r.request();
    const res = await fetch(req.url(), { method: req.method(), headers: req.headers(), body: ["GET", "OPTIONS"].includes(req.method()) ? undefined : req.postData() });
    r.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: Buffer.from(await res.arrayBuffer()) });
  });
  await ctx.route(STORE + "/**", r => { const req = r.request();
    const [s, o] = storeHandle(req.method(), new URL(req.url()).pathname.replace("/api/v2/project/317991", ""), req.headers().authorization || "", req.postData() || "");
    r.fulfill({ status: s, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: o == null ? "" : JSON.stringify(o) }); });
  await ctx.route("https://login.xsolla.com/**", r => r.fulfill({ status: 200, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: r.request().url().includes("/get") ? "[]" : "{}" }));
  await ctx.addInitScript(s => { if (!sessionStorage.getItem("s")) { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); sessionStorage.setItem("s", 1); } }, storage);
  await page.goto(ORIGIN); return { ctx, page, errors, dialogs };
}
const user = (sub, email, gold, bag) => ({ rl_device_id: sub + "-dev", rl_auth: authOf(sub, email), rl_save: save(gold), [`rl_inv:u:${sub}`]: inv(bag) });
const bagOf = (page, sub) => page.evaluate(k => JSON.parse(localStorage.getItem(k)).bag, `rl_inv:u:${sub}`);
const msg = (page) => page.locator("#market-msg").innerText();
const db = () => new DatabaseSync(DB);
// 마을에서 걸어가서 열기: 거래소 문 / 우편함
async function walkOpen(page, display, target) {
  if (await page.locator("#market-modal").isVisible()) { await page.keyboard.press("Escape"); }
  await goDoor(page, target === "mail" ? "mailbox" : "market");
  await page.locator("#market-modal").waitFor({ timeout: 3000 });
}


const RUNE = /(?<![가-힣])[가나다라마바사아자차카타파하](?![가-힣])/g;
const koLines = (t) => t.split("\n").filter(l => /[가-힣]/.test(l.replace(RUNE, "")));
const findSet = () => { for (let n = 0; n < 400000; n++) { const it = RL.generate(`st${n}|shop|d5|s${n % 6}`, "golden", 5); if (it.set) return it; } };
const setItem = findSet();
const sockLeg = find(x => x.rarity === "legendary" && RL.socketCount(x) > 0, "sk");
const ref = (it, extra = {}) => ({ seed: it.seed, src: it.src, lvl: it.lvl, v: it.v, enh: 3, id: it.id, r: it.r, ...extra });
const post = (guest, body) => fetch(API + "?r=score", { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://hucksoon.github.io", "X-Guest-Id": guest }, body: JSON.stringify(body) }).then(r => r.json());
const getJ = (q) => fetch(API + q, { headers: { Origin: "https://hucksoon.github.io" } }).then(r => r.json());
try {
  await post("srv-guest-0001", { stage: 6, plvl: 10, item: ref(sockLeg, { g: [["ruby", 1]] }), gear: [ref(setItem), ref(sockLeg, { g: [["ruby", 1]] })] });
  const board = await getJ("?r=ranking&type=stage");
  const row = board.rows[0];
  check("ranking row: item has ref (seed·id), no name text (values only, dc#97)", row?.item?.ref?.id === sockLeg.id && row.item.ref.g?.[0]?.[0] === "ruby" && !("name" in row.item), JSON.stringify(row?.item));
  const pl = await getJ(`?r=player&id=${row.id}`);
  const gi = pl.gear.items;
  check("player view: lines carry k·v, setId, ref; sets carry id", gi.every(x => x.ref && x.main.every(l => l.k && Number.isInteger(l.v)) && x.lines.every(l => l.k)) && gi.some(x => x.setId === setItem.set) && pl.gear.sets[0]?.id === setItem.set, JSON.stringify(gi.map(x => [x.setId, x.main.map(l => l.k)])));
  check("player view: no Korean text sent (names, lines, gems, set name/bonuses) — the page builds them (dc#97)", !/[가-힣]/.test(JSON.stringify({ gi, sets: pl.gear.sets, best: pl.bestItem })), JSON.stringify(gi).match(/.{0,40}[가-힣].{0,40}/)?.[0]);
  // 예전 기록(키·참조 없음)도 보여줄 때 k·v·세트 id를 채움
  const d = db(); const r0 = d.prepare("SELECT pkey, stage_gear FROM players_v4 LIMIT 1").get();
  const old = JSON.parse(r0.stage_gear);
  for (const it of old.items) { delete it.ref; delete it.setId; for (const l of [...it.main, ...it.lines]) { delete l.k; delete l.v; } }
  for (const s of old.sets) delete s.id;
  d.prepare("UPDATE players_v4 SET stage_gear = ? WHERE pkey = ?").run(JSON.stringify(old), r0.pkey);
  const pl2 = await getJ(`?r=player&id=${row.id}`);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  check("old snapshot: k·v and set ids filled back from Korean text", same(pl2.gear.items.map(x => [...x.main, ...x.lines].map(l => [l.k, l.v])), gi.map(x => [...x.main, ...x.lines].map(l => [l.k, l.v]))) && pl2.gear.sets[0].id === setItem.set && pl2.gear.items.some(x => x.setId === setItem.set),
    JSON.stringify(pl2.gear.items.map(x => [...x.main, ...x.lines].map(l => [l.text, l.k, l.v]))));
  // 아래 랭킹 페이지는 예전 기록(참조 없음) 그대로 봄: 최강 아이템 화면 정보에서도 ref를 뺌 → 이름은 한국어 이름을 나눠 다시 조립 (nameFromKo)
  const ij = JSON.parse(d.prepare("SELECT item_json FROM players_v4 WHERE pkey = ?").get(r0.pkey).item_json);
  delete ij.ref; delete ij.setId; for (const l of [...ij.main, ...ij.lines]) { delete l.k; delete l.v; }
  d.prepare("UPDATE players_v4 SET item_json = ? WHERE pkey = ?").run(JSON.stringify(ij), r0.pkey);
  check("old records: board row has no ref now", !(await getJ("?r=ranking&type=item")).rows[0].item.ref);

  // ---- 랭킹 페이지: en / ja / ko ----
  for (const lang of ["en", "ja", "ko"]) {
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 1000 }, locale: lang === "ja" ? "ja-JP" : lang === "ko" ? "ko-KR" : "en-US" }); const page = await ctx.newPage(); const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    await ctx.route(ORIGIN + "**", r => { const f = new URL(r.request().url()).pathname.replace("/hucksoon/", "") || "index.html";
      if (f === "ranking-config.js") return r.fulfill({ contentType: "text/javascript", body: `window.RANKING_API = ${JSON.stringify(API)};` });
      const p = path.join(REPO, f); if (!fs.existsSync(p)) return r.fulfill({ status: 404, body: "" });
      r.fulfill({ contentType: f.endsWith(".js") ? "text/javascript" : "text/html", body: fs.readFileSync(p) }); });
    await ctx.route(API + "**", async r => { const req = r.request(); const res = await fetch(req.url(), { method: req.method(), headers: req.headers() });
      r.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: Buffer.from(await res.arrayBuffer()) }); });
    await page.goto(ORIGIN + "ranking.html"); await sleep(1500);
    const boardT = (await page.locator("#board-stage").innerText()) + "\n" + (await page.locator("#board-item").innerText());
    await page.locator("#board-stage li").first().click(); await sleep(1200);
    const modalT = await page.locator("#player-modal").innerText();
    await page.screenshot({ path: `${SHOTS}/srvi18n-ranking-${lang}.png` });
    if (lang === "ko") {
      check("ko: ranking shows Korean names built from values (old record: the server's name)", modalT.includes(RL.itemName({ ...sockLeg, enh: 3 })) && modalT.includes("게스트 #") && boardT.includes(RL.itemName(RL.fromRef(row.item.ref, { gems: true }))), modalT.slice(0, 300));
    } else {
      const L = lang === "en" ? "en" : "ja";
      const nm = await page.evaluate(([r]) => { const x = RLItems.fromRef(r, { gems: true }); return RLItems.itemName(x); }, [row.item.ref]);
      check(`${L}: board + player view have no Korean (item names, lines, sets, guest name)`, koLines(boardT).length === 0 && koLines(modalT).length === 0, JSON.stringify([...koLines(boardT), ...koLines(modalT)]).slice(0, 500));
      check(`${L}: item name rebuilt in ${L} (${nm})`, modalT.includes(nm) && boardT.includes(nm), modalT.slice(0, 200));
      check(`${L}: guest name translated`, modalT.includes(L === "en" ? "Guest #" : "ゲスト #"), modalT.slice(0, 120));
    }
    check(`no page errors (ranking ${lang})`, errors.length === 0, errors.join("; "));
    await ctx.close();
  }

  // ---- 우편함 메모 (en) ----
  bal["mail-a"] = 0;
  const A = await open(user("mail-a", "mailer@example.com", 50, []), { viewport: { width: 1280, height: 1000 }, locale: "en-US" });
  await sleep(1500);
  const pkey = db().prepare("SELECT pkey FROM presence WHERE display = ?").get("ma***@example.com")?.pkey;
  const legRef = JSON.stringify({ seed: legend.seed, src: legend.src, lvl: legend.lvl, v: legend.v, enh: 0, id: legend.id, r: legend.r || 0 });
  const ins = db().prepare("INSERT INTO mail (id, owner_key, kind, listing_id, item_id, item_ref, item_name, rarity, gold, cash, note, state, created_at) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, 'new', ?)");
  const now = Date.now(); const hex = () => crypto.randomBytes(8).toString("hex");
  ins.run(hex(), pkey, "returned", legend.id, legRef, RL.itemName(legend), legend.rarity, 0, 0, "24시간이 지나 돌아온 아이템", now);
  ins.run(hex(), pkey, "returned", rare.id, JSON.stringify({ seed: rare.seed, src: rare.src, lvl: rare.lvl, v: rare.v, enh: 0, id: rare.id, r: rare.r || 0 }), RL.itemName(rare), rare.rarity, 0, 0, "등록을 취소한 아이템", now - 1);
  ins.run(hex(), pkey, "bought", epic.id, JSON.stringify({ seed: epic.seed, src: epic.src, lvl: epic.lvl, v: epic.v, enh: 2, id: epic.id, r: epic.r || 0 }), RL.itemName(epic), epic.rarity, 0, 0, "게스트 #ab12cd에게서 산 아이템", now - 2);
  ins.run(hex(), pkey, "sale", legend.id, legRef, RL.itemName(legend), legend.rarity, 0, 3, "b***@example.com에게 판매", now - 3);
  ins.run(hex(), pkey, "gift", null, null, null, null, 100, 0, "이벤트 보상", now - 4);
  // 운영자가 언어별 메모를 같이 준 선물 (gift.php --en --ja)
  db().prepare("INSERT INTO mail (id, owner_key, kind, gold, cash, note, notes, state, created_at) VALUES (?, ?, 'gift', 50, 0, ?, ?, 'new', ?)").run(hex(), pkey, "핼러윈 보상", JSON.stringify({ en: "Halloween reward", ja: "ハロウィン報酬" }), now - 5);
  await walkOpen(A.page, "ma***@example.com", "mail");
  await sleep(800);
  const mailT = await A.page.locator("#market-body").innerText();
  await A.page.screenshot({ path: `${SHOTS}/srvi18n-mail-en.png` });
  check("mail notes translated (returned · canceled · bought from guest · sold)", ["Returned after 24 hours", "Listing canceled", "Bought from Guest #ab12cd", "Sold to b***@example.com"].every(t => mailT.includes(t)), mailT);
  check("mail item names in English (sale mail too)", mailT.includes(RL.itemName(legend)) === false && koLines(mailT).every(l => l.includes("이벤트 보상")), JSON.stringify(koLines(mailT)));
  // gift.php: --en·--ja는 어느 자리든, 메모가 빠지면 안내, 기록 없는 이메일은 안내
  const gift = (...a) => spawnSync("php", [path.join(REPO, "ranking-php/gift.php"), ...a], { env: { ...process.env, RANKING_CONFIG: path.join(DIR, "config.srvi18n.php"), TEST_JWT_SECRET: SECRET }, encoding: "utf8" });
  const g1 = gift("--en", "Hi", "nobody@example.com", "10", "0", "메모", "--ja", "やあ");
  check("gift.php: flags anywhere → parsed, unknown email → 'no record' message", g1.status === 1 && g1.stderr.includes("플레이한 기록이 없어요"), g1.stderr + g1.stdout);
  const g2 = gift("nobody@example.com", "10", "0", "--en");
  check("gift.php: --en without text → asks for the note", g2.status === 1 && g2.stderr.includes("--en 다음에 메모"), g2.stderr);
  const g3 = gift("nobody@example.com", "10", "0", "a", "b");
  check("gift.php: extra words → usage", g3.status === 1 && g3.stderr.includes("사용법"), g3.stderr);
  check("unknown staff note kept as written", mailT.includes("이벤트 보상"));
  check("gift with --en note shows the English note", mailT.includes("Halloween reward") && !mailT.includes("핼러윈 보상"), mailT);
  check("no page errors (mail)", A.errors.length === 0, A.errors.join("; "));
  await A.ctx.close();
} finally { await browser.close(); php.kill(); mock.close(); }
console.log(`${results.filter(Boolean).length}/${results.length} passed`);
