// 친구들 피드백 반영 (dc#91): 튜토리얼(dc#97: 왼쪽 위에 하나씩), 내 HP 막대·HP 적을 때 경고, 장비 비교·장비 그림, 휴대폰 던전 버튼 배치, 긴 업데이트 안내 접기
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { goDoor } from "./town.mjs";
const require = createRequire(process.env.NODE_PATH + "/");
const { chromium, devices } = require("playwright");
const REPO = process.argv[2], SHOTS = process.argv[3];
const I = createRequire(import.meta.url)(path.join(REPO, "items.js"));
const ORIGIN = "https://hucksoon.github.io/hucksoon/";
const results = [];
const check = (n, ok, x = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x ? " — " + x : ""}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const DEV = "aaaa1111-0000-4000-8000-00000000beef";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
async function open(storage = {}, { scene = null, opts = { viewport: { width: 1100, height: 950 } } } = {}) {
  const ctx = await browser.newContext(opts); const page = await ctx.newPage(); const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("dialog", d => d.accept());
  await ctx.route(ORIGIN + "**", r => { const f = new URL(r.request().url()).pathname.replace("/hucksoon/", "") || "index.html";
    if (f === "ranking-config.js") return r.fulfill({ contentType: "text/javascript", body: `window.RANKING_API = "";` });
    const p = path.join(REPO, f); if (!fs.existsSync(p)) return r.fulfill({ status: 404, body: "" });
    r.fulfill({ contentType: { ".js": "text/javascript", ".png": "image/png", ".webp": "image/webp" }[path.extname(f)] || "text/html", body: fs.readFileSync(p) }); });
  await ctx.addInitScript(([s, sc, dev]) => { if (sessionStorage.getItem("s")) return; sessionStorage.setItem("s", 1);
    localStorage.setItem("rl_device_id", dev); for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); if (sc) sessionStorage.setItem("rl_scene", sc); }, [storage, scene, DEV]);
  await page.goto(ORIGIN); await sleep(700);
  return { ctx, page, errors };
}
const find = (pred, tag) => { for (let n = 0; n < 50000; n++) { const it = I.generate(`${tag}${n}|shop|d20|s${n % 6}`, "golden", 20); if (pred(it)) return it; } throw new Error("no item " + tag); };
const W = 32, H = 24;
const floor = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => (x === 0 || y === 0 || x === W - 1 || y === H - 1 ? 0 : 1)));
const level = (items = [], enemies = [], stairs = [28, 20]) => { const m = floor.map(r => r.slice()); m[stairs[1]][stairs[0]] = 2; return JSON.stringify({ rid: "nb", d: 3, turn: 1, map: m.map(r => r.join("")).join(""), seen: "1".repeat(W * H), px: 10, py: 12, shop: null, enemies, items }); };
const M = createRequire(import.meta.url)(path.join(REPO, "monsters.js"));
const rat = (x, y) => ({ ...M.makeMonster(M.MONSTERS.find(m => m.id === "rat"), "normal", 3), x, y, hp: 1, maxHp: 1, atk: 0 });
const tipText = (page) => page.locator("#tip-text").innerText();
const save = (d, hp, extra = {}) => JSON.stringify({ v: 1, f50: 1, season: 4, best: d, ...extra, run: { d, hp, mh: 300, a: 20, g: 100, p: 1, l: 5, x: 0, xn: 100, rid: "nb", k: 0, pp: 0 } });
const eqOf = (...its) => { const e = Object.fromEntries(I.EQUIP_SLOTS.map(s => [s, null])); for (const it of its) e[it.slot === "ring" ? "ring1" : it.slot] = it; return e; };
const dagger = find(x => x.slot === "weapon" && x.type === "dagger" && x.rarity === "rare", "nd");
const strong = find(x => x.slot === "weapon" && x.type === "dagger" && x.rarity === "legendary", "nl");
const weak = find(x => x.slot === "head" && x.rarity === "rare", "nh");
// 캔버스에서 그 색(±12) 픽셀 수
const px = (page, [R, G, B]) => page.evaluate(([R, G, B]) => { const c = document.getElementById("game"), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0;
  for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - R) < 12 && Math.abs(d[i + 1] - G) < 12 && Math.abs(d[i + 2] - B) < 12) n++; return n; }, [R, G, B]);

