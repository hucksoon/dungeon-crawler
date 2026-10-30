// 할로윈 로고 만들기 (dc#133): 원본 로고 큰 그림 → img/logo-halloween.webp (780×408, 게임 로고 img/logo.webp와 같은 크기)
//   node tools/logo-halloween.mjs <원본 로고 (배경 투명, 1734×907)>
//   그리는 내용은 tools/logo-halloween.js. 만든 결과는 저장소에 올리므로 게임에는 필요 없음
//   필요: playwright(전역 설치 → NODE_PATH)
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
const require = createRequire((process.env.NODE_PATH || "/usr/lib/node_modules") + "/");
const { chromium } = require("playwright");
const ROOT = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const src = process.argv[2];
if (!src) { console.error("사용: node tools/logo-halloween.mjs <원본 로고 그림>"); process.exit(1); }
const ext = path.extname(src).slice(1).toLowerCase();
const b = await chromium.launch(); const p = await b.newPage();
await p.addScriptTag({ content: fs.readFileSync(path.join(ROOT, "tools/logo-halloween.js"), "utf8") });
const data = `data:image/${ext === "jpg" ? "jpeg" : ext};base64,` + fs.readFileSync(src).toString("base64");
const out = await p.evaluate(async (d) => {
  const big = await window.buildHW(d, { letters: "pumpkin" });
  const i = new Image(); i.src = big; await i.decode();
  const c = document.createElement("canvas"); c.width = 780; c.height = 408; const x = c.getContext("2d");
  x.imageSmoothingQuality = "high"; x.drawImage(i, 0, 0, 780, 408);
  return c.toDataURL("image/webp", 0.9);
}, data);
await b.close();
fs.writeFileSync(path.join(ROOT, "img/logo-halloween.webp"), Buffer.from(out.split(",")[1], "base64"));
console.log("img/logo-halloween.webp");
