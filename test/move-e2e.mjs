// 주소 옮기기 테스트: 예전 주소 안내 페이지 → 새 주소(game.apacimtest.com)로 게스트 기록 넘기기
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
const require = createRequire(process.env.NODE_PATH + "/");
const { chromium } = require("playwright");
const REPO = process.argv[2];
const OLD_PAGE = process.argv[3];
const RL = createRequire(import.meta.url)(path.join(REPO, "items.js"));
const OLD = "https://hucksoon.github.io/hucksoon/", NEW = "https://game.apacimtest.com/";
const results = [];
const check = (n, ok, x = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x && !ok ? " — " + x : ""}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const waitFor = async (fn, ms = 10000) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (await fn()) return true; } catch {} await sleep(150); } return false; };

const find = (pred, tag) => { for (let n = 0; n < 200000; n++) { const it = RL.generate(`${tag}${n}|shop|d5|s${n % 6}`, "golden", 5); if (pred(it)) return it; } };
const epic = find(x => x.rarity === "epic", "mv");
const DEV = "old-guest-device-1";
const save = (gold) => JSON.stringify({ v: 1, best: 4, run: { d: 4, hp: 100, mh: 100, a: 20, g: gold, p: 1, l: 3, x: 0, xn: 100, rid: "oldrun", k: 0, pp: 0 } });
const inv = (bag, logN = 3) => JSON.stringify({ bag, equip: Object.fromEntries(RL.SLOTS.map(s => [s, null])), log: Array.from({ length: logN }, (_, i) => ({ ev: "get", id: "l" + i, note: "기록" })), stones: 5 });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
async function open({ oldStore = {}, newStore = {}, start = OLD }) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 } });
  const page = await ctx.newPage(); const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await ctx.route(OLD + "**", r => r.fulfill({ status: new URL(r.request().url()).pathname === "/hucksoon/" ? 200 : 404, contentType: "text/html", body: fs.readFileSync(OLD_PAGE) }));
  await ctx.route(NEW + "**", r => { const f = new URL(r.request().url()).pathname.slice(1) || "index.html";
    if (f === "ranking-config.js") return r.fulfill({ contentType: "text/javascript", body: 'window.RANKING_API = "";' });
    const p = path.join(REPO, f); if (!fs.existsSync(p)) return r.fulfill({ status: 404, body: "" });
    r.fulfill({ contentType: f.endsWith(".js") ? "text/javascript" : "text/html", body: fs.readFileSync(p) }); });
  await ctx.route("https://login.xsolla.com/**", r => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await ctx.addInitScript(([o, n]) => {
    if (sessionStorage.getItem("seeded")) return; sessionStorage.setItem("seeded", 1);
    const s = location.host === "hucksoon.github.io" ? o : n;
    for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v);
  }, [oldStore, newStore]);
  await page.goto(start);
  return { ctx, page, errors };
}
const onNew = (page) => waitFor(async () => page.url().startsWith(NEW) && await page.locator("#log").count() > 0, 10000);
const ls = (page, k) => page.evaluate(k => localStorage.getItem(k), k);

