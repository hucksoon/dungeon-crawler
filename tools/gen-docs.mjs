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
const N = M.NIGHTMARE;
const EL = M.ELEMENTS;

const RAR = Object.keys(I.RARITIES).filter(r => r !== "unique");   // 보통 등급 (유니크는 따로 정리)
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
- 포션: 최대 HP의 30% 회복 (최소 8). **개수 제한 없이 10턴마다 한 번** 마실 수 있어요 (마시는 데 한 턴). 화면 아래 포션 버튼에 남은 턴이 보여요
- 보물(!): 층마다 1~3곳. 주우면 **레어 이상 장비 1개** (황금 고블린과 같은 등급표). 예전의 포션 자리예요
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
- 장비를 반드시 ${I.DROPS.boss.rolls}개 떨어뜨려요: ${tableRates(I.TABLES.boss)}
- 준비된 보스를 다 지나면 마지막 보스가 ${M.BOSS_EVERY}층마다 ${pct(M.BOSS_SCALE)}씩 강해져요

${table(["층", "표시", "이름", "HP", "공격", "방어", "경험치"],
  BOSS_FLOORS.map(d => { const b = M.makeBoss(d); return [d, `\`${b.ch}\``, b.name, b.hp, b.atk, b.def, b.xp]; }))}

## 최대 층 ${M.MAX_FLOOR}층: 일반 던전 완료

- 일반 던전은 **${M.MAX_FLOOR}층까지**예요. ${M.MAX_FLOOR}층 보스를 쓰러뜨리고 계단을 밟으면 **일반 던전 완료**
- 완료하면 안내 창과 함께 **로비로 돌아와요**. 로비의 **파란 포탈(\*)**로 들어가면 ${M.MAX_FLOOR}층의 **새 구역**(새 지도·몬스터·보스)에서 계속 파밍할 수 있어요. 다시 클리어하면 또 로비로 돌아와요. 아이템 레벨은 얻은 층이라 ${M.MAX_FLOOR}보다 높은 아이템은 없어요
- 랭킹 최고 층에는 "${M.MAX_FLOOR}층 완료 ✓"로 보여요 (서버 기록값 ${M.CLEAR_STAGE}). 같은 기록이면 먼저 세운 사람이 위
- 랭킹은 버전(시즌)마다 따로예요. 지금은 **v4 베타**에 기록되고, 최대 층이 생기기 전까지의 기록은 **v3 베타** 탭에 최종 기록으로 그대로 남아요. v4 베타의 아이템 랭킹은 v4 아이템만 세고, **예전(v3까지) 장비를 한 번이라도 낀 판은 v4 베타 층 랭킹에 기록되지 않아요** (가방에 보관하는 건 괜찮아요)
- 왜 ${M.MAX_FLOOR}층인가: 처음엔 150층이었는데, 끝까지 가는 시간이 너무 길어서(몬스터 약 17,700마리) ${M.MAX_FLOOR}층(약 4,650마리)으로 줄였어요. 대신 드롭 확률과 레전더리·세트가 나올 확률을 올려서, ${M.MAX_FLOOR}층까지만 가도 예전 150층만큼 좋은 장비(레전더리·세트 40~50개)와 강화석이 모여요. ${M.MAX_FLOOR}층을 완료한 사람은 나이트메어 던전으로 이어져요
- 던전 입구 **오른쪽 문**은 **최고 층 − 10층부터** 새로 시작해요 (최고 층 12층부터 열림). 완료한 사람은 **${M.MAX_FLOOR - 10}층부터** (${M.MAX_FLOOR - 10}·${M.MAX_FLOOR - 5}·${M.MAX_FLOOR}층 보스를 다시 파밍). 왼쪽 문은 1층부터

## 둘러싸임 방어

- 플레이어 주변 8칸(대각선 포함)에 몬스터가 **${M.CROWD.from}마리 이상** 붙어 있으면 받는 피해가 줄어요: (붙은 수 − ${M.CROWD.from - 1}) × ${pct(M.CROWD.per)}, **최대 ${pct(M.CROWD.max)}**
${table(["붙은 몬스터", ...[2, 3, 4, 5, 6, 7, 8].map(n => `${n}마리`)], [["받는 피해", ...[2, 3, 4, 5, 6, 7, 8].map(n => M.crowdCut(n) ? `−${pct(M.crowdCut(n))}` : "그대로")]])}
- 방어력으로 줄어든 뒤에 적용돼요 (받는 피해 감소·보석과 곱해서). 번개 튕김·화상도 줄어든 피해를 기준으로 해요
- 화면 위 능력치 줄에 **🛡 둘러싸임 −N%**로 보여요
- 왜: 한 층 몬스터가 많은 나이트메어에서 계속 몰려오면 흡혈(최대 ${I.LIFESTEAL.max}%)과 포션(10턴마다)으로 버틸 수 없었어요. 시뮬레이션(몬스터 20마리가 8마리씩 붙음, 그 층 고대 레전더리 +10): 40층 100% → 0%, 조금 약한 장비 100% → 43%. 45~50층은 여전히 어려워요

## 포탈과 로비

- 던전에서 **포탈(P)**을 타면 골드·레벨·장비를 그대로 들고 **바로** 로비로 돌아와요 (턴이 들지 않아요)
- 포탈로(또는 최대 층 완료로) 로비에 오면 **HP가 가득 차고 포션 쿨타임·화상·느려짐이 풀려요.** 살기 위해 타는 포탈이에요
- 로비에는 던전 입구 아래에 **파란 포탈(\*)**이 생겨요. 들어가면 **떠난 자리로** 돌아가요. 던전의 몬스터는 그대로라(HP도 그대로) 돌아가면 같은 자리에서 다시 싸워요
- 옆 칸에 포탈을 열고 걸어 들어가는 방식도 시뮬레이션해 봤는데, 여는 턴에 맞아서 쓰러지는 경우가 늘어서(나이트메어 1층 보스 7% → 17%) 바로 가는 방식으로 했어요

## 골드 던전

