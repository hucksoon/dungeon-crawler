// 고대 유니크 선택 상자 서버 테스트: php -S + 가짜 Xsolla Store (인벤토리·소모)
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
const DB = path.join(DIR, "ubox.sqlite");
for (const f of [DB, DB + "-wal", DB + "-shm"]) fs.rmSync(f, { force: true });
fs.writeFileSync(path.join(DIR, "config.ubox.php"), `<?php
$c = require __DIR__ . '/config.test.php';
return array_merge($c, ['db_dsn' => 'sqlite:${DB}', 'xsolla_store_url' => 'http://127.0.0.1:8096/store', 'xsolla_api_key' => 'test-key', 'xsolla_project_id' => 317991]);
`);
const SECRET = "ubox-secret";
const results = [];
const check = (n, ok, x = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x ? " — " + x : ""}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const store = { inv: {}, calls: [], invFail: 0 };
const subOf = (h) => { try { return JSON.parse(Buffer.from(h.split(".")[1], "base64url")).sub; } catch { return null; } };
const mock = http.createServer((req, res) => {
  let body = ""; req.on("data", c => body += c); req.on("end", () => {
    const send = (s, o) => { res.writeHead(s, { "Content-Type": "application/json" }); res.end(o === undefined ? "" : JSON.stringify(o)); };
    const p = req.url.replace("/store/v2/project/317991", "");
    const s = subOf((req.headers.authorization || "").slice(7));
    store.calls.push(`${req.method} ${p}`);
    if (p.startsWith("/user/inventory/items")) {
      if (store.invFail > 0) { store.invFail--; return send(500, {}); }
      const q = store.inv[s] || 0;
      return send(200, { items: [{ sku: "revive", quantity: 2, type: "virtual_good" }, ...(q ? [{ sku: "ancient_unique_box", quantity: q, type: "virtual_good" }] : [])] });
    }
    if (p === "/user/inventory/item/consume") {
      const b = JSON.parse(body);
      if (b.sku !== "ancient_unique_box" || (store.inv[s] || 0) < b.quantity) return send(422, { errorCode: 4001 });
      store.inv[s] -= b.quantity; return send(204);
    }
    if (p === "/user/virtual_currency_balance") return send(200, { items: [] });
    send(404, { errorCode: 9, errorMessage: "unmocked " + p });
  });
});
await new Promise(r => mock.listen(8096, "127.0.0.1", r));
const php = spawn("php", ["-S", "127.0.0.1:8097", "-t", path.join(REPO, "ranking-php")], { env: { ...process.env, RANKING_CONFIG: path.join(DIR, "config.ubox.php"), TEST_JWT_SECRET: SECRET }, stdio: ["ignore", "ignore", "pipe"] });
let phpErr = ""; php.stderr.on("data", d => { phpErr += d; });
await sleep(700);

