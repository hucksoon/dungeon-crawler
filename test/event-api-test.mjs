// 이벤트 (dc#130) 서버 테스트: 하루 한 번 재화 받기, 기념일 보너스, 스킨 교환(10개), 캐시 1:1 교환(우편함), 기간·교환 기간, 일정이 events.js와 같은지
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
const mock = http.createServer((q, res) => { res.writeHead(404); res.end(); });
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
const G = { guest: "eventguest-0001" };
const U = { token: jwt("event-user-1", "eu1@example.com") };
const U2 = { token: jwt("event-user-2", "eu2@example.com") };
try {
  // ---- 일정: events.js와 event.php가 같음 ----
  const phpEvents = JSON.parse(execFileSync("php", ["-r", `define('RANKING_NO_ROUTE', 1); putenv('RANKING_CONFIG=${CFG}'); require '${path.join(REPO, "ranking-php/api.php")}'; echo json_encode(['events' => EVENTS, 'daily' => EVENT_DAILY, 'price' => EVENT_SKIN_PRICE, 'ex' => EVENT_EXCHANGE_DAYS, 'themes' => EVENT_THEMES]);`], { encoding: "utf8" }));
  const js = E.EVENTS.map(e => [e.id, e.theme, e.ready, e.start, e.end, Object.fromEntries(Object.entries(e.days || {}).map(([d, v]) => [d, v.bonus]))]);
  const ph = phpEvents.events.map(e => [e.id, e.theme, e.ready, e.start, e.end, Array.isArray(e.days) ? {} : e.days]);
  check("schedule in events.js and event.php is the same", JSON.stringify(js) === JSON.stringify(ph), JSON.stringify(ph));
  check("same daily amount, skin price, exchange days, theme skins and coin name", phpEvents.daily === E.DAILY && phpEvents.price === E.SKIN_PRICE && phpEvents.ex === E.EXCHANGE_DAYS
    && Object.entries(E.THEMES).every(([k, t]) => JSON.stringify(phpEvents.themes[k]?.skins) === JSON.stringify(t.skins) && JSON.stringify(phpEvents.themes[k]?.coin) === JSON.stringify(t.coin)));
  check("events are 14 days each, in order, never overlapping", E.EVENTS.every((e, i) => E.addDays(e.start, 13) === e.end && (i === 0 || E.EVENTS[i - 1].end < e.start)), E.EVENTS.map(e => `${e.start}~${e.end}`).join(" "));
  check("JS helpers: Halloween active 10/31~11/13, exchange until 11/20, 11/11 gives 2", E.active("2026-10-30") === null && E.active("2026-10-31")?.id === "halloween-2026" && E.active("2026-11-13")?.id === "halloween-2026" && E.active("2026-11-14") === null
    && E.exchange("2026-11-20")?.id === "halloween-2026" && E.exchange("2026-11-21") === null && E.dailyAmount(E.active("2026-11-11"), "2026-11-11") === 2 && E.dailyAmount(E.active("2026-11-12"), "2026-11-12") === 1);
  check("KST day: 10/30 15:00 UTC is already 10/31 in Korea", E.today(Date.parse("2026-10-30T15:00:00Z")) === "2026-10-31" && E.today(Date.parse("2026-10-30T14:59:59Z")) === "2026-10-30");

  // ---- 시작 전 ----
  const s0 = await call("event_status", U);
  check("before 10/31: no event", s0.status === 200 && s0.body.event === null && s0.body.login === true, s0.text);
  check("claim before the event → 409 event_closed", (await call("event_claim", U, {})).body?.error === "event_closed");

  // ---- 할로윈 첫날 ----
  setDay("2026-10-31");
  const g0 = await call("event_status", G);
  check("guest sees the event but can't hold coins", g0.body.event?.id === "halloween-2026" && g0.body.event.open === true && g0.body.login === false && g0.body.balance === 0 && g0.body.event.skins.join() === "pumpkin_head,reaper_scythe", g0.text);
  check("guest can't claim → 403 login_required", (await call("event_claim", G, {})).body?.error === "login_required");
  const s1 = await call("event_status", U);
  check("user: open, 1 today, nothing claimed yet", s1.body.event?.open === true && s1.body.event.today === 1 && s1.body.claimed === false && s1.body.balance === 0 && s1.body.event.exchangeUntil === "2026-11-20", s1.text);
  const c1 = await call("event_claim", U, {});
  check("claim → +1, balance 1, claimed today", c1.status === 200 && c1.body.got === 1 && c1.body.balance === 1 && c1.body.claimed === true, c1.text);
  check("claim again the same day → 429 event_claimed (balance stays 1)", (await call("event_claim", U, {})).body?.error === "event_claimed" && (await call("event_status", U)).body.balance === 1);
  const both = await Promise.all([call("event_claim", U2, {}), call("event_claim", U2, {})]);
  check("two claims at once → only one counts", both.filter(r => r.status === 200).length === 1 && (await call("event_status", U2)).body.balance === 1, both.map(r => r.text).join(" | "));

  // ---- 날마다 받기: 11/1 ~ 11/13 (11/11은 2개) ----
  let got = 1;
  for (let d = 1; d <= 13; d++) {
    setDay(`2026-11-${String(d).padStart(2, "0")}`);
    const r = await call("event_claim", U, {});
    if (r.status !== 200) { check(`claim on 11/${d}`, false, r.text); break; }
    got += r.body.got;
    if (d === 11) check("11/11 Pepero Day: 2 coins that day", r.body.got === 2 && r.body.event.today === 2, r.text);
  }
  const s2 = await call("event_status", U);
  check("every day for 14 days → 15 coins (1/day + 1 on 11/11)", got === 15 && s2.body.balance === 15 && s2.body.earned === 15, s2.text);

  // ---- 스킨 교환 ----
  check("unknown skin → 400", (await call("event_skin", U, { skin: "crown" })).body?.error === "bad_skin");
  check("not enough coins (user 2 has 1) → 402", (await call("event_skin", U2, { skin: "pumpkin_head" })).body?.error === "not_enough_coins");
  const k1 = await call("event_skin", U, { skin: "pumpkin_head" });
  check("10 coins → Pumpkin Head, 5 left", k1.status === 200 && k1.body.skins.includes("pumpkin_head") && k1.body.balance === 5, k1.text);
  check("same skin again → 409 skin_owned (coins kept)", (await call("event_skin", U, { skin: "pumpkin_head" })).body?.error === "skin_owned" && (await call("event_status", U)).body.balance === 5);
  check("second skin needs 10 more → 402", (await call("event_skin", U, { skin: "reaper_scythe" })).body?.error === "not_enough_coins");

  // ---- 캐시 교환 (1:1, 우편함으로) ----
  check("bad amount → 400", (await call("event_cash", U, { amount: 0 })).status === 400 && (await call("event_cash", U, { amount: "3" })).status === 400);
  check("more than you have → 402", (await call("event_cash", U, { amount: 6 })).body?.error === "not_enough_coins");
  const m1 = await call("event_cash", U, { amount: 3 });
  const mails = db().prepare("SELECT * FROM mail WHERE kind = 'gift'").all();
  check("3 coins → 3 Cash in the mailbox, 2 left", m1.status === 200 && m1.body.cash === 3 && m1.body.balance === 2 && mails.length === 1 && mails[0].cash === 3 && mails[0].state === "new" && /할로윈 이벤트 호박 사탕 교환/.test(mails[0].note), m1.text + JSON.stringify(mails));
  const race = await Promise.all([call("event_cash", U, { amount: 2 }), call("event_cash", U, { amount: 2 })]);
  check("two exchanges at once for the last 2 → only one goes through", race.filter(r => r.status === 200).length === 1 && db().prepare("SELECT SUM(cash) s FROM mail WHERE kind = 'gift'").get().s === 5, race.map(r => r.text).join(" | "));

  // ---- 끝난 뒤: 받기는 닫히고 교환은 7일 더 ----
  setDay("2026-11-14");
  const s3 = await call("event_status", U2);
  check("11/14: event over, claim closed, exchange still open until 11/20", s3.body.event?.open === false && s3.body.event.today === 0 && (await call("event_claim", U2, {})).body?.error === "event_closed", s3.text);
  check("11/14: leftover coins can still become Cash", (await call("event_cash", U2, { amount: 1 })).status === 200);
  setDay("2026-11-21");
  check("11/21: exchange closed → no event, 409", (await call("event_status", U)).body.event === null && (await call("event_cash", U, { amount: 1 })).body?.error === "event_closed");
  check("skins stay on the account after the event", (await call("event_status", U)).body.skins.join() === "pumpkin_head");
  setDay("2026-11-25");
  check("not-ready events (exam-2026) don't open", (await call("event_status", U)).body.event === null);

  check("no raw ids stored", !JSON.stringify(db().prepare("SELECT * FROM event_wallet").all()).includes("event-user") && !JSON.stringify(db().prepare("SELECT * FROM event_claims").all()).includes("event-user"));
  check("no PHP errors", !/Fatal|Warning|Parse error|Deprecated/.test(phpErr), phpErr.slice(0, 300));
} finally { php.kill(); mock.close(); }
const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
