// Xsolla 웹훅(webhook.php) 1단계 서버 테스트: 서명, user_validation, 주문 기록(한 번만), 다른 프로젝트·형식 오류, admin.php webhooks
import { spawn, execFileSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
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
const serve = (port, cfg) => spawn("php", ["-S", `127.0.0.1:${port}`, "-t", path.join(REPO, "ranking-php")], { env: { ...process.env, RANKING_CONFIG: cfg }, stdio: ["ignore", "ignore", "pipe"] });
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
const rows = () => { for (let i = 0; ; i++) { const d = new DatabaseSync(DB); try { return d.prepare("SELECT * FROM xsolla_events ORDER BY created_at, event_key").all(); } catch (e) { if (/no such table/.test(e.message)) return []; if (!/locked|busy/.test(e.message) || i >= 50) throw e; } finally { d.close(); } Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50); } };
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
} finally { php.kill(); php0.kill(); }
check("no php errors", !/Fatal|Warning|Notice|Deprecated/.test(phpErr), phpErr.slice(0, 400));
console.log(`${results.filter(Boolean).length}/${results.length} passed`);
