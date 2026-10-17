#!/usr/bin/env node
// monsters.js와 items.js의 값으로 문서를 만든다. 수치를 바꾼 뒤 다시 실행하면 문서가 맞춰진다.
//   docs/monsters.md — 몬스터, 정예, 황금 고블린, 보스, 장비 드롭
//   docs/economy.md  — 골드, 상점, 판매와 강화
//   docs/items.md    — 장비 능력치 범위, 주/추가 능력치, 고대 아이템, 강화, 세트
//
//   node tools/gen-docs.mjs          # 문서 갱신
//   node tools/gen-docs.mjs --check  # 문서가 최신인지 확인만 (다르면 종료 코드 1)
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const M = require("../monsters.js");
const I = require("../items.js");

const pct = (p) => `${Math.round(p * 1000) / 10}%`;
const table = (head, rows) => [
  `| ${head.join(" | ")} |`,
  `|${head.map(() => "---").join("|")}|`,
  ...rows.map(r => `| ${r.join(" | ")} |`),
].join("\n");
const floors = (m) => (m.until ? `${m.from}~${m.until}` : `${m.from}~`);
const tableRates = (t) => Object.entries(t).map(([k, w]) => {
  const total = Object.values(t).reduce((s, x) => s + x, 0);
  return `${I.RARITIES[k].name} ${pct(w / total)}`;
}).join(", ");
const HEADER = "> 이 문서는 `node tools/gen-docs.mjs`로 만들어요. 직접 고치지 말고 `monsters.js`, `items.js`를 고친 뒤 다시 실행하세요.";

const E = M.ELITE, G = M.GOLDEN, GOLD = M.GOLD;
const FLOORS = [1, 2, 3, 4, 5, 6, 8, 10, 12, 14, 15, 17, 20, 25, 30, 40, 50, 60, 80, 100, 120, 150];
const BOSS_FLOORS = [5, 10, 15, 20, 25, 30, 50, 100, 150];

// ---------------------------------------------------------------- monsters.md
const monstersMd = `# 몬스터 도감

${HEADER}

## 일반 몬스터 (${M.MONSTERS.length}종)

${table(["표시", "이름", "HP", "공격", "방어", "경험치", "나오는 층"],
  M.MONSTERS.map(m => [`\`${m.ch}\``, m.name, m.hp, m.atk, m.def, m.xp, floors(m)]))}

