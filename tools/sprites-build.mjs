// 픽셀 그림 모음 만들기: img/sprites.png (32×32 칸을 모은 한 장) + sprites.js (이름 → 칸 위치)
//   node tools/sprites-build.mjs
// 그림 출처를 섞어서 씀
//   1) Dungeon Crawl Stone Soup 그림 모음 (CC0, https://github.com/crawl/tiles 의 releases/Nov-2015)
//      받기: git clone --depth 1 --filter=blob:none --sparse https://github.com/crawl/tiles && cd tiles && git sparse-checkout set releases/Nov-2015
//      TILES 환경 변수로 위치를 바꿀 수 있음 (기본 /home/user/crawl/tiles/releases/Nov-2015)
//   2) 이 파일에서 직접 그린 그림: 계단·보물상자·보석·바지, 네임드 보스 장식(구미호 꼬리·저승사자 갓·염라대왕 면류관·고블린 왕관), 할로윈(호박 머리·잭오랜턴·마녀 모자, dc#130)
// 필요: ImageMagick(convert, montage). 만든 결과(img/sprites.png, sprites.js)는 저장소에 올리므로 게임에는 필요 없음
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const TILES = process.env.TILES || "/home/user/crawl/tiles/releases/Nov-2015";
const S = 32, COLS = 16;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "sprites-"));
const im = (...args) => execFileSync("convert", args.flat(), { stdio: ["ignore", "ignore", "inherit"] });
const src = (p) => { const f = path.join(TILES, p.endsWith(".png") ? p : p + ".png"); if (!fs.existsSync(f)) throw new Error(`그림이 없어요: ${p}`); return f; };

// ---- 직접 그리기: 아주 작은 그림판 ----
function canvas() {
  const px = new Uint8Array(S * S * 4);
  const hex = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
  const g = {
    px,
    set(x, y, c, a = 255) { x |= 0; y |= 0; if (x < 0 || y < 0 || x >= S || y >= S || !c) return; const [r, gg, b] = hex(c); const i = (y * S + x) * 4; px[i] = r; px[i + 1] = gg; px[i + 2] = b; px[i + 3] = a; },
    get(x, y) { const i = (y * S + x) * 4; return px[i + 3]; },
    rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) g.set(x + i, y + j, c); },
    line(x0, y0, x1, y1, c) { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1; for (let t = 0; t <= n; t++) g.set(Math.round(x0 + (x1 - x0) * t / n), Math.round(y0 + (y1 - y0) * t / n), c); },
    poly(pts, c) { // 다각형 칠하기 (짝수-홀수 규칙)
      for (let y = 0; y < S; y++) { const xs = []; for (let i = 0; i < pts.length; i++) { const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length]; if ((y0 <= y + 0.5) !== (y1 <= y + 0.5)) xs.push(x0 + (y + 0.5 - y0) * (x1 - x0) / (y1 - y0)); }
        xs.sort((a, b) => a - b); for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.ceil(xs[k] - 0.5); x <= Math.floor(xs[k + 1] - 0.5); x++) g.set(x, y, c); } },
    ellipse(cx, cy, rx, ry, c) { for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) if (((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1) g.set(x, y, c); },
    outline(c = "#0b0b10") { // 그림 둘레에 어두운 테두리 (Crawl 그림처럼)
      const a = Uint8Array.from({ length: S * S }, (_, i) => px[i * 4 + 3]);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (!a[y * S + x] && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => a[(y + dy) * S + (x + dx)] && x + dx >= 0 && x + dx < S && y + dy >= 0 && y + dy < S)) g.set(x, y, c); },
  };
  return g;
}
function savePng(g, file) {
  const raw = Buffer.alloc((S * 4 + 1) * S);
  for (let y = 0; y < S; y++) { raw[y * (S * 4 + 1)] = 0; Buffer.from(g.px.buffer, y * S * 4, S * 4).copy(raw, y * (S * 4 + 1) + 1); }
  const chunk = (type, data) => { const b = Buffer.alloc(8 + data.length + 4); b.writeUInt32BE(data.length, 0); b.write(type, 4, "ascii"); data.copy(b, 8); b.writeUInt32BE(zlib.crc32(Buffer.concat([Buffer.from(type, "ascii"), data])) >>> 0, 8 + data.length); return b; };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4); ihdr[8] = 8; ihdr[9] = 6;
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]));
  return file;
}

