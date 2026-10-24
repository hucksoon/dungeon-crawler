// 운영자(개발자 계정): 골드·강화석·보석 안 씀, 고대 굴리기·진열 바꾸기 횟수 제한 없음 (일반 사용자는 그대로) + 서버가 운영자 아이템(ar 20 초과, 진열 |r5|)을 인정
import { createRequire } from "node:module";
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto"; import fs from "node:fs"; import path from "node:path";
const require = createRequire(process.env.NODE_PATH + "/");
const { chromium } = require("playwright");
const REPO = process.argv[2], OUT = process.argv[3];
const I = createRequire(import.meta.url)(path.join(REPO, "items.js"));
const DIR = path.dirname(new URL(import.meta.url).pathname) + "/php";
const DB = path.join(DIR, "staff.sqlite"); for (const f of [DB, DB + "-wal", DB + "-shm"]) fs.rmSync(f, { force: true });
fs.writeFileSync(path.join(DIR, "config.staff.php"), `<?php\n$c = require __DIR__ . '/config.test.php';\nreturn array_merge($c, ['db_dsn' => 'sqlite:${DB}', 'dev_emails' => 'dev@example.com', 'allowed_origins' => 'https://game.apacimtest.com']);\n`);
const SECRET = "staff-secret";
const results = []; const check = (n, ok, x = "") => { results.push(!!ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x && !ok ? " — " + x : ""}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const php = spawn("php", ["-S", "127.0.0.1:8117", "-t", path.join(REPO, "ranking-php")], { env: { ...process.env, PHP_CLI_SERVER_WORKERS: "4", RANKING_CONFIG: path.join(DIR, "config.staff.php"), TEST_JWT_SECRET: SECRET }, stdio: ["ignore", "ignore", "pipe"] });
let phpErr = ""; php.stderr.on("data", d => phpErr += d);
await sleep(700);
const API = "http://127.0.0.1:8117/api.php", ORIGIN = "https://game.apacimtest.com/";
const b64u = (s) => Buffer.from(s).toString("base64url");
const jwt = (sub, email) => { const h = b64u(JSON.stringify({ alg: "HS256" })), p = b64u(JSON.stringify({ sub, email, exp: Math.floor(Date.now() / 1000) + 7200, xsolla_login_project_id: "30375188-893b-4b1a-ba1b-c8ba692fa5e3" })); return `${h}.${p}.${crypto.createHmac("sha256", SECRET).update(`${h}.${p}`).digest("base64url")}`; };
const U = (sub, email) => ({ sub, email, token: jwt(sub, email) });
const DEV = U("st-dev", "dev@example.com"), A = U("st-a", "alice@example.com");
async function call(route, who, body, device = who.sub + "-dev") {
  const r = await fetch(`${API}?r=${route}`, { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json", Origin: ORIGIN.slice(0, -1), Authorization: `Bearer ${who.token}`, "X-Device-Id": device }, body: body && JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
}
// 운영자 기기 등록 (admin.php devices) — 서버 명령
const admin = (...args) => { const r = spawnSync("php", [path.join(REPO, "ranking-php/admin.php"), ...args], { env: { ...process.env, RANKING_CONFIG: path.join(DIR, "config.staff.php") } }); return (r.stdout + r.stderr).toString(); };
const findN = (pre, pred, lvl = 60, src = "boss") => { for (let i = 0; i < 600000; i++) { const it = I.generate(`${pre}|k${i}`, src, lvl); if (pred(it)) return it; } throw new Error("nf " + pre); };
// 20번 굴려도 고대가 안 되고 25번째에 되는 레전더리 (운영자만 거기까지 굴릴 수 있음)
const L = findN("stl|d60", it => it.rarity === "legendary" && !it.ancient && [...Array(20)].every((_, k) => !I.ancientRerollHit(it, k + 1)), 60);
const chest = findN("stc|d60", it => it.slot === "chest" && I.socketCount(it) >= 2, 60);
const MAP_W = 32, MAP_H = 24;
const lv = (d, rid) => { const mm = Array.from({ length: MAP_H }, (_, y) => Array.from({ length: MAP_W }, (_, x) => (x === 0 || y === 0 || x === MAP_W - 1 || y === MAP_H - 1 ? 0 : 1))); mm[20][28] = 2; return JSON.stringify({ rid, d, z: "normal", turn: 0, map: mm.map(r => r.join("")).join(""), seen: "1".repeat(MAP_W * MAP_H), px: 10, py: 10, shop: null, enemies: [], items: [] }); };
const save = (rid) => JSON.stringify({ v: 1, season: 4, best: 75, clr: 1, nb: 10, ld: { d: 37, z: "nm" }, run: { d: 5, hp: 3000, mh: 3000, a: 30, g: 0, l: 40, x: 0, xn: 1e12, rid, k: 0, pp: 0 } });
const accL = (() => { for (let i = 0; ; i++) { const it = I.generate(`stacc${i}|j30|k${i}`, "boss", 155); if (I.isAccessory(it) && it.rarity === "legendary" && !it.ancient) return it; } })();
const uq7 = (() => { for (let i = 0; ; i++) { const it = I.generateUnique(`stu${i}|j10|u${i}`, 135); if (!it.ancient) return it; } })();
const inv = () => JSON.stringify({ bag: [{ ...L, ar: 20 }, chest, accL, uq7, { ...findN("ste|d60", it => it.rarity === "epic" && !I.rollEnhance({ ...it, enh: 10 }).ok), enh: 10 }], equip: Object.fromEntries(I.EQUIP_SLOTS.map(s => [s, null])), log: [], stones: 0, nmStones: 0, gems: {} });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
async function open(who, device = who.sub + "-dev") {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 1000 } }); const page = await ctx.newPage(); const errors = [];
  page.on("pageerror", e => errors.push(e.message)); page.on("dialog", d => d.accept());
  await ctx.route(ORIGIN + "**", rt => { const f = new URL(rt.request().url()).pathname.slice(1) || "index.html";
    if (f === "ranking-config.js") return rt.fulfill({ contentType: "text/javascript", body: `window.RANKING_API = ${JSON.stringify(API)};` });
    const p = path.join(REPO, f); if (!fs.existsSync(p)) return rt.fulfill({ status: 404, body: "" });
    rt.fulfill({ contentType: f.endsWith(".js") ? "text/javascript" : "text/html", body: fs.readFileSync(p) }); });
  await ctx.route(API + "**", async rt => { const q = rt.request();
    const res = await fetch(q.url(), { method: q.method(), headers: q.headers(), body: ["GET", "OPTIONS"].includes(q.method()) ? undefined : q.postData() });
    rt.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: Buffer.from(await res.arrayBuffer()) }); });
  await ctx.route("https://login.xsolla.com/**", rt => rt.fulfill({ status: 200, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: "[]" }));
  await ctx.addInitScript(([s]) => { if (sessionStorage.getItem("s")) return; sessionStorage.setItem("s", 1); sessionStorage.setItem("rl_scene", "dungeon"); for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); },
    [{ rl_device_id: device, rl_auth: JSON.stringify({ access: who.token, refresh: "r", exp: Date.now() + 7200e3 }), rl_save: save("rid" + who.sub), rl_level: lv(5, "rid" + who.sub), [`rl_inv:g:${device}`]: inv() }]);
  await page.goto(ORIGIN); await sleep(1500);
  return { ctx, page, errors };
}
const press = async (page, k, n = 1) => { for (let i = 0; i < n; i++) { await page.keyboard.press(k); await sleep(40); } };
const readInv = (page) => page.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => k.startsWith("rl_inv:u:")))));
const pick = async (page, it) => { await page.locator(".bag-item", { hasText: I.itemName(it) }).first().click(); await sleep(150); };
try {
  // 기기 등록 명령: 3대까지, 4대째는 거절, 목록·지우기
  check("admin devices: empty list", admin("devices").includes("운영자 기기 0/3대"));
  check("admin devices add: laptop, desktop, phone", admin("devices", "add", "st-dev-dev", "노트북").includes("(1/3)") && admin("devices", "add", "desk-0000-1111", "회사 데스크탑").includes("(2/3)") && admin("devices", "add", "phone-0000-2222", "핸드폰").includes("(3/3)"));
  check("admin devices add: 4th refused, duplicate refused", admin("devices", "add", "fourth-device-01").includes("최대 3대") && admin("devices", "add", "st-dev-dev").includes("이미 등록된"));
  const lst = admin("devices");
  check("admin devices list: 3 with names, no raw device id", lst.includes("3/3대") && lst.includes("노트북") && lst.includes("회사 데스크탑") && lst.includes("핸드폰") && !lst.includes("st-dev-dev") && !lst.includes("phone-0000"), lst);
  const raw = spawnSync("php", ["-r", `$p = new PDO("sqlite:${DB}"); echo json_encode($p->query("SELECT * FROM staff_devices")->fetchAll(PDO::FETCH_ASSOC));`]).stdout.toString();
  check("DB stores only HMAC of device ids", raw && !raw.includes("st-dev-dev") && !raw.includes("desk-0000") && !raw.includes("phone-0000"), raw);
  // 운영자 계정이지만 등록 안 된 기기: 혜택 없음, 이 기기 ID를 보여줌
  const X = await open(DEV, "phone-9999-aaaa"); await sleep(1000);
  await press(X.page, "i"); await sleep(200);
  const xh = await X.page.locator("#inv-count").innerText();
  check("operator on unregistered device: no unlimited, shows this device ID", xh.includes("운영자 기기 아님 (이 기기 ID phone-9999-aaaa)") && !xh.includes("제한 없음"), xh);
  await X.ctx.close();
  // 게스트 가방에 넣어 두면 로그인할 때 계정 가방으로 옮겨짐
  const D = await open(DEV); await sleep(1000);
  await press(D.page, "i"); await sleep(200);
  check("operator: inventory header says unlimited + 100%", (await D.page.locator("#inv-count").innerText()).includes("운영자: 골드·강화석·보석·횟수 제한 없음, 강화·고대 굴리기 100%"), await D.page.locator("#inv-count").innerText());
  const epic = (await readInv(D.page)).bag.find(x => x.rarity === "epic");
  await pick(D.page, epic);
  await D.page.locator("#inv-detail button", { hasText: /^강화/ }).first().click(); await sleep(150);
  let d = await readInv(D.page);
  check("operator: +10 → +11 always succeeds (5% normally), 0 stones and 0 gold", d.bag.find(x => x.id === epic.id).tries === 1 && d.bag.find(x => x.id === epic.id).enh === 11 && d.stones === 0 && (await D.page.locator("#gold").innerText()) === "0", JSON.stringify(d.bag.find(x => x.id === epic.id)));
  await pick(D.page, L);
  check("operator: ancient roll allowed after 20 failures, 0 gold", (await D.page.locator("#inv-detail").innerText()).includes("운영자: 횟수 제한 없음 (20번 굴림)") && await D.page.locator("#inv-detail button", { hasText: "고대 굴리기" }).isEnabled());
  check("operator: ancient chance shown as 100%", (await D.page.locator("#inv-detail").innerText()).includes("100%(운영자)로 고대"));
  await D.page.locator("#inv-detail button", { hasText: "고대 굴리기" }).click(); await sleep(150);
  d = await readInv(D.page); const l2 = d.bag.find(x => x.id === L.id);
  const hitAt = [...Array(200)].map((_, k) => k + 1).find(n => n > 20 && I.ancientRerollHit(L, n));
  check(`operator: one click → ancient, recorded at the next hit roll (${hitAt}) so the server agrees`, l2.ancient && l2.ar === hitAt, JSON.stringify([l2.ar, l2.ancient]));
  await pick(D.page, chest);
  await D.page.selectOption("#inv-detail select.gem-kind", "diamond"); await D.page.selectOption("#inv-detail select.gem-grade", "2"); await sleep(100);
  check("operator: gem plan says free, button enabled with empty pouch", (await D.page.locator("#inv-detail").innerText()).includes("운영자: 보석을 쓰지 않고 넣어요") && await D.page.locator("#inv-detail button.gem-put").isEnabled());
  await D.page.locator("#inv-detail button.gem-put").click(); await sleep(150);
  d = await readInv(D.page);
  check("operator: perfect diamond socketed, pouch untouched", JSON.stringify(d.bag.find(x => x.id === chest.id).gems) === '[["diamond",2]]' && !(d.gems?.diamond || []).some(Boolean));
  // 운영자: 룬도 주머니가 비어 있어도 아무 룬이나 (하 룬)
  await D.page.selectOption("#inv-detail select.gem-kind", "rune"); await sleep(80); await D.page.selectOption("#inv-detail select.gem-grade", "13"); await sleep(100);
  check("operator: rune option shown with an empty pouch, plan free", (await D.page.locator("#inv-detail").innerText()).includes("운영자: 룬을 쓰지 않고 넣어요") && await D.page.locator("#inv-detail button.gem-put").isEnabled());
  await D.page.locator("#inv-detail button.gem-put").click(); await sleep(150);
  d = await readInv(D.page);
  check("operator: 하 rune socketed, rune pouch untouched", JSON.stringify(d.bag.find(x => x.id === chest.id).gems) === '[["diamond",2],["rune",13]]' && !(d.runes || []).some(Boolean), JSON.stringify([d.bag.find(x => x.id === chest.id).gems, d.runes]));
  // 운영자: 장신구·유니크는 고대 굴리기가 없고 "고대로 만들기 (운영자)"만
  for (const [nm, it] of [["accessory", accL], ["unique", uq7]]) {
    await pick(D.page, it);
    const det = await D.page.locator("#inv-detail").innerText();
    check(`operator: ${nm} shows 고대로 만들기 (no ancient reroll)`, await D.page.locator("#inv-detail button", { hasText: "고대로 만들기 (운영자)" }).isVisible() && !(await D.page.locator("#inv-detail button", { hasText: /^고대 굴리기/ }).count()), det.slice(0, 300));
    await D.page.locator("#inv-detail button", { hasText: "고대로 만들기 (운영자)" }).click(); await sleep(150);
    const got = (await readInv(D.page)).bag.find(x => x.id === it.id), hit = [...Array(5000)].map((_, k) => k + 1).find(n => I.ancientRerollHit(it, n));
    check(`operator: ${nm} → ancient at roll ${hit}`, got?.ancient && got.ar === hit && I.applyAncientRerolls(I.generate(it.seed, it.src, it.lvl, 4, it.r), hit).ancient, JSON.stringify([got?.ar, got?.ancient]));
  }
  // 운영자 아이템 받기: 유니크·세트·장신구를 바로 가방에 (실제 규칙으로 만든 아이템)
  check("operator: 🎁 아이템 받기 button visible", await D.page.locator("#inv-staff-gift").isVisible());
  await D.page.locator("#inv-staff-gift").click(); await sleep(150);
  check("gift panel: uniques 10 + accessories 5 + sets", (await D.page.locator("#inv-detail").innerText()).includes("유니크 장비 (10)") && (await D.page.locator("#inv-detail").innerText()).includes("유니크 장신구 (5)") && (await D.page.locator("#inv-detail").innerText()).includes("시험의 세트 (6부위)"));
  let before = (await readInv(D.page)).bag.map(x => x.id);
  await D.page.locator("#inv-detail button", { hasText: "업경 목걸이" }).click(); await sleep(300);
  let got = (await readInv(D.page)).bag.filter(x => !before.includes(x.id));
  const eg = got[0];
  check("gift: 업경 목걸이 (r8, 공격력·방어력·최대 HP, rebuilds from seed)", got.length === 1 && eg.uq === "eopgyeong" && eg.r === I.RULES_REV && eg.main.map(([k]) => k).join() === "atk,def,hp" && I.generate(eg.seed, eg.src, eg.lvl, 4, eg.r).id === eg.id && !!I.rollUniqueAcc(eg.seed, eg.lvl), JSON.stringify(eg?.main));
  check("gift: message", (await D.page.locator("#inv-detail").innerText()).includes("운영자: 업경 목걸이 1개를 가방에 넣었어요"));
  await D.page.locator("#inv-detail input[type=checkbox]").check(); await sleep(50);
  before = (await readInv(D.page)).bag.map(x => x.id);
  await D.page.locator("#inv-detail button", { hasText: "시험의 세트 (6부위)" }).click(); await sleep(800);
  got = (await readInv(D.page)).bag.filter(x => !before.includes(x.id));
  check("gift: 시험의 세트 6 pieces, hell, ancient", got.length === 6 && got.every(x => x.set === "trial" && /\|j50\|/.test(x.seed) && x.ancient) && new Set(got.map(x => x.slot)).size === 6, JSON.stringify(got.map(x => [x.slot, x.set, x.ancient])));
  await D.page.locator("#inv-detail input[type=checkbox]").uncheck();
  await D.page.locator("#inv-detail button.guide-tier", { hasText: "나이트메어" }).first().click(); await sleep(100);
  before = (await readInv(D.page)).bag.map(x => x.id);
  await D.page.locator("#inv-detail button", { hasText: "레전더리 장신구 3개" }).click(); await sleep(500);
  got = (await readInv(D.page)).bag.filter(x => !before.includes(x.id));
  check("gift: nightmare legendary accessories (neck + 2 rings)", got.length === 3 && got.every(x => I.isAccessory(x) && x.rarity === "legendary" && /\|n50\|/.test(x.seed)) && got.map(x => x.slot).sort().join() === "neck,ring,ring", JSON.stringify(got.map(x => [x.slot, x.seed])));
  // 룬워드 베이스 (dc#54): 일반 단계, 전부 → 룬워드·베이스마다 홈이 룬 수와 맞는 커먼
  await D.page.locator("#inv-detail button.guide-tier", { hasText: "일반" }).click(); await sleep(100);
  before = (await readInv(D.page)).bag.map(x => x.id);
  const nB = I.RUNEWORDS.reduce((a, w) => a + w.bases.length, 0);
  await D.page.locator("#inv-detail button", { hasText: `전부 (${nB}개)` }).click(); await sleep(800);
  got = (await readInv(D.page)).bag.filter(x => !before.includes(x.id));
  check("gift: runeword bases (normal) — one common per runeword·base, exact sockets", got.length === nB && got.every(x => x.rarity === "common" && /\|d75\|/.test(x.seed) && I.runewordsFor(x).length > 0)
    && I.RUNEWORDS.every(w => w.bases.every(b => got.some(x => I.runewordBaseKeys(x).includes(b) && I.socketCount(x) === w.runes.length))), JSON.stringify(got.map(x => [x.slot, x.type, I.socketCount(x)])));
  await D.page.locator("#inv-detail button.guide-tier", { hasText: "헬 (지옥의)" }).last().click(); await sleep(100);
  before = (await readInv(D.page)).bag.map(x => x.id);
  await D.page.locator("#inv-detail button.staff-btn", { hasText: "천하무적 (갑옷 4홈)" }).click(); await sleep(300);
  got = (await readInv(D.page)).bag.filter(x => !before.includes(x.id));
  check("gift: 천하무적 base (hell) — common chest with 4 sockets, 지옥의", got.length === 1 && got[0].slot === "chest" && I.socketCount(got[0]) === 4 && got[0].rarity === "common" && I.itemTier(got[0]) === "hell", JSON.stringify(got));
  await D.page.screenshot({ path: `${OUT}/staff-gift.png` });
  check("gift: no page errors", D.errors.length === 0, D.errors.join("; "));
  await D.page.locator("#inv-close").click(); await sleep(100);
  // 운영자 입구 (던전 입구 건물 오른쪽 19,11): 포탈로 나오면 (16,13) → 오른쪽 3, 위 2
  await press(D.page, "p"); await sleep(300);
  await D.page.screenshot({ path: `${OUT}/staff-lobby.png` });
  await press(D.page, "ArrowRight", 3); await press(D.page, "ArrowUp", 2); await sleep(400);
  const lvl = await D.page.evaluate(() => JSON.parse(localStorage.getItem("rl_level")));
  check("operator door → the floor where the portal was taken (normal 5, not the older death on nightmare 37), new map", lvl?.d === 5 && (lvl?.z || "normal") === "normal" && lvl?.rid !== "rid" + DEV.sub && (await D.page.locator("#log").innerText()).includes("운영자 입구: 5층을(를) 새로 만들어 들어왔다"), JSON.stringify([lvl?.d, lvl?.z, lvl?.rid]));
  // 실제로 쓰러지면: 옆에 아주 센 몬스터를 두고 한 턴 → 쓰러진 창의 운영자 버튼 → 같은 층으로
  await D.page.evaluate(() => {
    const L = JSON.parse(localStorage.getItem("rl_level")), W = 32;
    const spot = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]].map(([dx, dy]) => [L.px + dx, L.py + dy]).find(([x, y]) => L.map[y * W + x] !== "0" && !L.enemies.some(e => e.x === x && e.y === y));
    L.enemies.push({ x: spot[0], y: spot[1], id: "titan", ch: "I", name: "악몽의 타이탄", color: "#fdd835", kind: "normal", hp: 1e9, maxHp: 1e9, atk: 1e8, def: 0, xp: 1, nm: 1 });
    localStorage.setItem("rl_level", JSON.stringify(L)); sessionStorage.setItem("rl_scene", "dungeon");
  });
  await D.page.reload(); await sleep(2000);
  await press(D.page, " "); await sleep(400);
  const deadSave = await D.page.evaluate(() => JSON.parse(localStorage.getItem("rl_save")));
  check("death: last-death floor saved, operator button on the death screen", deadSave?.ld?.d === 5 && deadSave?.ld?.z === "normal" && await D.page.locator("#death-modal button.staff-revive").isVisible(), JSON.stringify(deadSave?.ld));
  await D.page.locator("#death-modal button.staff-revive").click(); await sleep(400);
  const lvl3 = await D.page.evaluate(() => JSON.parse(localStorage.getItem("rl_level")));
  check("operator revive → back on floor 5 (new map), gold/level kept", lvl3?.d === 5 && (lvl3?.z || "normal") === "normal" && lvl3?.rid !== lvl?.rid && await D.page.locator("#death-modal").isHidden() && (await D.page.locator("#gold").innerText()) === "0", JSON.stringify([lvl3?.d, lvl3?.z]));
  // 로비 → 대장간에서 0골드로 재련, 시간 상점 진열 바꾸기 4번
  await press(D.page, "p"); await sleep(300);
  await press(D.page, "ArrowLeft"); await press(D.page, "ArrowDown", 5); await press(D.page, "ArrowRight"); await press(D.page, "ArrowDown"); await sleep(250);
  await pick(D.page, L);
  check("operator: reforge enabled with 0 gold", await D.page.locator("#inv-detail button.reforge-btn").first().isEnabled());
  await D.page.locator("#inv-detail button.reforge-btn").first().click(); await sleep(150);
  d = await readInv(D.page);
  check("operator: every line still has a reforge button after reforging", (await D.page.locator("#inv-detail button.reforge-btn").count()) === L.lines.filter(([k]) => k !== "socket").length && (await D.page.locator("#inv-detail").innerText()).includes("운영자: 모든 줄을 재련할 수 있어요"));
  check("operator: reforged (rf saved), gold still 0", JSON.stringify(d.bag.find(x => x.id === L.id).rf) === "[0]" && (await D.page.locator("#gold").innerText()) === "0" && (await D.page.locator("#inv-detail").innerText()).includes("운영자 무료"));
  await D.page.locator("#inv-close").click(); await sleep(100);
  await press(D.page, "ArrowUp"); await press(D.page, "ArrowLeft", 5); await press(D.page, "ArrowUp", 6); await sleep(200);
  check("hour shop opened", !(await D.page.locator("#shop-modal").isHidden()), await D.page.locator("#shop-title").innerText().catch(() => ""));
  for (let k = 0; k < 4; k++) { await D.page.locator("#shop-reroll").click(); await sleep(120); }
  check("operator: hour-shop reroll past 3 times, free", (await D.page.locator("#shop-reroll").innerText()).includes("운영자: 횟수 제한 없음 · 4번 바꿈") && await D.page.locator("#shop-reroll").isEnabled() && (await D.page.locator("#gold").innerText()) === "0", await D.page.locator("#shop-reroll").innerText());
  await D.page.screenshot({ path: `${OUT}/staff.png` });
  check("operator: no page errors", D.errors.length === 0, D.errors.join("; "));
  await D.ctx.close();

  // 일반 사용자: 그대로 막힘
  const P = await open(A); await sleep(1000);
  await press(P.page, "i"); await sleep(200);
  check("normal user: no operator text, no gift button", !(await P.page.locator("#inv-count").innerText()).includes("운영자") && await P.page.locator("#inv-staff-gift").isHidden());
  await pick(P.page, L);
  check("normal user: 20 failures → fixed 20/20 button", await P.page.locator("#inv-detail button", { hasText: "고대 굴리기 20/20번 실패" }).isDisabled());
  await pick(P.page, (await readInv(P.page)).bag.find(x => x.rarity === "epic"));
  check("normal user: enhance needs stones, chance 5%", await P.page.locator("#inv-detail button", { hasText: /^강화/ }).first().isDisabled() && (await P.page.locator("#inv-detail").innerText()).includes("+11: 성공 5%"));
  await pick(P.page, chest);
  check("normal user: no gems → can't socket", await P.page.locator("#inv-detail button.gem-put").isDisabled());
  await P.page.locator("#inv-close").click(); await sleep(100);
  await press(P.page, "p"); await sleep(300);
  await press(P.page, "ArrowRight", 3); await press(P.page, "ArrowUp", 2); await sleep(300);
  check("normal user: operator door spot is just floor (stays in lobby)", await P.page.evaluate(() => document.body.classList.contains("in-lobby")));
  check("normal user: no page errors", P.errors.length === 0, P.errors.join("; "));
  await P.ctx.close();
} finally { await browser.close(); }