위 표는 **1~${M.FLOOR.from - 1}층 기준** 수치예요. 더 깊은 층에서는 [층 보정](#층-보정)만큼 강해져요.

- 플레이어가 주는 피해: 공격력 + (0~1) − 몬스터 방어력 (최소 1, 치명타면 공격력 부분이 2배 + 장비의 치명타 피해)
- 몬스터가 주는 피해: 방어력이 **비율로** 줄여요. 피해 = 공격 × ${M.DEFENSE_K}공격 ÷ (${M.DEFENSE_K}공격 + 방어력), 최소 1
  - 방어력이 공격력과 같으면 피해 ${pct(M.damageToPlayer(100, 100) / 100)}, 2배면 ${pct(M.damageToPlayer(100, 200) / 100)}, 4배면 ${pct(M.damageToPlayer(100, 400) / 100)}
- 포션: 최대 HP의 30% 회복 (최소 8)
- 한 층의 마릿수: (4 + 층) ~ (6 + 층×2)
- 계단: 주변 ${M.STAIRS_BLOCK_RADIUS}칸(가로 칸 + 세로 칸) 안에 몬스터가 있으면 내려갈 수 없어요. 정리한 뒤 다시 밟으면 내려가요
- 처치 골드는 [경제 문서](economy.md#골드)를 보세요

## 층 보정

같은 몬스터도 깊은 층일수록 강해져요. ${M.FLOOR.from}층부터 한 층마다 HP +${pct(M.FLOOR.hp)}, 공격력 +${pct(M.FLOOR.atk)}, 방어력 +${M.FLOOR.def}씩 (방어력은 내림).
정예와 보스도 같은 보정을 받아요 (정예 배율은 보정한 값에 곱해요).

${table(["층", "HP 배율", "공격력 배율", "방어력 +", "예: 그 층에서 가장 강한 몬스터"],
  FLOORS.map(d => {
    const f = M.floorScale(d);
    const top = M.spawnRates(d).at(-1).monster;
    const m = M.makeMonster(top, "normal", d);
    return [d, `×${Math.round(f.hp * 100) / 100}`, `×${Math.round(f.atk * 100) / 100}`, f.def, `${m.name} HP ${m.hp} · 공격 ${m.atk} · 방어 ${m.def}`];
  }))}

## 층별 출현 비율

그 층에 나올 수 있는 종류 중 강한(표에서 아래쪽) 종류일수록 2배씩 자주 나와요.

${table(["층", "종류 수", "출현 비율 (높은 순)"],
  FLOORS.map(d => {
    const r = M.spawnRates(d).slice().reverse();
    return [d, r.length, r.map(x => `${x.monster.name} ${pct(x.p)}`).join(", ")];
  }))}

## 정예

- ${E.from}층부터 ${pct(E.base)}, 층마다 ${pct(E.perFloor)}p씩 올라 최대 ${pct(E.max)}
- 이름 앞에 "정예", 금색 테두리
- HP ${E.hpMul}배, 공격력 ${E.atkMul}배(올림), 방어력 +${E.defAdd}, 경험치 ${E.xpMul}배
- 장비 드롭 ${pct(I.DROPS.elite.chance)} (일반 몬스터 등급표)

## 황금 고블린

- ${G.from}층부터 층마다 ${pct(G.chance)} 확률로 1마리. 시작 지점에서 떨어진 곳에 있고, 금빛 칸으로 보여요
- 플레이어를 공격하지 않아요. 들키면 플레이어에게서 멀어지는 쪽으로 움직이고, 처음 보인 뒤 정해진 턴 안에 잡지 못하면 도망쳐서 사라져요 (10턴 남으면 경고)
- HP는 6 + 층, 또는 그 층에서 가장 튼튼한 몬스터 HP(층 보정 포함)의 ${pct(G.hpOfPool)} 중 큰 쪽. 방어력은 그 층 몬스터 중 가장 높은 방어력 +${G.defAdd}
- 깊은 층에서는 **정예**(금색 테두리)와 **왕**(빨간 테두리)이 섞여 나와요. 더 단단하고 빨리 도망치고, 맞고 살아남으면 확률로 연막을 터뜨려 ${G.blinkRange[0]}~${G.blinkRange[1]}칸 떨어진 곳으로 순간이동해요
- 잡으면 **레어 이상 장비를 반드시** 떨어뜨려요: ${tableRates(I.TABLES.golden)}

${table(["등급", "나오는 층", "확률 (황금 고블린 중)", "HP", "방어", "도망까지", "이동", "순간이동", "장비", "골드·경험치"],
  Object.entries(G.ranks).map(([rank, r]) => [r.name, `${r.from}층부터`, rank === "normal" ? "나머지" : pct(r.chance),
    `×${r.hpMul}`, r.defAdd ? `+${r.defAdd}` : "-", `${r.fleeTurns}턴`, `${r.moves[1]}턴에 ${r.moves[0]}번`, r.blink ? pct(r.blink) : "-", `${r.drops}개`, `×${r.goldMul}`]))}

${table(["층", "보통 HP", "정예 HP", "왕 HP", "방어 (보통)", "경험치 (보통)"],
  FLOORS.filter(d => d >= G.from).map(d => { const g = M.makeGolden(d); return [d, g.hp, d >= G.ranks.elite.from ? M.makeGolden(d, "elite").hp : "-", d >= G.ranks.king.from ? M.makeGolden(d, "king").hp : "-", g.def, g.xp]; }))}

## 보스

- ${M.BOSS_EVERY}층마다 계단 방에서 계단을 지켜요. 쓰러뜨려야 계단이 열려요. 빨간 테두리
- 장비를 반드시 떨어뜨려요: ${tableRates(I.TABLES.boss)}
- 준비된 보스를 다 지나면 마지막 보스가 ${M.BOSS_EVERY}층마다 ${pct(M.BOSS_SCALE)}씩 강해져요

${table(["층", "표시", "이름", "HP", "공격", "방어", "경험치"],
  BOSS_FLOORS.map(d => { const b = M.makeBoss(d); return [d, `\`${b.ch}\``, b.name, b.hp, b.atk, b.def, b.xp]; }))}

## 최대 층 ${M.MAX_FLOOR}층: 일반 던전 완료

- 일반 던전은 **${M.MAX_FLOOR}층까지**예요. ${M.MAX_FLOOR}층 보스를 쓰러뜨리고 계단을 밟으면 **일반 던전 완료**
- 완료하면 안내 창과 함께 **로비로 돌아와요**. 로비 던전 입구의 **오른쪽 문(포탈)**으로 들어가면 ${M.MAX_FLOOR}층의 **새 구역**(새 지도·몬스터·보스)에서 계속 파밍할 수 있어요. 다시 클리어하면 또 로비로 돌아와요. 아이템 레벨은 얻은 층이라 ${M.MAX_FLOOR}보다 높은 아이템은 없어요
- 랭킹 최고 층에는 "${M.MAX_FLOOR}층 완료 ✓"로 보여요 (서버 기록값 ${M.CLEAR_STAGE}). 같은 기록이면 먼저 세운 사람이 위
- 랭킹은 버전(시즌)마다 따로예요. 지금은 **v4 베타**에 기록되고, 최대 층이 생기기 전까지의 기록은 **v3 베타** 탭에 최종 기록으로 그대로 남아요. v4 베타의 아이템 랭킹은 v4 아이템만 세요
- 왜 ${M.MAX_FLOOR}층인가: 보스는 (보스 배율 × 층 보정)이라 층 수의 제곱으로 강해지고 장비는 층에 비례해서 커져요. 아이템 규칙 v4 기준으로 시뮬레이션해 보면 그 층 최고급 장비(레전더리급 +10)로 이길 수 있는 깊이가 약 240층, 보통 파밍 장비는 약 120층이에요. ${M.MAX_FLOOR}층은 잘 파밍한 장비로 깰 수 있는 목표예요

## 장비 드롭 요약

${table(["어디서", "확률", "등급 확률"], [
  ["일반 몬스터, 포션 자리", pct(I.DROPS.normal.chance), tableRates(I.TABLES.drop)],
  ["정예", pct(I.DROPS.elite.chance), tableRates(I.TABLES.drop)],
  ["보스", pct(I.DROPS.boss.chance), tableRates(I.TABLES.boss)],
  ["황금 고블린", `${pct(I.DROPS.golden.chance)} × ${Object.values(G.ranks).map(r => r.drops).join("·")}개 (보통·정예·왕)`, tableRates(I.TABLES.golden)],
  [`상점 (보스 전 층, 골드)`, `진열 ${I.SHOP.slots}개`, tableRates(I.TABLES[I.SHOP.table])],
  ["장비 상자 (캐시)", "-", tableRates(I.TABLES.box)],
])}
`;

// ---------------------------------------------------------------- economy.md
const range = ([lo, hi], d) => {
  const a = Math.round(lo * M.goldMultiplier(d)), b = Math.round(hi * M.goldMultiplier(d));
  return a === b ? `${a}` : `${a}~${b}`;
};
const avg = ([lo, hi]) => (lo + hi) / 2;

// 그 층의 몬스터를 모두 잡고 골드 더미를 모두 주웠을 때의 평균 (장비 보너스 제외)
function expectedGold(d) {
  const mul = M.goldMultiplier(d);
  const piles = avg(GOLD.piles.count) * avg(GOLD.piles.amount) * mul;
  const monsters = ((4 + d) + (6 + d * 2)) / 2;
  const elite = M.eliteChance(d);
  const kills = monsters * ((1 - elite) * avg(GOLD.kill.normal) + elite * avg(GOLD.kill.elite)) * mul;
  const boss = M.isBossFloor(d) ? avg(GOLD.kill.boss) * mul : 0;
  const golden = d >= G.from ? G.chance * avg(GOLD.kill.golden) * mul : 0;
  return { piles, kills, boss, golden, total: piles + kills + boss + golden };
}
let running = 0;
const cumulative = Array.from({ length: 25 }, (_, i) => { running += expectedGold(i + 1).total; return running; });
const SHOP_FLOORS = Array.from({ length: 30 }, (_, i) => i + 1).filter(I.isShopFloor).slice(0, 5);  // 4, 9, 14, 19, 24

const economyMd = `# 경제: 골드, 상점, 판매와 강화

${HEADER}

## 골드

골드는 **판(run)마다 처음부터** 모아요. 죽으면 0이 되고, 상점에서 장비를 살 때 써요.

### 얻는 곳

- **골드 더미 \`$\`**: 층마다 ${GOLD.piles.count.join("~")}개, 하나에 ${GOLD.piles.amount.join("~")} × 층 배율
- **몬스터 처치**: 쓰러뜨리는 즉시 들어와요

${table(["처치한 몬스터", "골드 (1층 기준)", "일반 대비"],
  [["일반", "normal"], ["정예", "elite"], ["보스", "boss"], ["황금 고블린", "golden"]].map(([name, k]) =>
    [name, GOLD.kill[k].join("~"), `${Math.round(avg(GOLD.kill[k]) / avg(GOLD.kill.normal) * 10) / 10}배`]))}

- **층 배율** = 1 + ${GOLD.perFloor} × (층 − 1). 층이 하나 깊어질 때마다 ${pct(GOLD.perFloor)}씩 늘어요
- 장비의 **골드 획득 +%**는 그 위에 더해져요 (더미와 처치 골드 모두)

### 층별 골드

${table(["층", "층 배율", "더미 1개", "일반 처치", "정예 처치", "보스 처치", "황금 고블린"],
  FLOORS.map(d => [d, `×${M.goldMultiplier(d)}`, range(GOLD.piles.amount, d), range(GOLD.kill.normal, d), range(GOLD.kill.elite, d),
    M.isBossFloor(d) ? range(GOLD.kill.boss, d) : "-", d >= G.from ? range(GOLD.kill.golden, d) : "-"]))}

### 층마다 평균 얼마나 모일까

그 층의 몬스터를 모두 잡고 더미를 모두 주웠을 때의 **평균**이에요 (장비 보너스 제외, 황금 고블린은 등장 확률 반영).

${table(["층", "더미", "처치", "보스", "황금 고블린", "합계", "1층부터 누적"],
  [1, 2, 3, 4, 5, 6, 8, 10, 15, 20, 25].map(d => {
    const e = expectedGold(d);
    return [d, Math.round(e.piles), Math.round(e.kills), Math.round(e.boss) || "-", Math.round(e.golden) || "-", Math.round(e.total), Math.round(cumulative[d - 1])];
  }))}

## 상점

- 보스 층(${I.SHOP.every}층마다) 바로 전 층(${SHOP_FLOORS.slice(0, 3).join(", ")}…층) 계단 옆 \`&\` 칸. 밟으면 열려요
- 황금 고블린과 같은 등급표로 ${I.SHOP.slots}개를 진열해요: ${tableRates(I.TABLES[I.SHOP.table])}
- 진열품은 (판 ID, 층)으로 정해져서 다시 열어도 같아요. 산 칸은 "판매 완료"로 남아요
- 가격: 등급 기본값 × (1 + 아이템 레벨당 10%), 5골드 단위. 상점 아이템 레벨 = 그 층

${table(["등급", "기본 가격", ...SHOP_FLOORS.map(d => `${d}층`)],
  Object.keys(I.SHOP.prices).map(r => [I.RARITIES[r].name, I.SHOP.prices[r], ...SHOP_FLOORS.map(l => I.shopPrice({ rarity: r, lvl: l }))]))}

### 진열 바꾸기

- 상점마다 최대 ${I.SHOP.rerolls.max}번. 바꾸면 ${I.SHOP.slots}개가 모두 새로 진열되고, 산 칸 표시도 초기화돼요
- 비용은 바꿀 때마다 2배, 층이 깊을수록 비싸져요: 기본 ${I.SHOP.rerolls.costs.join(" → ")} × (1 + ${I.SHOP.rerolls.perFloor} × (층 − 1)), 5골드 단위
- 바뀐 진열도 (판 ID, 층, 바꾼 횟수)로 정해져서 새로고침해도 같아요

${table(["층", ...I.SHOP.rerolls.costs.map((_, n) => `${n + 1}번째`), "3번 모두"],
  SHOP_FLOORS.map(d => { const c = I.SHOP.rerolls.costs.map((_, n) => I.rerollCost(d, n)); return [d, ...c, c.reduce((x, y) => x + y, 0)]; }))}

1층부터 상점 층까지 모은 평균 골드: ${SHOP_FLOORS.map(d => `${d}층 약 ${Math.round(cumulative[d - 1])}`).join(", ")} (상점에서 쓴 골드는 빼지 않은 값)

## 판매와 강화

- 판매하면 등급에 따라 강화석을 받아요. 아이템 레벨이 높을수록 더 받아요: 기본값 × (1 + 레벨당 ${pct(I.SELL_PER_LEVEL)})

${table(["등급", "기본", ...[10, 30, 60, 120].map(l => `Lv${l}`)], Object.keys(I.SELL_STONES).map(r => [I.RARITIES[r].name, I.SELL_STONES[r], ...[10, 30, 60, 120].map(lvl => I.sellStones({ rarity: r, lvl }))]))}

- 가방 전부 판매에 레전더리·세트가 섞여 있으면 같이 팔지 물어봐요. 안 팔면 가방에 남아요
- +N으로 강화할 때 강화석 N개가 들어요. 실패해도 아이템과 강화 단계는 그대로이고 강화석만 사라져요
- 강화 1단계마다 수치 주 능력치가 +10% 올라요 (최소 +1). 치명타 같은 % 주 능력치는 2단계마다 +1%p
- +${I.ENHANCE.lineSteps.join(", +")}이 되면 추가 능력치 중 하나가 올라요. 자세한 건 [장비 문서](items.md#강화)
- 결과는 (아이템 ID, 몇 번째 시도)로 정해져서 새로고침해도 바뀌지 않아요

${table(["강화", ...Array.from({ length: I.ENHANCE.max }, (_, i) => `+${i + 1}`)], [
  ["성공 확률", ...Array.from({ length: I.ENHANCE.max }, (_, i) => pct(I.enhanceChance(i + 1)))],
  ["강화석", ...Array.from({ length: I.ENHANCE.max }, (_, i) => I.enhanceCost(i + 1))],
])}
`;

// ---------------------------------------------------------------- items.md
const LEVELS = [1, 3, 5, 10, 15, 20, 30];
const fmtR = (stat, r) => I.formatRange(stat, r);
const sample = (slot, rarity, lvl, type = slot === "weapon" ? "dagger" : null) => ({ slot, rarity, lvl, type, main: [] });
const itemsMd = `# 장비: 능력치, 고대 아이템, 강화, 세트

${HEADER}

## 능력치가 붙는 방식 (규칙 v${I.RULES_VERSION})

- 모든 능력치는 **[최소~최대] 범위**에서 정해져요
  - 공격력·방어력·최대 HP 같은 **수치 능력치**는 아이템 레벨(얻은 층)이 높을수록 범위가 커져요
  - 치명타·치명타 피해·공격력%·흡혈·골드·경험치 같은 **% 능력치**는 레벨과 상관없이 **등급마다 정해진 범위**예요. 깊은 층에서도 % 능력치가 끝없이 커지지 않아요
- **최대치가 나올 확률은 능력치마다 ${pct(I.MAX_ROLL_CHANCE)}**, 나머지 ${pct(1 - I.MAX_ROLL_CHANCE)}는 최소 ~ (최대 − 1)에서 고르게 나와요
- 인벤토리에서 값 옆에 범위가 보이고, 최대치면 ▲ 표시가 붙어요
- 결과는 아이템 시드로 정해져서 서버에서 똑같이 다시 계산할 수 있어요

## 주 능력치 ★

강화하면 함께 오르는 중요한 능력치예요. **부위마다 붙을 수 있는 능력치가 달라요.** 첫 번째는 항상 붙고, 나머지는 그 부위 후보에서 무작위예요. 원하는 능력치가 있으면 그 부위를 모아야 해요.

${table(["부위", "항상", "후보"], [["무기", "weapon"], ["보조무기", "offhandWeapon"], ["가슴(갑옷)", "chest"], ["팔", "arms"], ["머리(투구)", "head"], ["바지", "pants"], ["장화", "boots"], ["방패", "shield"]]
  .map(([name, k]) => [name, I.STATS[I.MAIN_V4.pool[k][0]].name, I.MAIN_V4.pool[k].slice(1).map(s => I.STATS[s].name + (I.STATS[s].pct ? "%" : "")).join(", ")]))}

- **치명타 확률**은 가슴·팔에만 붙어요. **치명타 피해**는 무기·보조무기에만 붙어요
- 방패는 여기에 더해 패링 확률이 붙어요 (아래 [보조 손](#보조-손-보조무기와-방패))

${table(["등급", "주 능력치 개수", "추가 능력치 줄 수", "수치 능력치 범위 배율"],
  Object.entries(I.RARITIES).map(([r, x]) => [x.name, I.MAIN_V4.count[r][0] === I.MAIN_V4.count[r][1] ? I.MAIN_V4.count[r][0] + "개" : I.MAIN_V4.count[r].join("~") + "개", x.lines + "줄", `×${I.MAIN.rarityMul[r]}`]))}

- 후보가 적은 부위(방패)는 후보 수만큼만 붙어요

### 주 능력치: % 능력치 (등급별 고정)

${table(["능력치", ...Object.keys(I.RARITIES).map(r => I.RARITIES[r].name)],
  Object.keys(I.PCT_MAIN).map(k => [I.STATS[k].name + "%", ...Object.keys(I.RARITIES).map(r => fmtR(k, I.PCT_MAIN[k][r]))]))}

### 주 능력치: 수치 능력치 (커먼 기준, 등급 배율을 곱함)

${table(["아이템 레벨", "공격력 (무기)", "방어력", "최대 HP (방어구)"],
  LEVELS.map(l => [l, fmtR("atk", I.mainRange("atk", sample("weapon", "common", l))), fmtR("def", I.mainRange("def", sample("chest", "common", l))), fmtR("hp", I.mainRange("hp", sample("chest", "common", l)))]))}

- 도끼의 공격력은 ×${I.WEAPONS.axe.atkMul}

### 예: 레벨 10 장비의 수치 주 능력치 범위

${table(["등급", "무기 공격력", "도끼 공격력", "방어구 방어력", "방어구 최대 HP"],
  Object.keys(I.RARITIES).map(r => [I.RARITIES[r].name,
    fmtR("atk", I.mainRange("atk", sample("weapon", r, 10))), fmtR("atk", I.mainRange("atk", sample("weapon", r, 10, "axe"))),
    fmtR("def", I.mainRange("def", sample("chest", r, 10))), fmtR("hp", I.mainRange("hp", sample("chest", r, 10)))]))}

## 추가 능력치 ◆

등급별 줄 수만큼, 서로 다른 종류로 붙어요. 모든 부위에 ${I.STAT_KEYS_V4.length}가지가 붙을 수 있어요: ${I.STAT_KEYS_V4.map(k => I.STATS[k].name + (I.STATS[k].pct ? "%" : "")).join(", ")}.

### 추가 능력치: % 능력치 (등급별 고정)

${table(["능력치", ...Object.keys(I.RARITIES).map(r => I.RARITIES[r].name)],
  Object.keys(I.PCT_LINE).map(k => [I.STATS[k].name + "%", ...Object.keys(I.RARITIES).map(r => fmtR(k, I.PCT_LINE[k][r]))]))}

### 추가 능력치: 수치 능력치 (등급과 상관없이 아이템 레벨로)

${table(["아이템 레벨", ...["atk", "def", "hp"].map(k => I.STATS[k].name)],
  LEVELS.map(l => [l, ...["atk", "def", "hp"].map(k => fmtR(k, I.lineRange(k, l)))]))}

### 치명타는 얼마나 모을 수 있나

- 주 능력치로는 가슴·팔 2부위만: 레전더리 최대 ${I.PCT_MAIN.crit.legendary[1]}% × 2 = ${I.PCT_MAIN.crit.legendary[1] * 2}%
- 추가 능력치까지 7부위 모두 레전더리 최대치면 ${I.PCT_MAIN.crit.legendary[1] * 2 + 7 * I.PCT_LINE.crit.legendary[1]}% (강화 전). 치명타 확률 상한은 75%예요

## 예전 아이템 (v2·v3)

- 예전 규칙으로 얻은 아이템은 **그대로** 남아요. 능력치·이름·고대 여부·거래 모두 예전 그대로예요
- 다만 예전 규칙에서는 % 능력치가 레벨에 비례해서, 깊은 층 아이템 하나로 치명타 40%가 넘기도 했어요. 그래서 **효과를 계산할 때만** % 능력치(치명타·흡혈·골드·경험치)를 **같은 등급 v${I.RULES_VERSION} 최대치**까지만 적용해요
  - 강화로 오를 수 있는 만큼은 더해줘요 (주 능력치는 2단계마다 +1, 추가 능력치는 +${I.ENHANCE.lineSteps.join("·+")}마다 등급 최대치의 ${pct(I.PCT_LINE_BOOST)})
  - 예: 예전 레전더리 갑옷의 치명타 42% → 적용 ${I.PCT_MAIN.crit.legendary[1]}% (+10 강화면 ${I.PCT_MAIN.crit.legendary[1] + 5}%)
- 인벤토리와 랭킹에서 원래 값 옆에 **(적용 N%)**로 실제로 쓰이는 값이 보여요
- 공격력·방어력·최대 HP는 줄이지 않아요

## 보조 손: 보조무기와 방패

- ${I.SLOTS.length}번째 부위 **보조 손**이 있어요. 보조 손 아이템은 ${pct(I.OFFHAND.shieldChance)}가 **방패**, 나머지는 **보조무기**(보조 단검·지팡이·도끼)예요
- **보조무기**를 끼면 두 손 무기: **한 턴에 2번** 공격해요. 두 번째(왼손) 공격은 공격력의 ${pct(I.DUAL_WIELD.secondHit)}. 첫 공격에 적이 쓰러지면 두 번째는 쓰지 않아요
- **방패**를 끼면 확률로 몬스터의 공격을 **패링**(막아서 피해 0)해요. 패링 확률은 방패 등급마다 정해진 3가지 값 중 하나로 붙고, **강화로 오르지 않아요**

${table(["등급", "패링 확률"], Object.entries(I.PARRY.ranges).map(([r, [lo, hi]]) => [I.RARITIES[r].name, Array.from({ length: hi - lo + 1 }, (_, i) => `${lo + i}%`).join(", ")]))}

- 패링 확률은 방패와 세트 효과를 합쳐 **최대 ${I.PARRY.max}%**예요 (방패 최대 25% + 견고의 세트 15%)
- 방패의 주 능력치는 방어구처럼 방어력이 첫 번째, 보조무기는 무기처럼 공격력이 첫 번째예요

## 고대 아이템

- **최고 등급(레전더리·세트)** 이면서 **모든 능력치(주 + 추가, 방패는 패링도)가 최대치**로 붙은 아이템이에요. 이름 앞에 **"고대"**가 붙고, 인벤토리에서 금빛으로 빛나요
- 그 아래 등급은 능력치가 모두 최대치여도 고대가 아니에요 (예전에 고대로 표시되던 낮은 등급 아이템도 이제 보통 아이템으로 보여요)
- 능력치 하나가 최대치일 확률이 ${pct(I.MAX_ROLL_CHANCE)}라 아주 드물어요: ${["legendary", "set"].map(r => { const [a, b] = I.MAIN_V4.count[r]; const lines = I.RARITIES[r].lines; const odds = (n) => `약 ${Math.round(1 / I.MAX_ROLL_CHANCE ** n).toLocaleString("en-US")}분의 1`; return `${I.RARITIES[r].name}는 능력치 ${a + lines}~${b + lines}개라 ${odds(a + lines)}~${odds(b + lines)}`; }).join(", ")}
  (범위의 최소와 최대가 같은 능력치는 항상 최대치라 실제로는 조금 더 자주 나와요)

## 강화

- 강화 1단계마다 **수치 주 능력치 +${pct(I.ENHANCE.statPerLevel)}** (최소 +1). **% 주 능력치는 2단계마다 +1%p** (+10이면 +5%p)
- **+${I.ENHANCE.lineSteps.join(", +")}**이 되면 추가 능력치 중 하나가 올라요
  - 수치 능력치: 그 레벨 범위 **최대치의 ${pct(I.ENHANCE.lineBoost)}**(최소 +1)
  - % 능력치: 그 등급 범위 **최대치의 ${pct(I.PCT_LINE_BOOST)}**(최소 +1). 예: 레전더리 치명타 피해(최대 ${I.PCT_LINE.critDmg.legendary[1]}%)는 +${I.lineBoost({ v: I.RULES_VERSION, rarity: "legendary", lvl: 1 }, "critDmg")}%p
  - 어느 줄이 오를지는 (아이템 ID, 강화 단계)로 정해져요. 같은 줄이 여러 번 오를 수도 있어요
- 성공 확률과 강화석은 [경제 문서](economy.md#판매와-강화)를 보세요

## 세트

구하기 아주 어려운 만큼(장비 상자 ${pct(I.TABLES.box.set / 100)}, 몬스터 드롭 ${pct(I.TABLES.drop.set / 100)}) 효과가 강해요. 세트 아이템이 나오면 그 부위에 있는 세트 중 하나로 정해져요 (방어구 부위는 시험의 세트, 무기는 셋 중 하나, 보조 손은 광란·견고 중 하나).

- **시험의 세트**: ${Object.values(I.SETS.trial.bonuses).map(b => b.count).join("·")}개 입을 때마다 효과가 하나씩 켜져요. 6부위지만 아무거나 5개면 효과가 전부 켜져서, 무기는 자유롭게 골라도 돼요
- **광란의 세트**: 오른손·왼손 무기 2개. 보조 손도 무기라 한 턴에 2번 공격하고, 두 공격 모두 주변 1칸에 같은 피해
- **견고의 세트**: 무기·방패 2개. 패링 확률 +15% (방패 패링과 합쳐 최대 ${I.PARRY.max}%)

${Object.values(I.SETS).map(set => `### ${set.name}

${table(["부위", "이름"], Object.entries(set.pieces).map(([slot, name]) => [I.SLOT_NAMES[slot], name]))}

${table(["입은 개수", "효과"], set.bonuses.map(b => [`${b.count}개`, b.text]))}`).join("\n\n")}

- % 효과는 레벨과 장비로 얻은 능력치 전체에 곱해져요
`;

// ---------------------------------------------------------------- 쓰기 / 확인
const DOCS = { "monsters.md": monstersMd, "economy.md": economyMd, "items.md": itemsMd };
const path = (name) => fileURLToPath(new URL(`../docs/${name}`, import.meta.url));

if (process.argv.includes("--check")) {
  const stale = Object.entries(DOCS).filter(([name, md]) => (existsSync(path(name)) ? readFileSync(path(name), "utf8") : "") !== md);
  if (stale.length) { console.error(`최신이 아닌 문서: ${stale.map(([n]) => "docs/" + n).join(", ")} — node tools/gen-docs.mjs 를 실행하세요.`); process.exit(1); }
  console.log("문서 최신");
} else {
  mkdirSync(new URL("../docs/", import.meta.url), { recursive: true });
  for (const [name, md] of Object.entries(DOCS)) writeFileSync(path(name), md);
  console.log(`생성: ${Object.keys(DOCS).map(n => "docs/" + n).join(", ")}`);
}
