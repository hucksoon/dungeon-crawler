// 소리 (dc#99): 공격·속성·스킬·처치·드롭 효과음, 장면마다 배경 음악(마을·던전·나이트메어·헬·골드·보스), 소리 설정 창
// 소리 자체는 귀로 들어야 해서, 여기서는 sound.js가 낸 효과음 이름(RLSound.recent)과 지금 곡(state().track)을 봄
import { createRequire } from "node:module";
import fs from "node:fs"; import path from "node:path";
const require = createRequire(process.env.NODE_PATH + "/");
const { chromium } = require("playwright");
const REPO = process.argv[2], OUT = process.argv[3];
const req = createRequire(import.meta.url);
const M = req(path.join(REPO, "monsters.js")), I = req(path.join(REPO, "items.js"));
const ORIGIN = "https://game.apacimtest.com/";
const results = []; const check = (n, ok, x = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x && !ok ? " — " + x : ""}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const MAP_W = 32, MAP_H = 24;
const map = Array.from({ length: MAP_H }, (_, y) => Array.from({ length: MAP_W }, (_, x) => (x < 2 || y < 2 || x > 14 || y > 10 ? 0 : 1)));
const mob = (id, x, y, d, extra = {}) => ({ x, y, ...M.makeMonster(M.MONSTERS.find(m => m.id === id), "normal", d), ...extra });
const level = (d, enemies, z) => JSON.stringify({ rid: "snd-run", d, z, turn: 3, map: map.map(r => r.join("")).join(""), seen: "1".repeat(MAP_W * MAP_H), px: 5, py: 5, shop: null, enemies, items: [] });
const save = (d, run = {}, extra = {}) => JSON.stringify({ v: 1, f50: 1, season: 4, best: 50, clr: 1, nb: 50, nclr: 1, hb: 10, ...extra, run: { d, hp: 1e6, mh: 1e6, a: 5, g: 10, p: 0, l: 30, x: 0, xn: 1e9, rid: "snd-run", k: 0, pp: 0, ...run } });
const inv = (items = []) => JSON.stringify({ bag: [], equip: Object.fromEntries(I.SLOTS.map(s => [s, items.find(it => it.slot === s) || null])), log: [], stones: 0 });
// 화염의 세트 2개 → 파이어볼 (anim-e2e와 같은 아이템)
const fireSet = [513, 806].map(k => I.generate(`fx|n20|k${k}`, "golden", 95));

const HOOK = `
  window.__t = {
    st: () => ({ scene, track: window.RLSound.state().track, recent: window.RLSound.recent() }),
    elem: (el) => { const base = stats; stats = () => { const s = base(); return { ...s, elem: { fire: 0, ice: 0, bolt: 0, [el]: 40 } }; }; },
  };
  // ---- 시작 ----`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
async function open({ sv, lv, gear = [], scene = "dungeon", store = {}, query = "" }) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 1000 } });
  const page = await ctx.newPage(); const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await ctx.route(ORIGIN + "**", r => { const f = new URL(r.request().url()).pathname.slice(1) || "index.html";
    if (f === "ranking-config.js") return r.fulfill({ contentType: "text/javascript", body: 'window.RANKING_API = "";' });
    const p = path.join(REPO, f); if (!fs.existsSync(p)) return r.fulfill({ status: 404, body: "" });
    let body = fs.readFileSync(p); if (f === "index.html") body = body.toString().replace("  // ---- 시작 ----", HOOK);
    r.fulfill({ contentType: { ".js": "text/javascript", ".png": "image/png", ".webp": "image/webp" }[path.extname(f)] || "text/html", body }); });
  await ctx.route("https://login.xsolla.com/**", r => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await ctx.addInitScript(([s, l, inv, sc, store]) => { if (sessionStorage.getItem("seeded")) return; sessionStorage.setItem("seeded", 1); sessionStorage.setItem("rl_scene", sc);
    localStorage.setItem("rl_device_id", "snd-dev-0001"); localStorage.setItem("rl_save", s); if (l) localStorage.setItem("rl_level", l);
    localStorage.setItem("rl_inv:g:snd-dev-0001", inv); localStorage.setItem("rl_tips", JSON.stringify(["intro", "dungeon", "gear", "lowhp"]));
    for (const [k, v] of Object.entries(store)) localStorage.setItem(k, v); }, [sv, lv, inv(gear), scene, store]);
  await page.goto(ORIGIN + query); await page.waitForFunction(() => window.__t); await sleep(400);
  return { ctx, page, errors };
}
const st = (page) => page.evaluate(() => window.__t.st());
const press = async (page, k) => { await page.keyboard.press(k); await sleep(250); };

