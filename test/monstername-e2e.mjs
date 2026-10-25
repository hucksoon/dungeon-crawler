// 저장된 층의 몬스터 이름: 한국어로 만든 층(언어 표시 없음 = 예전 층)을 영어로 열면 이름이 영어로 (분신·황금 고블린·네임드·나이트메어·헬 포함),
// 한국어로 열면 그대로, 영어로 저장된 층(lang: "en")을 한국어로 열면 한국어로
import { createRequire } from "node:module";
import fs from "node:fs"; import path from "node:path";
const require = createRequire(process.env.NODE_PATH + "/");
const { chromium } = require("playwright");
const REPO = path.resolve(process.argv[2]), OUT = process.argv[3];
const M = createRequire(import.meta.url)(path.join(REPO, "monsters.js"));
const ORIGIN = "https://game.apacimtest.com/";
const results = []; const check = (n, ok, x = "") => { results.push(!!ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x && !ok ? " — " + x : ""}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const MAP_W = 32, MAP_H = 24;
const map = Array.from({ length: MAP_H }, (_, y) => Array.from({ length: MAP_W }, (_, x) => (x === 0 || y === 0 || x === MAP_W - 1 || y === MAP_H - 1 ? 0 : 1)));
const lv = (d, rid, z, enemies) => JSON.stringify({ rid, d, z, turn: 0, map: map.map(r => r.join("")).join(""), seen: "1".repeat(MAP_W * MAP_H), px: 2, py: 2, shop: null, enemies, items: [] });
const save = (d, rid) => JSON.stringify({ v: 1, season: 4, best: 75, clr: 1, nb: 50, nclr: 1, hb: d, run: { d, hp: 9e6, mh: 9e6, a: 30, g: 500, l: 40, x: 0, xn: 1e12, rid, k: 0, pp: 0, z: "hell" } });
// 한국어로 만든 몬스터들 (멀리 놓아서 싸우지 않음)
const at = (m, x, y) => ({ ...m, x, y, hp: 1e9, maxHp: 1e9, atk: 0 });
const gumi = M.makeNamedBoss(20);
const enemies = [
  at(M.makeHell(M.MONSTERS.find(m => m.id === "demon"), "elite", 20, "ice"), 20, 5),
  at(M.makeNightmare(M.MONSTERS.find(m => m.id === "wolf"), "normal", 5, "fire"), 22, 5),
  at(gumi, 24, 8),
  at({ id: gumi.id, ch: "g", name: `${gumi.name}의 분신`, color: gumi.color, kind: "elite", clone: true, el: gumi.el, res: gumi.res, hell: 1, hp: 5, maxHp: 5, atk: 0, def: 0, xp: 0 }, 26, 8),
  at(M.makeGolden(30, "king"), 28, 12),
];
const koNames = enemies.map(e => e.name);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
async function names(query, locale, savedLang = null, savedNames = null) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 }, locale }); const page = await ctx.newPage(); const errors = [];
  page.on("pageerror", e => errors.push(e.message)); page.on("dialog", d => d.dismiss());
  await ctx.route(ORIGIN + "**", r => { const f = new URL(r.request().url()).pathname.slice(1) || "index.html";
    if (f === "ranking-config.js") return r.fulfill({ contentType: "text/javascript", body: `window.RANKING_API = "";` });
    const p = path.join(REPO, f); if (!fs.existsSync(p)) return r.fulfill({ status: 404, body: "" });
    r.fulfill({ contentType: f.endsWith(".js") ? "text/javascript" : "text/html", body: fs.readFileSync(p) }); });
  await ctx.route("https://login.xsolla.com/**", r => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await ctx.addInitScript(([s, l]) => { if (sessionStorage.getItem("seeded")) return; sessionStorage.setItem("seeded", 1); sessionStorage.setItem("rl_scene", "dungeon");
    localStorage.setItem("rl_device_id", "mnames"); localStorage.setItem("rl_save", s); localStorage.setItem("rl_level", l);
    for (const k of ["rl_notice_v4", "rl_notice_75", "rl_notice_1021g", "rl_notice_1021h", "rl_notice_1021i", "rl_notice_1021j", "rl_notice_1022a", "rl_notice_1022b", "rl_notice_1023a", "rl_notice_1023b", "rl_notice_1023c", "rl_notice_1023d", "rl_notice_1025a"]) localStorage.setItem(`${k}:g:mnames`, "1"); },
    [save(20, "mn1"), savedLang ? JSON.stringify({ ...JSON.parse(lv(20, "mn1", "hell", enemies.map((e, i) => ({ ...e, name: savedNames[i] })))), lang: savedLang }) : lv(20, "mn1", "hell", enemies)]);
  await page.goto(ORIGIN + query); await sleep(600);
  await page.keyboard.press("."); await sleep(300);   // 한 턴 → 층 저장
  const L = await page.evaluate(() => JSON.parse(localStorage.getItem("rl_level")));
  await ctx.close();
  return { names: L.enemies.map(e => e.name), errors };
}
try {
  const en = await names("?lang=en", "en-US");
  const want = ["Frost Hell Elite Demon", "Blazing Nightmare Wolf", "Gumiho", "Gumiho's Clone", "Golden Goblin King"];
  check("Korean floor opened in English: monsters renamed", JSON.stringify(en.names) === JSON.stringify(want), JSON.stringify(en.names));
  check("no page errors (en)", en.errors.length === 0, en.errors.join("; "));
  const ja = await names("?lang=ja", "ja-JP");
  check("Japanese: no Korean left in monster names", ja.names.every(n => !/[가-힣]/.test(n)) && ja.names[3] === "九尾の狐の分身", JSON.stringify(ja.names));
  const ko = await names("?lang=ko", "ko-KR");
  check("Korean: names unchanged", JSON.stringify(ko.names) === JSON.stringify(koNames), JSON.stringify([ko.names, koNames]));
  const back = await names("?lang=ko", "ko-KR", "en", en.names);
  check("floor saved in English, opened in Korean: back to Korean names", JSON.stringify(back.names) === JSON.stringify(koNames), JSON.stringify(back.names));
} finally { await browser.close(); }
console.log(`${results.filter(Boolean).length}/${results.length} passed`);
