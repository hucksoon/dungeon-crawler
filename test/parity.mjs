// JS(items.js, 옛 v1 items.js) vs PHP(rules.php) 아이템 생성 일치 확인
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
const require = createRequire(import.meta.url);
const [REPO, S] = process.argv.slice(2);
const I2 = require(`${REPO}/items.js`), I1 = require(`${S}/items-v1.js`);
const N = Number(process.env.N || 6000);
const srcs = ["box", "drop", "boss", "golden"];
const seeds = (i) => [`abc123def456|d${1 + (i % 30)}|k${i}`, `box|o${758000000 + i}|${i % 50}`, `rid${i}|shop|d${5 * (1 + i % 6)}|r${i % 4}|s${i % 6}`, `유니코드-${i}-🗡`, `x`,
  `nmrun${i}|n${1 + (i % 50)}|k${i}`, `nmrun${i}|shop|n${4 + 5 * (i % 10)}|s${i % 6}`, `hellrun${i}|j${1 + (i % 50)}|k${i}`][i % 8];  // 뒤 두 개: 나이트메어 (r3이면 속성 줄)
const items = [];
const hashOdd = (str) => { let h = 0; for (const c of str) h = (h * 31 + c.charCodeAt(0)) | 0; return (h & 1) === 1; };
for (let i = 0; i < N; i++) items.push({ v: [1, 2, 3, 4, 4, 4, 4, 4, 4][i % 9], r: [0, 0, 0, 1, 2, 3, 4, 5, 6][i % 9], seed: seeds(i), src: srcs[i % 4], lvl: 1 + (i * 7) % 130, enh: i % 11, ar: i % 3 === 0 ? 1 + (i % 20) : 0, rf: i % 4 === 1 ? Array.from({ length: 1 + i % 5 }, (_, j) => (i + j * 3) % 5) : [], g: Array.from({ length: i % 7 }, (_, j) => (i + j) % 3 === 0 ? ["rune", (i * 5 + j) % 14] : [["ruby", "sapphire", "emerald", "topaz", "diamond"][(i + j) % 5], (i * 3 + j) % 3]) });  // g: 홈에 넣은 보석·룬  // ar: 고대 다시 굴리기 횟수
// r7 (장신구가 부위 후보): r6 아이템의 절반을 r7로
for (const q of items) if (q.v === 4 && q.r === 6 && hashOdd(q.seed)) q.r = 7;
// 유니크 (헬 네임드 보스, 출처 unique): 강화 0~12
for (let i = 0; i < Number(process.env.NU || 1500); i++) { const f = 10 * (1 + i % 5); items.push({ v: 4, r: i % 2 ? 7 : 6, seed: `uqrun${i}|j${f}|u${i}`, src: "unique", lvl: 125 + f, enh: i % 13, ar: i % 5 === 0 ? 1 + i % 40 : 0, rf: [], g: [] }); }
// 유니크 장신구 (r7, 시드 |a)
for (let i = 0; i < Number(process.env.NA || 800); i++) { const f = 10 * (1 + i % 5); items.push({ v: 4, r: 7, seed: `uarun${i}|j${f}|a${i}`, src: "unique", lvl: 125 + f, enh: i % 13, ar: i % 7 === 0 ? 1 + i % 40 : 0, rf: [], g: [] }); }
// 고대 유니크 선택 상자 (buy|m우편|유니크): 15종 × 강화
{ const K = Object.keys(I2.UNIQUE.items); for (let i = 0; i < 300; i++) { const k = K[i % K.length]; items.push({ v: 4, r: 8, seed: `buy|m${(0x1000000000000000n + BigInt(i) * 7919n).toString(16)}|${k}`, src: "unique", lvl: I2.boughtLevel(k), enh: i % 13, ar: 0 }); } }
// r8 (장신구 공격력·방어력·최대 HP 고정 수치): r7의 절반을 r8로 (유니크·유니크 장신구 포함)
for (const q of items) if (q.r === 7 && hashOdd(q.seed + "r8")) q.r = 8;
const NN = items.length;
const sets = [];
for (let i = 0; i < 600; i++) sets.push({ plvl: 1 + i % 25, items: Array.from({ length: 7 }, (_, j) => (i % 3 || j % 2 ? items[(i * 7 + j) % N] : items[N + (i * 7 + j) % (NN - N)])) });
const php = JSON.parse(execFileSync("php", [`${S}/parity.php`, `${REPO}/ranking-php/rules.php`], { input: JSON.stringify({ items, sets }), maxBuffer: 1 << 28 }).toString());
let bad = 0;
const js = (q) => { const it = q.v === 1 ? { ...I1.generate(q.seed, q.src, q.lvl), enh: q.enh } : { ...(q.ar && I2.applyAncientRerolls ? I2.applyAncientRerolls(I2.generate(q.seed, q.src, q.lvl, q.v, q.r), q.ar) : I2.generate(q.seed, q.src, q.lvl, q.v, q.r)), enh: q.enh }; if (q.v === 1) it.ancient = false; if (q.v === 4 && q.rf?.length && I2.applyReforges) I2.applyReforges(it, q.rf); if (q.g?.length) it.gems = q.g; return it; };
const norm = (o) => JSON.stringify(o, Object.keys(o).sort());
for (let i = 0; i < NN; i++) {
  const q = items[i], a = js(q), b = php.items[i];
  const I = q.v === 1 ? I1 : I2;
  const ja = { item: a, name: I2.itemName(a), eb: I2.enhancedBase(a), el: I2.enhancedLines(a), efb: q.v === 1 ? null : I2.effectiveBase(a), efl: q.v === 1 ? null : I2.effectiveLines(a), gate: I.rngFrom(`v${q.v}|drop?|${q.seed}`)() };
  const js1 = (x) => { const t = JSON.stringify(x); return t === "[]" ? "{}" : t; };   // PHP 빈 배열 = JS 빈 객체 (저항 줄 0개 장신구)
  for (const k of ["name", "eb", "el", "efb", "efl", "gate"]) if (js1(ja[k]) !== js1(b[k])) { if (bad++ < 5) console.log("DIFF", k, i, q, JSON.stringify(ja[k]), JSON.stringify(b[k])); }
  for (const k of ["id", "rarity", "slot", "type", "set", "lvl", "ancient", "parry", "v", "r", "ar"]) if (a[k] !== b.item[k]) { if (bad++ < 5) console.log("DIFF item." + k, i, q, a[k], b.item[k]); }
  for (const k of ["main", "lines", "base"]) if (JSON.stringify(a[k] ?? null) !== JSON.stringify(b.item[k] ?? null)) { if (bad++ < 5) console.log("DIFF item." + k, i, q, JSON.stringify(a[k]), JSON.stringify(b.item[k])); }
}
for (let i = 0; i < sets.length; i++) {
  const eq = sets[i].items.map(js), t = I2.totals(eq);
  if (JSON.stringify(t.stats) !== JSON.stringify(php.tot[i].t.stats)) { if (bad++ < 5) console.log("DIFF totals", i, JSON.stringify(t.stats), JSON.stringify(php.tot[i].t.stats)); }
  if (JSON.stringify(t.sets.map(s => [s.name, s.count, s.full, s.bonuses.map(b => b.on)])) !== JSON.stringify(php.tot[i].t.sets.map(s => [s.name, s.count, s.full, s.bonuses.map(b => b.on)]))) { if (bad++ < 5) console.log("DIFF sets", i); }
  // 랭킹 스냅샷 능력치 = 게임 stats(): 레벨마다 +4 HP·+1 공격력, 그리고 레벨 보너스 +2% (dc#95)
  const L = sets[i].plvl, g = t.stats, lv = (L - 1) * 2, pct = (v, p) => Math.round(v * (1 + p / 100));
  const want = { maxHp: pct(20 + 4 * (L - 1) + g.hp, g.hpPct + lv), atk: pct(3 + (L - 1) + g.atk, g.atkPct + lv) }, ps = php.tot[i].ps;
  if (ps.maxHp !== want.maxHp || ps.atk !== want.atk) { if (bad++ < 5) console.log("DIFF player stats", i, L, JSON.stringify(want), ps.maxHp, ps.atk); }
}
const anc = php.items.filter(x => x.item.ancient).length, rar = {}, slots = {};
for (const x of php.items) slots[x.item.slot + (x.item.set ? ':' + x.item.set : '')] = (slots[x.item.slot + (x.item.set ? ':' + x.item.set : '')] || 0) + 1;
console.log('slots', slots);
for (const x of php.items) rar[x.item.rarity] = (rar[x.item.rarity] || 0) + 1;
console.log(`items ${NN} (ancient ${anc}), equip sets ${sets.length}, rarities`, rar);
console.log(bad ? `FAIL JS == PHP: ${bad} differences` : "PASS JS == PHP: all identical");
process.exit(bad ? 1 : 0);
