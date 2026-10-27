// 포털 빌드 모드 (dc#102): window.RL_PORTAL이 있으면 혼자 하는 버전 (Poki·CrazyGames용, dungeon-crawler-html5가 빌드)
//   계정·상점·랭킹·바깥 링크·거래소·우편함 없음, 확인은 게임 안의 창, 들어갈 때·새로 시작할 때 중간 광고, 부활은 보상 광고,
//   광고 동안 키·소리 멈춤, 플레이 중인지 알림, 바깥 서버로 요청 없음
import { createRequire } from "node:module";
import fs from "node:fs"; import path from "node:path";
import { goDoor } from "./town.mjs";
const require = createRequire(process.env.NODE_PATH + "/");
const { chromium } = require("playwright");
const REPO = process.argv[2], OUT = process.argv[3];
const ORIGIN = "https://game.apacimtest.com/";
const results = []; const check = (n, ok, x = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x && !ok ? " — " + x : ""}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const save = (d, extra = {}, run = {}) => JSON.stringify({ v: 1, f50: 1, season: 4, best: 20, ...extra, run: { d, hp: 3, mh: 500, a: 5, g: 300, p: 2, l: 10, x: 0, xn: 1e9, rid: "portal-run", k: 0, pp: 0, ...run } });
const HOOK = `
  window.__t = { st: () => ({ scene, depth, gameOver, revived: !!player.revived, hp: player.hp }), die: () => { player.hp = 0; death(); render(); } };
  // ---- 시작 ----`;
// 가짜 포털 SDK: 부른 것을 적어 두고, 광고는 ms 뒤에 끝남 (reward: 보상 광고 결과)
const FAKE = ({ adMs, reward }) => {
  window.__calls = [];
  const log = (k, v) => window.__calls.push(v === undefined ? k : `${k}:${v}`);
  window.RL_PORTAL = {
    name: "test",
    loadingDone: () => log("loadingDone"),
    gameplay: (on) => { if (window.__play !== on) { window.__play = on; log("gameplay", on); } },
    commercialBreak: () => { log("commercialBreak"); return new Promise(r => setTimeout(r, adMs)); },
    rewardedBreak: () => { log("rewardedBreak"); return new Promise(r => setTimeout(() => r(reward), adMs)); },
  };
};

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
async function open({ sv, scene = "lobby", adMs = 400, reward = true }) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 1000 } }); const page = await ctx.newPage(); const errors = [], outside = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("dialog", d => { errors.push("native dialog: " + d.message()); d.dismiss(); });
  await ctx.route("**/*", r => {
    const u = r.request().url();
    if (!u.startsWith(ORIGIN)) { outside.push(u); return r.abort(); }
    const f = new URL(u).pathname.slice(1) || "index.html";
    if (f === "ranking-config.js") return r.fulfill({ contentType: "text/javascript", body: 'window.RANKING_API = "";' });
    const p = path.join(REPO, f); if (!fs.existsSync(p)) return r.fulfill({ status: 404, body: "" });
    let body = fs.readFileSync(p); if (f === "index.html") body = body.toString().replace("  // ---- 시작 ----", HOOK);
    r.fulfill({ contentType: { ".js": "text/javascript", ".png": "image/png", ".webp": "image/webp" }[path.extname(f)] || "text/html", body });
  });
  await ctx.addInitScript(FAKE, { adMs, reward });
  await ctx.addInitScript(([s, sc]) => { if (sessionStorage.getItem("s")) return; sessionStorage.setItem("s", 1); sessionStorage.setItem("rl_scene", sc);
    localStorage.setItem("rl_device_id", "portal-dev"); localStorage.setItem("rl_save", s); localStorage.setItem("rl_tips", JSON.stringify(["intro", "dungeon", "gear", "lowhp"])); }, [sv, scene]);
  await page.goto(ORIGIN); await page.waitForFunction(() => window.__t); await sleep(700);
  return { ctx, page, errors, outside };
}
const calls = (page) => page.evaluate(() => window.__calls.slice());
const st = (page) => page.evaluate(() => window.__t.st());
const shown = (page, id) => page.evaluate((id) => { const e = document.getElementById(id); return !!e && getComputedStyle(e).display !== "none" && !e.hidden; }, id);