- 일반 던전 ${M.MAX_FLOOR}층을 **완료**하면 로비의 **골드 던전** 건물(던전 입구와 나이트메어 사이, 금색 ▼)이 열려요. 문이 두 개예요
- **왼쪽 문 (${M.GOLD_DUNGEON.floor}층)**: 난이도는 **${M.GOLD_DUNGEON.floor}층과 같아요** (${M.GOLD_DUNGEON.floor}층 몬스터 수·종류·정예, 계단을 지키는 ${M.GOLD_DUNGEON.floor}층 보스)
- **오른쪽 문 (악몽 N층)**: 나이트메어에 들어가 본 뒤에 열려요. **나이트메어 최고 층과 같은 몬스터·보스**(속성 포함)가 나오고, 보상은 그 레벨(${M.NIGHTMARE.itemBase} + 층) 레전더리 고대 굴리기 ${M.GOLD_DUNGEON.rewardRolls}번 비용의 **×${I.NM_SHOP.priceMul}** (몬스터가 강한 만큼). 예: 악몽 10층 ${I.goldDungeonReward(M.NIGHTMARE.itemBase + 10, M.GOLD_DUNGEON.rewardRolls, true).toLocaleString()}, 25층 ${I.goldDungeonReward(M.NIGHTMARE.itemBase + 25, M.GOLD_DUNGEON.rewardRolls, true).toLocaleString()}, 50층 ${I.goldDungeonReward(M.NIGHTMARE.itemBase + 50, M.GOLD_DUNGEON.rewardRolls, true).toLocaleString()}골드. 몬스터 처치 골드도 그 레벨만큼
- 보스를 쓰러뜨리고 계단을 밟으면 **완료 보상 골드 ${I.goldDungeonReward(M.GOLD_DUNGEON.floor, M.GOLD_DUNGEON.rewardRolls).toLocaleString()}** (= ${M.GOLD_DUNGEON.floor}레벨 레전더리 하나를 [고대 다시 굴리기](items.md#고대-다시-굴리기-골드) ${M.GOLD_DUNGEON.rewardRolls}번 할 수 있는 골드). 몬스터 처치·골드 더미 골드도 ${M.GOLD_DUNGEON.floor}층만큼 따로 받아요 ([경제: 골드](economy.md#골드) 참고)
- **장비는 나오지 않아요** (몬스터 드롭·보물·황금 고블린 없음). 골드를 모으는 곳이에요
- 완료하면 로비로 돌아오고, 파란 포탈(\*)이나 건물로 새 골드 던전(새 지도·새 보스)에 다시 들어가요. 쓰러지면 일반 던전처럼 골드·레벨이 처음으로 돌아가요
- 랭킹에는 영향이 없어요

## 나이트메어 던전

${M.MAX_FLOOR}층을 완료한 사람만 들어가는 더 강한 던전이에요. 로비 오른쪽 **나이트메어(▼)** 건물이 입구예요.

- 들어갈 수 있는 사람: 일반 던전 ${M.MAX_FLOOR}층 완료 + **장착한 장비가 모두 v4 이후** (예전 v3까지 장비는 가방에 있어도 되지만 끼고 있으면 못 들어가요. 안에서도 낄 수 없어요)
- **${N.floors}층**까지, 한 층 몬스터는 **1층 ${N.monsters.start}마리에서 층마다 ${N.monsters.perFloor}마리씩 늘어 ${Math.ceil((N.monsters.max - N.monsters.start) / N.monsters.perFloor) + 1}층부터 ${N.monsters.max}마리** (처음부터 ${N.monsters.max}마리면 들어가자마자 둘러싸여서), 보스는 ${M.BOSS_EVERY}층마다. ${N.floors}층 보스를 쓰러뜨리면 **나이트메어 완료** → 로비로, 파란 포탈(\*)로 ${N.floors}층 새 구역에서 계속 파밍
- 몬스터: 일반 던전 ${N.base}층 몬스터 기준으로 HP ×${N.hp}, 공격 ×${N.atk} (이름 앞에 "악몽의"). 보스는 ${N.base}층 보스 기준 HP ×${N.bossHp}, 공격 ×${N.bossAtk}
- 층 배율 = 1 + ${pct(N.perFloor)} × (층 − 1) + ${(N.perFloor2 * 100).toFixed(1)}% × (층 − 1)²: **앞쪽 층은 천천히, 깊을수록 가파르게** 강해져요 (${[5, 10, 25, N.floors].map(n => `${n}층 ×${M.nmScale(n).toFixed(2)}`).join(", ")}).
  - **공격력은 제곱 항이 ${(N.atkPerFloor2 * 100).toFixed(1)}%로 더 완만해요** (${[10, 25, 40, N.floors].map(n => `${n}층 ×${M.nmAtkScale(n).toFixed(2)}`).join(", ")}). 장비는 아이템 레벨만큼만 강해져서, HP와 같은 곡선이면 고대 장비로도 40층에서 몰려오는 몬스터에게 100% 쓰러졌어요 (시뮬레이션) 깊이 갈수록 [나이트메어 아이템](items.md#나이트메어-아이템의-힘-공격력방어력최대-hp-${I.NM_POWER.mul})(공격력·방어력·최대 HP ×${I.NM_POWER.mul})이 필요해요
  - 시뮬레이션으로 맞춘 목표: **보통 나이트메어 장비**(1~5층에서 얻은 것 중 부위별로 고름, +4)로 **5층 보스**를 잡을 수 있게 (무기가 괜찮으면 쓰러질 확률 0%, 공격력이 낮은 조합은 포탈로 회복하며 잡기), 잘 맞춘 장비(+10)는 40층까지 꾸준히, 50층이 벽
  - 예전(일반 HP ×4·공격 ×1.6, 보스 HP ×2.5·공격 ×1.1, 층마다 +9%)에는 보통 나이트메어 장비로 1층 보스에게도 거의 쓰러졌어요
- 아이템 레벨은 **${N.itemBase} + 나이트메어 층** (${N.itemBase + 1}~${N.itemBase + N.floors}). 드롭 확률·등급 확률은 일반 던전과 같아요
- 랭킹은 **나이트메어 탭**에 따로 기록돼요. 완료하면 "${N.floors}층 완료 ✓" (서버 기록값 ${N.clearStage})
- 나이트메어 몬스터·보스는 **속성**(불·얼음·번개)을 하나씩 가져요. 이름에 "불꽃·서리·번개"가 붙고, 화면에서 오른쪽 위에 속성 색 점이 보여요
- 나이트메어에서 얻은 아이템에는 **속성 피해·속성 저항** 줄이 붙을 수 있어요 ([장비 문서](items.md#나이트메어-아이템-속성-피해와-저항-규칙-r3))

${table(["나이트메어 층", "보스", "보스 HP", "보스 공격", "아이템 레벨"],
  [5, 10, 20, 30, 40, 50].map(n => { const b = M.makeNightmareBoss(n); return [n, b.name, b.hp, b.atk, N.itemBase + n]; }))}

## 헬 던전 (최종 목적지)

나이트메어를 완료한 사람만 들어가는 마지막 50층 던전이에요. 로비 **맨 위의 불타는 헬 던전** 건물이 입구예요.

- 들어갈 수 있는 사람: 나이트메어 ${N.floors}층 완료 + 장착한 장비가 모두 v4 이후
- **왼쪽 문**은 1층부터, **오른쪽 문**은 완료한 ${M.HELL.milestones.join("·")}층 중 골라서 그 층부터 (그 층 보스를 쓰러뜨리고 다음 층에 내려가면 완료, ${M.HELL.floors}층은 헬 완료)
- 몬스터: 나이트메어 ${M.HELL.startNm}층 몬스터·보스 기준 × 층 배율 (이름 앞에 "지옥의"). 몬스터 수는 나이트메어와 같아요
- 층 배율 = 1 + ${pct(M.HELL.perFloor)} × (층 − 1) + ${(M.HELL.perFloor2 * 100).toFixed(2)}% × (층 − 1)² (공격력은 ${(M.HELL.atkPerFloor2 * 100).toFixed(3)}%): ${[10, 25, 40, M.HELL.floors].map(n => `${n}층 HP ×${M.hellScale(n).toFixed(2)}·공격 ×${M.hellAtkScale(n).toFixed(2)}`).join(", ")}
  - 나이트메어 곡선(50층 ×9.2) 그대로면 지옥의 장비가 따라가지 못해 헬 25층에서 고대 +10도 몰려오는 몬스터에게 100% 쓰러졌어요
  - 4단계 밸런스: 처음 곡선(0.017 / 0.0003 / 0.00023, 50층 ×2.55·×2.39)은 40층부터 가팔라서 줄 품질 90% 장비가 40층 48% → 50층 99%. 앞쪽을 조금 올리고 뒤쪽을 낮춤 (50층 ×2.32·×2.15)
  - 장신구 3단계 뒤 (dc#48): 세 힘이 빠지고 누구나 장신구 3칸으로 공격력·방어력·최대 HP를 받아서 줄 품질 95%가 헬 50층 21% / 24% → 13% / 14%로 쉬워짐 → 공격력 제곱 항만 0.003% → 0.005% (50층 공격 ×${M.hellAtkScale(50).toFixed(2)})로 예전 목표에 맞춤
- **입구**: ${M.HELL.entry.until}층까지 몬스터 HP·공격 × ${M.HELL.entry.mul}. 나이트메어 장비(악몽의 힘 ×3)로 들어오는 층이라, 그대로면 나이트메어 50층보다 어려웠어요. 5층 보스부터 지옥의 장비(×5)가 나와요
- 시뮬레이션 (그 층 레벨의 나이트메어 추천 줄 레전더리 +10 + 레전더리 장신구 3개 +10(r8 수치, 저항 2줄: 속성 하나 + 모든 속성), 1층은 나이트메어 50층 장비 · 몰려오는 20마리 / 보스 1:1, 10의 배수는 네임드). 줄 품질 = 줄 값이 범위 안 어디쯤인지 (1 = 고대):

${table(["헬 층", "줄 품질 80%", "90%", "95%", "고대"], [["1", "29% / 0%", "6% / 0%", "3% / 0%", "0% / 0%"], ["5", "0% / 0%", "0% / 0%", "0% / 0%", "0% / 0%"], ["10 불가사리", "0% / 23%", "0% / 1%", "0% / 2%", "0% / 1%"], ["20 구미호", "0% / 26%", "0% / 14%", "0% / 5%", "0% / 2%"], ["30 이무기", "8% / 63%", "0% / 16%", "0% / 4%", "0% / 3%"], ["40 저승사자", "17% / 63%", "5% / 11%", "4% / 6%", "1% / 3%"], ["50 염라대왕", "54% / 68%", "28% / 36%", "20% / 19%", "10% / 16%"]])}
  - 비교: 나이트메어 50층은 80% 57% · 90% 36% · 95% 22% · 고대 14% (몰려옴, 보스 0%)
  - **장신구가 +0이면** 훨씬 어려워요 (95% 헬 50층 100% / 98%, 나이트메어 50층 87%). 장신구를 +10까지 강화하면 예전 % 장신구와 같은 세기예요. **장신구가 없으면** 헬 1층부터 몰려오는 몬스터에게 100%
  - 유니크 7 + 유니크 장신구(업경 목걸이 + 여우불 반지 2)는 헬 50층 0% / 0%
- **모든 몬스터에게 속성 저항**: 자기 속성 ${M.HELL.res.own}%, 다른 두 속성은 층에 따라 ${M.HELL.res.otherFrom}% → ${M.HELL.res.otherTo}%, 보스는 +${M.HELL.res.boss}%. 속성 피해 줄·화상·튕기는 번개·세트 스킬이 그만큼 덜 들어가요 ([폭풍전야](items.md#룬워드-효과)의 속성 저항 −20%, ${I.RUNEWORD_FX.vuln.radius}칸 안이 도움이 돼요. 속성 세트 + 폭풍전야는 [3단계 시뮬레이션](items.md#전설의-힘세트의-힘유니크의-힘--장신구-3단계))
- **헬에서는 내 속성 저항이 ${M.HELL.playerResCut}%p 낮아져요** (최대 75%를 넘긴 만큼은 소용없어요)
- 아이템 레벨은 **${M.HELL.itemBase} + 헬 층** (${M.HELL.itemBase + 1}~${M.HELL.itemBase + M.HELL.floors}), 이름에 **"지옥의"**가 붙어요 ([지옥의 아이템](items.md#지옥의-아이템))
- 골드: 처치 ×${M.HELL.gold.kill}, 골드 더미 ×${M.HELL.gold.pile}, 층 돌파 보상 = 그 층 지옥의 레전더리 상점 가격 × ${M.HELL.gold.floor}
- 랭킹은 **헬 탭**에 따로 기록돼요. 완료하면 "${M.HELL.floors}층 완료 ✓" (서버 기록값 ${M.HELL.clearStage})
- ${M.HELL.milestones.join("·")}층 보스는 [네임드 보스](#헬-네임드-보스), 고유 [유니크 아이템](items.md#유니크-최종-목표-아이템)을 떨어뜨려요

${table(["헬 층", "보스", "보스 HP", "보스 공격", "속성 저항 (자기 / 다른)", "아이템 레벨"],
  [5, 15, 25, 35, 45].map(n => { const b = M.makeHellBoss(n, "fire"); return [n, b.name, b.hp, b.atk, `${b.res.fire}% / ${b.res.ice}%`, M.HELL.itemBase + n]; }))}

### 헬 네임드 보스

헬 ${M.HELL.milestones.join("·")}층은 보통 보스 대신 이름 있는 **네임드 보스**가 계단을 지켜요 (분홍 테두리 두 겹). 저마다 고유한 패턴이 있고, 쓰러뜨리면 장비와 함께 **룬 ${M.NAMED.runes}개**를 떨어뜨리고 (룬 확률은 나이트메어 50층 보스와 같아요), **${Math.round(I.UNIQUE.chance * 100)}% 확률로 그 보스의 [유니크](items.md#유니크-최종-목표-아이템)** 2개 중 하나, 따로 **${Math.round(I.UNIQUE.accChance * 100)}% 확률로 유니크 장신구**를 떨어뜨려요. 오른쪽 문으로 완료한 층을 골라 들어가면 바로 그 네임드를 다시 잡으러 갈 수 있어요.

- 능력치 = 그 층 헬 보스 × HP 배율 × 공격 배율 (보스 속성 저항: 자기 속성 ${M.HELL.res.own + M.HELL.res.boss}%, 다른 속성 +${M.HELL.res.boss}%)
- 시뮬레이션 (그 층 추천 조합 레전더리 +10, 1:1, 줄 품질 90% · 95% · 고대): 10층 22·3·1% · 20층 33·11·2% · 30층 48·16·1% · 40층 55·15·1% · 50층 57·30·7%. 패턴을 끈 같은 능력치면 거의 0% — 패턴이 난이도를 만들어요
  - 처음(3단계)에는 고대 장비만 기준으로 맞춰서 줄 품질 90% 장비는 모든 네임드에게 49~97% 쓰러졌어요 → 4단계에서 줄 품질 95%가 15% 안팎(염라대왕 30%)이 되게 공격 배율을 다시 맞춤

${table(["헬 층", "네임드", "속성", "HP", "공격", "HP·공격 배율", "패턴"],
  Object.entries(M.NAMED.bosses).map(([n, N]) => { const b = M.makeNamedBoss(+n); return [n, `**${N.name}** (${N.title})`, N.pattern === "judge" ? "불 → 얼음 → 번개" : M.ELEMENTS.names[N.el], b.hp, b.atk, `×${N.hpMul} · ×${N.atkMul}`, {
    shred: () => `공격이 들어갈 때마다 내 방어력 −${N.shred.per}% (최대 −${N.shred.max}%, 쓰러뜨리거나 층을 떠나면 풀림)`,
    clones: () => `HP ${pct(N.clones.at)} 이하가 되면 분신 ${N.clones.count}마리 (HP = 최대 HP의 ${pct(N.clones.hp)}, 공격 ×${N.clones.atk}, 경험치·골드·장비 없음, 본체가 쓰러지면 사라짐)`,
    sweep: () => `${N.sweep.every}턴마다 보통 공격 대신 꼬리 휩쓸기: ${N.sweep.radius}칸 안이면 공격 ×${N.sweep.mul}, 방패로 막을 수 없음 (한 턴 전에 예고)`,
    reaper: () => `눈이 마주치면 쓰러뜨릴 때까지 포탈을 열 수 없고, 내 흡혈(스킬 흡혈 포함)이 ${pct(N.reaper.lifesteal)}로`,
    judge: () => `${N.judge.every}턴마다 속성이 불 → 얼음 → 번개로 바뀜 (속성 저항도 따라 바뀜), HP ${pct(N.judge.enrageAt)} 이하면 분노해 공격 ×${N.judge.enrageMul}`,
  }[N.pattern]()]; }))}

## 속성: 불·얼음·번개

나이트메어 몬스터의 공격, 그리고 나이트메어 아이템의 속성 피해로 걸려요.

${table(["속성", "몬스터가 걸 때 (플레이어가 맞음)", "플레이어가 걸 때 (장비에 속성 피해가 있으면)"], [
  ["불 🔥", `화상: ${EL.burn.ticks * EL.burn.every}턴 동안 ${EL.burn.every}턴마다 **맞은 피해의 1/${Math.round(1 / EL.burn.mul)}** (불 저항만큼 줄어듦)`, `화상: ${EL.burn.ticks * EL.burn.every}턴 동안 ${EL.burn.every}턴마다 **공격력의 1/${Math.round(1 / EL.burn.mul)}**`],
  ["얼음 ❄", `${pct(EL.ice.chance)} × (1 − 얼음 저항) 확률로 ${EL.ice.turns}턴 동안 느려짐: **2턴에 한 번만 움직임**`, `${pct(EL.ice.chance)} 확률로 몬스터가 ${EL.ice.turns}턴 동안 느려짐`],
  ["번개 ⚡", `한 번 더 튕겨서 **2번 맞음** (두 번째는 맞은 피해의 1/${Math.round(1 / EL.bolt.mul)}, 번개 저항만큼 줄어듦)`, `맞은 몬스터에서 ${EL.bolt.range}칸 안의 가까운 몬스터 **${EL.bolt.jumps}마리**에게 차례로 튕김 (공격력의 1/${Math.round(1 / EL.bolt.mul)}, 한 마리에 한 번)`],
])}

- 화상은 다시 걸리면 **남은 횟수만 처음으로** 돌아가요(중첩 없음). ${EL.burn.every}턴마다 터지는 박자는 그대로예요
- 느려짐이 풀리면 **${EL.ice.immune}턴 동안은 다시 안 걸려요**. 계속 느린 상태가 되지 않게
- 화상·번개 튕김 피해는 방어력을 무시해요. 몬스터가 걸 때는 방어력으로 줄어든 뒤의 피해가 기준이라, 방어력도 그만큼 막아줘요
- 저항은 속성마다 최대 ${EL.resCap}%. 저항이 없어도 나이트메어 아이템의 속성 피해로 빨리 잡는 쪽이 가장 큰 대비예요
- 층을 옮기면 화상·느려짐이 풀려요. 화면 위 능력치 줄에 지금 걸린 상태(🔥 화상, ❄ 느려짐·면역)가 보여요

## 장비 드롭 요약

${table(["어디서", "확률", "등급 확률"], [
  ["일반 몬스터", pct(I.DROPS.normal.chance), tableRates(I.TABLES.drop)],
  ["보물(!) (층마다 1~3곳)", "100% × 1개", tableRates(I.TABLES.golden)],
  ["정예", pct(I.DROPS.elite.chance), tableRates(I.TABLES.drop)],
  ["보스", `${pct(I.DROPS.boss.chance)} × ${I.DROPS.boss.rolls}개`, tableRates(I.TABLES.boss)],
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
// 나이트메어 한 층 기대 골드 (몬스터 수는 nmMonsterCount, 정예 확률은 75층, 처치·더미 배율 NIGHTMARE.gold)
function expectedGoldNM(n) {
  const NG = M.NIGHTMARE.gold, mul = M.goldMultiplier(M.NIGHTMARE.itemBase + n), elite = M.eliteChance(M.NIGHTMARE.base);
  const piles = avg(GOLD.piles.count) * avg(GOLD.piles.amount) * mul * NG.pile;
  const kills = M.nmMonsterCount(n) * ((1 - elite) * avg(GOLD.kill.normal) + elite * avg(GOLD.kill.elite)) * mul * NG.kill;
  const boss = M.isBossFloor(n) ? avg(GOLD.kill.boss) * mul * NG.kill : 0;
  const golden = G.chance * avg(GOLD.kill.golden) * mul * NG.kill;
  const floor = nmFloorGold(n);
  return { piles, kills, boss, golden, floor, total: piles + kills + boss + golden + floor };
}
const nmFloorGold = (n) => Math.round(I.shopPrice({ rarity: "legendary", lvl: M.NIGHTMARE.itemBase + n }) * I.NM_SHOP.priceMul * M.NIGHTMARE.gold.floor / 5) * 5;
let nmRunning = 0;
const nmCumulative = Array.from({ length: M.NIGHTMARE.floors }, (_, i) => { nmRunning += expectedGoldNM(i + 1).total; return nmRunning; });
let running = 0;
const cumulative = Array.from({ length: 25 }, (_, i) => { running += expectedGold(i + 1).total; return running; });
const SHOP_FLOORS = Array.from({ length: 30 }, (_, i) => i + 1).filter(I.isShopFloor).slice(0, 5);  // 4, 9, 14, 19, 24

const economyMd = `# 경제: 골드, 상점, 판매와 강화

${HEADER}

## 골드

골드는 **판(run)마다 처음부터** 모아요. 죽으면 0이 되고, 상점에서 장비를 사거나 [고대 다시 굴리기](items.md#고대-다시-굴리기-골드)에 써요.

### 얻는 곳

- **골드 더미 \`$\`**: 층마다 ${GOLD.piles.count.join("~")}개, 하나에 ${GOLD.piles.amount.join("~")} × 층 배율
- **몬스터 처치**: 쓰러뜨리는 즉시 들어와요
- **장비 판매**: 강화석과 함께 골드도 조금 (아래 [판매와 강화](#판매와-강화))

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

### 나이트메어 골드

- 나이트메어는 한 층 몬스터가 일반 75층보다 적어서, 예전에는 한 층 골드가 75층보다 적었어요. 그래서 **몬스터 처치 골드 ×${M.NIGHTMARE.gold.kill}, 바닥의 골드 더미(\$) ×${M.NIGHTMARE.gold.pile}**이에요 (아이템 레벨 = ${M.NIGHTMARE.itemBase} + 층으로 층 배율도 높음). 나이트메어 골드 던전(오른쪽 문)의 몬스터도 같아요
- **층 돌파 보상**: 계단을 밟아 다음 층으로 갈 때(${M.NIGHTMARE.floors}층은 완료할 때) 그 층 나이트메어 레전더리 상점 가격의 ${pct(M.NIGHTMARE.gold.floor)} (1층 ${nmFloorGold(1).toLocaleString()} ~ ${M.NIGHTMARE.floors}층 ${nmFloorGold(M.NIGHTMARE.floors).toLocaleString()}). 몬스터가 적은 앞쪽 층도 확실히 모이게
- 나이트메어 아이템을 판매하면 골드도 ×${I.NM_SHOP.sellMul} ([판매와 강화](#판매와-강화))

${table(["나이트메어 층", "더미", "처치", "보스", "황금 고블린", "층 돌파", "합계", "1층부터 누적"], [1, 5, 10, 25, 40, 50].map(n => {
  const e = expectedGoldNM(n);
  return [n, Math.round(e.piles), Math.round(e.kills), Math.round(e.boss) || "-", Math.round(e.golden), e.floor, Math.round(e.total), Math.round(nmCumulative[n - 1]).toLocaleString()];
}))}

1~${M.NIGHTMARE.floors}층을 한 번 깨면 평균 약 **${(Math.round(nmCumulative[M.NIGHTMARE.floors - 1] / 1000) * 1000).toLocaleString()}골드** (장비의 골드 획득 +% 빼고). 참고: 나이트메어 레전더리 상점 가격 ${M.NIGHTMARE.itemBase + 25}레벨 ${I.shopPrice({ rarity: "legendary", lvl: M.NIGHTMARE.itemBase + 25, v: 4, seed: "x|n25|k0" }).toLocaleString()}, 고대 굴리기 ${I.ancientRerollCost({ rarity: "legendary", lvl: M.NIGHTMARE.itemBase + 25, v: 4, seed: "x|n25|k0" }).toLocaleString()}

## 상점

- 보스 층(${I.SHOP.every}층마다) 바로 전 층(${SHOP_FLOORS.slice(0, 3).join(", ")}…층) 계단 옆 \`&\` 칸. 밟으면 열려요
- 황금 고블린과 같은 등급표로 ${I.SHOP.slots}개를 진열해요: ${tableRates(I.TABLES[I.SHOP.table])}
- 진열품은 (판 ID, 층)으로 정해져서 다시 열어도 같아요. 산 칸은 "판매 완료"로 남아요
- 가격: 등급 기본값 × (1 + 아이템 레벨당 10%), 5골드 단위. 상점 아이템 레벨 = 그 층
- **나이트메어 아이템(나이트메어 상점·시간 상점)은 가격과 진열 바꾸기 비용이 ×${I.NM_SHOP.priceMul}**예요 (강화석·고대 굴리기도 ×${I.NM_SHOP.priceMul}) (공격력·방어력·최대 HP ×${I.NM_POWER.mul}이라서). 예: ${M.NIGHTMARE.itemBase + 25}레벨 레전더리 ${I.shopPrice({ rarity: "legendary", lvl: M.NIGHTMARE.itemBase + 25, v: 4, seed: "x|n25|k0" }).toLocaleString()}골드

${table(["등급", "기본 가격", ...SHOP_FLOORS.map(d => `${d}층`)],
  Object.keys(I.SHOP.prices).filter(r => r !== "unique").map(r => [I.RARITIES[r].name, I.SHOP.prices[r], ...SHOP_FLOORS.map(l => I.shopPrice({ rarity: r, lvl: l }))]))}

### 진열 바꾸기

- 상점마다 최대 ${I.SHOP.rerolls.max}번. 바꾸면 ${I.SHOP.slots}개가 모두 새로 진열되고, 산 칸 표시도 초기화돼요
- 비용은 바꿀 때마다 2배, 층이 깊을수록 비싸져요: 기본 ${I.SHOP.rerolls.costs.join(" → ")} × (1 + ${I.SHOP.rerolls.perFloor} × (층 − 1)), 5골드 단위
- 바뀐 진열도 (판 ID, 층, 바꾼 횟수)로 정해져서 새로고침해도 같아요

${table(["층", ...I.SHOP.rerolls.costs.map((_, n) => `${n + 1}번째`), "3번 모두"],
  SHOP_FLOORS.map(d => { const c = I.SHOP.rerolls.costs.map((_, n) => I.rerollCost(d, n)); return [d, ...c, c.reduce((x, y) => x + y, 0)]; }))}

1층부터 상점 층까지 모은 평균 골드: ${SHOP_FLOORS.map(d => `${d}층 약 ${Math.round(cumulative[d - 1])}`).join(", ")} (상점에서 쓴 골드는 빼지 않은 값)

### 로비 시간 상점

- 로비 거래소·우편함 오른쪽 건물 \`&\`. 걸어 들어가면 열려요. 이름 옆에 다음 갱신까지 남은 분이 보여요
- **매 시간 정각**(시간 번호 = 1970년부터 지난 시간 수)에 진열이 새로 바뀌어요. 던전 상점과 **같은 등급표·가격·진열 바꾸기(최대 ${I.SHOP.rerolls.max}번)**, 판의 골드로 사요 (쓰러진 판은 못 씀)
- 아이템 레벨은 그 시간에 처음 열 때의 **최고 층(일반 던전, 최대 ${M.MAX_FLOOR})**으로 고정
- **나이트메어 기록이 있으면 나이트메어 아이템**을 진열해요: 레벨 = ${M.NIGHTMARE.itemBase} + 나이트메어 최고 층 (최대 ${M.NIGHTMARE.itemBase + M.NIGHTMARE.floors}), 속성 줄과 [악몽의 힘](items.md#나이트메어-아이템의-힘-공격력방어력최대-hp-${I.NM_POWER.mul})이 붙고, 가격·진열 바꾸기 비용은 ×${I.NM_SHOP.priceMul}
- 진열은 사람(게스트·계정)마다 달라요. 시드 \`lobby|(사람마다 다른 8글자)|h(시간 번호)[|r바꾼 횟수]|s칸\`
- 산 칸·바꾼 횟수는 그 기기에 저장해요. 이미 가진 아이템(다른 기기에서 산 같은 칸)은 다시 살 수 없어요
- 창을 열어 둔 채 정각이 지나면 새 진열로 바뀌고, 지난 진열의 칸은 살 수 없어요
- 서버는 시드를 다시 만들어 확인해요: 시간 번호가 서버 시각보다 미래면 안 되고, 레벨은 최고 층까지만 (나이트메어 진열은 시드에 \`|n층|\`, 레벨 = ${M.NIGHTMARE.itemBase} + 층)

## 판매와 강화

- 판매하면 등급에 따라 강화석을 받아요. 아이템 레벨이 높을수록 더 받아요: 기본값 × (1 + 레벨당 ${pct(I.SELL_PER_LEVEL)})
- **나이트메어 아이템을 판매하면 "${I.STONE_NAMES.nmStones}"**을 받아요 (개수는 같은 표). 나이트메어 아이템은 ${I.STONE_NAMES.nmStones}으로만 강화하고, 일반 아이템은 일반 강화석으로 강화해요. 일반 던전에서 모아 둔 강화석으로 나이트메어 아이템을 얻자마자 +10까지 올리지 못하게

${table(["등급", "기본", ...[10, 30, 60, 120].map(l => `Lv${l}`)], Object.keys(I.SELL_STONES).map(r => [I.RARITIES[r].name, I.SELL_STONES[r], ...[10, 30, 60, 120].map(lvl => I.sellStones({ rarity: r, lvl }))]))}

- 판매하면 **골드도 조금** 받아요: 기본값 × (1 + 레벨당 10%), 5골드 단위 (쓰러진 판에는 들어가지 않아요). **나이트메어 아이템은 ×${I.NM_SHOP.sellMul}**

${table(["등급", "기본", ...[10, 30, 60, 120].map(l => `Lv${l}`)], Object.keys(I.SELL_GOLD).map(r => [I.RARITIES[r].name, I.SELL_GOLD[r], ...[10, 30, 60, 120].map(lvl => I.sellGold({ rarity: r, lvl }))]))}

- 가방 전부 판매에 레전더리·세트가 섞여 있으면 같이 팔지 물어봐요. 안 팔면 가방에 남아요
- **🔒 자물쇠**: 레전더리·세트(와 헬 난이도의 룬워드 재료)는 인벤토리에서 잠글 수 있어요. 잠긴 아이템은 하나씩도, 가방 전부 판매로도 팔리지 않고 거래소에도 올릴 수 없어요 (잠금을 풀면 다시 가능). 필요 없는 레전더리를 한 번에 팔면서 남길 것만 잠가 두는 용도
- 보석·룬을 넣은 아이템도 가방 전부 판매에서 빠져요
- +N으로 강화할 때 강화석 N개가 들어요. 실패해도 아이템과 강화 단계는 그대로이고 강화석만 사라져요 (나이트메어 아이템은 ${I.STONE_NAMES.nmStones} ${I.NM_SHOP.priceMul}N개)
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

${table(["부위", "항상", "후보"], [["무기", "weapon"], ["장검 (무기)", "longsword"], ["보조무기", "offhandWeapon"], ["가슴(갑옷)", "chest"], ["팔", "arms"], ["머리(투구)", "head"], ["바지", "pants"], ["장화", "boots"], ["방패", "shield"]]
  .map(([name, k]) => [name, I.STATS[I.MAIN_V4.pool[k][0]].name, I.MAIN_V4.pool[k].slice(1).map(s => I.STATS[s].name + (I.STATS[s].pct ? "%" : "")).join(", ")]))}

- **치명타 확률**은 가슴·팔에만 붙어요. **치명타 피해**는 무기·보조무기에만 붙어요
- 방패는 여기에 더해 패링 확률이 붙어요 (아래 [보조 손](#보조-손-보조무기와-방패))

${table(["등급", "주 능력치 개수", "추가 능력치 줄 수", "수치 능력치 범위 배율"],
  RAR.map(r => [r, I.RARITIES[r]]).map(([r, x]) => [x.name, I.MAIN_V4.count[r][0] === I.MAIN_V4.count[r][1] ? I.MAIN_V4.count[r][0] + "개" : I.MAIN_V4.count[r].join("~") + "개", x.lines + "줄", `×${I.MAIN.rarityMul[r]}`]))}

- 후보가 적은 부위(방패)는 후보 수만큼만 붙어요

### 주 능력치: % 능력치 (등급별 고정)

${table(["능력치", ...RAR.map(r => I.RARITIES[r].name)],
  Object.keys(I.PCT_MAIN).filter(k => k !== "allRes").map(k => [I.STATS[k].name + "%", ...RAR.map(r => fmtR(k, I.PCT_MAIN[k][r]))]))}

### 주 능력치: 수치 능력치 (커먼 기준, 등급 배율을 곱함)

${table(["아이템 레벨", "공격력 (무기)", "방어력", "최대 HP (방어구)"],
  LEVELS.map(l => [l, fmtR("atk", I.mainRange("atk", sample("weapon", "common", l))), fmtR("def", I.mainRange("def", sample("chest", "common", l))), fmtR("hp", I.mainRange("hp", sample("chest", "common", l)))]))}

- 도끼의 공격력은 ×${I.WEAPONS.axe.atkMul}, 장검은 ×${I.WEAPONS.longsword.atkMul} (장검은 다른 주 능력치도 ×${I.WEAPONS.longsword.mainMul}, 아래 [장검](#장검-방패-전용-무기))

### 예: 레벨 10 장비의 수치 주 능력치 범위

${table(["등급", "무기 공격력", "도끼 공격력", "장검 공격력", "방어구 방어력", "방어구 최대 HP"],
  RAR.map(r => [I.RARITIES[r].name,
    fmtR("atk", I.mainRange("atk", sample("weapon", r, 10))), fmtR("atk", I.mainRange("atk", sample("weapon", r, 10, "axe"))), fmtR("atk", I.mainRange("atk", sample("weapon", r, 10, "longsword"))),
    fmtR("def", I.mainRange("def", sample("chest", r, 10))), fmtR("hp", I.mainRange("hp", sample("chest", r, 10)))]))}

## 추가 능력치 ◆

등급별 줄 수만큼, 서로 다른 종류로 붙어요. 모든 부위에 ${I.STAT_KEYS_V4.length}가지가 붙을 수 있어요: ${I.STAT_KEYS_V4.map(k => I.STATS[k].name + (I.STATS[k].pct ? "%" : "")).join(", ")}.

### 추가 능력치: % 능력치 (등급별 고정)

${table(["능력치", ...RAR.map(r => I.RARITIES[r].name)],
  Object.keys(I.PCT_LINE).filter(k => I.STAT_KEYS_V4.includes(k)).map(k => [I.STATS[k].name + "%", ...RAR.map(r => fmtR(k, I.PCT_LINE[k][r]))]))}

### 추가 능력치: 수치 능력치 (등급과 상관없이 아이템 레벨로)

${table(["아이템 레벨", ...["atk", "def", "hp"].map(k => I.STATS[k].name)],
  LEVELS.map(l => [l, ...["atk", "def", "hp"].map(k => fmtR(k, I.lineRange(k, l)))]))}

### 흡혈은 최대 ${I.LIFESTEAL.max}%

- 장비와 세트 효과를 합쳐 **흡혈은 최대 ${I.LIFESTEAL.max}%**예요 (치명타 75%, 패링 ${I.PARRY.max}%, 속성 저항 ${I.ELEMENT_LINES.resCap}%처럼)
- 단, **장검 + 방패**를 같이 끼면 흡혈 +${I.SHIELD_GUARD.lifesteal}%, 흡혈 최대 **${I.SHIELD_GUARD.cap}%** (피해가 낮은 대신 흡혈로 버티게)
- 흡혈은 **실제로 깎은 HP만큼만** 회복해요. HP 100 남은 적을 1,000 피해로 쓰러뜨리면 100의 흡혈만큼
- 왜: 40레벨 세트로 흡혈이 38%까지 모여서, 공격력이 1/3인 장비로도 75층 보스를 잡았어요. 상한이 생기면 깊은 층에서는 높은 레벨 장비(공격력·방어력·HP)가 필요해요

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

## 장검 (방패 전용 무기)

- 규칙 r5부터 무기 칸에 **장검**이 나와요 (무기 칸 아이템의 1/${Object.keys(I.WEAPONS).length}). 보조 손에는 **방패만** 낄 수 있어요
  - 장검을 끼면 끼고 있던 보조무기는 가방으로, 장검을 낀 채 보조무기를 끼면 장검이 가방으로 가요
- 왜: 방패를 끼면 두 번째(왼손) 공격이 없어지고 방패에는 공격 능력치가 없어서 공격력이 절반 가까이 떨어졌어요. 장검은 그만큼을 메워요
- 공격력 ×${I.WEAPONS.longsword.atkMul}. 주 능력치 후보는 공격력(항상)·방어력·치명타 확률·모든 속성 저항이고, 공격력이 아닌 것도 **다른 부위 범위의 ${I.WEAPONS.longsword.mainMul}배**예요

${table(["등급", "공격력 (Lv10)", "방어력 (Lv10)", "치명타 확률", "모든 속성 저항"],
  RAR.map(r => { const it = { ...sample("weapon", r, 10, "longsword"), v: 4 }; return [I.RARITIES[r].name, ...["atk", "def", "crit", "allRes"].map(k => fmtR(k, I.mainRange(k, it)))]; }))}

- 모든 속성 저항은 강화로 오르지 않아요 (추가 능력치의 저항 줄처럼)
- **견고의 세트** 무기도 장검이에요. 예전에 얻은 **견고의 도끼는 견고의 장검으로 바뀌었어요** (같은 아이템 ID, 강화 단계 그대로, 능력치는 장검 규칙으로 다시 정해짐)

## 홈과 보석·룬 (규칙 r6)

- 규칙 r${I.RULES_REV}부터 **홈**이 추가 능력치 후보 중 하나예요. 뽑히면 "홈 N개" **한 줄**이 되고, 그만큼 다른 능력치 한 줄이 빠져요 (보석을 안 넣으면 손해인 옵션)
- 홈 개수는 다른 줄처럼 굴려요 (최대치 ${pct(I.MAX_ROLL_CHANCE)}, 나머지는 최소 ~ 최대−1). **강화로 오르지 않아요.** 바지에는 없어요. 세트 장비는 같은 종류를 따라요
- 예전(r5까지) 아이템에는 홈이 붙지 않아요

${table(["장비", "홈 개수"], Object.entries({ head: "투구", chest: "갑옷", arms: "팔보호구", boots: "장화", weapon: "무기 (단검·지팡이·도끼)", offhandWeapon: "보조무기", longsword: "장검", shield: "방패" }).map(([k, name]) => [name, I.SOCKETS[k].join("~") + "개"]).concat([["바지", "없음"]]))}

### 보석

- ${I.GEM_KINDS.length}종류 × ${I.GEM_GRADES.length}등급 (${I.GEM_GRADES.join(" · ")}). **같은 보석 3개 = 한 등급 위**
- 인벤토리에서 아이템을 고르고 넣을 보석의 종류와 등급을 고르면, 가진 보석을 **자동으로 합치거나 쪼개서** 넣어요 (가진 게 모자라면 못 넣어요)
  - 그 등급이 있으면 그대로 → 없으면 아래 등급을 합쳐서 (3:1) → 그래도 없으면 위 등급 하나를 쪼개서 (남는 건 주머니에)
- 홈에 넣는 건 **공짜**, 넣으면 **뺄 수 없어요** (나중에 대장간에서 수수료를 내고 홈을 초기화하는 기능 예정)
- 넣은 곳이 **무기(보조무기 포함)**인지 **방어구·방패**인지에 따라 효과가 달라요

${table(["보석", "무기에 넣으면", "방어구·방패에 넣으면"], I.GEM_KINDS.map(k => { const g = I.GEMS[k], fx = (o) => Object.entries(o).map(([s, v]) => `${I.STATS[s].name} +${v.join("/")}${I.STATS[s].pct ? "%" : ""}`).join(", "); return [g.name, fx(g.weapon), fx(g.armor)]; }))}

- 값은 ${I.GEM_GRADES.join("/")} 순서. 받는 피해 감소는 세트 효과와 합쳐 **최대 ${I.GEM_CAPS.dmgReduce}%**
- 아이템을 팔면 넣은 보석도 사라져요. **가방 전부 판매**에서는 보석을 넣은 아이템을 빼요. 보석을 넣은 아이템은 거래소에 올릴 수 없어요

### 보석 드롭

- 장비 드롭과 따로 굴려요. 반드시 떨어지지는 않아요. 바닥에 **♦**로 보이고 밟으면 보석 주머니로 들어가요

${table(["몬스터", "보석 확률"], Object.entries({ normal: "일반", elite: "정예", boss: "보스", golden: "황금 고블린" }).map(([k, n]) => [n, pct(I.GEM_DROP.chance[k])]))}

${table(["던전", ...I.GEM_GRADES], [["일반 던전", ...I.GEM_DROP.grades.normal.map(w => w + "%")], ["나이트메어", ...I.GEM_DROP.grades.nightmare.map(w => w + "%")]])}

- 기대 개수 (시뮬레이션): 일반 1~75층 한 번에 약 157개 (조각으로 치면 약 214개), 나이트메어 1~50층 약 66개 (조각으로 치면 약 204개). 투구·갑옷·팔·장화·무기·방패의 홈을 모두 최대로 완벽한 보석으로 채우려면 조각으로 144개

### 룬

- 기본 자음 ${I.RUNES.length}개: ${I.RUNES.map(r => r.name).join(" · ")}. **"${I.RUNES[0].name}"가 가장 흔하고 "${I.RUNES[I.RUNES.length - 1].name}"가 가장 귀해요**
- **나이트메어 ${I.RUNE_DROP.floor}층 보스만** 떨어뜨려요. 잡을 때마다 **${I.RUNE_DROP.count}개 확정**. 바닥에 보석과 같은 **♦**인데 레전더리처럼 **무지개색**으로 계속 바뀌어요
- 나이트메어를 완료하면 로비 나이트메어 건물 **오른쪽 문**으로 ${I.RUNE_DROP.floor}층에 바로 들어갈 수 있어요 (왼쪽 문은 1층부터)
- 보석과 같은 홈에 넣어요. 넣으면 뺄 수 없고, 대장간 홈 초기화로만 지워져요 (룬은 사라짐). 무기·방어구 어디에 넣어도 **효과가 같고 고정 수치**예요
- **아래 룬 3개 = 바로 위 룬 1개**. 넣을 룬이 없으면 아래 룬을 자동으로 합쳐서 넣어요 (높은 룬부터). 위 룬을 쪼갤 수는 없어요
- 운영자(등록한 운영자 기기)는 룬을 쓰지 않고 아무 룬이나 넣을 수 있어요
- 정해진 순서로 넣으면 추가 효과가 생기는 조합은 아래 **룬워드**

${table(["룬", "효과", "떨어질 확률"], I.RUNES.map((r, k) => [r.name, Object.entries(r.fx).map(([s, v]) => `${I.STATS[s].name} +${v}${I.STATS[s].pct ? "%" : ""}`).join(", "), `${(I.RUNE_ODDS[k] * 100).toFixed(2)}%`]))}

- 한 단계 위로 갈 때마다 확률 ×${I.RUNE_DROP.ratio} ("${I.RUNES[I.RUNES.length - 1].name}" ${(I.RUNE_ODDS[I.RUNES.length - 1] * 100).toFixed(1)}%)
- "타"의 스킬 피해는 파이어볼·프로스트 노바·체인 라이트닝 모두에 더해져요 (속성 세트 스킬이 있을 때). 흡혈·받는 피해 감소 등은 원래 상한 그대로
- 시뮬레이션 (2만 번): 3:1 합치기까지 쓰면 "${I.RUNES[I.RUNES.length - 1].name}" 하나에 50층 보스 평균 약 110판 (절반 100판, 90% 220판)

### 룬워드

- **이름의 각 글자 초성 = 그 자음의 룬** (쌍자음은 기본 자음: ㄲ→가 ㄸ→다 ㅃ→바 ㅆ→사 ㅉ→자). 예: 천하무적 → 차·하·마·자, 신기루 → 사·가·라
- **커먼 아이템**만 재료가 돼요. 홈 개수가 이름 글자 수와 같고 베이스(부위·종류)가 맞아야 해요. 앞 홈부터 이 순서로 룬을 넣으면 완성
- 아이템 단계: 일반 → 악몽의 → (헬 난이도가 생기면) **지옥의**. 룬워드는 어느 단계에서도 만들 수 있지만, **좋은 옵션은 헬(지옥의) 아이템**에서 쓰라고 만들 거예요
- 그래서 **헬 아이템만 눈에 띄게**: 줍는 순간 "✦ 룬워드 재료!", 인벤토리에서 분홍 점선 테두리와 **✦ 룬워드** 표시로 고대 아이템 바로 다음, 🔒 잠금, 가방 전부 판매에서 같이 팔지 물어봄
- 일반·악몽의 아이템은 룬(나이트메어 50층)을 얻기 전에 줍는 것이라 표시하지 않아요. 상세에 접힌 "✦ 룬워드 재료" 칸으로만 (만들 수 있는 룬워드와 다음에 넣을 룬)
- 어느 단계든 순서에 안 맞는 룬이나 보석을 넣으려고 하면 룬워드를 못 만들게 된다고 경고해요
- 순위가 높을수록 얻기 힘든 룬이 들어가요 (1~5위는 고급 룬 차·카·타·파·하가 꼭 들어감). 비용 = 그 룬들을 모으는 데 드는 50층 보스 판 수 (3:1 합치기 포함, 평균)

${(() => { const per = I.RUNE_DROP.count * I.RUNE_ODDS.reduce((a, p, k) => a + p * 3 ** k, 0); return table(["순위", "룬워드", "룬 (순서대로)", "베이스", "비용"], I.RUNEWORDS.map(w => { const c = w.runes.reduce((a, k) => a + 3 ** k, 0) / per; return [w.rank, w.name, w.runes.map(k => I.RUNES[k].name).join("·"), `${w.bases.map(b => I.BASE_NAMES[b]).join("·")} ${w.runes.length}홈`, c >= 1 ? `약 ${Math.round(c)}판` : c >= 0.05 ? `${c.toFixed(1)}판` : "거의 바로"]; })); })()}

- 커먼 아이템 중 룬워드 재료가 되는 건 약 0.8% (커먼 20만 개 생성 기준). 홈 5~6개 장검, 3홈 갑옷 등 맞는 룬워드가 없는 홈 개수도 있어요

#### 룬워드 효과

- 완성되면 이름이 **금색 룬워드 이름**으로 바뀌어요 (예: +10 천하무적). 넣은 룬 하나하나의 효과에 룬워드 효과가 더해져요
- **주 능력치는 레전더리 수준**: 커먼 범위 안의 위치 그대로 레전더리 범위로 (고대 커먼이면 레전더리 최대치). 추가 능력치는 홈 줄 하나뿐이라 그만큼 룬워드 능력치가 대신해요
- **능력치는 아이템 단계에 따라**: 지옥의 아이템 ×${I.RUNEWORD_TIER_MUL.hell}, 악몽의 ×${I.RUNEWORD_TIER_MUL.nightmare}, 일반 ×${I.RUNEWORD_TIER_MUL.normal} (반올림, 최소 1). **특수 효과는 단계와 상관없이** 같아요
- 같은 종류의 특수 효과는 겹치지 않아요 (가장 큰 것 하나: 보호막 20%와 10%면 20%). 능력치는 더해져요. 룬워드로 생긴 스킬(체인 라이트닝·약한 파이어볼)도 세트 스킬로 봐요

${table(["순위", "룬워드", "능력치 (지옥의 아이템)", "특수 효과"], I.RUNEWORDS.map(w => [w.rank, w.name, Object.entries(w.stats).map(([k, v]) => I.formatStat(k, v)).join(", "), I.runewordSpecialText(w.special).join(" · ") || "-"]))}

- 몬스터의 속성 저항: 일반·나이트메어 몬스터는 0%, 폭풍전야에 걸리면 −20%라 속성 피해(불·얼음·번개 피해 줄, 화상, 튕기는 번개, 세트 스킬)가 20% 더 들어가요. 헬 몬스터는 속성 저항이 있어요 (자기 속성 50%, 다른 속성 10~40%)
- 시뮬레이션 (나이트메어 50층, 모든 장비 고대 +10, 몰려오는 20마리에서 쓰러질 확률, 악몽의 / 지옥의 룬워드): 추천 조합 7~9% · 장검 + 방패 5~7% 기준으로 천하무적 10% / 2%, 필살일격 0%, 폭풍전야 1%, 선견지명 0%, 카리스마 17% / 6%, 도원결의 57% / 25% (방패의 최대 HP·추가 능력치 4줄이 빠지는 만큼 아직 약함). 화염 세트 5는 100% → 태산 1% / 0%, 마음가짐 0% (세트 스킬 흡혈을 1/3만 주면 60~74%라 전부 줌). 보스 1:1은 모두 0%

## 장신구: 목걸이·반지 (규칙 r7, 주 능력치 r8)

- 장착 칸 **목걸이 1, 반지 2** (반지 두 칸이 다 차 있으면 어느 반지와 바꿀지 골라요). 몬스터·보스·보물·상점에서 다른 장비처럼 나와요 (부위 후보 7 → 9)
- 등급은 **커먼 ~ 레전더리** (세트로 굴려지면 레전더리). 레전더리의 ${pct(I.ANCIENT.chance)}는 **드롭할 때 고대** — 장신구는 고대 다시 굴리기·옵션 재련이 없어요 (운영자만 "고대로 만들기")
- **★ 주 능력치 = 공격력·방어력·최대 HP 3줄 (수치, r8부터)**: 범위는 아이템 레벨에 따라 커지고(다른 장비 주 능력치와 같은 모양), **다른 장비처럼 강화하면 올라요 (+10이면 2배)**. 악몽의 힘 ×${I.NM_POWER.mul}·지옥의 힘 ×${I.HELL_POWER.mul}도 붙어요
  - 세기: 단계별 추천 장비에서 **+10 장신구 하나가 예전 공격력·방어력·최대 HP +25%와 같게** 맞췄어요 (+0이면 그 절반). 일반 던전에서 얻으면 × ${I.ACCESSORY.normalMul} (예전 일반 던전 3~10%와 같은 비율)
  - 범위 = 다른 장비 주 능력치 범위(레벨) × 레전더리 1.75 × 공격력 ${I.ACCESSORY.flat.atk} · 방어력 ${I.ACCESSORY.flat.def} · 최대 HP ${I.ACCESSORY.flat.hp} × 등급(${Object.entries(I.ACCESSORY.flatRarity).filter(([r]) => r !== "set").map(([r, m]) => `${I.RARITIES[r].name} ${m}`).join(" · ")})
  - 예전(r7) 장신구는 그대로 "공격력·방어력·최대 HP +%" 한 줄 (강화로 안 오름)
  - 왜: % 한 줄은 강화해도 그대로라 장신구 강화가 의미 없었어요 (사용자 의견)
- 장신구는 **범위 안에서 고르게 굴려요** (다른 장비는 최대치가 20% 확률). 주 능력치 3줄이 모두 최대치일 확률은 아주 낮아서, 레전더리 장신구 중 고대는 거의 드롭 고대 굴림(${pct(I.ANCIENT.chance)})만큼이에요
- **◆ 추가 능력치 = 속성 저항 줄만**: 불·얼음·번개·모든 속성 중 하나씩, 같은 종류가 또 붙을 수 있어요 (예: 모든 속성 저항 두 줄 = 최대 22%, 불 저항 + 모든 속성 저항 = 불 41%·나머지 11%)
- **저항 줄 수는 얻은 곳에 따라 확률**: ${Object.entries(I.ACCESSORY.resLines).map(([t, d]) => `${{ normal: "일반 던전", nightmare: "나이트메어", hell: "헬" }[t]} ${Object.entries(d).map(([n, p]) => `${n}줄 ${pct(p)}`).join("·")}`).join(" / ")}
- 저항 줄은 강화로 오르지 않아요

${(() => { const acc = (rarity, tag, lvl) => ({ v: 4, r: I.RULES_REV, slot: "neck", rarity, seed: `x|${tag}|k1`, lvl }); const show = (it, mul) => ["atk", "def", "hp"].map(k => I.mainRange(k, it).map(v => v * mul).join("~")).join(" / ");
  return table(["등급", "★ 공격력 / 방어력 / 최대 HP: 일반 75레벨", "나이트메어 50층 (×3)", "헬 50층 (×5)", "◆ 불·얼음·번개 저항", "◆ 모든 속성 저항"],
    ["common", "uncommon", "rare", "epic", "legendary"].map(r => [I.RARITIES[r].name, show(acc(r, "d75", 75), 1), show(acc(r, "n50", 125), I.NM_POWER.mul), show(acc(r, "j50", 175), I.HELL_POWER.mul), fmtR("fireRes", I.ACCESSORY.res.fireRes[r]), fmtR("allRes", I.ACCESSORY.res.allRes[r])])); })()}
- 위 값은 +0 기준이에요. +10이면 2배 (다른 장비처럼 단계마다 +10%)
- 장신구 강화 시뮬레이션 (헬 50층, 장비 줄 품질 95% +10, 몰려오는 20마리 / 염라대왕): 장신구 +0 100% / 98% · +5 55% / 65% · **+10 20% / 19%** (예전 % 장신구와 같음) · +12 11% / 12%

## 전설의 힘·세트의 힘·유니크의 힘 → 장신구 (3단계)

- 예전에는 고대에 가까운 레전더리(전설의 힘 최대 +12%·저항 +4%), 지옥의 세트(세트의 힘 +12%·저항 +4%), 유니크(유니크의 힘 +15%·저항 +5%)가 하나마다 공격력·방어력·최대 HP를 더 받았어요
- **세 힘을 모두 없애고, 그 몫을 장신구 3칸이 맡아요.** 장비 종류와 상관없이 누구나 장신구로 공격력·방어력·최대 HP와 속성 저항을 받아요. 그래서 세트·유니크를 섞어도 손해가 없어요
- 일반 던전 장신구는 3~10%(레전더리, 지금은 수치 × ${I.ACCESSORY.normalMul})로 낮췄어요: 전설의 힘은 일반 던전에서 거의 안 붙었는데 장신구는 누구나 받아서, 5~15%면 일반 던전이 너무 쉬워졌어요
- 속성 세트(화염·뇌전)는 헬 몬스터의 속성 저항(한 속성 스킬 평균 −43%, 보스 −53%) 때문에 약해요 → **룬워드 폭풍전야**(${I.RUNEWORD_FX.vuln.every}턴마다 ${I.RUNEWORD_FX.vuln.radius}칸 안 몬스터 속성 저항 −20%)와 같이 쓰는 조합이에요. 폭풍전야는 장검이라 보조 손은 방패
- 시뮬레이션 (헬 50층, 줄 품질 95% +10, 몰려오는 20마리 / 염라대왕 1:1, 장신구는 헬 레전더리 3개 또는 유니크 장신구 3개(업경 목걸이 + 여우불 반지 2)):

${table(["조합", "세 힘 있을 때 (장신구 없음)", "3단계: 레전더리 장신구 3개", "3단계: 유니크 장신구 3개"], [
  ["전부 레전더리", "24% / 32%", "17% / 27%", "6% / 11%"],
  ["시험의 세트 6", "0% / 4%", "0% / 3%", "0% / 1%"],
  ["화염의 세트 5 + 두 손 단검", "43% / 44%", "43% / 48%", "14% / 15%"],
  ["서리의 세트 5 + 두 손 단검", "1% / 21%", "2% / 21%", "0% / 12%"],
  ["뇌전의 세트 5 + 두 손 단검", "88% / 16%", "90% / 28%", "65% / 5%"],
  ["화염의 세트 5 + 폭풍전야 + 업경대", "0% / 9%", "0% / 9%", "0% / 0%"],
  ["서리의 세트 5 + 폭풍전야 + 업경대", "0% / 6%", "0% / 4%", "0% / 0%"],
  ["뇌전의 세트 5 + 폭풍전야 + 업경대", "1% / 5%", "0% / 3%", "0% / 0%"],
  ["천하무적 + 레전더리", "8% / 25%", "0% / 10%", "0% / 2%"],
  ["유니크 7", "0% / 0%", "0% / 0%", "0% / 0%"],
])}

  - 시뮬레이션은 폭풍전야가 맞는 몬스터 모두에게 걸려 있다고 봐서 실제보다 조금 좋게 나와요 (실제로는 2턴마다 ${I.RUNEWORD_FX.vuln.radius}칸 안)
  - 이 표는 헬 곡선을 바꾸기 전이에요. 그 뒤 헬 뒤쪽 공격력을 조금 올려서(dc#48, 50층 공격 ×2.15 → ×2.20) 레전더리 조합은 몇 %p씩 어려워졌어요 ([헬 던전](monsters.md#헬-던전-최종-목적지) 표)
- 나이트메어 50층 (전부 레전더리 +10, 몰려오는 20마리): 줄 품질 95% 39% → 29%, 고대 12% → 29% (고대 레전더리만 받던 전설의 힘이 빠져서)
- 일반 던전 (보스 쓰러질 확률, 같은 등급 장신구 줄 품질 80%): 40층 에픽 +5 (줄 50%) 14% → 0%, 40층 레어 +5 98% → 68%, 75층 에픽 +5 91%(예전 100%), 40층 레전더리 +10 (줄 50%) 몰려옴 100% → 16%

## 고대 아이템

- **최고 등급(레전더리·세트)** 이면서 **모든 능력치(주 + 추가, 방패는 패링도)가 최대치**로 붙은 아이템이에요. 이름 앞에 **"고대"**가 붙고, 인벤토리에서 금빛으로 빛나요
- 그 아래 등급은 능력치가 모두 최대치여도 고대가 아니에요 (예전에 고대로 표시되던 낮은 등급 아이템도 이제 보통 아이템으로 보여요)
- **새로 얻는 레전더리·세트의 ${pct(I.ANCIENT.chance)}가 고대**예요. 고대로 나오면 모든 능력치가 범위의 최대치로 붙어요. 1~${M.MAX_FLOOR}층을 한 번 내려가면 레전더리·세트를 40~50개쯤 얻으니, 한 판에 고대 1개 남짓이에요
  - 아이템 ID로 정해지는 굴림이라 서버에서 똑같이 다시 계산해요
- 아이템 버전은 그대로 v4이고, 이 규칙이 생기기 전에 얻은 v4 아이템은 예전처럼 **모든 능력치가 우연히 최대치일 때만** 고대예요 (능력치 하나가 최대치일 확률이 ${pct(I.MAX_ROLL_CHANCE)}라 2만 개 중 1개꼴)

### 고대 다시 굴리기 (골드)

- 고대가 아닌 **v4 레전더리·세트**는 인벤토리에서 **골드로 고대를 다시 굴릴 수 있어요**
- 한 번에 **${pct(I.ANCIENT_REROLL.chance)}** 확률로 고대(모든 능력치 최대치)가 돼요. 아이템마다 **최대 ${I.ANCIENT_REROLL.max}번** (다 굴리면 고대가 될 확률 ${pct(1 - (1 - I.ANCIENT_REROLL.chance) ** I.ANCIENT_REROLL.max)})
- 비용은 그 아이템 **상점 가격의 1/3**이에요. 레벨이 높을수록 비싸요. 나이트메어 아이템은 상점 가격이 ×${I.NM_SHOP.priceMul}라 굴리기도 ×${I.NM_SHOP.priceMul}. 인벤토리 위쪽과 굴리기 줄에 지금 가진 골드가 보여요
- ${I.ANCIENT_REROLL.max}번 모두 실패한 아이템은 버튼 자리에 **"고대 굴리기 ${I.ANCIENT_REROLL.max}/${I.ANCIENT_REROLL.max}번 실패"**가 (누를 수 없게) 그대로 남아요
- 골드가 모자라면 [골드 던전](monsters.md#골드-던전)에서 한 번에 모을 수 있어요

${table(["아이템 레벨", "레전더리 한 번", "세트 한 번", "그 층에서 한 층에 모이는 골드 (평균)"],
  [25, 50, 75].map(l => [l, I.ancientRerollCost({ rarity: "legendary", lvl: l }).toLocaleString(), I.ancientRerollCost({ rarity: "set", lvl: l }).toLocaleString(), Math.round(expectedGold(l).total).toLocaleString()]))}

- 결과는 아이템 ID와 몇 번째 굴림인지로 정해져서, 서버가 똑같이 다시 계산해요 (새로고침해도 같은 결과)

## 나이트메어 아이템의 힘: 공격력·방어력·최대 HP ×${I.NM_POWER.mul}

- [나이트메어 던전](monsters.md#나이트메어-던전)에서 얻은 아이템은 **주 능력치 ★ 중 공격력·방어력·최대 HP가 ${I.NM_POWER.mul}배**예요. % 능력치(치명타 피해 등)와 추가 능력치 ◆는 그대로
- 아이템에 저장된 굴린 값은 그대로이고, 효과와 화면에 보여줄 때 곱해요. 그래서 **이미 가진 나이트메어 아이템도 바로** 적용되고, 서버(랭킹 장비 보기)도 똑같이 계산해요. 화면의 [최소~최대] 범위도 ×${I.NM_POWER.mul}로 보여요
- 강화는 ×${I.NM_POWER.mul}한 값에서 올라요 (단계마다 10%)
- 왜: 일반 던전에서 시험의 세트를 다 맞추면, 나이트메어 아이템으로 한 부위만 바꿔도 5세트 효과가 꺼져서 바꿀 수가 없었어요. 시뮬레이션으로 보면 예전 규칙에서는 보통 나이트메어 레전더리 +10을 7부위 다 껴도 1층 보스에게 거의 쓰러졌어요
  - 지금: 고대 시험의 세트 5부위(+10)에서 방어구를 나이트메어 레전더리(+5) 1·2·5부위로 바꾸면 1층 보스에게 쓰러질 확률이 세트 그대로 54% → 2%·14%·3%로 오히려 줄어요
  - 대신 나이트메어 몬스터가 층마다 +${pct(M.NIGHTMARE.perFloor)}씩 세져서(예전 +2%), 깊은 층은 깊은 층에서 얻은 나이트메어 장비가 필요해요 (보통 레전더리 +10이면 25층쯤까지, 50층은 잘 맞춘 장비)

## 지옥의 아이템

- [헬 던전](monsters.md#헬-던전-최종-목적지)에서 얻은 아이템은 이름에 **"지옥의"**가 붙어요 (예: 지옥의 불 레전더리 단검). 시드에 |j층|
- **지옥의 힘: 주 능력치 공격력·방어력·최대 HP ×${I.HELL_POWER.mul}** (악몽의 힘은 ×${I.NM_POWER.mul})
- 나이트메어 아이템처럼 속성 피해·저항 줄과 속성 세트가 붙어요
- 강화는 **지옥 강화석**으로 (지옥의 아이템을 팔면 나와요). 강화석·강화 골드·상점 가격 ×${I.HELL_SHOP.priceMul}, 판매 골드 ×${I.HELL_SHOP.sellMul}
- 지옥의 커먼이 룬워드 재료면 줍는 순간 알려 주고 인벤토리에서 눈에 띄게 보여요. 룬워드 능력치 ×1 (최대)

## 유니크 (최종 목표 아이템)

[헬 네임드 보스](monsters.md#헬-네임드-보스)만 떨어뜨리는 고정 아이템이에요. 네임드를 쓰러뜨릴 때마다 **${pct(I.UNIQUE.chance)}** 확률로 그 보스의 유니크 2개 중 하나 (금빛으로 빛나요).

- 시드 …|j층|u처치 순번, 출처 "unique" → 서버가 똑같이 다시 만들어 검증 (네임드 층이 아니거나 안 나오는 순번이면 거절)
- **주 능력치는 그 부위 후보 전부** (레전더리는 2~3개), 범위는 **레전더리 × ${I.UNIQUE.mul}**. 추가 능력치 **4줄은 아이템마다 고정**이고 값만 굴려요 (범위 × ${I.UNIQUE.mul})
- 고유 효과는 아래 표. 같은 종류 효과는 가장 큰 것 하나 (용비늘 장화 보호막과 룬워드 보호막도)
- 지옥의 아이템이라 지옥의 힘 ×${I.HELL_POWER.mul}·지옥 강화석. 고대·고대 다시 굴리기·옵션 재련·홈은 없어요. 거래소에 올리려면 캐시 연결 필요 (레전더리·세트처럼)
- 시뮬레이션 (헬 50층 추천 조합 레전더리 +10, 줄 품질 95%, 네임드 염라대왕 1:1 · 몰려오는 20마리): 그대로 26% · 23% → 한 부위만 유니크로 바꿔도 대부분 5~16% · 0~11% (지팡이 5%·관복 7%·송곳니 8%·사슬 16%, 쇠비늘은 25% · 8%), **방어구 유니크 5부위 0% · 0%**. 방패 유니크(업경대)는 두 손 단검보다 느려서 혼자 끼면 오히려 위험해요 (여의주 검 + 업경대 + 방어구 5부위면 0%)

${table(["네임드", "유니크", "부위", "추가 능력치 (고정)", "고유 효과"],
  Object.values(I.UNIQUE.items).filter(U => !U.acc).map(U => [`${U.boss}층 ${M.namedAt(U.boss).name}`, `**${U.name}**`, U.type ? I.kindName({ slot: U.slot, type: U.type }) : I.ARMOR[U.slot].name, U.lines.map(k => I.STATS[k].name + (I.STATS[k].pct ? "%" : "")).join(", "), U.text]))}

### 유니크 장신구 (규칙 r7)

네임드를 쓰러뜨릴 때마다 유니크 장비와 **따로 ${pct(I.UNIQUE.accChance)}** 확률로 그 보스의 유니크 장신구 (시드 …|j층|a처치 순번).

- ★ 주 능력치: 공격력·방어력·최대 HP (레전더리 장신구 범위 × ${I.UNIQUE.mul}, 강화하면 오름, r7은 ${I.ACCESSORY.power.unique.join("~")}%), ◆ 추가 능력치: 속성 저항 줄만 **${Object.entries(I.UNIQUE.accResLines).map(([n, p]) => `${n}줄 ${pct(p)}`).join(" · ")}** (레전더리 장신구 범위)
- 범위 안에서 고르게 굴리고, 드롭할 때 고대 굴림 ${pct(I.ANCIENT.chance)} (다른 유니크·장신구처럼 다시 굴리기 없음)
- 고유 효과는 더해져요: **같은 유니크 반지 두 개**를 끼면 효과도 두 배 (목걸이는 한 칸)
- 저항 최대치는 기본 ${M.ELEMENTS.resCap}%. 유니크 장신구로 그 위로 올라가요 (헬에서는 최대치까지 채운 저항에서 −${M.HELL.playerResCut}%)

${table(["네임드", "유니크 장신구", "부위", "고유 효과"],
  Object.values(I.UNIQUE.items).filter(U => U.acc).map(U => [`${U.boss}층 ${M.namedAt(U.boss).name}`, `**${U.name}**`, I.ACCESSORY.names[U.slot], U.text]))}

## 나이트메어 아이템: 속성 피해와 저항 (규칙 r3)

[나이트메어 던전](monsters.md#나이트메어-던전)에서 얻은 아이템(몬스터·보스·황금 고블린·보물·상점)은 추가 능력치 ◆ 후보에 **속성 줄 ${I.ELEMENT_LINES.keys.length}가지**가 더해져요. 일반 던전 아이템은 그대로예요.

${table(["능력치", ...RAR.map(r => I.RARITIES[r].name)],
  I.ELEMENT_LINES.keys.map(k => [I.STATS[k].name + "%", ...RAR.map(r => fmtR(k, I.RES_R4[k] || I.PCT_LINE[k][r]))]))}

(저항 줄은 규칙 r4부터의 범위. r3까지 얻은 아이템은 ${fmtR("fireRes", I.PCT_LINE.fireRes.rare)} · 모든 속성 저항 ${fmtR("allRes", I.PCT_LINE.allRes.rare)}로 붙어 있고, 효과는 새 최대치(${I.RES_R4.fireRes[1]}% · ${I.RES_R4.allRes[1]}%)까지만 적용돼요. 화면에 "(적용 N%)")

- 후보가 ${I.STAT_KEYS_V4.length}가지 → ${I.STAT_KEYS_NM.length}가지가 돼서, 나이트메어 아이템은 대신 치명타 같은 공격 줄이 붙을 확률이 조금 낮아요
- **속성 피해**: 공격할 때 **공격력의 N%를 그 속성 피해로 더해요.** 방어력에 줄지 않고, 치명타면 같이 커져요. 그리고 그 속성의 효과가 걸려요 (불 화상, 얼음 느려짐, 번개 튕김 — [몬스터 문서](monsters.md#속성-불얼음번개))
  - 강화(+${I.ENHANCE.lineSteps.join("·+")})로 오르지만, 강화하거나 고대여도 **한 줄 최대 ${I.ELEMENT_LINES.dmgCap}%**
  - **속성 피해 줄은 아이템마다 하나만** 붙어요. 굴려서 두 개 이상 나오면 가장 큰 것(같으면 먼저 붙은 것)만 남기고 나머지는 아직 안 붙은 다른 능력치로 다시 굴려요 (고대면 그 줄도 최대치). 예전에 얻은 아이템에도 똑같이 적용돼요 (같은 아이템 ID, 이름의 속성도 그대로)
- **속성 저항**: 그 속성의 화상·튕김 피해와 얼음에 걸릴 확률을 줄여요. 속성마다 (그 속성 저항 + 모든 속성 저항) **최대 ${I.ELEMENT_LINES.resCap}%**
  - **강화로는 오르지 않아요** (+4·6·8·10에서 오를 줄을 고를 때 저항 줄은 빼고 골라요)
  - 예전(11~34%, 강화로도 오름)에는 저항만 노리면 나이트메어 아이템 70개쯤으로 세 저항 모두 75%를 쉽게 맞췄어요. 지금은 저항만 노려도 부위마다 10개 중에서는 거의 못 맞추고(30번 중 2번), 20개면 절반, 40개면 대부분 (시뮬레이션, +10)
- 이름 앞에 **"악몽의 (속성)"**이 붙어요. 속성은 속성 피해 줄 중 가장 큰 것(같으면 먼저 붙은 줄, 강화 전 값)이고, 속성 피해 줄이 없으면 속성 이름 없이 **"악몽의 …"**이에요. 예: 고대 +3 악몽의 불 레전더리 단검, 악몽의 레어 바지
- 이 규칙(r3) 전에 나이트메어에서 얻은 아이템은 속성 줄 없이 그대로예요 (이름은 "악몽의 …")

## 강화

- 강화 1단계마다 **수치 주 능력치 +${pct(I.ENHANCE.statPerLevel)}** (최소 +1). **% 주 능력치는 2단계마다 +1%p** (+10이면 +5%p)
- **+${I.ENHANCE.lineSteps.join(", +")}**이 되면 추가 능력치 중 하나가 올라요
  - 수치 능력치: 그 레벨 범위 **최대치의 ${pct(I.ENHANCE.lineBoost)}**(최소 +1)
  - % 능력치: 그 등급 범위 **최대치의 ${pct(I.PCT_LINE_BOOST)}**(최소 +1). 예: 레전더리 치명타 피해(최대 ${I.PCT_LINE.critDmg.legendary[1]}%)는 +${I.lineBoost({ v: I.RULES_VERSION, rarity: "legendary", lvl: 1 }, "critDmg")}%p
  - 어느 줄이 오를지는 (아이템 ID, 강화 단계)로 정해져요. 같은 줄이 여러 번 오를 수도 있어요. **속성 저항 줄은 오르지 않아요** (규칙 r4, 이미 강화한 아이템도)
- **+${I.ENHANCE.goldFrom}부터는 골드도** 들어요 (한 번 시도할 때, 성공 확률 ${pct(I.enhanceChance(11))}): ${[60, 100, 125].map(l => `Lv${l} +11 ${I.enhanceGold(11, { lvl: l }).toLocaleString()} · +12 ${I.enhanceGold(12, { lvl: l }).toLocaleString()}`).join(" / ")}골드 (나이트메어 아이템 ×${I.NM_SHOP.priceMul})
- 성공 확률과 강화석은 [경제 문서](economy.md#판매와-강화)를 보세요. **나이트메어 아이템은 ${I.STONE_NAMES.nmStones}(나이트메어 아이템을 판매하면 나옴)으로 강화하고 ×${I.NM_SHOP.priceMul}개** (공격력·방어력·최대 HP ×${I.NM_POWER.mul}이라서)

## 대장간 (로비)

로비 아래쪽 가운데 **⚒ 대장간**에 걸어 들어가면 인벤토리가 대장간으로 열려요. 아이템을 고르면 아래 두 가지를 할 수 있어요. 골드는 판의 골드를 써요.

- **옵션 재련** (v4 레전더리·세트): 추가 능력치 한 줄(홈 줄 빼고)을 골라 다시 굴려요
  - **아이템마다 한 줄만**: 처음 재련한 줄이 그 아이템의 재련 줄이 되고, 그다음부터는 그 줄만 다시 굴릴 수 있어요 (운영자 기기는 테스트용으로 모든 줄)
  - 새 능력치는 그 아이템이 가질 수 있는 후보 중 **다른 줄에 없는 것** (지금 줄의 능력치가 다시 나올 수도 있어요). 속성 피해 줄은 하나만이라는 규칙 그대로
  - **고대 아이템이면 새 줄도 최대치** (고대가 풀리지 않아요)
  - 비용: 고대 굴리기 한 번의 ${pct(I.FORGE.reforge.mul)}에서 시작해서 그 아이템을 재련할 때마다 **×${I.FORGE.reforge.growth}, 처음의 ${I.FORGE.reforge.cap}배까지** (그 뒤로는 같은 값으로 계속 골드를 쓸 곳). 예: 나이트메어 40층 레전더리 ${[0, 1, 4, 9, 14].map(n => `${n + 1}번째 ${I.reforgeCost({ rarity: "legendary", lvl: 115, v: 4, seed: "x|n40|k0", rf: Array(n).fill(0) }).toLocaleString()}`).join(" · ")}골드
  - 예전(×1.5, 상한 없음)에는 원하는 능력치가 늦게 나오면(10명 중 1명, 27번째) 나이트메어 40층 기준 약 1억 9천만 골드가 들었어요. 지금은 보통 8번에 약 2만 3천, 늦어도 약 17만 (나이트메어 40층 한 층 약 2만 1천)
  - 결과는 (아이템 ID, 몇 번째 재련)으로 정해져서 서버가 똑같이 다시 계산해요 (랭킹·거래소)
- **홈 초기화**: 홈에 넣은 보석·룬을 모두 지워요 (보석·룬은 사라지고 홈 개수는 그대로). 수수료 ${I.FORGE.socketReset.base} × 레벨 보정 (나이트메어 아이템 ×${I.NM_SHOP.priceMul}): ${[60, 100, 125].map(l => `Lv${l} ${I.socketResetCost({ lvl: l }).toLocaleString()}`).join(" · ")}골드
- 왜: 골드가 처음엔 부족하고 나중엔 남았어요. 쓰는 곳(상점·고대 굴리기)이 대부분 한 번 쓰면 끝이라서, 수입은 그대로 두고 계속 쓸 곳을 만들었어요 (+11·+12 강화의 골드도)

## 추천 능력치 (끝판 목표): 일반 · 나이트메어 · 헬

단계마다 그 단계 끝(**일반 75층 · 나이트메어 50층 · 헬 50층**)을 깨는 조합이에요. 인벤토리 **추천** 탭에서 단계 버튼(일반·나이트메어·헬)으로 고르고(처음엔 지금 있는 곳), 지금 값과 같이 볼 수 있어요 (장착한 아이템에 이미 있는 줄은 ✓). 장비 칸의 **추천 N/5**와 아이템 상세의 부위 추천은 **그 아이템을 얻은 단계**의 추천으로 세요 (일반 아이템 → 일반, 악몽의 → 나이트메어, 지옥의 → 헬).

${table(["단계", "저항", "흡혈", "치명타", "장비", "장신구"], I.RECOMMEND.tiers.map(t => { const r = I.RECOMMEND[t], T = r.targets; return [`**${r.name}** (${r.goal})`, T.res ? `${T.res}%${t === "hell" ? " (헬 −10 뒤)" : ""}` : "-", `${T.lifesteal}%`, `${T.crit}%`, T.uniques ? `추천 유니크 ${T.uniques}부위 (없으면 레전더리)` : `고대 레전더리 ${T.legendary}부위 +${T.enh}`, r.acc]; }))}

${table(["부위", "주 능력치 ★", ...I.RECOMMEND.tiers.map(t => `◆ ${I.RECOMMEND[t].name}`), "헬 추천 유니크"], Object.keys(I.RECOMMEND.normal.slots).map(slot => { const lbl = (k) => I.STATS[k].name + (I.STATS[k].pct ? "%" : ""); const r = I.RECOMMEND.normal.slots[slot], U = I.UNIQUE.items[I.RECOMMEND.hell.uniques[slot]];
  return [I.SLOT_NAMES[slot] + (r.kind ? ` (${r.kind})` : ""), r.main.map(lbl).join(", "), ...I.RECOMMEND.tiers.map(t => I.RECOMMEND[t].slots[slot].lines.map(lbl).join(", ")), `${U.name} (${U.boss}층 ${M.namedAt(U.boss).name})`]; }))}

- 시뮬레이션 (그 단계 끝 레벨 레전더리 +10, 몬스터 20마리가 8마리씩 몰려옴 / 보스 1:1, 장신구는 실제 아이템):
  - **일반 75층**: 일반 아이템에는 속성 줄이 없고 일반 몬스터도 속성이 없어서 저항 목표가 없어요. 저항 줄 자리를 **HP·방어력**으로 채우면 (줄 품질 80%, 장비·장신구 +8) 몰려옴 1%·보스 0% — 비워 두면 41%, HP·공격력 9%, 방어력·공격력 22%, 장신구가 없으면 98%. 고대 +10이면 모두 0%
  - **나이트메어 50층** (고대 +10, 고대 장신구 3개 +10): 투구·갑옷·바지에 속성 저항 하나씩 + 팔 모든 속성 저항, 무기는 HP, 장신구 저항 2줄씩 → 몰려옴 16%·보스 0% (6턴). 장신구가 저항을 채워 주니 장비의 저항 줄은 4개면 되고 남는 자리는 HP (예전 추천인 장비 저항 줄 7개는 16~22%). 장신구 저항 줄이 없으면 43%
  - **헬 50층** (줄 품질 95% +10, 몰려옴 / 염라대왕, 내 저항 −${M.HELL.playerResCut}): **유니크 7 + 업경 목걸이 + 여우불 반지 2** (장신구도 +10) 0% / 0% (14턴 / 11턴, 가장 빠름), 명부의 반지 2면 흡혈 24%로 0% / 0%, 레전더리 + 같은 장신구 11% / 10%, 레전더리 + 레전더리 장신구(모든 저항 3줄) 17% / 25%. 업경 목걸이로 저항 최대치가 올라 헬에서 65% → 70%
- **저항** (나이트메어·헬): 속성 저항 줄(최대 ${I.RES_R4.fireRes[1]}%) + 팔 모든 속성 저항(${I.RES_R4.allRes[1]}%) + 장신구 저항 줄 6개(속성 하나 최대 ${I.ACCESSORY.res.fireRes.legendary[1]}%, 모든 속성 최대 ${I.ACCESSORY.res.allRes.legendary[1]}%) → 75%. 모자라면 장신구 저항 줄을 그 속성으로 맞추세요. 홈이 붙었다면 완벽한 다이아몬드(모든 저항 +4%, 갑옷 홈 4개면 +16%)로 저항 줄을 대신할 수 있어요
- **흡혈**: 무기·보조무기 주 능력치 ${I.PCT_MAIN.lifesteal.legendary[1]}% × 2 + 추가 능력치 ${I.PCT_LINE.lifesteal.legendary[1]}% × 2 = 20%
- **장검 + 방패**도 돼요: 같이 끼면 **흡혈 +${I.SHIELD_GUARD.lifesteal}%, 흡혈 최대 ${I.SHIELD_GUARD.cap}%**. 그때는 흡혈 줄을 무기·방패·투구·가슴에 노리세요
- 줄이 하나 모자라면 대장간의 옵션 재련(아이템마다 한 줄)으로 맞출 수 있어요

## 세트

구하기 아주 어려운 만큼(장비 상자 ${pct(I.TABLES.box.set / 100)}, 몬스터 드롭 ${pct(I.TABLES.drop.set / 100)}) 효과가 강해요. 세트 아이템이 나오면 그 부위에 있는 세트 중 하나로 정해져요 (방어구 부위는 시험의 세트, 무기는 셋 중 하나, 보조 손은 광란·견고 중 하나). **나이트메어에서 얻은 세트 방어구(규칙 r4 이후)는 시험·화염·서리·뇌전의 세트** 중 하나예요 (각 1/4).

- **시험의 세트**: ${Object.values(I.SETS.trial.bonuses).map(b => b.count).join("·")}개 입을 때마다 효과가 하나씩 켜져요. 6부위지만 아무거나 5개면 효과가 전부 켜져서, 무기는 자유롭게 골라도 돼요
- **광란의 세트**: 오른손·왼손 무기 2개. 보조 손도 무기라 한 턴에 2번 공격하고, 두 공격 모두 주변 1칸의 적에게 피해의 ${pct(I.SPLASH.mul)} (예전엔 100%였는데 무리를 다른 무기보다 2배 빨리 잡아서 줄였어요)
- **견고의 세트**: 장검·방패 2개. 패링 확률 +15% (방패 패링과 합쳐 최대 ${I.PARRY.max}%)
- **속성 세트** (나이트메어 전용): **화염·서리·뇌전의 세트**, 각각 방어구 5부위, 2·3·5개. 2세트부터 그 속성의 **스킬이 자동으로** 나가요. 다른 세트와 나눠 입을 수 있어요 (예: 시험의 세트 2 + 뇌전의 세트 3이면 시험 2세트 효과 + 뇌전 3세트 효과까지)
  - 스킬은 플레이어가 행동한 뒤, 몬스터가 움직이기 전에 나가요. 쏠 적이 없으면 준비된 채로 기다려요. 피해는 **방어력에 줄지 않고** 치명타가 터질 수 있어요. 그 속성의 피해% 줄도 더해져요
  - 🔥 **파이어볼** (화염): ${I.FIREBALL.every}턴마다, 보이는 적 중 ${I.FIREBALL.range}칸 안(대각선도 한 칸) 가장 가까운 적을 중심으로 3×3(9칸) 폭발. 공격력 × ${pct(I.FIREBALL.mul)} × (1 + 파이어볼 피해% + 불 피해%). **3세트**면 맞은 적 화상
  - ❄ **프로스트 노바** (서리): ${I.FROST_NOVA.every}턴마다, 내 주변 8칸에 적이 있으면 그 적 모두에게 공격력 × ${pct(I.FROST_NOVA.mul)} × (1 + 노바 피해% + 얼음 피해%). **3세트**면 맞은 적이 느려짐 (얼음 면역 중이면 안 걸림)
  - ⚡ **체인 라이트닝** (뇌전): ${I.CHAIN.every}턴마다, ${I.CHAIN.range}칸 안 가장 가까운 적부터 번개가 ${I.CHAIN.strikes}번 튕겨요 (다음은 앞에 맞은 적에서 ${I.CHAIN.range}칸 안 가장 가까운 다른 적). 한 번에 공격력 × ${pct(I.CHAIN.mul)} × (1 + 체인 피해% + 번개 피해%). **3세트**: ${I.CHAIN.strikesMax}번 튕기고, 튕길 다른 적이 없으면 같은 적이 다시 맞아요 (한 마리면 ${I.CHAIN.strikesMax}번). 맞은 적은 **감전**: ${I.CHAIN.shock.turns}턴 동안 받는 피해 +${I.CHAIN.shock.pct}% (모든 공격·스킬·화상)
  - 3세트에 특수 효과(화상·느려짐·4번 튕김), 5세트에 스킬 피해 +50%·능력치·저항 (예전엔 반대 — 3세트부터 스킬의 성격이 나오게)
  - 시뮬레이션 (나이트메어 25층, 같은 방어구 +6에 세트만 바꿈, 무기는 같은 조건, 5세트 = 효과 전부): 각자 잘하는 게 달라요

| 5세트 | 보스 | 몬스터 5마리에게 둘러싸임 | 한 줄 |
|---|---|---|---|
| 시험 | 8턴 | 7턴, 쓰러질 확률 약 33% | 균형·안전 |
| 화염 | 9턴 | **4턴**, 약 60% | 무리를 가장 빨리 잡음 |
| 서리 | 9턴 | 6턴, **약 15%** | 둘러싸여도 가장 안전 |
| 뇌전 | **6턴** | 4턴, 약 73% | 보스를 가장 빨리 잡지만 무리에는 약함 |

  - 섞어 입기(시험 2 + 속성 3)는 5세트보다 약해요 (예전 단계 기준 보스 9~10턴). 처음엔 섞어 입다가 5세트를 맞추는 게 목표
  - 화면 위 능력치 줄에 "🔥 파이어볼 / ❄ 노바 / ⚡ 체인 준비됨 · N턴", 스킬 칸이 잠깐 번쩍여요 (불 주황, 얼음 하늘색, 번개 노랑). 감전된 몬스터는 위쪽에 노란 줄

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
