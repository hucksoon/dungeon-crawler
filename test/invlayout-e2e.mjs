// 인벤토리 화면 구조: 넓은 화면 = 왼쪽 장비·가방 / 오른쪽 탭, 휴대폰 = 능력치 한 줄 + 아래에서 올라오는 탭 창 (60%)
import { createRequire } from "node:module"; import fs from "node:fs"; import path from "node:path";
const require = createRequire(process.env.NODE_PATH + "/"); const { chromium, devices } = require("playwright");
const REPO = process.argv[2], OUT = process.argv[3], ORIGIN = "https://game.apacimtest.com/";
const I = createRequire(import.meta.url)(path.join(REPO, "items.js"));
const results = []; const check = (name, ok, info = "") => { results.push(!!ok); console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || !info ? "" : " — " + info}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const find = (pre, pred, lvl = 100) => { for (let i = 0; ; i++) { const it = I.generate(`${pre}|k${i}`, "boss", lvl); if (pred(it)) return it; } };
const chest = { ...find("lc|n25", it => it.slot === "chest" && it.rarity === "legendary" && I.socketCount(it) >= 3), enh: 10 };
const eq = Object.fromEntries(I.SLOTS.map(s => [s, null]));
eq.chest = chest; eq.head = find("ls|n25", it => it.set === "inferno" && it.slot === "head"); eq.pants = find("ls2|n25", it => it.set === "inferno" && it.slot === "pants"); eq.arms = find("ls3|n25", it => it.set === "frost" && it.slot === "arms");
const bag = Array.from({ length: 40 }, (_, i) => find(`lb${i}|n25`, () => true));
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const open = async (opts) => {
  const ctx = await b.newContext(opts); const page = await ctx.newPage(); const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await ctx.route(ORIGIN + "**", r => { const f = new URL(r.request().url()).pathname.slice(1) || "index.html"; if (f === "ranking-config.js") return r.fulfill({ contentType: "text/javascript", body: `window.RANKING_API = "";` }); const p = path.join(REPO, f); if (!fs.existsSync(p)) return r.fulfill({ status: 404, body: "" }); r.fulfill({ contentType: f.endsWith(".js") ? "text/javascript" : "text/html", body: fs.readFileSync(p) }); });
  await ctx.addInitScript(([inv]) => { if (sessionStorage.getItem("s")) return; sessionStorage.setItem("s", 1); sessionStorage.setItem("rl_scene", "lobby"); localStorage.setItem("rl_device_id", "layout-01"); for (const k of ["rl_notice_v4", "rl_notice_1021f", "rl_notice_1021g", "rl_notice_1021h", "rl_notice_1021i", "rl_notice_1021j", "rl_notice_1022a", "rl_notice_1022b", "rl_notice_1023a", "rl_notice_1023b", "rl_notice_1023c", "rl_notice_1023d", "rl_notice_1025a"]) localStorage.setItem(`${k}:g:layout-01`, "1"); localStorage.setItem("rl_inv:g:layout-01", inv); localStorage.setItem("rl_save", JSON.stringify({ v: 1, f50: 1, season: 4, best: 50, clr: 1, nb: 25, run: { d: 1, hp: 3000, mh: 3000, a: 30, g: 50000, l: 40, x: 0, xn: 1e12, rid: "x", k: 0, pp: 0 } })); },
    [JSON.stringify({ bag, equip: eq, log: [], stones: 50, nmStones: 50, gems: { ruby: [3, 1, 0] } })]);
  await page.goto(ORIGIN); await sleep(800);
  await page.keyboard.press("i"); await sleep(300);
  return { ctx, page, errors };
};
const box = (page, sel) => page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { top: r.top, bottom: r.bottom, h: r.height, left: r.left }; }, sel);
try {
  // ---- 넓은 화면 ----
  {
    const { ctx, page, errors } = await open({ viewport: { width: 1280, height: 800 } });
    const m = await page.evaluate(() => { const mo = document.querySelector("#inv-modal .modal"); return { sh: mo.scrollHeight, ch: mo.clientHeight }; });
    check("desk: the window itself does not scroll (bag and tabs scroll on their own)", m.sh <= m.ch + 1, JSON.stringify(m));
    const bagB = await box(page, "#inv-bag"), side = await box(page, "#inv-side");
    check("desk: bag is on screen and tall (≥ 300px)", bagB.top < 300 && bagB.bottom <= 800 && bagB.h >= 300, JSON.stringify(bagB));
    check("desk: tabs sit to the right of the bag", side.left > bagB.left + 400, JSON.stringify(side));
    check("desk: bag scrolls on its own (40 items)", await page.evaluate(() => { const g = document.getElementById("inv-bag"); return g.scrollHeight > g.clientHeight && getComputedStyle(g).overflowY === "auto"; }));
    check("desk: opens on the 능력치 tab, mobile stat line hidden", await page.locator("#inv-summary").isVisible() && !(await page.locator("#inv-statline").isVisible()) && !(await page.locator(".detail-close").isVisible()));
    check("desk: sets and gem pouch start folded (one line each)", await page.locator("#inv-summary details.fold").count() === 3 && await page.locator("#inv-summary details.fold[open]").count() === 0);
    const sum = await page.locator("#inv-summary details.fold").first().locator("summary").innerText();
    check("desk: set line shows 화염의 세트 (2/5) · 효과 1/3", sum.includes("화염의 세트 (2/5)") && sum.includes("효과 1/3"), sum);
    await page.locator("#inv-summary details.fold summary").first().click(); await sleep(150);
    check("desk: clicking a set line shows all its tiers", (await page.locator("#inv-summary details.fold").first().innerText()).includes("5세트:"));
    await page.locator("#inv-equip .slot", { hasText: "가슴" }).click(); await sleep(200);
    check("desk: picking an item opens 상세 with long sections open", await page.locator("#inv-detail").isVisible() && await page.locator("#inv-detail details.fold[open]").count() >= 2);
    check("desk: set fold stays open after re-render", await page.locator(".inv-tab[data-tab=stats]").click().then(() => sleep(150)).then(() => page.locator("#inv-summary details.fold[open]").count()) === 1);
    check("desk: no page errors", errors.length === 0, errors.join("; "));
    await ctx.close();
  }
  // ---- 휴대폰 ----
  {
    const { ctx, page, errors } = await open(devices["iPhone 13"]);
    const vh = await page.evaluate(() => innerHeight);
    check("phone: sheet is closed when the inventory opens", !(await page.locator("#inv-side").isVisible()));
    const line = await page.locator("#inv-statline").innerText();
    check("phone: one-line stats (공 · 방 · HP · 흡혈 · sets)", line.startsWith("공 ") && line.includes("흡혈") && line.includes("화염 2/5"), line);
    const bagB = await box(page, "#inv-bag");
    check("phone: bag starts in the first screen (top < 45%)", bagB.top < vh * 0.45 && bagB.h >= 150, JSON.stringify({ ...bagB, vh }));
    await page.locator(".bag-item").first().tap(); await sleep(250);
    const sheet = await box(page, "#inv-side");
    check("phone: picking an item raises the sheet at ~60% height", Math.abs(sheet.h - vh * 0.6) < 4 && Math.abs(sheet.bottom - vh) < 2, JSON.stringify({ ...sheet, vh }));
    check("phone: action buttons are right under the name", await page.evaluate(() => { const d = document.getElementById("inv-detail"); const row = d.querySelector(".row"); return !!row && row.getBoundingClientRect().top - d.getBoundingClientRect().top < 160; }));
    check("phone: long sections start folded", await page.locator("#inv-detail details.fold").count() >= 1 && await page.locator("#inv-detail details.fold[open]").count() === 0);
    await page.locator(".detail-close").tap(); await sleep(200);
    check("phone: ▼ 닫기 lowers the sheet", !(await page.locator("#inv-side").isVisible()) && await page.locator("#inv-bag").isVisible());
    await page.locator("#inv-statline").tap(); await sleep(200);
    check("phone: tapping the stat line opens the 능력치 tab", await page.locator("#inv-summary").isVisible() && (await page.locator(".inv-tab.on").innerText()) === "능력치");
    await page.keyboard.press("Escape"); await sleep(150);
    check("phone: Esc lowers the sheet first, inventory stays open", !(await page.locator("#inv-side").isVisible()) && !(await page.locator("#inv-modal").isHidden()));
    await page.keyboard.press("Escape"); await sleep(150);
    check("phone: second Esc closes the inventory", await page.locator("#inv-modal").isHidden());
    check("phone: no page errors", errors.length === 0, errors.join("; "));
    await ctx.close();
  }
} finally { await b.close(); }
const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
