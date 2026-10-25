// 점프 던전 (dc#82~83, 시험판): 로비 왼쪽 아래 "점프 던전" 문으로 들어가 옆에서 보는 사냥 맵 (1층, 몬스터 10마리)
// 들어가기·← → 이동·Space 점프·나무 발판, 닿으면 자동으로 싸움 → 다 잡으면 포탈 → 포탈에 닿으면 클리어·최고 기록, 쓰러지면 처음부터(판에는 영향 없음)
// R 다시, Esc로 로비(문 앞), 휴대폰 버튼. 움직임·싸움은 시험 때만 작은 맵으로 바꿔 끼워 진짜 키로 확인 (큰 맵을 다닐 수 있는지는 tower-test.mjs가 물리로)
import { createRequire } from "node:module";
import fs from "node:fs"; import path from "node:path";
const require = createRequire(process.env.NODE_PATH + "/");
const { chromium, devices } = require("playwright");
const REPO = process.argv[2], OUT = process.argv[3];
const ORIGIN = "https://game.apacimtest.com/";
const results = []; const check = (n, ok, x = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x && !ok ? " — " + x : ""}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const save = (run = {}) => JSON.stringify({ v: 1, best: 3, run: { d: 3, hp: 500, mh: 500, a: 5, g: 10, p: 1, l: 5, x: 0, xn: 1e9, rid: "tower-run", k: 0, pp: 0, ...run } });
// 3층 빈 방 (포탈 P로 로비에 나오면 로비 포탈 바로 위 (16,13)에 서서, 걸어갈 길이 늘 같음)
const MAP_W = 32, MAP_H = 24;
const level = () => JSON.stringify({ rid: "tower-run", d: 3, turn: 3, map: Array.from({ length: MAP_H }, (_, y) => Array.from({ length: MAP_W }, (_, x) => (x < 2 || y < 2 || x > 14 || y > 10 ? 0 : 1)).join("")).join(""), seen: "1".repeat(MAP_W * MAP_H), px: 5, py: 5, shop: null, enemies: [], items: [] });
// 시험용 작은 맵: 움직임(몬스터 없음, 바닥 2칸 위 나무 발판) / 싸움(몬스터 한 마리, 오른쪽 벽 앞에 포탈: 끝까지 달리면 몬스터가 다가와 싸우고, 잡으면 발밑에 포탈)
const MAPS = {
  move: ["############", "#..........#", "#..........#", "#..........#", "#..........#", "#..====....#", "#S.........#", "############"],
  fight: ["##########", "#........#", "#........#", "#S..m...P#", "##########"],
};

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
// staff: 가짜 서버가 로비 응답에서 운영자 기기(unlimited)라고 알려 줌
const API = "https://api.test/api.php";
async function open({ opts = { viewport: { width: 1100, height: 1000 } }, map = null, run = {}, staff = false } = {}) {
  const ctx = await browser.newContext(opts); const page = await ctx.newPage(); const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await ctx.route(ORIGIN + "**", r => { const f = new URL(r.request().url()).pathname.slice(1) || "index.html";
    if (f === "ranking-config.js") return r.fulfill({ contentType: "text/javascript", body: `window.RANKING_API = "${staff ? API : ""}";` });
    const p = path.join(REPO, f); if (!fs.existsSync(p)) return r.fulfill({ status: 404, body: "" });
    let body = fs.readFileSync(p);
    if (map && f === "jump.js") {
      const src = body.toString(), from = 'hunt1: { name: "사냥터 1층", depth: 1, rows: HUNT1 }';
      if (!src.includes(from)) throw new Error("map line moved");
      // stale: 예전(점프 탑) jump.js가 캐시에 남은 경우 — hunt1 맵이 없음
      body = src.replace(from, map === "stale" ? 'tower1: { name: "t", rows: HUNT1 }' : `hunt1: { name: "t", depth: 1, rows: ${JSON.stringify(MAPS[map])} }`);
    }
    r.fulfill({ contentType: { ".js": "text/javascript", ".png": "image/png", ".webp": "image/webp" }[path.extname(f)] || "text/html", body }); });
  await ctx.route(API + "**", r => { const route = new URL(r.request().url()).searchParams.get("r");
    if (route === "lobby") return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ me: { id: "g-staff", staff: true, unlimited: true }, players: [], mail: 0 }) });
    r.fulfill({ status: 404, contentType: "application/json", body: "{}" }); });
  await ctx.route("https://login.xsolla.com/**", r => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await ctx.addInitScript(([s, l]) => { if (sessionStorage.getItem("seeded")) return; sessionStorage.setItem("seeded", 1); sessionStorage.setItem("rl_scene", "dungeon");
    localStorage.setItem("rl_device_id", "tower-dev-0001"); localStorage.setItem("rl_save", s); localStorage.setItem("rl_level", l);
    for (const k of ["rl_notice_1025a"]) localStorage.setItem(k, "1");
    window.__log = []; document.addEventListener("DOMContentLoaded", () => new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => window.__log.push(n.textContent)))).observe(document.getElementById("log"), { childList: true })); }, [save(run), level()]);
  await page.goto(ORIGIN); await sleep(800);
  return { ctx, page, errors };
}
const logs = (page) => page.evaluate(() => window.__log.join("\n"));
const press = async (page, key, n = 1) => { for (let i = 0; i < n; i++) { await page.keyboard.press(key); await sleep(70); } };
// 던전에서 포탈(P) → 로비 (16,13). 포탈을 피해 왼쪽 1 → 아래 4 → 왼쪽 10 → 아래 2 = 점프 던전 문(5,19)
const walkIn = async (page) => { await press(page, "p"); await sleep(300); await press(page, "ArrowLeft"); await press(page, "ArrowDown", 4); await press(page, "ArrowLeft", 10); await press(page, "ArrowDown", 2); await sleep(200); };
// 살색(밝은 쪽) 픽셀 무게중심 (화면 칸 = 캔버스 64px: 20 × 1.6 × 2배). 나무 발판의 갈색은 안 셈
const skin = (page) => page.evaluate(() => {
  const c = document.getElementById("game"), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
  let n = 0, sx = 0, sy = 0;
  for (let i = 0; i < d.length; i += 4) { const r = d[i], g = d[i + 1], b = d[i + 2]; if (r > 240 && g > 170 && g < 195 && b > 130 && b < 160) { n++; sx += (i / 4) % c.width; sy += Math.floor(i / 4 / c.width); } }
  return n ? { n, x: sx / n / 64, y: sy / n / 64 } : null;
});
const scene = (page) => page.evaluate(() => [document.body.classList.contains("in-tower"), document.body.classList.contains("in-lobby")]);
const hold = async (page, key, ms) => { await page.keyboard.down(key); await sleep(ms); await page.keyboard.up(key); };

