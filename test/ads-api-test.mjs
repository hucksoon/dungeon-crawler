// 하루 입장 횟수 + 광고 티켓 (입장·부활·수수료 면제) 서버 테스트
import { createRequire } from "node:module";
import { spawn, spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import http from "node:http"; import crypto from "node:crypto"; import fs from "node:fs"; import path from "node:path";
const REPO = process.argv[2];
const DIR = path.dirname(new URL(import.meta.url).pathname) + "/php";
const RL = createRequire(import.meta.url)(path.join(REPO, "items.js"));
const DB = path.join(DIR, "ads.sqlite"); for (const f of [DB, DB + "-wal", DB + "-shm"]) fs.rmSync(f, { force: true });
fs.writeFileSync(path.join(DIR, "config.ads.php"), `<?php\n$c = require __DIR__ . '/config.test.php';\nreturn array_merge($c, ['db_dsn' => 'sqlite:${DB}', 'xsolla_store_url' => 'http://127.0.0.1:8101/store', 'xsolla_api_key' => 'k', 'ad_min_seconds' => 1]);\n`);
const SECRET = "ads-secret";
const results = []; const check = (n, ok, x = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x ? " — " + x : ""}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const bal = {}; const calls = []; let consumeFail = 0;
const subOf = (h) => JSON.parse(Buffer.from(h.split(".")[1], "base64url")).sub;
const mock = http.createServer((req, res) => { let b = ""; req.on("data", c => b += c); req.on("end", () => {
  const p = req.url.replace("/store/v2/project/317991", ""); calls.push(p);
  const send = (s, o) => { res.writeHead(s, { "Content-Type": "application/json" }); res.end(o ? JSON.stringify(o) : ""); };
  if (p === "/user/virtual_currency_balance") return send(200, { items: [{ sku: "cash", amount: bal[subOf(req.headers.authorization.slice(7))] || 0 }] });
  if (p === "/user/inventory/item/consume") { if (consumeFail) { consumeFail--; return send(500, {}); } const s = subOf(req.headers.authorization.slice(7)), q = JSON.parse(b).quantity; if ((bal[s] || 0) < q) return send(422, {}); bal[s] -= q; return send(204); }
  send(404, {}); }); });
await new Promise(r => mock.listen(8101, "127.0.0.1", r));
const php = spawn("php", ["-S", "127.0.0.1:8100", "-t", path.join(REPO, "ranking-php")], { env: { ...process.env, RANKING_CONFIG: path.join(DIR, "config.ads.php"), TEST_JWT_SECRET: SECRET }, stdio: ["ignore", "ignore", "pipe"] });
let phpErr = ""; php.stderr.on("data", d => phpErr += d);
await sleep(700);
const b64u = (s) => Buffer.from(s).toString("base64url");
const jwt = (sub, email) => { const h = b64u(JSON.stringify({ alg: "HS256" })), p = b64u(JSON.stringify({ sub, email, exp: Math.floor(Date.now() / 1000) + 3600, xsolla_login_project_id: "30375188-893b-4b1a-ba1b-c8ba692fa5e3" })); return `${h}.${p}.${crypto.createHmac("sha256", SECRET).update(`${h}.${p}`).digest("base64url")}`; };
const U = (sub, email) => ({ sub, token: jwt(sub, email) });
const A = U("ads-a", "ann@example.com"), B = U("ads-b", "ben@example.com"), DEV = U("ads-dev", "dev1@example.com"), G = { guest: "adsguest-0000" };
async function call(route, who, body) {
  const headers = { "Content-Type": "application/json", Origin: "https://hucksoon.github.io" };
  if (who?.token) headers.Authorization = `Bearer ${who.token}`; if (who?.guest) headers["X-Guest-Id"] = who.guest; if (who?.device) headers["X-Device-Id"] = who.device;
  const r = await fetch(`http://127.0.0.1:8100/api.php?r=${route}`, { method: body === undefined ? "GET" : "POST", headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {} return { status: r.status, body: j, text: t };
}
const db = () => new DatabaseSync(DB);
const ticket = async (who, kind) => (await call("ad_start", who, { kind })).body?.ticket;
try {
  const s0 = await call("entry_status", G);
  check("guest: 5 free entries today, ad caps revive 1 / fee 3", s0.body.left === 5 && s0.body.free === 5 && s0.body.ads.revive === 1 && s0.body.ads.fee === 3 && /^\d{4}-\d\d-\d\d$/.test(s0.body.day), s0.text);
  let last; for (let i = 0; i < 5; i++) last = await call("entry", G, {});
  check("5 free entries counted", last.body.ok && last.body.by === "free" && last.body.left === 0 && last.body.used === 5);
  const sixth = await call("entry", G, {});
  check("6th entry without ad → 403 need_ad", sixth.status === 403 && sixth.body.error === "need_ad");
  const t1 = await ticket(G, "entry");
  check("ad ticket for entry", /^[0-9a-f]{16}$/.test(t1));
  check("using it immediately → ad_too_short", (await call("entry", G, { adTicket: t1 })).body?.error === "ad_too_short");
  await sleep(1100);
  const e1 = await call("entry", G, { adTicket: t1 });
  check("after the ad (min seconds) → entry by ad", e1.status === 200 && e1.body.by === "ad" && e1.body.ads.entry === 29, e1.text);
  check("same ticket twice → bad_ticket", (await call("entry", G, { adTicket: t1 })).body?.error === "bad_ticket");
  const tA = await ticket(A, "entry"); await sleep(1100);
  check("someone else's ticket → bad_ticket", (await call("entry", G, { adTicket: tA })).body?.error === "bad_ticket");
  const tWrong = await ticket(G, "revive"); await sleep(1100);
  check("wrong kind (revive ticket for entry) → bad_ticket", (await call("entry", G, { adTicket: tWrong })).body?.error === "bad_ticket");
  check("revive by ad (guest)", (await call("revive_ad", G, { adTicket: tWrong })).body?.ok === true);
  check("revive ad cap 1/day → ad_limit", (await call("ad_start", G, { kind: "revive" })).body?.error === "ad_limit");
  const tOld = await ticket(G, "entry"); await sleep(1100);
  db().prepare("UPDATE ad_tickets SET day = '2000-01-01' WHERE id = ?").run(tOld);
  check("yesterday's ticket → bad_ticket", (await call("entry", G, { adTicket: tOld })).body?.error === "bad_ticket");
  db().prepare("UPDATE daily_entries SET day = '2000-01-01'").run();
  check("new day → 5 free entries again", (await call("entry_status", G)).body.left === 5);
  check("bad kind → 400", (await call("ad_start", G, { kind: "gold" })).status === 400);
  for (let i = 0; i < 5; i++) await call("ad_start", A, { kind: "entry" });
  check("max 5 open tickets → too_many_tickets", (await call("ad_start", A, { kind: "entry" })).body?.error === "too_many_tickets");
  // 개발자: 입장 무제한
  for (let i = 0; i < 7; i++) last = await call("entry", DEV, {});
  check("developer: unlimited entries", last.status === 200 && last.body.by === "developer" && last.body.unlimited === true);
  // dc#123: 운영자 기기(운영자 계정 + 등록한 기기)는 광고 보상 하루 상한도 없음 (테스트용). 운영자 계정이라도 등록 안 한 기기는 그대로
  const reg = spawnSync("php", [path.join(REPO, "ranking-php/admin.php"), "devices", "add", "adsdev-device-01", "test"], { env: { ...process.env, RANKING_CONFIG: path.join(DIR, "config.ads.php") } });
  const STAFF = { ...DEV, device: "adsdev-device-01" }, DEVX = { ...DEV, device: "adsdev-other-01" };
  const st1 = await call("ad_start", STAFF, { kind: "revive" });
  db().prepare("UPDATE ad_tickets SET used_at = 1 WHERE id = ?").run(st1.body.ticket);   // 오늘 광고 부활 1회(상한) 다 씀
  const st2 = await call("ad_start", STAFF, { kind: "revive" }), stx = await call("ad_start", DEVX, { kind: "revive" });
  const sStaff = (await call("entry_status", STAFF)).body;
  check("staff device: daily ad cap doesn't apply (revive cap 1 used → still gets a ticket, status shows full)", reg.status === 0 && st1.status === 200 && st2.status === 200 && !!st2.body.ticket && sStaff.ads.revive === 1, JSON.stringify([reg.stdout.toString(), st2.body, sStaff.ads]));
  check("same operator account on an unregistered device: cap applies (ad_limit)", stx.status === 429 && stx.body?.error === "ad_limit", stx.text);
  check("no raw ids in tables", !JSON.stringify([db().prepare("SELECT * FROM daily_entries").all(), db().prepare("SELECT * FROM ad_tickets").all()]).includes("adsguest-0000"));

  // ---- 거래소 수수료 면제 ----
  const find = (pred, tag) => { for (let n = 0; ; n++) { const it = RL.generate(`${tag}${n}|shop|d4|s${n % 6}`, "golden", 4); if (pred(it)) return it; } };
  const ref = (it) => ({ seed: it.seed, src: it.src, lvl: it.lvl, v: it.v, enh: 0, id: it.id, ...(it.r ? { r: it.r } : {}) });
  const goldOnly = (await call("market_list", A, { item: ref(find(x => x.rarity === "rare", "go")), gold: 30, cash: 0, stage: 4 })).body.listing.id;
  const cash2 = (await call("market_list", A, { item: ref(find(x => x.rarity === "epic", "c2")), gold: 0, cash: 2, stage: 4 })).body.listing.id;
  const cash3 = (await call("market_list", A, { item: ref(find(x => x.rarity === "rare", "c3")), gold: 0, cash: 3, stage: 4 })).body.listing.id;
  bal[B.sub] = 0; calls.length = 0;
  let tf = await ticket(B, "fee"); await sleep(1100);
  const g1 = await call("market_buy", B, { id: goldOnly, adTicket: tf });
  check("gold-only item with ad: bought with 0 cash, no Xsolla call", g1.status === 200 && g1.body.cash === 0 && g1.body.feeBy === "ad" && calls.length === 0, g1.text + " calls " + calls.join(","));
  check("server records fee paid by ad", db().prepare("SELECT fee_by FROM listings WHERE id = ?").get(goldOnly).fee_by === "ad");
  bal[B.sub] = 2; tf = await ticket(B, "fee"); await sleep(1100);
  const c1 = await call("market_buy", B, { id: cash2, adTicket: tf });
  check("cash item with ad: pays price only (2, no fee)", c1.status === 200 && c1.body.cash === 2 && bal[B.sub] === 0, c1.text);
  bal[B.sub] = 10; consumeFail = 1; tf = await ticket(B, "fee"); await sleep(1100);
  const f1 = await call("market_buy", B, { id: cash3, adTicket: tf });
  check("payment failure gives the ad ticket back", f1.body?.error === "payment_failed" && db().prepare("SELECT used_at FROM ad_tickets WHERE id = ?").get(tf).used_at === null);
  const c2 = await call("market_buy", B, { id: cash3, adTicket: tf });
  check("retry with the same ticket works", c2.status === 200 && c2.body.cash === 3 && bal[B.sub] === 7, c2.text);
  check("fee ad cap 3/day → ad_limit", (await call("ad_start", B, { kind: "fee" })).body?.error === "ad_limit");
  const hist = (await call("market_mine", B)).body.history;
  check("history shows feeBy=ad for the buyer", hist.filter(h => h.feeBy === "ad").length === 3);
  const cash4 = (await call("market_list", A, { item: ref(find(x => x.rarity === "rare", "c4")), gold: 0, cash: 1, stage: 4 })).body.listing.id;
  const n1 = await call("market_buy", B, { id: cash4 });
  check("without ad: price + fee 1 as before", n1.status === 200 && n1.body.cash === 2 && n1.body.feeBy === "cash" && bal[B.sub] === 5, n1.text);
  check("no PHP errors", !/Fatal|Warning|Notice|database is locked/.test(phpErr), phpErr.slice(-300));
} finally { php.kill(); mock.close(); }
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
