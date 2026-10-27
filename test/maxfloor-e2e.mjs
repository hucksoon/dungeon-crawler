// 최대 층 50 (dc#98, 예전 75): 보스 뒤 계단 = 일반 던전 완료 → 같은 층 새 구역, 랭킹 "50층 완료", 예전 장비 안내 (한 번)
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import fs from "node:fs"; import path from "node:path";
const require = createRequire(process.env.NODE_PATH + "/");
const { chromium, devices } = require("playwright");
const REPO = process.argv[2], OUT = process.argv[3];
const I = createRequire(import.meta.url)(path.join(REPO, "items.js"));
// 서버는 아이템 값만 보냄 (dc#97): 참조로 다시 만든 이름 (서버가 이름 글자를 보내면 실패)
const nameOf = (v) => (v?.ref && !("name" in v) ? I.itemName(I.fromRef(v.ref, { gems: true })) : null);
const M = createRequire(import.meta.url)(path.join(REPO, "monsters.js"));
const ORIGIN = "https://game.apacimtest.com/", API = "https://api.test/api.php";
const results = []; const check = (n, ok, x = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x && !ok ? " — " + x : ""}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
check("MAX_FLOOR 50, CLEAR_STAGE 51, monster level ×1.5 up to 75", M.MAX_FLOOR === 50 && M.CLEAR_STAGE === 51 && M.effLevel(50) === 75 && M.effLevel(10) === 15 && M.effLevel(1) === 2);

// PHP 서버 (게임·랭킹 화면의 API 호출을 여기로 넘김)
const DIR = path.dirname(new URL(import.meta.url).pathname) + "/php";
const DB = path.join(DIR, "maxfloor.sqlite"); for (const f of [DB, DB + "-wal", DB + "-shm"]) fs.rmSync(f, { force: true });
fs.writeFileSync(path.join(DIR, "config.maxfloor.php"), `<?php\n$c = require __DIR__ . '/config.test.php';\nreturn array_merge($c, ['db_dsn' => 'sqlite:${DB}']);\n`);
const php = spawn("php", ["-S", "127.0.0.1:8096", "-t", path.join(REPO, "ranking-php")], { env: { ...process.env, RANKING_CONFIG: path.join(DIR, "config.maxfloor.php"), TEST_JWT_SECRET: "mf-secret" }, stdio: ["ignore", "ignore", "pipe"] });
let phpErr = ""; php.stderr.on("data", d => phpErr += d);
await sleep(700);

