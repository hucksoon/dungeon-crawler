// 블로그용 게임 화면 캡처: 저장소의 게임을 브라우저로 띄워 장면마다 찍어 blog/images/에 저장
//   node tools/blog-shots.mjs            # 전부
//   node tools/blog-shots.mjs lobby shop # 이름에 들어간 장면만
// 필요: playwright(전역 설치 → NODE_PATH), Chromium(경로가 다르면 CHROMIUM_PATH)
// 서버 없이 찍음: 랭킹·상점·상자 결과는 가짜 응답. 이름은 게스트·가린 값만 써서 개인정보가 들어가지 않게
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const OUT = path.join(REPO, "blog/images");
const require = createRequire((process.env.NODE_PATH || "/usr/lib/node_modules") + "/");
const { chromium } = require("playwright");
const local = createRequire(import.meta.url);
const I = local(path.join(REPO, "items.js")), M = local(path.join(REPO, "monsters.js"));
const ORIGIN = "https://game.apacimtest.com/", API = "https://api.test/api.php", STORE = "https://store.xsolla.com/api/v2/project/317991";
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const only = process.argv.slice(2);

// ---- 게임 상태 만들기 ----
const MAP_W = 32, MAP_H = 24;
const baseMap = () => Array.from({ length: MAP_H }, (_, y) => Array.from({ length: MAP_W }, (_, x) => (x === 0 || y === 0 || x === MAP_W - 1 || y === MAP_H - 1 ? 0 : 1)));
const level = (d, rid, z, enemies = [], extra = {}) => { const m = baseMap(); m[12][20] = 2; return JSON.stringify({ rid, d, z, turn: 1, map: m.map(r => r.join("")).join(""), seen: "1".repeat(MAP_W * MAP_H), px: 10, py: 12, shop: null, enemies, items: [], ...extra }); };
const gear = (lvl, src = "golden", tag = "blog") => I.SLOTS.map((s, i) => { for (let k = 0; k < 400; k++) { const it = I.generate(`${tag}|${s}|${i}|${k}`, src, lvl); if (it.slot === s && ["legendary", "set", "epic"].includes(it.rarity)) return it; } return I.generate(`${tag}|${s}`, src, lvl); });
const equipOf = (its) => { const e = Object.fromEntries(I.SLOTS.map(s => [s, null])); for (const it of its) if (it.slot in e && !e[it.slot]) e[it.slot] = { ...it, enh: 6 }; return e; };
const inv = (equip, bag = []) => JSON.stringify({ bag, equip: equipOf(equip), log: [], stones: 12 });
const save = (d, rid, run = {}, extra = {}) => JSON.stringify({ v: 1, season: 4, best: Math.max(d, 40), clr: 1, nb: 50, nclr: 1, hb: 20, ...extra, run: { d, hp: 900, mh: 1200, a: 60, g: 18500, l: 42, x: 0, xn: 1e9, rid, k: 120, pp: 0, ...run } });
const mob = (id, x, y, extra = {}) => { const m = M.MONSTERS.find(q => q.id === id) || M.MONSTERS[0]; return { id: m.id, name: m.name, ch: m.ch, color: m.color, hp: 50, maxHp: 50, atk: 3, def: 1, xp: 3, x, y, ...extra }; };
const NOTICES = ["rl_notice_v4", "rl_notice_75", "rl_notice_1021g", "rl_notice_1021h", "rl_notice_1021i", "rl_notice_1021j", "rl_notice_1022a", "rl_notice_1022b", "rl_notice_1023a", "rl_notice_1023b", "rl_notice_1023c", "rl_notice_1023d"];