try {
  // 서버: 운영자가 거래소에 올리는 아이템은 고대 굴림 20번 초과·진열 |r5|도 인정, 일반 사용자는 거절
  const hitAt = [...Array(200)].map((_, k) => k + 1).find(n => n > 20 && I.ancientRerollHit(L, n));
  const ref = (it, extra = {}) => ({ seed: it.seed, src: it.src, lvl: it.lvl, v: 4, enh: 0, id: it.id, r: it.r, ...extra });
  const devL = await call("market_list", DEV, { item: ref(L, { ar: hitAt }), gold: 100, cash: 1, stage: 75 });
  const userL = await call("market_list", A, { item: ref(findN("stl2|d60", it => it.rarity === "legendary" && !it.ancient), { ar: 25 }), gold: 100, cash: 1, stage: 75 });
  check("server: operator listing with ar > 20 accepted, normal user rejected", devL.status === 200 && userL.body?.error === "bad_item", JSON.stringify([devL, userL]));
  const L3 = findN("stl3|d60", it => it.rarity === "legendary" && !it.ancient);
  check("server: operator on unregistered device → same limits as everyone", (await call("market_list", DEV, { item: ref(L3, { ar: 25 }), gold: 100, cash: 1, stage: 75 }, "phone-9999-aaaa")).body?.error === "bad_item");
  check("admin devices remove", admin("devices", "remove", "2").includes("2번") && admin("devices").includes("2/3대"));
  // 운영자 기기의 게스트 기록: 등록하면 지우고, 그 뒤로는 랭킹에 안 올라감 (다른 게스트는 그대로)
  const gcall = async (route, gid, body) => { const r = await fetch(`${API}?r=${route}`, { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json", Origin: ORIGIN.slice(0, -1), "X-Guest-Id": gid }, body: body && JSON.stringify(body) }); return { status: r.status, body: await r.json() }; };
  const names = async () => (await gcall("ranking", "other-guest-0001")).body.rows.map(x => x.name);
  const gs1 = await gcall("score", "gphone-0000-3333", { stage: 9 }), go1 = await gcall("score", "other-guest-0001", { stage: 7 });
  check("guest on a not-yet-staff phone is ranked", gs1.body.ranked === true && go1.body.ranked === true && (await names()).includes("게스트 #gphone"), JSON.stringify([gs1, go1]));
  const addOut = admin("devices", "add", "gphone-0000-3333", "핸드폰2");
  check("devices add: removes that device's guest ranking rows", addOut.includes("(3/3)") && addOut.includes("게스트 랭킹 기록 1줄을 지웠어요") && !(await names()).includes("게스트 #gphone") && (await names()).includes("게스트 #other-"), addOut);
  const gs2 = await gcall("score", "gphone-0000-3333", { stage: 12 });
  check("staff-device guest: score not ranked (reason staff_device), stays off the board", gs2.body.ranked === false && gs2.body.reason === "staff_device" && !(await names()).includes("게스트 #gphone"), JSON.stringify(gs2));
  const gme = await gcall("me", "gphone-0000-3333");
  check("staff-device guest: me says 운영자 기기 (excluded)", gme.body.developer === true && gme.body.staffDevice === true, JSON.stringify(gme));
  const ome = (await gcall("me", "other-guest-0001")).body;
  check("other guest still ranked normally", ome.stageRank >= 1 && !ome.developer && ome.stage === 7, JSON.stringify(ome));
  const readd = admin("devices", "add", "gphone-0000-3333");
  check("devices add again on a registered device: OK message, nothing left to purge", readd.includes("이미 등록된 기기예요") && !readd.includes("지웠어요") && admin("devices").includes("3/3대"), readd);
  const shopIt = I.generate("devrun|shop|d9|r5|s0", "golden", 9);
  const devS = await call("market_list", DEV, { item: ref(shopIt), gold: 100, cash: shopIt.rarity === "legendary" || shopIt.rarity === "set" ? 1 : 0, stage: 75 });
  const shopIt2 = I.generate("userrun|shop|d9|r5|s0", "golden", 9);
  const userS = await call("market_list", A, { item: ref(shopIt2), gold: 100, cash: 1, stage: 75 });
  check("server: shop seed |r5| accepted for operator only", devS.status === 200 && userS.body?.error === "bad_item", JSON.stringify([devS.body, userS.body]));
} finally { php.kill(); }
check("no php errors", !/Fatal|Warning|Notice|Deprecated/.test(phpErr), phpErr.slice(0, 400));
const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