try {
  // ---- 튜토리얼 (dc#97): 왼쪽 위 작은 상자에 하나씩, 해 보면 ✓, 다 하면 "잘했어요!" 뒤 다음 것. 게임을 막지 않음 ----
  let o = await open();
  const tip = () => o.page.locator("#tip");
  const rect = (sel) => o.page.locator(sel).evaluate(b => { const r = b.getBoundingClientRect(); return { x: r.left, y: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; });
  let tt = await tipText(o.page);
  check("new player: ① in the town (one tutorial, one step)", await tip().isVisible() && tt.includes("① 던전에 들어가기") && tt.includes("☐ 마을 가운데 던전 입구") && !tt.includes("②"), tt);
  const tr = await rect("#tip"), st0 = await rect("#stage");
  check("tutorial box sits small in the top-left (≤ 300 px wide, left half)", tr.x - st0.x < 20 && tr.y - st0.y < 20 && tr.w <= 300 && tr.r < st0.x + st0.w * 0.66, JSON.stringify({ tr, st0 }));
  check("clicks pass through the box to the game (only its buttons take clicks)", await o.page.evaluate(() => { const b = document.getElementById("tip-text").getBoundingClientRect(); return document.elementFromPoint(b.left + 10, b.top + 6)?.id === "game"; }));
  check("it doesn't block: no modal open, walking still works", await o.page.evaluate(() => !document.querySelector(".overlay:not([hidden])")) && await (async () => { const x0 = (await o.page.evaluate(() => window.RLTownPos().x)); await o.page.keyboard.down("ArrowRight"); await sleep(300); await o.page.keyboard.up("ArrowRight"); return (await o.page.evaluate(() => window.RLTownPos().x)) > x0 + 1; })());
  await o.page.screenshot({ path: path.join(SHOTS, "newbie-intro.png") });
  await o.page.reload(); await sleep(700);
  check("not done yet: ① is still there after a reload", await tip().isVisible() && (await tipText(o.page)).includes("☐ 마을 가운데 던전 입구"));
  await goDoor(o.page, "start");
  tt = await tipText(o.page);
  check("entering the dungeon finishes ①: \"잘했어요!\" and what's next", tt.includes("잘했어요") && tt.includes("다음: ② 던전 탐험"), tt);
  await sleep(1700);
  tt = await tipText(o.page);
  check("then ② shows by itself: 4 steps (☐) and the HP bar note", tt.includes("② 던전 탐험") && (tt.match(/☐/g) || []).length === 4 && tt.includes("몬스터 쪽으로 이동해서 공격") && tt.includes("머리 위 막대가 HP"), tt);
  await sleep(3000);
  check("it does not disappear by itself", await tip().isVisible() && (await tipText(o.page)).includes("② 던전 탐험"));
  await o.page.screenshot({ path: path.join(SHOTS, "newbie-tut-dungeon.png") });
  await o.page.locator("#tip-fold").click(); await sleep(100);
  tt = await tipText(o.page);
  check("▴ folds it to one line with progress", tt.includes("② 던전 탐험 (0/4)") && !tt.includes("☐") && (await rect("#tip")).h < 40, tt);
  await o.page.reload(); await sleep(700);
  check("folded state remembered after reload", (await tipText(o.page)).includes("(0/4)"));
  await o.page.locator("#tip-fold").click(); await sleep(100);
  check("▾ opens it again", ((await tipText(o.page)).match(/☐/g) || []).length === 4);
  await o.page.locator("#tip-close").click(); await sleep(100);
  check("건너뛰기 × moves on to the next tutorial (③)", await tip().isVisible() && (await tipText(o.page)).includes("③ 장비 끼기"), await tipText(o.page));
  check("after clicking a tutorial button, arrow keys still go to the game", await o.page.evaluate(() => document.activeElement === document.body || document.activeElement?.id === "game"));
  check("HP bar above the player: full = green", (await px(o.page, [0x4f, 0xd1, 0x6a])) > 20);
  await o.page.reload(); await sleep(700);
  check("a skipped tutorial doesn't come back after reload (still ③)", (await tipText(o.page)).includes("③ 장비 끼기"));
  check("new player: no page errors", o.errors.length === 0, o.errors.join("; "));
  await o.ctx.close();

  // ---- ② 던전 탐험: 해 본 단계에 ✓, 새로고침해도 이어서, 다 하면 "잘했어요!" 뒤에 ③ ----
  const did = (...k) => JSON.stringify(k);
  o = await open({ rl_save: save(3, 300), rl_level: level([], [rat(11, 12)], [13, 12]), ["rl_inv:g:" + DEV]: JSON.stringify({ bag: [], equip: eqOf(dagger), log: [], stones: 0 }), rl_tut: did("enter") }, { scene: "dungeon" });
  check("② shows: 4 steps to do", ((await tipText(o.page)).match(/☐/g) || []).length === 4, await tipText(o.page));
  await o.page.keyboard.press("ArrowRight"); await sleep(300);   // 쥐 공격
  check("attacking ticks the attack step (✓), the others stay", (await tipText(o.page)).includes("✓ 몬스터 쪽으로 이동해서 공격") && ((await tipText(o.page)).match(/☐/g) || []).length === 3);
  await o.page.reload(); await sleep(700);
  check("after a reload ② continues with the ✓ kept", await o.page.locator("#tip").isVisible() && (await tipText(o.page)).includes("✓ 몬스터 쪽으로 이동해서 공격"));
  await o.page.keyboard.press("Tab"); await sleep(200);
  check("Tab (map overlay) ticks the map step", (await tipText(o.page)).includes("✓ Tab으로 지나온 길 보기"));
  await o.page.keyboard.press("Tab"); await sleep(100);
  const sp = await o.page.evaluate(() => window.RLWalk.screenOf(12, 12)); await o.page.mouse.click(sp.x, sp.y); await sleep(600);
  check("clicking a tile to walk ticks the walk step", (await tipText(o.page)).includes("✓ 가고 싶은 칸을 클릭해 걷기") && ((await tipText(o.page)).match(/☐/g) || []).length === 1, await tipText(o.page));
  await o.page.keyboard.press("ArrowRight"); await sleep(400);   // 계단 (13,12)
  check("stairs: last step → \"잘했어요!\" and next ③", (await o.page.locator("#depth").innerText()) === "4" && (await tipText(o.page)).includes("잘했어요") && (await tipText(o.page)).includes("다음: ③ 장비 끼기"), await tipText(o.page));
  await sleep(1700);
  check("then ③ shows", (await tipText(o.page)).includes("③ 장비 끼기"));
  await o.page.reload(); await sleep(700);
  check("finished ② stays done after reload (③ shown)", (await tipText(o.page)).includes("③ 장비 끼기"));
  check("dungeon tutorial: no page errors", o.errors.length === 0, o.errors.join("; "));
  await o.ctx.close();

  // ---- HP가 적을 때: 빨간 막대, HP 숫자 빨강, ④ HP 회복을 먼저 ----
  o = await open({ rl_save: save(3, 50), rl_level: level(), ["rl_inv:g:" + DEV]: JSON.stringify({ bag: [], equip: eqOf(dagger), log: [], stones: 0 }), rl_tut: did("enter", "attack", "walk", "map", "stairs") }, { scene: "dungeon" });
  await sleep(300);
  check("low HP: HP number red", await o.page.locator("#hp").evaluate(e => e.classList.contains("low")));
  check("low HP: red HP bar above the player", (await px(o.page, [0xff, 0x4a, 0x3a])) + (await px(o.page, [0xff, 0xb0, 0xa4])) > 20);
  check("low HP: ④ HP 회복 comes first (before ③)", (await tipText(o.page)).includes("④ HP 회복") && (await tipText(o.page)).includes("포션(Q)"), await tipText(o.page));
  await o.page.keyboard.press("q"); await sleep(250);
  check("after a potion: HP number back to normal, ④ well done, next ③", !(await o.page.locator("#hp").evaluate(e => e.classList.contains("low"))) && (await tipText(o.page)).includes("잘했어요") && (await tipText(o.page)).includes("다음: ③ 장비 끼기"));
  check("low HP: no page errors", o.errors.length === 0, o.errors.join("; "));
  await o.ctx.close();

  // ---- ③ 장비 끼기 ----
  o = await open({ rl_save: save(3, 300), rl_level: level([{ x: 11, y: 12, type: "gear", item: strong }]), ["rl_inv:g:" + DEV]: JSON.stringify({ bag: [], equip: eqOf(dagger), log: [], stones: 0 }), rl_tut: did("enter", "attack", "walk", "map", "stairs") }, { scene: "dungeon" });
  check("③ shows after ②", (await tipText(o.page)).includes("③ 장비 끼기"));
  await o.page.keyboard.press("ArrowRight"); await sleep(300);
  await o.page.keyboard.press("i"); await sleep(200); await o.page.keyboard.press("i"); await sleep(200);
  check("opening the inventory ticks a step; ③ stays until something is equipped", await o.page.locator("#tip").isVisible() && (await tipText(o.page)).includes("✓ 인벤토리 열기 (I)") && (await tipText(o.page)).includes("☐ ▲ 표시 장비"));
  await o.page.keyboard.press("i"); await sleep(200);
  await o.page.locator(".bag-item").first().click(); await sleep(150);
  await o.page.locator("#inv-detail button.primary", { hasText: "장착" }).click(); await sleep(150);
  await o.page.keyboard.press("i"); await sleep(1800);
  check("equipping finishes ③ → ④ next", (await tipText(o.page)).includes("④ HP 회복"), await tipText(o.page));
  await o.ctx.close();

  // ---- ⑤ 웨이포인트: 10층 시작 자리 옆 ◎를 밟으면 끝, 그 뒤로는 튜토리얼 없음 ----
  const L25 = JSON.parse(level()); L25.d = 10; L25.wp = { x: 11, y: 12 };
  o = await open({ rl_save: save(10, 300), rl_level: JSON.stringify(L25), ["rl_inv:g:" + DEV]: JSON.stringify({ bag: [], equip: eqOf(dagger), log: [], stones: 0 }), rl_tut: did("enter", "attack", "walk", "map", "stairs", "inv", "equip", "heal") }, { scene: "dungeon" });
  check("⑤ shows last", (await tipText(o.page)).includes("⑤ 웨이포인트") && (await tipText(o.page)).includes("☐ 일반 던전 10층"), await tipText(o.page));
  await o.page.keyboard.press("ArrowRight"); await sleep(300);
  check("stepping on the waypoint finishes ⑤ (no next)", (await tipText(o.page)).includes("잘했어요") && !(await tipText(o.page)).includes("다음"), await tipText(o.page));
  await sleep(1700);
  check("all done: no tutorial box", await o.page.locator("#tip").isHidden());
  check("waypoint tutorial: no page errors", o.errors.length === 0, o.errors.join("; "));
  await o.ctx.close();

  // ---- 장비 비교 · 장비 그림 ----
  o = await open({ rl_save: save(3, 300, { best: 30 }), rl_level: level(), ["rl_inv:g:" + DEV]: JSON.stringify({ bag: [strong, weak], equip: eqOf(dagger, find(x => x.slot === "head" && x.rarity === "epic", "ne")), log: [], stones: 0 }) }, { scene: "dungeon" });
  await o.page.keyboard.press("i"); await sleep(250);
  check("inventory: every bag and equipped item has a picture with a rarity border", await o.page.evaluate(() => [...document.querySelectorAll(".bag-item, #inv-equip .slot:not(.empty)")].every(b => b.querySelector(".item-icon .pix"))));
  const marks = await o.page.evaluate(() => [...document.querySelectorAll(".bag-item")].map(b => (b.querySelector(".better") ? "▲" : b.querySelector(".worse") ? "▼" : "-") + b.textContent));
  check("bag list: ▲ on the stronger weapon, ▼ on the weaker helm", marks.some(t => t.startsWith("▲") && t.includes(I.itemName(strong))) && marks.some(t => t.startsWith("▼") && t.includes(I.itemName(weak))), JSON.stringify(marks));
  await o.page.locator(".bag-item", { hasText: I.itemName(strong) }).click(); await sleep(200);
  const cmp = await o.page.locator("#inv-detail .cmp").first().innerText();
  check("detail: compares with the equipped weapon, attack ▲ in green", cmp.includes("지금 낀 것과 비교") && cmp.includes(I.itemName(dagger)) && /공격력 \+\d+ ▲/.test(cmp) && await o.page.locator("#inv-detail .cmp .chip.up", { hasText: "공격력" }).count() === 1, cmp);
  check("detail: the equipped item's stats are one tap away (folded)", (await o.page.locator("#inv-detail details", { hasText: "지금 낀 것" }).count()) === 1);
  // 끼면 그 숫자만큼 오름
  const atk0 = Number(await o.page.locator("#atk").innerText()), plus = Number(cmp.match(/공격력 \+(\d+)/)[1]);
  await o.page.locator("#inv-detail button.primary", { hasText: "장착" }).click(); await sleep(200);
  check("equipping changes attack by exactly the compared amount", Number(await o.page.locator("#atk").innerText()) === atk0 + plus, `${atk0} + ${plus} → ${await o.page.locator("#atk").innerText()}`);
  await o.page.screenshot({ path: path.join(SHOTS, "newbie-compare.png") });
  check("compare: no page errors", o.errors.length === 0, o.errors.join("; "));
  await o.ctx.close();

  // ---- 휴대폰 던전: 왼손 십자 · 오른손 큰 포션 · 위 줄 메뉴 (마을·점프 던전과 같은 자리) ----
  o = await open({ rl_save: save(3, 300), rl_level: level(), ["rl_inv:g:" + DEV]: JSON.stringify({ bag: [], equip: eqOf(dagger), log: [], stones: 0 }), rl_tut: JSON.stringify(["enter"]) }, { scene: "dungeon", opts: { ...devices["iPhone 13"] } });
  const box = (sel) => o.page.locator(sel).evaluate(b => { const r = b.getBoundingClientRect(); return { x: r.left, y: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, shown: !!b.offsetParent }; });
  const [U, L, R, D, P, J, IV, PT, Wd] = [await box('#touch-pad [data-dir="0,-1"]'), await box('#touch-pad [data-dir="-1,0"]'), await box('#touch-pad [data-dir="1,0"]'), await box('#touch-pad [data-dir="0,1"]'), await box("#tp-potion"), await box("#tp-jump"), await box("#tp-inv"), await box("#tp-portal"), await o.page.evaluate(() => innerWidth)];
  check("phone dungeon: arrows form a cross on the left half (▲ above, ▼ below, ◀ ▶ between)",
    U.shown && D.shown && L.r <= U.x + 1 && R.x >= U.r - 1 && U.b <= L.y + 1 && D.y >= L.b - 1 && R.r < Wd / 2 + 10, JSON.stringify({ U, L, R, D }));
  check("phone dungeon: big round potion on the right (≥ 100 px), jump under it, menu row on top",
    P.w >= 100 && P.h >= 100 && P.x > Wd / 2 && J.y >= P.b - 1 && J.x > Wd / 2 && IV.b <= U.y + 1 && PT.b <= U.y + 1, JSON.stringify({ P, J, IV, PT }));
  check("phone dungeon: no horizontal overflow", await o.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && [...document.querySelectorAll("#touch-pad button")].every(b => !b.offsetParent || b.getBoundingClientRect().right <= innerWidth)));
  const p0 = await o.page.evaluate(() => JSON.parse(localStorage.getItem("rl_level")).px);
  await o.page.locator('#touch-pad [data-dir="1,0"]').dispatchEvent("pointerdown"); await o.page.locator('#touch-pad [data-dir="1,0"]').dispatchEvent("pointerup"); await sleep(250);
  check("phone dungeon: ▶ still moves one tile", (await o.page.evaluate(() => JSON.parse(localStorage.getItem("rl_level")).px)) === p0 + 1);
  await o.page.locator("#touch-pad").scrollIntoViewIfNeeded(); await o.page.screenshot({ path: path.join(SHOTS, "newbie-phone-dungeon.png") });
  check("phone dungeon: no page errors", o.errors.length === 0, o.errors.join("; "));
  await o.ctx.close();

  // ---- 긴 업데이트 안내: 두 줄만, "더 보기"로 펼침 ----
  o = await open({ rl_save: save(30, 300, { best: 30 }), ["rl_inv:g:" + DEV]: JSON.stringify({ bag: [strong], equip: eqOf(dagger), log: [], stones: 0 }) });
  const note = o.page.locator("#update-text");
  const h0 = (await note.boundingBox())?.height || 0;
  await o.page.locator("#update-more").click(); await sleep(100);
  const h1 = (await note.boundingBox())?.height || 0;
  check("update note: two lines until \"더 보기\", then the whole text", await o.page.locator("#update-note").isVisible() && h0 < 50 && h1 > h0 * 2 && (await o.page.locator("#update-more").innerText()) === "접기", `${h0} → ${h1}`);
  check("past floor 25: no tutorial box", await o.page.locator("#tip").isHidden());
  check("update note: no page errors", o.errors.length === 0, o.errors.join("; "));
  await o.ctx.close();
} finally {
  await browser.close();
}
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