// 내려가는 돌계단 (바닥 위에 얹음)
function drawStairs() {
  const g = canvas();
  g.rect(3, 3, 26, 26, "#1b1c24");                      // 구멍 테두리
  const steps = ["#9aa0b2", "#7d8396", "#62677a", "#4a4e5e", "#363946", "#25272f"];
  steps.forEach((c, i) => { g.rect(5 + i * 2, 5 + i * 4, 22 - i * 2, 4, c); g.rect(5 + i * 2, 5 + i * 4, 22 - i * 2, 1, "#c4c9d6"); });
  g.rect(15, 27, 12, 1, "#0d0d12");
  g.outline("#08080c");
  return g;
}
// 보물상자 (로고의 상자처럼 나무 + 금테)
function drawChest() {
  const g = canvas();
  g.rect(5, 14, 22, 13, "#7a4a24"); g.rect(5, 14, 22, 2, "#9a6232");      // 몸통
  g.poly([[5, 14], [5, 10], [8, 7], [24, 7], [27, 10], [27, 14]], "#8d5529"); // 뚜껑
  g.rect(6, 8, 20, 1, "#b07a42");
  for (const x of [8, 22]) { g.rect(x, 8, 2, 19, "#d9a63a"); g.rect(x, 8, 1, 19, "#f3cf6a"); } // 금테
  g.rect(5, 14, 22, 1, "#d9a63a"); g.rect(5, 26, 22, 1, "#a8772a");
  g.rect(14, 13, 4, 5, "#e8b84a"); g.rect(15, 15, 2, 2, "#3a2410");          // 자물쇠
  g.outline();
  return g;
}
// 보석 (색별로): 위가 넓고 아래가 뾰족한 다이아몬드 + 면
function drawGem(c) {
  const g = canvas();
  const [l, m, d] = c;
  g.poly([[9, 12], [13, 8], [19, 8], [23, 12], [16, 25]], m);
  g.poly([[9, 12], [23, 12], [16, 25]], d);
  g.poly([[13, 8], [16, 12], [19, 8]], l);
  g.poly([[9, 12], [13, 8], [12, 12]], l);
  g.line(16, 12, 16, 24, l);
  g.set(14, 10, "#ffffff"); g.set(15, 9, "#ffffff");
  g.outline();
  return g;
}
// 바지 (Crawl 그림에 없는 부위)
function drawPants() {
  const g = canvas();
  g.poly([[9, 7], [23, 7], [25, 27], [18, 27], [16, 14], [14, 27], [7, 27]], "#5b5f72");
  g.rect(9, 7, 14, 3, "#7a4a24"); g.rect(15, 7, 2, 3, "#d9a63a");          // 허리띠
  g.line(10, 11, 8, 26, "#7d8396"); g.line(22, 11, 24, 26, "#3f4252");
  g.outline();
  return g;
}
// 던전 상점: 줄무늬 차양 + 나무 진열대 + 금화 (상점 색 하늘색에 맞춤)
function drawShop() {
  const g = canvas();
  g.rect(6, 10, 2, 18, "#5a3a1c"); g.rect(24, 10, 2, 18, "#5a3a1c");            // 기둥
  g.poly([[3, 11], [6, 4], [26, 4], [29, 11]], "#e8f8ff");                        // 차양
  for (let i = 0; i < 6; i++) g.poly([[3 + i * 4.3, 11], [6 + i * 3.3, 4], [7.6 + i * 3.3, 4], [5.1 + i * 4.3, 11]], "#2fb8d8");
  for (let x = 3; x < 29; x += 4) g.rect(x, 11, 3, 2, x % 8 === 3 ? "#2fb8d8" : "#e8f8ff");
  g.rect(5, 19, 22, 9, "#7a4a24"); g.rect(5, 19, 22, 2, "#a8692f"); g.rect(5, 27, 22, 1, "#4a2a12"); // 진열대
  g.ellipse(12, 17.5, 2.5, 2, "#ffcf5c"); g.set(11, 17, "#fff3b0");             // 금화
  g.rect(18, 14, 3, 5, "#ff5a6e"); g.rect(18, 14, 3, 1, "#ffb3bd"); g.rect(19, 13, 1, 1, "#d0d4e0"); // 물약
  g.outline();
  return g;
}
// 장식 (몬스터 그림 위에 얹음)
function drawCrown() { // 고블린 왕관
  const g = canvas();
  g.poly([[10, 9], [10, 4], [12, 6], [14, 3], [16, 6], [18, 3], [20, 6], [22, 4], [22, 9]], "#e8b84a");
  g.rect(10, 8, 13, 2, "#b8862a"); g.set(14, 3, "#ff4f6a"); g.set(18, 3, "#ff4f6a"); g.set(16, 7, "#4fd1ff");
  g.outline("#2a1a08");
  return g;
}
function drawGat() { // 저승사자 갓: 넓은 챙 + 높은 모자 + 갓끈
  const g = canvas();
  g.ellipse(16, 8.5, 12, 2.2, "#101016");
  g.rect(12, 1, 8, 7, "#101016"); g.rect(12, 1, 8, 1, "#4a4a5c"); g.rect(12, 6, 8, 1, "#3a3a48");
  g.line(5, 7, 27, 7, "#55556a");
  for (let y = 10; y < 18; y += 2) { g.set(9, y, "#c9b77a"); g.set(23, y, "#c9b77a"); }   // 갓끈 구슬
  return g;
}
function drawMyeonryugwan() { // 염라대왕 면류관: 납작한 판 + 앞뒤로 늘어진 구슬 줄
  const g = canvas();
  g.rect(7, 2, 18, 3, "#1a1414"); g.rect(7, 2, 18, 1, "#3a2a2a");
  g.rect(11, 5, 10, 3, "#d9a63a");
  for (let x = 8; x <= 24; x += 3) for (let y = 5; y <= 11; y += 2) g.set(x, y, y % 4 === 1 ? "#ff4f4f" : "#f3cf6a");
  return g;
}
function drawTails() { // 구미호 아홉 꼬리 (왼쪽을 보는 여우의 엉덩이에서 위·뒤로 부채처럼)
  const g = canvas();
  for (let i = 0; i < 9; i++) {
    const a = Math.PI * (0.1 + i * 0.075), len = 11 + (i % 2) * 2;
    for (let t = 0; t <= len; t++) {
      const x = 23 + Math.cos(a) * t * 0.75 + Math.sin(t / 2.5 + i) * 0.7, y = 16 - Math.sin(a) * t;
      const c = t > len - 3 ? "#ffffff" : t > len - 7 ? "#ffe3c0" : "#f5b56a";
      g.set(x, y, c); g.set(x + 1, y, c); if (t > 3 && t < len - 1) g.set(x, y + 1, c);
    }
  }
  g.outline("#3a1c08");
  return g;
}