try {
  check("sound.js: effects and tracks", (() => { const g = {}; new Function("window", "globalThis", fs.readFileSync(path.join(REPO, "sound.js"), "utf8"))(g, g);
    const S = g.RLSound; return ["step", "land", "jump", "swing", "hit", "crit", "fire", "ice", "bolt", "fireball", "nova", "chain", "kill", "bossKill", "drop", "levelup", "death"].every(n => S.names.includes(n))
      && ["town", "dungeon", "nightmare", "hell", "gold", "boss"].every(t => S.tracks.includes(t)); })());

  // ---- 던전: 휘두르기·맞힘·처치, 던전 음악 ----
  let { ctx, page, errors } = await open({ sv: save(12), lv: level(12, [mob("rat", 6, 5, 12, { hp: 999999, maxHp: 999999 })]) });
  check("dungeon music before any key (chosen, starts on the first key)", (await st(page)).track === "dungeon");
  await press(page, "ArrowRight");
  let s = await st(page);
  check("attack → swing + hit/crit", s.recent.includes("swing") && (s.recent.includes("hit") || s.recent.includes("crit")), s.recent.join());
  check("audio unlocked and running after a key", await page.evaluate(() => window.RLSound.state().unlocked && window.RLSound.state().running));
  // 속성 공격: 가장 센 속성 소리
  for (const el of ["fire", "ice", "bolt"]) {
    await page.evaluate((el) => window.__t.elem(el), el);
    await page.evaluate(() => window.RLSound.recent().length);
    await press(page, "ArrowRight");
    s = await st(page);
    check(`${el} attack → ${el} sound`, s.recent.slice(-6).includes(el), s.recent.slice(-6).join());
  }
  // 발소리 (dc#104): 몬스터를 때릴 때는 없고, 빈 칸으로 걸으면 '톡'. 점프(Space + 방향)는 뛰는 소리 → 착지 소리
  check("attacking (bumping a monster) makes no footstep", !(await st(page)).recent.includes("step"), (await st(page)).recent.join());
  await press(page, "ArrowDown");
  check("walking a tile in the dungeon → footstep", (await st(page)).recent.slice(-3).includes("step"), (await st(page)).recent.slice(-5).join());
  await press(page, " "); await press(page, "ArrowLeft"); await sleep(300);
  s = await st(page);
  check("dungeon jump → jump, then land sound", s.recent.slice(-6).includes("jump") && s.recent.slice(-6).includes("land") && s.recent.lastIndexOf("land") > s.recent.lastIndexOf("jump"), s.recent.slice(-6).join());
  check("no page errors (attack)", errors.length === 0, errors.join("; "));
  await ctx.close();

  // ---- 처치·좋은 장비 ----
  ({ ctx, page, errors } = await open({ sv: save(12), lv: level(12, [mob("rat", 6, 5, 12, { hp: 1, maxHp: 1, def: 0 })]) }));
  await press(page, "ArrowRight");
  check("kill → kill sound", (await st(page)).recent.includes("kill"), (await st(page)).recent.join());
  await page.evaluate(() => window.RLSound.play("drop", "legendary"));
  check("legendary drop jingle plays", (await st(page)).recent.includes("drop"));
  await ctx.close();

  // ---- 보스를 마주치면 보스 음악, 쓰러뜨리면 던전 음악 + 보스 처치 소리 ----
  const boss = { x: 6, y: 5, ...M.makeBoss(15, M.effLevel(15)), hp: 1, maxHp: 1, def: 0 };
  ({ ctx, page, errors } = await open({ sv: save(15), lv: level(15, [boss]) }));
  check("boss in sight → boss music", (await st(page)).track === "boss", (await st(page)).track);
  await press(page, "ArrowRight");
  s = await st(page);
  check("boss down → bossKill sound, back to dungeon music", s.recent.includes("bossKill") && s.track === "dungeon", JSON.stringify([s.track, s.recent.slice(-5)]));
  check("no page errors (boss)", errors.length === 0, errors.join("; "));
  await ctx.close();

  // ---- 세트 스킬: 파이어볼 ----
  ({ ctx, page, errors } = await open({ sv: save(20), lv: level(20, [mob("orc", 8, 5, 20, { hp: 999999, maxHp: 999999 })]), gear: fireSet }));
  for (let i = 0; i < 3 && !(await st(page)).recent.includes("fireball"); i++) await press(page, ".");
  check("fire set → fireball sound", (await st(page)).recent.includes("fireball"), (await st(page)).recent.join());
  await ctx.close();

  // ---- 장면마다 곡: 마을 · 나이트메어 · 헬 · 골드 ----
  ({ ctx, page, errors } = await open({ sv: save(12), lv: null, scene: "lobby" }));
  check("town → town music", (await st(page)).track === "town" && (await st(page)).scene === "lobby");
  // 마을에서 점프: 마리오처럼 '뿅', 공중에서 한 번 더 = 더블 점프 소리 (dc#100)
  await page.keyboard.down(" "); await sleep(120); await page.keyboard.up(" "); await sleep(200);
  check("town jump → jump sound", (await st(page)).recent.includes("jump"), (await st(page)).recent.join());
  await page.keyboard.down(" "); await sleep(120); await page.keyboard.up(" "); await sleep(160);
  await page.keyboard.down(" "); await sleep(120); await page.keyboard.up(" "); await sleep(200);
  check("double jump in the air → jump2 sound", (await st(page)).recent.includes("jump2"), (await st(page)).recent.join());
  await sleep(900);
  check("town: landing after the jump → land sound", (await st(page)).recent.includes("land"), (await st(page)).recent.join());
  // 마을 걷기: 한 칸마다 발소리 (왼발·오른발)
  const n0 = (await st(page)).recent.filter(n => n === "step").length;
  await page.keyboard.down("ArrowLeft"); await sleep(700); await page.keyboard.up("ArrowLeft"); await sleep(200);
  const n1 = (await st(page)).recent.filter(n => n === "step").length;
  check("town: walking → a footstep every tile (several in 0.7 s)", n1 - n0 >= 3 && n1 - n0 <= 8, `${n1 - n0} steps`);
  await ctx.close();
  for (const [z, want] of [["nm", "nightmare"], ["hell", "hell"], ["gold", "gold"]]) {
    const d = z === "gold" ? 75 : 3;
    ({ ctx, page, errors } = await open({ sv: save(d, { z }), lv: level(d, [], z) }));
    check(`${z} → ${want} music`, (await st(page)).track === want, (await st(page)).track);
    await ctx.close();
  }

  // ---- 소리 설정 창 ----
  ({ ctx, page, errors } = await open({ sv: save(12), lv: level(12, [mob("rat", 6, 5, 12, { hp: 999999, maxHp: 999999 })]) }));
  await page.locator("#sound-btn").click(); await sleep(150);
  check("🔊 button opens the sound settings", await page.locator("#sound-modal").isVisible() && await page.locator("#sfx-on").isChecked() && await page.locator("#bgm-on").isChecked());
  await page.screenshot({ path: path.join(OUT, "sound-settings.png") });
  await page.locator("#sfx-on").uncheck();
  await page.locator("#bgm-vol").fill("20");
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("rl_sound")));
  check("settings saved: effects off, music 20%", saved.sfxOn === false && saved.bgm === 0.2 && await page.locator("#sfx-vol").isDisabled(), JSON.stringify(saved));
  await page.keyboard.press("Escape"); await sleep(100);
  check("Escape closes the settings", await page.locator("#sound-modal").isHidden());
  check("effects off: play() does nothing", await page.evaluate(() => window.RLSound.play("hit") === false));
  await page.reload(); await page.waitForFunction(() => window.__t);
  check("after reload: still off, music 20%", await page.evaluate(() => { const c = window.RLSound.settings; return c.sfxOn === false && c.bgm === 0.2; }));
  await page.locator("#sound-btn").click(); await sleep(100);
  await page.locator("#sfx-on").check(); await page.locator("#bgm-on").uncheck();
  check("music off: button still 🔊 while effects are on, all off → 🔇", (await page.locator("#sound-btn").innerText()) === "🔊");
  await page.locator("#sfx-on").uncheck();
  check("all off → 🔇", (await page.locator("#sound-btn").innerText()) === "🔇");
  // 발소리만 끄기 (dc#104): 효과음은 그대로
  await page.locator("#sfx-on").check();
  check("footsteps checkbox: on by default", await page.locator("#steps-on").isChecked());
  await page.locator("#steps-on").uncheck();
  check("footsteps off: step is silent, other effects still play", await page.evaluate(() => window.RLSound.settings.steps === false && window.RLSound.play("step") === false && window.RLSound.play("hit") === true));
  await page.locator("#sfx-on").uncheck();
  check("effects off → footsteps checkbox disabled too", await page.locator("#steps-on").isDisabled());
  check("no page errors (settings)", errors.length === 0, errors.join("; "));
  await ctx.close();

  // ---- 영어 화면 ----
  ({ ctx, page, errors } = await open({ sv: save(12), lv: null, scene: "lobby", query: "?lang=en" }));
  await page.locator("#sound-btn").click(); await sleep(150);
  const title = await page.locator("#sound-title").innerText();
  check("English: sound settings translated", !/[가-힣]/.test(await page.locator("#sound-modal").innerText()), title);
  await ctx.close();
} finally { await browser.close(); }
const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
