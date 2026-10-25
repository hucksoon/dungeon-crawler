// 블로그용 게임 화면 캡처: 저장소의 게임을 브라우저로 띄워 장면마다 찍어 blog/images/에 저장
//   node tools/blog-shots.mjs            # 전부
//   node tools/blog-shots.mjs lobby shop # 이름에 들어간 장면만
// 필요: playwright(전역 설치 → NODE_PATH), Chromium(경로가 다르면 CHROMIUM_PATH)
// 서버 없이 찍음: 랭킹·상점·상자 결과는 가짜 응답. 이름은 게스트·가린 값만 써서 개인정보가 들어가지 않게
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const OUT = process.env.SHOTS_OUT || path.join(REPO, "blog/images");   // SHOTS_OUT: 다른 곳에 찍어 보기
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
// dsf: 화면 배율 (1.6이면 게임 캔버스가 실제 픽셀 그대로 찍힘)
async function open({ file = "", seed = {}, scene = "dungeon", lang = "ko", api = false, viewport = { width: 1100, height: 800 }, loggedIn = false, dsf = 1 }) {
  const dev = "blogshot-device-1";
  const ctx = await browser.newContext({ viewport, locale: lang === "ko" ? "ko-KR" : lang === "ja" ? "ja-JP" : "en-US", deviceScaleFactor: dsf });
  const page = await ctx.newPage(); const errors = [];
  page.on("pageerror", e => errors.push(e.message)); page.on("dialog", d => d.accept());
  await ctx.route(ORIGIN + "**", r => { const f = new URL(r.request().url()).pathname.slice(1) || "index.html";
    if (f === "ranking-config.js") return r.fulfill({ contentType: "text/javascript", body: `window.RANKING_API = ${JSON.stringify(api ? API : "")};` });
    const p = path.join(REPO, f); if (!fs.existsSync(p)) return r.fulfill({ status: 404, body: "" });
    r.fulfill({ contentType: f.endsWith(".js") ? "text/javascript" : f.endsWith(".css") ? "text/css" : f.endsWith(".webp") ? "image/webp" : f.endsWith(".png") ? "image/png" : "text/html", body: fs.readFileSync(p) }); });
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
    // 다 둘러본 것처럼: 바닥과 바닥 옆 벽만 (돌 속까지 벽으로 다 보이지 않게)
    const W = 32, open = (x, y) => x >= 0 && x < W && y >= 0 && y * W < L.map.length && L.map[y * W + x] !== "0";
    if (reveal) L.seen = Array.from(L.map, (_, i) => { const x = i % W, y = (i / W) | 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (open(x + dx, y + dy)) return "1"; return "0"; }).join("");
    if (add) for (const e of add) L.enemies.push({ ...e, x: L.px + e.dx, y: L.py + e.dy });
    localStorage.setItem("rl_level", JSON.stringify(L));
  }, [add, reveal]);
  await o.page.reload(); await sleep(900);
  return o;
}
const press = async (page, keys, gap = 60) => { for (const k of keys) { await page.keyboard.press(k); await sleep(gap); } };

