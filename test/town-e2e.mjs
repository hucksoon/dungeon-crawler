// 마을 (dc#90): 옆에서 보는 로비 — 걷기·점프·벽, 문마다 들어가는 곳, 닫힌 문, 파란 포탈 문, 창이 열려 있으면 안 움직임, 휴대폰 버튼
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { goDoor } from "./town.mjs";
const require = createRequire(process.env.NODE_PATH + "/");
const { chromium, devices } = require("playwright");
const REPO = process.argv[2], SHOTS = process.argv[3];
const ORIGIN = "https://hucksoon.github.io/hucksoon/";
const results = [];
const check = (n, ok, x = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x ? " — " + x : ""}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const HOOK = `
  window.__t = { s: () => ({ scene, depth, lx: lobbyPos.x, ly: lobbyPos.y, resume: resumeFloor() }) };
  // ---- 시작 ----`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
async function open(storage = {}, { scene = null, opts = { viewport: { width: 1280, height: 950 } }, block = null } = {}) {
  const ctx = await browser.newContext(opts); const page = await ctx.newPage(); const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("dialog", d => d.accept());
  await ctx.route(ORIGIN + "**", r => { const f = new URL(r.request().url()).pathname.replace("/hucksoon/", "") || "index.html";
    if (f === "ranking-config.js") return r.fulfill({ contentType: "text/javascript", body: `window.RANKING_API = "";` });
    const p = path.join(REPO, f); if (f === block || !fs.existsSync(p)) return r.fulfill({ status: 404, body: "" });
    let body = fs.readFileSync(p); if (f === "index.html") body = body.toString().replace("  // ---- 시작 ----", HOOK);
    r.fulfill({ contentType: { ".js": "text/javascript", ".png": "image/png" }[path.extname(f)] || "text/html", body }); });
  await ctx.addInitScript(([s, sc]) => { if (sessionStorage.getItem("s")) return; sessionStorage.setItem("s", 1);
    localStorage.setItem("rl_device_id", "town-dev-0001"); for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); if (sc) sessionStorage.setItem("rl_scene", sc); }, [storage, scene]);
  await page.goto(ORIGIN); await sleep(500);
  return { ctx, page, errors };
}
const pos = (page) => page.evaluate(() => window.RLTownPos());
const st = (page) => page.evaluate(() => window.__t.s());
const logText = (page) => page.locator("#log").innerText();
const inLobby = (page) => page.evaluate(() => document.body.classList.contains("in-lobby"));
const hold = async (page, key, ms) => { await page.keyboard.down(key); await sleep(ms); await page.keyboard.up(key); };
const save = (d, extra = {}) => JSON.stringify({ v: 1, best: d, ...extra, run: { d, hp: 300, mh: 300, a: 50, g: 500, p: 2, l: 5, x: 0, xn: 1e9, rid: "town-run", k: 0, pp: 0 } });
// 같은 판에서 다시 마을로: 던전에서 포탈(P) → 파란 포탈 문 앞
const back = async (page) => { await page.keyboard.press("Escape"); await sleep(100); if (!(await inLobby(page))) { await page.keyboard.press("p"); await sleep(300); } };

