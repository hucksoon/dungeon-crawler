// dc#171: 속성 칸 2개 (축복 상점에서 축복 대신 속성 바꾸기, 단계 절반) · 층 축복은 3층마다 · 조합 맞추기 (얼음 느려짐 확률)
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
const require = createRequire(process.env.NODE_PATH + "/");
const { chromium } = require("playwright");
const REPO = process.argv[2];
const ORIGIN = "https://hucksoon.github.io/hucksoon/";
const R = createRequire(import.meta.url), B = R(path.join(REPO, "blessings.js"));
const results = [];
const check = (n, ok, x = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x && !ok ? " — " + x : ""}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ---- 규칙 ----
const many = (have) => Array.from({ length: 300 }, (_, i) => B.offer(`r171|${i}`, have)).flat();
check("2 element slots, floor blessing every 3 floors", B.ELEM_SLOTS === 2 && B.FLOOR_EVERY === 3);
const o1 = many({ fire: 3 });
check("one element held → other elements still offered", ["ice", "bolt", "poison"].some(k => o1.includes(k)));
const o2 = many({ fire: 10, bolt: 10, might: 3 });
check("two held → no other element, its awakened or other fusions", !o2.some(k => ["ice", "poison", "iceAw", "poisonAw", "steam", "ignite", "storm", "frostfog", "neuro"].includes(k)) && o2.includes("flamebolt") && o2.includes("fireAw"));
const sw = B.swapElem({ fire: 8, fireAw: 3, bolt: 10, flamebolt: 2, might: 4 }, "fire", "poison");
check("swap fire Lv 8 + awakened 3 → poison Lv 4 + plague 1, fusion gone, others kept", JSON.stringify(sw) === JSON.stringify({ bolt: 10, might: 4, poison: 4, poisonAw: 1 }), JSON.stringify(sw));
check("swap needs an element you have and one you do not", B.swapElem({ fire: 2 }, "ice", "bolt") === null && B.swapElem({ fire: 2, bolt: 1 }, "fire", "bolt") === null && B.swapElem({ fire: 1 }, "fire", "ice").ice === 1);
check("ice slow is a chance now (Lv 1 → Lv 10 rises)", B.ELEM.ice(1).slow < B.ELEM.ice(10).slow && B.ELEM.ice(10).slow < 1 && /확률로 느려짐/.test(B.cardText("ice", 1)));

const HOOK = `
  window.__t = {
    st: () => ({ scene, depth, bl: player.bl, pq: (player.pq || []).length, modal: !document.getElementById("bless-modal").hidden, title: document.getElementById("bless-title").textContent, sub: document.getElementById("bless-sub").textContent,
      swapBtn: !document.getElementById("bless-swap").hidden, swapText: document.getElementById("bless-swap").textContent, cards: [...document.querySelectorAll("#bless-cards .bless-card b")].map(b => b.textContent) }),
    floors: () => { player.pq = []; player.bz = {}; const o = depth, out = []; for (let d = 1; d <= 9; d++) { depth = d; const n = (player.pq || []).length; Bless.onFloor(); out.push((player.pq || []).length - n); } depth = o; player.pq = []; Bless.close(); return out; },
    shrine: () => { player.pq = []; Bless.onShrine(); },
    setBl: (bl) => { player.bl = bl; updateStats(); },
    logs: () => [...document.querySelectorAll("#log > *")].map(n => n.textContent),
  };
  // ---- 시작 ----`;
