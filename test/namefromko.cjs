// 한국어 이름 → 그 언어 이름 (nameFromKo)이 게임의 itemName과 같은지
const REPO = process.argv[2], LANG = process.argv[3];
const L = require(REPO + "/i18n.js"); require(REPO + "/i18n/en.js"); require(REPO + "/i18n/ja.js");
const I = require(REPO + "/items.js"), M = require(REPO + "/monsters.js");
const items = [];
const srcs = [["drop", (i) => `a${i}|d${1 + i % 75}|k${i}`, (i) => 1 + i % 75], ["boss", (i) => `b${i}|n${1 + i % 50}|k${i}`, (i) => 75 + 1 + i % 50], ["golden", (i) => `c${i}|j${1 + i % 50}|k${i}`, (i) => 125 + 1 + i % 50], ["golden", (i) => `d${i}|shop|d20|s${i % 6}`, () => 20]];
for (const [src, seed, lvl] of srcs) for (let i = 0; i < 3000; i++) { const it = I.generate(seed(i), src, lvl(i)); it.enh = i % 13; if (i % 7 === 0) it.ancient = true; items.push(it); }
for (const uq of Object.keys(I.UNIQUE.items)) items.push({ ...I.generateUnique(`buy|m0123456789abcdef|${uq}`, 175), enh: 4 });
// 룬워드: 커먼 아이템에 룬을 넣어 완성
for (const w of I.RUNEWORDS) { const base = items.find(it => it.rarity === "common" && I.runewordsFor(it).includes(w)); if (base) items.push({ ...base, gems: w.runes.map(r => ["rune", r]), enh: 2 }); }
const ko = items.map(it => I.itemName(it));
const hasRw = items.filter(it => I.runewordOf(it)).length, hasSet = items.filter(it => it.set).length, hasAcc = items.filter(I.isAccessory).length, hasUq = items.filter(it => I.uniqueOf(it)).length;
L.setLang(LANG); L.apply(I, M);
let bad = 0, same = 0;
items.forEach((it, i) => { const want = I.itemName(it), got = I.nameFromKo(ko[i]); if (got !== want) { if (bad++ < 8) console.log("DIFF", JSON.stringify(ko[i]), "→", JSON.stringify(got), "want", JSON.stringify(want)); } else if (/[가-힣]/.test(got.replace(/(?<![가-힣])[가나다라마바사아자차카타파하](?![가-힣])/g, ""))) same++; });
console.log(`${LANG}: ${items.length} items (set ${hasSet}, acc ${hasAcc}, unique ${hasUq}, runeword ${hasRw}), mismatches ${bad}, still Korean ${same}`);
console.log("unknown name kept:", I.nameFromKo("이상한 이름") === "이상한 이름", "| old v1 style:", I.nameFromKo("+1 전설 투구"));
process.exit(bad ? 1 : 0);