// ---- 할로윈 이벤트 (dc#130) ----
// 마녀 모자 (몬스터 머리 위): 15×11 칸 안에. 챙 + 휘어진 고깔 + 띠 (띠 색은 몬스터마다 돌아가며)
const HAT_W = 15, HAT_H = 11;
function drawWitchHat(band) {
  return () => {
    const g = canvas();
    g.poly([[4, 8], [6, 3], [9, 0], [13, 1], [10, 3], [11, 8]], "#2a1a3a");   // 고깔 (끝이 오른쪽으로 꺾임)
    g.line(7, 3, 8, 7, "#3e2a56");
    g.rect(5, 7, 6, 2, band); g.set(8, 7, "#ffe14a");                          // 띠 + 버클
    g.ellipse(7.5, 9.5, 7.5, 1.6, "#2a1a3a"); g.rect(1, 9, 13, 1, "#3e2a56");   // 챙
    g.outline("#08060c");
    return g;
  };
}
const HAT_BANDS = ["#ff8a1f", "#7ad13a", "#a050ff"];
// 호박 머리 스킨 (플레이어 머리 자리에 씌움): 주황 호박 + 골 + 꼭지 + 노랗게 빛나는 눈·입
function drawPumpkinHead() {
  const g = canvas();
  g.ellipse(16, 7.5, 7, 6, "#e8761e");
  for (const x of [12, 20]) g.line(x, 3, x, 12, "#c45a10");
  g.line(16, 2, 16, 13, "#d4671a");
  g.set(11, 5, "#ffad5a"); g.set(11, 6, "#ffad5a"); g.set(14, 3, "#ffad5a");   // 빛
  g.rect(15, 0, 2, 2, "#4f7a24"); g.set(17, 0, "#78b03c");                      // 꼭지
  g.poly([[11.5, 7], [14.5, 7], [13, 4.5]], "#ffe14a");                         // 눈
  g.poly([[17.5, 7], [20.5, 7], [19, 4.5]], "#ffe14a");
  g.rect(12, 9, 8, 2, "#ffe14a");                                               // 입 (이빨 두 개)
  g.set(14, 9, "#c45a10"); g.set(18, 10, "#c45a10");
  g.outline("#2a1204");
  return g;
}
// 마을 바닥에 놓는 잭오랜턴 (큰 호박, 안에서 촛불이 비침)
function drawJack() {
  const g = canvas();
  g.ellipse(16, 21, 12, 9, "#e8761e");
  for (const x of [9, 23]) g.line(x, 14, x, 28, "#c45a10");
  g.line(16, 12, 16, 30, "#d4671a");
  g.set(8, 18, "#ffad5a"); g.set(8, 19, "#ffad5a"); g.set(12, 14, "#ffad5a");
  g.rect(15, 9, 3, 4, "#4f7a24"); g.set(18, 9, "#78b03c"); g.set(19, 10, "#78b03c");
  g.poly([[8, 21], [13, 21], [10.5, 16]], "#ffe14a"); g.poly([[19, 21], [24, 21], [21.5, 16]], "#ffe14a");
  g.poly([[14.5, 23], [17.5, 23], [16, 20.5]], "#ffcf3a");                      // 코
  g.poly([[8, 24], [24, 24], [22, 28], [10, 28]], "#ffe14a");                   // 입
  for (const x of [12, 16, 20]) g.rect(x, 24, 2, 1, "#c45a10");
  g.rect(14, 27, 2, 1, "#c45a10");
  g.outline("#2a1204");
  return g;
}
// 할로윈 몬스터: 원래 그림의 머리 꼭대기(맨 위 줄들의 가운데)에 마녀 모자를 얹음. 모자·관을 이미 쓴 몬스터는 그대로
const NO_HAT = new Set(["goblin_king", "jeoseung", "yeomra"]);

