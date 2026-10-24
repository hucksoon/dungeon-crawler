#!/usr/bin/env node
// 게임 화면 문구 번역 확인: index.html · builds.html · ranking.html · builds.js의 T("…")·data-t·data-t-aria 문구가
// i18n/en-ui.js · ja-ui.js에 모두 있는지
//
//   node tools/i18n-check.mjs            # 빠진 번역 개수 (있으면 종료 코드 1)
//   node tools/i18n-check.mjs --list     # 빠진 문구까지 보기
//   node tools/i18n-check.mjs --unused   # 번역 파일에는 있는데 화면에서 안 쓰는 문구 (지워도 됨)
//
// 키는 한국어 원문 그대로라서, 화면의 문구를 고치면 en-ui.js · ja-ui.js의 키도 같이 고쳐야 해요
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const require = createRequire(import.meta.url);
const L = require(ROOT + "i18n.js");
for (const f of ["en", "ja", "en-ui", "ja-ui"]) require(`${ROOT}i18n/${f}.js`);
const LIST = process.argv.includes("--list");

const norm = (h) => h.trim().replace(/\s+/g, " ");
const keys = new Set();
const FILES = ["index.html", "builds.html", "ranking.html", "builds.js"];
for (const file of FILES) {
  const src = readFileSync(ROOT + file, "utf8").split("\n").filter(l => !/^\s*\/\//.test(l)).join("\n");
  // data-t: 여는 태그 다음부터 짝이 맞는 닫는 태그까지
  for (const m of src.matchAll(/<(\w+)\b[^>]*\sdata-t(?=[\s>])[^>]*>/g)) {
    const re = new RegExp(`<${m[1]}\\b[^>]*>|</${m[1]}>`, "g");
    re.lastIndex = m.index + m[0].length;
    let depth = 1, x;
    while (depth && (x = re.exec(src))) depth += x[0][1] === "/" ? -1 : 1;
    keys.add(norm(src.slice(m.index + m[0].length, x.index)));
}
for (const m of src.matchAll(/<\w+[^>]*aria-label="([^"]+)"[^>]*data-t-aria/g)) keys.add(m[1]);
for (const m of src.matchAll(/\b(?:T|RLI18N\.t)\(\s*"((?:[^"\\]|\\.)*)"/g)) keys.add(JSON.parse(`"${m[1]}"`));
}

if (process.argv.includes("--keys")) { console.log(JSON.stringify([...keys])); process.exit(0); }
if (process.argv.includes("--unused")) {
  for (const code of ["en", "ja"]) {
    L.setLang(code);
    const extra = Object.keys(L.uiDump()).filter(k => !keys.has(k));
    console.log(`${code}: 안 쓰는 문구 ${extra.length}개`);
    for (const k of extra) console.log("  - " + JSON.stringify(k));
  }
  process.exit(0);
}

let bad = 0;
for (const code of ["en", "ja"]) {
  L.setLang(code);
  const miss = [...keys].filter(k => { L.missing.clear(); L.t(k); return L.missing.size > 0; });
  console.log(`${code}: 키 ${keys.size}개 중 번역 없음 ${miss.length}개`);
  if (LIST) for (const k of miss) console.log("  - " + JSON.stringify(k));
  bad += miss.length;
}
process.exit(bad ? 1 : 0);