const MAP_W = 32, MAP_H = 24;
const map = Array.from({ length: MAP_H }, (_, y) => Array.from({ length: MAP_W }, (_, x) => (x === 0 || y === 0 || x === MAP_W - 1 || y === MAP_H - 1 ? 0 : 1)));
map[10][11] = 2;  // 플레이어 오른쪽이 계단
const level = (d, rid) => JSON.stringify({ rid, d, turn: 0, map: map.map(r => r.join("")).join(""), seen: "1".repeat(MAP_W * MAP_H), px: 10, py: 10, shop: null, enemies: [], items: [] });
const save = (d, rid, extra = {}) => JSON.stringify({ v: 1, f50: 1, season: 4, best: d, ...extra, run: { d, hp: 900000, mh: 900000, a: 30, g: 100, p: 3, l: 30, x: 0, xn: 1e9, rid, k: 0, pp: 0 } });
const v4item = I.generate("mf4|shop|d20|s1", "golden", 20);
const v3item = I.generate("mf3|shop|d20|s2", "golden", 20, 3);
const emptyEq = () => Object.fromEntries(I.SLOTS.map(s => [s, null]));

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
async function open({ dev, sv, lv, inv, scene = "dungeon", device }) {
  const ctx = await browser.newContext(device ? { ...devices[device] } : { viewport: { width: 1100, height: 1000 } }); const page = await ctx.newPage(); const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("dialog", d => d.accept());
  await ctx.route(ORIGIN + "**", r => { const f = new URL(r.request().url()).pathname.slice(1) || "index.html";
    if (f === "ranking-config.js") return r.fulfill({ contentType: "text/javascript", body: `window.RANKING_API = "${API}";` });
    const p = path.join(REPO, f); if (!fs.existsSync(p)) return r.fulfill({ status: 404, body: "" });
    r.fulfill({ contentType: f.endsWith(".js") ? "text/javascript" : "text/html", body: fs.readFileSync(p) }); });
  await ctx.route("https://api.test/**", async r => {
    const req = r.request(), u = new URL(req.url());
    const res = await fetch(`http://127.0.0.1:8096/api.php${u.search}`, { method: req.method(), headers: { ...req.headers(), origin: ORIGIN.slice(0, -1) }, body: req.method() === "GET" ? undefined : req.postData() });
    r.fulfill({ status: res.status, headers: { "content-type": "application/json", "access-control-allow-origin": "*" }, body: await res.text() });
  });
  await ctx.route("https://login.xsolla.com/**", r => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await ctx.route("https://pagead2.googlesyndication.com/**", r => r.fulfill({ status: 200, contentType: "text/javascript", body: "" }));
  await ctx.addInitScript(([s, l, inv, dev, scene]) => { if (sessionStorage.getItem("seeded")) return; sessionStorage.setItem("seeded", 1); sessionStorage.setItem("rl_scene", scene);
    localStorage.setItem("rl_device_id", dev); if (s) localStorage.setItem("rl_save", s); if (l) localStorage.setItem("rl_level", l); if (inv) localStorage.setItem(`rl_inv:g:${dev}`, inv);
    window.__log = []; document.addEventListener("DOMContentLoaded", () => new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => window.__log.push(n.textContent)))).observe(document.getElementById("log"), { childList: true })); },
    [sv, lv, inv ? JSON.stringify(inv) : null, dev, scene]);
  await page.goto(ORIGIN); await page.waitForTimeout(500);
  return { ctx, page, errors };
}
const logs = (page) => page.evaluate(() => window.__log.join("\n"));
const stored = (page, k) => page.evaluate(k => JSON.parse(localStorage.getItem(k) || "null"), k);
const noticeOpen = (page) => page.locator("#notice-modal").isVisible();