// ---- 그림 목록 ----
// from: Crawl 그림 경로 (배열이면 아래부터 겹침), mod: [밝기, 채도, 색상] (ImageMagick -modulate), tint: [색, %] (-colorize)
// draw: 직접 그린 그림, over: 그 위에 얹을 직접 그린 장식, under: 아래에 깔 장식
const V = (prefix, n) => Array.from({ length: n }, (_, i) => fs.readdirSync(path.join(TILES, path.dirname(prefix))).filter(f => f.startsWith(path.basename(prefix)) && /^\D*\d+\.png$/.test(f.replace(path.basename(prefix), "x"))).sort()[i]).map(f => path.join(path.dirname(prefix), f));
const SPRITES = [];
const add = (name, spec) => SPRITES.push({ ...spec, name });
// 지형: 지역마다 바닥·벽 4가지
const ZONES = { normal: ["dngn/floor/rect_gray", "dngn/wall/brick_gray"], nm: ["dngn/floor/marble_floor", "dngn/wall/catacombs"], hell: ["dngn/floor/volcanic_floor", "dngn/wall/hell"], gold: ["dngn/floor/sandstone_floor", "dngn/wall/sandstone_wall"] };
for (const [z, [floor, wall]] of Object.entries(ZONES)) {
  V(floor, 4).forEach((f, i) => add(`floor_${z}_${i}`, { from: f, ...({ normal: { mod: [165, 100, 100] }, hell: { mod: [75, 100, 100] }, gold: { mod: [125, 110, 100] } }[z] || {}) }));
  V(wall, 4).forEach((f, i) => add(`wall_${z}_${i}`, { from: f, ...(z === "nm" ? { tint: ["#7a3cff", 35] } : {}) }));
}
add("stairs", { draw: drawStairs });
add("portal", { from: "dngn/gateways/portal" });
add("shop", { draw: drawShop });
// 플레이어: 파란 갑옷 + 금 방패 기사
add("player", { from: ["player/base/human_m", "player/legs/leg_armour03", "player/boots/middle_brown2", "player/body/armour_blue_gold", "player/head/fhelm_gray3", "player/hand1/long_sword_slant", "player/hand2/lshield_gold"] });
// 바닥 아이템
add("item_dagger", { from: "item/weapon/dagger" });
add("item_staff", { from: "item/weapon/quarterstaff" });
add("item_axe", { from: "item/weapon/hand_axe1" });
add("item_longsword", { from: "item/weapon/long_sword1" });
add("item_shield", { from: "item/armour/shields/shield1" });
add("item_head", { from: "item/armour/headgear/helmet1" });
add("item_chest", { from: "item/armour/scale_mail1" });
add("item_arms", { from: "item/armour/glove1" });
add("item_pants", { draw: drawPants });
add("item_boots", { from: "item/armour/boots1_brown" });
add("item_neck", { from: "item/amulet/cameo_orange" });
add("item_ring", { from: "item/ring/ruby" });
add("item_potion", { from: "item/potion/ruby" });
add("item_treasure", { draw: drawChest });
add("gold_s", { from: "item/gold/03" });
add("gold_l", { from: "item/gold/10" });
add("rune", { from: "item/misc/runes/generic" });
const GEMS = { ruby: ["#ffb3bd", "#ff5a6e", "#a8203a"], sapphire: ["#b8dcff", "#5aa9ff", "#1f4fa8"], emerald: ["#b6f2c9", "#4fd17a", "#1c7a40"], topaz: ["#fff0b0", "#ffcf5c", "#b07c18"], diamond: ["#ffffff", "#e8f4ff", "#9fb4cc"] };
for (const [k, c] of Object.entries(GEMS)) add(`gem_${k}`, { draw: () => drawGem(c) });
// 몬스터 (monsters.js의 id)
const MON = {
  rat: "mon/undead/zombies/zombie_rat", bat: "mon/animals/bat", kobold: "mon/kobold", goblin: "mon/goblin", skeleton: "mon/undead/skeletal_warrior",
  zombie: "mon/undead/bog_body", orc: "mon/orc_warrior", wolf: "mon/animals/wolf", spider: "mon/animals/spider", troll: "mon/iron_troll",
  harpy: "mon/harpy", wraith: "mon/undead/shadow_wraith", dark_knight: "mon/hell_knight", chimera: "mon/sphinx",
  lich: "mon/undead/lich", fire_spirit: "mon/nonliving/fire_elemental", vampire: "mon/undead/vampire", drake: "mon/dragons/swamp_dragon", hydra: "mon/dragons/hydra5",
  ghoul: "mon/undead/ghoul", basilisk: "mon/animals/basilisk", gargoyle: "mon/demons/hellwing", naga: "mon/naga", wyvern: "mon/dragons/wyvern",
  death_knight: "mon/death_knight", banshee: "mon/undead/ghost", golem: "mon/nonliving/earth_elemental", manticore: "mon/manticore", frost_giant: "mon/frost_giant",
  specter: "mon/undead/silent_spectre", demon: "mon/demons/red_devil", behemoth: "mon/animals/elephant_dire", kraken: "mon/aquatic/kraken_head", phoenix: "mon/animals/fire_bat",
  shadow_dragon: "mon/dragons/shadow_dragon", archdemon: "mon/demons/balrug", titan: "mon/titan", void_lord: "mon/demons/shadow_fiend", ancient_dragon: "mon/dragons/golden_dragon",
  ogre_chief: "mon/two_headed_ogre", lich_lord: "mon/undead/ancient_lich",
};
for (const [id, f] of Object.entries(MON)) add(`mon_${id}`, { from: f });
add("mon_minotaur", { from: ["player/base/minotaur_brown1_m", "player/legs/leg_armour03", "player/hand1/battleaxe"] });
add("mon_goblin_king", { from: "mon/hobgoblin", over: [drawCrown, 0, -1] });
add("mon_golden_goblin", { from: "mon/goblin", tint: ["#ffc61a", 55], mod: [125, 160, 100] });
// 헬 네임드 보스: Crawl 그림 색을 바꾸고 직접 그린 장식을 얹음
add("mon_bulgasari", { from: "mon/animals/elephant_demonic", mod: [105, 0, 100], tint: ["#6f8fb0", 30] });   // 쇠를 먹는 괴물: 쇳빛
add("mon_gumiho", { from: "mon/animals/jackal", mod: [175, 25, 100], under: [drawTails, 0, 0] });     // 흰 여우 + 아홉 꼬리
add("mon_imugi", { from: "mon/unique/jormungandr", mod: [80, 70, 150] });                             // 용이 되지 못한 큰 뱀: 검푸른
add("mon_jeoseung", { from: "mon/demons/reaper", mod: [100, 0, 100], over: [drawGat, 0, -3] });       // 검은 도포 + 갓
add("mon_yeomra", { from: "mon/unique/asmodeus", mod: [100, 120, 100], over: [drawMyeonryugwan, 0, -2] }); // 붉은 곤룡포 + 면류관