try {
  // ---- 처음 온 사람: 걷기·점프·벽 ----
  const N = await open();
  let p = await pos(N.page);
  check("new player: town lobby, standing on the ground (row 10)", await inLobby(N.page) && p && p.ground && p.y === 10 && p.x >= 20 && p.x <= 40, JSON.stringify(p));
  check("no glyph/picture toggle anywhere", (await N.page.locator("#gfx-btn").count()) === 0);
  const x0 = p.x;
  await hold(N.page, "ArrowRight", 500); await sleep(300);
  p = await pos(N.page);
  check("→ walks right (~3 tiles in 0.5 s) and stops on release", p.x - x0 > 2 && p.x - x0 < 5 && Math.abs(p.vx) < 0.05, `${x0} → ${p.x}`);
  check("server position follows (x = tile, y = ground row 10)", (await st(N.page)).lx === Math.floor(p.x) && (await st(N.page)).ly === 10);
  // 점프: 한 번 · 공중에서 한 번 더 (더 높이)
  const peak = (keys) => N.page.evaluate(async (keys) => {
    const fire = (t, k) => window.dispatchEvent(new KeyboardEvent(t, { key: k, bubbles: true }));
    let top = 99; const t0 = performance.now();
    for (const [k, a, b] of keys) { setTimeout(() => fire("keydown", k), a); setTimeout(() => fire("keyup", k), b); }
    while (performance.now() - t0 < 1500) { top = Math.min(top, window.RLTownPos().y); await new Promise(r => setTimeout(r, 16)); }
    return 10 - top;
  }, keys);
  const h1 = await peak([[" ", 0, 400]]), h2 = await peak([[" ", 0, 300], [" ", 360, 700]]);
  check("Space jumps (> 2.5 tiles) and lands back on the ground", h1 > 2.5 && (await pos(N.page)).ground && (await pos(N.page)).y === 10, String(h1));
  check("Space again in the air = double jump (higher)", h2 > h1 + 1.5, `${h1} → ${h2}`);
  // 벽: 끝까지 걸어도 마을 밖으로 안 나감 (서버 칸 0~63)
  await goDoor(N.page, "jumptower", { enter: false }); await hold(N.page, "ArrowLeft", 1500); await sleep(200);
  p = await pos(N.page);
  check("left wall stops you inside the town", p.x >= 1 && p.x < 2 && (await st(N.page)).lx >= 0, String(p.x));
  await N.page.screenshot({ path: path.join(SHOTS, "town-left.png") });
  // 창이 열려 있으면 움직이지 않고 문에도 안 들어감
  await N.page.keyboard.press("i"); await sleep(150);
  const xi = (await pos(N.page)).x;
  await hold(N.page, "ArrowRight", 400); await N.page.keyboard.press("ArrowUp"); await sleep(150);
  check("inventory open: arrows don't walk or enter", (await pos(N.page)).x === xi && !(await N.page.locator("#inv-modal").isHidden()) && await inLobby(N.page));
  await N.page.keyboard.press("Escape"); await sleep(100);

  // ---- 문마다 ----
  await goDoor(N.page, "market");
  check("거래소 door → market opens", await N.page.locator("#market-modal").isVisible());
  await N.page.keyboard.press("Escape"); await sleep(100);
  await goDoor(N.page, "mailbox");
  check("우편함 → market opens on the mail tab", await N.page.locator("#market-modal").isVisible() && (await N.page.locator("#market-modal").innerText()).includes("우편함은 계정을 연결하면 쓸 수 있어요"));
  await N.page.keyboard.press("Escape"); await sleep(100);
  await goDoor(N.page, "hourshop");
  check("시간 상점 door → hour shop opens", !(await N.page.locator("#shop-modal").isHidden()));
  await N.page.keyboard.press("Escape"); await sleep(100);
  await goDoor(N.page, "forge");
  check("대장간 door → inventory as 대장간", !(await N.page.locator("#inv-modal").isHidden()) && (await N.page.locator("#inv-title").innerText()) === "대장간");
  await N.page.keyboard.press("Escape"); await sleep(100);
  // 닫힌 문: 안내만, 마을에 그대로
  for (const [id, msg] of [["golddungeon", "골드 던전은 일반 던전 75층을 완료해야"], ["nightmare", "75층을 완료해야 들어갈 수 있다"], ["hell", "헬 던전은 나이트메어 50층을 완료해야"]]) {
    await goDoor(N.page, id);
    check(`closed door ${id}: stays in the town with a note`, await inLobby(N.page) && (await logText(N.page)).includes(msg), (await logText(N.page)).split("\n").slice(-1)[0]);
  }
  // 파란 포탈 문: 돌아갈 층이 없으면 안 보이고, 그 자리에 서도 문이 아님
  await goDoor(N.page, "resume", { enter: false });
  check("no portal floor: no blue portal door", (await pos(N.page)).near === null && (await st(N.page)).resume === 0);
  await N.page.keyboard.press("ArrowUp"); await sleep(150);
  check("↑ there does nothing", await inLobby(N.page));
  // 점프 던전은 운영자만 (dc#96): 다른 사람은 그 자리에 문이 없어 ↑ 해도 마을 그대로 (운영자 입장은 tower-e2e)
  await goDoor(N.page, "jumptower");
  check("점프 던전 door is staff-only: ↑ there stays in the town", !(await N.page.evaluate(() => document.body.classList.contains("in-tower"))) && await inLobby(N.page) && (await pos(N.page)).near === null);
  // Enter도 들어가기: 1층 문
  await goDoor(N.page, "start", { enter: false });
  await N.page.keyboard.press("Enter"); await sleep(250);
  check("Enter at the floor-1 door → dungeon floor 1", (await st(N.page)).scene === "dungeon" && (await st(N.page)).depth === 1);
  await N.page.keyboard.press("p"); await sleep(300);
  check("portal from floor 1 → town, in front of the floor-1 door", await inLobby(N.page) && (await pos(N.page)).near === "start");
  check("new player: no page errors", N.errors.length === 0, N.errors.join("; "));
  await N.ctx.close();

  // ---- 포탈 층이 있으면: 파란 포탈 문 ----
  const P = await open({ rl_save: save(8) }, { scene: "dungeon" });
  await P.page.keyboard.press("p"); await sleep(300);
  p = await pos(P.page);
  check("portal from floor 8 → town, standing at the blue portal door", await inLobby(P.page) && p.near === "resume" && (await st(P.page)).resume === 8, JSON.stringify(p));
  await P.page.screenshot({ path: path.join(SHOTS, "town-portal.png") });
  await P.page.keyboard.press("ArrowUp"); await sleep(250);
  check("↑ at the blue portal door → back to floor 8", (await st(P.page)).scene === "dungeon" && (await st(P.page)).depth === 8);
  check("portal player: no page errors", P.errors.length === 0, P.errors.join("; "));
  await P.ctx.close();

  // ---- 휴대폰: ◀ ▶ 누르고 있기, 큰 점프 버튼, ▲ 들어가기 ----
  const M = await open({}, { opts: { ...devices["iPhone 13"] } });
  const box = (sel) => M.page.locator(sel).evaluate(b => { const r = b.getBoundingClientRect(); return { x: r.left, r: r.right, w: r.width, shown: !!b.offsetParent }; });
  const [BL, BR, BU, BD, JB, W] = [await box('#touch-pad [data-dir="-1,0"]'), await box('#touch-pad [data-dir="1,0"]'), await box('#touch-pad [data-dir="0,-1"]'), await box('#touch-pad [data-dir="0,1"]'), await box("#tp-jump"), await M.page.evaluate(() => innerWidth)];
  check("phone town: ◀ ▶ on the left, ▲ 들어가기 under them, ▼ hidden, big jump on the right",
    BL.shown && BR.shown && BU.shown && !BD.shown && BR.r < W / 2 && JB.w >= 100 && JB.x > W / 2 && (await M.page.locator('#touch-pad [data-dir="0,-1"]').innerText()).includes("들어가기"), JSON.stringify({ BL, BR, BU, BD, JB, W }));
  check("phone: no horizontal scroll", await M.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  const m0 = (await pos(M.page)).x, right = M.page.locator('#touch-pad [data-dir="1,0"]');
  await right.dispatchEvent("pointerdown"); await sleep(400); await right.dispatchEvent("pointerup"); await sleep(250);
  check("phone: holding ▶ walks right", (await pos(M.page)).x - m0 > 1.5);
  const jy = await M.page.evaluate(async () => { const j = document.getElementById("tp-jump"); j.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })); await new Promise(r => setTimeout(r, 250)); const y = window.RLTownPos().y; j.dispatchEvent(new PointerEvent("pointerup", { bubbles: true })); return y; });
  check("phone: jump button jumps", jy < 8.5, String(jy));
  await sleep(800);
  await goDoor(M.page, "market", { enter: false });
  await M.page.locator('#touch-pad [data-dir="0,-1"]').dispatchEvent("pointerdown"); await M.page.locator('#touch-pad [data-dir="0,-1"]').dispatchEvent("pointerup"); await sleep(200);
  check("phone: ▲ 들어가기 at a door opens it", await M.page.locator("#market-modal").isVisible());
  await M.page.screenshot({ path: path.join(SHOTS, "town-phone.png") });
  check("phone: no page errors", M.errors.length === 0, M.errors.join("; "));
  await M.ctx.close();

  // ---- jump.js를 못 받으면: 빈 화면 대신 새로고침 안내, 오류 없음 ----
  const F = await open({}, { block: "jump.js" });
  await F.page.keyboard.press("ArrowRight"); await F.page.keyboard.press("ArrowUp"); await F.page.keyboard.press(" "); await sleep(200);
  const lit = await F.page.evaluate(() => { const c = document.getElementById("game"), d = c.getContext("2d").getImageData(0, c.height / 2 - 20, c.width, 40).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 150 && d[i + 1] > 150) n++; return n; });
  check("no jump.js: town shows a refresh note (text drawn), keys do nothing, no page errors", await inLobby(F.page) && lit > 50 && F.errors.length === 0, `${lit} ${F.errors.join("; ")}`);
  await F.ctx.close();
} finally {
  await browser.close();
}
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