// ---- 가짜 서버 ----
function rankingRows() {
  // 예시 화면: 실제 사람처럼 보이지 않게 모두 게스트 번호로
  const names = ["게스트 #3fa2c1", "게스트 #a81d05", "게스트 #9b07de", "게스트 #c4e690", "게스트 #51c8a0", "게스트 #7f2b3e", "게스트 #e2d417", "게스트 #07ab9c"];
  return names.map((name, i) => { const it = I.generate(`blogrank|${i}`, "golden", 70 - i * 6);
    return { rank: i + 1, id: `b${i}`.padEnd(16, "0"), name, guest: name.startsWith("게스트"), stage: 76 - i * 7, bought: false, itemBought: false, item: { rarity: it.rarity, enh: 10 - i, lvl: it.lvl, name: I.itemName(it), ref: null } }; });
}
const json = (r, o, status = 200) => r.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*" }, body: JSON.stringify(o) });

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
async function open({ file = "", seed = {}, scene = "dungeon", lang = "ko", api = false, viewport = { width: 1100, height: 800 }, loggedIn = false }) {
  const dev = "blogshot-device-1";
  const ctx = await browser.newContext({ viewport, locale: lang === "ko" ? "ko-KR" : lang === "ja" ? "ja-JP" : "en-US", deviceScaleFactor: 1 });
  const page = await ctx.newPage(); const errors = [];
  page.on("pageerror", e => errors.push(e.message)); page.on("dialog", d => d.accept());
  await ctx.route(ORIGIN + "**", r => { const f = new URL(r.request().url()).pathname.slice(1) || "index.html";
    if (f === "ranking-config.js") return r.fulfill({ contentType: "text/javascript", body: `window.RANKING_API = ${JSON.stringify(api ? API : "")};` });
    const p = path.join(REPO, f); if (!fs.existsSync(p)) return r.fulfill({ status: 404, body: "" });
    r.fulfill({ contentType: f.endsWith(".js") ? "text/javascript" : f.endsWith(".css") ? "text/css" : "text/html", body: fs.readFileSync(p) }); });
  await ctx.route("https://api.test/**", r => { const u = new URL(r.request().url()), route = u.searchParams.get("r");
    if (r.request().method() === "OPTIONS") return r.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*" } });
    if (route === "ranking") return json(r, { type: u.searchParams.get("type") || "stage", season: "v4", seasonName: "v4 베타", current: true, total: 8, updatedAt: Date.now(), rows: rankingRows() });
    if (route === "geo") return json(r, { country: lang === "ja" ? "JP" : lang === "en" ? "US" : "KR" });
    if (route === "box_order") return json(r, { ready: true, revoked: false, mail: 10, items: Array.from({ length: 10 }, (_, i) => { const it = I.generate(`box|o77001234|${i}`, "box", 40); return { seed: it.seed, src: "box", lvl: it.lvl, v: 4, r: 8, enh: 0, id: it.id }; }) });
    return json(r, {}); });
  await ctx.route(STORE + "/**", r => { const p = new URL(r.request().url()).pathname.replace("/api/v2/project/317991", "");
    if (r.request().method() === "OPTIONS") return r.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*" } });
    if (p === "/items/virtual_currency/package") return json(r, { items: [["cash_10", 10, "0.99"], ["cash_55", 55, "4.99"], ["cash_120", 120, "9.99"]].map(([sku, n, usd], i) => ({ sku, name: `캐시 ${n}`, groups: [{ external_id: "cash_packs" }], price: { amount: usd, currency: "USD" }, content: [{ sku: "cash", quantity: n }], promotions: i ? [{ bonus: [{ sku: "cash", quantity: n / 11 | 0 }] }] : [] })) });
    if (p === "/items/virtual_items") return json(r, { items: [1, 10, 50].map(n => ({ sku: `box_equipment_${n}`, name: `장비 상자 ${n}회`, description: `무기 또는 방어구 ${n}개`, groups: [{ external_id: "equipment_boxes" }], virtual_prices: [{ sku: "cash", amount: n === 1 ? 10 : n === 10 ? 90 : 400 }] })) });
    if (p === "/user/virtual_currency_balance") return json(r, { items: [{ sku: "cash", amount: 500 }] });
    if (p === "/user/inventory/items") return json(r, { items: [] });
    if (/\/payment\/item\//.test(p)) return json(r, { order_id: 77001234 });
    return r.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } }); });
  await ctx.route("https://login.xsolla.com/**", r => json(r, []));
  await ctx.route(/googlesyndication|doubleclick|google-analytics|googletagmanager/, r => r.abort());
  const b64u = (s) => Buffer.from(s).toString("base64url");
  const auth = loggedIn ? JSON.stringify({ access: `${b64u('{"alg":"none"}')}.${b64u(JSON.stringify({ sub: "blog-shot-user", exp: 4e9 }))}.x`, refresh: "r", exp: Date.now() + 36e5 }) : null;
  await ctx.addInitScript(([seed, dev, scene, N, lang, auth]) => { if (sessionStorage.getItem("seeded")) return; sessionStorage.setItem("seeded", 1); sessionStorage.setItem("rl_scene", scene);
    localStorage.setItem("rl_device_id", dev); for (const k of N) localStorage.setItem(`${k}:g:${dev}`, "1");
    localStorage.setItem("rl_game_lang", lang); localStorage.setItem("rl_lang", lang); if (auth) localStorage.setItem("rl_auth", auth);
    for (const [k, v] of Object.entries(seed)) localStorage.setItem(k.replace("DEV", dev), v); }, [seed, dev, scene, NOTICES, lang, auth]);
  await page.goto(ORIGIN + file); await sleep(900);
  return { ctx, page, errors };
}
// 게임이 실제로 만든 층을 쓰고, 지도를 모두 밝힌 뒤(탐험한 것처럼) 다시 불러옴. add: 플레이어 옆에 몬스터 넣기
async function explored(opts, { add = null, reveal = 1 } = {}) {
  const o = await open(opts);
  await o.page.keyboard.press(" "); await sleep(300);   // 한 턴 쉬면 층이 저장됨
  await o.page.evaluate(([add, reveal]) => {
    const L = JSON.parse(localStorage.getItem("rl_level"));
    if (reveal) L.seen = "1".repeat(L.seen.length);
    if (add) for (const e of add) L.enemies.push({ ...e, x: L.px + e.dx, y: L.py + e.dy });
    localStorage.setItem("rl_level", JSON.stringify(L));
  }, [add, reveal]);
  await o.page.reload(); await sleep(900);
  return o;
}
const press = async (page, keys, gap = 60) => { for (const k of keys) { await page.keyboard.press(k); await sleep(gap); } };

