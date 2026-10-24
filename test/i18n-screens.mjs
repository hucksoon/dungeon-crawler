// 5단계 점검: 미리 보기(en/ja)에서 전투 로그·로비·공지·추천 탭·최고 조합·랭킹 페이지에 한글이 남는지
// node i18n-screens2.mjs REPO OUT LANG
import { createRequire } from "node:module";
import fs from "node:fs"; import path from "node:path";
const require = createRequire(process.env.NODE_PATH + "/");
const { chromium } = require("playwright");
const REPO = process.argv[2], OUT = process.argv[3], LANG = process.argv[4] || "en";
const req = createRequire(import.meta.url);
const L18 = req(path.join(REPO, "i18n.js")); req(path.join(REPO, "i18n/en.js")); req(path.join(REPO, "i18n/ja.js"));
const I = req(path.join(REPO, "items.js")), M = req(path.join(REPO, "monsters.js"));
L18.setLang(LANG); L18.apply(I, M);   // 저장된 층의 몬스터 이름도 그 언어로
const ORIGIN = "https://game.apacimtest.com/";
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
// 룬 이름(가~하 한 글자)은 어느 언어든 한글 그대로라서 빼고 봄
const RUNE = /(?<![가-힣])[가나다라마바사아자차카타파하](?![가-힣])/g;
const hasKo = (s) => /[가-힣]/.test(s.replace(RUNE, ""));
const koLines = (t) => t.split("\n").filter(hasKo);

const MAP_W = 32, MAP_H = 24;
const map = Array.from({ length: MAP_H }, (_, y) => Array.from({ length: MAP_W }, (_, x) => (x === 0 || y === 0 || x === MAP_W - 1 || y === MAP_H - 1 ? 0 : 1)));
const lv = (d, rid, z, enemies = [], extra = {}) => { const mm = map.map(r => r.slice()); mm[10][11] = 2; return JSON.stringify({ rid, d, z, turn: 0, map: mm.map(r => r.join("")).join(""), seen: "1".repeat(MAP_W * MAP_H), px: 10, py: 10, shop: null, enemies, items: [], ...extra }); };
const v4 = I.generate("hlv4|shop|d70|s1", "golden", 70);
const eqOf = (...its) => { const e = Object.fromEntries(I.SLOTS.map(s => [s, null])); for (const it of its) e[it.slot] = it; return e; };
const inv = (...eq) => JSON.stringify({ bag: [], equip: eqOf(...eq), log: [], stones: 0 });
const save = (d, rid, extra = {}, run = {}) => JSON.stringify({ v: 1, season: 4, best: 75, clr: 1, nb: 50, nclr: 1, hb: d, ...extra, run: { d, hp: 9e6, mh: 9e6, a: 30, g: 500, l: 40, x: 0, xn: 1e12, rid, k: 0, pp: 0, z: "hell", ...run } });
const named = (n, extra = {}) => ({ x: 11, y: 10, ...M.makeNamedBoss(n), ...extra });
const NOTICES = ["rl_notice_v4", "rl_notice_75", "rl_notice_1021g", "rl_notice_1021h", "rl_notice_1021i", "rl_notice_1021j", "rl_notice_1022a", "rl_notice_1022b", "rl_notice_1023a", "rl_notice_1023b", "rl_notice_1023c", "rl_notice_1023d"];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const report = {}, allErrors = [];
async function open(dev, seed, { scene = "dungeon", notices = false, file = "" } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 1000 } }); const page = await ctx.newPage();
  page.on("pageerror", e => allErrors.push(`${dev}: ${e.message}`)); page.on("dialog", d => { (report.dialogs ||= []).push(d.message()); d.accept(); });
  await ctx.route(ORIGIN + "**", r => { const f = new URL(r.request().url()).pathname.slice(1) || "index.html";
    if (f === "ranking-config.js") return r.fulfill({ contentType: "text/javascript", body: `window.RANKING_API = "";` });
    const p = path.join(REPO, f); if (!fs.existsSync(p)) return r.fulfill({ status: 404, body: "" });
    r.fulfill({ contentType: f.endsWith(".js") ? "text/javascript" : "text/html", body: fs.readFileSync(p) }); });
  await ctx.route("https://login.xsolla.com/**", r => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await ctx.addInitScript(([seed, dev, scene, notices, N]) => { if (sessionStorage.getItem("seeded")) return; sessionStorage.setItem("seeded", 1); sessionStorage.setItem("rl_scene", scene);
    localStorage.setItem("rl_device_id", dev); if (!notices) for (const k of N) localStorage.setItem(`${k}:g:${dev}`, "1");
    for (const [k, v] of Object.entries(seed)) localStorage.setItem(k.replace("DEV", dev), v);
    window.__log = []; document.addEventListener("DOMContentLoaded", () => { const lg = document.getElementById("log"); if (lg) new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => window.__log.push(n.textContent)))).observe(lg, { childList: true }); }); }, [seed, dev, scene, notices, NOTICES]);
  await page.goto(ORIGIN + file + `?lang=${LANG}`); await sleep(500);
  return { ctx, page };
}
const logs = (page) => page.evaluate(() => window.__log.join("\n") + "\n" + (document.getElementById("log")?.innerText || ""));
const press = async (page, k, n = 1) => { for (let i = 0; i < n; i++) { await page.keyboard.press(k); await sleep(40); } };
const samples = {};
const add = (k, lines) => { report[k] = (report[k] || []).concat(lines); };
const sample = async (k, page) => { samples[k] = (await logs(page)).split("\n").filter(Boolean).slice(-6); };

