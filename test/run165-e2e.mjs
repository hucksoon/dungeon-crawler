// dc#164: 가방에는 펫과 스킨만 (남은 장비·우편함 장비는 자동 장비로 끼거나 분해, 잠근 것도),
//   펫 (정예·보스·네임드를 쓰러뜨리면 낮은 확률로 그 몬스터가 작은 펫이 됨, 이벤트 모습 그대로, 같은 펫은 한 번만, 등급별 범위·속도, 자동 장착 + 고정)
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
const require = createRequire(process.env.NODE_PATH + "/");
const { chromium } = require("playwright");
const REPO = process.argv[2];
const ORIGIN = "https://hucksoon.github.io/hucksoon/";
const R = createRequire(import.meta.url), M = R(path.join(REPO, "monsters.js")), I = R(path.join(REPO, "items.js")), B = R(path.join(REPO, "blessings.js"));
const results = [];
const check = (n, ok, x = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x && !ok ? " — " + x : ""}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const DEV = "r165-dev";
// 가방: 무기 둘(하나는 잠금)·갑옷·반지, 장착: 약한 무기
const gen = (slot, lvl, n0 = 0) => { for (let n = n0; ; n++) { const it = I.generate(`r165|${slot}|${n}`, "golden", lvl); if (it.slot === slot) return it; } };
const weak = gen("weapon", 2), strong = gen("weapon", 30), locked = { ...gen("weapon", 3, 500), lock: true }, chest = gen("chest", 20), ring = gen("ring", 15);
const invJson = JSON.stringify({ bag: [strong, locked, chest, ring], equip: { ...Object.fromEntries(I.EQUIP_SLOTS.map(x => [x, null])), weapon: weak }, log: [], stones: 0 });
const mailItem = gen("head", 25);
const HOOK = `
  window.__t = {
    inv: () => ({ bag: Inv.bag().length, equip: Object.fromEntries(Object.entries(Inv.equipped()).map(([k, v]) => [k, v && v.id])), stones: Inv.stones(), pets: Inv.pets(), snap: Inv.snapshot().pets }),
    logs: () => [...document.querySelectorAll("#log > *")].map(n => n.textContent),
    yard: () => { enemies = []; items = []; shots = []; floorSt.ls = 1; floorSt.sc = 999; Pet.reset();
      player.x = Math.max(7, Math.min(MAP_W - 8, player.x)); player.y = Math.max(7, Math.min(MAP_H - 8, player.y));
      for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) { const x = player.x + dx, y = player.y + dy; if (map[y]?.[x] !== undefined) { map[y][x] = FLOOR; visible[y][x] = true; seen[y][x] = true; } }
      render(); return { x: player.x, y: player.y }; },
    put: (dx, dy, o) => { items.push({ x: player.x + dx, y: player.y + dy, ...o }); },
    items: () => items.map(i => i.type),
    pet: () => Pet.pos(),
    world: (n = 1) => { for (let i = 0; i < n; i++) worldTurn(); render(); return Pet.pos(); },
    me: () => ({ xp: player.xp, plvl: player.plvl, gold: player.gold, hp: player.hp }),
    addPet: (key, g) => Inv.addPet(key, g),
    setPet: (key) => Inv.setPet(key),
    theme: (t) => { window.__theme = t; },
    // 확률을 1로 바꿔 쓰러뜨린 몬스터에서 펫 (kind: elite | boss | normal, named)
    dropFrom: (id, kind, named = false) => { const D = RLMonsters.PETS.drop, o = { ...D }; D.elite = D.boss = D.named = 1; const r = Pet.drop({ id, kind, x: player.x + 1, y: player.y, named }); Object.assign(D, o); return r || null; },
    rawPic: (key) => !!Sprites.raw(RLMonsters.petSprite(key)) && RLMonsters.petSprite(key).startsWith("hw_"),
    drawn: () => { const src = Pet.pos() && Sprites.raw(RLMonsters.petSprite(Pet.pos().key)); return !!src; },
  };
  // ---- 시작 ----`;
