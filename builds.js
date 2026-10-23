// 최고 조합 (헬 50층) 시뮬레이션 결과: builds.html(외부 창)과 게임 추천 탭(가장 강한 유니크)이 같이 씀
// 시뮬레이션: 장비 옵션 품질 95% +10, 장신구 +10, 몰려오는 20마리(8마리씩 붙음) / 네임드 염라대왕 1:1 (내 저항 −10)
//   부위를 하나씩 바꿔 가며 나아지는 쪽으로 찾고(sim/loadout), 줄은 한 줄씩 바꿔 보며(sim/build-lines, 줄 품질 75~95%) 고름
//   wave·boss = [쓰러질 확률 %, 걸린 턴]. 폭풍전야는 맞는 몬스터 모두에게 걸려 있다고 봐서 실제보다 조금 좋게 나옴
(function (root) {
  // 슬롯 하나: { rw: 룬워드 이름, base: 바탕 } | { set: 세트 id } | { uq: 유니크 id } | { leg: 레전더리 종류 } (+ main·lines: 추천 줄)
  const S = (set, main, lines) => ({ set, main, lines });
  const FIRE = {   // 1위 (유니크): 화염의 세트 5부위 줄 (스킬 피해 줄: 머리 얼음 피해 = 프로스트 노바, 가슴 불 피해 = 파이어볼)
    head: S("inferno", ["def", "hp"], ["iceDmg", "hp", "critDmg", "atkPct"]),
    chest: S("inferno", ["def", "crit", "hp"], ["fireDmg", "crit", "critDmg", "atkPct"]),
    arms: S("inferno", ["def", "crit", "atkPct"], ["hp", "crit", "critDmg", "atkPct"]),
    pants: S("inferno", ["def", "hp", "defPct"], ["hp", "crit", "critDmg", "atkPct"]),
    boots: S("inferno", ["def", "hp"], ["def", "crit", "critDmg", "atkPct"]),
  };
  const FROST = {   // 1위 (유니크 없음): 서리의 세트 5부위 줄 (머리 얼음 피해 = 프로스트 노바)
    head: S("frost", ["def", "hp"], ["iceDmg", "hp", "critDmg", "atkPct"]),
    chest: S("frost", ["def", "crit", "hp"], ["hp", "crit", "critDmg", "atkPct"]),
    arms: S("frost", ["def", "crit", "atkPct"], ["hp", "crit", "critDmg", "atkPct"]),
    pants: S("frost", ["def", "hp", "defPct"], ["hp", "crit", "critDmg", "atkPct"]),
    boots: S("frost", ["def", "hp"], ["def", "crit", "critDmg", "atkPct"]),
  };
  const SHIELD = { leg: "shield", main: ["def", "hp"], lines: ["lifesteal", "critDmg", "crit", "iceRes", "hp"] };
  const DAGGER = { leg: "offhandDagger", main: ["atk", "critDmg", "lifesteal"], lines: ["atk", "atkPct", "critDmg", "crit", "fireDmg"] };
  const setAll = (set, slots) => Object.fromEntries(slots.map(s => [s, { set }]));
  const ARMOR = ["head", "chest", "arms", "pants", "boots"];
  const LEG = (slots) => Object.fromEntries(slots.map(s => [s, { leg: s }]));
  const RLBuilds = {
    cond: "헬 50층 · 장비 옵션 품질 95% +10 · 장신구 +10 · 몰려오는 20마리(8마리씩) / 염라대왕 1:1",
    noUnique: {
      title: "유니크 없이 (세트 + 룬워드)",
      acc: { text: "레전더리 장신구 3개 (+10): 목걸이·반지 2, 저항 줄은 속성 하나 + 모든 속성 저항", lines: ["불·얼음·번개 저항% (하나씩 나눠서)", "모든 속성 저항%"] },
      builds: [
        { name: "필살일격(장검) + 레전더리 방패 + 서리의 세트 5", wave: [0, 11], boss: [0, 18], detail: true,
          slots: { weapon: { rw: "필살일격", base: "longsword" }, offhand: SHIELD, ...FROST },
          why: "장검 기본 공격 ×2(dc#53)에 필살일격(치명타 +10%·치명타 피해 +50%, 광란)으로 크게 때리고, 장검 + 방패 흡혈(최대 30%)로 버텨요. 서리의 세트 프로스트 노바가 몰려오는 몬스터를 정리해요" },
        { name: "폭풍전야(장검) + 도원결의(방패) + 서리의 세트 5", wave: [0, 16], boss: [0, 18], note: "폭풍전야(몬스터 속성 저항 −20%)를 시뮬레이션이 조금 좋게 봐서 실제로는 조금 느릴 수 있어요",
          slots: { weapon: { rw: "폭풍전야", base: "longsword" }, offhand: { rw: "도원결의", base: "shield" }, ...setAll("frost", ARMOR) } },
        { name: "폭풍전야(장검) + 도원결의(방패) + 뇌전의 세트 5", wave: [0, 21], boss: [0, 14],
          slots: { weapon: { rw: "폭풍전야", base: "longsword" }, offhand: { rw: "도원결의", base: "shield" }, ...setAll("storm", ARMOR) } },
        { name: "태산(단검) + 레전더리 보조 단검 + 화염의 세트 5", wave: [0, 19], boss: [0, 24],
          slots: { weapon: { rw: "태산", base: "weapon" }, offhand: { leg: "offhandDagger" }, ...setAll("inferno", ARMOR) } },
        { name: "시험의 세트 6", wave: [0, 33], boss: [0, 15], note: "보스는 빠르지만 몰려오는 몬스터는 느려요",
          slots: { weapon: { set: "trial" }, offhand: { leg: "offhandDagger" }, ...setAll("trial", ARMOR) } },
      ],
      compare: { name: "전부 레전더리", wave: [21, 36], boss: [19, 20] },
    },
    withUnique: {
      title: "유니크 포함 (유니크 + 세트 + 룬워드)",
      acc: { text: "업경 목걸이 + 여우불 반지 2 (+10): 업경은 저항 최대치 +5%(헬 65 → 70%), 여우불은 치명타 +3%·치명타 피해 +10%", lines: ["불·얼음·번개 저항% (하나씩 나눠서)", "모든 속성 저항%"] },
      builds: [
        { name: "여우구슬 지팡이 + 사자의 낫 + 화염의 세트 5", wave: [0, 8], boss: [0, 11], detail: true,
          slots: { weapon: { uq: "foxorb" }, offhand: { uq: "scythe" }, ...FIRE },
          why: "여우구슬 지팡이의 프로스트 노바와 처치할 때 HP 3% 회복, 화염의 세트 파이어볼로 몰려오는 몬스터를 가장 빨리 정리하고, 사자의 낫(처치할 때마다 공격력 +2%)이 갈수록 세져요. 스킬 피해 줄(얼음·불 피해)이 노바·파이어볼을 키워요" },
        { name: "여우구슬 지팡이 + 레전더리 보조 단검 + 화염의 세트 5", wave: [0, 10], boss: [0, 13], note: "사자의 낫이 없을 때",
          slots: { weapon: { uq: "foxorb" }, offhand: DAGGER, ...FIRE } },
        { name: "유니크 7", wave: [0, 14], boss: [0, 11],
          slots: { weapon: { uq: "foxorb" }, offhand: { uq: "scythe" }, head: { uq: "binyeo" }, chest: { uq: "ironscale" }, arms: { uq: "chains" }, pants: { uq: "robe" }, boots: { uq: "dragonboots" } } },
        { name: "여우구슬 지팡이 + 레전더리 보조 단검 + 시험의 세트 5", wave: [0, 15], boss: [0, 11],
          slots: { weapon: { uq: "foxorb" }, offhand: { leg: "offhandDagger" }, ...setAll("trial", ARMOR) } },
        { name: "폭풍전야(장검) + 마음가짐(방패) + 뇌전의 세트 5", wave: [0, 18], boss: [0, 9], note: "유니크 장비 없이 유니크 장신구만으로 · 보스를 가장 빨리 잡아요",
          slots: { weapon: { rw: "폭풍전야", base: "longsword" }, offhand: { rw: "마음가짐", base: "shield" }, ...setAll("storm", ARMOR) } },
      ],
      compare: { name: "전부 레전더리 + 유니크 장신구", wave: [12, 37], boss: [13, 19] },
    },
    // 가장 강한 유니크 (그 유니크를 꼭 낄 때 가장 좋은 조합의 턴 합): 게임 추천 탭(헬)에 보여줌
    uniqueRank: [
      { uq: "foxorb", turns: [8, 11], with: "사자의 낫 + 화염의 세트 5", text: "상위 조합 대부분에 들어가는 핵심 유니크" },
      { uq: "scythe", turns: [8, 11], with: "여우구슬 지팡이 + 화염의 세트 5" },
      { uq: "chains", turns: [11, 11], with: "여우구슬 지팡이 + 화염의 세트 4" },
      { uq: "binyeo", turns: [14, 11], with: "유니크 7", group: "방어구 유니크 4개는 유니크 7부위로 모을 때 좋아요" },
      { uq: "ironscale", turns: [14, 11], with: "유니크 7" },
      { uq: "robe", turns: [14, 11], with: "유니크 7" },
      { uq: "dragonboots", turns: [14, 11], with: "유니크 7" },
    ],
    accUniques: ["eopgyeong", "foxfire", "myeongbu"],
    // 헬 초반 (10~30층): 그 층 레전더리 장비(나이트메어 추천 줄, 품질 85% +10) + 레전더리 장신구 +10에서 무기·보조무기만 바꿈 (sim/early-swap)
    //   [쓰러질 확률 %, 걸린 턴] × 10·20·30층. 보스는 10·20·30층 네임드 (불가사리·구미호·이무기)
    early: {
      title: "헬 초반 (10~30층): 무기·보조무기",
      cond: "그 층 레전더리 장비 (나이트메어 추천 줄, 품질 85% +10) + 레전더리 장신구 +10에서 무기·보조무기만 바꿈 · 몰려오는 20마리 / 네임드 1:1",
      floors: [10, 20, 30],
      builds: [
        { name: "송곳니 + 레전더리 보조 단검", slots: { weapon: { uq: "fang" }, offhand: { leg: "offhandDagger" } }, wave: [[0, 26], [0, 28], [0, 31]], boss: [[0, 10], [2, 18], [0, 12]],
          why: "헬 10층 불가사리에서 나와요. 물어뜯기(때린 적이 받는 피해 +12%)로 네임드를 가장 빨리 잡고, 아이템 발견 +20%로 파밍도 돼요" },
        { name: "카리스마(장검) + 레전더리 방패", slots: { weapon: { rw: "카리스마", base: "longsword" }, offhand: { leg: "shield" } }, wave: [[0, 26], [0, 29], [0, 30]], boss: [[0, 18], [0, 29], [1, 24]],
          why: "장검 기본 공격 ×2 (dc#53)에 장검 + 방패 흡혈 30%까지, HP·처치 폭발로 가장 안전해요. 송곳니보다 조금 느려요" },
        { name: "나무(지팡이) + 레전더리 보조 단검", slots: { weapon: { rw: "나무", base: "staff" }, offhand: { leg: "offhandDagger" } }, wave: [[0, 23], [2, 25], [22, 26]], boss: [[5, 13], [11, 20], [12, 15]],
          why: "룬 2개(나·마)라 가장 싸게 만드는 룬워드예요 (50층 보스 약 5판). 30층부터는 몰려오는 몬스터에 약해요" },
        { name: "레전더리 단검 2 (비교)", cmp: true, wave: [[0, 32], [0, 33], [2, 36]], boss: [[14, 14], [17, 23], [34, 17]] },
        { name: "레전더리 장검 + 방패 (비교)", cmp: true, wave: [[0, 35], [0, 35], [0, 45]], boss: [[13, 18], [0, 32], [51, 21]],
          note: "장검 기본 공격 ×2 전에는 100·88·100%였어요. 장검·방패 룬워드(선견지명·카리스마·도원결의)는 파밍에도 좋아요 → 4. 파밍" },
      ],
    },
    // 파밍: 아이템 발견 % (최대 100). 처치 1번의 기댓값은 sim/farm-econ (헬 30층, 실제 드롭 규칙 3만 번)
    // 초반 파밍 결과는 sim/farm-early (헬 10·20·30층, 그 층 레전더리 품질 85% +10 + 레전더리 장신구 +10): [쓰러질 확률 %, 걸린 턴]
    farm: {
      title: "파밍 (아이템 발견)",
      floors: [10, 20, 30],
      builds: [
        { name: "초반 파밍: 기억·몰래 + 선견지명(장검) + 도원결의(방패)", when: "헬 10~30층, 유니크 없이 룬워드 4개로 100%",
          slots: [{ slot: "head", rw: "기억", base: "head" }, { slot: "chest", rw: "몰래", base: "chest" }, { slot: "weapon", rw: "선견지명", base: "longsword" }, { slot: "offhand", rw: "도원결의", base: "shield" }],
          rest: "팔·바지·장화·장신구는 그 층 레전더리",
          wave: [[0, 20], [0, 22], [0, 23]], boss: [[0, 7], [0, 8], [0, 9]], named: [69, 2, 99],
          alt: { name: "선견지명 대신 카리스마", wave: [[0, 19], [0, 21], [0, 22]], text: "처치 폭발이 이어서 터지고 HP·흡혈이 더 높아서 네임드도 36·0·83%" },
          note: "회전 베기·반격·처치 폭발 모두 흡혈이 돼서 몰려오는 몬스터를 빨리 정리해요. 네임드 층(10·20·30…)은 원래 장비로 바꿔 끼세요" },
        { name: "후반 파밍: 기억·몰래 + 쇠이빨 목걸이 + 여의 반지 2", when: "네임드 유니크 장신구를 모은 뒤, 무기·보조무기는 자유",
          slots: [{ slot: "head", rw: "기억", base: "head" }, { slot: "chest", rw: "몰래", base: "chest" }, { slot: "neck", uq: "ironfang" }, { slot: "ring", uq: "yeoui" }, { slot: "ring", uq: "yeoui" }],
          rest: "무기·보조무기·팔·바지·장화는 원래 조합 그대로 (예: 여우구슬 지팡이 + 레전더리 보조 단검 + 화염의 세트 팔·바지·장화). 송곳니를 끼면 +20%" },
      ],
      compare: { name: "기억·몰래 + 레전더리 단검 2 (발견 50%)", wave: [[0, 40], [8, 48], [27, 42]] },
      econ: [{ mf: 0, ls: 0.74, gold: 109, uq: 13.3 }, { mf: 50, ls: 1.23, gold: 161, uq: 11.4 }, { mf: 100, ls: 1.73, gold: 212, uq: 10 }],
      note: "초반 파밍 조합은 보통 장비(레전더리 단검 2, 32~36턴)보다 몰려오는 몬스터를 더 빨리 정리해서, 걸리는 시간까지 치면 레전더리·세트가 시간당 약 3~4배예요",
    },
    // 상위 조합에 안 들어가는 것: 그 아이템을 꼭 낄 때 가장 좋은 조합 (best = 같은 쪽 1위 턴 합)
    // 나무·송곳니는 헬 초반(early), 기억·몰래·선견지명·카리스마·도원결의·쇠이빨·여의 반지는 파밍(farm, 아이템 발견)에 씀
    unused: {
      runewords: [
      ],
      uniques: [
        { uq: "yeouiju", turns: [17, 17], with: "업경대 + 화염의 세트 5 (dc#53: 장검 ×2·체인이 혼자 남은 적도 다시 침 → 0%)" },
        { uq: "mirror", turns: [11, 16], with: "필살일격(장검) + 화염의 세트 5 (dc#53: 막아도 반사 → 0%)" },
      ],
      accUniques: [
        { uq: "ironfang", text: "불 저항 최대치 + 아이템 발견 +20%. 싸울 때는 업경 목걸이(모든 저항 최대치)에 밀리고, 파밍할 때 써요" },
        { uq: "yeoui", text: "번개 저항 최대치 + 아이템 발견 +15% (두 개면 +30%). 싸울 때는 여우불·명부의 반지가 낫고, 파밍할 때 써요" },
      ],
    },
  };
  if (typeof module === "object" && module.exports) module.exports = RLBuilds;
  else root.RLBuilds = RLBuilds;
})(typeof window !== "undefined" ? window : globalThis);
