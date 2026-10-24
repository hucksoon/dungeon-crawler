// 번역 틀을 불러도(한국어) 문구가 틀 없이와 똑같은지
const REPO = process.argv[2], WITH = process.argv[3] === "1";
if (WITH) { const L = require(REPO + "/i18n.js"); require(REPO + "/i18n/en.js"); require(REPO + "/i18n/ja.js"); }
const I = require(REPO + "/items.js"), M = require(REPO + "/monsters.js");
if (WITH) globalThis.RLI18N.apply(I, M);
const out = [];
for (const s of ["a|j10|k", "a|n10|k", "b|d75|k"]) for (let i = 0; i < 600; i += 7) { const it = I.generate(s + i, "boss", 130); out.push(I.itemName({ ...it, enh: i % 5 }), ...[...(it.main || []), ...(it.lines || [])].map(([k, v]) => I.formatStat(k, v))); }
for (const k of I.GEM_KINDS) for (const g of [0, 1, 2]) out.push(I.gemName(k, g), I.socketedName([k, g]));
for (let k = 0; k < I.RUNES.length; k++) out.push(I.runeName(k));
for (const w of I.RUNEWORDS) out.push(...I.runewordSpecialText(w.special));
for (const t of M.MONSTERS) out.push(M.makeMonster(t, "elite", 5).name, M.makeNightmare(t, "elite", 5, "fire").name, M.makeHell(t, "normal", 5, "ice").name);
out.push(I.formatStat("socket", 3));
console.log(out.join("\n"));