// 움직이는 그림 찍기: 페이지 안에서 keys([키, ms])를 누르며 캔버스를 every ms마다, 플레이어 주변 cols×rows칸만
// 플레이어 위치는 가까이 보기 시점(16×12칸, 지도 끝에서 멈춤, 한 칸 = 캔버스 64px)으로 계산
const record = (page, keys, ms, { cols = 7, rows = 5, every = 40 } = {}) => page.evaluate(([keys, ms, W, H, every]) => new Promise(done => {
  const out = [], t0 = performance.now();
  for (const [key, at] of keys) setTimeout(() => window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })), at);
  const c = document.getElementById("game"), cut = document.createElement("canvas"); cut.width = W; cut.height = H;
  const L = JSON.parse(localStorage.getItem("rl_level")), cx = Math.max(0, Math.min(16, L.px + 0.5 - 8)), cy = Math.max(0, Math.min(12, L.py + 0.5 - 6));
  const sx = Math.max(0, Math.min(1024 - W, (L.px - cx + 0.5) * 64 - W / 2)), sy = Math.max(0, Math.min(768 - H, (L.py - cy + 0.5) * 64 - H / 2));
  const grab = () => { cut.getContext("2d").drawImage(c, sx, sy, W, H, 0, 0, W, H); out.push(cut.toDataURL()); if (performance.now() - t0 < ms) setTimeout(grab, every); else done(out); };
  grab();
}), [keys, ms, cols * 64, rows * 64, every]);

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
  // 픽셀 그림: 게임 화면(캔버스)만 실제 픽셀로. 같은 층을 글자로 보기로도 한 장 더
  // pixel-dungeon·pixel-hell은 전체 지도(rl_view=full), pixel-zoom은 기본 시점(가까이 보기)
  ["pixel-dungeon", "픽셀 그림으로 바뀐 던전", async () => ({ ...await explored({ dsf: 1.6, seed: { rl_view: "full", rl_save: save(7, "blog-px7", { hp: 180, mh: 230, a: 26, g: 410, l: 10 }), "rl_inv:g:DEV": inv(g40.slice(0, 3)) } }, { add: [{ dx: 1, dy: 0, ...M.makeMonster(M.MONSTERS.find(m => m.id === "orc"), "elite", 7) }, { dx: -1, dy: 1, ...M.makeMonster(M.MONSTERS.find(m => m.id === "skeleton"), "normal", 7) }] }),
    shot: "#game", more: [["pixel-text", "같은 층을 예전 글자 화면으로 (글자로 보기)", (page) => page.click("#gfx-btn")]] })],
  ["pixel-hell", "헬 던전도 픽셀 그림으로: 네임드 보스 불가사리", async () => { const o = await explored({ dsf: 1.6, seed: { rl_view: "full", rl_save: save(10, "blog-pxhell", { z: "hell", hp: 21000, mh: 26000, a: 3000 }), "rl_inv:g:DEV": inv(g150) } }, { add: [{ dx: 1, dy: 0, ...M.makeNamedBoss(10), hp: 2e9, maxHp: 2e9, atk: 5 }] }); await press(o.page, [" ", " "], 150); return { ...o, shot: "#game" }; }],
  ["pixel-zoom", "가까이 보기: 플레이어 주변 방 하나 정도만 크게", async () => ({ ...await explored({ dsf: 1.6, seed: { rl_save: save(9, "blog-pxzoom", { hp: 200, mh: 260, a: 28, g: 520, l: 11 }), "rl_inv:g:DEV": inv(g40.slice(0, 3)) } }, { add: [{ dx: 1, dy: 0, ...M.makeMonster(M.MONSTERS.find(m => m.id === "orc"), "elite", 9) }, { dx: -1, dy: -1, ...M.makeMonster(M.MONSTERS.find(m => m.id === "wolf"), "normal", 9) }] }), shot: "#game" })],
  // 플레이어 그림: 장비 없음(속옷만) / 장비를 낀 모습, 공격하는 순간 (몬스터가 앞으로 찌르고 붉게 번쩍)
  ["doll-naked", "장비가 하나도 없으면 속옷만", async () => ({ ...await explored({ dsf: 1.6, seed: { rl_save: save(3, "blog-naked", { hp: 60, mh: 60, a: 5, g: 20, l: 2 }), "rl_inv:g:DEV": inv([]) } }, { add: [{ dx: 1, dy: 0, ...M.makeMonster(M.MONSTERS.find(m => m.id === "rat"), "normal", 3) }] }), shot: "#game" })],
  ["doll-gear", "낀 장비가 등급 색으로 보여요", async () => ({ ...await explored({ dsf: 1.6, seed: { rl_save: save(40, "blog-gear", { hp: 900, mh: 1200, a: 60 }), "rl_inv:g:DEV": inv(g40) } }, { add: [{ dx: 1, dy: 0, ...M.makeMonster(M.MONSTERS.find(m => m.id === "troll"), "elite", 40) }] }), shot: "#game" })],
  // 움직이는 그림(GIF): 페이지 안에서 키를 누르며 캔버스를 40ms마다 찍어서 이어 붙임. 플레이어 주변 7×5칸만
  ["anim-fight", "공격·반격·쓰러짐·걷기 움직임", async () => {
    const o = await explored({ dsf: 1.6, seed: { rl_save: save(40, "blog-anim", { hp: 1e6, mh: 1e6, a: 900 }), "rl_inv:g:DEV": inv(g40.filter(it => it.slot !== "offhand")) } },
      { add: [{ dx: 1, dy: 0, ...M.makeMonster(M.MONSTERS.find(m => m.id === "minotaur"), "normal", 40), hp: 1e9, maxHp: 1e9, atk: 40 }, { dx: 0, dy: 1, ...M.makeMonster(M.MONSTERS.find(m => m.id === "orc"), "normal", 40), hp: 1, maxHp: 1, atk: 0 }] });
    await sleep(800);
    return { ...o, frames: await record(o.page, [["ArrowRight", 150], ["ArrowRight", 750], ["ArrowDown", 1350], ["ArrowDown", 1950], ["ArrowUp", 2350]], 2900) }; }],
  ["anim-walk", "걷기: 한 걸음마다 통통 뛰고 좌우로 뒤뚱, 발밑에 먼지", async () => {
    const o = await explored({ dsf: 1.6, seed: { rl_save: save(5, "blog-walk", { hp: 1e6, mh: 1e6, a: 900 }), "rl_inv:g:DEV": inv(g40) } });
    await o.page.evaluate(() => { const L = JSON.parse(localStorage.getItem("rl_level")); L.enemies = []; localStorage.setItem("rl_level", JSON.stringify(L)); });
    await o.page.reload(); await sleep(900);
    // 갈 수 있는 쪽으로 왔다 갔다 (벽이면 반대로)
    const keys = await o.page.evaluate(() => { const L = JSON.parse(localStorage.getItem("rl_level")), open = (x, y) => L.map[y * 32 + x] !== "0";
      const [a, b] = open(L.px - 1, L.py) && open(L.px - 2, L.py) ? ["ArrowLeft", "ArrowRight"] : ["ArrowRight", "ArrowLeft"];
      return [a, a, b, b, b, b, a, a].map((k, i) => [k, 120 + i * 300]); });
    return { ...o, frames: await record(o.page, keys, 2700, { cols: 5, rows: 3, every: 50 }), delay: 5 }; }],
  // 점프: 앞을 막은 몬스터를 넘어 2칸 (J + 방향). 갈 수 있는 쪽을 찾아 몬스터를 그 앞에 둠
  ["anim-jump", "점프: 앞을 막은 몬스터를 훌쩍 넘어 2칸", async () => {
    const o = await explored({ dsf: 1.6, seed: { rl_save: save(8, "blog-jump", { hp: 1e6, mh: 1e6, a: 30 }), "rl_inv:g:DEV": inv(g40) } });
    const dir = await o.page.evaluate(() => { const L = JSON.parse(localStorage.getItem("rl_level")), open = (x, y) => L.map[y * 32 + x] !== "0" && !L.enemies.some(e => e.x === x && e.y === y);
      const d = [[1, 0, "ArrowRight"], [-1, 0, "ArrowLeft"], [0, 1, "ArrowDown"], [0, -1, "ArrowUp"]].find(([dx, dy]) => open(L.px + dx, L.py + dy) && open(L.px + dx * 2, L.py + dy * 2) && open(L.px + dx * 3, L.py + dy * 3));
      L.enemies = L.enemies.filter(e => Math.abs(e.x - L.px) + Math.abs(e.y - L.py) > 4); localStorage.setItem("rl_level", JSON.stringify(L)); return d; });
    await o.page.evaluate(([dx, dy, id, m]) => { const L = JSON.parse(localStorage.getItem("rl_level")); L.enemies.push({ ...m, x: L.px + dx, y: L.py + dy }); localStorage.setItem("rl_level", JSON.stringify(L)); },
      [dir[0], dir[1], 0, { ...M.makeMonster(M.MONSTERS.find(m => m.id === "troll"), "normal", 8), hp: 1e9, maxHp: 1e9, atk: 1 }]);
    await o.page.reload(); await sleep(900);
    return { ...o, frames: await record(o.page, [["j", 300], [dir[2], 450]], 1500, { cols: 6, rows: 4, every: 40 }) }; }],
  // 세트 스킬 이펙트 GIF: 세트 2개 + 흡혈 지팡이, 주변에 단단한 몬스터. 제자리 대기(Space)만 → 2턴마다 스킬
  ...[["skill-fire", "파이어볼: 날아가서 3×3으로 터짐", [513, 806]], ["skill-frost", "프로스트 노바: 얼음 고리가 퍼짐", [96, 775]], ["skill-storm", "체인 라이트닝: 번개가 차례로 튕김", [56, 464]]].map(([name, caption, ks]) => [name, caption, async () => {
    const gear = [...ks.map(k => I.generate(`fx|n20|k${k}`, "golden", 95)), I.generate("ls|k10", "golden", 40)];
    const foe = (dx, dy, id) => ({ dx, dy, ...M.makeMonster(M.MONSTERS.find(m => m.id === id), "normal", 20), hp: 1e9, maxHp: 1e9, atk: 1 });
    const o = await explored({ dsf: 1.6, seed: { rl_save: save(20, `blog-${name}`, { hp: 5000, mh: 1e6, a: 400 }), "rl_inv:g:DEV": inv(gear) } },
      { add: [foe(1, 0, "orc"), foe(-1, 1, "goblin"), foe(2, -1, "skeleton"), foe(0, -1, "kobold"), foe(-2, 0, "wolf")] });
    await sleep(800);
    return { ...o, frames: await record(o.page, [" ", " ", " ", " ", " "].map((k, i) => [k, 100 + i * 480]), 2500) }; }]),
  // 흡혈: 공격하면 맞은 숫자(흰색)와 함께 플레이어 위에 찬 HP가 초록 +N (화면 글자라 #stage를 찍음)
  ["heal-green", "흡혈로 찬 HP는 초록 숫자로", async () => {
    const o = await explored({ dsf: 1.6, seed: { rl_save: save(20, "blog-heal", { hp: 5000, mh: 1e6, a: 2000 }), "rl_inv:g:DEV": inv([I.generate("ls|k10", "golden", 40)]) } },
      { add: [{ dx: 1, dy: 0, ...M.makeMonster(M.MONSTERS.find(m => m.id === "orc"), "normal", 20), hp: 1e9, maxHp: 1e9, atk: 1 }] });
    await sleep(700); await o.page.keyboard.press("ArrowRight"); await sleep(330);
    return { ...o, shot: "#stage", nowait: true }; }],
  ["pixel-dex", "도감에도 몬스터 그림", async () => { const seen = Object.fromEntries([...M.MONSTERS.slice(0, 30).map(m => m.id), ...M.BOSSES.map(b => b.id)].map(k => [k, true])); const o = await open({ seed: { rl_save: save(30, "blog-pxdex"), "rl_dex:g:DEV": JSON.stringify({ seen, kills: Object.fromEntries(Object.keys(seen).map((k, i) => [k, 3 + i * 7])) }) } }); await press(o.page, ["b"]); await sleep(300); await o.page.evaluate(() => document.querySelectorAll("#dex-modal, #dex-modal *").forEach(e => { e.scrollTop = 0; })); return o; }],
];

