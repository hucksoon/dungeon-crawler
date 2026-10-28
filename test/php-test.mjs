// PHP 랭킹 서버 테스트: php -S 로 실제 띄우고 HTTP로 검사 (worker-test.mjs와 같은 항목)
import { spawn } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const REPO = process.argv[2];
import { createRequire } from "node:module";
const RL = createRequire(import.meta.url)(REPO + "/items.js");

// 서버는 아이템 값만 보냄 (dc#97): 참조로 다시 만든 이름 (서버가 이름 글자를 보내면 실패)
const nameOf = (v) => (v?.ref && !("name" in v) && !("itemName" in v) ? RL.itemName(RL.fromRef(v.ref, { gems: true })) : null);
// 게임 형식의 시드 중에서 조건에 맞는 아이템 찾기 (gateMax: 몬스터·포션 드롭 확률 안에 드는 시드만)
function find(make, src, lvl, pred, gateMax = 1) {
  for (let n = 0; n < 200000; n++) {
    const seed = make(n);
    if (RL.rngFrom(`v${RL.RULES_VERSION}|drop?|${seed}`)() >= gateMax) continue;
    const it = RL.generate(seed, src, lvl);
    if (pred(it)) return it;
  }
  throw new Error("seed not found");
}
const ref = (it, enh = 0) => ({ seed: it.seed, src: it.src, lvl: it.lvl, v: it.v, enh, id: it.id, ...(it.r ? { r: it.r } : {}) });
const L2 = find(n => `runG1|d2|k${n}`, "golden", 2, it => it.rarity === "legendary");
const E10a = find(n => `runA|d10|k${n}`, "drop", 10, it => it.rarity === "epic", 0.4);
const E10b = find(n => `runP|d10|k${n}`, "drop", 10, it => it.rarity === "epic", 0.4);
const R15 = find(n => `runB${n}|shop|d15|s${n % 6}`, "golden", 15, it => it.rarity === "rare");
// r9 전에 연 상자 (r9 상자는 레전더리부터, 서버 기록이 없는 예전 상자 시드는 r8까지만 인정)
const U6 = (() => { for (let n = 0; n < 1000; n++) { const it = RL.generate(`box|o9${n}|${n % 10}`, "box", 6, 4, 8); if (it.rarity === "uncommon") return it; } throw new Error("seed not found"); })();
const C1 = find(n => `runA|d1|p${n}`, "drop", 1, it => it.rarity === "common", 0.08);
const DIR = path.dirname(new URL(import.meta.url).pathname) + "/php";
const PROJECT = "30375188-893b-4b1a-ba1b-c8ba692fa5e3";
for (const f of ["test.sqlite", "validate-calls.txt", "good-tokens.txt"]) fs.rmSync(path.join(DIR, f), { force: true });
for (const f of fs.readdirSync(DIR)) if (f.startsWith("jwks-")) fs.rmSync(path.join(DIR, f));

