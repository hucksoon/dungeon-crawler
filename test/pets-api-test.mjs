// 펫 (dc#164) 서버 테스트: 로그인 사용자의 펫 목록을 서버(pets.php)가 관리
//   몬스터·등급 규칙이 monsters.js와 같은지, 로그인만, 같은 펫 한 번만, 이상한 이름표·등급 거절, 이벤트 모습은 이벤트 기간에만,
//   하루 한도, 고정·풀기, 가장 좋은 펫 고르기, 원래 id를 저장하지 않음
import { createRequire } from "node:module";
import { spawn, execFileSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import crypto from "node:crypto"; import fs from "node:fs"; import path from "node:path";
const REPO = process.argv[2];
const DIR = path.dirname(new URL(import.meta.url).pathname) + "/php";
const req = createRequire(import.meta.url);
const M = req(path.join(REPO, "monsters.js"));
const DB = path.join(DIR, "pets.sqlite"); for (const f of [DB, DB + "-wal", DB + "-shm"]) fs.rmSync(f, { force: true });
const CFG = path.join(DIR, "config.pets.php");
const setDay = (day) => fs.writeFileSync(CFG, `<?php\n$c = require __DIR__ . '/config.test.php';\nreturn array_merge($c, ['db_dsn' => 'sqlite:${DB}', 'event_today' => '${day}']);\n`);
setDay("2026-11-04");
const SECRET = "pets-secret";
const results = []; const check = (n, ok, x = "") => { results.push(!!ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x && !ok ? " — " + x : ""}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const php = spawn("php", ["-S", "127.0.0.1:8151", "-t", path.join(REPO, "ranking-php")], { env: { ...process.env, RANKING_CONFIG: CFG, TEST_JWT_SECRET: SECRET }, stdio: ["ignore", "ignore", "pipe"] });
let phpErr = ""; php.stderr.on("data", d => phpErr += d);
await sleep(700);
const b64u = (s) => Buffer.from(s).toString("base64url");
const jwt = (sub, email) => { const h = b64u(JSON.stringify({ alg: "HS256" })), p = b64u(JSON.stringify({ sub, email, exp: Math.floor(Date.now() / 1000) + 3600, xsolla_login_project_id: "30375188-893b-4b1a-ba1b-c8ba692fa5e3" })); return `${h}.${p}.${crypto.createHmac("sha256", SECRET).update(`${h}.${p}`).digest("base64url")}`; };
async function call(route, who, body) {
  const headers = { "Content-Type": "application/json", Origin: "https://hucksoon.github.io" };
  if (who?.token) headers.Authorization = `Bearer ${who.token}`; if (who?.guest) headers["X-Guest-Id"] = who.guest;
  const r = await fetch(`http://127.0.0.1:8151/api.php?r=${route}`, { method: body === undefined ? "GET" : "POST", headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {} return { status: r.status, body: j, text: t };
}
const db = () => new DatabaseSync(DB);
const user = (sub) => ({ sub, token: jwt(sub, `${sub}@example.com`) });
const G = { guest: "petsguest-0001" };
const U = user("pets-user-1"), U2 = user("pets-user-2"), U3 = user("pets-user-3");
const err = (r) => `${r.status} ${r.body?.error}`;
try {
  // ---- 규칙이 monsters.js와 같음 ----
  const P = JSON.parse(execFileSync("php", ["-r", `define('RANKING_NO_ROUTE', 1); putenv('RANKING_CONFIG=${CFG}'); require '${path.join(REPO, "ranking-php/api.php")}';
    $g = []; foreach (array_keys(PET_ODDS) as $s) { $g[$s] = pet_grades_for($s, false); $g[$s . '@'] = pet_grades_for($s, true); }
    echo json_encode(['monsters' => PET_MONSTERS, 'grades' => PET_GRADES, 'odds' => $g, 'noskin' => PET_NO_SKIN]);`], { encoding: "utf8" }));
  check("pet monsters in pets.php = monsters.js petMonsters()", JSON.stringify([...P.monsters].sort()) === JSON.stringify([...M.petMonsters()].sort()), JSON.stringify(P.monsters));
  check("grades in the same order", JSON.stringify(P.grades) === JSON.stringify(M.PET_GRADES));
  check("grades each source can give (and one step up for event pets) are the same", ["elite", "boss", "named"].every(s => JSON.stringify(P.odds[s]) === JSON.stringify(M.petGradesFor(s, false)) && JSON.stringify(P.odds[s + "@"]) === JSON.stringify(M.petGradesFor(s, true))), JSON.stringify(P.odds));
  const hw = new Set([...fs.readFileSync(path.join(REPO, "sprites.js"), "utf8").matchAll(/"hw_([a-z_]+)"/g)].map(m => m[1]));
  check("monsters without a Halloween look in the sprite sheet = PET_NO_SKIN", JSON.stringify(M.petMonsters().filter(id => !hw.has(id)).sort()) === JSON.stringify([...P.noskin.halloween].sort()), [...hw].join());

  // ---- 로그인만 ----
  check("guest can't list or claim → 403 login_required", (await call("pets", G)).body?.error === "login_required" && (await call("pet_claim", G, { key: "goblin", g: "common", src: "elite" })).body?.error === "login_required");
  const l0 = await call("pets", U);
  check("new account: no pets, nothing on", l0.status === 200 && Object.keys(l0.body.have).length === 0 && l0.body.on === null && l0.body.pin === false, l0.text);

  // ---- 얻기 ----
  const c1 = await call("pet_claim", U, { key: "goblin", g: "common", src: "elite" });
  check("claim goblin (elite, common) → in the list and on", c1.status === 200 && c1.body.got === "goblin" && c1.body.have.goblin?.g === "common" && c1.body.on === "goblin", c1.text);
  const c2 = await call("pet_claim", U, { key: "goblin", g: "rare", src: "elite" });
  check("same pet again (even a better grade) → 409 have, stays common", c2.body?.error === "have" && (await call("pets", U)).body.have.goblin.g === "common", err(c2));
  const both = await Promise.all([call("pet_claim", U, { key: "orc", g: "rare", src: "elite" }), call("pet_claim", U, { key: "orc", g: "epic", src: "elite" })]);
  check("two claims at once for the same pet → only one", both.filter(r => r.status === 200).length === 1 && db().prepare("SELECT COUNT(*) n FROM pets WHERE pet_key = 'orc'").get().n === 1, both.map(err).join(" | "));
  check("unknown monster / bad key / too long → 400 bad_pet", (await Promise.all([
    call("pet_claim", U, { key: "dragon_cat", g: "common", src: "elite" }), call("pet_claim", U, { key: "Goblin", g: "common", src: "elite" }),
    call("pet_claim", U, { key: "goblin@", g: "common", src: "elite" }), call("pet_claim", U, { key: 7, g: "common", src: "elite" }),
    call("pet_claim", U, { key: "rat@christmas", g: "rare", src: "elite" }), call("pet_claim", U, { key: "x".repeat(60), g: "common", src: "elite" })])).every(r => r.body?.error === "bad_pet"));
  check("bad source → 400 bad_pet", (await call("pet_claim", U, { key: "rat", g: "common", src: "golden" })).body?.error === "bad_pet");
  const bg = await Promise.all([call("pet_claim", U, { key: "rat", g: "legend", src: "elite" }), call("pet_claim", U, { key: "rat", g: "common", src: "boss" }), call("pet_claim", U, { key: "rat", g: "rare", src: "named" }), call("pet_claim", U, { key: "rat", g: "mythic", src: "elite" })]);
  check("grade the source can't give → 400 bad_grade (elite legend, boss common, named rare)", bg.every(r => r.body?.error === "bad_grade"), bg.map(err).join(" | "));
  const c3 = await call("pet_claim", U, { key: "lich_lord", g: "legend", src: "boss" });
  check("better grade → it becomes the pet you take along", c3.status === 200 && c3.body.on === "lich_lord" && c3.body.pin === false, c3.text);

  // ---- 이벤트 모습 ----
  check("Halloween pet during the event, normal grade → 400 bad_grade (event pets are one step up)", (await call("pet_claim", U, { key: "troll@halloween", g: "common", src: "elite" })).body?.error === "bad_grade");
  const h1 = await call("pet_claim", U, { key: "troll@halloween", g: "legend", src: "boss" });
  check("Halloween troll (boss, legend) on 11/4 → OK, a separate pet from the plain troll", h1.status === 200 && h1.body.have["troll@halloween"]?.g === "legend", h1.text);
  check("monster without a Halloween look → 400 bad_pet", (await call("pet_claim", U, { key: "yeomra@halloween", g: "legend", src: "named" })).body?.error === "bad_pet");
  setDay("2026-11-14"); await sleep(3100);   // PHP가 설정 파일을 2초(초 단위로 재서 최대 3초) 동안 기억함 (opcache)
  check("11/14 (day after the event): still OK — killed on the last night", (await call("pet_claim", U, { key: "rat@halloween", g: "rare", src: "elite" })).status === 200);
  setDay("2026-11-15"); await sleep(3100);   // PHP가 설정 파일을 2초(초 단위로 재서 최대 3초) 동안 기억함 (opcache)
  check("11/15: Halloween pets closed → 403 event_over", (await call("pet_claim", U, { key: "bat@halloween", g: "rare", src: "elite" })).body?.error === "event_over");
  setDay("2026-10-30"); await sleep(3100);   // PHP가 설정 파일을 2초(초 단위로 재서 최대 3초) 동안 기억함 (opcache)
  check("before the event (10/30) → 403 event_over", (await call("pet_claim", U, { key: "bat@halloween", g: "rare", src: "elite" })).body?.error === "event_over");
  setDay("2026-11-04"); await sleep(3100);   // PHP가 설정 파일을 2초(초 단위로 재서 최대 3초) 동안 기억함 (opcache)

  // ---- 고정 ----
  const s1 = await call("pet_set", U, { key: "goblin" });
  check("pin goblin → on goblin, pin true", s1.status === 200 && s1.body.on === "goblin" && s1.body.pin === true, s1.text);
  await call("pet_claim", U, { key: "ancient_dragon", g: "legend", src: "boss" });
  const l1 = await call("pets", U);
  check("a newer, better pet doesn't replace the pinned one", l1.body.on === "goblin" && l1.body.pin === true && l1.body.have.ancient_dragon, l1.text);
  check("pin a pet you don't have → 404 no_pet (stays goblin)", (await call("pet_set", U, { key: "kraken" })).body?.error === "no_pet" && (await call("pet_set", U, { key: 5 })).body?.error === "no_pet" && (await call("pets", U)).body.on === "goblin");
  const s2 = await call("pet_set", U, { key: null });
  check("unpin → back to the best (legend, newest: ancient dragon)", s2.status === 200 && s2.body.pin === false && s2.body.on === "ancient_dragon", s2.text);
  check("other accounts don't see my pets", Object.keys((await call("pets", U2)).body.have).length === 0);

  // ---- 하루 한도 ----
  const ids = M.petMonsters().filter(id => !["goblin", "orc", "lich_lord", "troll", "rat", "ancient_dragon"].includes(id));
  let n = 0;
  for (const id of ids.slice(0, 20)) if ((await call("pet_claim", U2, { key: id, g: "common", src: "elite" })).status === 200) n++;
  const over = await call("pet_claim", U2, { key: ids[20], g: "common", src: "elite" });
  check("20 new pets a day, the 21st → 429 pet_limit", n === 20 && over.body?.error === "pet_limit", `${n} ${err(over)}`);
  db().prepare("UPDATE pets SET day = '2026-01-01'").run();   // 다음 날처럼
  check("next day → can get more again", (await call("pet_claim", U2, { key: ids[20], g: "common", src: "elite" })).status === 200);

  // ---- 저장 ----
  const rows = JSON.stringify(db().prepare("SELECT * FROM pets").all()) + JSON.stringify(db().prepare("SELECT * FROM pet_prefs").all());
  check("no raw ids or emails stored", !rows.includes("pets-user") && !rows.includes("example.com"));
  check("pin with nothing saved yet (user 3) → 404, then list still works", (await call("pet_set", U3, { key: "goblin" })).body?.error === "no_pet" && (await call("pets", U3)).status === 200);
  check("no PHP errors", !/Fatal|Warning|Parse error|Deprecated/.test(phpErr), phpErr.slice(0, 300));
} finally { php.kill(); }
const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