const b64u = (s) => Buffer.from(s).toString("base64url");
const jwt = (sub, email) => { const h = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" })), p = b64u(JSON.stringify({ sub, email, exp: Math.floor(Date.now() / 1000) + 3600, xsolla_login_project_id: "30375188-893b-4b1a-ba1b-c8ba692fa5e3" })); return `${h}.${p}.${crypto.createHmac("sha256", SECRET).update(`${h}.${p}`).digest("base64url")}`; };
const user = (sub, email) => ({ sub, token: jwt(sub, email) });
const A = user("buyer-sub-0001", "alice.buyer@example.com"), B = user("other-sub-0002", "bob@example.com");
async function call(method, route, who, body, query = "") {
  const headers = { "Content-Type": "application/json", Origin: "https://hucksoon.github.io" };
  if (who?.token) headers.Authorization = `Bearer ${who.token}`;
  if (who?.guest) headers["X-Guest-Id"] = who.guest;
  const res = await fetch(`http://127.0.0.1:8097/api.php?r=${route}${query}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await res.text(); let j = null; try { j = JSON.parse(t); } catch {}
  return { status: res.status, body: j, text: t };
}
const db = () => new DatabaseSync(DB);
const refOf = (it) => ({ seed: it.seed, src: it.src, lvl: it.lvl, v: it.v, enh: it.enh || 0, id: it.id, r: it.r });

try {
  check("guest cannot collect", (await call("POST", "ubox_collect", { guest: "guest1234-0000" })).status === 403);
  const c0 = await call("POST", "ubox_collect", A);
  check("nothing bought → 0 added", c0.status === 200 && c0.body.added === 0 && c0.body.mail === 0, c0.text);

  // 결제 완료 → Xsolla 인벤토리에 상자 1개
  store.inv[A.sub] = 1;
  const c1 = await call("POST", "ubox_collect", A);
  check("bought box → consumed from Xsolla, 1 mail", c1.body?.added === 1 && c1.body.mail === 1 && store.inv[A.sub] === 0, c1.text);
  check("collect again → 0 (no double mail)", (await call("POST", "ubox_collect", A)).body?.added === 0);
  store.inv[A.sub] = 1; store.invFail = 1;
  check("Xsolla error → 0 now, box stays in inventory", (await call("POST", "ubox_collect", A)).body?.added === 0 && store.inv[A.sub] === 1);
  const mine = await call("GET", "market_mine", A);   // 우편함을 열 때도 꺼냄
  const boxes = mine.body.mail.filter(m => m.kind === "ubox");
  check("mailbox opens → collects the leftover box too (2 boxes)", boxes.length === 2 && store.inv[A.sub] === 0 && boxes[0].itemName === "고대 유니크 선택 상자" && !boxes[0].ref, JSON.stringify(mine.body.mail));
  const [m1, m2] = boxes;

  check("open without pick → bad_pick", (await call("POST", "mail_claim", A, { id: m1.id })).body?.error === "bad_pick");
  check("open with unknown unique → bad_pick", (await call("POST", "mail_claim", A, { id: m1.id, pick: "excalibur" })).body?.error === "bad_pick");
  check("others cannot open my box", (await call("POST", "mail_claim", B, { id: m1.id, pick: "robe" })).body?.error === "not_found");
  const o1 = await call("POST", "mail_claim", A, { id: m1.id, pick: "robe" });
  const ref1 = o1.body?.mail?.ref;
  const local = ref1 && RL.generateUnique(ref1.seed, ref1.lvl);
  check("open → ancient 염라의 관복, same item as the game makes", o1.status === 200 && ref1.seed === `buy|m${m1.id}|robe` && ref1.lvl === 175 && local.id === ref1.id && local.ancient && local.uq === "robe" && nameOf(o1.body.mail) === RL.itemName(local), o1.text);
  check("open twice → not_found", (await call("POST", "mail_claim", A, { id: m1.id, pick: "mirror" })).body?.error === "not_found");
  const o2 = await call("POST", "mail_claim", A, { id: m2.id, pick: "eopgyeong" });
  const it2 = RL.generateUnique(o2.body.mail.ref.seed, o2.body.mail.ref.lvl);
  check("second box → ancient 업경 목걸이", o2.status === 200 && it2.uq === "eopgyeong" && it2.ancient, o2.text);
  check("server keeps the chosen seeds", db().prepare("SELECT COUNT(*) n FROM bought_items").get().n === 2);

  // 랭킹: 구매 아이템은 인정하되 표시. 최고 층(5)보다 레벨이 높아도 인정
  const robe = { ...local, enh: 0 };
  const sc = await call("POST", "score", A, { stage: 5, plvl: 3, item: refOf(robe), gear: [refOf(robe)] });
  const row = db().prepare("SELECT item_score, item_name, stage_gear FROM players_v4 WHERE display = 'ali***@example.com'").get();
  check("ranking accepts the bought item (level 175 at floor 5)", sc.status === 200 && row && row.item_score >= 0 && JSON.parse(row.stage_gear).rejected === 0, sc.text + JSON.stringify(row));
  const rk = await call("GET", "ranking", null, undefined, "&type=stage");
  const ri = await call("GET", "ranking", null, undefined, "&type=item");
  const me = rk.body.rows.find(r => r.name === "ali***@example.com"), meI = ri.body.rows.find(r => r.name === "ali***@example.com");
  check("ranking rows marked: bought gear + bought best item", me?.bought === true && meI?.itemBought === true, JSON.stringify([me, meI]));
  check("player view marks the item", (await call("GET", "player", null, undefined, `&id=${me.id}`)).body?.gear?.items?.[0]?.bought === true);
  // 위조: 기록에 없는 buy 시드
  const fake = RL.generateUnique("buy|m0123456789abcdef|robe", 175);
  const sf = await call("POST", "score", B, { stage: 5, plvl: 3, item: refOf(fake), gear: [refOf(fake)] });
  const rowB = db().prepare("SELECT item_score, stage_gear FROM players_v4 WHERE display <> 'ali***@example.com'").get();
  check("forged buy seed is rejected", sf.status === 200 && rowB.item_score === -1 && JSON.parse(rowB.stage_gear).rejected === 1, JSON.stringify(rowB));
  const wrongLvl = RL.generateUnique(ref1.seed, 170);
  check("bought seed with a different level is rejected", (await call("POST", "market_list", A, { item: refOf(wrongLvl), gold: 0, cash: 5, stage: 5 })).body?.error === "bad_item");
  const ls = await call("POST", "market_list", A, { item: refOf(robe), gold: 0, cash: 50, stage: 5 });
  check("bought item can be listed on the market", ls.status === 200, ls.text);
  check("other people's normal ranking rows not marked", rk.body.rows.filter(r => r.name !== "ali***@example.com").every(r => !r.bought));
  const raw = JSON.stringify([db().prepare("SELECT * FROM mail").all(), db().prepare("SELECT * FROM bought_items").all()]);
  check("no raw Xsolla ids, emails or tokens stored", !raw.includes("buyer-sub") && !raw.includes("alice.buyer") && !raw.includes(A.token.slice(0, 20)));
  check("no PHP errors", !/Fatal|Warning|Notice/.test(phpErr), phpErr.slice(-400));
} finally {
  php.kill(); mock.close();
}
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
