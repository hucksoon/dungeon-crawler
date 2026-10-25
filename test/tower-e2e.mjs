// 점프 탑 (dc#82, 시험판): 로비 왼쪽 아래 "점프 탑" 문으로 들어가 옆에서 보는 발판 맵
// 들어가기·← → 이동·Space 점프(공중에서 몸이 위로)·사다리, 깃발에 닿으면 클리어·최고 기록 저장, R 다시, Esc로 로비(탑 문 앞), 휴대폰 버튼
// 깃발까지 가는 건 시험 때만 작은 맵(시작 오른쪽에 깃발)으로 바꿔 끼워 진짜 키로 확인 (긴 맵을 깰 수 있는지는 tower-test.mjs가 물리로)
import { createRequire } from "node:module";
import fs from "node:fs"; import path from "node:path";
const require = createRequire(process.env.NODE_PATH + "/");
const { chromium, devices } = require("playwright");
const REPO = process.argv[2], OUT = process.argv[3];
const ORIGIN = "https://game.apacimtest.com/";
const results = []; const check = (n, ok, x = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x && !ok ? " — " + x : ""}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const save = () => JSON.stringify({ v: 1, best: 3, run: { d: 3, hp: 500, mh: 500, a: 5, g: 10, p: 1, l: 5, x: 0, xn: 1e9, rid: "tower-run", k: 0, pp: 0 } });
// 3층 빈 방 (포탈 P로 로비에 나오면 로비 포탈 바로 위 (16,13)에 서서, 걸어갈 길이 늘 같음)
const MAP_W = 32, MAP_H = 24;
const level = () => JSON.stringify({ rid: "tower-run", d: 3, turn: 3, map: Array.from({ length: MAP_H }, (_, y) => Array.from({ length: MAP_W }, (_, x) => (x < 2 || y < 2 || x > 14 || y > 10 ? 0 : 1)).join("")).join(""), seen: "1".repeat(MAP_W * MAP_H), px: 5, py: 5, shop: null, enemies: [], items: [] });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
async function open({ opts = { viewport: { width: 1100, height: 1000 } }, small = false } = {}) {
  const ctx = await browser.newContext(opts); const page = await ctx.newPage(); const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await ctx.route(ORIGIN + "**", r => { const f = new URL(r.request().url()).pathname.slice(1) || "index.html";
    if (f === "ranking-config.js") return r.fulfill({ contentType: "text/javascript", body: 'window.RANKING_API = "";' });
    const p = path.join(REPO, f); if (!fs.existsSync(p)) return r.fulfill({ status: 404, body: "" });
    let body = fs.readFileSync(p);
    // 작은 맵: 시작 3칸 오른쪽에 깃발
    if (small && f === "jump.js") body = body.toString().replace("const MAPS = { tower1: { name: \"점프 탑 1\", rows: TOWER1 } };",
      'const MAPS = { tower1: { name: "t", rows: ["##########", "#........#", "#........#", "#........#", "#S..G....#", "##########"] } };');
    r.fulfill({ contentType: { ".js": "text/javascript", ".png": "image/png", ".webp": "image/webp" }[path.extname(f)] || "text/html", body }); });
  await ctx.route("https://login.xsolla.com/**", r => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await ctx.addInitScript(([s, l]) => { if (sessionStorage.getItem("seeded")) return; sessionStorage.setItem("seeded", 1); sessionStorage.setItem("rl_scene", "dungeon");
    localStorage.setItem("rl_device_id", "tower-dev-0001"); localStorage.setItem("rl_save", s); localStorage.setItem("rl_level", l);
    for (const k of ["rl_notice_1025a"]) localStorage.setItem(k, "1");
    window.__log = []; document.addEventListener("DOMContentLoaded", () => new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => window.__log.push(n.textContent)))).observe(document.getElementById("log"), { childList: true })); }, [save(), level()]);
  await page.goto(ORIGIN); await sleep(800);
  return { ctx, page, errors };
}
const logs = (page) => page.evaluate(() => window.__log.join("\n"));
const press = async (page, key, n = 1) => { for (let i = 0; i < n; i++) { await page.keyboard.press(key); await sleep(70); } };
// 던전에서 포탈(P) → 로비 (16,13). 포탈을 피해 왼쪽 1 → 아래 4 → 왼쪽 10 → 아래 2 = 탑 문(5,19)
const walkToTower = async (page) => { await press(page, "p"); await sleep(300); await press(page, "ArrowLeft"); await press(page, "ArrowDown", 4); await press(page, "ArrowLeft", 10); await press(page, "ArrowDown", 2); await sleep(200); };
// 살색(밝은 쪽) 픽셀 무게중심 (화면 칸 = 캔버스 64px: 20 × 1.6 × 2배). 나무 발판의 갈색은 안 셈
const skin = (page) => page.evaluate(() => {
  const c = document.getElementById("game"), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
  let n = 0, sx = 0, sy = 0;
  for (let i = 0; i < d.length; i += 4) { const r = d[i], g = d[i + 1], b = d[i + 2]; if (r > 240 && g > 170 && g < 195 && b > 130 && b < 160) { n++; sx += (i / 4) % c.width; sy += Math.floor(i / 4 / c.width); } }
  return n ? { n, x: sx / n / 64, y: sy / n / 64 } : null;
});
const scene = (page) => page.evaluate(() => [document.body.classList.contains("in-tower"), document.body.classList.contains("in-lobby")]);

