// 무료 선물 (dc#105) 서버 테스트: 3시간마다 광고 → 세트·유니크 3개 → 하나 고르기, 진행에 맞춘 수준, 고른 것만 인정, 캐시 보너스
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import http from "node:http"; import crypto from "node:crypto"; import fs from "node:fs"; import path from "node:path";
const REPO = process.argv[2];
const DIR = path.dirname(new URL(import.meta.url).pathname) + "/php";
const req = createRequire(import.meta.url);
const I = req(path.join(REPO, "items.js")), M = req(path.join(REPO, "monsters.js"));
const DB = path.join(DIR, "bonus.sqlite"); for (const f of [DB, DB + "-wal", DB + "-shm"]) fs.rmSync(f, { force: true });
fs.writeFileSync(path.join(DIR, "config.bonus.php"), `<?php\n$c = require __DIR__ . '/config.test.php';\nreturn array_merge($c, ['db_dsn' => 'sqlite:${DB}', 'xsolla_store_url' => 'http://127.0.0.1:8111/store', 'xsolla_api_key' => 'k', 'ad_min_seconds' => 1]);\n`);
const SECRET = "bonus-secret";
const results = []; const check = (n, ok, x = "") => { results.push(!!ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x && !ok ? " — " + x : ""}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const mock = http.createServer((q, res) => { res.writeHead(404); res.end(); });
await new Promise(r => mock.listen(8111, "127.0.0.1", r));
const php = spawn("php", ["-S", "127.0.0.1:8110", "-t", path.join(REPO, "ranking-php")], { env: { ...process.env, RANKING_CONFIG: path.join(DIR, "config.bonus.php"), TEST_JWT_SECRET: SECRET }, stdio: ["ignore", "ignore", "pipe"] });
let phpErr = ""; php.stderr.on("data", d => phpErr += d);
await sleep(700);
const b64u = (s) => Buffer.from(s).toString("base64url");
const jwt = (sub, email) => { const h = b64u(JSON.stringify({ alg: "HS256" })), p = b64u(JSON.stringify({ sub, email, exp: Math.floor(Date.now() / 1000) + 3600, xsolla_login_project_id: "30375188-893b-4b1a-ba1b-c8ba692fa5e3" })); return `${h}.${p}.${crypto.createHmac("sha256", SECRET).update(`${h}.${p}`).digest("base64url")}`; };
async function call(route, who, body) {
  const headers = { "Content-Type": "application/json", Origin: "https://hucksoon.github.io" };
  if (who?.token) headers.Authorization = `Bearer ${who.token}`; if (who?.guest) headers["X-Guest-Id"] = who.guest;
  const r = await fetch(`http://127.0.0.1:8110/api.php?r=${route}`, { method: body === undefined ? "GET" : "POST", headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {} return { status: r.status, body: j, text: t };
}
const db = () => new DatabaseSync(DB);
// 광고 보고 선물 열기 (티켓 → 최소 시간 → 열기)
async function openGift(who) { const t = (await call("ad_start", who, { kind: "bonus" })).body?.ticket; await sleep(1100); return call("bonus_open", who, { adTicket: t }); }
const items = (refs) => refs.map(r => I.fromRef(r));
const G = { guest: "bonusguest-0001" };
try {
  // ---- 처음: 받을 수 있음, 일반 던전 수준, 게스트는 캐시 없음 ----
  const s0 = await call("bonus_status", G);
  check("guest: ready, nothing pending, normal tier, no cash for guests", s0.body?.ready === true && s0.body.pending === null && s0.body.tier === "normal" && s0.body.cash === null && s0.body.hours === 3, s0.text);
  check("open without an ad ticket → 403 bad_ticket", (await call("bonus_open", G, {})).body?.error === "bad_ticket");
  const tq = (await call("ad_start", G, { kind: "bonus" })).body?.ticket;
  check("open right away → ad_too_short", (await call("bonus_open", G, { adTicket: tq })).body?.error === "ad_too_short");
  await sleep(1100);
  const o1 = await call("bonus_open", G, { adTicket: tq });
  const p1 = o1.body?.pending, it1 = p1 ? items(p1.offers) : [];
  check("after the ad: 3 gifts, all set items", o1.status === 200 && it1.length === 3 && it1.every(it => it.rarity === "set"), o1.text.slice(0, 300));
  check("normal tier without a record: level of floor 1, no nightmare/hell seed", it1.every(it => it.lvl === M.effLevel(1) && !I.isDeepItem(it) && /^bonus\|[0-9a-f]{16}\|e1\|s[0-2]_\d+$/.test(it.seed)), JSON.stringify(it1.map(it => [it.seed, it.lvl])));
  check("3 different slots", new Set(it1.map(it => it.slot)).size === 3, it1.map(it => it.slot).join());
  check("JS rebuilds the same items (ids match the server)", p1.offers.every((r, i) => it1[i].id === r.id));
  const s1 = await call("bonus_status", G);
  check("status: pending, not ready", s1.body.pending?.id === p1.id && s1.body.ready === false);
  check("opening again returns the same pending gift (no ad needed)", (await call("bonus_open", G, {})).body?.pending?.id === p1.id);
  check("bad pick → 400", (await call("bonus_pick", G, { id: p1.id, pick: 5 })).status === 400);
  check("someone else can't pick it → 404", (await call("bonus_pick", { guest: "bonusguest-other" }, { id: p1.id, pick: 0 })).status === 404);
  const k1 = await call("bonus_pick", G, { id: p1.id, pick: 1 });
  check("pick #2 → that item, guest gets no cash", k1.status === 200 && k1.body.item?.id === p1.offers[1].id && k1.body.cash === 0, k1.text);
  check("pick again → 404", (await call("bonus_pick", G, { id: p1.id, pick: 0 })).status === 404);
  const s2 = await call("bonus_status", G);
  check("after picking: not ready, next gift 3 hours after opening", s2.body.ready === false && s2.body.pending === null && Math.abs(s2.body.nextAt - (p1.createdAt + 3 * 3600000)) < 2000, s2.text);
  const tw = (await call("ad_start", G, { kind: "bonus" })).body?.ticket; await sleep(1100);
  check("before 3 hours → 429 bonus_wait", (await call("bonus_open", G, { adTicket: tw })).body?.error === "bonus_wait");
  // 3시간이 지났다고 치면 다시
  db().prepare("UPDATE bonus_offers SET created_at = created_at - ?").run(3 * 3600000 + 1000);
  check("3 hours later → ready again", (await call("bonus_status", G)).body.ready === true);

  // ---- 고른 것만 아이템으로 인정 (랭킹 점수 제출로 확인) ----
  const picked = I.fromRef(k1.body.item), other = p1.offers[0];
  const sc = (who, item, extra = {}) => call("score", who, { stage: 1, fl: 50, plvl: 1, item, ...extra });
  await sc(G, { ...k1.body.item });
  const row = db().prepare("SELECT item_name, item_lvl FROM players_v4").get();
  check("picked gift is accepted by the server (ranking keeps it)", row?.item_lvl === picked.lvl && !!row.item_name, JSON.stringify(row));
  const G2 = { guest: "bonusguest-0002" };
  await sc(G2, { ...other });
  check("a gift that wasn't picked is rejected (forged)", (db().prepare("SELECT COUNT(*) n FROM players_v4 WHERE item_name IS NOT NULL").get().n) === 1);

  // ---- 진행에 맞춘 수준 ----
  const NMG = { guest: "bonusguest-nm01" };
  await sc(NMG, null, { stage: 51, nm: 12 });   // 일반 던전 완료, 나이트메어 12층
  const on = await openGift(NMG), itn = items(on.body.pending.offers);
  check("normal cleared → nightmare sets at Nightmare floor-12 level (악몽의)", on.body.pending.tier === "nightmare" && itn.every(it => it.rarity === "set" && it.lvl === M.NIGHTMARE.itemBase + 12 && I.isNightmareItem(it)), JSON.stringify(itn.map(it => [it.seed, it.lvl, it.rarity])));
  let uniques = [], hellSets = [];
  for (let g = 0; g < 4; g++) {
    const H = { guest: `bonusguest-hell${g}` };
    await sc(H, null, { stage: 51, nm: 51, hell: 30 });   // 나이트메어 완료, 헬 30층
    const oh = await openGift(H), ih = items(oh.body.pending.offers);
    if (oh.body.pending.tier !== "hell") { check("nightmare cleared → hell tier", false, oh.text); break; }
    uniques.push(...ih.filter(it => it.rarity === "unique")); hellSets.push(...ih.filter(it => it.rarity === "set"));
    if (g === 0) { const k = await call("bonus_pick", H, { id: oh.body.pending.id, pick: 0 }); await sc(H, k.body.item, { stage: 51, nm: 51, hell: 30 });
      check("hell gift picked → accepted by the server", !!db().prepare("SELECT item_name FROM players_hell WHERE item_name IS NOT NULL").get(), k.text); }
  }
  check("hell sets: Hell floor-30 level (지옥의)", hellSets.length > 0 && hellSets.every(it => it.lvl === M.HELL.itemBase + 30 && I.isHellItem(it)), JSON.stringify(hellSets.map(it => [it.seed, it.lvl])));
  check("hell uniques appear, only from named bosses already met (floors 10–30), at their boss level", uniques.length > 0 && uniques.every(it => I.UNIQUE.items[it.uq].boss <= 30 && it.lvl === M.HELL.itemBase + I.UNIQUE.items[it.uq].boss), JSON.stringify(uniques.map(it => [it.uq, it.lvl])));

  // ---- 로그인 사용자: 10% 확률로 캐시 1~3개가 우편함으로 ----
  let cashSeen = 0, cashOk = true, mailOk = true, tries = 0;
  for (let i = 0; i < 40 && !cashSeen; i++) {
    const U = { token: jwt(`bonus-user-${i}`, `u${i}@example.com`) };
    const st = await call("bonus_status", U);
    if (i === 0) check("signed-in user: status shows the cash chance (10%, 1~3)", st.body.cash?.chance === 0.1 && st.body.cash.min === 1 && st.body.cash.max === 3, st.text);
    const o = await openGift(U); tries++;
    const k = await call("bonus_pick", U, { id: o.body.pending.id, pick: 2 });
    if (k.body.cash) {
      cashSeen = k.body.cash;
      cashOk = k.body.cash >= 1 && k.body.cash <= 3;
      const m = db().prepare("SELECT * FROM mail WHERE kind = 'gift' AND cash > 0").all();
      mailOk = m.length === 1 && m[0].cash === k.body.cash && k.body.mail === 1;
    }
  }
  check(`cash bonus happens sometimes (got ◆${cashSeen} after ${tries} gifts), 1~3, sent to the mailbox`, cashSeen > 0 && cashOk && mailOk);
  check("no raw guest ids stored", !JSON.stringify(db().prepare("SELECT * FROM bonus_offers").all()).includes("bonusguest"));
  check("no PHP errors", !/Fatal|Warning|Parse error/.test(phpErr), phpErr.slice(0, 300));
} finally { php.kill(); mock.close(); }
const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
