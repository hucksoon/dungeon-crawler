// 랭커 피드백: 레벨별 강화석, 세트 5개(무기 자유), 전부 판매 때 레전더리·세트 남기기, 버튼 위치
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
const require = createRequire(process.env.NODE_PATH + "/");
const { chromium, devices } = require("playwright");
const REPO = process.argv[2], OUT = process.argv[3];
const RL = createRequire(import.meta.url)(path.join(REPO, "items.js"));
const ORIGIN = "https://game.apacimtest.com/";
const results = [];
const check = (n, ok, x = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x && !ok ? " — " + x : ""}`); };
const find = (pred, tag, src = "golden", lvl = 120) => { for (let n = 0; n < 400000; n++) { const it = RL.generate(`${tag}${n}|shop|d${lvl}|s${n % 6}`, src, lvl); if (pred(it)) return it; } };
const legend = find(x => x.rarity === "legendary" && x.slot !== "weapon", "lg");
const setHelm = find(x => x.rarity === "set" && x.slot === "head", "sh");
const rare = find(x => x.rarity === "rare", "ra");
const epic = find(x => x.rarity === "epic", "ep");
const common = find(x => x.rarity === "common", "cm", "drop");
const setPieces = ["head", "chest", "arms", "pants", "boots"].map((s, i) => find(x => x.rarity === "set" && x.slot === s, "sp" + i));
const dagger = find(x => x.rarity === "legendary" && x.slot === "weapon" && x.type === "dagger", "dg");
const DEV = "fb-device-0001";
const save = JSON.stringify({ v: 1, f50: 1, best: 120, run: { d: 120, hp: 3000, mh: 3000, a: 100, g: 500, p: 3, l: 60, x: 0, xn: 1e9, rid: "fbrun", k: 0, pp: 0 } });
const equip = Object.fromEntries(RL.SLOTS.map(s => [s, null]));
setPieces.forEach(p => equip[p.slot] = p);
equip.weapon = dagger;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
async function open(bag, opts = { viewport: { width: 1100, height: 1000 } }) {
  const ctx = await browser.newContext(opts); const page = await ctx.newPage(); const errors = [], dialogs = [];
  page.on("pageerror", e => errors.push(e.message + " @ " + (e.stack || "").split("\n").slice(1, 3).join(" | "))); page.on("dialog", d => { dialogs.push(d.message()); d.accept(); });
  await ctx.route(ORIGIN + "**", r => { const f = new URL(r.request().url()).pathname.slice(1) || "index.html";
    if (f === "ranking-config.js") return r.fulfill({ contentType: "text/javascript", body: 'window.RANKING_API = "";' });
    const p = path.join(REPO, f); if (!fs.existsSync(p)) return r.fulfill({ status: 404, body: "" });
    r.fulfill({ contentType: f.endsWith(".js") ? "text/javascript" : "text/html", body: fs.readFileSync(p) }); });
  await ctx.route("https://login.xsolla.com/**", r => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await ctx.addInitScript(([s]) => { if (sessionStorage.getItem("seeded")) return; sessionStorage.setItem("seeded", 1); for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); }, [{
    rl_device_id: DEV, rl_save: save, [`rl_inv:g:${DEV}`]: JSON.stringify({ bag, equip, log: [], stones: 0 }) }]);
  await page.goto(ORIGIN); await page.waitForTimeout(500);
  await page.click("#inv-btn"); await page.waitForTimeout(200);
  return { page, errors, dialogs };
}
const inv = (page) => page.evaluate(k => JSON.parse(localStorage.getItem(k)), `rl_inv:g:${DEV}`);
try {
  // ---- 세트 5개 + 레전더리 단검 ----
  let { page, errors, dialogs } = await open([legend, setHelm, rare, epic, common]);
  const summary = await page.locator("#inv-summary").innerText();
  check("5 set pieces + free weapon: shows 5/5", summary.includes("(5/5)"), summary);
  check("5 set pieces: all bonuses on (none dimmed)", await page.locator("#inv-summary .off").count() === 0);
  const cdm = RL.totals(Object.values(equip).filter(Boolean)).stats.critDmg;
  check("crit damage: set +100% plus gear applied", cdm >= 100 && summary.includes(`피해 ×${(2 + cdm / 100).toFixed(1)}`), summary);

  // ---- 레벨별 강화석 ----
  const expectAll = [legend, setHelm, rare, epic, common].reduce((s, it) => s + RL.sellStones(it), 0);
  check("Lv120 legendary sells for 111 stones", RL.sellStones(legend) === 111);
  check("sell-all button shows level-scaled total", (await page.locator("#inv-sell-all").innerText()).includes(`+${expectAll}`), await page.locator("#inv-sell-all").innerText());

  // ---- 버튼이 이름 바로 아래 ----
  await page.locator(".bag-item", { hasText: RL.itemName(rare) }).first().click();
  const order = await page.evaluate(() => [...document.querySelectorAll("#inv-detail > *")].map(n => n.tagName + (n.className ? "." + n.className : "")));
  check("item buttons right under name/meta (before stats)", order.indexOf("DIV.row") > 0 && order.indexOf("DIV.row") < order.findIndex(t => t.includes("stat-line")), order.join(","));
  check("single sell button shows level-scaled stones", await page.getByRole("button", { name: `판매 (강화석 +${RL.sellStones(rare)} · 골드 +${RL.sellGold(rare).toLocaleString()})` }).count() === 1);

  // ---- 전부 판매: 레전더리·세트를 남길지 물어봄 ----
  await page.click("#inv-sell-all");
  check("asks about legendary/set instead of selling", await page.locator("#inv-sell-ask").isVisible() && (await page.locator("#inv-sell-ask").innerText()).includes("레전더리·세트 2개도 같이 팔까요?"));
  check("no browser confirm popup for this case", dialogs.length === 0, dialogs.join("|"));
  check("nothing sold yet", (await inv(page)).bag.length === 5);
  await page.screenshot({ path: path.join(OUT, "sell-ask.png") });
  await page.getByRole("button", { name: "취소" }).click();
  check("cancel → nothing sold, ask closed", (await inv(page)).bag.length === 5 && await page.locator("#inv-sell-ask").isHidden() && await page.locator("#inv-sell-all").isVisible());
  await page.click("#inv-sell-all");
  await page.getByRole("button", { name: /남기고 나머지 3개만 판매/ }).click();
  let d = await inv(page);
  const restStones = [rare, epic, common].reduce((s, it) => s + RL.sellStones(it), 0);
  check("keep → legendary and set stay in bag", d.bag.length === 2 && d.bag.some(x => x.id === legend.id) && d.bag.some(x => x.id === setHelm.id));
  check("keep → stones only for sold items", d.stones === restStones, `${d.stones} vs ${restStones}`);
  check("keep → sell log entries for 3", d.log.filter(e => e.ev === "sell").length === 3);
  check("keep → message says kept", (await page.locator("#inv-detail").innerText()).includes("(2개는 가방에 남김)"));
  check("equipped set and dagger untouched", d.equip.weapon.id === dagger.id && d.equip.head.id === setPieces[0].id);
  await page.click("#inv-sell-all");
  check("only legendary/set left → 'keep' button disabled", await page.getByRole("button", { name: "남길 것 빼면 팔 게 없어요" }).isDisabled());
  await page.getByRole("button", { name: /모두 판매 2개/ }).click();
  d = await inv(page);
  check("sell everything → bag empty, stones added", d.bag.length === 0 && d.stones === restStones + RL.sellStones(legend) + RL.sellStones(setHelm));
  check("no page errors", errors.length === 0, errors.join("; "));

  // ---- 레전더리·세트 없으면 예전처럼 확인 창 한 번 ----
  ({ page, errors, dialogs } = await open([rare, common]));
  await page.click("#inv-sell-all");
  check("no legendary/set → native confirm once, then sold", dialogs.length === 1 && (await inv(page)).bag.length === 0, dialogs.join("|"));

  // ---- 휴대폰 화면 ----
  ({ page, errors } = await open([legend, setHelm, rare, epic, common], { ...devices["iPhone 13"] }));
  await page.click("#inv-sell-all");
  const box = await page.locator("#inv-sell-ask").boundingBox();
  check("phone: ask box fits screen width", box && box.x >= 0 && box.x + box.width <= 390 + 1, JSON.stringify(box));
  await page.locator("#inv-sell-ask").scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(OUT, "sell-ask-phone.png") });
  check("phone: no page errors", errors.length === 0, errors.join("; "));
} finally {
  await browser.close();
}
const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