try {
  // 1. 49층 계단 → 50층, "마지막 층" 안내
  let { ctx, page, errors } = await open({ dev: "mf-dev-a", sv: save(49, "mfrun1"), lv: level(49, "mfrun1"), inv: { bag: [v4item], equip: emptyEq(), log: [], stones: 0 } });
  check("v4-only bag: no legacy notice", !(await noticeOpen(page)));
  await page.keyboard.press("ArrowRight"); await sleep(250);
  check("49 → 50 with last-floor message", (await page.locator("#depth").innerText()) === "50" && (await logs(page)).includes("마지막 층이다!"), await logs(page));
  const L75 = await stored(page, "rl_level");
  check("floor 50 has a boss guarding the stairs", L75.d === 50 && L75.enemies.some(e => e.kind === "boss"));
  await ctx.close();

  // 2. 50층 보스 처치 후 계단 → 완료 안내 창과 함께 로비로, 포탈 문 = 50층 새 구역, 저장 clr, 랭킹 51
  ({ ctx, page, errors } = await open({ dev: "mf-dev-a", sv: save(50, "mfrun1"), lv: level(50, "mfrun1"), inv: { bag: [v4item], equip: emptyEq(), log: [], stones: 0 } }));
  await page.keyboard.press("ArrowRight"); await sleep(300);
  const inLobby = () => page.evaluate(() => document.body.classList.contains("in-lobby"));
  check("stairs on 50 → 일반 던전 완료 log and back in the lobby (no boss warning)", !(await logs(page)).includes("계단을 지키고") && (await logs(page)).includes("일반 던전 완료!") && await inLobby() && (await logs(page)).includes("파란 포탈로 50층의 새 구역"), await logs(page));
  check("completion notice shown (mentions the blue portal)", await noticeOpen(page) && (await page.locator("#notice-title").innerText()) === "일반 던전 완료!" && (await page.locator("#notice-body").innerText()).includes("파란 포탈"));
  await page.screenshot({ path: path.join(OUT, "clear-lobby.png") });
  check("best shows 완료", (await page.locator("#best").innerText()) === "50 완료", await page.locator("#best").innerText());
  const sv2 = await stored(page, "rl_save"), L2 = await stored(page, "rl_level");
  check("save has clr:1, run kept on 50 (portal floor), f50 mark", sv2.clr === 1 && sv2.run?.d === 50 && sv2.best === 50 && sv2.f50 === 1, JSON.stringify(sv2));
  check("portal floor is a new area of 50 with a new boss", L2.d === 50 && L2.enemies.some(e => e.kind === "boss") && L2.map !== level(50, "x").match(/"map":"(\d+)"/)[1]);
  await page.keyboard.press("Enter"); await sleep(100);
  check("notice closes with Enter", !(await noticeOpen(page)));
  await sleep(3500);  // 랭킹은 3초 모았다가 보냄
  const rk = await (await fetch("http://127.0.0.1:8096/api.php?r=ranking&type=stage", { headers: { Origin: ORIGIN.slice(0, -1) } })).json();
  check("server ranking stores 51 (= 50층 완료)", rk.rows?.[0]?.stage === 51, JSON.stringify(rk.rows?.slice(0, 2)));
  // 로비에서 바로 위가 포탈 문: 들어가면 그 새 구역
  await page.keyboard.press("ArrowUp"); await sleep(300);  // 마을 파란 포탈 문 앞에서 ↑
  const L3 = await stored(page, "rl_level");
  check("lobby portal → floor 50 new area (same map as saved)", !(await inLobby()) && (await page.locator("#depth").innerText()) === "50" && (await logs(page)).includes("포탈을 타고 50층의 떠난 자리로 돌아왔다") && L3.map === L2.map, await logs(page));
  check("no page errors (complete)", errors.length === 0, errors.join("; "));
  await ctx.close();

  // 3. 이미 완료한 사람: 또 클리어 → 짧은 안내 창과 함께 로비로
  ({ ctx, page, errors } = await open({ dev: "mf-dev-a2", sv: save(50, "mfrun2", { clr: 1 }), lv: level(50, "mfrun2"), inv: { bag: [], equip: emptyEq(), log: [], stones: 0 } }));
  await page.keyboard.press("ArrowRight"); await sleep(300);
  check("repeat clear: lobby with '50층 클리어!' notice", await page.evaluate(() => document.body.classList.contains("in-lobby")) && await noticeOpen(page) && (await page.locator("#notice-title").innerText()) === "50층 클리어!");
  check("no page errors (repeat)", errors.length === 0, errors.join("; "));
  await ctx.close();

  // 4. 최대 층 전에 더 내려갔던 판(80층) → 50층으로
  ({ ctx, page, errors } = await open({ dev: "mf-dev-b", sv: JSON.stringify({ v: 1, f50: 1, best: 85, run: { d: 80, hp: 9000, mh: 9000, a: 30, g: 100, p: 3, l: 30, x: 0, xn: 1e9, rid: "mfrun3", k: 0, pp: 0 } }), lv: level(80, "mfrun3"), inv: null }));
  check("old-season run on 80 resumes on 50; v4 best starts fresh (-)", (await page.locator("#depth").innerText()) === "50" && (await page.locator("#best").innerText()) === "-", `${await page.locator("#depth").innerText()} / ${await page.locator("#best").innerText()}`);
  check("no page errors (clamp)", errors.length === 0, errors.join("; "));
  await ctx.close();

  // 5. 예전(v3) 장비가 있으면 안내 한 번 (로비에서), 인벤토리에도 안내
  const eq = emptyEq(); eq[v3item.slot] = v3item;
  ({ ctx, page, errors } = await open({ dev: "mf-dev-c", sv: save(40, "mfrun4"), lv: level(40, "mfrun4"), inv: { bag: [v4item, { ...I.generate("mf2|d3|k1", "drop", 3, 2) }], equip: eq, log: [], stones: 0 }, scene: "lobby" }));
  check("legacy notice shown in lobby", await noticeOpen(page));
  const body = await page.locator("#notice-body").innerText();
  check("notice: 50층, v4, old gear count 2, 다시 파밍 권장", body.includes("50층까지") && body.includes("v4") && body.includes("예전 장비 2개") && body.includes("다시 파밍하는 걸 권장"), body);
  await page.screenshot({ path: path.join(OUT, "legacy-notice.png") });
  await page.locator("#notice-ok").click(); await sleep(100);
  check("notice closes with 확인", !(await noticeOpen(page)));
  await page.reload(); await sleep(500);
  check("not shown again after reload", !(await noticeOpen(page)));
  await page.keyboard.press("i"); await sleep(200);
  check("inventory summary: old gear hint", (await page.locator("#inv-summary").innerText()).includes("예전 규칙 장비 1개 착용 중"));
  check("no page errors (legacy)", errors.length === 0, errors.join("; "));
  await ctx.close();

  // 6. 휴대폰: 안내 창이 화면 안에 들어오고 확인 버튼을 누를 수 있음
  ({ ctx, page, errors } = await open({ dev: "mf-dev-d", sv: save(40, "mfrun5"), lv: level(40, "mfrun5"), inv: { bag: [v3item], equip: emptyEq(), log: [], stones: 0 }, scene: "lobby", device: "iPhone 13" }));
  const box = await page.locator("#notice-modal .modal").boundingBox(), vw = page.viewportSize();
  check("phone: notice fits the screen", box && box.x >= 0 && box.x + box.width <= vw.width && box.y + box.height <= vw.height, JSON.stringify(box));
  await page.screenshot({ path: path.join(OUT, "legacy-notice-phone.png") });
  await page.locator("#notice-ok").tap(); await sleep(100);
  check("phone: 확인 tap closes", !(await noticeOpen(page)));
  await ctx.close();

  // 7. 랭킹 화면: 버전 표시, 정식 v1(기본) "50층 완료 ✓", 클로즈 베타 탭에 예전 기록 그대로
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(DB);
  db.prepare("INSERT INTO players (pkey, pub_id, kind, display, best_stage, stage_at, item_score, updated_at) VALUES (?, ?, 'guest', ?, 172, 1000, -1, 1000)").run("old172", "0123456789abcdef", "게스트 #old172");
  db.close();
  ({ ctx, page, errors } = await open({ dev: "mf-dev-e", sv: null, lv: null, inv: null, scene: "lobby" }));
  await page.goto(ORIGIN + "ranking.html"); await sleep(800);
  const board = await page.locator("#board-stage").innerText();
  check("ranking page: version badge 정식 v1, tabs v4/nm/hell/v3", (await page.locator("#ver").innerText()) === "정식 v1" && (await page.locator("#seasons button").count()) === 4 && (await page.locator("#seasons button", { hasText: "헬" }).count()) === 1 && (await page.locator('#seasons button[aria-selected="true"]').innerText()).startsWith("정식 v1"));
  check("v1 tab (default) shows 50층 완료 ✓ and not the old 172 record", board.includes("50층 완료 ✓") && !board.includes("old172"), board);
  await page.screenshot({ path: path.join(OUT, "ranking-clear.png") });
  await page.locator("#seasons button", { hasText: "클로즈 베타" }).click(); await sleep(600);
  const b3 = await page.locator("#board-stage").innerText();
  check("v3 tab: old 172 record as-is, final-record subtitle, #v3 in URL", b3.includes("게스트 #old172") && b3.includes("172층") && (await page.locator("#sub-stage").innerText()).includes("최종 랭킹") && page.url().endsWith("#v3"), b3);
  await page.locator("#board-stage li", { hasText: "old172" }).click(); await sleep(500);
  check("v3 player view: 최고 172층, title marks 클로즈 베타", (await page.locator("#player-meta").innerText()).includes("최고 172층") && (await page.locator("#player-title").innerText()).includes("클로즈 베타"), await page.locator("#player-meta").innerText());
  await page.keyboard.press("Escape");
  await page.screenshot({ path: path.join(OUT, "ranking-v3.png") });
  await page.reload(); await sleep(700);
  check("reload with #v3 opens the v3 tab", (await page.locator('#seasons button[aria-selected="true"]').innerText()).startsWith("클로즈 베타"));
  check("no page errors (ranking)", errors.length === 0, errors.join("; "));
  await ctx.close();
} finally { await browser.close(); }

