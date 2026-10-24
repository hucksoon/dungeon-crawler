// 랭킹 Worker 로컬 테스트: node:sqlite로 D1 흉내, 직접 만든 RS256 키로 Xsolla 토큰 흉내
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const REPO = process.argv[2];
const { default: worker, maskEmail, maskPhone } = await import(path.join(REPO, "ranking/worker.js"));

const results = [];
const check = (n, ok, x = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x ? " — " + x : ""}`); };

// ---- D1 흉내
const sqlite = new DatabaseSync(":memory:");
sqlite.exec(fs.readFileSync(path.join(REPO, "ranking/schema.sql"), "utf8"));
const DB = {
  prepare(sql) {
    let args = [];
    const st = {
      bind(...a) { args = a; return st; },
      async run() { sqlite.prepare(sql).run(...args); return { success: true }; },
      async all() { return { results: sqlite.prepare(sql).all(...args) }; },
      async first() { return sqlite.prepare(sql).get(...args) ?? null; },
    };
    return st;
  },
};

// ---- 토큰 흉내
const PROJECT = "30375188-893b-4b1a-ba1b-c8ba692fa5e3";
const kp = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const pub = { ...(await crypto.subtle.exportKey("jwk", kp.publicKey)), kid: "test-kid", alg: "RS256", use: "sig" };
const other = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign"]);
const b64u = (buf) => Buffer.from(buf).toString("base64url");
async function rsToken(claims, { key = kp.privateKey, kid = "test-kid" } = {}) {
  const h = b64u(JSON.stringify({ alg: "RS256", typ: "JWT", kid }));
  const p = b64u(JSON.stringify(claims));
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${h}.${p}`));
  return `${h}.${p}.${b64u(sig)}`;
}
async function hsToken(claims, secret) {
  const h = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const p = b64u(JSON.stringify(claims));
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return `${h}.${p}.${b64u(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(`${h}.${p}`)))}`;
}
const exp = Math.floor(Date.now() / 1000) + 3600;
const claimsFor = (sub, email, extra = {}) => ({ sub, email, exp, iss: "https://login.xsolla.com", xsolla_login_project_id: PROJECT, ...extra });

// ---- fetch 흉내 (JWKS, Xsolla 직접 검증)
let validateCalls = 0;
const goodHsTokens = new Set();
globalThis.fetch = async (url, init) => {
  if (String(url).endsWith("/jwks.json")) return new Response(JSON.stringify({ keys: [pub] }));
  if (String(url).includes("/token/validate")) {
    validateCalls++;
    const { token } = JSON.parse(init.body);
    return new Response(null, { status: goodHsTokens.has(token) ? 204 : 422 });
  }
  throw new Error("unexpected fetch " + url);
};

const env = {
  DB, LOGIN_PROJECT_ID: PROJECT, ALLOWED_ORIGINS: "https://hucksoon.github.io",
  HASH_KEY: "test-hash-key", DEV_EMAILS: "dev1@example.com, Dev2@Example.com",
};
const BASE = "https://rank.example.workers.dev";
async function call(method, p, { token, guest, body, origin = "https://hucksoon.github.io", e = env } = {}) {
  const headers = { Origin: origin };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (guest) headers["X-Guest-Id"] = guest;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await worker.fetch(new Request(BASE + p, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), e);
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers };
}
const submit = (who, stage, item = null) => call("POST", "/api/score", { ...who, body: { stage, item } });

// ---- 가리기
check("maskEmail long", maskEmail("abcdefghi@gmail.com") === "abc***@gmail.com", maskEmail("abcdefghi@gmail.com"));
check("maskEmail short", maskEmail("ab@x.com") === "a***@x.com", maskEmail("ab@x.com"));
check("maskPhone", maskPhone("+82 10-1234-5678") === "***-5678");

