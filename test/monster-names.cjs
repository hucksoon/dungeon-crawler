// 저장된 층의 몬스터 이름 다시 짓기 (RLMonsters.nameOf): 한국어로 만든 몬스터 → 언어를 바꾼 뒤 nameOf = 그 언어로 새로 만든 이름
//   node test/monster-names.cjs . en
const REPO = require("node:path").resolve(process.argv[2] || "."), LANG = process.argv[3] || "en";
const L = require(REPO + "/i18n.js"); require(REPO + "/i18n/en.js"); require(REPO + "/i18n/ja.js");
const I = require(REPO + "/items.js"), M = require(REPO + "/monsters.js");
const EL = [null, "fire", "ice", "bolt"];
// 같은 인자로 만들 몬스터 목록 (속성은 직접 줘서 결과가 같게)
const cases = [];
for (const t of M.MONSTERS) for (const kind of ["normal", "elite"]) {
  cases.push(() => M.makeMonster(t, kind, 5));
  for (const el of EL) cases.push(() => M.makeNightmare(t, kind, 10, el));
  for (const el of EL.slice(1)) cases.push(() => M.makeHell(t, kind, 10, el));
}
for (const d of [5, 25, 75]) cases.push(() => M.makeBoss(d));
for (const el of EL) cases.push(() => M.makeNightmareBoss(10, el));
for (const el of EL.slice(1)) cases.push(() => M.makeHellBoss(15, el));
for (const n of [10, 20, 30, 40, 50]) cases.push(() => M.makeNamedBoss(n));
for (const r of ["normal", "elite", "king"]) cases.push(() => M.makeGolden(30, r));
const saved = cases.map(f => JSON.parse(JSON.stringify(f())));   // 한국어로 만들어 저장한 것
const sameKo = saved.every(e => M.nameOf(e) === e.name);
L.setLang(LANG); L.apply(I, M);
let bad = 0;
saved.forEach((e, i) => { const want = cases[i]().name, got = M.nameOf(e); if (got !== want && bad++ < 8) console.log("DIFF", JSON.stringify(e.name), "→", JSON.stringify(got), "want", JSON.stringify(want)); });
const unknown = M.nameOf({ id: "nope", name: "모르는 몬스터" }) === "모르는 몬스터";
console.log(`${bad ? "FAIL" : "PASS"} ${LANG}: ${saved.length} monsters renamed (mismatch ${bad})`);
console.log(`${sameKo ? "PASS" : "FAIL"} ko: nameOf keeps every Korean name`);
console.log(`${unknown ? "PASS" : "FAIL"} unknown monster keeps its saved name`);
process.exit(bad || !sameKo || !unknown ? 1 : 0);