// 플레이어 옷 입히기: 맨몸(회색 속옷) 위에 낀 장비만 겹침. 밝은 회색 부위를 게임에서 등급 색으로 칠함
// 겹치는 순서: 몸 → 장화 → 바지 → 갑옷 → 장갑 → 오른손 → 왼손 → 투구
add("doll_base", { from: "player/base/human_m" });
add("doll_boots", { from: "player/boots/middle_gray" });
add("doll_pants", { from: "player/legs/leg_armour03" });
add("doll_chest", { from: "player/body/half_plate" });
add("doll_arms", { from: "player/gloves/glove_gray" });
add("doll_head", { from: "player/head/fhelm_gray3" });
add("doll_w_dagger", { from: "player/hand1/dagger" });
add("doll_w_staff", { from: "player/hand1/quarterstaff" });
add("doll_w_axe", { from: "player/hand1/war_axe" });
add("doll_w_longsword", { from: "player/hand1/long_sword_slant" });
add("doll_o_shield", { from: "player/hand2/shield_knight_gray" });
add("doll_o_dagger", { from: "player/hand2/misc/dagger" });
add("doll_o_staff", { from: "player/hand1/quarterstaff", flop: true });
add("doll_o_axe", { from: "player/hand1/hand_axe", flop: true });

// 점프 탑 (옆에서 보는 맵): 나무 발판, 사다리, 깃발(도착), 체크포인트 깃대 (꺼짐/켜짐)
function drawPlank() {   // 칸 위쪽 1/3만 (아래에서 뚫고 올라가는 얇은 발판)
  const g = canvas();
  g.rect(0, 0, 32, 9, "#8a5a2b"); g.rect(0, 0, 32, 2, "#c08548"); g.rect(0, 8, 32, 1, "#4a2c12");
  for (const x of [7, 18, 27]) g.rect(x, 2, 1, 6, "#6b4220");
  g.rect(3, 9, 3, 4, "#5a3818"); g.rect(26, 9, 3, 4, "#5a3818");   // 받침
  return g;
}
function drawTile() {   // 점프 던전 발판: 벽처럼 꽉 찬 정사각형 돌 타일 (윗면은 밝게 = 밟는 곳)
  const g = canvas();
  g.rect(0, 0, 32, 32, "#565d70");
  g.rect(0, 15, 32, 2, "#3a3f4e"); g.rect(15, 0, 2, 15, "#3a3f4e"); g.rect(7, 17, 2, 15, "#3a3f4e"); g.rect(23, 17, 2, 15, "#3a3f4e");   // 돌 이음매
  for (const [x, y] of [[3, 5], [21, 9], [11, 22], [27, 26], [4, 27]]) g.rect(x, y, 2, 1, "#6c7488");   // 돌 결
  g.rect(0, 0, 32, 3, "#a8b0c6"); g.rect(0, 3, 32, 1, "#7e869c");   // 윗면
  g.rect(0, 30, 32, 2, "#2a2e3a"); g.rect(30, 4, 2, 26, "#2a2e3a"); g.rect(0, 4, 1, 26, "#6c7488");   // 그림자·빛
  return g;
}
function drawLadder() {
  const g = canvas();
  for (const x of [7, 23]) { g.rect(x, 0, 3, 32, "#9a6a34"); g.rect(x, 0, 1, 32, "#c99050"); }
  for (const y of [3, 11, 19, 27]) { g.rect(10, y, 13, 3, "#8a5a2b"); g.rect(10, y, 13, 1, "#c08548"); }
  return g;
}
function drawFlag() {
  const g = canvas();
  g.rect(8, 2, 2, 29, "#d0d4e0"); g.rect(8, 2, 1, 29, "#ffffff"); g.rect(6, 30, 6, 2, "#7d8396");
  g.poly([[10, 3], [28, 7], [10, 13]], "#ffcf5c"); g.poly([[10, 3], [28, 7], [10, 6]], "#fff0b0");
  g.set(15, 7, "#b07c18"); g.set(16, 7, "#b07c18");
  g.outline();
  return g;
}
function drawBanner(on) {
  return () => {
    const g = canvas();
    g.rect(14, 6, 2, 25, "#7d8396"); g.rect(11, 30, 8, 2, "#4a4e5e");
    g.poly([[16, 7], [26, 10], [16, 14]], on ? "#4fd17a" : "#5b5f72");
    if (on) { g.set(14, 4, "#bff7cf"); g.set(15, 3, "#ffffff"); g.set(16, 4, "#bff7cf"); }
    g.outline();
    return g;
  };
}
add("tower_plank", { draw: drawPlank });
add("tower_tile", { draw: drawTile });
add("tower_ladder", { draw: drawLadder });
add("tower_flag", { draw: drawFlag });
add("tower_cp", { draw: drawBanner(false) });
add("tower_cp_on", { draw: drawBanner(true) });