// ---- CORS
{
  const r = await worker.fetch(new Request(BASE + "/api/score", { method: "OPTIONS", headers: { Origin: "https://hucksoon.github.io" } }), env);
  check("CORS preflight allows game origin", r.status === 204 && r.headers.get("Access-Control-Allow-Origin") === "https://hucksoon.github.io");
  const bad = await call("GET", "/api/ranking", { origin: "https://evil.example" });
  check("CORS: other origin gets no allow header", !bad.headers.get("Access-Control-Allow-Origin"));
}

// ---- 인증
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
  // 서명 부분만 바꿔치기한 토큰 (내용 위조)
  const [h, , s] = alice.token.split(".");
  const fake = `${h}.${b64u(JSON.stringify(claimsFor("sub-alice", "hacker@x.com")))}.${s}`;
  check("tampered payload → 401", (await submit({ token: fake }, 3)).status === 401);
}

// ---- 입력 검사
check("stage 0 rejected", (await submit(g1, 0)).body.error === "bad_stage");
check("stage float rejected", (await submit(g1, 2.5)).body.error === "bad_stage");
check("enh 11 rejected", (await submit(g1, 5, { rarity: "rare", enh: 11, lvl: 3, name: "x" })).body.error === "bad_item");
check("unknown rarity rejected", (await submit(g1, 5, { rarity: "mythic", enh: 1, lvl: 3, name: "x" })).body.error === "bad_item");
check("item level above stage rejected", (await submit(g1, 5, { rarity: "rare", enh: 1, lvl: 6, name: "x" })).body.error === "bad_item");
check("bad json rejected", (await worker.fetch(new Request(BASE + "/api/score", { method: "POST", headers: { "X-Guest-Id": g1.guest }, body: "{" }), env)).status === 400);

// ---- 기록
check("alice submits", (await submit(alice, 12, { rarity: "epic", enh: 3, lvl: 10, name: "+3 에픽 도끼" })).body.ranked === true);
check("bob submits", (await submit(bob, 15, { rarity: "rare", enh: 10, lvl: 15, name: "+10 레어 단검" })).body.ranked === true);
check("guest1 submits", (await submit(g1, 15, { rarity: "legendary", enh: 0, lvl: 2, name: "<b>전설</b>\u0007투구" })).body.ranked === true);
check("guest2 submits (no item)", (await submit(g2, 4)).body.ranked === true);
check("phone user submits", (await submit(phoneUser, 10, { rarity: "epic", enh: 3, lvl: 10, name: "같은 점수" })).body.ranked === true);
const devRes = await submit(dev, 99, { rarity: "legendary", enh: 10, lvl: 99, name: "개발자" });
check("developer submission ignored", devRes.status === 200 && devRes.body.ranked === false);

// 더 나쁜 기록은 최고 기록을 덮지 않음
await submit(alice, 5, { rarity: "common", enh: 0, lvl: 1, name: "낡은 칼" });
// 더 좋은 기록은 올라감
await submit(g2, 6, { rarity: "uncommon", enh: 2, lvl: 6, name: "+2 언커먼 바지" });

const stage = (await call("GET", "/api/ranking?type=stage")).body;
const item = (await call("GET", "/api/ranking?type=item")).body;
console.log("stage:", stage.rows.map(r => `${r.rank}.${r.name}(${r.stage})`).join(" "));
console.log("item: ", item.rows.map(r => `${r.rank}.${r.name}(${r.item.name})`).join(" "));

check("stage board: 5 players, developer absent", stage.total === 5 && !stage.rows.some(r => r.stage === 99));
check("stage tie → earlier first (bob before guest1)", stage.rows[0].name === "b***@naver.com" && stage.rows[1].name === "게스트 #a1b2c3");
check("stage order 15,15,12,10,6", stage.rows.map(r => r.stage).join(",") === "15,15,12,10,6");
check("worse submission did not lower alice", stage.rows.find(r => r.name.startsWith("ali")).stage === 12);
check("item: legendary +0 beats rare +10 (rarity first)", item.rows[0].item.rarity === "legendary" && item.rows[1].item.rarity === "epic");
check("item: same epic +3 lvl10 → earlier (alice) first", item.rows[1].name === "ali***@gmail.com" && item.rows[2].name === "***-5678");
check("item: rare +10 after epics, uncommon last", item.rows[3].item.rarity === "rare" && item.rows[4].item.rarity === "uncommon");
check("alice's best item kept (not 낡은 칼)", item.rows[1].item.name === "+3 에픽 도끼");
check("item name sanitized", item.rows[0].item.name === "b전설/b투구", item.rows[0].item.name);
check("guest flag", stage.rows[1].guest === true && stage.rows[0].guest === false);

