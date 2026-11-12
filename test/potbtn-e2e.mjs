// dc#179: 휴대폰 던전 화면 왼쪽 위 포션 버튼
//   화면만 보고 하다 보니 아래 메뉴 줄의 포션까지 손이 안 감 → 지도 위 왼쪽 위에 둥근 포션 버튼 (누르는 순간 마심)
//   대기 중에는 어둡게 + 남은 턴, HP가 적고 준비되면 깜빡임. 버튼을 눌러도 이동·회피(지도 터치)로 넘어가지 않음
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
const require = createRequire(process.env.NODE_PATH + "/");
const { chromium } = require("playwright");
const REPO = process.argv[2], SHOTS = process.argv[3];
const ORIGIN = "https://hucksoon.github.io/hucksoon/";
const results = [];
const check = (n, ok, x = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x && !ok ? " — " + x : ""}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const HOOK = `
  window.__t = {
    s: () => { const b = document.getElementById("stage-pot"), r = b.getBoundingClientRect(), st = document.getElementById("stage").getBoundingClientRect(), tip = document.getElementById("tip");
      return { scene, x: player.x, y: player.y, hp: player.hp, max: stats().maxHp, cd: player.potCd || 0, dcd: player.jumpCd || 0,
        shown: getComputedStyle(b).display !== "none" && !b.hidden, left: Math.round(r.left - st.left), top: Math.round(r.top - st.top), w: Math.round(r.width),
        cls: b.className, num: b.querySelector(".pot-cd").textContent, label: b.getAttribute("aria-label"), cdVar: b.style.getPropertyValue("--cd"),
        tipTop: tip.hidden ? null : Math.round(tip.getBoundingClientRect().top - st.top), center: { x: r.left + r.width / 2, y: r.top + r.height / 2 } }; },
    low: () => { player.hp = Math.max(1, Math.floor(stats().maxHp * 0.2)); player.potCd = 0; updateStats(); render(); },
    calm: () => { enemies = []; items = []; render(); },
    lane: () => { enemies = []; items = []; const y = Math.max(4, Math.min(MAP_H - 5, player.y)); for (let yy = y - 3; yy <= y + 3; yy++) for (let x = 1; x < MAP_W - 1; x++) { map[yy][x] = FLOOR; visible[yy][x] = seen[yy][x] = true; }
      player.x = 2; player.y = y; render(); return { x: player.x, y: player.y }; },
    screen: () => Walk.screenOf(player.x, player.y),
    tip: () => { const t = document.getElementById("tip"); t.hidden = false; document.getElementById("tip-text").textContent = "test"; },
    log: () => document.getElementById("log").innerText,
  };
  // ---- 시작 ----`;
const EXE = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const browser = await chromium.launch({ executablePath: EXE });
async function open(storage, { phone = true, scene = "dungeon", lang = null } = {}) {
  const ctx = await browser.newContext(phone ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 950 } });
  const page = await ctx.newPage(); const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("dialog", d => d.accept());
  await ctx.route(ORIGIN + "**", r => { const f = new URL(r.request().url()).pathname.replace("/hucksoon/", "") || "index.html";
    if (f === "ranking-config.js") return r.fulfill({ contentType: "text/javascript", body: `window.RANKING_API = "";` });
    const p = path.join(REPO, f); if (!fs.existsSync(p)) return r.fulfill({ status: 404, body: "" });
    let body = fs.readFileSync(p); if (f === "index.html") body = body.toString("utf8").replace("  // ---- 시작 ----", HOOK);
    r.fulfill({ contentType: f.endsWith(".js") ? "text/javascript" : f.endsWith(".png") ? "image/png" : f.endsWith(".webp") ? "image/webp" : "text/html", body }); });
  await ctx.addInitScript(([s, scene, lang]) => { if (!sessionStorage.getItem("s")) { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); if (lang) localStorage.setItem("rl_game_lang", lang); sessionStorage.setItem("rl_scene", scene); sessionStorage.setItem("s", 1); } }, [storage, scene, lang]);
  await page.goto(ORIGIN);
  await page.waitForFunction(() => window.__t);
  await sleep(400);
  if (phone) { await page.evaluate(() => { const b = document.getElementById("tip-close"); if (b && !document.getElementById("tip").hidden) b.click(); }); await sleep(150); }
  const cdp = phone ? await ctx.newCDPSession(page) : null;
  const tap = async (x, y) => { await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] }); await sleep(60); await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); };
  // 한 손가락으로 지도를 끌어 걷는 중에 다른 손가락으로 포션 (포인터 이벤트를 직접: CDP 터치는 한 손가락만 떼기를 잘 못 함)
  const fire = (type, id, x, y) => page.evaluate(([type, id, x, y]) => { const el = document.elementFromPoint(x, y);
    el.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: "touch", clientX: x, clientY: y, bubbles: true, cancelable: true, isPrimary: id === 101 })); }, [type, id, x, y]);
  return { ctx, page, errors, tap, fire };
}
const save = (run = {}) => JSON.stringify({ v: 1, best: 3, run: { d: 2, hp: 300, mh: 300, a: 40, g: 0, l: 5, x: 0, xn: 100, rid: "potbtn", k: 0, pp: 0, ...run } });
const T = (page, fn, ...a) => page.evaluate(([f, a]) => window.__t[f](...a), [fn, a]);
const BASE = { rl_oldtown: "off", rl_bless: "off", rl_autogear: "1", rl_market: "paused", rl_device_id: "potbtn-dev", rl_3d: "0", rl_live: "off", rl_tut: JSON.stringify(["intro"]) };