try {
  // ---- 진짜 맵: 들어가기, 나가기 ----
  let { ctx, page, errors } = await open();
  await walkIn(page);
  check("walking into the door enters the jump dungeon floor 1 (scene, log says 10 monsters)", (await scene(page))[0] && (await logs(page)).includes("점프 던전 1층에 들어왔다. 몬스터 10마리를 모두 잡으면 포탈이 열린다"), JSON.stringify([await scene(page), (await logs(page)).slice(-200)]));
  check("hides the potion and map buttons", await page.evaluate(() => ["tp-potion", "map-btn"].every(id => { const e = document.getElementById(id); return !e || !e.offsetParent; })));
  await sleep(1500);
  await page.screenshot({ path: path.join(OUT, "tower.png") });
  check("real map: no page errors while monsters walk around", errors.length === 0, errors.join("; "));
  await press(page, "Escape"); await sleep(250);
  check("Esc: back to the lobby", (await scene(page)).join() === "false,true");
  await press(page, "ArrowDown"); await sleep(200);
  check("lobby position after leaving = in front of the door (↓ enters again)", (await scene(page))[0]);
  await press(page, "Escape"); await sleep(150);
  await page.reload(); await sleep(800);
  check("reload never resumes inside (lobby)", (await scene(page)).join() === "false,true");
  await ctx.close();

  // ---- 움직임 (몬스터 없는 작은 맵) ----
  ({ ctx, page, errors } = await open({ map: "move" }));
  await walkIn(page); await sleep(300);
  const s0 = await skin(page);
  await hold(page, "ArrowRight", 450); await sleep(400);
  const s1 = await skin(page);
  check("hold → : runs right (about 2~4 tiles in 0.45 s), stops after release", s0 && s1 && s1.x - s0.x > 1.5 && s1.x - s0.x < 4.5 && Math.abs(s1.y - s0.y) < 0.1, JSON.stringify({ s0, s1 }));
  // 발판(x3-6) 오른쪽 밖(x≈8.5)으로 더 가서 제자리 점프
  await hold(page, "ArrowRight", 380); await sleep(400);
  const g0 = await skin(page);
  await page.keyboard.down(" "); await sleep(250);
  const air = await skin(page);
  await page.keyboard.up(" "); await sleep(900);
  const back = await skin(page);
  check("Space: jumps up (body ≥ 2 tiles higher mid-air), lands back on the floor", g0 && air && back && back.y - air.y > 2 && Math.abs(back.y - g0.y) < 0.1, JSON.stringify({ g0, air, back }));
  // 더블 점프: 꾹(0.25초) → 떼고 → 공중에서 다시 꾹. 0.48초 때 몸이 한 번 뛴 것보다 1칸 넘게 더 높이
  const dj = await page.evaluate(() => new Promise(done => {
    const f = (type) => window.dispatchEvent(new KeyboardEvent(type, { key: " ", bubbles: true }));
    const skinNow = () => { const c = document.getElementById("game"), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0, sy = 0;
      for (let i = 0; i < d.length; i += 4) { const r = d[i], g = d[i + 1], b = d[i + 2]; if (r > 240 && g > 170 && g < 195 && b > 130 && b < 160) { n++; sy += Math.floor(i / 4 / c.width); } } return n ? sy / n / 64 : null; };
    f("keydown"); setTimeout(() => f("keyup"), 250); setTimeout(() => f("keydown"), 280);
    setTimeout(() => { const y = skinNow(); f("keyup"); done(y); }, 480);
  }));
  await sleep(1200);
  check("double jump: a second Space in the air lifts the body > 1 tile above a single jump", dj != null && air.y - dj > 1 && Math.abs((await skin(page)).y - g0.y) < 0.1, JSON.stringify({ single: air.y, double: dj, ground: g0.y }));
  await press(page, "r"); await sleep(250);
  const r0 = await skin(page);
  check("R restarts at the start", r0 && Math.abs(r0.x - s0.x) < 0.1 && Math.abs(r0.y - s0.y) < 0.1, JSON.stringify({ s0, r0 }));
  await hold(page, "ArrowRight", 220);
  await page.keyboard.down(" "); await sleep(400); await page.keyboard.up(" "); await sleep(800);
  const onPlank = await skin(page);
  check("jump up through the wooden plank and stand on it (2 tiles up)", onPlank && Math.abs(r0.y - onPlank.y - 2) < 0.1, JSON.stringify({ r0, onPlank }));
  await hold(page, "ArrowDown", 400); await sleep(300);
  const dropped = await skin(page);
  check("↓ drops back through the plank", dropped && Math.abs(dropped.y - r0.y) < 0.15, JSON.stringify({ r0, dropped }));
  check("move map: no page errors", errors.length === 0, errors.join("; "));
  await ctx.close();

  // ---- 싸움: 닿으면 자동 공격 → 다 잡으면 포탈 → 포탈에 닿으면 클리어 ----
  ({ ctx, page, errors } = await open({ map: "fight" }));
  const before = await page.evaluate(() => localStorage.getItem("rl_save"));
  await walkIn(page);
  await page.keyboard.down("ArrowRight"); await sleep(5000); await page.keyboard.up("ArrowRight"); await sleep(300);
  let L = await logs(page);
  check("touching the monster fights it automatically (kill log, 0 left)", /처치! \(남은 몬스터 0마리\)/.test(L), L.slice(-300));
  check("all monsters down → the portal opens", L.includes("몬스터를 모두 잡았다! 포탈이 열렸다."));
  const m = L.match(/점프 던전 1층 클리어! ([\d.]+)초 \(새 최고 기록!\)/);
  const best = await page.evaluate(() => Object.entries(localStorage).find(([k]) => k.startsWith("rl_hunt_best:")));
  check("walking into the open portal clears the floor: time + new best saved per device", m && best && best[0].endsWith(":hunt1") && Math.abs(Number(best[1]) - Number(m[1])) < 0.11, JSON.stringify([L.slice(-200), best]));
  await page.screenshot({ path: path.join(OUT, "tower-clear.png") });
  check("the run save is untouched by the side-view floor (no gold/xp/hp change)", await page.evaluate(() => JSON.parse(localStorage.getItem("rl_save")).run.g) === JSON.parse(before).run.g);
  await press(page, "Enter"); await sleep(300);
  await page.keyboard.down("ArrowRight"); await sleep(5000); await page.keyboard.up("ArrowRight"); await sleep(300);
  L = await logs(page);
  check("Enter after a clear starts the floor again: the monster is back and the floor clears again", (L.match(/남은 몬스터 0마리/g) || []).length === 2 && (L.match(/점프 던전 1층 클리어!/g) || []).length === 2, L.slice(-300));
  check("fight map: no page errors", errors.length === 0, errors.join("; "));
  await ctx.close();

  // ---- 쓰러지면 처음부터 (HP 1) ----
  ({ ctx, page, errors } = await open({ map: "fight", run: { hp: 1, mh: 1, a: 0 } }));
  await walkIn(page);
  await hold(page, "ArrowRight", 2500); await sleep(300);
  L = await logs(page);
  check("knocked out: the floor restarts with full HP (log), no game over", L.includes("쓰러졌다! 점프 던전 1층을 처음부터 다시 시작한다") && !(await page.locator("#death-modal").isVisible().catch(() => false)), L.slice(-300));
  check("knock-out: no page errors", errors.length === 0, errors.join("; "));
  await ctx.close();

  // ---- 운영자: 점프 던전 오른쪽 위 모서리(7,19)에 헬 50층 문. 다른 사람에게는 벽 ----
  ({ ctx, page, errors } = await open());
  await press(page, "p"); await sleep(300); await press(page, "ArrowLeft"); await press(page, "ArrowDown", 4); await press(page, "ArrowLeft", 8); await press(page, "ArrowDown", 2); await sleep(200);
  check("not staff: the corner (7,19) is a wall (stays in the lobby)", (await scene(page)).join() === "false,true" && !(await logs(page)).includes("헬 50층"));
  await ctx.close();
  ({ ctx, page, errors } = await open({ staff: true }));
  await sleep(1500);
  await press(page, "p"); await sleep(1300); await press(page, "ArrowLeft"); await press(page, "ArrowDown", 4); await press(page, "ArrowLeft", 8); await press(page, "ArrowDown", 2); await sleep(300);
  L = await logs(page);
  check("staff: the corner door enters the jump dungeon with hell 50 monsters", (await scene(page))[0] && L.includes("점프 던전 헬 50층에 들어왔다. 몬스터 10마리를 모두 잡으면 포탈이 열린다"), JSON.stringify([await scene(page), L.slice(-300)]));
  await sleep(1200);
  await page.screenshot({ path: path.join(OUT, "tower-hell50.png") });
  // 맨몸으로 헬 50층 몬스터에게 닿으면 금방 쓰러지고 처음부터 (판은 그대로)
  await hold(page, "ArrowRight", 6000); await sleep(300);
  L = await logs(page);
  check("staff hell 50: monsters are hell-strong (a naked character is knocked out and the floor restarts)", L.includes("쓰러졌다! 점프 던전 헬 50층을 처음부터 다시 시작한다"), L.slice(-300));
  await press(page, "Escape"); await sleep(300);
  check("staff: leaving puts you in front of the hell door (7,18)", (await scene(page)).join() === "false,true");
  await page.locator("#game").screenshot({ path: path.join(OUT, "tower-hell-door.png") });
  await press(page, "ArrowDown"); await sleep(300);
  check("staff: ↓ from there enters the hell floor again", (await scene(page))[0] && ((await logs(page)).match(/헬 50층에 들어왔다/g) || []).length === 2);
  check("staff: no page errors", errors.length === 0, errors.join("; "));
  await ctx.close();

  // ---- 예전 jump.js가 캐시에 남았을 때: 들어가지 않고 새로고침 안내 (오류 없음) ----
  ({ ctx, page, errors } = await open({ map: "stale" }));
  await walkIn(page);
  check("stale cached jump.js: stays in the lobby with a refresh notice, no page error", (await scene(page)).join() === "false,true" && (await logs(page)).includes("점프 던전을 불러오지 못했어요. 페이지를 새로고침해 주세요.") && errors.length === 0, JSON.stringify([await scene(page), errors]));
  check("the page asks for a versioned jump.js (a new page never pairs with an old cached copy)", await page.evaluate(() => [...document.scripts].some(s => /jump\.js\?v=\d+/.test(s.src))));
  await ctx.close();

  // ---- 휴대폰: 방향 버튼 누르고 있기로 싸우고 포탈까지, 점프 버튼, 포탈 = 나가기 ----
  ({ ctx, page, errors } = await open({ opts: { ...devices["iPhone 13"] }, map: "fight" }));
  await walkIn(page);
  check("phone: entered by walking with the d-pad keys", (await scene(page))[0]);
  check("phone: jump button says 점프, buttons fit on screen", (await page.locator("#tp-jump").innerText()) === "점프" && await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && [...document.querySelectorAll("#touch-pad button")].every(b => !b.offsetParent || b.getBoundingClientRect().right <= innerWidth)));
  const right = page.locator('#touch-pad [data-dir="1,0"]');
  await right.dispatchEvent("pointerdown"); await sleep(5000); await right.dispatchEvent("pointerup"); await sleep(200);
  check("phone: holding ▶ fights through and clears", (await logs(page)).includes("점프 던전 1층 클리어!"));
  await page.locator("#tp-jump").dispatchEvent("pointerdown"); await page.locator("#tp-jump").dispatchEvent("pointerup"); await sleep(150);
  const sk = await skin(page);
  check("phone: jump button after a clear restarts at the start", sk && sk.x < 2.2, JSON.stringify(sk));
  await page.locator("#tp-portal").tap(); await sleep(250);
  check("phone: portal button leaves", (await scene(page)).join() === "false,true");
  check("phone: no page errors", errors.length === 0, errors.join("; "));
  await ctx.close();
} finally {
  await browser.close();
}
console.log(`${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