// 할로윈 이벤트 (dc#130): 스킨 · 마을 장식 · 마녀 모자를 쓴 몬스터 (hw_몬스터 id)
add("skin_pumpkin_head", { draw: drawPumpkinHead });
add("skin_scythe", { from: "player/hand1/scythe_slant" });
add("deco_jack", { draw: drawJack });
SPRITES.filter(sp => sp.name.startsWith("mon_") && !NO_HAT.has(sp.name.slice(4))).forEach((sp, i) => add(`hw_${sp.name.slice(4)}`, { ...sp, hat: drawWitchHat(HAT_BANDS[i % HAT_BANDS.length]) }));

// ---- 만들기 ----
const files = [];
for (const [i, sp] of SPRITES.entries()) {
  const out = path.join(TMP, `${String(i).padStart(3, "0")}.png`);
  if (sp.draw) savePng(sp.draw(), out);
  else {
    const layers = (Array.isArray(sp.from) ? sp.from : [sp.from]).map(src);
    im(...layers, "-background", "none", "-layers", "flatten", out);
    if (sp.flop) im(out, "-flop", out);   // 좌우 뒤집기 (오른손 무기 → 왼손)
    if (sp.mod) im(out, "-modulate", sp.mod.join(","), out);
    if (sp.tint) im(out, "-fill", sp.tint[0], "-colorize", `${sp.tint[1]}%`, out);
    // 장식은 색을 바꾸지 않고 마지막에 얹거나 깔기
    if (sp.under) im(savePng(sp.under[0](), path.join(TMP, `u${i}.png`)), out, "-background", "none", "-layers", "flatten", out);
    if (sp.over) im(out, savePng(sp.over[0](), path.join(TMP, `o${i}.png`)), "-geometry", `+${sp.over[1]}+${sp.over[2]}`.replace("+-", "-"), "-composite", out);
  }
  im(out, "-background", "none", "-gravity", "center", "-extent", `${S}x${S}`, out);
  if (sp.hat) {   // 머리 꼭대기 찾기: 불투명한 칸이 2개 이상인 맨 위 줄, 그 아래 3줄의 가운데 → 모자 챙이 머리에 3칸 걸치게
    const a = execFileSync("convert", [out, "-alpha", "extract", "-depth", "8", "gray:-"]);
    const row = (y) => [...Array(S).keys()].filter(x => a[y * S + x] > 128);
    let y0 = 0; while (y0 < S - 1 && row(y0).length < 2) y0++;
    const xs = [0, 1, 2].flatMap(k => row(Math.min(S - 1, y0 + k)));
    const cx = Math.round(xs.reduce((s, x) => s + x, 0) / xs.length);
    const hx = Math.max(0, Math.min(S - HAT_W, cx - 7)), hy = Math.max(0, y0 + 3 - HAT_H);
    im(out, savePng(sp.hat(), path.join(TMP, `h${i}.png`)), "-geometry", `+${hx}+${hy}`, "-composite", out);
  }
  files.push(out);
}
const rows = Math.ceil(files.length / COLS);
execFileSync("montage", [...files, "-background", "none", "-tile", `${COLS}x${rows}`, "-geometry", `${S}x${S}+0+0`, path.join(ROOT, "img/sprites.png")]);
const map = Object.fromEntries(SPRITES.map((sp, i) => [sp.name, [i % COLS, Math.floor(i / COLS)]]));
fs.writeFileSync(path.join(ROOT, "sprites.js"), `// 자동 생성: node tools/sprites-build.mjs (고치지 말 것)
// 픽셀 그림 모음 img/sprites.png의 칸 위치. 그림: Dungeon Crawl Stone Soup 그림 모음(CC0, github.com/crawl/tiles) + 직접 그린 그림
(function (root) {
  const SPRITES = { size: ${S}, cols: ${COLS}, rows: ${rows}, src: "img/sprites.png", map: ${JSON.stringify(map)} };
  if (typeof module !== "undefined" && module.exports) module.exports = SPRITES;
  else root.RLSprites = SPRITES;
})(typeof window !== "undefined" ? window : globalThis);
`);
fs.rmSync(TMP, { recursive: true, force: true });
console.log(`그림 ${SPRITES.length}개 → img/sprites.png (${COLS}×${rows}칸), sprites.js`);
