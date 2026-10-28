// 블로그 "게임 이미지" 페이지(blog/media.html)에 올릴 썸네일·스크린샷 가져오기
//   node tools/media-sync.mjs [store 폴더]   (기본 ../dungeon-crawler-html5/store — 포털 빌드 저장소의 store/shots.mjs가 만든 그림)
// 하는 일: 그림을 blog/media/에 dungeon-crawler-*.png 이름으로 복사, 페이지에 보일 작은 미리보기(preview/*.jpg, 폭 480, ImageMagick),
//          크기를 읽어 blog/media/media.json, 전부 묶은 zip
// 그다음 node tools/blog-build.mjs로 페이지를 다시 만듦
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SRC = path.resolve(process.argv[2] || path.join(ROOT, "../dungeon-crawler-html5/store"));
const OUT = path.join(ROOT, "blog/media"), ZIP = "dungeon-crawler-media.zip";
// [가져올 파일, 블로그 이름, 설명]
const GROUPS = [
  { title: "썸네일", note: "게임 포털·소개 글에 쓰는 표지예요. 가로 16:9, 세로 2:3, 정사각형이 있어요.", items: [
    ["covers/landscape-1920x1080.png", "cover-landscape-1920x1080.png", "가로 표지 16:9"],
    ["covers/portrait-800x1200.png", "cover-portrait-800x1200.png", "세로 표지 2:3"],
    ["covers/square-800x800.png", "cover-square-800x800.png", "정사각형 표지"],
    ["covers/square-1200x1200.png", "cover-square-1200x1200.png", "큰 정사각형 표지"],
  ] },
  { title: "스크린샷", note: "실제 게임 화면이에요 (영어 화면, 포털 버전).", items: [
    ["screens/town.png", "screen-town.png", "마을: 가운데 웨이포인트, 왼쪽 던전 입구, 오른쪽 골드 던전"],
    ["screens/fight.png", "screen-fight.png", "헬 던전 10층: 화염의 세트로 화염구"],
    ["screens/dungeon.png", "screen-dungeon.png", "일반 던전 12층 탐험"],
    ["screens/inventory.png", "screen-inventory.png", "인벤토리: 장비 비교"],
    ["screens/codex.png", "screen-codex.png", "몬스터 도감"],
  ] },
];

// PNG 크기: IHDR (16바이트부터 너비·높이)
const pngSize = (file) => { const b = fs.readFileSync(file); if (b.toString("ascii", 1, 4) !== "PNG") throw new Error(`PNG가 아니에요: ${file}`); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }; };

if (!fs.existsSync(SRC)) throw new Error(`그림 폴더가 없어요: ${SRC}`);
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, "preview"), { recursive: true });
const manifest = { zip: ZIP, groups: [] };
for (const g of GROUPS) {
  const items = g.items.map(([from, name, caption]) => {
    const src = path.join(SRC, from), file = `dungeon-crawler-${name}`;
    if (!fs.existsSync(src)) throw new Error(`그림이 없어요: ${src}`);
    fs.copyFileSync(src, path.join(OUT, file));
    const preview = `preview/${file.replace(/\.png$/, ".jpg")}`;
    execFileSync("convert", [src, "-resize", "480x480>", "-strip", "-quality", "82", path.join(OUT, preview)]);
    return { file, preview, caption, ...pngSize(src), bytes: fs.statSync(src).size };
  });
  manifest.groups.push({ title: g.title, note: g.note, items });
}
execFileSync("zip", ["-q", "-X", "-j", path.join(OUT, ZIP), ...manifest.groups.flatMap(g => g.items.map(it => path.join(OUT, it.file)))]);
manifest.zipBytes = fs.statSync(path.join(OUT, ZIP)).size;
fs.writeFileSync(path.join(OUT, "media.json"), JSON.stringify(manifest, null, 2) + "\n");
const n = manifest.groups.reduce((s, g) => s + g.items.length, 0);
console.log(`blog/media/: 그림 ${n}장 · ${ZIP} (${(manifest.zipBytes / 1048576).toFixed(1)} MB) → node tools/blog-build.mjs`);