// 8. 서버: 예전 화면(fl 없음 = 75층 기준)이 80층을 보내도 76 → 50층 기준 51로
const g = (body, guest) => fetch("http://127.0.0.1:8096/api.php?r=score", { method: "POST", headers: { "Content-Type": "application/json", Origin: ORIGIN.slice(0, -1), "X-Guest-Id": guest }, body: JSON.stringify(body) }).then(r => r.json());
const r80 = await g({ stage: 80, plvl: 30, item: null, gear: [] }, "mf-guest-0160");
const rk2 = await (await fetch("http://127.0.0.1:8096/api.php?r=ranking&type=stage", { headers: { Origin: ORIGIN.slice(0, -1) } })).json();
check("server clamps old-format stage 80 → 51", r80.ok && rk2.rows.every(r => r.stage <= 51), JSON.stringify(rk2.rows.map(r => r.stage)));
// 9. 시즌: 예전(클로즈 베타) 기록은 그대로, 정식 v1은 따로
const getJ = (q) => fetch(`http://127.0.0.1:8096/api.php?${q}`, { headers: { Origin: ORIGIN.slice(0, -1) } }).then(r => r.json());
const v3 = await getJ("r=ranking&type=stage&season=v3"), v4 = await getJ("r=ranking&type=stage");
check("closed beta board keeps 172 untouched", v3.season === "v3" && v3.rows.length === 1 && v3.rows[0].stage === 172 && v3.rows[0].name === "게스트 #old172", JSON.stringify(v3.rows));
check("v1 board (default) has only v4 submissions, none above 51", v4.season === "v4" && v4.current && !v4.rows.some(r => r.name === "게스트 #old172") && v4.rows.every(r => r.stage <= 51), JSON.stringify(v4.rows.map(r => [r.name, r.stage])));
const pv3 = await getJ("r=player&id=0123456789abcdef&season=v3");
check("player lookup by season (v3)", pv3.stage === 172);
const pv4 = await fetch("http://127.0.0.1:8096/api.php?r=player&id=0123456789abcdef", { headers: { Origin: ORIGIN.slice(0, -1) } });
check("same player not in v4 → 404", pv4.status === 404);
// v4 아이템 랭킹은 v4 아이템만: 같은 사람이 v3 레전더리를 보내면 아이템 없음
const legV3 = I.generate("mfleg|shop|d20|s3", "golden", 20, 3);
const ref = (it) => ({ seed: it.seed, src: it.src, lvl: it.lvl, v: it.v, enh: 0, id: it.id });
await g({ stage: 20, plvl: 10, item: ref(legV3), gear: [ref(legV3)] }, "mf-guest-item3");
await g({ stage: 20, plvl: 10, item: ref(v4item), gear: [ref(v4item)] }, "mf-guest-item4");
const items4 = await getJ("r=ranking&type=item");
check("v4 item board: v4 item counted, v3 item not", items4.rows.some(r => nameOf(r.item) === I.itemName(v4item)) && !items4.rows.some(r => nameOf(r.item) === I.itemName(legV3)), JSON.stringify(items4.rows.map(r => nameOf(r.item))));
// 예전 시즌에 172층까지 간 사람의 깊은 층 아이템도 v4 기록의 장비로 인정 (아이템 레벨 검증은 모든 시즌 최고 층)
check("no php errors", !/Fatal|Warning|Notice|Deprecated/.test(phpErr), phpErr.slice(0, 400));
php.kill();
const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