try {
  // ---- 1. 휴대폰 던전: 왼쪽 위 버튼 ----
  const A = await open({ ...BASE, rl_save: save() });
  await T(A.page, "calm");
  let a = await T(A.page, "s");
  check("phone dungeon: potion button on the map, top-left", a.shown && a.left >= 0 && a.left <= 16 && a.top >= 0 && a.top <= 16 && a.w >= 48, JSON.stringify(a));
  check("ready: no number, label says drink", a.num === "" && !a.cls.includes("cooling") && a.label === "포션 마시기", JSON.stringify(a));
  // ---- 2. HP가 적으면 깜빡임 → 톡 하면 마심 (걷거나 회피하지 않음) ----
  await T(A.page, "low"); await sleep(100);
  a = await T(A.page, "s");
  check("low HP + ready: button pulses (urgent)", a.cls.includes("urgent"), JSON.stringify(a));
  await A.page.screenshot({ path: path.join(SHOTS, "potbtn-ready.png") }).catch(() => {});
  await A.tap(a.center.x, a.center.y); await sleep(300);
  let b = await T(A.page, "s");
  check(`tap: potion drunk (HP ${a.hp} → ${b.hp})`, b.hp > a.hp && b.cd > 0, JSON.stringify(b));
  check("tap on the button does not move or dodge", b.x === a.x && b.y === a.y && b.dcd === a.dcd, JSON.stringify([a, b]));
  check(`cooling: dim, turns left on the button (${b.num}), shade ${b.cdVar}`, b.cls.includes("cooling") && !b.cls.includes("urgent") && +b.num === b.cd && +b.cdVar > 0 && b.label.includes(String(b.cd)), JSON.stringify(b));
  await A.page.screenshot({ path: path.join(SHOTS, "potbtn-cooling.png") }).catch(() => {});
  const h1 = b.hp;
  await A.tap(b.center.x, b.center.y); await sleep(250);
  b = await T(A.page, "s");
  check("tap again while cooling: nothing, log says when", b.hp === h1 && (await T(A.page, "log")).includes("포션은"), JSON.stringify(b));
  // ---- 3. 한 손가락으로 걷는 중에 다른 손가락으로 포션 ----
  const B = await open({ ...BASE, rl_save: save() });
  const ln = await T(B.page, "lane"); await T(B.page, "low");
  const p = await T(B.page, "screen"), s0 = await T(B.page, "s");
  await B.fire("pointerdown", 101, p.x, p.y);
  for (let i = 1; i <= 6; i++) { await B.fire("pointermove", 101, p.x + 60 * i / 6, p.y); await sleep(16); }
  await sleep(400);
  await B.fire("pointerdown", 102, s0.center.x, s0.center.y); await sleep(60); await B.fire("pointerup", 102, s0.center.x, s0.center.y);
  await sleep(150);
  const s1 = await T(B.page, "s");
  for (let k = 0; k < 4; k++) { await B.fire("pointermove", 101, p.x + 60, p.y); await sleep(100); }
  const s2 = await T(B.page, "s");
  await B.fire("pointerup", 101, p.x + 60, p.y);
  check(`walking finger + potion finger: potion drunk (HP ${s0.hp} → ${s1.hp})`, s1.hp > s0.hp && s1.cd > 0, JSON.stringify([s0, s1]));
  check(`…and walking keeps going (x ${ln.x} → ${s2.x})`, s2.x > s1.x || s2.x > ln.x + 1, JSON.stringify([ln, s1, s2]));
  // ---- 4. 도움말 말풍선은 버튼 아래로 ----
  await T(B.page, "tip"); await sleep(100);
  const t = await T(B.page, "s");
  check(`tip moves below the button (tip top ${t.tipTop}px)`, t.tipTop != null && t.tipTop >= t.top + t.w, JSON.stringify(t));
  // ---- 5. 마을·PC에서는 없음, 영어 ----
  const L = await open({ ...BASE, rl_save: save() }, { scene: "lobby" });
  check("lobby: no potion button", !(await T(L.page, "s")).shown);
  const P = await open({ ...BASE, rl_save: save() }, { phone: false });
  check("PC: no potion button on the map (keyboard Q · menu button)", !(await T(P.page, "s")).shown);
  const E = await open({ ...BASE, rl_save: save() }, { lang: "en" });
  const e = await T(E.page, "s");
  check(`English label (${e.label})`, e.shown && e.label === "Drink potion", JSON.stringify(e));
  const errs = [A, B, L, P, E].flatMap(o => o.errors);
  check("no page errors", errs.length === 0, errs.join(" | "));
} catch (err) {
  console.log("FAIL exception — " + (err.stack || err));
  results.push(false);
} finally {
  await browser.close();
}
const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
