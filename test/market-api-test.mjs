// 거래소·우편함 서버 테스트: php -S + 가짜 Xsolla Store (캐시 잔액·차감·지급)
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
const REPO = process.argv[2];
const DIR = path.dirname(new URL(import.meta.url).pathname) + "/php";
const RL = createRequire(import.meta.url)(path.join(REPO, "items.js"));

// 서버는 아이템 값만 보냄 (dc#97): 참조로 다시 만든 이름 (서버가 이름 글자를 보내면 실패)
const nameOf = (v) => (v?.ref && !("name" in v) && !("itemName" in v) ? RL.itemName(RL.fromRef(v.ref, { gems: true })) : null);
const DB = path.join(DIR, "market.sqlite");
for (const f of [DB, DB + "-wal", DB + "-shm"]) fs.rmSync(f, { force: true });
fs.writeFileSync(path.join(DIR, "config.market.php"), `<?php
$c = require __DIR__ . '/config.test.php';
return array_merge($c, ['db_dsn' => 'sqlite:${DB}', 'xsolla_store_url' => 'http://127.0.0.1:8094/store', 'xsolla_api_key' => 'test-key', 'xsolla_project_id' => 317991]);
`);
const SECRET = "market-secret";
const results = [];
const check = (n, ok, x = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x ? " — " + x : ""}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ---- 가짜 Xsolla Store ----
export const store = { balance: {}, calls: [], consumeFail: 0, grantFail: 0 };
const subOf = (h) => { try { return JSON.parse(Buffer.from(h.split(".")[1], "base64url")).sub; } catch { return null; } };
const mock = http.createServer((req, res) => {
  let body = ""; req.on("data", c => body += c); req.on("end", () => {
    const send = (s, o) => { res.writeHead(s, { "Content-Type": "application/json" }); res.end(o === undefined ? "" : JSON.stringify(o)); };
    const p = req.url.replace("/store/v2/project/317991", "");
    const auth = req.headers.authorization || "";
    store.calls.push(`${req.method} ${p}`);
    if (p === "/user/virtual_currency_balance") { const s = subOf(auth.slice(7)); return send(200, { items: [{ sku: "cash", amount: store.balance[s] || 0 }] }); }
    if (p === "/user/inventory/item/consume") {
      const s = subOf(auth.slice(7)); const b = JSON.parse(body);
      if (store.consumeFail > 0) { store.consumeFail--; return send(500, { errorCode: 1, errorMessage: "temporary" }); }
      if (b.sku !== "cash" || (store.balance[s] || 0) < b.quantity) return send(422, { errorCode: 4001, errorMessage: "not enough" });
      store.balance[s] -= b.quantity; return send(204);
    }
    if (p === "/inventory/reward") {
      if (auth !== "Basic " + Buffer.from("317991:test-key").toString("base64")) return send(401, { errorCode: 1501 });
      if (store.grantFail > 0) { store.grantFail--; return send(500, { errorCode: 1 }); }
      for (const op of JSON.parse(body)) for (const it of op.items) store.balance[op.user.id] = (store.balance[op.user.id] || 0) + it.quantity;
      return send(200, { ok: true });
    }
    send(404, { errorCode: 9, errorMessage: "unmocked " + p });
  });
});
await new Promise(r => mock.listen(8094, "127.0.0.1", r));
const php = spawn("php", ["-S", "127.0.0.1:8095", "-t", path.join(REPO, "ranking-php")], { env: { ...process.env, RANKING_CONFIG: path.join(DIR, "config.market.php"), TEST_JWT_SECRET: SECRET }, stdio: ["ignore", "ignore", "pipe"] });
let phpErr = ""; php.stderr.on("data", d => { phpErr += d; });
await sleep(700);

