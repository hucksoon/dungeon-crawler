// Xsolla 웹훅(webhook.php) 1단계 서버 테스트: 서명, user_validation, 주문 기록(한 번만), 다른 프로젝트·형식 오류, admin.php webhooks
import { spawn, execFileSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { createRequire } from "node:module";
import crypto from "node:crypto"; import fs from "node:fs"; import path from "node:path";
const REPO = process.argv[2];
const DIR = path.dirname(new URL(import.meta.url).pathname) + "/php";
const DB = path.join(DIR, "webhook.sqlite"); for (const f of [DB, DB + "-wal", DB + "-shm"]) fs.rmSync(f, { force: true });
const SECRET = "test-webhook-secret";  // 가짜 키
const CFG = path.join(DIR, "config.webhook.php"), CFG0 = path.join(DIR, "config.webhook0.php");
fs.writeFileSync(CFG, `<?php\n$c = require __DIR__ . '/config.test.php';\nreturn array_merge($c, ['db_dsn' => 'sqlite:${DB}', 'xsolla_project_id' => 317991, 'webhook_secret' => '${SECRET}']);\n`);
fs.writeFileSync(CFG0, `<?php\n$c = require __DIR__ . '/config.test.php';\nreturn array_merge($c, ['db_dsn' => 'sqlite:${DB}']);\n`);
const results = []; const check = (n, ok, x = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x && !ok ? " — " + x : ""}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const JWT_SECRET = "webhook-jwt";
const serve = (port, cfg) => spawn("php", ["-S", `127.0.0.1:${port}`, "-t", path.join(REPO, "ranking-php")], { env: { ...process.env, RANKING_CONFIG: cfg, TEST_JWT_SECRET: JWT_SECRET }, stdio: ["ignore", "ignore", "pipe"] });
const php = serve(8131, CFG), php0 = serve(8132, CFG0);
let phpErr = ""; php.stderr.on("data", d => phpErr += d);
await sleep(700);

const sign = (raw, key = SECRET) => crypto.createHash("sha1").update(raw + key).digest("hex");
async function hook(body, { sig, port = 8131, method = "POST", auth } = {}) {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  const headers = { "Content-Type": "application/json" };
  if (auth !== null) headers.Authorization = auth ?? `Signature ${sig ?? sign(raw)}`;
  const r = await fetch(`http://127.0.0.1:${port}/webhook.php`, { method, headers, body: method === "POST" ? raw : undefined });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {} return { status: r.status, code: j?.error?.code, text: t };
}
// PHP가 막 쓴 직후엔 잠깐 잠겨 있을 수 있어서 몇 번 다시 읽음
// 게임 로그인 흉내: 게임은 로그인하면 맨 먼저 계정 저장본을 불러옴 (GET profile) → 그때 서버가 사용자를 기억
const b64u = (x) => Buffer.from(x).toString("base64url");
const jwt = (sub) => { const h = b64u(JSON.stringify({ alg: "HS256" })), p = b64u(JSON.stringify({ sub, email: `${sub}@example.com`, exp: Math.floor(Date.now() / 1000) + 3600, xsolla_login_project_id: "30375188-893b-4b1a-ba1b-c8ba692fa5e3" })); return `${h}.${p}.${crypto.createHmac("sha256", JWT_SECRET).update(`${h}.${p}`).digest("base64url")}`; };
const game = (sub, method = "GET", body) => fetch("http://127.0.0.1:8131/api.php?r=profile", { method, headers: { Authorization: `Bearer ${jwt(sub)}`, "Content-Type": "application/json", Origin: "https://hucksoon.github.io" }, body }).then(r => r.json());
const sql = (q, ...a) => { for (let i = 0; ; i++) { const d = new DatabaseSync(DB); try { return d.prepare(q).all(...a); } catch (e) { if (/no such table/.test(e.message)) return []; if (!/locked|busy/.test(e.message) || i >= 50) throw e; } finally { d.close(); } Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50); } };
const rows = () => sql("SELECT * FROM xsolla_events ORDER BY created_at, event_key");
const userKey = (id) => crypto.createHmac("sha256", "k".repeat(40)).update("u:" + id).digest("hex");
const USER = "a1b2c3d4-0000-4000-8000-0000000000aa", EMAIL = "buyer@example.com", IP = "203.0.113.77";