try {
  // ---- 로비: 숨긴 것, 마을 문, 시작 알림 ----
  let { ctx, page, errors, outside } = await open({ sv: save(3) });
  check("loadingDone called once", (await calls(page)).filter(c => c === "loadingDone").length === 1, (await calls(page)).join());
  check("no account / shop / ranking / privacy link / online list", !(await Promise.all(["account-btn", "shop-btn", "rank-btn", "guest-note", "privacy-link", "lobby-panel"].map(id => shown(page, id)))).some(Boolean));
  check("town: no market, mailbox or staff door; waypoint and dungeon gate stay", await page.evaluate(() => { const T = window.RLJump.TOWN, ids = T.doors.map(d => d.id);
    return !ids.includes("market") && !ids.includes("mailbox") && !ids.includes("towerHell") && !T.buildings.some(b => b.id === "market") && ids.includes("waypoint") && ids.includes("start"); }));
  await page.mouse.click(400, 400); await sleep(700);
  check("gameplay(true) while walking in the town", (await calls(page)).includes("gameplay:true"), (await calls(page)).join());
  await page.screenshot({ path: path.join(OUT, "portal-lobby.png") });

  // ---- 1층 문: 포탈 층이 있으면 게임 안의 확인 창 (Esc = 취소, 확인 = 들어감) → 중간 광고 동안 키 멈춤 ----
  await goDoor(page, "start"); await sleep(200);
  check("start door with a portal floor: in-game confirm (no native dialog)", await page.locator("#ask-modal").isVisible() && (await page.locator("#ask-text").innerText()).includes("1층부터 새로 들어갈까요?"));
  check("confirm open → gameplay(false)", await page.waitForFunction(() => window.__play === false, null, { timeout: 2000 }).then(() => true, () => false));
  await page.keyboard.press("Escape"); await sleep(200);
  check("Esc = cancel: stays in the town", (await st(page)).scene === "lobby" && await page.locator("#ask-modal").isHidden());
  await page.keyboard.press("ArrowUp"); await sleep(200);
  await page.locator("#ask-yes").click(); await sleep(100);
  check("OK → commercial break before entering", (await calls(page)).includes("commercialBreak") && (await st(page)).scene === "lobby");
  await sleep(600);
  check("after the break: dungeon floor 1", (await st(page)).scene === "dungeon" && (await st(page)).depth === 1, JSON.stringify(await st(page)));
  check("sound paused during the ad and resumed after", await page.evaluate(() => !window.RLSound.state().unlocked || window.RLSound.state().running));
  check("no native dialogs, no page errors (enter)", errors.length === 0, errors.join("; "));
  await ctx.close();

  // ---- 쓰러짐: 보상 광고로 부활 (한 판에 한 번), 새로 시작하면 중간 광고 ----
  ({ ctx, page, errors, outside } = await open({ sv: save(5), scene: "dungeon" }));
  await page.evaluate(() => window.__t.die()); await sleep(300);
  check("death: watch-ad revive button only (no cash, no account)", await page.locator("#revive-ad-btn").isVisible() && !(await page.locator("#revive-btn").count()) && !(await page.locator("#death-revive").innerText()).includes("계정"));
  await page.screenshot({ path: path.join(OUT, "portal-death.png") });
  await page.locator("#revive-ad-btn").click(); await sleep(150);
  check("revive → rewarded break (keys blocked meanwhile)", (await calls(page)).includes("rewardedBreak") && (await st(page)).gameOver);
  await sleep(600);
  let s = await st(page);
  check("ad watched → revived with full HP on the same floor", !s.gameOver && s.revived && s.hp > 100 && s.depth === 5, JSON.stringify(s));
  await page.evaluate(() => window.__t.die()); await sleep(300);
  check("second death: already revived this run", !(await page.locator("#revive-ad-btn").count()) && (await page.locator("#death-revive").innerText()).includes("이미 부활"));
  const n0 = (await calls(page)).filter(c => c === "commercialBreak").length;
  await page.locator("#death-restart").click(); await sleep(200);
  check("restart from the lobby → commercial break", (await calls(page)).filter(c => c === "commercialBreak").length === n0 + 1 && (await st(page)).scene === "lobby");
  check("no page errors (death)", errors.length === 0, errors.join("; "));
  await ctx.close();

  // ---- 광고를 끝까지 안 보면 부활 없음 ----
  ({ ctx, page, errors, outside } = await open({ sv: save(5), scene: "dungeon", reward: false }));
  await page.evaluate(() => window.__t.die()); await sleep(300);
  await page.locator("#revive-ad-btn").click(); await sleep(700);
  check("ad not finished → still down, message", (await st(page)).gameOver && (await page.locator("#death-msg").innerText()).includes("광고를 끝까지 보지 않았거나"), await page.locator("#death-msg").innerText());
  check("no requests outside the game (no login, ranking, ads, fonts)", outside.length === 0, outside.join(" "));
  await ctx.close();
} finally { await browser.close(); }
const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
