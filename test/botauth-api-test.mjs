// 디스코드 상점 봇 로그인 확인 (bot_auth.php, dc#175): 플레이어 ID(Xsolla Login 사용자 ID)가 게임 계정이면 200 {"user":{"id"}}
//   모르는 ID 404 INVALID_USER · 형식 오류 400 · GET 405 · 다른 프로젝트 400 · 서명은 있어도 없어도 (bot_auth_require_sig면 필수) · IP 제한
import { spawn } from "node:child_process";
import crypto from "node:crypto"; import fs from "node:fs"; import path from "node:path";
const REPO = process.argv[2];
const DIR = path.dirname(new URL(import.meta.url).pathname) + "/php";
const DB = path.join(DIR, "botauth.sqlite"); for (const f of [DB, DB + "-wal", DB + "-shm"]) fs.rmSync(f, { force: true });
const SECRET = "test-webhook-secret", JWT_SECRET = "botauth-jwt";   // 가짜 키
const cfg = (name, extra) => { const p = path.join(DIR, `config.botauth${name}.php`); fs.writeFileSync(p, `<?php\n$c = require __DIR__ . '/config.test.php';\nreturn array_merge($c, ['db_dsn' => 'sqlite:${DB}', 'xsolla_project_id' => 317991, 'webhook_secret' => '${SECRET}'${extra}]);\n`); return p; };
const results = []; const check = (n, ok, x = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x && !ok ? " — " + x : ""}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let phpErr = "";
const serve = (port, c) => { const p = spawn("php", ["-S", `127.0.0.1:${port}`, "-t", path.join(REPO, "ranking-php")], { env: { ...process.env, RANKING_CONFIG: c, TEST_JWT_SECRET: JWT_SECRET }, stdio: ["ignore", "ignore", "pipe"] }); p.stderr.on("data", d => phpErr += d); return p; };
const servers = [serve(8141, cfg("", "")), serve(8142, cfg("sig", ", 'bot_auth_require_sig' => true")), serve(8143, cfg("ip", ", 'bot_auth_ips' => '198.51.100.9'"))];
await sleep(800);
const sign = (raw) => crypto.createHash("sha1").update(raw + SECRET).digest("hex");
async function auth(body, { port = 8141, method = "POST", sig = false } = {}) {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  const headers = { "Content-Type": "application/json", ...(sig ? { Authorization: `Signature ${sign(raw)}` } : {}) };
  const r = await fetch(`http://127.0.0.1:${port}/bot_auth.php`, { method, headers, body: method === "POST" ? raw : undefined });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {} return { status: r.status, j, t };
}
const b64u = (x) => Buffer.from(x).toString("base64url");
const jwt = (sub) => { const h = b64u(JSON.stringify({ alg: "HS256" })), p = b64u(JSON.stringify({ sub, email: `${sub}@example.com`, exp: Math.floor(Date.now() / 1000) + 3600, xsolla_login_project_id: "30375188-893b-4b1a-ba1b-c8ba692fa5e3" })); return `${h}.${p}.${crypto.createHmac("sha256", JWT_SECRET).update(`${h}.${p}`).digest("base64url")}`; };
const game = (sub) => fetch("http://127.0.0.1:8141/api.php?r=profile", { headers: { Authorization: `Bearer ${jwt(sub)}`, Origin: "https://hucksoon.github.io" } }).then(r => r.json());
const USER = "0a1b2c3d-1111-4222-8333-444455556666";
const req = (id, extra = {}) => ({ settings: { project_id: 317991, merchant_id: 1 }, user: { id, country: "KR" }, ...extra });
try {
  check("GET → 405", (await auth(req(USER), { method: "GET" })).status === 405);
  let r = await auth(req(USER));
  check("player ID that never logged in to the game → 404 INVALID_USER", r.status === 404 && r.j?.error?.code === "INVALID_USER", r.t);
  await game(USER);
  r = await auth(req(USER));
  check("after logging in to the game → 200 {user:{id}} (no signature needed)", r.status === 200 && r.j?.user?.id === USER && Object.keys(r.j.user).length === 1, r.t);
  r = await auth(req(USER), { sig: true });
  check("also 200 with a correct signature", r.status === 200 && r.j?.user?.id === USER);
  r = await auth(req("  " + USER.toUpperCase() + " "));
  check("pasted with spaces / upper case → still found", r.status === 200 && r.j?.user?.id === USER, r.t);
  r = await auth({ user_id: USER });
  check("other body shapes (user_id) → found", r.status === 200);
  check("not a UUID → 404 INVALID_USER", (await auth(req("hello"))).j?.error?.code === "INVALID_USER");
  check("no ID / bad JSON → 400", (await auth({ settings: {} })).status === 400 && (await auth("{bad")).status === 400);
  check("other project → 400", (await auth(req(USER, { settings: { project_id: 1 } }))).status === 400);
  check("bot_auth_require_sig: unsigned → 401, signed → 200", (await auth(req(USER), { port: 8142 })).status === 401 && (await auth(req(USER), { port: 8142, sig: true })).status === 200);
  check("bot_auth_ips: other IP → 403", (await auth(req(USER), { port: 8143 })).status === 403);
  check("log has result and signature state but not the ID", /\[bot_auth\] 200 ok sig=none/.test(phpErr) && /sig=ok:webhook_secret/.test(phpErr) && !phpErr.includes(USER));
} finally { for (const s of servers) s.kill(); }
check("no php errors", !/Fatal|Warning|Deprecated/.test(phpErr), phpErr.slice(0, 300));
console.log(`${results.filter(Boolean).length}/${results.length} passed`);