// ---- 장면: 이름, 설명(그림 아래 글), 찍기 ----
const g40 = gear(40), g90 = gear(90, "golden", "blognm"), g150 = gear(150, "golden", "bloghell");
const SCENES = [
  ["dungeon", "던전 탐험 화면", async () => explored({ seed: { rl_save: save(6, "blog-d6", { hp: 160, mh: 210, a: 24, g: 340, l: 9 }), "rl_inv:g:DEV": inv(g40.slice(0, 3)) } })],
  ["inventory", "인벤토리와 장비", async () => { const o = await open({ seed: { rl_save: save(30, "blog-inv"), "rl_inv:g:DEV": inv(g40, gear(30, "drop", "blogbag").slice(0, 6)) } }); await press(o.page, ["i"]); await sleep(400); await o.page.locator(".slot, .equip-slot, [data-slot]").first().click().catch(() => {}); return o; }],
  ["mobile", "휴대폰 화면", async () => explored({ viewport: { width: 390, height: 844 }, seed: { rl_save: save(12, "blog-mobile", { hp: 240, mh: 330, a: 31, g: 820, l: 14 }), "rl_inv:g:DEV": inv(g40.slice(0, 4)) } })],
  ["ranking", "랭킹 페이지", async () => open({ file: "ranking.html", api: true })],
  ["lobby", "여러 사람이 모이는 로비", async () => open({ scene: "lobby", seed: { rl_save: save(40, "blog-lobby"), "rl_inv:g:DEV": inv(g40) } })],
  ["nightmare", "나이트메어 던전", async () => explored({ seed: { rl_save: save(18, "blog-nm", { z: "nm", hp: 4200, mh: 5000 }), "rl_inv:g:DEV": inv(g90) } })],
  ["hell-named", "헬 던전 네임드 보스와의 전투", async () => { const o = await explored({ seed: { rl_save: save(10, "blog-hell", { z: "hell", hp: 21000, mh: 26000, a: 3000 }), "rl_inv:g:DEV": inv(g150) } }, { add: [{ dx: 1, dy: 0, ...M.makeNamedBoss(10), hp: 2e9, maxHp: 2e9, atk: 5 }] }); await press(o.page, [" ", " ", " ", " "], 150); return o; }],
  ["fireset", "화염의 세트 5개를 모두 입은 능력치 화면", async () => {
    const fire = [4, 751, 1373, 1818, 2642].map(k => I.generate(`bfire|n20|k${k}`, "golden", 95));
    const o = await open({ seed: { rl_save: save(20, "blog-fire", { z: "nm", hp: 5000, mh: 6000 }), "rl_inv:g:DEV": inv([...fire, ...g90]) } });
    await press(o.page, ["i"]); await sleep(300);
    await o.page.locator('.inv-tab[data-tab="stats"]').click().catch(() => {}); await sleep(200);
    await o.page.locator("#inv-stats details summary, details summary").first().click().catch(() => {});
    return o; }],
  ["dex", "몬스터 도감", async () => { const seen = Object.fromEntries([...M.MONSTERS.slice(0, 30).map(m => m.id), ...M.BOSSES.map(b => b.id)].map(k => [k, true])); const o = await open({ seed: { rl_save: save(30, "blog-dex"), "rl_dex:g:DEV": JSON.stringify({ seen, kills: Object.fromEntries(Object.keys(seen).map((k, i) => [k, 3 + i * 7])) }) } }); await press(o.page, ["b"]); return o; }],
  ["guide", "추천 장비 탭", async () => { const o = await open({ seed: { rl_save: save(30, "blog-guide"), "rl_inv:g:DEV": inv(g40) } }); await press(o.page, ["i"]); await sleep(300); await o.page.locator('.inv-tab[data-tab="guide"]').click().catch(() => {}); await sleep(300); await o.page.locator(".guide-tier").nth(2).click().catch(() => {}); return o; }],
  ["builds", "최고 조합 페이지", async () => open({ file: "builds.html" })],
  ["shop", "캐시와 장비 상자 상점", async () => open({ file: "shop.html", api: true, loggedIn: true })],
  ["shopbox", "서버가 열어 준 장비 상자", async () => { const o = await open({ file: "shop.html", api: true, loggedIn: true }); await o.page.locator('#boxes .card[data-sku="box_equipment_10"] button.primary').click(); await o.page.locator("#box-items > div").nth(9).waitFor({ timeout: 8000 }).catch(() => {}); await sleep(2200); return o; }],
  ["lang-en", "영어로 바뀐 로비", async () => open({ scene: "lobby", lang: "en", seed: { rl_save: save(40, "blog-en"), "rl_inv:g:DEV": inv(g40) } })],
  ["lang-ja", "일본어로 바뀐 인벤토리", async () => { const o = await open({ lang: "ja", seed: { rl_save: save(30, "blog-ja"), "rl_inv:g:DEV": inv(g40) } }); await press(o.page, ["i"]); return o; }],
];

fs.mkdirSync(OUT, { recursive: true });
const done = [];
try {
  for (const [name, caption, shoot] of SCENES) {
    if (only.length && !only.some(s => name.includes(s))) continue;
    const { ctx, page, errors } = await shoot();
    await sleep(500);
    await page.screenshot({ path: path.join(OUT, `${name}.png`) });
    done.push(`${name}.png — ${caption}${errors.length ? ` (페이지 오류 ${errors.length}: ${errors[0].slice(0, 80)})` : ""}`);
    await ctx.close();
  }
} finally { await browser.close(); }
console.log(done.join("\n"));