const EXE = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const browser = await chromium.launch({ executablePath: EXE });
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 } }); const page = await ctx.newPage(); const errors = [];
  page.on("pageerror", e => errors.push(e.message)); page.on("dialog", d => d.accept());
  await ctx.route(ORIGIN + "**", rr => { const f = new URL(rr.request().url()).pathname.replace("/hucksoon/", "") || "index.html";
    if (f === "ranking-config.js") return rr.fulfill({ contentType: "text/javascript", body: `window.RANKING_API = "";` });
    const p = path.join(REPO, f); if (!fs.existsSync(p)) return rr.fulfill({ status: 404, body: "" });
    let body = fs.readFileSync(p); if (f === "index.html") body = body.toString("utf8").replace("  // ---- 시작 ----", HOOK);
    rr.fulfill({ contentType: f.endsWith(".js") ? "text/javascript" : f.endsWith(".png") ? "image/png" : f.endsWith(".webp") ? "image/webp" : "text/html", body }); });
  const save = JSON.stringify({ v: 1, best: 12, run: { d: 6, hp: 500, mh: 500, a: 40, g: 100, l: 10, x: 0, xn: 5000, x4: 1, rid: "r171", k: 0, pp: 0, bz: { normal: 6 }, bl: { fire: 8, fireAw: 3, bolt: 10, flamebolt: 2, might: 4 } } });
  await ctx.addInitScript((s) => { if (!sessionStorage.getItem("s")) { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); sessionStorage.setItem("rl_scene", "dungeon"); sessionStorage.setItem("s", 1); } },
    { rl_oldtown: "off", rl_bless: "on", rl_live: "off", rl_3d: "0", rl_save: save, rl_device_id: "r171-dev", rl_tut: JSON.stringify(["intro"]), rl_tip_dodge: "1" });
  await page.goto(ORIGIN); await page.waitForFunction(() => window.__t); await sleep(500);
  const T = (fn, ...a) => page.evaluate(([f, a]) => window.__t[f](...a), [fn, a]);
  const fl = await T("floors");
  check(`floor blessings only on floors 3, 6, 9 (${fl.join(",")})`, fl.join(",") === "0,0,1,0,0,1,0,0,1");
  // 축복 상점: 축복 대신 속성 바꾸기
  await T("shrine"); await sleep(200);
  let s = await T("st");
  check("shrine shows the swap button with slots 2/2", s.modal && s.swapBtn && /속성 바꾸기/.test(s.swapText) && /2\/2/.test(s.swapText), JSON.stringify(s));
  check("blessing text tells the slots are full", /속성 칸 2\/2/.test(s.sub), s.sub);
  await page.reload(); await page.waitForFunction(() => window.__t); await sleep(400);
  s = await T("st");
  check("shrine entry survives a reload (still the shrine with the swap button)", s.modal && s.swapBtn && /축복 상점/.test(s.title), JSON.stringify(s));
  await page.click("#bless-swap"); await sleep(150);
  s = await T("st");
  check("step 1: pick one of my two elements", s.cards.length === 2 && s.cards.every(c => ["화염구", "연쇄 번개"].includes(c)), JSON.stringify(s.cards));
  await page.locator("#bless-cards .bless-card", { hasText: "화염구" }).click(); await sleep(150);
  s = await T("st");
  check("step 2: pick a new element I do not have (ice · poison), shows the half level", s.cards.length === 2 && s.cards.includes("독구름") && s.cards.includes("얼음 폭발") && /Lv 4/.test(await page.locator("#bless-cards").innerText()), JSON.stringify(s.cards));
  await page.locator("#bless-cards .bless-card", { hasText: "독구름" }).click(); await sleep(300);
  s = await T("st");
  check("swapped: poison Lv 4 + plague Lv 1, fire and its fusion gone, shrine used", s.bl.poison === 4 && s.bl.poisonAw === 1 && !s.bl.fire && !s.bl.fireAw && !s.bl.flamebolt && s.bl.bolt === 10 && s.bl.might === 4 && !s.modal && s.pq === 0, JSON.stringify(s));
  check("log says the swap", (await T("logs")).some(l => /🔄 속성 바꾸기: 🔥 화염구 Lv 8 → ☁ 독구름 Lv 4/.test(l)));
  // 상점에서 돌아가기 → 보통 축복 고르기
  await T("shrine"); await sleep(150); await page.click("#bless-swap"); await sleep(100); await page.click("#bless-swap"); await sleep(100);
  s = await T("st");
  check("back button returns to the blessing cards", s.cards.length === 3 && /속성 바꾸기/.test(s.swapText), JSON.stringify(s));
  await page.reload(); await page.waitForFunction(() => window.__t); await sleep(400);
  s = await T("st");
  check("swap kept after reload", s.bl.poison === 4 && !s.bl.fire, JSON.stringify(s.bl));
  check("no page errors", errors.length === 0, errors.join("; "));
  await ctx.close();
} finally { await browser.close(); }
const pass = results.filter(Boolean).length;
console.log(`\n${pass} passed, ${results.length - pass} failed`);
process.exit(pass === results.length ? 0 : 1);