const EXE = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const browser = await chromium.launch({ executablePath: EXE });
async function open(storage) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 } }); const page = await ctx.newPage(); const errors = [];
  page.on("pageerror", e => errors.push(e.message)); page.on("dialog", d => d.accept());
  await ctx.route(ORIGIN + "**", r => { const f = new URL(r.request().url()).pathname.replace("/hucksoon/", "") || "index.html";
    if (f === "ranking-config.js") return r.fulfill({ contentType: "text/javascript", body: `window.RANKING_API = "";` });
    const p = path.join(REPO, f); if (!fs.existsSync(p)) return r.fulfill({ status: 404, body: "" });
    let body = fs.readFileSync(p); if (f === "index.html") body = body.toString("utf8").replace("  // ---- 시작 ----", HOOK);
    r.fulfill({ contentType: f.endsWith(".js") ? "text/javascript" : f.endsWith(".png") ? "image/png" : f.endsWith(".webp") ? "image/webp" : "text/html", body }); });
  await ctx.addInitScript((s) => { if (!sessionStorage.getItem("s")) { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); sessionStorage.setItem("rl_scene", "dungeon"); sessionStorage.setItem("s", 1); } }, storage);
  await page.goto(ORIGIN);
  await page.waitForFunction(() => window.__t);
  await sleep(500);
  return { ctx, page, errors };
}
const save = (run = {}) => JSON.stringify({ v: 1, best: 12, run: { d: 8, hp: 5000, mh: 5000, a: 40, g: 100, l: 5, x: 0, xn: 5000, x4: 1, rid: "r165", k: 0, pp: 0, bz: { normal: 8 }, ...run } });
const T = (page, fn, ...a) => page.evaluate(([f, a]) => window.__t[f](...a), [fn, a]);
const BASE = { rl_oldtown: "off", rl_bless: "on", rl_autogear: "1", rl_market: "paused", rl_device_id: DEV, rl_3d: "0", rl_live: "off", rl_tut: JSON.stringify(["intro"]), rl_tip_dodge: "1" };

