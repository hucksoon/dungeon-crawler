// 장비 상자 확률 공개 (dc#107): 상점에 보여 주는 확률(items.js boxOdds)이 실제로 상자를 여는 규칙(generate "box")과 같은지
//   규칙에서 계산한 값과 30만 번 연 결과를 비교 (등급·고대·부위), 합이 100%, 서버(rules.php)도 같은 등급표·고대 확률
//   r9부터 상자는 레전더리·세트만 (75 : 25), 상자 고대 10%. 그 전(r8까지)에 연 상자는 예전 등급표 그대로
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import path from "node:path";
const REPO = process.argv[2];
const I = createRequire(import.meta.url)(path.join(REPO, "items.js"));
const results = []; const check = (n, ok, x = "") => { results.push(!!ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x && !ok ? " — " + x : ""}`); };
const o = I.boxOdds();
check("rarity chances add up to 100%", Math.abs(Object.values(o.at).reduce((a, b) => a + b, 0) - 1) < 1e-12);
check("r9: only legendary and set — set 25% × 7/9 (no sets on necklace/ring), legendary 75% + 25% × 2/9", I.RULES_REV === 9 && Object.keys(o.at).join() === "legendary,set" && Math.abs(o.at.set - 0.25 * 7 / 9) < 1e-12 && Math.abs(o.at.legendary - (0.75 + 0.25 * 2 / 9)) < 1e-12, JSON.stringify(o.at));
check("box ancient 10% (other sources still 3%)", o.ancientChance === 0.1 && I.ancientChance("box", 9) === 0.1 && I.ancientChance("box", 8) === 0.03 && I.ancientChance("drop", 9) === 0.03);
const N = 300000, cnt = {}, anc = { legendary: 0, set: 0 }, slot = {};
for (let i = 0; i < N; i++) {
  const it = I.generate(`box|oODDS${i}|${i % 50}`, "box", 40);
  cnt[it.rarity] = (cnt[it.rarity] || 0) + 1; slot[it.slot] = (slot[it.slot] || 0) + 1;
  if (it.ancient && anc[it.rarity] != null) anc[it.rarity]++;
}
// 4 표준편차 안이면 같은 확률로 봄
const near = (k, p) => Math.abs(k / N - p) <= 4 * Math.sqrt(p * (1 - p) / N);
check(`opened ${N} boxes: every rarity matches the shown chance`, Object.keys(o.at).every(r => near(cnt[r] || 0, o.at[r])), JSON.stringify(Object.fromEntries(Object.entries(cnt).map(([r, k]) => [r, [(k / N * 100).toFixed(3), (o.at[r] * 100).toFixed(3)]]))));
check("ancient legendary / ancient set match", near(anc.legendary, o.ancient.legendary) && near(anc.set, o.ancient.set), JSON.stringify(anc));
check("9 slots, each matches 1/9", Object.keys(slot).length === 9 && Object.entries(slot).every(([s, k]) => near(k, o.slots[s])), JSON.stringify(slot));
check("no uniques from boxes", !cnt.unique);
check("multi-box: at least one set / one ancient in 10 boxes", Math.abs(o.atLeast(10, ["set"]) - (1 - (1 - 0.25 * 7 / 9) ** 10)) < 1e-12 && Math.abs(o.atLeastAncient(10) - (1 - 0.9 ** 10)) < 1e-12);
// 예전(r8) 상자는 예전 등급표 그대로 다시 만들어짐 (이미 산 아이템이 바뀌지 않음)
const old = {}; for (let i = 0; i < 20000; i++) { const r = I.generate(`box|oOLD${i}|0`, "box", 40, 4, 8).rarity; old[r] = (old[r] || 0) + 1; }
check("r8 boxes rebuild with the old table (common ~40%)", Math.abs(old.common / 20000 - 0.4) < 0.02 && old.epic > 0, JSON.stringify(old));
const php = JSON.parse(execFileSync("php", ["-r", `require "${path.join(REPO, "ranking-php/rules.php")}"; echo json_encode([r_tables_for(4, 9)["box"], r_tables_for(4, 8)["box"], r_ancient_chance("box", 9), r_ancient_chance("box", 8), r_ancient_chance("drop", 9)]);`]).toString());
check("server (rules.php): same box tables (r9 and r8) and ancient chances as items.js", JSON.stringify(php[0]) === JSON.stringify(I.tablesFor(4, 9).box) && JSON.stringify(php[1]) === JSON.stringify(I.tablesFor(4, 8).box) && php[2] === 0.1 && php[3] === 0.03 && php[4] === 0.03, JSON.stringify(php));
const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