const results = [];
const check = (n, ok, x = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x ? " — " + x : ""}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ---- 키
const kp = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const other = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign"]);
fs.writeFileSync(path.join(DIR, "jwks.json"), JSON.stringify({ keys: [{ ...(await crypto.subtle.exportKey("jwk", kp.publicKey)), kid: "test-kid", alg: "RS256", use: "sig" }] }));
const b64u = (buf) => Buffer.from(buf).toString("base64url");
async function rsToken(claims, { key = kp.privateKey, kid = "test-kid" } = {}) {
  const h = b64u(JSON.stringify({ alg: "RS256", typ: "JWT", kid })), p = b64u(JSON.stringify(claims));
  return `${h}.${p}.${b64u(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${h}.${p}`)))}`;
}
async function hsToken(claims, secret) {
  const h = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" })), p = b64u(JSON.stringify(claims));
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return `${h}.${p}.${b64u(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(`${h}.${p}`)))}`;
}
const exp = Math.floor(Date.now() / 1000) + 3600;
const claimsFor = (sub, email, extra = {}) => ({ sub, email, exp, iss: "https://login.xsolla.com", xsolla_login_project_id: PROJECT, ...extra });

// ---- 서버
const procs = [];
function serve(port, docroot, env = {}, router) {
  const p = spawn("php", ["-S", `127.0.0.1:${port}`, "-t", docroot, ...(router ? [router] : [])], { env: { ...process.env, ...env }, stdio: ["ignore", "ignore", "pipe"] });
  p.stderr.on("data", d => { const s = String(d); if (/Fatal|Warning|Notice|Deprecated/.test(s)) console.log("  [php]", s.trim().slice(0, 300)); });
  procs.push(p);
}
const cfg = path.join(DIR, "config.test.php");
serve(8091, DIR, {}, path.join(DIR, "mock.php"));
serve(8090, path.join(REPO, "ranking-php"), { RANKING_CONFIG: cfg });
serve(8092, path.join(REPO, "ranking-php"), { RANKING_CONFIG: cfg, TEST_JWT_SECRET: "proj-secret" });
await sleep(800);

const API = "http://127.0.0.1:8090/api.php";
async function call(method, route, { token, guest, body, raw, origin = "https://hucksoon.github.io", base = API, query = "" } = {}) {
  const headers = { Origin: origin };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (guest) headers["X-Guest-Id"] = guest;
  if (body !== undefined || raw !== undefined) headers["Content-Type"] = "application/json";
  // 점수는 지금 게임처럼 50층 기준(fl: 50)으로 보냄 (예전 75층 기준 바꾸기는 drops-e2e·maxfloor-e2e)
  if (route === "score" && body && typeof body === "object" && !("fl" in body)) body = { fl: 50, ...body };
  const res = await fetch(`${base}?r=${route}${query}`, { method, headers, body: raw !== undefined ? raw : body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json = null; try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  return { status: res.status, body: json, headers: res.headers };
}
const submit = (who, stage, item = null, opts = {}) => call("POST", "score", { ...who, body: { stage, item }, ...opts });

try {
  // CORS
  {
    const r = await fetch(`${API}?r=score`, { method: "OPTIONS", headers: { Origin: "https://hucksoon.github.io" } });
    check("CORS preflight allows game origin", r.status === 204 && r.headers.get("access-control-allow-origin") === "https://hucksoon.github.io");
    const bad = await call("GET", "ranking", { origin: "https://evil.example" });
    check("CORS: other origin gets no allow header", !bad.headers.get("access-control-allow-origin"));
  }
  const alice = { token: await rsToken(claimsFor("sub-alice", "alice.wonder@gmail.com")) };
  const bob = { token: await rsToken(claimsFor("sub-bob", "bob@naver.com")) };
  const phoneUser = { token: await rsToken(claimsFor("sub-phone", undefined, { phone_number: "+821012345678" })) };
  const dev = { token: await rsToken(claimsFor("sub-dev", "DEV2@example.com")) };
  const g1 = { guest: "a1b2c3d4-0000-4000-8000-000000000001" };
  const g2 = { guest: "ffeedd00-0000-4000-8000-000000000002" };

  check("no identity → 401", (await submit({}, 3)).status === 401);
  check("bad guest id → 401", (await submit({ guest: "<script>" }, 3)).status === 401);
  check("expired token → 401", (await submit({ token: await rsToken({ ...claimsFor("x", "x@x.com"), exp: 10 }) }, 3)).body.error === "token_expired");
  check("other project token → 401", (await submit({ token: await rsToken(claimsFor("x", "x@x.com", { xsolla_login_project_id: "other" })) }, 3)).body.error === "wrong_project");
  check("forged signature → 401", (await submit({ token: await rsToken(claimsFor("x", "x@x.com"), { key: other.privateKey }) }, 3)).body.error === "bad_signature");
  check("unknown kid → 401", (await submit({ token: await rsToken(claimsFor("x", "x@x.com"), { kid: "nope" }) }, 3)).body.error === "unknown_key");
  {
    const [h, , s] = alice.token.split(".");
    check("tampered payload → 401", (await submit({ token: `${h}.${b64u(JSON.stringify(claimsFor("sub-alice", "hacker@x.com")))}.${s}` }, 3)).status === 401);
  }
  check("stage 0 rejected", (await submit(g1, 0)).body.error === "bad_stage");
  check("stage float rejected", (await submit(g1, 2.5)).body.error === "bad_stage");
  check("stage string rejected", (await submit(g1, "5")).body.error === "bad_stage");
  // 아이템 위조: 기록(층)은 받되 아이템은 인정하지 않음
  const tmp = { guest: "tmp00000-1111" };
  const itemOf = async (who) => (await call("GET", "me", who)).body.itemRank;
  check("forged: no seed (old format) → item ignored", (await submit(tmp, 5, { rarity: "legendary", enh: 10, lvl: 5, name: "가짜" })).body.ranked === true && (await itemOf(tmp)) === null);
  check("forged: made-up seed format → ignored", (await submit(tmp, 5, { seed: "my-legend", src: "golden", lvl: 5, v: 2, enh: 0 })).status === 200 && (await itemOf(tmp)) === null);
  { let gateFail = null; for (let n = 0; !gateFail; n++) { const sd = `runX|d5|k${n}`; if (RL.rngFrom(`v2|drop?|${sd}`)() >= 0.4) gateFail = sd; }
    check("forged: drop seed that never drops (gate ≥ 40%) → ignored", (await submit(tmp, 5, { seed: gateFail, src: "drop", lvl: 5, v: 2, enh: 0 })).status === 200 && (await itemOf(tmp)) === null); }
  check("forged: floor in seed ≠ item level → ignored", (await submit(tmp, 9, { ...ref(E10a), lvl: 9 })).status === 200 && (await itemOf(tmp)) === null);
  check("forged: source swapped to a richer table → ignored", (await submit(tmp, 10, { ...ref(E10a), src: "golden" })).status === 200 && (await itemOf(tmp)) === null);
  check("forged: enhancement 13 → ignored", (await submit(tmp, 10, ref(E10a, 13))).status === 200 && (await itemOf(tmp)) === null);
  check("forged: wrong id → ignored", (await submit(tmp, 10, { ...ref(E10a), id: "0000000000000000" })).status === 200 && (await itemOf(tmp)) === null);
  check("forged: item level above best stage → ignored", (await submit({ guest: "tmp00000-2222" }, 5, ref(E10a))).status === 200 && (await itemOf({ guest: "tmp00000-2222" })) === null);
  // 테스트용 기록은 지움 (아래 순위 검사에 섞이지 않게)
  new DatabaseSync(path.join(DIR, "test.sqlite")).exec("DELETE FROM players_v4");
  check("bad json rejected", (await call("POST", "score", { ...g1, raw: "{" })).status === 400);
  check("oversized body rejected", (await call("POST", "score", { ...g1, raw: JSON.stringify({ stage: 1, pad: "x".repeat(9000) }) })).status === 413);

  check("alice submits", (await submit(alice, 12, ref(E10a, 3))).body.ranked === true);
  check("bob submits", (await submit(bob, 15, ref(R15, 10))).body.ranked === true);
  await sleep(5);
  check("guest1 submits (claims rarity 'common' — server recomputes)", (await submit(g1, 15, { ...ref(L2), rarity: "common", name: "<b>가짜 이름</b>" })).body.ranked === true);
  check("guest2 submits (no item)", (await submit(g2, 4)).body.ranked === true);
  await sleep(5);
  check("phone user submits", (await submit(phoneUser, 10, ref(E10b, 3))).body.ranked === true);
  const devRes = await submit(dev, 99, ref(L2, 10));
  check("developer submission ignored", devRes.status === 200 && devRes.body.ranked === false);
  await submit(alice, 5, ref(C1));
  await submit(g2, 6, ref(U6, 2));

  const stage = (await call("GET", "ranking", { query: "&type=stage" })).body;
  const item = (await call("GET", "ranking", { query: "&type=item" })).body;
  console.log("  stage:", stage.rows.map(r => `${r.rank}.${r.name}(${r.stage})`).join(" "));
  console.log("  item: ", item.rows.map(r => `${r.rank}.${r.name}(${r.item.name})`).join(" "));
  check("stage board: 5 players, developer absent", stage.total === 5 && !stage.rows.some(r => r.stage === 99));
  check("stage tie → earlier first (bob before guest1)", stage.rows[0].name === "b***@naver.com" && stage.rows[1].name === "게스트 #a1b2c3");
  check("stage order 15,15,12,10,6", stage.rows.map(r => r.stage).join(",") === "15,15,12,10,6");
  check("item: legendary +0 beats rare +10 (rarity first)", item.rows[0].item.rarity === "legendary" && item.rows[1].item.rarity === "epic");
  check("item: same epic +3 lvl10 → earlier (alice) first", item.rows[1].name === "ali***@gmail.com" && item.rows[2].name === "***-5678");
  check("alice's best item kept (not the common one)", nameOf(item.rows[1].item) === RL.itemName({ ...E10a, enh: 3 }), JSON.stringify(item.rows[1].item));
  check("item name made by the server (client name ignored)", nameOf(item.rows[0].item) === RL.itemName(L2), JSON.stringify(item.rows[0].item));
  check("rows carry a public id (16 hex)", stage.rows.every(r => /^[0-9a-f]{16}$/.test(r.id)));
  check("masks match the Worker version", stage.rows.some(r => r.name === "ali***@gmail.com"));
  const raw = JSON.stringify([stage, item]);
  check("no raw email / keys in ranking", !/alice\.wonder|bob@naver|12345678|dev|pkey|email_hmac/i.test(raw));
  check("limit respected", (await call("GET", "ranking", { query: "&type=stage&limit=2" })).body.rows.length === 2);

  const db = new DatabaseSync(path.join(DIR, "test.sqlite"));
  const dump = JSON.stringify(db.prepare("SELECT * FROM players_v4").all());
  check("DB has no raw email / phone / sub / guest id", !/alice\.wonder|bob@naver|DEV2|dev1|sub-alice|821012345678|a1b2c3d4-0000/i.test(dump));
  check("email_hmac matches lookup tool format", db.prepare("SELECT email_hmac FROM players_v4 WHERE display = 'ali***@gmail.com'").get().email_hmac ===
    (await import("node:crypto")).createHmac("sha256", "k".repeat(40)).update("e:alice.wonder@gmail.com").digest("hex"));

  const me = (await call("GET", "me", alice)).body;
  check("me: alice stage rank 3, item rank 2", me.stageRank === 3 && me.itemRank === 2, JSON.stringify(me));
  check("me: guest2 item rank 5", (await call("GET", "me", g2)).body.itemRank === 5);
  check("me: developer flagged", (await call("GET", "me", dev)).body.developer === true);
  check("me: new guest has no rank", (await call("GET", "me", { guest: "99999999-aaaa" })).body.stageRank === null);

  // HS256: 비밀 키로 / 비밀 키 없이 Xsolla 확인 (캐시)
  const hs = await hsToken(claimsFor("sub-hs", "carol@daum.net"), "proj-secret");
  check("HS256 with jwt_secret accepted", (await submit({ token: hs }, 2, null, { base: "http://127.0.0.1:8092/api.php" })).body.ranked === true);
  const hsBad = await hsToken(claimsFor("sub-hs", "carol@daum.net"), "nope");
  check("HS256 wrong secret rejected", (await submit({ token: hsBad }, 2, null, { base: "http://127.0.0.1:8092/api.php" })).status === 401);
  const calls = () => (fs.existsSync(path.join(DIR, "validate-calls.txt")) ? fs.readFileSync(path.join(DIR, "validate-calls.txt"), "utf8").length : 0);
  check("HS256 without secret, Xsolla says no → 401", (await submit({ token: hs }, 2)).status === 401 && calls() === 1);
  const hs2 = await hsToken(claimsFor("sub-hs2", "dave@kakao.com"), "whatever");
  fs.writeFileSync(path.join(DIR, "good-tokens.txt"), hs2 + "\n");
  check("HS256 without secret, Xsolla says ok → accepted", (await submit({ token: hs2 }, 3)).body.ranked === true && calls() === 2);
  await submit({ token: hs2 }, 4);
  check("Xsolla validation is cached", calls() === 2);

  // ---- 장비 스냅숏 (최고 층을 세운 순간)
  const carol = { token: await rsToken(claimsFor("sub-carol", "carol.gear@gmail.com")) };
  const W5 = find(n => `runC|d5|k${n}`, "boss", 5, it => it.slot === "weapon");
  const H5 = find(n => `runC|d5|k${n}`, "boss", 5, it => it.slot === "head");
  const H5b = find(n => `runC|d5|p${n}`, "drop", 5, it => it.slot === "head" && it.id !== H5.id, 0.08);
  const gear1 = [ref(W5, 4), ref(H5, 2), ref(H5b), { seed: "fake", src: "box", lvl: 1, v: 2, enh: 0 }];
  check("gear: submit with 2 valid + duplicate slot + fake", (await call("POST", "score", { ...carol, body: { stage: 5, plvl: 7, item: ref(W5, 4), gear: gear1 } })).body.ranked === true);
  const st2 = (await call("GET", "ranking", { query: "&type=stage&limit=100" })).body;
  const carolRow = st2.rows.find(r => r.name === "car***@gmail.com");
  const p1 = (await call("GET", "player", { query: `&id=${carolRow.id}` })).body;
  const t = RL.totals([{ ...H5, enh: 2 }, { ...W5, enh: 4 }]).stats;
  const lv = 6 * 2;   // Lv 7 레벨 보너스 +12% (dc#95)
  const expAtk = Math.round((3 + 6 + t.atk) * (1 + (t.atkPct + lv) / 100)), expHp = Math.round((20 + 24 + t.hp) * (1 + (t.hpPct + lv) / 100));
  check("gear: stats computed by server match the game formula", p1.gear?.stats.atk === expAtk && p1.gear.stats.maxHp === expHp && p1.gear.stats.level === 7, JSON.stringify(p1.gear?.stats));
  check("gear: 2 items in slot order, item values only (name rebuilt from ref)", p1.gear.items.map(i => i.slot).join(",") === "head,weapon" && nameOf(p1.gear.items[1]) === RL.itemName({ ...W5, enh: 4 }) && p1.gear.items[1].main.every(l => l.k && !("text" in l)));
  check("gear: rejected count = 2 (duplicate slot + fake)", p1.gear.rejected === 2);
  check("gear: lines show ranges and enhancement", p1.gear.items[1].main.every(l => /^\d+(~\d+)?%?$/.test(l.range)) && p1.gear.items[1].main.some(l => l.plus > 0));
  check("gear: best item detail present", nameOf(p1.bestItem) === RL.itemName({ ...W5, enh: 4 }));
  check("gear: no private data in player response", !/carol\.gear|sub-carol|pkey|email_hmac/.test(JSON.stringify(p1)));
  await call("POST", "score", { ...carol, body: { stage: 3, plvl: 9, gear: [ref(H5b)] } });
  check("gear: lower stage keeps the record-time snapshot", (await call("GET", "player", { query: `&id=${carolRow.id}` })).body.gear.stats.level === 7);
  await call("POST", "score", { ...carol, body: { stage: 6, plvl: 9, gear: [ref(H5b)] } });
  const p3 = (await call("GET", "player", { query: `&id=${carolRow.id}` })).body;
  check("gear: new best stage replaces snapshot", p3.stage === 6 && p3.gear.stats.level === 9 && p3.gear.items.length === 1 && p3.gear.stage === 6);
  const db2 = new DatabaseSync(path.join(DIR, "test.sqlite"));
  db2.prepare("UPDATE players_v4 SET stage_gear = NULL, pub_id = NULL WHERE display = 'b***@naver.com'").run();
  await call("POST", "score", { ...bob, body: { stage: 15, plvl: 12, gear: [ref(R15, 1)] } });
  const bobRow = (await call("GET", "ranking", { query: "&type=stage&limit=100" })).body.rows.find(r => r.name === "b***@naver.com");
  check("gear: old row gets public id back and snapshot at same stage", /^[0-9a-f]{16}$/.test(bobRow.id) && (await call("GET", "player", { query: `&id=${bobRow.id}` })).body.gear?.stats.level === 12);
  check("player: unknown id → 404, bad id → 400", (await call("GET", "player", { query: "&id=0123456789abcdef" })).status === 404 && (await call("GET", "player", { query: "&id=x" })).status === 400);
  { const v1 = createRequire(import.meta.url)(process.argv[3] + "/items-v1.js"); let it = null;
    for (let n = 0; !it; n++) { const sd = `oldrun|d4|k${n}`; if (v1.rngFrom(`v1|drop?|${sd}`)() < 0.4) it = v1.generate(sd, "drop", 4); }
    const dave = { guest: "v1guest-0000" };
    const r1 = { seed: it.seed, src: "drop", lvl: 4, v: 1, enh: 2, id: it.id };
    await call("POST", "score", { ...dave, body: { stage: 4, plvl: 3, item: r1, gear: [r1] } });
    const daveRow = (await call("GET", "me", dave)).body;  // 예전 장비를 낀 기록은 층 랭킹에 안 올라가서 me로 찾음
    const daveP = daveRow && (await call("GET", "player", { query: `&id=${daveRow.id}` })).body;
    // v4 베타 아이템 랭킹은 v4 아이템만 세지만, 예전 아이템도 장비로는 검증돼서 보임
    // v1 아이템은 게임이 참조로 다시 만들 수 없어서 서버가 이름 글자를 그대로 보냄 (dc#97)
    check("v1 (old rules) item verifies as gear (not counted on the v4 item board)", daveP?.gear?.items?.[0]?.name === RL.itemName({ ...it, enh: 2 }) && !daveP.gear.rejected && (await call("GET", "me", dave)).body.item === null, JSON.stringify(daveP?.gear)); }

  check("PATH_INFO style also works", (await (await fetch("http://127.0.0.1:8090/api.php/api/ranking?type=stage", { headers: { Origin: "https://hucksoon.github.io" } })).json()).type === "stage");
  check("unknown route → 404", (await call("GET", "nope")).status === 404);
} finally {
  for (const p of procs) p.kill();
}
const failed = results.filter(x => !x).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