const validation = { notification_type: "user_validation", settings: { project_id: 317991, merchant_id: 1 }, user: { ip: IP, email: EMAIL, id: USER, country: "KR" } };
// 합쳐진 방식 (2025-01-22 이후 프로젝트)
const paid = (orderId, txId, extra = {}) => ({
  notification_type: "order_paid",
  items: [{ sku: "box_ancient", type: "virtual_good", quantity: 1, amount: "4.99" }, { sku: "cash", type: "virtual_currency", quantity: 500, amount: "0" }],
  order: { id: orderId, mode: "sandbox", currency_type: "real", currency: "USD", amount: "4.99", status: "paid", invoice_id: String(txId) },
  user: { external_id: USER, email: EMAIL, country: "KR" },
  billing: { notification_type: "payment", settings: { project_id: 317991, merchant_id: 1 }, purchase: { total: { currency: "USD", amount: 4.99 } }, transaction: { id: txId, dry_run: 1 } },
  ...extra,
});

try {
  // ---- 서명 ----
  check("GET → 404", (await hook(validation, { method: "GET" })).status === 404);
  // ---- user_validation: 게임에 로그인한 적 있는 사용자만 ----
  const rnd = { notification_type: "user_validation", settings: { project_id: 317991, merchant_id: 16851 }, user: { id: "test_xsolla_1792858782" } };
  check("random user (Xsolla tester) → 400 INVALID_USER", (await hook(rnd)).code === "INVALID_USER");
  check("real user before logging in to the game → 400 INVALID_USER", (await hook(validation)).code === "INVALID_USER");
  const g = await game(USER);
  check("game login (profile GET, no save yet) → user remembered", g.rev === 0 && g.data === null, JSON.stringify(g));
  const v = await hook(validation);
  check("user_validation, correct signature → 204", v.status === 204, v.text);
  check("wrong signature → 400 INVALID_SIGNATURE", (await hook(validation, { sig: sign(JSON.stringify(validation), "other-key") })).code === "INVALID_SIGNATURE");
  check("no Authorization header → 400 INVALID_SIGNATURE", (await hook(validation, { auth: null })).code === "INVALID_SIGNATURE");
  check("bearer token instead of signature → 400", (await hook(validation, { auth: "Bearer abc" })).status === 400);
  const pretty = JSON.stringify(validation, null, 2);
  check("signature is over the raw body (spaces, unicode kept) → 204", (await hook(pretty)).status === 204);
  check("body changed after signing → 400 INVALID_SIGNATURE", (await hook(pretty.replace("KR", "JP"), { sig: sign(pretty) })).code === "INVALID_SIGNATURE");
  check("lower-case 'signature' prefix and upper-case hex accepted", (await hook(JSON.stringify(validation), { auth: `signature ${sign(JSON.stringify(validation)).toUpperCase()}` })).status === 204);
  check("secret not configured → 500 NOT_CONFIGURED", (await hook(validation, { port: 8132 })).code === "NOT_CONFIGURED");

  // ---- user_validation ----
  check("user without id → 400 INVALID_USER", (await hook({ ...validation, user: { email: EMAIL } })).code === "INVALID_USER");
  check("another project → 400 INVALID_PARAMETER", (await hook({ ...validation, settings: { project_id: 999 } })).code === "INVALID_PARAMETER");
  check("broken JSON (signed) → 400 INVALID_PARAMETER", (await hook("{not json")).code === "INVALID_PARAMETER");
  check("no notification_type → 400", (await hook({ user: { id: USER } })).status === 400);
  check("user_validation writes nothing", rows().length === 0);
  const SAVED = "b2c3d4e5-0000-4000-8000-0000000000bb";
  await game(SAVED, "POST", JSON.stringify({ rev: 0, data: { v: 1, save: null, inv: { bag: [], equip: {}, stones: 0 }, dex: { seen: {}, kills: {} }, boxMail: [] } }));
  check("user with a saved game → 204", (await hook({ ...validation, user: { id: SAVED } })).status === 204);
  check("logging in again does not add a second row", (await game(USER)).rev === 0 && sql("SELECT COUNT(*) n FROM known_users")[0].n === 1);

  // ---- order_paid (합쳐진 방식) ----
  const p1 = await hook(paid(5001, 9001));
  check("order_paid → 204", p1.status === 204, p1.text);
  let r = rows();
  check("recorded once with order and transaction ids", r.length === 1 && r[0].event_key === "order_paid:5001" && r[0].order_id === "5001" && r[0].tx_id === "9001" && r[0].state === "recorded", JSON.stringify(r));
  check("user stored only as the game's HMAC key (u:<id>)", r[0]?.user_key === userKey(USER));
  check("sandbox flag, amount, currency, SKUs×quantity", r[0]?.sandbox === 1 && r[0].amount === "4.99" && r[0].currency === "USD" && JSON.parse(r[0].items).map(i => `${i.sku}×${i.quantity}`).join() === "box_ancient×1,cash×500", JSON.stringify(r[0]));
  const again = await hook(paid(5001, 9001));
  check("same order_paid again (retry) → 204, still one row", again.status === 204 && rows().length === 1);
  check("another project's order → 400, not recorded", (await hook(paid(5002, 9002, { billing: { ...paid(0, 0).billing, settings: { project_id: 1 } } }))).status === 400 && rows().length === 1);
  check("order_paid without order id → 400 INVALID_PARAMETER", (await hook({ ...paid(0, 0), order: {} })).code === "INVALID_PARAMETER");
  check("odd order id (not a plain id) → 400", (await hook({ ...paid(0, 0), order: { ...paid(0, 0).order, id: "1; DROP TABLE" } })).status === 400 && rows().length === 1);
  const c1 = await hook({ ...paid(5001, 9001), notification_type: "order_canceled", order: { ...paid(5001, 9001).order, status: "canceled" } });
  check("order_canceled for the same order → own row", c1.status === 204 && rows().some(x => x.event_key === "order_canceled:5001"));
  const live = await hook({ ...paid(5003, 9003), order: { ...paid(5003, 9003).order, mode: "default" }, billing: { ...paid(5003, 9003).billing, transaction: { id: 9003 } } });
  check("real (non-sandbox) payment flagged sandbox 0", live.status === 204 && rows().find(x => x.event_key === "order_paid:5003")?.sandbox === 0);

  // ---- 나뉜 방식 (예전 프로젝트): payment + order_paid ----
  const pay = { notification_type: "payment", settings: { project_id: 317991, merchant_id: 1 }, purchase: { total: { currency: "USD", amount: 9.99 } }, user: { id: USER, email: EMAIL, ip: IP }, transaction: { id: 7001, dry_run: 1 } };
  check("payment (separate) → 204, recorded by transaction id", (await hook(pay)).status === 204 && rows().find(x => x.event_key === "payment:7001")?.amount === "9.99");
  check("payment retried → still one row", (await hook(pay)).status === 204 && rows().filter(x => x.event_key === "payment:7001").length === 1);
  const sepPaid = { notification_type: "order_paid", items: [{ sku: "cash_1000", quantity: 1 }], order: { id: 6001, mode: "sandbox", amount: "9.99", currency: "USD" }, user: { external_id: USER } };
  check("order_paid (separate, no billing) → recorded by order id", (await hook(sepPaid)).status === 204 && rows().find(x => x.event_key === "order_paid:6001")?.tx_id === null);
  check("refund → recorded", (await hook({ ...pay, notification_type: "refund" })).status === 204 && rows().some(x => x.event_key === "refund:7001"));

  // ---- 그 밖 ----
  const before = rows().length;
  check("unknown type (e.g. create_subscription) → 204, nothing recorded", (await hook({ notification_type: "create_subscription", user: { id: USER } })).status === 204 && rows().length === before);
  check("too large body → 400", (await hook(JSON.stringify({ notification_type: "order_paid", pad: "x".repeat(300000) }))).status === 400);

  // ---- 개인정보: 원본 이메일·IP·사용자 ID는 DB 어디에도 없음 ----
  const bytes = fs.readFileSync(DB).toString("latin1") + (fs.existsSync(DB + "-wal") ? fs.readFileSync(DB + "-wal").toString("latin1") : "");
  check("no raw email / IP / user id stored", !bytes.includes(EMAIL) && !bytes.includes(IP) && !bytes.includes(USER));

  // ---- admin.php webhooks ----
  const out = execFileSync("php", [path.join(REPO, "ranking-php/admin.php"), "webhooks", "3"], { env: { ...process.env, RANKING_CONFIG: CFG } }).toString();
  check("admin.php webhooks lists recent rows", /웹훅 기록 \d+건 \(최근 3건\)/.test(out) && out.includes("refund") && out.includes("[sandbox]") && !out.includes(USER), out);
  check("admin.php webhooks shows SKUs and real/sandbox", execFileSync("php", [path.join(REPO, "ranking-php/admin.php"), "webhooks", "50"], { env: { ...process.env, RANKING_CONFIG: CFG } }).toString().includes("box_ancient×1, cash×500") && out.length > 0);

  // ---- 2단계: 장비 상자 (캐시로 산 상자) → 서버가 열어서 우편함으로 ----
  const I = createRequire(import.meta.url)(path.join(REPO, "items.js"));
  const api = (sub, route, { method = "GET", body } = {}) => fetch(`http://127.0.0.1:8131/api.php?r=${route}`, { method, headers: { Authorization: `Bearer ${jwt(sub)}`, "Content-Type": "application/json", Origin: "https://hucksoon.github.io" }, body: body && JSON.stringify(body) }).then(async r => ({ status: r.status, body: await r.json().catch(() => null) }));
  const prof = (best) => ({ rev: 0, data: { v: 1, save: { v: 1, best, run: null, dead: null }, inv: { bag: [], equip: {}, stones: 0 }, dex: { seen: {}, kills: {} }, boxMail: [] } });
  const BUYER = "c3d4e5f6-0000-4000-8000-0000000000cc";
  await game(BUYER, "POST", JSON.stringify(prof(40)));   // 계정 저장본의 최고 층 40
  // 나뉜 방식: 캐시로 산 상자의 order_paid (billing 없음, 금액은 캐시)
  const boxPaid = (orderId, items, user = BUYER) => ({ notification_type: "order_paid", items, order: { id: orderId, mode: "default", currency_type: "virtual", currency: "cash", amount: "10", status: "paid" }, user: { external_id: user, email: EMAIL } });
  check("box order_paid → 204", (await hook(boxPaid(8001, [{ sku: "box_equipment_10", type: "virtual_good", quantity: 1 }]))).status === 204);
  let mails = sql("SELECT * FROM mail WHERE kind = 'box' AND owner_key = ? ORDER BY created_at, id", userKey(BUYER));
  check("10 box items put in the buyer's mailbox", mails.length === 10 && mails.every(m => m.state === "new"), String(mails.length));
  const want = Array.from({ length: 10 }, (_, i) => I.generate(`box|o8001|${i}`, "box", 40));
  const refs = mails.map(m => JSON.parse(m.item_ref));
  check("same items the shop used to open in the browser (seed box|o<order>|i, level = best floor 40)", refs.every(r => r.lvl === 40 && r.src === "box" && r.r === 8) && want.every(w => refs.some(r => r.id === w.id && r.seed === w.seed)), JSON.stringify(refs[0]));
  check("game can rebuild every mailed item (RLItems.fromRef)", refs.every(r => I.fromRef(r)?.id === r.id));
  check("box_items rows granted, event state granted", sql("SELECT COUNT(*) n FROM box_items WHERE order_id = '8001' AND state = 'granted'")[0].n === 10 && sql("SELECT state FROM xsolla_events WHERE event_key = 'order_paid:8001'")[0].state === "granted");
  check("same webhook again → no second grant", (await hook(boxPaid(8001, [{ sku: "box_equipment_10", quantity: 1 }]))).status === 204 && sql("SELECT COUNT(*) n FROM mail WHERE kind = 'box'")[0].n === 10);
  await hook(boxPaid(8002, [{ sku: "box_equipment_1", quantity: 2 }, { sku: "cash", quantity: 5 }]));
  check("quantity 2 → two boxes with different seeds, non-box SKUs ignored", sql("SELECT seed FROM box_items WHERE order_id = '8002' ORDER BY seed").map(r => r.seed).join() === "box|o8002q1|0,box|o8002|0");
  check("cash pack order (no box) → recorded only", (await hook({ ...boxPaid(8003, [{ sku: "cash_10", quantity: 1 }]), order: { id: 8003, mode: "sandbox", currency: "USD", amount: "1.00" } })).status === 204 && sql("SELECT state FROM xsolla_events WHERE event_key = 'order_paid:8003'")[0].state === "recorded" && !sql("SELECT 1 FROM box_items WHERE order_id = '8003'").length);
  check("box order without user → not granted, state no_user", (await hook({ ...boxPaid(8004, [{ sku: "box_equipment_1", quantity: 1 }]), user: {} })).status === 204 && sql("SELECT state FROM xsolla_events WHERE event_key = 'order_paid:8004'")[0].state === "no_user");
  const unknownBox = await hook(boxPaid(8005, [{ sku: "box_equipment_99", quantity: 1 }]));
  check("unknown box size (box_equipment_99) → not granted", unknownBox.status === 204 && !sql("SELECT 1 FROM box_items WHERE order_id = '8005'").length);
  const noSave = "d4e5f6a7-0000-4000-8000-0000000000dd";
  await game(noSave);   // 로그인만 (저장본 없음)
  await hook(boxPaid(8006, [{ sku: "box_equipment_1", quantity: 1 }], noSave));
  check("buyer without a save → level 1 items", JSON.parse(sql("SELECT m.item_ref FROM box_items b JOIN mail m ON m.id = b.mail_id WHERE b.order_id = '8006'")[0].item_ref).lvl === 1);

  // 상점: 방금 산 상자의 결과
  const bo = await api(BUYER, "box_order&order=8001");
  check("box_order: ready with the 10 refs and mail count", bo.status === 200 && bo.body.ready === true && bo.body.revoked === false && bo.body.items.length === 10 && bo.body.items.every(r => I.fromRef(r)) && bo.body.mail >= 10, JSON.stringify(bo.body).slice(0, 200));
  check("box_order: someone else's order → not ready", (await api(SAVED, "box_order&order=8001")).body.ready === false);
  check("box_order: order not processed yet → not ready", (await api(BUYER, "box_order&order=9999")).body.ready === false);
  check("box_order: bad order id → 400", (await api(BUYER, "box_order&order=a%27b")).status === 400);
  const mine = await api(BUYER, "market_mine");
  check("mailbox lists box mail with item refs", mine.body.mail.filter(m => m.kind === "box").length >= 12 && mine.body.mail.find(m => m.kind === "box").ref.src === "box");
  const one = mine.body.mail.find(m => m.kind === "box" && sql("SELECT order_id FROM box_items WHERE mail_id = ?", m.id)[0].order_id === "8002");
  const cl = await api(BUYER, "mail_claim", { method: "POST", body: { id: one.id } });
  check("claim a box mail → ok with the item ref", cl.status === 200 && cl.body.ok && I.fromRef(cl.body.mail.ref)?.id === one.ref.id);

  // 환불 → 회수
  const phpEval = (code) => execFileSync("php", ["-r", `define('RANKING_NO_ROUTE', true); require '${path.join(REPO, "ranking-php/api.php")}'; ${code}`], { env: { ...process.env, RANKING_CONFIG: CFG } }).toString();
  check("before refund: box seed accepted (seed_origin_ok)", phpEval(`echo seed_origin_ok(4, 'box|o8001|0', 'box', 40, 8) ? 'ok' : 'no';`) === "ok");
  const cancel = await hook({ ...boxPaid(8001, [{ sku: "box_equipment_10", quantity: 1 }]), notification_type: "order_canceled" });
  check("order_canceled → 204, unclaimed box mail revoked", cancel.status === 204 && sql("SELECT COUNT(*) n FROM mail WHERE kind = 'box' AND state = 'revoked'")[0].n === 10 && sql("SELECT state FROM xsolla_events WHERE event_key = 'order_canceled:8001'")[0].state === "revoked");
  check("revoked mail gone from the mailbox, claim → 404", !(await api(BUYER, "market_mine")).body.mail.some(m => mails.some(x => x.id === m.id)) && (await api(BUYER, "mail_claim", { method: "POST", body: { id: mails[0].id } })).status === 404);
  check("refunded box seed no longer accepted (ranking, market)", phpEval(`echo seed_origin_ok(4, 'box|o8001|0', 'box', 40, 8) ? 'ok' : 'no';`) === "no");
  check("other orders' and old shop-opened box seeds still accepted", phpEval(`echo seed_origin_ok(4, 'box|o8002|0', 'box', 40, 8) && seed_origin_ok(4, 'box|o424242|3', 'box', 10, 8) ? 'ok' : 'no';`) === "ok");
  check("box_order after refund → revoked", (await api(BUYER, "box_order&order=8001")).body.revoked === true);
  await hook({ ...boxPaid(8007, [{ sku: "box_equipment_1", quantity: 1 }]), notification_type: "order_canceled" });
  check("cancel arrives before payment → later order_paid grants nothing", (await hook(boxPaid(8007, [{ sku: "box_equipment_1", quantity: 1 }]))).status === 204 && !sql("SELECT 1 FROM box_items WHERE order_id = '8007'").length && sql("SELECT state FROM xsolla_events WHERE event_key = 'order_paid:8007'")[0].state === "canceled");
  // ---- 예전 상자 시드 좁히기: 서버에 있는 예전 상자 아이템을 등록한 뒤, 서버 기록이 있는 시드만 ----
  const admin = (...a) => execFileSync("php", [path.join(REPO, "ranking-php/admin.php"), ...a], { env: { ...process.env, RANKING_CONFIG: CFG } }).toString();
  const seedOk = (seed, lvl = 10) => phpEval(`echo seed_origin_ok(4, '${seed}', 'box', ${lvl}, 8) ? 'ok' : 'no';`) === "ok";
  const OLD = "f6a7b8c9-0000-4000-8000-0000000000ff";
  const oldBag = I.generate("box|o5551|0", "box", 10), oldEq = I.generate("box|o5551|1", "box", 10), oldBoxMail = I.generate("box|orec77x0|0", "box", 10), oldGift = I.generate("box|o5552|3", "box", 10);
  await game(OLD, "POST", JSON.stringify({ rev: 0, data: { v: 1, save: { v: 1, best: 10, run: null, dead: null }, inv: { bag: [oldBag], equip: { head: null, chest: null, arms: null, pants: null, boots: null, weapon: oldEq }, stones: 0 }, dex: { seen: {}, kills: {} }, boxMail: [{ item: oldBoxMail, from: "box" }] } }));
  sql("SELECT 1");   // DB 준비
  { const d = new DatabaseSync(DB); try { d.prepare("INSERT INTO mail (id, owner_key, kind, item_id, item_ref, item_name, rarity, gold, cash, state, created_at) VALUES ('legacygift000001', ?, 'gift', ?, ?, 'x', 'common', 0, 0, 'new', 1)").run(userKey(OLD), oldGift.id, JSON.stringify({ seed: oldGift.seed, src: "box", lvl: 10, v: 4, r: 8, id: oldGift.id })); } finally { d.close(); } }
  check("boxes: not narrowed yet, forged box seed still accepted", admin("boxes").includes("좁히기 전") && seedOk("box|o999999|0"));
  const dry = admin("boxes", "legacy");
  check("boxes legacy (dry run): finds old box items in saves and mail, changes nothing", /예전 상자 아이템 4개 .*계정 저장본 3 · 랭킹 0 · 거래소 0 · 우편 1/.test(dry) && dry.includes("확인만 했어요") && admin("boxes").includes("좁히기 전"), dry);
  const applied = admin("boxes", "legacy", "--apply");
  check("--apply: registers them as legacy and narrows", applied.includes("4개를 등록하고 좁혔어요") && admin("boxes").includes("좁힘") && sql("SELECT COUNT(*) n FROM box_items WHERE state = 'legacy'")[0].n === 4, applied);
  check("narrowed: registered old box items still accepted", [oldBag, oldEq, oldBoxMail, oldGift].every(it => seedOk(it.seed)));
  check("narrowed: forged / unknown box seed rejected", !seedOk("box|o999999|0") && !seedOk("box|o5551|7"));
  check("narrowed: server-granted seeds accepted, refunded still rejected", seedOk("box|o8002|0", 40) && !seedOk("box|o8001|0", 40));
  check("apply again → nothing new", admin("boxes", "legacy", "--apply").includes("0개를 등록"));
  const ref = await api(OLD, "market_list", { method: "POST", body: { item: { seed: "box|o999999|0", src: "box", lvl: 10, v: 4, r: 8, enh: 0, id: I.generate("box|o999999|0", "box", 10).id }, gold: 100, cash: 0, stage: 10 } });
  const okList = await api(OLD, "market_list", { method: "POST", body: { item: { seed: oldBag.seed, src: "box", lvl: 10, v: 4, r: 8, enh: 0, id: oldBag.id }, gold: 100, cash: 0, stage: 10 } });
  check("narrowed: market refuses a forged box item but lists a registered old one", ref.status === 400 && okList.status === 200, JSON.stringify([ref, okList]));
  check("strict off → back to the old rule (escape hatch)", admin("boxes", "strict", "off").includes("껐어요") && seedOk("box|o999999|0") && admin("boxes").includes("좁히기 전"));
  admin("boxes", "legacy", "--apply");
  const adm = execFileSync("php", [path.join(REPO, "ranking-php/admin.php"), "webhooks", "50"], { env: { ...process.env, RANKING_CONFIG: CFG } }).toString();
  check("admin.php webhooks: [캐시] for cash orders, granted / revoked / no user", adm.includes("[캐시]") && adm.includes("→ 우편함 지급") && adm.includes("→ 회수") && adm.includes("→ 사용자 없음"), adm);
} finally { php.kill(); php0.kill(); }
check("400s logged with reason and type only", phpErr.includes("[webhook] 400 INVALID_USER type=user_validation") && phpErr.includes("[webhook] 400 INVALID_SIGNATURE") && !phpErr.includes(USER) && !phpErr.includes("test_xsolla_"), phpErr.slice(0, 300));
check("no php errors", !/Fatal|Warning|Notice|Deprecated/.test(phpErr), phpErr.slice(0, 400));
console.log(`${results.filter(Boolean).length}/${results.length} passed`);
