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
import { goDoor } from "../test/town.mjs";   // 마을(옆에서 보는 로비) 문까지 걸어가 ↑
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
const save = (d, rid, run = {}, extra = {}) => JSON.stringify({ v: 1, f50: 1, season: 4, best: Math.max(d, 40), clr: 1, nb: 50, nclr: 1, hb: 20, ...extra, run: { d, hp: 900, mh: 1200, a: 60, g: 18500, l: 42, x: 0, xn: 1e9, rid, k: 120, pp: 0, ...run } });
const mob = (id, x, y, extra = {}) => { const m = M.MONSTERS.find(q => q.id === id) || M.MONSTERS[0]; return { id: m.id, name: m.name, ch: m.ch, color: m.color, hp: 50, maxHp: 50, atk: 3, def: 1, xp: 3, x, y, ...extra }; };
const NOTICES = ["rl_notice_v4", "rl_notice_75", "rl_notice_1021g", "rl_notice_1021h", "rl_notice_1021i", "rl_notice_1021j", "rl_notice_1022a", "rl_notice_1022b", "rl_notice_1023a", "rl_notice_1023b", "rl_notice_1023c", "rl_notice_1023d", "rl_notice_1025a"];

// ---- 가짜 서버 ----
function rankingRows() {
  // 예시 화면: 실제 사람처럼 보이지 않게 모두 게스트 번호로
  const names = ["게스트 #3fa2c1", "게스트 #a81d05", "게스트 #9b07de", "게스트 #c4e690", "게스트 #51c8a0", "게스트 #7f2b3e", "게스트 #e2d417", "게스트 #07ab9c"];
  return names.map((name, i) => { const it = I.generate(`blogrank|${i}`, "golden", 70 - i * 6);
    return { rank: i + 1, id: `b${i}`.padEnd(16, "0"), name, guest: name.startsWith("게스트"), stage: 51 - i * 5, bought: false, itemBought: false, item: { rarity: it.rarity, enh: 10 - i, lvl: it.lvl, name: I.itemName(it), ref: null } }; });
}
// 블로그용 무료 선물: 헬 30층까지 간 사람 (구미호의 유니크 + 지옥의 세트 2개, 서버 bonus_make와 같은 시드 모양)
function giftOffers() {
  const id = "b10950b10950b109", ref = (it) => ({ seed: it.seed, src: it.src, lvl: it.lvl, v: 4, enh: 0, r: I.RULES_REV, id: it.id });
  const uq = Object.keys(I.UNIQUE.items).find(k => I.UNIQUE.items[k].boss === 20 && !I.UNIQUE.items[k].acc), U = I.UNIQUE.items[uq];
  let u = null; for (let i = 0; !u; i++) { const it = I.generateUnique(`bonus|${id}|j${U.boss}|u${i}`, M.HELL.itemBase + U.boss); if (it.uq === uq) u = it; }
  const sets = []; for (let k = 1; sets.length < 2; k++) for (let i = 0; i < 5000; i++) { const it = I.generate(`bonus|${id}|j30|s${k}_${i}`, "boss", M.HELL.itemBase + 30); if (it.rarity === "set" && !sets.some(x => x.slot === it.slot) && it.slot !== u.slot) { sets.push(it); break; } }
  return [sets[0], u, sets[1]].map(ref);
}
const json = (r, o, status = 200) => r.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*" }, body: JSON.stringify(o) });

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
// dsf: 화면 배율 (1.6이면 게임 캔버스가 실제 픽셀 그대로 찍힘)
// touch: 휴대폰처럼 (터치 화면 → 터치 버튼이 보임)
async function open({ file = "", seed = {}, scene = "dungeon", lang = "ko", api = false, viewport = { width: 1100, height: 800 }, loggedIn = false, dsf = 1, touch = false, others = null, staff = false, portal = false }) {
  const dev = "blogshot-device-1";
  const ctx = await browser.newContext({ viewport, locale: lang === "ko" ? "ko-KR" : lang === "ja" ? "ja-JP" : "en-US", deviceScaleFactor: dsf, ...(touch ? { isMobile: true, hasTouch: true } : {}) });
  const page = await ctx.newPage(); const errors = [];
  page.on("pageerror", e => errors.push(e.message)); page.on("dialog", d => d.accept());
  await ctx.route(ORIGIN + "**", r => { const f = new URL(r.request().url()).pathname.slice(1) || "index.html";
    if (f === "ranking-config.js") return r.fulfill({ contentType: "text/javascript", body: `window.RANKING_API = ${JSON.stringify(api ? API : "")};` });
    const p = path.join(REPO, f); if (!fs.existsSync(p)) return r.fulfill({ status: 404, body: "" });
    r.fulfill({ contentType: f.endsWith(".js") ? "text/javascript" : f.endsWith(".css") ? "text/css" : f.endsWith(".webp") ? "image/webp" : f.endsWith(".png") ? "image/png" : "text/html", body: fs.readFileSync(p) }); });
  await ctx.route("https://api.test/**", r => { const u = new URL(r.request().url()), route = u.searchParams.get("r");
    if (r.request().method() === "OPTIONS") return r.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*" } });
    if (route === "ranking") return json(r, { type: u.searchParams.get("type") || "stage", season: "v4", seasonName: "정식 v1", current: true, total: 8, updatedAt: Date.now(), rows: rankingRows() });
    // others: 마을에 함께 있는 사람 (게스트 번호만)
    // staff: 운영자 기기만 들어가는 곳(점프 던전, dc#96)을 찍을 때. 화면에는 운영자 표시가 나오지 않게 장면만
    if (route === "lobby" && staff) return json(r, { me: { id: "me".padEnd(16, "0"), name: "게스트 #b10950", unlimited: true }, players: [], mail: 0 });
    if (route === "lobby" && others) return json(r, { me: { id: "me".padEnd(16, "0"), name: "게스트 #b10950" }, players: others.map(([name, x]) => ({ id: name.slice(-6).padEnd(16, "0"), name, scene: "lobby", x, y: 10 })), mail: 0 });
    if (route === "geo") return json(r, { country: lang === "ja" ? "JP" : lang === "en" ? "US" : "KR" });
    // 무료 선물 (dc#105): 받을 수 있음 → 광고 → 헬 선물 (유니크 1 + 지옥의 세트 2)
    if (route === "bonus_status") return json(r, { hours: 3, ready: true, pending: null, nextAt: Date.now(), tier: "hell", cash: { chance: 0.1, min: 1, max: 3 } });
    if (route === "entry_status") return json(r, { day: "2026-10-28", free: 5, used: 0, left: 5, unlimited: false, ads: { entry: 30, revive: 1, fee: 3, bonus: 8 }, adCaps: { entry: 30, revive: 1, fee: 3, bonus: 8 }, adMinSeconds: 1 });
    if (route === "ad_start") return json(r, { ticket: "0".repeat(16), minSeconds: 1, left: 7 });
    if (route === "bonus_open") return json(r, { hours: 3, ready: false, nextAt: null, tier: "hell", cash: { chance: 0.1, min: 1, max: 3 }, pending: { id: "b10950b10950b109", tier: "hell", offers: giftOffers(), createdAt: Date.now() } });
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
  // portal: 포털 빌드(dc#102)처럼 window.RL_PORTAL을 넣음 (광고는 바로 끝남)
  if (portal) await ctx.addInitScript(() => { window.RL_PORTAL = { name: "blog", loadingDone() {}, gameplay() {}, commercialBreak: async () => {}, rewardedBreak: async () => true }; });
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
  await o.page.keyboard.press("."); await sleep(300);   // 한 턴 쉬면 층이 저장됨
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
  // 정식 v1 (dc#98): 일반 던전 50층, 51 = 50층 완료
  ["ranking-v1", "랭킹: 정식 v1, 50층 완료 ✓", async () => open({ file: "ranking.html", api: true, dsf: 1.6 })],
  ["lobby", "여러 사람이 모이는 로비", async () => open({ scene: "lobby", seed: { rl_save: save(40, "blog-lobby"), "rl_inv:g:DEV": inv(g40) } })],
  ["nightmare", "나이트메어 던전", async () => explored({ seed: { rl_save: save(18, "blog-nm", { z: "nm", hp: 4200, mh: 5000 }), "rl_inv:g:DEV": inv(g90) } })],
  ["hell-named", "헬 던전 네임드 보스와의 전투", async () => { const o = await explored({ seed: { rl_save: save(10, "blog-hell", { z: "hell", hp: 21000, mh: 26000, a: 3000 }), "rl_inv:g:DEV": inv(g150) } }, { add: [{ dx: 1, dy: 0, ...M.makeNamedBoss(10), hp: 2e9, maxHp: 2e9, atk: 5 }] }); await press(o.page, [".", ".", ".", "."], 150); return o; }],
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
    shot: "#game" })],
  ["pixel-hell", "헬 던전도 픽셀 그림으로: 네임드 보스 불가사리", async () => { const o = await explored({ dsf: 1.6, seed: { rl_view: "full", rl_save: save(10, "blog-pxhell", { z: "hell", hp: 21000, mh: 26000, a: 3000 }), "rl_inv:g:DEV": inv(g150) } }, { add: [{ dx: 1, dy: 0, ...M.makeNamedBoss(10), hp: 2e9, maxHp: 2e9, atk: 5 }] }); await press(o.page, [".", "."], 150); return { ...o, shot: "#game" }; }],
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
    return { ...o, frames: await record(o.page, [".", ".", ".", ".", "."].map((k, i) => [k, 100 + i * 480]), 2500) }; }]),
  // 흡혈: 공격하면 맞은 숫자(흰색)와 함께 플레이어 위에 찬 HP가 초록 +N (화면 글자라 #stage를 찍음)
  ["heal-green", "흡혈로 찬 HP는 초록 숫자로", async () => {
    const o = await explored({ dsf: 1.6, seed: { rl_save: save(20, "blog-heal", { hp: 5000, mh: 1e6, a: 2000 }), "rl_inv:g:DEV": inv([I.generate("ls|k10", "golden", 40)]) } },
      { add: [{ dx: 1, dy: 0, ...M.makeMonster(M.MONSTERS.find(m => m.id === "orc"), "normal", 20), hp: 1e9, maxHp: 1e9, atk: 1 }] });
    await sleep(700); await o.page.keyboard.press("ArrowRight"); await sleep(330);
    return { ...o, shot: "#stage", nowait: true }; }],
  // 점프 던전 1층 (시험판): 던전에서 포탈(P)로 마을에 나와 점프 던전 문으로. 화염·뇌전 세트 2개씩 + 장비
  //   키를 정해진 시각에 누르고 떼며 바닥을 달리고 더블 점프 → 몬스터가 쫓아오고, 휘두르기·화염구·체인 라이트닝. 화면 전체를 3/8 크기로 60ms마다
  ["hunt-fight", "점프 던전: 휘두르기, 날아가는 화염구, 차례로 튕기는 체인 번개", async () => {
    const W = 32, H = 24, lv = JSON.stringify({ rid: "blog-hunt", d: 3, turn: 3, map: Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => (x < 2 || y < 2 || x > 14 || y > 10 ? 0 : 1)).join("")).join(""), seen: "1".repeat(W * H), px: 5, py: 5, shop: null, enemies: [], items: [] });
    const fire = [513, 806, 56, 464].map(k => I.generate(`fx|n20|k${k}`, "golden", 95));   // 화염의 세트(투구·장화) + 뇌전의 세트(바지·갑옷): 파이어볼 + 체인 라이트닝
    const o = await open({ dsf: 1.6, api: true, staff: true, seed: { rl_save: save(3, "blog-hunt", { hp: 500, mh: 500, a: 10 }), rl_level: lv, "rl_inv:g:DEV": inv([...fire, ...g40.filter(it => !fire.some(f => f.slot === it.slot))]) } });
    await sleep(1200); await press(o.page, ["p"], 300);
    await goDoor(o.page, "towerHell");   // dc#100부터 점프 던전은 왼쪽 끝 한 칸 문(헬 50층)만
    await sleep(500);
    const plan = [["ArrowRight", 200, 1100], ["ArrowRight", 2400, 3000], [" ", 3700, 4000], [" ", 4050, 4350], ["ArrowLeft", 3750, 4400]];   // 끝에 더블 점프로 위 발판
    const frames = await o.page.evaluate(([plan, ms]) => new Promise(done => {
      const c = document.getElementById("game"), cut = document.createElement("canvas"); cut.width = c.width * 0.375; cut.height = c.height * 0.375;
      const out = [], t0 = performance.now(), fire = (type, key) => window.dispatchEvent(new KeyboardEvent(type, { key, bubbles: true }));
      for (const [key, a, b] of plan) { setTimeout(() => fire("keydown", key), a); setTimeout(() => fire("keyup", key), b); }
      const grab = () => { cut.getContext("2d").drawImage(c, 0, 0, cut.width, cut.height); out.push(cut.toDataURL()); if (performance.now() - t0 < ms) setTimeout(grab, 60); else done(out); };
      grab();
    }), [plan, 6000]);
    return { ...o, frames, delay: 6 }; }],
  // 점프 던전 휴대폰 화면: 왼손 ◀ ▶ (▼), 오른손 큰 점프 버튼. 게임 화면과 버튼만 (위쪽 메뉴는 잘라냄)
  ["hunt-phone", "휴대폰: 왼손으로 ◀ ▶, 오른손으로 큰 점프 버튼", async () => {
    const W = 32, H = 24, lv = JSON.stringify({ rid: "blog-hunt", d: 3, turn: 3, map: Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => (x < 2 || y < 2 || x > 14 || y > 10 ? 0 : 1)).join("")).join(""), seen: "1".repeat(W * H), px: 5, py: 5, shop: null, enemies: [], items: [] });
    const o = await open({ touch: true, viewport: { width: 390, height: 844 }, dsf: 2, api: true, staff: true, seed: { rl_save: save(3, "blog-hunt", { hp: 500, mh: 500, a: 10 }), rl_level: lv, "rl_inv:g:DEV": inv(g40) } });
    await sleep(1200); await press(o.page, ["p"], 300);
    await goDoor(o.page, "towerHell");   // dc#100부터 점프 던전은 왼쪽 끝 한 칸 문(헬 50층)만
    await sleep(1800);
    await o.page.evaluate(() => { const g = document.getElementById("stage") || document.getElementById("game"); window.scrollTo(0, g.getBoundingClientRect().top + scrollY - 8); });
    await sleep(300);
    const shotPath = path.join(OUT, "hunt-phone.png");
    const top = await o.page.evaluate(() => (document.getElementById("stage") || document.getElementById("game")).getBoundingClientRect().top), pad = await o.page.evaluate(() => document.getElementById("touch-pad").getBoundingClientRect().bottom);
    await o.page.screenshot({ path: shotPath, clip: { x: 0, y: Math.max(0, top - 6), width: 390, height: Math.min(844, pad + 8) - Math.max(0, top - 6) } });
    return { ...o, prebuilt: true }; }],
  // 마을 (dc#90): 옆에서 보는 로비. 대장간 앞에서 오른쪽으로 걸으며 더블 점프, 다른 사람(게스트)도 보임. 화면 전체를 3/8 크기로 60ms마다
  ["town-walk", "옆에서 보는 마을: 걷고 더블 점프하며 건물 문 앞으로", async () => {
    const o = await open({ scene: "lobby", api: true, dsf: 1.6, others: [["게스트 #3fa2c1", 15], ["게스트 #a81d05", 19], ["게스트 #9b07de", 27]], seed: { rl_save: save(40, "blog-town"), "rl_inv:g:DEV": inv(g40) } });
    await goDoor(o.page, "forge", { enter: false }); await sleep(1200);
    const plan = [["ArrowRight", 200, 2600], [" ", 900, 1200], [" ", 1250, 1550], ["ArrowRight", 3300, 4300], [" ", 3500, 3800]];
    const frames = await o.page.evaluate(([plan, ms]) => new Promise(done => {
      const c = document.getElementById("game"), cut = document.createElement("canvas"); cut.width = c.width * 0.375; cut.height = c.height * 0.375;
      const out = [], t0 = performance.now(), fire = (type, key) => window.dispatchEvent(new KeyboardEvent(type, { key, bubbles: true }));
      for (const [key, a, b] of plan) { setTimeout(() => fire("keydown", key), a); setTimeout(() => fire("keyup", key), b); }
      const grab = () => { cut.getContext("2d").drawImage(c, 0, 0, cut.width, cut.height); out.push(cut.toDataURL()); if (performance.now() - t0 < ms) setTimeout(grab, 60); else done(out); };
      grab();
    }), [plan, 5200]);
    return { ...o, frames, delay: 6 }; }],
  // 마을 휴대폰 화면: 왼손 ◀ ▶ · ▲ 들어가기, 오른손 큰 점프 버튼. 문 앞에 서 있을 때
  ["town-phone", "휴대폰: 문 앞에서 ▲ 들어가기", async () => {
    const o = await open({ scene: "lobby", touch: true, viewport: { width: 390, height: 844 }, dsf: 2, seed: { rl_save: save(40, "blog-town"), "rl_inv:g:DEV": inv(g40) } });
    await goDoor(o.page, "market", { enter: false }); await sleep(800);
    await o.page.evaluate(() => { const g = document.getElementById("stage") || document.getElementById("game"); window.scrollTo(0, g.getBoundingClientRect().top + scrollY - 8); });
    await sleep(300);
    const shotPath = path.join(OUT, "town-phone.png");
    const top = await o.page.evaluate(() => (document.getElementById("stage") || document.getElementById("game")).getBoundingClientRect().top), pad = await o.page.evaluate(() => document.getElementById("touch-pad").getBoundingClientRect().bottom);
    await o.page.screenshot({ path: shotPath, clip: { x: 0, y: Math.max(0, top - 6), width: 390, height: Math.min(844, pad + 8) - Math.max(0, top - 6) } });
    return { ...o, prebuilt: true }; }],
  // 친구 피드백 반영 (dc#91): 처음 온 사람 안내 말풍선 (마을)
  ["newbie-intro", "처음 온 사람에게 보이는 안내 말풍선", async () => {
    const o = await open({ scene: "lobby", dsf: 1.6, seed: {} });
    await sleep(500);
    return { ...o, shot: "#stage" }; }],
  // 장비 비교: 가방의 더 좋은 무기를 고르면 지금 낀 것과 비교 (▲ 초록 · ▼ 빨강), 가방·장착 칸에 장비 그림
  ["newbie-compare", "장비 비교와 장비 그림", async () => {
    const eq = gear(25, "golden", "blogcmp0"), better = gear(45, "golden", "blogcmp1").filter(it => ["weapon", "head", "chest"].includes(it.slot));
    const o = await open({ seed: { rl_save: save(30, "blog-cmp"), "rl_inv:g:DEV": inv(eq, [...better, ...gear(20, "drop", "blogcmp2").slice(0, 4)]) } });
    await press(o.page, ["i"]); await sleep(300);
    await o.page.locator(".bag-item:has(.better)").first().click(); await sleep(300);   // ▲가 붙은(끼면 더 강한) 아이템
    return { ...o, shot: "#inv-modal .modal" }; }],
  // 휴대폰 던전: 왼손 십자, 오른손 큰 포션(HP가 적으면 빨갛게 깜빡임)·점프, 위 줄 메뉴. 머리 위 HP 막대
  ["newbie-phone", "휴대폰 던전: 왼손 방향, 오른손 포션·점프", async () => {
    const o = await explored({ touch: true, viewport: { width: 390, height: 844 }, dsf: 2, seed: { rl_save: save(8, "blog-nbphone", { hp: 200, mh: 1200 }), "rl_inv:g:DEV": inv(g40), rl_tips: JSON.stringify(["dungeon", "lowhp", "gear", "intro"]) } });
    await sleep(500);
    await o.page.evaluate(() => { const g = document.getElementById("stage"); window.scrollTo(0, g.getBoundingClientRect().top + scrollY - 8); });
    await sleep(300);
    const shotPath = path.join(OUT, "newbie-phone.png");
    const top = await o.page.evaluate(() => document.getElementById("stage").getBoundingClientRect().top), pad = await o.page.evaluate(() => document.getElementById("touch-pad").getBoundingClientRect().bottom);
    await o.page.screenshot({ path: shotPath, clip: { x: 0, y: Math.max(0, top - 6), width: 390, height: Math.min(844, pad + 8) - Math.max(0, top - 6) } });
    return { ...o, prebuilt: true }; }],
  // 지도 겹쳐 보기 (dc#92): 탐험한 층에서 Tab → 가 본 곳의 벽 윤곽이 반투명 선으로
  ["walk-overlay", "디아블로처럼 화면 위에 겹쳐 보는 지도 (Tab · 휴대폰 지도 버튼)", async () => {
    const o = await explored({ dsf: 1.6, seed: { rl_save: save(12, "blog-overlay", { hp: 900, mh: 900, a: 300 }), "rl_inv:g:DEV": inv(g40), rl_tips: JSON.stringify(["dungeon", "gear", "lowhp", "intro"]) } });
    await o.page.keyboard.press("Tab"); await sleep(300);
    return { ...o, shot: "#game" }; }],
  // 칸을 누르면 자동으로 걸어감: 탐험한 층에서 멀리 있는 바닥 칸을 클릭 → 길을 찾아 걸어감 (노란 ×가 목표)
  ["walk-tap", "가고 싶은 칸을 누르면 거기까지 자동으로", async () => {
    const o = await explored({ dsf: 1.6, seed: { rl_save: save(12, "blog-tap", { hp: 900, mh: 900, a: 300 }), "rl_inv:g:DEV": inv(g40), rl_tips: JSON.stringify(["dungeon", "gear", "lowhp", "intro"]) } });
    await o.page.evaluate(() => { const L = JSON.parse(localStorage.getItem("rl_level")); L.enemies = []; localStorage.setItem("rl_level", JSON.stringify(L)); });   // 몬스터가 보이면 멈추므로 비움
    await o.page.reload(); await sleep(900);
    // 지금 화면 안의 가장 먼 바닥 칸 (가 본 곳)
    const t = await o.page.evaluate(() => { const L = JSON.parse(localStorage.getItem("rl_level")), W = 32; let best = null;
      for (let y = Math.max(1, L.py - 5); y <= Math.min(22, L.py + 5); y++) for (let x = Math.max(1, L.px - 7); x <= Math.min(30, L.px + 7); x++)
        if (L.map[y * W + x] === "1" && L.seen[y * W + x] === "1" && !L.enemies.some(e => e.x === x && e.y === y)) { const d = Math.abs(x - L.px) + Math.abs(y - L.py); if (!best || d > best.d) best = { x, y, d }; }
      return best; });
    const frames = await o.page.evaluate(([tx, ty, ms]) => new Promise(done => {
      const c = document.getElementById("game"), cut = document.createElement("canvas"); cut.width = c.width * 0.375; cut.height = c.height * 0.375;
      const out = [], t0 = performance.now();
      setTimeout(() => { const s = window.RLWalk.screenOf(tx, ty); for (const type of ["pointerdown", "pointerup"]) c.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: s.x, clientY: s.y, pointerType: "mouse", button: 0, isPrimary: true })); }, 500);
      const grab = () => { cut.getContext("2d").drawImage(c, 0, 0, cut.width, cut.height); out.push(cut.toDataURL()); if (performance.now() - t0 < ms) setTimeout(grab, 60); else done(out); };
      grab();
    }), [t.x, t.y, 3600]);
    return { ...o, frames, delay: 6 }; }],
  // 튜토리얼 (dc#94): 해 본 단계에 ✓, 다 할 때까지 남아 있음
  ["tutorial-steps", "튜토리얼: 해 본 단계에 ✓, 다 해야 닫혀요", async () => {
    const o = await explored({ dsf: 1.6, seed: { rl_save: save(3, "blog-tut", { hp: 900, mh: 900, a: 300 }), "rl_inv:g:DEV": inv(g40.slice(0, 3)), rl_tut_on: JSON.stringify(["dungeon"]), rl_tut: JSON.stringify(["enter", "attack", "map"]), rl_tips: JSON.stringify(["intro"]) } });
    await sleep(300);
    return { ...o, shot: "#stage" }; }],
  // 점프 던전을 내린 마을 (dc#96): 왼쪽 끝 건물 자리가 빈 거리
  ["town-nojump", "점프 던전 건물이 있던 마을 왼쪽 끝", async () => {
    const o = await open({ scene: "lobby", dsf: 1.6, seed: { rl_save: save(40, "blog-town"), "rl_inv:g:DEV": inv(g40) } });
    await goDoor(o.page, "towerHell", { enter: false }); await sleep(800);
    return { ...o, shot: "#stage" }; }],
  // 마을 정가운데 웨이포인트 (dc#100): 왼쪽 던전 입구, 오른쪽 골드 던전
  ["town-center", "마을 정가운데의 웨이포인트", async () => {
    const o = await open({ scene: "lobby", dsf: 1.6, seed: { rl_save: save(40, "blog-towncenter", {}, { wp: { n: [10, 20, 30], m: [10] } }), "rl_inv:g:DEV": inv(g40) } });
    await goDoor(o.page, "waypoint", { enter: false }); await sleep(800);
    return { ...o, shot: "#stage" }; }],
  // 웨이포인트·묘비·튜토리얼 (dc#97)
  ["wp-picker", "마을 웨이포인트: 활성화한 층부터 바로", async () => {
    const o = await open({ scene: "lobby", dsf: 1.6, seed: { rl_save: save(40, "blog-wp", {}, { wp: { n: [10, 20, 30], m: [10] } }), "rl_inv:g:DEV": inv(g40) } });
    await goDoor(o.page, "waypoint");
    await sleep(300);
    return { ...o, shot: ".wp-modal" }; }],
  ["wp-grave", "10층: 시작 자리 옆 웨이포인트(◎)와 내 묘비(†)", async () => {
    const o = await open({ dsf: 1.6, seed: { rl_save: save(10, "blog-grave", { hp: 900, mh: 1200 }, { wp: { n: [10] }, tb: { d: 10, z: "normal", x: 14, y: 11, g: 12340 } }),
      rl_level: level(10, "blog-grave", undefined, [], { wp: { x: 11, y: 12 }, grave: { x: 14, y: 11 } }), "rl_inv:g:DEV": inv(g40) } });
    await sleep(400);
    return { ...o, shot: "#stage" }; }],
  ["tutorial-one", "튜토리얼: 왼쪽 위에 하나씩, 해 본 단계에 ✓", async () => {
    const o = await explored({ dsf: 1.6, seed: { rl_save: save(3, "blog-tut1", { hp: 300, mh: 300, a: 30 }, { best: 3, clr: 0, nb: 0, nclr: 0, hb: 0 }), "rl_inv:g:DEV": inv(g40.slice(0, 3)), rl_tut: JSON.stringify(["enter", "attack", "map"]) } });
    await sleep(300);
    return { ...o, shot: "#stage" }; }],
  // 소리 (dc#99): 🔊 버튼 → 효과음·배경 음악 켜기와 크기
  ["sound-settings", "🔊 소리 설정: 효과음과 배경 음악", async () => {
    const o = await open({ scene: "lobby", dsf: 1.6, seed: { rl_save: save(40, "blog-snd"), "rl_inv:g:DEV": inv(g40) } });
    await o.page.locator("#sound-btn").click(); await sleep(300);
    return { ...o, shot: ".sound-modal" }; }],
  // 발소리 (dc#104): 소리 설정에 "발소리" 켜기·끄기가 생김
  ["sound-steps", "🔊 소리 설정: 효과음과 따로 발소리만 끌 수 있어요", async () => {
    const o = await open({ scene: "lobby", dsf: 1.6, seed: { rl_save: save(40, "blog-steps"), "rl_inv:g:DEV": inv(g40) } });
    await o.page.locator("#sound-btn").click(); await sleep(300);
    return { ...o, shot: ".sound-modal" }; }],
  // 포털 빌드 (dc#102): 혼자 하는 버전의 쓰러진 창 — 캐시·계정 대신 "광고 보고 부활"
  ["portal-death", "포털 버전: 쓰러지면 광고를 보고 부활", async () => {
    const dead = { d: 12, hp: 0, mh: 64, a: 14, g: 3200, l: 12, x: 300, xn: 865, rid: "blog-portal", k: 40, pp: 0 };
    const o = await open({ portal: true, seed: { rl_save: JSON.stringify({ v: 1, f50: 1, season: 4, best: 40, clr: 1, nb: 50, nclr: 1, hb: 20, dead }), "rl_inv:g:DEV": inv(g40.slice(0, 4)) } });
    await sleep(600);
    return o; }],
  // 블로그 게임 이미지 페이지 (dc#103): 썸네일 미리보기와 내려받기 버튼, 전체 zip
  ["media-page", "블로그의 게임 이미지 페이지: 누르면 원래 크기, 내려받기 버튼과 전체 zip", async () => {
    const o = await open({ file: "blog/media.html", viewport: { width: 900, height: 900 } });
    await o.page.evaluate(async () => { const list = [...document.images]; list.forEach(i => { i.loading = "eager"; }); await Promise.all(list.map(i => i.decode().catch(() => {}))); });
    return o; }],
  // 무료 선물 (dc#105): 게임 화면 오른쪽 위에 반짝이는 배너 → 광고 → 3개 중 하나 고르기
  ["gift-banner", "받을 수 있으면 게임 화면 오른쪽 위에 반짝이는 배너", async () => {
    const o = await open({ scene: "lobby", api: true, dsf: 1.6, seed: { rl_save: save(40, "blog-gift"), "rl_inv:g:DEV": inv(g40) } });
    await o.page.locator("#gift-banner").waitFor({ state: "visible", timeout: 5000 }); await sleep(600);
    return { ...o, shot: "#stage" }; }],
  ["gift-pick", "광고를 보고 나면 세트·유니크 3개 중 하나를 골라요", async () => {
    const o = await open({ scene: "lobby", api: true, dsf: 1.6, seed: { rl_save: save(40, "blog-gift"), "rl_inv:g:DEV": inv(g40) } });
    await o.page.locator("#gift-banner").click();
    await o.page.locator("#ad-claim:not([disabled])").waitFor({ timeout: 5000 }); await o.page.locator("#ad-claim").click();
    await o.page.locator("#gift-modal").waitFor({ state: "visible", timeout: 5000 }); await sleep(300);
    return { ...o, shot: ".modal.gift" }; }],
  // 레벨 (dc#95): 쓰러진 창에 잃을 경험치, 위 능력치 줄에 레벨 보너스 %
  ["level-death", "쓰러진 창: 레벨은 그대로, 경험치 10%만 잃어요", async () => {
    const dead = { d: 12, hp: 0, mh: 64, a: 14, g: 3200, l: 12, x: 300, xn: 865, rid: "blog-lvl", k: 40, pp: 0 };
    const o = await open({ seed: { rl_save: JSON.stringify({ v: 1, f50: 1, season: 4, best: 40, clr: 1, nb: 50, nclr: 1, hb: 20, dead }), "rl_inv:g:DEV": inv(g40.slice(0, 4)) } });
    await sleep(600);
    return o; }],
  ["pixel-dex", "도감에도 몬스터 그림", async () => { const seen = Object.fromEntries([...M.MONSTERS.slice(0, 30).map(m => m.id), ...M.BOSSES.map(b => b.id)].map(k => [k, true])); const o = await open({ seed: { rl_save: save(30, "blog-pxdex"), "rl_dex:g:DEV": JSON.stringify({ seen, kills: Object.fromEntries(Object.keys(seen).map((k, i) => [k, 3 + i * 7])) }) } }); await press(o.page, ["b"]); await sleep(300); await o.page.evaluate(() => document.querySelectorAll("#dex-modal, #dex-modal *").forEach(e => { e.scrollTop = 0; })); return o; }],
];

fs.mkdirSync(OUT, { recursive: true });
const done = [];
try {
  for (const [name, caption, shoot] of SCENES) {
    if (only.length && !only.some(s => name.includes(s))) continue;
    const { ctx, page, errors, shot, more = [], nowait = false, frames, delay = 4, prebuilt = false } = await shoot();
    if (prebuilt) { done.push(`${name}.png — ${caption}${errors.length ? ` (페이지 오류 ${errors.length}: ${errors[0].slice(0, 80)})` : ""}`); await ctx.close(); continue; }
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
