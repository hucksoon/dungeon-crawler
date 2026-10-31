// 이벤트 (dc#130·131) 서버 테스트: Xsolla 무료 아이템(event_coin)을 인벤토리에서 꺼내 재화로, 기념일 보너스, 스킨 교환(6개),
//   캐시 1:1 교환(우편함), 기간·교환 기간, 교환 기간이 끝나면 남은 재화를 자동으로 캐시 우편, 일정이 events.js와 같은지
//   가짜 Xsolla: 사용자 인벤토리(give = 무료 주문이 성공한 것처럼 1개 넣기)와 소모. 하루 1개 제한은 Xsolla가 하는 일이라 여기서는 흉내만
import { createRequire } from "node:module";
import { spawn, execFileSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import http from "node:http"; import crypto from "node:crypto"; import fs from "node:fs"; import path from "node:path";
const REPO = process.argv[2];
const DIR = path.dirname(new URL(import.meta.url).pathname) + "/php";
const req = createRequire(import.meta.url);
const E = req(path.join(REPO, "events.js"));
const DB = path.join(DIR, "event.sqlite"); for (const f of [DB, DB + "-wal", DB + "-shm"]) fs.rmSync(f, { force: true });
const CFG = path.join(DIR, "config.event.php");
// 날짜를 바꿀 때마다 설정 파일을 다시 씀 (요청마다 새로 읽음)
const setDay = (day) => fs.writeFileSync(CFG, `<?php\n$c = require __DIR__ . '/config.test.php';\nreturn array_merge($c, ['db_dsn' => 'sqlite:${DB}', 'xsolla_store_url' => 'http://127.0.0.1:8121/store', 'xsolla_api_key' => 'k', 'event_today' => '${day}']);\n`);
setDay("2026-10-30");
const SECRET = "event-secret";
const results = []; const check = (n, ok, x = "") => { results.push(!!ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x && !ok ? " — " + x : ""}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
// 가짜 Xsolla 인벤토리 (사용자 sub → event_coin 개수)
const inv = {}, give = (sub, n = 1) => { inv[sub] = (inv[sub] || 0) + n; };
const subOf = (h) => { try { return JSON.parse(Buffer.from(String(h).replace("Bearer ", "").split(".")[1], "base64url")).sub; } catch { return null; } };
const mock = http.createServer((q, res) => { let b = ""; q.on("data", c => b += c); q.on("end", () => {
  const p = q.url.replace("/store/v2/project/317991", ""), sub = subOf(q.headers.authorization);
  const send = (s, o) => { res.writeHead(s, { "Content-Type": "application/json" }); res.end(o == null ? "" : JSON.stringify(o)); };
  if (p.startsWith("/user/inventory/items")) return send(200, { items: inv[sub] ? [{ sku: "event_coin", quantity: inv[sub] }, { sku: "revive", quantity: 2 }] : [{ sku: "revive", quantity: 2 }] });
  if (p === "/user/inventory/item/consume" && JSON.parse(b).sku === "event_coin") { if (!(inv[sub] > 0)) return send(422, { errorCode: 4001 }); inv[sub]--; return send(204, null); }
  send(404, { errorCode: 9 }); }); });
await new Promise(r => mock.listen(8121, "127.0.0.1", r));
const php = spawn("php", ["-S", "127.0.0.1:8120", "-t", path.join(REPO, "ranking-php")], { env: { ...process.env, RANKING_CONFIG: CFG, TEST_JWT_SECRET: SECRET }, stdio: ["ignore", "ignore", "pipe"] });
let phpErr = ""; php.stderr.on("data", d => phpErr += d);
await sleep(700);
const b64u = (s) => Buffer.from(s).toString("base64url");
const jwt = (sub, email) => { const h = b64u(JSON.stringify({ alg: "HS256" })), p = b64u(JSON.stringify({ sub, email, exp: Math.floor(Date.now() / 1000) + 3600, xsolla_login_project_id: "30375188-893b-4b1a-ba1b-c8ba692fa5e3" })); return `${h}.${p}.${crypto.createHmac("sha256", SECRET).update(`${h}.${p}`).digest("base64url")}`; };
async function call(route, who, body) {
  const headers = { "Content-Type": "application/json", Origin: "https://hucksoon.github.io" };
  if (who?.token) headers.Authorization = `Bearer ${who.token}`; if (who?.guest) headers["X-Guest-Id"] = who.guest;
  const r = await fetch(`http://127.0.0.1:8120/api.php?r=${route}`, { method: body === undefined ? "GET" : "POST", headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {} return { status: r.status, body: j, text: t };
}
const db = () => new DatabaseSync(DB);
const hmac = (s) => crypto.createHmac("sha256", "k".repeat(40)).update(s).digest("hex");
const user = (sub) => ({ sub, token: jwt(sub, `${sub}@example.com`), key: hmac("u:" + sub) });
const G = { guest: "eventguest-0001" };
const U = user("event-user-1"), U2 = user("event-user-2"), U3 = user("event-user-3"), U4 = user("event-user-4");
const gifts = (u) => db().prepare("SELECT cash, note, state FROM mail WHERE owner_key = ? AND kind = 'gift' ORDER BY created_at").all(u.key);
try {
  // ---- 일정: events.js와 event.php가 같음 ----
  const phpEvents = JSON.parse(execFileSync("php", ["-r", `define('RANKING_NO_ROUTE', 1); putenv('RANKING_CONFIG=${CFG}'); require '${path.join(REPO, "ranking-php/api.php")}'; echo json_encode(['events' => EVENTS, 'daily' => EVENT_DAILY, 'price' => EVENT_SKIN_PRICE, 'ex' => EVENT_EXCHANGE_DAYS, 'themes' => EVENT_THEMES]);`], { encoding: "utf8" }));
  const js = E.EVENTS.map(e => [e.id, e.theme, e.ready, e.start, e.end, Object.fromEntries(Object.entries(e.days || {}).map(([d, v]) => [d, v.bonus]))]);
  const ph = phpEvents.events.map(e => [e.id, e.theme, e.ready, e.start, e.end, Array.isArray(e.days) ? {} : e.days]);
  check("schedule in events.js and event.php is the same", JSON.stringify(js) === JSON.stringify(ph), JSON.stringify(ph));
  check("same daily amount, skin price (6), exchange days, theme skins and coin name", phpEvents.daily === E.DAILY && phpEvents.price === E.SKIN_PRICE && E.SKIN_PRICE === 6 && phpEvents.ex === E.EXCHANGE_DAYS
    && Object.entries(E.THEMES).every(([k, t]) => JSON.stringify(phpEvents.themes[k]?.skins) === JSON.stringify(t.skins) && JSON.stringify(phpEvents.themes[k]?.coin) === JSON.stringify(t.coin)));
  check("events are 14 days each, in order, never overlapping", E.EVENTS.every((e, i) => E.addDays(e.start, 13) === e.end && (i === 0 || E.EVENTS[i - 1].end < e.start)), E.EVENTS.map(e => `${e.start}~${e.end}`).join(" "));
  check("JS helpers: Halloween active 10/31~11/13, exchange until 11/20, 11/11 gives 2", E.active("2026-10-30") === null && E.active("2026-10-31")?.id === "halloween-2026" && E.active("2026-11-13")?.id === "halloween-2026" && E.active("2026-11-14") === null
    && E.exchange("2026-11-20")?.id === "halloween-2026" && E.exchange("2026-11-21") === null && E.dailyAmount(E.active("2026-11-11"), "2026-11-11") === 2 && E.dailyAmount(E.active("2026-11-12"), "2026-11-12") === 1);
  check("KST day: 10/30 15:00 UTC is already 10/31 in Korea", E.today(Date.parse("2026-10-30T15:00:00Z")) === "2026-10-31" && E.today(Date.parse("2026-10-30T14:59:59Z")) === "2026-10-30");
  check("claim day changes at 10:00 KST (Xsolla limit reset): 11/1 09:59 KST is still 10/31", E.xday(Date.parse("2026-11-01T00:59:59Z")) === "2026-10-31" && E.xday(Date.parse("2026-11-01T01:00:00Z")) === "2026-11-01");

  // ---- 시작 전 ----
  const s0 = await call("event_status", U);
  check("before 10/31: no event", s0.status === 200 && s0.body.event === null && s0.body.login === true && s0.body.sku === "event_coin", s0.text);
  give(U.sub);
  check("claim before the event → 409 event_closed, the Xsolla item is left in the inventory", (await call("event_claim", U, {})).body?.error === "event_closed" && inv[U.sub] === 1);

  // ---- 할로윈 첫날 ----
  setDay("2026-10-31");
  const g0 = await call("event_status", G);
  check("guest sees the event but can't hold coins", g0.body.event?.id === "halloween-2026" && g0.body.event.open === true && g0.body.login === false && g0.body.balance === 0 && g0.body.event.skins.join() === "pumpkin_head,reaper_scythe", g0.text);
  check("guest can't claim → 403 login_required", (await call("event_claim", G, {})).body?.error === "login_required");
  const c1 = await call("event_claim", U, {});
  check("claim → takes the Xsolla item out of the inventory, +1 candy, claimed today", c1.status === 200 && c1.body.got === 1 && c1.body.balance === 1 && c1.body.claimed === true && inv[U.sub] === 0, c1.text);
  const c2 = await call("event_claim", U, {});
  check("claim again with nothing in the inventory → got 0, balance stays 1", c2.status === 200 && c2.body.got === 0 && c2.body.balance === 1, c2.text);
  give(U2.sub);
  const both = await Promise.all([call("event_claim", U2, {}), call("event_claim", U2, {})]);
  check("two claims at once for one item → only one candy", both.reduce((s, r) => s + (r.body?.got || 0), 0) === 1 && (await call("event_status", U2)).body.balance === 1, both.map(r => r.text).join(" | "));
  check("other inventory items are left alone (only event_coin is consumed)", !phpErr.includes("revive"));

  // ---- 날마다 받기: 11/1 ~ 11/13 (11/11은 2개) ----
  let got = 1;
  for (let d = 1; d <= 13; d++) {
    setDay(`2026-11-${String(d).padStart(2, "0")}`);
    give(U.sub);
    const r = await call("event_claim", U, {});
    if (r.status !== 200 || !r.body.got) { check(`claim on 11/${d}`, false, r.text); break; }
    got += r.body.got;
    if (d === 11) check("11/11 Pepero Day: 2 candies for that day's item", r.body.got === 2 && r.body.event.today === 2, r.text);
  }
  const s2 = await call("event_status", U);
  check("every day for 14 days → 15 candies (1/day + 1 on 11/11)", got === 15 && s2.body.balance === 15 && s2.body.earned === 15, s2.text);

  // ---- 스킨 교환 (6개) ----
  check("unknown skin → 400", (await call("event_skin", U, { skin: "crown" })).body?.error === "bad_skin");
  check("not enough candies (user 2 has 1) → 402", (await call("event_skin", U2, { skin: "pumpkin_head" })).body?.error === "not_enough_coins");
  const k1 = await call("event_skin", U, { skin: "pumpkin_head" });
  check("6 candies → Pumpkin Head, 9 left", k1.status === 200 && k1.body.skins.includes("pumpkin_head") && k1.body.balance === 9 && k1.body.price === 6, k1.text);
  check("same skin again → 409 skin_owned (candies kept)", (await call("event_skin", U, { skin: "pumpkin_head" })).body?.error === "skin_owned" && (await call("event_status", U)).body.balance === 9);
  const k2 = await call("event_skin", U, { skin: "reaper_scythe" });
  check("6 more → Reaper's Scythe too (both skins in 14 days), 3 left", k2.status === 200 && k2.body.skins.join() === "pumpkin_head,reaper_scythe" && k2.body.balance === 3, k2.text);

  // ---- 캐시 교환 (1:1, 우편함으로) ----
  check("bad amount → 400", (await call("event_cash", U, { amount: 0 })).status === 400 && (await call("event_cash", U, { amount: "3" })).status === 400);
  check("more than you have → 402", (await call("event_cash", U, { amount: 4 })).body?.error === "not_enough_coins");
  const m1 = await call("event_cash", U, { amount: 1 });
  check("1 candy → 1 Cash in the mailbox, 2 left", m1.status === 200 && m1.body.cash === 1 && m1.body.balance === 2 && gifts(U).length === 1 && gifts(U)[0].cash === 1 && /할로윈 이벤트 호박 사탕 교환/.test(gifts(U)[0].note), m1.text + JSON.stringify(gifts(U)));
  const race = await Promise.all([call("event_cash", U, { amount: 2 }), call("event_cash", U, { amount: 2 })]);
  check("two exchanges at once for the last 2 → only one goes through", race.filter(r => r.status === 200).length === 1 && gifts(U).reduce((s, m) => s + m.cash, 0) === 3, race.map(r => r.text).join(" | "));

  // ---- 끝난 뒤: 받기는 닫히고 교환은 7일 더 ----
  setDay("2026-11-14");
  give(U2.sub);
  const s3 = await call("event_status", U2);
  check("11/14: event over, claim closed (item left in the inventory), exchange still open until 11/20", s3.body.event?.open === false && s3.body.event.today === 0 && (await call("event_claim", U2, {})).body?.error === "event_closed" && inv[U2.sub] === 1, s3.text);
  // 사용자 3·4: 남은 재화 4개·2개 (자동 정산 시험용)
  for (const u of [U3, U4]) db().prepare("INSERT INTO event_wallet (pkey, event_id, balance, earned) VALUES (?, 'halloween-2026', ?, ?)").run(u.key, u === U3 ? 4 : 2, 10);
  setDay("2026-11-20");
  check("11/20 (last exchange day): leftovers are not auto-exchanged yet", (await call("event_status", U2)).body.balance === 1 && gifts(U2).length === 0);

  // ---- 교환 기간이 끝나면 남은 재화 → 자동으로 캐시 우편 ----
  setDay("2026-11-21");
  const s4 = await call("event_status", U2);
  check("11/21: exchange closed → no event, 409", s4.body.event === null && (await call("event_cash", U2, { amount: 1 })).body?.error === "event_closed");
  check("auto exchange on the next visit (event status): 1 leftover candy → 1 Cash mail, wallet 0", gifts(U2).length === 1 && gifts(U2)[0].cash === 1 && /남은 호박 사탕 1개를 캐시로 바꿨어요/.test(gifts(U2)[0].note)
    && db().prepare("SELECT balance FROM event_wallet WHERE pkey = ?").get(U2.key).balance === 0, JSON.stringify(gifts(U2)));
  await call("event_status", U2); await call("lobby", U2, { scene: "lobby", x: 3, y: 10 });
  check("only once (visiting again doesn't add another mail)", gifts(U2).length === 1);
  const lp = await call("lobby", U3, { scene: "lobby", x: 3, y: 10 });
  check("auto exchange also when entering the lobby (mailbox count includes it)", gifts(U3).length === 1 && gifts(U3)[0].cash === 4 && lp.body?.mail === 1, lp.text);
  const out = execFileSync("php", [path.join(REPO, "ranking-php/admin.php"), "event-settle"], { env: { ...process.env, RANKING_CONFIG: CFG }, encoding: "utf8" });
  check("admin.php event-settle: everyone left at once (user 4: 2 Cash), running it again does nothing", gifts(U4).length === 1 && gifts(U4)[0].cash === 2
    && /1건/.test(out) && /0건/.test(execFileSync("php", [path.join(REPO, "ranking-php/admin.php"), "event-settle"], { env: { ...process.env, RANKING_CONFIG: CFG }, encoding: "utf8" })), out);
  check("auto-exchanged Cash is recorded (event_spends kind auto)", db().prepare("SELECT COUNT(*) n FROM event_spends WHERE kind = 'auto'").get().n === 3);
  check("skins stay on the account after the event", (await call("event_status", U)).body.skins.join() === "pumpkin_head,reaper_scythe");
  // 쓰고 있는 스킨이 다른 사람 마을 화면에도 (dc#137): 가진 스킨만, 로그인 계정만, 로비에서만
  await call("lobby", U, { scene: "lobby", x: 5, y: 10, skins: ["pumpkin_head", "reaper_scythe", "crown", 7] });
  await call("lobby", U2, { scene: "lobby", x: 6, y: 10, skins: ["pumpkin_head"] });   // 유저 2는 스킨이 없음
  await call("lobby", G, { scene: "lobby", x: 7, y: 10, skins: ["pumpkin_head"] });
  const seen = (await call("lobby", U3, { scene: "lobby", x: 8, y: 10 })).body.players || [];
  const pid = async (who) => (await call("lobby", who, { scene: "lobby", x: 5, y: 10, skins: who === U ? ["pumpkin_head", "reaper_scythe"] : ["pumpkin_head"] })).body.me.id;
  const [idU, idU2, idG] = [await pid(U), await pid(U2), await pid(G)];
  const by = (id) => seen.find(p => p.id === id);
  check("others see the skins a player wears (owned only, unknown ones dropped)", JSON.stringify(by(idU)?.skins) === '["pumpkin_head","reaper_scythe"]', JSON.stringify(seen));
  check("a player who doesn't own the skin, or a guest, shows no skin", by(idU2) && !by(idU2).skins && by(idG) && !by(idG).skins, JSON.stringify([by(idU2), by(idG)]));
  await call("lobby", U, { scene: "lobby", x: 5, y: 10 });
  check("taking the skins off (sending none) → others see the plain look", !((await call("lobby", U3, { scene: "lobby", x: 8, y: 10 })).body.players.find(p => p.id === idU)?.skins));
  setDay("2026-11-25");
  check("not-ready events (exam-2026) don't open", (await call("event_status", U)).body.event === null);

  check("no raw ids stored", !JSON.stringify(db().prepare("SELECT * FROM event_wallet").all()).includes("event-user") && !JSON.stringify(db().prepare("SELECT * FROM event_claims").all()).includes("event-user"));
  check("no PHP errors", !/Fatal|Warning|Parse error|Deprecated/.test(phpErr), phpErr.slice(0, 300));
} finally { php.kill(); mock.close(); }
const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