const b64u = (s) => Buffer.from(s).toString("base64url");
const jwt = (sub, email) => { const h = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" })), p = b64u(JSON.stringify({ sub, email, exp: Math.floor(Date.now() / 1000) + 3600, xsolla_login_project_id: "30375188-893b-4b1a-ba1b-c8ba692fa5e3" })); return `${h}.${p}.${crypto.createHmac("sha256", SECRET).update(`${h}.${p}`).digest("base64url")}`; };
const user = (sub, email) => ({ sub, token: jwt(sub, email) });
const A = user("seller-sub-0001", "alice.seller@example.com"), B = user("buyer-sub-0002", "bob.buyer@example.com"), C = user("third-sub-0003", "carol@example.com");
const G = { guest: "guest1234-0000" };
async function call(method, route, who, body, query = "") {
  const headers = { "Content-Type": "application/json", Origin: "https://hucksoon.github.io" };
  if (who?.token) headers.Authorization = `Bearer ${who.token}`;
  if (who?.guest) headers["X-Guest-Id"] = who.guest;
  const res = await fetch(`http://127.0.0.1:8095/api.php?r=${route}${query}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await res.text(); let j = null; try { j = JSON.parse(t); } catch {}
  return { status: res.status, body: j, text: t };
}
const db = () => new DatabaseSync(DB);

// 게임이 실제로 만드는 형식의 시드로 아이템 찾기
const find = (pred, kind = "shop") => {
  for (let n = 0; n < 200000; n++) {
    const seed = kind === "box" ? `box|o${n}|${n % 50}` : `mrun${n}|shop|d5|s${n % 6}`;
    const it = RL.generate(seed, kind === "box" ? "box" : "golden", kind === "box" ? 1 : 5);
    if (pred(it)) return it;
  }
};
const ref = (it, extra = {}) => ({ seed: it.seed, src: it.src, lvl: it.lvl, v: it.v, enh: it.enh || 0, id: it.id, ...(it.r ? { r: it.r } : {}), ...extra });
const epic = find(x => x.rarity === "epic");
const rare = find(x => x.rarity === "rare");
const legend = find(x => x.rarity === "legendary" || x.rarity === "set");
const commons = []; for (let n = 0; commons.length < 11; n++) { const it = RL.generate(`crun${n}|shop|d5|s${n % 6}`, "golden", 5); if (!["legendary", "set"].includes(it.rarity) && !commons.some(c => c.id === it.id)) commons.push(it); }

try {
  // ---- 둘러보기 / 권한 ----
  const b0 = await call("GET", "market", null);
  check("browse without login works (empty)", b0.status === 200 && b0.body.rows.length === 0 && b0.body.fee === 1 && b0.body.hours === 24, b0.text.slice(0, 200));
  check("guest cannot list", (await call("POST", "market_list", G, { item: ref(epic), gold: 10, cash: 0, stage: 5 })).body?.error === "login_required");
  check("guest cannot open mailbox", (await call("GET", "market_mine", G)).status === 403);

  // ---- 등록 ----
  const l1 = await call("POST", "market_list", A, { item: ref(epic, { enh: 3, tries: 5 }), gold: 120, cash: 3, stage: 5 });
  check("A lists an epic for 120 gold + 3 cash", l1.status === 200 && nameOf(l1.body.listing.item) === RL.itemName({ ...epic, enh: 3 }) && l1.body.listing.mine && l1.body.listing.ref.tries === 5 && l1.body.listing.ref.enh === 3, l1.text.slice(0, 300));
  const L1 = l1.body.listing.id;
  check("listing expires in 24h", Math.abs(l1.body.listing.expiresAt - l1.body.listing.createdAt - 24 * 3600 * 1000) < 5);
  check("same item twice → already_listed", (await call("POST", "market_list", A, { item: ref(epic), gold: 1, cash: 0, stage: 5 })).body?.error === "already_listed");
  check("legendary/set without cash → cash_required", (await call("POST", "market_list", A, { item: ref(legend), gold: 500, cash: 0, stage: 5 })).body?.error === "cash_required", legend.rarity);
  check("bad price → 400", (await call("POST", "market_list", A, { item: ref(rare), gold: 0, cash: 0, stage: 5 })).body?.error === "bad_price" && (await call("POST", "market_list", A, { item: ref(rare), gold: -1, cash: 2, stage: 5 })).body?.error === "bad_price" && (await call("POST", "market_list", A, { item: ref(rare), gold: 1.5, cash: 2, stage: 5 })).body?.error === "bad_price");
  check("v1 item → old_item", (await call("POST", "market_list", A, { item: { ...ref(rare), v: 1 }, gold: 5, cash: 0, stage: 5 })).body?.error === "old_item");
  check("forged id → bad_item", (await call("POST", "market_list", A, { item: { ...ref(rare), id: "deadbeefdeadbeef" }, gold: 5, cash: 0, stage: 5 })).body?.error === "bad_item");
  check("item level above best floor → bad_item", (await call("POST", "market_list", A, { item: ref(rare), gold: 5, cash: 0, stage: 4 })).body?.error === "bad_item");
  check("made-up seed → bad_item", (await call("POST", "market_list", A, { item: ref(RL.generate("free|stuff", "golden", 5)), gold: 5, cash: 0, stage: 5 })).body?.error === "bad_item");
  const lg = await call("POST", "market_list", A, { item: ref(legend), gold: 0, cash: 7, stage: 5 });
  check("legendary/set with cash ok", lg.status === 200, lg.text.slice(0, 200));
  const b1 = await call("GET", "market", B);
  check("B browses: 2 listings, not mine, masked seller", b1.body.rows.length === 2 && b1.body.rows.every(r => !r.mine && r.seller === "ali***@example.com"));
  check("filters: rarity=epic → 1, slot filter", (await call("GET", "market", B, undefined, "&rarity=epic")).body.rows.length === 1 && (await call("GET", "market", B, undefined, `&slot=${legend.slot}`)).body.rows.some(r => r.id === lg.body.listing.id));
  check("sort by cash ascending", (await call("GET", "market", B, undefined, "&sort=cash")).body.rows[0].cash === 3);

  // ---- 구매 ----
  store.balance[B.sub] = 3;
  const nb = await call("POST", "market_buy", B, { id: L1 });
  check("not enough cash (needs 3 + fee 1) → 402, listing stays", nb.status === 402 && nb.body.error === "not_enough_cash" && store.balance[B.sub] === 3 && db().prepare("SELECT state FROM listings WHERE id = ?").get(L1).state === "active");
  store.balance[B.sub] = 10; store.consumeFail = 1;
  const pf = await call("POST", "market_buy", B, { id: L1 });
  check("Xsolla error → payment_failed, listing back to active, no charge", pf.body?.error === "payment_failed" && store.balance[B.sub] === 10 && db().prepare("SELECT state, buyer_key FROM listings WHERE id = ?").get(L1).buyer_key === null);
  check("cannot buy own listing", (await call("POST", "market_buy", A, { id: L1 })).body?.error === "own");
  const buy = await call("POST", "market_buy", B, { id: L1 });
  check("B buys: pays 3 + fee 1 = 4 cash", buy.status === 200 && buy.body.cash === 4 && buy.body.gold === 120 && store.balance[B.sub] === 6, buy.text);
  check("sold listing gone for others", (await call("POST", "market_buy", C, { id: L1 })).body?.error === "gone" && !(await call("GET", "market", C)).body.rows.some(r => r.id === L1));
  const row = db().prepare("SELECT * FROM listings WHERE id = ?").get(L1);
  check("server keeps the trade: seller, buyer, prices, fee, times", row.state === "sold" && row.buyer_display === "bob***@example.com" && row.seller_display === "ali***@example.com" && row.price_gold === 120 && row.price_cash === 3 && row.fee_cash === 1 && row.sold_at > 0 && row.created_at > 0);
  const raw = JSON.stringify([db().prepare("SELECT * FROM listings").all(), db().prepare("SELECT * FROM mail").all(), db().prepare("SELECT * FROM item_owner").all()]);
  check("no raw Xsolla user ids, emails or tokens stored", !raw.includes("seller-sub") && !raw.includes("buyer-sub") && !raw.includes("alice.seller") && !raw.includes(B.token.slice(0, 20)));

  // ---- 우편함 ----
  const mb = await call("GET", "market_mine", B);
  const bought = mb.body.mail.find(m => m.kind === "bought");
  check("B's mailbox: bought item with ref", bought && bought.ref.id === epic.id && bought.ref.enh === 3 && bought.ref.tries === 5);
  check("B's history shows the purchase", mb.body.history.some(h => h.id === L1 && h.role === "buyer"));
  const ma = await call("GET", "market_mine", A);
  const sale = ma.body.mail.find(m => m.kind === "sale");
  check("A's mailbox: sale proceeds 120 gold + 3 cash", sale && sale.gold === 120 && sale.cash === 3 && sale.note.includes("bob***@example.com"));
  check("sale mail: sold item shown by value (show), not claimable (no ref), no Korean name", sale && sale.ref === null && !("itemName" in sale) && RL.itemName(RL.fromRef(sale.show)) === RL.itemName({ ...epic, enh: 3 }), JSON.stringify(sale));
  check("lobby ping shows mail count", (await call("POST", "lobby", A, { scene: "lobby", x: 3, y: 3 })).body.mail === 1 && (await call("POST", "lobby", G, { scene: "lobby", x: 3, y: 3 })).body.mail === 0);
  store.grantFail = 1;
  const gf = await call("POST", "mail_claim", A, { id: sale.id });
  check("grant error → grant_failed, mail stays", gf.body?.error === "grant_failed" && (await call("GET", "market_mine", A)).body.mail.some(m => m.id === sale.id));
  const cl = await call("POST", "mail_claim", A, { id: sale.id });
  check("A claims: 3 cash granted by Xsolla, gold returned to game", cl.status === 200 && cl.body.mail.gold === 120 && store.balance[A.sub] === 3, cl.text);
  check("claim twice → not_found", (await call("POST", "mail_claim", A, { id: sale.id })).body?.error === "not_found");
  check("others cannot claim my mail", (await call("POST", "mail_claim", C, { id: bought.id })).body?.error === "not_found");
  const cb = await call("POST", "mail_claim", B, { id: bought.id });
  const it = RL.generate(cb.body.mail.ref.seed, cb.body.mail.ref.src, cb.body.mail.ref.lvl);
  check("B claims the item; game can rebuild it from the ref", cb.status === 200 && it.id === epic.id);

  // ---- 복사 방지 ----
  check("A cannot list a copy of the sold item", (await call("POST", "market_list", A, { item: ref(epic), gold: 5, cash: 0, stage: 5 })).body?.error === "not_owner");
  const relist = await call("POST", "market_list", B, { item: ref(epic, { enh: 3 }), gold: 0, cash: 9, stage: 5 });
  check("B (new owner) can relist it", relist.status === 200, relist.text.slice(0, 200));
  // 랭킹: A가 판 아이템을 최고 아이템으로 보내도 인정 안 됨
  await call("POST", "score", A, { stage: 5, plvl: 3, item: ref(epic), gear: [ref(epic)] });
  const ar = db().prepare("SELECT item_score, stage_gear FROM players_v4 WHERE display = 'ali***@example.com'").get();
  check("ranking ignores items sold to someone else", ar && ar.item_score === -1 && JSON.parse(ar.stage_gear).rejected === 1, JSON.stringify(ar));

  // ---- 취소 / 만료 ----
  const lr = await call("POST", "market_list", A, { item: ref(rare), gold: 50, cash: 0, stage: 5 });
  check("C cannot cancel A's listing", (await call("POST", "market_cancel", C, { id: lr.body.listing.id })).body?.error === "gone");
  const cn = await call("POST", "market_cancel", A, { id: lr.body.listing.id });
  check("A cancels → item to mailbox", cn.status === 200 && (await call("GET", "market_mine", A)).body.mail.some(m => m.kind === "returned" && m.ref.id === rare.id));
  check("cannot relist while it waits in the mailbox", (await call("POST", "market_list", A, { item: ref(rare), gold: 50, cash: 0, stage: 5 })).body?.error === "in_mail");
  await call("POST", "mail_claim", A, { id: cn.body.mail });
  check("after claiming, can list again", (await call("POST", "market_list", A, { item: ref(rare), gold: 50, cash: 0, stage: 5 })).status === 200);
  db().prepare("UPDATE listings SET expires_at = ? WHERE item_id = ? AND state = 'active'").run(Date.now() - 1, rare.id);
  const be = await call("GET", "market", C);
  check("after 24h: listing leaves the market", !be.body.rows.some(r => r.ref.id === rare.id));
  const ex = (await call("GET", "market_mine", A)).body;
  check("expired item waits in seller's mailbox", ex.mail.some(m => m.kind === "returned" && m.ref.id === rare.id && m.note.includes("24시간")) && ex.history.some(h => h.state === "expired"));
  check("expired listing cannot be bought", (await call("POST", "market_buy", C, { id: db().prepare("SELECT id FROM listings WHERE item_id = ? AND state = 'expired'").get(rare.id).id })).body?.error === "gone");

  // ---- 등록 개수 제한 ----
  let last;
  for (const c of commons) last = await call("POST", "market_list", C, { item: ref(c), gold: 1, cash: 0, stage: 5 });
  check("max 10 active listings per player", last.body?.error === "too_many" && db().prepare("SELECT COUNT(*) n FROM listings WHERE seller_display = 'c***@example.com' AND state = 'active'").get().n === 10, last.text);

  // ---- 골드만 받는 아이템도 수수료 1 ----
  const gl = (await call("GET", "market", B, undefined, "&sort=gold")).body.rows.find(r => r.cash === 0 && !r.mine);
  store.balance[B.sub] = 1;
  const gb = await call("POST", "market_buy", B, { id: gl.id });
  check("gold-only item: buyer still pays the 1 cash fee", gb.status === 200 && gb.body.cash === 1 && store.balance[B.sub] === 0, gb.text);
  store.balance[B.sub] = 0;
  check("no cash at all → cannot buy even gold-only items", (await call("POST", "market_buy", B, { id: (await call("GET", "market", B)).body.rows.find(r => r.cash === 0 && !r.mine).id })).body?.error === "not_enough_cash");

  // 동시에 두 명이 사면 한 명만
  store.balance[B.sub] = 50; store.balance[A.sub] = 50;
  const target = (await call("GET", "market", B)).body.rows.find(r => r.seller === "c***@example.com");
  const [r1, r2] = await Promise.all([call("POST", "market_buy", B, { id: target.id }), call("POST", "market_buy", A, { id: target.id })]);
  check("two buyers at once → exactly one wins, one charge", [r1, r2].filter(r => r.status === 200).length === 1 && [r1, r2].some(r => r.body?.error === "gone") && store.balance[B.sub] + store.balance[A.sub] === 99, `${r1.text} | ${r2.text}`);
  // ---- 운영자 선물 (gift.php, 서버 명령) ----
  const { spawnSync } = await import("node:child_process");
  const gift = (...args) => spawnSync("php", [path.join(REPO, "ranking-php/gift.php"), ...args], { env: { ...process.env, RANKING_CONFIG: path.join(DIR, "config.market.php"), TEST_JWT_SECRET: SECRET }, encoding: "utf8" });
  const g1 = gift("Alice.Seller@example.com", "99999", "99999", "테스터 지급");
  check("gift.php finds the player by email HMAC (case-insensitive) and mails gold + cash", g1.status === 0 && g1.stdout.includes("ali***@example.com 우편함에 선물을 넣었어요: 골드 99999, 캐시 99999"), g1.stdout + g1.stderr);
  check("gift.php: unknown email → clear error, exit 1", (() => { const r = gift("nobody@example.com", "1", "1"); return r.status === 1 && r.stderr.includes("플레이한 기록이 없어요"); })());
  check("gift.php: bad arguments → usage", (() => { const r = gift("x", "a", "1"); return r.status === 1 && r.stderr.includes("사용법"); })());
  check("gift.php is not reachable from the web", (await fetch("http://127.0.0.1:8095/gift.php")).status === 404);
  check("gift row stores no raw email", !JSON.stringify(db().prepare("SELECT * FROM mail WHERE kind = 'gift'").all()).toLowerCase().includes("alice.seller"));
  const gm = (await call("GET", "market_mine", A)).body.mail.find(m => m.kind === "gift");
  check("gift shows in A's mailbox with note", gm && gm.gold === 99999 && gm.cash === 99999 && gm.note === "테스터 지급" && gm.ref === null);
  const before = store.balance[A.sub] || 0;
  const gc = await call("POST", "mail_claim", A, { id: gm.id });
  check("claiming the gift grants 99999 cash via Xsolla and returns 99999 gold", gc.status === 200 && gc.body.mail.gold === 99999 && store.balance[A.sub] === before + 99999, gc.text);
  check("gift claimed once only", (await call("POST", "mail_claim", A, { id: gm.id })).body?.error === "not_found");
  // 예전 서버에서 멈춘 우편 복구: 캐시는 지급됐는데 state = 'claiming'으로 남은 경우
  const g2 = gift("alice.seller@example.com", "500", "700", "멈춘 선물");
  const stuckId = g2.stdout.match(/우편 ([0-9a-f]{16})/)[1];
  db().prepare("UPDATE mail SET state = 'claiming', granted_at = NULL WHERE id = ?").run(stuckId);
  check("stuck mail (claiming) cannot be claimed before repair", (await call("POST", "mail_claim", A, { id: stuckId })).body?.error === "not_found");
  const rs = gift("--resume", "alice.seller@example.com");
  check("gift.php --resume marks the stuck cash as already paid", rs.status === 0 && rs.stdout.includes("캐시 700은 이미 받은 것으로 표시") && rs.stdout.includes("골드 500만"), rs.stdout + rs.stderr);
  const cashBefore = store.balance[A.sub];
  const rc = await call("POST", "mail_claim", A, { id: stuckId });
  check("after repair: claim gives the gold, cash NOT paid twice", rc.status === 200 && rc.body.mail.gold === 500 && store.balance[A.sub] === cashBefore, rc.text);
  check("cashPaid: 0 when cash was paid earlier", rc.body.cashPaid === 0);
  // 결제 중 멈춘 구매: 캐시를 받았으면(paid_at) 1분 뒤 자동 마무리, 못 받았으면 2분 뒤 다시 판매 중
  {
    const its = []; for (let n = 0; its.length < 2; n++) { const x = RL.generate(`stuck${n}|shop|d5|s${n % 6}`, "golden", 5); if (x.rarity === "rare" || x.rarity === "epic") its.push(x); }
    const s1 = (await call("POST", "market_list", A, { item: ref(its[0]), gold: 5, cash: 2, stage: 5 })).body.listing.id;
    const s2 = (await call("POST", "market_list", A, { item: ref(its[1]), gold: 5, cash: 2, stage: 5 })).body.listing.id;
    const bkey = db().prepare("SELECT buyer_key, buyer_display FROM listings WHERE buyer_display = 'bob***@example.com' LIMIT 1").get();
    db().prepare("UPDATE listings SET state = 'buying', buyer_key = ?, buyer_display = ?, buying_at = ?, paid_at = ? WHERE id = ?").run(bkey.buyer_key, bkey.buyer_display, Date.now() - 70000, Date.now() - 69000, s1);
    db().prepare("UPDATE listings SET state = 'buying', buyer_key = ?, buyer_display = ?, buying_at = ?, paid_at = NULL WHERE id = ?").run(bkey.buyer_key, bkey.buyer_display, Date.now() - 130000, s2);
    await call("GET", "market", C);
    const r1 = db().prepare("SELECT state FROM listings WHERE id = ?").get(s1).state, r2 = db().prepare("SELECT state FROM listings WHERE id = ?").get(s2).state;
    check("paid but unrecorded purchase completes automatically (item to buyer's mailbox)", r1 === "sold" && (await call("GET", "market_mine", B)).body.mail.some(m => m.kind === "bought" && m.ref.id === its[0].id), r1);
    check("unpaid stuck purchase goes back on sale", r2 === "active", r2);
  }
  check("--resume with nothing stuck", gift("--resume", "alice.seller@example.com").stdout.includes("멈춘 우편이 없어요"));
  // 지급은 됐는데 마무리 직전에 실패한 경우(새 서버): 다음 받기에서 지급 없이 마무리
  const g3 = gift("alice.seller@example.com", "40", "60", "마무리 테스트");
  const m3 = g3.stdout.match(/우편 ([0-9a-f]{16})/)[1];
  db().prepare("UPDATE mail SET state = 'claiming', granted_at = ? WHERE id = ?").run(Date.now(), m3);
  const cb3 = store.balance[A.sub];
  const r3 = await call("POST", "mail_claim", A, { id: m3 });
  check("granted but unfinished mail: next claim finishes without paying again", r3.status === 200 && r3.body.mail.gold === 40 && store.balance[A.sub] === cb3, r3.text);
  check("no PHP errors", !/Fatal|Warning|Notice/.test(phpErr), phpErr.slice(-400));
} finally {
  php.kill(); mock.close();
}
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