try {
  // 1. 게스트 기록이 있는 브라우저
  const A = await open({ oldStore: { rl_device_id: DEV, rl_save: save(777), [`rl_inv:g:${DEV}`]: inv([epic], 450), [`rl_dex:g:${DEV}`]: JSON.stringify({ seen: { rat: true }, kills: { rat: 9 } }), rl_level: "{}" } });
  check("old page shows notice and link", (await A.page.locator("#note").innerText()).includes("이 브라우저에서 하던"));
  check("auto-redirects to new address", await onNew(A.page), A.page.url());
  check("hash removed from address after import", A.page.url() === NEW, A.page.url());
  const invA = JSON.parse(await ls(A.page, `rl_inv:g:${DEV}`));
  check("device id carried over (same guest)", await ls(A.page, "rl_device_id") === DEV);
  check("bag carried over (epic, stones)", invA.bag[0]?.id === epic.id && invA.stones === 5);
  check("long item log trimmed to last 300", invA.log.length === 300 && invA.log[299].id === "l449");
  check("dex carried over", JSON.parse(await ls(A.page, `rl_dex:g:${DEV}`)).kills.rat === 9);
  check("progress carried over (gold 777 shown)", await waitFor(async () => (await A.page.locator("#stats").innerText()).includes("777")));
  check("log says imported", (await A.page.locator("#log").innerText()).includes("예전 주소에서 하던 게스트 기록"));
  await A.page.reload();
  check("reload after import: no second import message, data kept", !(await A.page.locator("#log").innerText()).includes("예전 주소") && JSON.parse(await ls(A.page, `rl_inv:g:${DEV}`)).bag.length === 1);

  // 2. 로그인했던 브라우저: 진행 상황은 넘기지 않고(서버에 있음) 그 브라우저에만 있던 계정 가방은 넘김
  const B = await open({ oldStore: { rl_device_id: "logged-dev-1", rl_auth: '{"access":"x.y.z"}', rl_save: save(5) } });
  check("logged-in: notice says log in again", (await B.page.locator("#note").innerText()).includes("다시 로그인"));
  check("logged-in: redirect without data", await onNew(B.page) && JSON.parse(await ls(B.page, "rl_save") || "null")?.run?.g !== 5 && await ls(B.page, "rl_auth") === null && await ls(B.page, "rl_device_id") !== "logged-dev-1");

  // 3. 새 주소에 이미 기록이 있으면 덮어쓰지 않고, 게스트 장비만 지금 가방에 합침
  const C = await open({ oldStore: { rl_device_id: DEV, rl_save: save(777), [`rl_inv:g:${DEV}`]: inv([epic]) }, newStore: { rl_device_id: "new-dev-0001", rl_save: save(11) } });
  check("existing new data: progress not overwritten", await onNew(C.page) && await ls(C.page, "rl_device_id") === "new-dev-0001" && JSON.parse(await ls(C.page, "rl_save")).run.g === 11);
  check("existing new data: old guest gear merged into current bag", await waitFor(async () => JSON.parse(await ls(C.page, "rl_inv:g:new-dev-0001") || "null")?.bag.some(x => x.id === epic.id)));
  check("existing new data: merge logged, stash cleared", (await C.page.locator("#log").innerText()).includes("예전 주소에 있던 장비 1개") && await ls(C.page, "rl_old:g") === null);

  // 3b. 예전 주소에서 계정으로 하던 가방 → 새 주소에서 같은 계정으로 로그인 중이면 바로 합침
  const SUBX = "acct-old-1234";
  const tok = (sub) => JSON.stringify({ access: "h." + Buffer.from(JSON.stringify({ sub, email: "x@y.z", exp: 9999999999 })).toString("base64url") + ".s", refresh: "R", exp: Date.now() + 3600e3 });
  const legend = find(x => x.rarity === "legendary", "lgx");
  const many = Array.from({ length: 48 }, (_, i) => find(x => x.rarity === "rare", "full" + i));
  const L = await open({ oldStore: { rl_device_id: "old-acct-dev", rl_auth: tok(SUBX), rl_save: save(5), [`rl_inv:u:${SUBX}`]: inv([legend, epic], 500), [`rl_dex:u:${SUBX}`]: JSON.stringify({ seen: { bat: true }, kills: { bat: 4 } }) },
                         newStore: { rl_device_id: "new-acct-dev", rl_auth: tok(SUBX), [`rl_inv:u:${SUBX}`]: inv(many) } });
  check("logged-in old: notice mentions moving gear", (await L.page.locator("#note").innerText()).includes("장비도 함께"));
  check("logged-in old: redirected with data (not login token)", await onNew(L.page) && L.page.url() === NEW);
  const invL = async () => JSON.parse(await ls(L.page, `rl_inv:u:${SUBX}`));
  const mailL = async () => JSON.parse(await ls(L.page, `rl_mail:u:${SUBX}`) || "[]");
  check("logged-in new: old account gear merged (bag full → box mail)", await waitFor(async () => (await mailL()).map(m => m.item.id).sort().join() === [legend.id, epic.id].sort().join()), JSON.stringify(await mailL()).slice(0, 200));
  check("logged-in new: bag stays at 48", (await invL()).bag.length === 48);
  check("logged-in new: dex merged", JSON.parse(await ls(L.page, `rl_dex:u:${SUBX}`)).kills.bat === 4);
  check("logged-in new: stash cleared, device id untouched", await ls(L.page, `rl_old:u:${SUBX}`) === null && await ls(L.page, "rl_device_id") === "new-acct-dev");
  check("logged-in new: run progress from old site not imported", JSON.parse(await ls(L.page, "rl_save") || "null")?.run?.g !== 5);

  // 3c. 새 주소에서 아직 로그인 전이면: 계정 가방은 보관해 뒀다가 그 계정으로 로그인하면 합침
  const M = await open({ oldStore: { rl_device_id: "old-acct-dev2", rl_auth: tok(SUBX), [`rl_inv:u:${SUBX}`]: inv([legend]) }, newStore: { rl_device_id: "new-guest-dev" } });
  check("guest on new: account gear kept aside, message shown", await onNew(M.page) && await waitFor(async () => (await M.page.locator("#log").innerText()).includes("그 계정으로 로그인하면")) && JSON.parse(await ls(M.page, `rl_old:u:${SUBX}`)).inv);
  check("guest on new: not merged into guest bag", !(JSON.parse(await ls(M.page, "rl_inv:g:new-guest-dev") || '{"bag":[]}').bag.some(x => x.id === legend.id)));
  await M.page.evaluate(([k, v]) => localStorage.setItem(k, v), ["rl_auth", tok(SUBX)]);
  await M.page.reload();
  check("guest on new → logs in: gear merged into account", await waitFor(async () => JSON.parse(await ls(M.page, `rl_inv:u:${SUBX}`) || '{"bag":[]}').bag.some(x => x.id === legend.id)) && await ls(M.page, `rl_old:u:${SUBX}`) === null);

  // 4. 옛 상점·랭킹 링크 → 새 주소의 같은 페이지
  const D = await open({ start: OLD + "shop.html" });
  check("old shop link → new shop page", await waitFor(() => D.page.url() === NEW + "shop.html", 8000), D.page.url());
  const E = await open({ start: OLD + "ranking.html" });
  check("old ranking link → new ranking page", await waitFor(() => E.page.url() === NEW + "ranking.html", 8000), E.page.url());

  // 5. 처음 온 사람: 그냥 이동
  const F = await open({});
  check("fresh visitor: plain redirect", await onNew(F.page) && F.page.url() === NEW);

  // 6. 이상한 #import는 무시
  const G = await open({ start: NEW + "#import=bm90LWpzb24" });
  const G2 = await open({ start: NEW + "#import=" + Buffer.from(JSON.stringify({ rl_device_id: "x", rl_auth: "evil" })).toString("base64url") });
  await sleep(1000);
  check("malformed import ignored", !(await G.page.locator("#log").innerText()).includes("옮겨 왔다") && G.page.url() === NEW);
  check("bad device id / extra keys ignored", await ls(G2.page, "rl_auth") === null && await ls(G2.page, "rl_device_id") !== "x");
  const H = await open({ start: NEW + "#import=" + Buffer.from(JSON.stringify({ rl_device_id: "valid-dev-123", rl_auth: "evil", rl_profile: "x", rl_save: save(3) })).toString("base64url") });
  await sleep(1000);
  check("only game keys imported (no login token)", await ls(H.page, "rl_auth") === null && await ls(H.page, "rl_device_id") === "valid-dev-123");

  for (const [n, x] of Object.entries({ A, B, C, L, M, D, E, F, G, G2, H })) check(`${n}: no page errors`, x.errors.length === 0, x.errors.join("; "));
} finally {
  await browser.close();
}
const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