try {
  // ---- 로비에서 들어가기, 걷기·점프, 나가기 ----
  let { ctx, page, errors } = await open();
  await walkToTower(page);
  check("walking into the tower door enters the jump tower (scene, log)", (await scene(page))[0] && (await logs(page)).includes("점프 탑에 들어왔다"), JSON.stringify([await scene(page), (await logs(page)).slice(-200)]));
  check("tower hides the potion and map buttons", await page.evaluate(() => ["tp-potion", "map-btn"].every(id => { const e = document.getElementById(id); return !e || !e.offsetParent; })));
  await sleep(300);
  const s0 = await skin(page);
  await page.keyboard.down("ArrowRight"); await sleep(450); await page.keyboard.up("ArrowRight"); await sleep(400);
  const s1 = await skin(page);
  check("hold → : runs right (about 2~4 tiles in 0.45 s), stops after release", s0 && s1 && s1.x - s0.x > 1.5 && s1.x - s0.x < 4.5 && Math.abs(s1.y - s0.y) < 0.15, JSON.stringify({ s0, s1 }));
  await sleep(200); const s1b = await skin(page);
  check("released: stays put (friction)", s1b && Math.abs(s1b.x - s1.x) < 0.05, JSON.stringify({ s1, s1b }));
  // 점프는 머리 위에 발판이 없는 곳에서 (시작 근처 37줄 x3-6에 나무 발판): 오른쪽으로 더 달려 x≈10
  await page.keyboard.down("ArrowRight"); await sleep(700); await page.keyboard.up("ArrowRight"); await sleep(400);
  const g0 = await skin(page);
  await page.keyboard.down(" "); await sleep(250);
  const air = await skin(page);
  await page.keyboard.up(" "); await sleep(900);
  const back = await skin(page);
  check("Space: jumps up (body ≥ 2 tiles higher mid-air), lands back on the floor", g0 && air && back && back.y - air.y > 2 && Math.abs(back.y - g0.y) < 0.1 && Math.abs(g0.y - s0.y) < 0.1, JSON.stringify({ g0, air, back }));
  await page.keyboard.down(" "); await sleep(40); await page.keyboard.up(" "); await sleep(160);
  const tap = await skin(page); await sleep(900);
  check("short tap: lower jump than holding", tap && g0.y - tap.y > 0.2 && g0.y - tap.y < back.y - air.y, JSON.stringify({ tap, air }));
  // 나무 발판(37줄 x3-6): 시작(x2.5)에서 조금 달려 점프하면 뚫고 올라가 그 위에 섬 → 2칸 위
  await press(page, "r"); await sleep(250);
  const r0 = await skin(page);
  check("R restarts at the start", r0 && s0 && Math.abs(r0.x - s0.x) < 0.1 && Math.abs(r0.y - s0.y) < 0.1, JSON.stringify({ s0, r0 }));
  await page.keyboard.down("ArrowRight"); await sleep(170); await page.keyboard.up("ArrowRight");
  await page.keyboard.down(" "); await sleep(400); await page.keyboard.up(" "); await sleep(800);
  const onPlank = await skin(page);
  check("jump up through the wooden plank and stand on it (2 tiles up)", onPlank && Math.abs(r0.y - onPlank.y - 2) < 0.1, JSON.stringify({ r0, onPlank }));
  await page.keyboard.down("ArrowDown"); await sleep(400); await page.keyboard.up("ArrowDown"); await sleep(300);
  const dropped = await skin(page);
  check("↓ drops back through the plank", dropped && Math.abs(dropped.y - r0.y) < 0.2, JSON.stringify({ r0, dropped }));
  await page.screenshot({ path: path.join(OUT, "tower.png") });
  check("no page errors", errors.length === 0, errors.join("; "));
  await press(page, "Escape"); await sleep(250);
  const [inT, inL] = await scene(page);
  check("Esc: back to the lobby", !inT && inL);
  // 로비에서 탑 문 앞(5,18): 아래로 한 칸이면 다시 탑
  await press(page, "ArrowDown"); await sleep(200);
  check("lobby position after leaving = in front of the tower door (↓ enters again)", (await scene(page))[0]);
  await press(page, "Escape"); await sleep(150);
  await page.reload(); await sleep(800);
  check("reload never resumes inside the tower (lobby)", (await scene(page))[1] && !(await scene(page))[0]);
  await ctx.close();

  // ---- 클리어·최고 기록 (작은 맵) ----
  ({ ctx, page, errors } = await open({ small: true }));
  await walkToTower(page);
  await page.keyboard.down("ArrowRight"); await sleep(1200); await page.keyboard.up("ArrowRight"); await sleep(200);
  let L = await logs(page);
  const m = L.match(/점프 탑 클리어! ([\d.]+)초 \(새 최고 기록!\)/);
  const best = await page.evaluate(() => Object.entries(localStorage).find(([k]) => k.startsWith("rl_tower_best:")));
  check("touching the flag clears it: log with time + new best, best saved per device", m && best && best[0].endsWith(":tower1") && Math.abs(Number(best[1]) - Number(m[1])) < 0.11, JSON.stringify([L.slice(-200), best]));
  await page.screenshot({ path: path.join(OUT, "tower-clear.png") });
  // Enter: 다시. 이번엔 일부러 늦게 → 최고 기록 그대로
  await press(page, "Enter"); await sleep(600);
  await page.keyboard.down("ArrowRight"); await sleep(1200); await page.keyboard.up("ArrowRight"); await sleep(200);
  L = await logs(page);
  const best2 = await page.evaluate(() => Object.entries(localStorage).find(([k]) => k.startsWith("rl_tower_best:")));
  check("Enter restarts after a clear; a slower clear keeps the old best", (L.match(/점프 탑 클리어!/g) || []).length === 2 && !/클리어! [\d.]+초 \(새 최고 기록!\)[\s\S]*클리어! [\d.]+초 \(새/.test(L) && best2[1] === best[1], JSON.stringify([L.slice(-300), best, best2]));
  check("small map: no page errors", errors.length === 0, errors.join("; "));
  await ctx.close();

  // ---- 휴대폰: 방향 버튼 누르고 있기, 점프 버튼, 포탈 = 나가기 ----
  ({ ctx, page, errors } = await open({ opts: { ...devices["iPhone 13"] }, small: true }));
  await walkToTower(page);
  check("phone: entered the tower by walking with the d-pad keys", (await scene(page))[0]);
  check("phone: jump button says 점프, buttons fit on screen", (await page.locator("#tp-jump").innerText()) === "점프" && await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && [...document.querySelectorAll("#touch-pad button")].every(b => !b.offsetParent || b.getBoundingClientRect().right <= innerWidth)));
  const right = page.locator('#touch-pad [data-dir="1,0"]');
  await right.dispatchEvent("pointerdown"); await sleep(1200); await right.dispatchEvent("pointerup"); await sleep(200);
  check("phone: holding ▶ runs into the flag (clear)", (await logs(page)).includes("점프 탑 클리어!"));
  await page.locator("#tp-jump").dispatchEvent("pointerdown"); await page.locator("#tp-jump").dispatchEvent("pointerup"); await sleep(150);
  const sk = await skin(page);
  check("phone: jump button after a clear restarts at the start", sk && sk.x < 2.2, JSON.stringify(sk));
  await page.locator("#tp-portal").tap(); await sleep(250);
  check("phone: portal button leaves the tower", (await scene(page))[1] && !(await scene(page))[0]);
  check("phone: no page errors", errors.length === 0, errors.join("; "));
  await ctx.close();
} finally {
  await browser.close();
}
console.log(`${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