fs.mkdirSync(OUT, { recursive: true });
const done = [];
try {
  for (const [name, caption, shoot] of SCENES) {
    if (only.length && !only.some(s => name.includes(s))) continue;
    const { ctx, page, errors, shot, more = [], nowait = false, frames, delay = 4 } = await shoot();
    if (frames) {   // 움직이는 그림: 프레임을 이어 GIF로 (ImageMagick)
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gif-"));
      frames.forEach((f, i) => fs.writeFileSync(path.join(dir, `${String(i).padStart(3, "0")}.png`), Buffer.from(f.split(",")[1], "base64")));
      execFileSync("convert", ["-delay", String(delay), "-loop", "0", ...fs.readdirSync(dir).sort().map(f => path.join(dir, f)), "-layers", "Optimize", path.join(OUT, `${name}.gif`)]);
      fs.rmSync(dir, { recursive: true, force: true });
      done.push(`${name}.gif — ${caption} (${frames.length}프레임)${errors.length ? ` (페이지 오류 ${errors.length}: ${errors[0].slice(0, 80)})` : ""}`);
      await ctx.close();
      continue;
    }
    // shot: 그 부분만 찍기, more: 이어서 [이름, 설명, 할 일]로 더 찍기, nowait: 움직이는 순간을 바로 찍기
    const snap = (n) => (shot ? page.locator(shot).screenshot({ path: path.join(OUT, `${n}.png`), animations: "allow" }) : page.screenshot({ path: path.join(OUT, `${n}.png`) }));
    if (!nowait) await sleep(500);
    await snap(name);
    done.push(`${name}.png — ${caption}${errors.length ? ` (페이지 오류 ${errors.length}: ${errors[0].slice(0, 80)})` : ""}`);
    for (const [n, c, act] of more) { await act(page); await sleep(400); await snap(n); done.push(`${n}.png — ${c}`); }
    await ctx.close();
  }
} finally { await browser.close(); }
console.log(done.join("\n"));
