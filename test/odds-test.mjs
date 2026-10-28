// 장비 상자 확률 공개 (dc#107): 상점에 보여 주는 확률(items.js boxOdds)이 실제로 상자를 여는 규칙(generate "box")과 같은지
//   규칙에서 계산한 값과 30만 번 연 결과를 비교 (등급·고대·부위), 합이 100%, 서버(rules.php)도 같은 등급표
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import path from "node:path";
const REPO = process.argv[2];
const I = createRequire(import.meta.url)(path.join(REPO, "items.js"));
const results = []; const check = (n, ok, x = "") => { results.push(!!ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x && !ok ? " — " + x : ""}`); };
const o = I.boxOdds();
check("rarity chances add up to 100%", Math.abs(Object.values(o.at).reduce((a, b) => a + b, 0) - 1) < 1e-12);
check("set 1% × 7/9 (no sets on necklace/ring), legendary 3% + 1% × 2/9", Math.abs(o.at.set - 0.01 * 7 / 9) < 1e-12 && Math.abs(o.at.legendary - (0.03 + 0.01 * 2 / 9)) < 1e-12, JSON.stringify(o.at));
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
check("multi-box: at least one legendary or set in 10 / 50 boxes", Math.abs(o.atLeast(10, ["legendary", "set"]) - (1 - 0.96 ** 10)) < 1e-12 && Math.abs(o.atLeast(50, ["legendary", "set"]) - (1 - 0.96 ** 50)) < 1e-12);
const php = execFileSync("php", ["-r", `require "${path.join(REPO, "ranking-php/rules.php")}"; echo json_encode(R_TABLES["box"]);`]).toString();
check("server (rules.php) box table is the same as items.js", JSON.stringify(JSON.parse(php)) === JSON.stringify(I.TABLES.box), php);
const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