try {
  // 1. 헬 10층 새로: 네임드 등장 로그 + 층 입장 로그
  let { ctx, page } = await open("t1", { rl_save: save(10, "a1"), "rl_inv:g:DEV": inv(v4) });
  await sample("hell10-intro", page); add("hell10-intro", koLines(await logs(page)));
  await ctx.close();
  // 2. 불가사리 (HP 많음): 방어력 깎기 로그·상태 줄
  ({ ctx, page } = await open("t2", { rl_save: save(10, "a2"), rl_level: lv(10, "a2", "hell", [named(10, { hp: 2e9, maxHp: 2e9, atk: 5, el: null })]), "rl_inv:g:DEV": inv(v4) }));
  await press(page, " ", 4); await sleep(150);
  await sample("shred", page); add("shred", koLines(await logs(page)).concat(koLines(await page.locator("#status").innerText()), koLines(await page.locator("#stats").innerText())));
  await page.screenshot({ path: path.join(OUT, `i18n5-fight-${LANG}.png`) });
  await ctx.close();
  // 3. 불가사리 처치: 처치·드롭 로그
  ({ ctx, page } = await open("t3", { rl_save: save(10, "a3"), rl_level: lv(10, "a3", "hell", [named(10, { hp: 1 })]), "rl_inv:g:DEV": inv(v4) }));
  await press(page, "ArrowRight"); await sleep(250); await press(page, "ArrowRight", 2); await sleep(200);
  await sample("kill", page); add("kill", koLines(await logs(page)));
  await ctx.close();
  // 4. 구미호 분신·꼬리, 저승사자, 염라대왕 심판
  for (const [n, ex] of [[20, { hp: Math.floor(M.makeNamedBoss(20).maxHp * 0.5), atk: 1 }], [30, { hp: 2e9, maxHp: 2e9, atk: 5, el: null }], [40, { hp: 2e9, maxHp: 2e9, atk: 1, el: null }], [50, { hp: 2e9, maxHp: 2e9, atk: 1 }]]) {
    ({ ctx, page } = await open(`t4${n}`, { rl_save: save(n, `b${n}`), rl_level: lv(n, `b${n}`, "hell", [named(n, ex)], { turn: 1 }), "rl_inv:g:DEV": inv(v4) }));
    await press(page, " ", 8); await sleep(150);
    await sample(`named${n}`, page); add(`named${n}`, koLines(await logs(page)).concat(koLines(await page.locator("#status").innerText())));
    await ctx.close();
  }
  // 5. 죽음: 공격력 큰 몬스터
  ({ ctx, page } = await open("t5", { rl_save: save(10, "a5", {}, { hp: 5, mh: 5 }), rl_level: lv(10, "a5", "hell", [{ ...named(10), atk: 9e9, hp: 2e9, maxHp: 2e9 }]), "rl_inv:g:DEV": inv(v4) }));
  await press(page, " ", 2); await sleep(200);
  await sample("death", page); add("death", koLines(await logs(page)).concat(koLines(await page.locator("body").innerText())));
  await ctx.close();
  // 6. 로비 + 공지 (공지 안 본 상태) + 사람 목록
  ({ ctx, page } = await open("t6", { rl_save: save(10, "a6"), "rl_inv:g:DEV": inv(v4) }, { scene: "lobby", notices: true }));
  await sleep(300);
  await sample("lobby", page); add("lobby", koLines(await logs(page)).concat(koLines(await page.locator("#lobby-list").innerText().catch(() => ""))));
  add("notice", koLines(await page.locator("body").innerText()));
  await page.screenshot({ path: path.join(OUT, `i18n5-lobby-${LANG}.png`) });
  // 7. 추천 탭: 일반·나이트메어·헬·파밍
  await page.keyboard.press("Escape"); await page.evaluate(() => document.querySelectorAll(".notice-close, #notice-close").forEach(b => b.click())); await sleep(100);
  await page.keyboard.press("i"); await sleep(300);
  await page.locator('.inv-tab[data-tab="guide"]').click().catch(() => {}); await sleep(200);
  const tiers = await page.locator(".guide-tier").count();
  for (let i = 0; i < tiers; i++) { await page.locator(".guide-tier").nth(i).click(); await sleep(150); add("guide", koLines(await page.locator("#inv-guide").innerText())); if (i === 2) await page.screenshot({ path: path.join(OUT, `i18n5-guide-${LANG}.png`) }); }
  report.guideTiers = [String(tiers)];
  await ctx.close();
  // 8. 최고 조합 페이지 (탭 전부)
  ({ ctx, page } = await open("t8", {}, { file: "builds.html" }));
  for (const t of ["noUnique", "withUnique", "early", "farm", "unused"]) { await page.locator(`.tabs [data-tab="${t}"]`).click(); await sleep(100); add("builds", koLines(await page.locator("main").innerText())); }
  report.buildsTitle = [await page.title()];
  await page.screenshot({ path: path.join(OUT, `i18n5-builds-${LANG}.png`), fullPage: false });
  await ctx.close();
  // 9. 랭킹 페이지 (서버 없음)
  ({ ctx, page } = await open("t9", {}, { file: "ranking.html" }));
  add("ranking", koLines(await page.locator("body").innerText()));
  report.rankingTitle = [await page.title()];
  await ctx.close();
} finally {
  for (const [k, v] of Object.entries(report)) { const u = [...new Set(v)]; console.log(`== ${k}: ${u.length}`); for (const l of u.slice(0, 15)) console.log("   " + l.slice(0, 170)); }
  if (process.env.SAMPLES) for (const [k, v] of Object.entries(samples)) { console.log(`-- ${k}`); for (const l of v) console.log("   " + l.slice(0, 170)); }
  console.log("errors:", allErrors.length, allErrors.slice(0, 5));
  await browser.close();
}
