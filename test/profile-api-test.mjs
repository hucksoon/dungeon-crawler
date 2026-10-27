// 계정 저장(profile) 서버 테스트
import { spawn } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import crypto from "node:crypto"; import fs from "node:fs"; import path from "node:path";
const REPO = process.argv[2];
const DIR = path.dirname(new URL(import.meta.url).pathname) + "/php";
const DB = path.join(DIR, "profile.sqlite"); for (const f of [DB, DB + "-wal", DB + "-shm"]) fs.rmSync(f, { force: true });
fs.writeFileSync(path.join(DIR, "config.profile.php"), `<?php\n$c = require __DIR__ . '/config.test.php';\nreturn array_merge($c, ['db_dsn' => 'sqlite:${DB}']);\n`);
const SECRET = "profile-secret";
const results = []; const check = (n, ok, x = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x && !ok ? " — " + x : ""}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const php = spawn("php", ["-S", "127.0.0.1:8100", "-t", path.join(REPO, "ranking-php")], { env: { ...process.env, PHP_CLI_SERVER_WORKERS: "4", RANKING_CONFIG: path.join(DIR, "config.profile.php"), TEST_JWT_SECRET: SECRET }, stdio: ["ignore", "ignore", "pipe"] });
let phpErr = ""; php.stderr.on("data", d => phpErr += d);
await sleep(700);
const b64u = (s) => Buffer.from(s).toString("base64url");
const jwt = (sub, email) => { const h = b64u(JSON.stringify({ alg: "HS256" })), p = b64u(JSON.stringify({ sub, email, exp: Math.floor(Date.now() / 1000) + 3600, xsolla_login_project_id: "30375188-893b-4b1a-ba1b-c8ba692fa5e3" })); return `${h}.${p}.${crypto.createHmac("sha256", SECRET).update(`${h}.${p}`).digest("base64url")}`; };
const A = { token: jwt("prof-a", "ann@example.com") }, B = { token: jwt("prof-b", "ben@example.com") }, G = { guest: "profguest-0000" };
async function call(who, body, raw) {
  const headers = { "Content-Type": "application/json", Origin: "https://hucksoon.github.io" };
  if (who?.token) headers.Authorization = `Bearer ${who.token}`; if (who?.guest) headers["X-Guest-Id"] = who.guest;
  const r = await fetch(`http://127.0.0.1:8100/api.php?r=profile`, { method: body === undefined && raw === undefined ? "GET" : "POST", headers, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)) });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {} return { status: r.status, body: j, text: t };
}
const item = (n) => ({ id: `it${n}`, seed: `s${n}`, src: "floor", lvl: 3, v: 2, rarity: "rare", slot: "head", enh: 0, stats: { atk: 1 } });
const data = (bag, extra = {}) => ({ v: 1, save: { v: 1, f50: 1, best: 3, run: { d: 3, g: 120 }, dead: null }, inv: { bag, equip: { head: null, chest: null, arms: null, pants: null, boots: null, weapon: null }, stones: 4 }, dex: { seen: {}, kills: {} }, boxMail: [], ...extra });
try {
  const g0 = await call(A);
  check("new account: rev 0, no data", g0.status === 200 && g0.body.rev === 0 && g0.body.data === null, g0.text);
  check("guest → 403 login_required", (await call(G)).body?.error === "login_required");
  check("guest POST → 403", (await call(G, { rev: 0, data: data([]) })).status === 403);
  check("no auth → 401", (await call(null)).status === 401);

  const p1 = await call(A, { rev: 0, data: data([item(1)]) });
  check("first save → rev 1", p1.body?.ok === true && p1.body.rev === 1, p1.text);
  const g1 = await call(A);
  check("read back: same bag, gold, stones", g1.body.rev === 1 && g1.body.data.inv.bag[0].id === "it1" && g1.body.data.save.run.g === 120 && g1.body.data.inv.stones === 4);
  check("empty objects stay objects ({} not [])", g1.text.includes('"seen":{}') && g1.text.includes('"kills":{}'), g1.text.slice(0, 300));
  check("unicode kept", (await call(A, { rev: 1, data: data([{ ...item(2), name: "고대의 투구" }]) })).body.rev === 2 && (await call(A)).text.includes("고대의 투구"));

  // 다른 기기가 먼저 저장 → 오래된 rev로 쓰면 거부되고 서버 내용이 옴
  const stale = await call(A, { rev: 1, data: data([]) });
  check("stale rev → conflict with server data, not overwritten", stale.status === 200 && stale.body.ok === false && stale.body.conflict === true && stale.body.rev === 2 && stale.body.data.inv.bag[0].id === "it2", stale.text);
  check("server unchanged after conflict", (await call(A)).body.rev === 2);
  check("future rev → conflict", (await call(A, { rev: 9, data: data([]) })).body?.conflict === true);

  // 두 기기가 동시에 같은 rev로 → 하나만 성공
  const both = await Promise.all([call(A, { rev: 2, data: data([item(3)]) }), call(A, { rev: 2, data: data([item(4)]) })]);
  check("concurrent saves with same rev: exactly one wins", both.filter(r => r.body?.ok).length === 1 && both.filter(r => r.body?.conflict).length === 1, both.map(r => r.text).join(" | "));
  check("rev 3 after race", (await call(A)).body.rev === 3);

  // 계정끼리 분리
  check("other account sees nothing", (await call(B)).body.data === null);

  // 형식 검사
  const bad = async (d, name) => check(`reject ${name}`, (await call(A, { rev: 3, data: d })).status === 400);
  await bad(null, "null data");
  await bad({ v: 1 }, "missing inv");
  await bad(data(Array.from({ length: 61 }, (_, i) => item(i))), "61 bag items");
  await bad({ ...data([]), inv: { bag: [], equip: { a: 1, b: 1, c: 1, d: 1, e: 1, f: 1, g: 1, h: 1, i: 1, j: 1, k: 1 }, stones: 0 } }, "11 equip slots (max 10: 7 + 목걸이·반지 2)");
  await bad({ ...data([]), inv: { bag: [], equip: {}, stones: -1 } }, "negative stones");
  await bad({ ...data([]), inv: { bag: [], equip: {}, stones: 1.5 } }, "fractional stones");
  await bad({ ...data([]), dex: "x" }, "dex not object");
  await bad({ ...data([]), boxMail: "x" }, "boxMail not list");
  check("reject non-int rev", (await call(A, { rev: "3", data: data([]) })).status === 400);
  check("reject bad json", (await call(A, undefined, "{nope")).status === 400);
  check("reject >200KB", (await call(A, { rev: 3, data: data([], { pad: "x".repeat(210000) }) })).status === 413);
  check("48 bag items fits", (await call(A, { rev: 3, data: data(Array.from({ length: 48 }, (_, i) => ({ ...item(i), affixes: [{ k: "crit", v: 5 }, { k: "hp", v: 20 }], name: "전설의 무기 이름" }))) })).body?.rev === 4);

  const rows = new DatabaseSync(DB).prepare("SELECT * FROM profiles").all();
  check("one row per account, keyed by HMAC (no raw sub/email)", rows.length === 1 && /^[0-9a-f]{64}$/.test(rows[0].pkey) && !JSON.stringify(rows).includes("prof-a") && !JSON.stringify(rows).includes("ann@"));
  check("no php errors", !/Fatal|Warning|Notice|Deprecated/.test(phpErr), phpErr.slice(0, 400));
} finally {
  php.kill();
}
const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