// 응답에 원본 이메일/내부 키가 없음
const raw = JSON.stringify([stage, item]);
check("no raw email in ranking", !/alice\.wonder|bob@naver|12345678|dev/i.test(raw));
check("no keys/hmac in ranking", !raw.includes("email_hmac") && !raw.includes("key"));

// DB에도 원본 이메일 없음
const dump = JSON.stringify(sqlite.prepare("SELECT * FROM players").all());
check("DB has no raw email / phone / sub / guest id", !/alice\.wonder|bob@naver|DEV2|dev1|sub-alice|821012345678|a1b2c3d4-0000/i.test(dump));
check("DB has no developer row", !sqlite.prepare("SELECT 1 FROM players WHERE best_stage = 99").get());
check("email_hmac stored for email users only", sqlite.prepare("SELECT COUNT(*) n FROM players WHERE email_hmac IS NOT NULL").get().n === 2);

// ---- 내 순위
const me = (await call("GET", "/api/me", alice)).body;
check("me: alice stage rank 3, item rank 2", me.stageRank === 3 && me.itemRank === 2, JSON.stringify(me));
check("me: guest2 item rank 5", (await call("GET", "/api/me", g2)).body.itemRank === 5);
check("me: developer flagged", (await call("GET", "/api/me", dev)).body.developer === true);
check("me: new guest has no rank", (await call("GET", "/api/me", { guest: "99999999-aaaa" })).body.stageRank === null);

// ---- 예전에 저장된 개발자 기록은 다음 제출 때 지워짐
{
  const env2 = { ...env, DEV_EMAILS: "" };
  await call("POST", "/api/score", { ...dev, body: { stage: 50 }, e: env2 });
  const before = (await call("GET", "/api/ranking?type=stage", { e: env2 })).body.total;
  await submit(dev, 50);
  const after = (await call("GET", "/api/ranking?type=stage")).body.total;
  check("developer row removed once DEV_EMAILS set", before === 6 && after === 5);
}

// ---- HS256 + 비밀 키 / 비밀 키 없이 Xsolla 직접 검증
{
  const hs = await hsToken(claimsFor("sub-hs", "carol@daum.net"), "proj-secret");
  check("HS256 with JWT_SECRET accepted", (await call("POST", "/api/score", { token: hs, body: { stage: 2 }, e: { ...env, JWT_SECRET: "proj-secret" } })).body.ranked === true);
  check("HS256 wrong secret rejected", (await call("POST", "/api/score", { token: hs, body: { stage: 2 }, e: { ...env, JWT_SECRET: "nope" } })).status === 401);
  check("HS256 without secret, Xsolla says no → 401", (await submit({ token: hs }, 2)).status === 401 && validateCalls === 1);
  const hs2 = await hsToken(claimsFor("sub-hs2", "dave@kakao.com"), "whatever");
  goodHsTokens.add(hs2);
  check("HS256 without secret, Xsolla says ok → accepted", (await submit({ token: hs2 }, 3)).body.ranked === true && validateCalls === 2);
  await submit({ token: hs2 }, 4);
  check("Xsolla validation is cached", validateCalls === 2);
}

check("unknown route → 404", (await call("GET", "/nope")).status === 404);
check("limit respected", (await call("GET", "/api/ranking?type=stage&limit=2")).body.rows.length === 2);

const failed = results.filter(x => !x).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