try {
  // ---- 1. 규칙 ----
  const SP = R(path.join(REPO, "sprites.js")).map;
  check("pet = the monster that dropped it: elite/boss/named only (not normal, golden goblin, clones)", M.petSource({ kind: "elite", id: "goblin" }) === "elite" && M.petSource({ kind: "boss", id: "ogre_chief" }) === "boss" && M.petSource({ kind: "boss", id: "gumiho" }) === "named" && !M.petSource({ kind: "normal", id: "rat" }) && !M.petSource({ kind: "golden", id: "golden_goblin" }) && !M.petSource({ kind: "elite", id: "rat", clone: 1 }));
  check(`event pet keeps the event look (${M.petName("goblin@halloween")} → ${M.petSprite("goblin@halloween")}), plain → ${M.petSprite("goblin")}`, M.petSprite("goblin@halloween") === "hw_goblin" && M.petSprite("goblin") === "mon_goblin" && !!SP.hw_goblin && M.petName("goblin@halloween").includes("할로윈"));
  const G = M.PETS.grades;
  check(`grades: range ${M.PET_GRADES.map(g => G[g].range).join("/")} · speed ${M.PET_GRADES.map(g => G[g].speed).join("/")}`, M.PET_GRADES.join() === "common,rare,epic,legend" && M.PET_GRADES.every((g, i, a) => !i || (G[g].range > G[a[i - 1]].range && G[g].speed >= G[a[i - 1]].speed)) && G.legend.range >= 99);
  const rr = B.rng("r165"), cnt = { elite: {}, named: {} }; for (let i = 0; i < 4000; i++) for (const src of ["elite", "named"]) { const g = M.rollPetGrade(src, rr); cnt[src][g] = (cnt[src][g] || 0) + 1; }
  check(`grade odds: elites mostly common, named only epic/legend (${JSON.stringify(cnt)})`, cnt.elite.common > cnt.elite.rare && !cnt.elite.legend && !cnt.named.common && !cnt.named.rare);
  check("event pets are one grade higher", M.rollPetGrade("elite", () => 0, true) === "rare" && M.rollPetGrade("named", () => 0.99, true) === "legend");
  check(`drop chance low: elite ${M.PETS.drop.elite * 100}% · boss ${M.PETS.drop.boss * 100}% · named ${M.PETS.drop.named * 100}%`, M.PETS.drop.elite < 0.01 && M.PETS.drop.boss < M.PETS.drop.named && M.petDropChance({ kind: "normal" }) === 0);

  // ---- 2. 가방 정리 (불러올 때) + 우편함 ----
  const A = await open({ ...BASE, rl_save: save(), [`rl_inv:g:${DEV}`]: invJson, [`rl_mail:g:${DEV}`]: JSON.stringify([{ item: mailItem, from: "box" }]) });
  const v0 = await T(A.page, "inv");
  const tidy = (await T(A.page, "logs")).find(t => t.includes("가방 정리")) || "";
  check(`on load the old bag gear is tidied: bag ${v0.bag}, stronger weapon equipped, rest dismantled (${tidy})`, v0.bag === 0 && v0.equip.weapon === strong.id && v0.equip.chest === chest.id && /장비 4개/.test(tidy) && /강화석 \+\d/.test(tidy), JSON.stringify(v0));
  check("locked item is dismantled too (not kept in the bag)", v0.bag === 0 && !Object.values(v0.equip).includes(locked.id));
  await A.page.keyboard.press("i"); await sleep(400);
  const v1 = await T(A.page, "inv");
  check("mailbox gear goes straight to auto gear when the inventory opens", v1.bag === 0 && v1.equip.head === mailItem.id, JSON.stringify(v1.equip));
  const ui = await A.page.evaluate(() => ({ heads: [...document.querySelectorAll("#inv-bag .bag-h")].map(n => n.textContent), gear: document.querySelectorAll("#inv-bag .bag-item:not(.pet):not(.skin-btn)").length,
    sell: document.getElementById("inv-sell-all").hidden, nul: document.getElementById("inv-summary")?.textContent.includes("null") ?? false, count: document.getElementById("inv-count").textContent, auto: !!document.querySelector(".auto-gear") }));
  check(`bag panel shows only pets and skins (${ui.heads.join(" / ")}), no gear, no sell button, no auto-gear switch`, ui.heads.length === 2 && ui.heads[0].includes("펫") && ui.heads[1].includes("꾸미기") && ui.gear === 0 && ui.sell && !ui.auto && !ui.nul && ui.count.includes("펫 0종"), JSON.stringify(ui));
  await A.page.keyboard.press("i"); await sleep(200);

  // ---- 3. 펫 얻기 ----
  check("normal monsters never drop a pet", (await T(A.page, "dropFrom", "rat", "normal")) === null);
  const got = await T(A.page, "dropFrom", "goblin", "elite");
  const v2 = await T(A.page, "inv");
  check(`elite goblin drop → the goblin is the pet (${got}, ${v2.pets.have.goblin?.g}) and it follows right away`, got === "goblin" && !!v2.pets.have.goblin && v2.pets.on === "goblin" && !!(await T(A.page, "pet")), JSON.stringify(v2.pets));
  check("same monster never drops again (no duplicates)", (await T(A.page, "dropFrom", "goblin", "elite")) === null && Object.keys((await T(A.page, "inv")).pets.have).length === 1);
  check("pets are saved on this device, not in the account save (the server keeps them, pets-e2e)", v2.snap === undefined && v2.pets.on === "goblin" && !!v2.pets.have.goblin);
  check("log tells a pet was found", (await T(A.page, "logs")).some(t => t.includes("🐾") && t.includes("고블린")));
  check("pet is drawn with the monster's own picture", await T(A.page, "drawn"));

  // ---- 4. 자동 장착 · 고정 ----
  await T(A.page, "addPet", "orc", "rare");
  check("a better pet is equipped automatically", (await T(A.page, "inv")).pets.on === "orc");
  await T(A.page, "setPet", "goblin");
  await T(A.page, "addPet", "troll", "legend");
  const pin = (await T(A.page, "inv")).pets;
  check("a pinned pet stays even when a better one comes", pin.on === "goblin" && pin.pin && !!pin.have.troll, JSON.stringify(pin));
  await T(A.page, "setPet", null);
  check("unpin → best pet again (legend troll)", (await T(A.page, "inv")).pets.on === "troll");

  // ---- 5. 지도에 남은 아이템을 주워 옴 (등급별 범위·속도) ----
  await T(A.page, "addPet", "kobold", "common"); await T(A.page, "setPet", "kobold");
  await T(A.page, "yard");
  const g0 = gen("boots", 40);
  await T(A.page, "put", 3, 0, { type: "xp", amount: 7 }); await T(A.page, "put", -3, 2, { type: "gold", amount: 50 });
  await T(A.page, "put", 0, -4, { type: "gear", item: g0, from: "drop" }); await T(A.page, "put", 2, 2, { type: "heal" }); await T(A.page, "put", 6, -6, { type: "gold", amount: 9 });
  const m0 = await T(A.page, "me"), p0 = await T(A.page, "pet");
  const p1 = await T(A.page, "world", 1);
  check(`common pet walks 1 tile a turn (${JSON.stringify(p0)} → ${JSON.stringify(p1)})`, Math.max(Math.abs(p1.x - p0.x), Math.abs(p1.y - p0.y)) === 1);
  await T(A.page, "world", 30);
  const m1 = await T(A.page, "me"), left = await T(A.page, "items"), v3 = await T(A.page, "inv");
  check(`pet picked up the XP orb, gold and gear within its range (left: ${left.join(",")})`, !left.includes("xp") && left.filter(t => t === "gold").length === 1 && !left.includes("gear") && (m1.xp > m0.xp || m1.plvl > m0.plvl) && m1.gold > m0.gold, JSON.stringify({ m0, m1, left }));
  check("…and the gear went through auto gear (equipped)", v3.equip.boots === g0.id);
  check("heal orbs are left for the player", left.includes("heal"));
  check(`gold 6 tiles away is outside a common pet's range (${M.PETS.grades.common.range})`, left.includes("gold"));
  const p2 = await T(A.page, "pet"), pos = await T(A.page, "yard");
  check(`with nothing to fetch it stays near me (${Math.max(Math.abs(p2.x - pos.x), Math.abs(p2.y - pos.y))} tiles)`, Math.max(Math.abs(p2.x - pos.x), Math.abs(p2.y - pos.y)) <= 2);
  await T(A.page, "setPet", "troll"); await T(A.page, "yard");
  await T(A.page, "put", 6, 0, { type: "gold", amount: 5 });
  const d0 = await T(A.page, "pet"), d1 = await T(A.page, "world", 1);
  check(`legend pet walks 3 tiles a turn and reaches far items (${d1.x - d0.x})`, Math.max(Math.abs(d1.x - d0.x), Math.abs(d1.y - d0.y)) === 3, JSON.stringify([d0, d1]));

  // ---- 6. 가방에서 고르기 ----
  await T(A.page, "setPet", null);
  await A.page.keyboard.press("i"); await sleep(300);
  const pets = await A.page.evaluate(() => [...document.querySelectorAll("#inv-bag .bag-item.pet")].map(b => ({ t: b.textContent, sel: b.classList.contains("sel") })));
  check(`bag lists the pets best first with grade, range and speed (${pets.length})`, pets.length === 4 && pets[0].t.includes("트롤") && pets[0].sel && pets[0].t.includes("지도 전체") && pets.some(p => p.t.includes("범위 4칸")), JSON.stringify(pets));
  await A.page.locator("#inv-bag .bag-item.pet").nth(2).click(); await sleep(200);
  const pk = (await T(A.page, "inv")).pets;
  check("tap a pet → it follows and is pinned 📌", pk.pin && pk.on !== "troll" && (await A.page.locator("#inv-bag .bag-item.pet.sel").textContent()).includes("📌"), JSON.stringify(pk));
  await A.page.locator("#inv-bag .bag-item.pet.sel").click(); await sleep(200);
  const pu = (await T(A.page, "inv")).pets;
  check("tap the pinned pet again → unpinned, best pet follows", !pu.pin && pu.on === "troll");
  await A.page.keyboard.press("i");
  check("no page errors", A.errors.length === 0, A.errors.join("; "));
  await A.ctx.close();

  // ---- 6. 새로고침해도 펫이 남음 ----
  const C = await open({ ...BASE, rl_event: "halloween", rl_save: save(), [`rl_inv:g:${DEV}`]: JSON.stringify({ bag: [], equip: Object.fromEntries(I.EQUIP_SLOTS.map(x => [x, null])), log: [], pets: { have: { orc: { g: "epic", at: 5 }, "goblin@halloween": { g: "rare", at: 9 }, "bad key!": { g: "rare" }, rat: { g: "nope" } }, on: "goblin@halloween", pin: true } }) });
  const v4 = await T(C.page, "inv");
  check("saved pets load back with the pin (bad entries dropped)", v4.pets.have.orc?.g === "epic" && v4.pets.have["goblin@halloween"] && !v4.pets.have.rat && Object.keys(v4.pets.have).length === 2 && v4.pets.on === "goblin@halloween" && v4.pets.pin, JSON.stringify(v4.pets));
  check("event pet keeps its Halloween picture even outside the event", await T(C.page, "rawPic", "goblin@halloween"));
  const hw = await T(C.page, "dropFrom", "troll", "elite"), hv = (await T(C.page, "inv")).pets.have[hw];
  check(`during Halloween the pet keeps the Halloween look and is a grade higher (${hw}, ${hv?.g})`, hw === "troll@halloween" && hv && hv.g !== "common");
  check("an owned Halloween pet does not drop again either", (await T(C.page, "dropFrom", "goblin", "elite")) === null && !!(await T(C.page, "inv")).pets.have["goblin@halloween"]);
  check("no page errors (reload)", C.errors.length === 0, C.errors.join("; "));
  await C.ctx.close();
} finally { await browser.close(); }
const pass = results.filter(Boolean).length;
console.log(`\n${pass} passed, ${results.length - pass} failed`);
process.exit(pass === results.length ? 0 : 1);
