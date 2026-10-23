// 최고 조합 (헬 50층) 시뮬레이션 결과: builds.html(외부 창)과 게임 추천 탭(가장 강한 유니크)이 같이 씀
// 시뮬레이션: 장비 옵션 품질 95% +10, 장신구 +10, 몰려오는 20마리(8마리씩 붙음) / 네임드 염라대왕 1:1 (내 저항 −10)
//   부위를 하나씩 바꿔 가며 나아지는 쪽으로 찾고(sim/loadout), 줄은 한 줄씩 바꿔 보며(sim/build-lines, 줄 품질 75~95%) 고름
//   wave·boss = [쓰러질 확률 %, 걸린 턴]. 폭풍전야는 맞는 몬스터 모두에게 걸려 있다고 봐서 실제보다 조금 좋게 나옴
(function (root) {
  // 슬롯 하나: { rw: 룬워드 이름, base: 바탕 } | { set: 세트 id } | { uq: 유니크 id } | { leg: 레전더리 종류 } (+ main·lines: 추천 줄)
  const S = (set, main, lines) => ({ set, main, lines });
  const STORM = {   // 1위 (유니크 없음): 뇌전의 세트 4부위 줄
    head: S("storm", ["def", "hp"], ["lifesteal", "crit", "critDmg", "atkPct"]),
    arms: S("storm", ["def", "crit", "atkPct"], ["hp", "crit", "critDmg", "atkPct"]),
    pants: S("storm", ["def", "hp", "defPct"], ["hp", "crit", "critDmg", "atkPct"]),
    boots: S("storm", ["def", "hp"], ["def", "crit", "critDmg", "atkPct"]),
  };
  const FIRE = {   // 1위 (유니크): 화염의 세트 5부위 줄 (스킬 피해 줄: 머리 얼음 피해 = 프로스트 노바, 가슴 불 피해 = 파이어볼)
    head: S("inferno", ["def", "hp"], ["iceDmg", "hp", "critDmg", "atkPct"]),
    chest: S("inferno", ["def", "crit", "hp"], ["fireDmg", "crit", "critDmg", "atkPct"]),
    arms: S("inferno", ["def", "crit", "atkPct"], ["hp", "crit", "critDmg", "atkPct"]),
    pants: S("inferno", ["def", "hp", "defPct"], ["hp", "crit", "critDmg", "atkPct"]),
    boots: S("inferno", ["def", "hp"], ["def", "crit", "critDmg", "atkPct"]),
  };
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
        { name: "필살일격 + 마음가짐 + 천하무적 + 뇌전의 세트 4", wave: [0, 19], boss: [0, 19], detail: true,
          slots: { weapon: { rw: "필살일격", base: "longsword" }, offhand: { rw: "마음가짐", base: "shield" }, chest: { rw: "천하무적", base: "chest" }, ...STORM },
          why: "천하무적(공·방·HP +35%, 불사)으로 버티고 필살일격(치명타 +10%·치명타 피해 +50%, 광란)으로 때려요. 마음가짐은 방패 자리에서 스킬로도 흡혈하게 해 줘요. 뇌전의 세트는 4부위로 3세트(체인 라이트닝 4번 튕김)까지" },
        { name: "폭풍전야 + 마음가짐 + 천하무적 + 화염의 세트 4", wave: [0, 13], boss: [0, 24], note: "폭풍전야(몬스터 속성 저항 −20%)를 시뮬레이션이 조금 좋게 봐서 실제로는 조금 느릴 수 있어요",
          slots: { weapon: { rw: "폭풍전야", base: "longsword" }, offhand: { rw: "마음가짐", base: "shield" }, chest: { rw: "천하무적", base: "chest" }, ...setAll("inferno", ["head", "arms", "pants", "boots"]) } },
        { name: "태산(단검) + 레전더리 보조 단검 + 화염의 세트 5", wave: [0, 19], boss: [0, 24],
          slots: { weapon: { rw: "태산", base: "weapon" }, offhand: { leg: "offhandDagger" }, ...setAll("inferno", ARMOR) } },
        { name: "태산(단검) + 레전더리 보조 단검 + 서리의 세트 5", wave: [0, 20], boss: [0, 24],
          slots: { weapon: { rw: "태산", base: "weapon" }, offhand: { leg: "offhandDagger" }, ...setAll("frost", ARMOR) } },
        { name: "시험의 세트 6", wave: [0, 33], boss: [0, 15], note: "보스는 빠르지만 몰려오는 몬스터는 느려요",
          slots: { weapon: { set: "trial" }, offhand: { leg: "offhandDagger" }, ...setAll("trial", ARMOR) } },
      ],
      compare: { name: "전부 레전더리", wave: [21, 36], boss: [19, 20] },
    },
    withUnique: {
      title: "유니크 포함 (유니크 + 세트 + 룬워드)",
      acc: { text: "업경 목걸이 + 여우불 반지 2 (+10): 업경은 저항 최대치 +5%(헬 65 → 70%), 여우불은 치명타 +3%·치명타 피해 +10%", lines: ["불·얼음·번개 저항% (하나씩 나눠서)", "모든 속성 저항%"] },
      builds: [
        { name: "여우구슬 지팡이 + 레전더리 보조 단검 + 화염의 세트 5", wave: [0, 10], boss: [0, 13], detail: true,
          slots: { weapon: { uq: "foxorb" }, offhand: DAGGER, ...FIRE },
          why: "여우구슬 지팡이의 프로스트 노바와 처치할 때 HP 3% 회복, 화염의 세트 파이어볼로 몰려오는 몬스터를 가장 빨리 정리해요. 스킬 피해 줄(얼음·불 피해)이 노바·파이어볼을 키워요" },
        { name: "여우구슬 지팡이 + 사자의 낫 + 시험의 세트 5", wave: [0, 13], boss: [0, 9], note: "보스를 가장 빨리 잡아요",
          slots: { weapon: { uq: "foxorb" }, offhand: { uq: "scythe" }, ...setAll("trial", ARMOR) } },
        { name: "여우구슬 지팡이 + 레전더리 보조 단검 + 화염의 세트 4 + 명부의 사슬", wave: [0, 11], boss: [0, 11],
          slots: { weapon: { uq: "foxorb" }, offhand: { leg: "offhandDagger" }, ...setAll("inferno", ["head", "chest", "pants", "boots"]), arms: { uq: "chains" } } },
        { name: "유니크 7", wave: [0, 14], boss: [0, 11],
          slots: { weapon: { uq: "foxorb" }, offhand: { uq: "scythe" }, head: { uq: "binyeo" }, chest: { uq: "ironscale" }, arms: { uq: "chains" }, pants: { uq: "robe" }, boots: { uq: "dragonboots" } } },
        { name: "여우구슬 지팡이 + 천하무적 + 레전더리", wave: [0, 17], boss: [0, 13],
          slots: { weapon: { uq: "foxorb" }, offhand: { leg: "offhandDagger" }, chest: { rw: "천하무적", base: "chest" }, ...LEG(["head", "arms", "pants", "boots"]) } },
      ],
      compare: { name: "전부 레전더리 + 유니크 장신구", wave: [12, 37], boss: [13, 19] },
    },
    // 가장 강한 유니크 (그 유니크를 꼭 낄 때 가장 좋은 조합의 턴 합): 게임 추천 탭(헬)에 보여줌
    uniqueRank: [
      { uq: "foxorb", turns: [10, 13], with: "레전더리 보조 단검 + 화염의 세트 5", text: "상위 조합 대부분에 들어가는 핵심 유니크" },
      { uq: "scythe", turns: [13, 9], with: "여우구슬 지팡이 + 시험의 세트 5" },
      { uq: "chains", turns: [11, 11], with: "여우구슬 지팡이 + 화염의 세트 4" },
      { uq: "binyeo", turns: [14, 11], with: "유니크 7", group: "방어구 유니크 4개는 유니크 7부위로 모을 때 좋아요" },
      { uq: "ironscale", turns: [14, 11], with: "유니크 7" },
      { uq: "robe", turns: [14, 11], with: "유니크 7" },
      { uq: "dragonboots", turns: [14, 11], with: "유니크 7" },
    ],
    accUniques: ["eopgyeong", "foxfire", "myeongbu"],
    // 상위 조합에 안 들어가는 것: 그 아이템을 꼭 낄 때 가장 좋은 조합 (best = 같은 쪽 1위 턴 합)
    unused: {
      runewords: [
        { name: "나무", turns: [22, 24], with: "서리의 세트 4 + 천하무적" },
        { name: "치유", turns: [33, 16], with: "시험의 세트 5" },
        { name: "도원결의", turns: [24, 29], with: "필살일격 + 천하무적 + 뇌전의 세트 4" },
        { name: "기억", turns: [26, 28], with: "태산(단검) + 천하무적 + 화염의 세트 3" },
        { name: "카리스마", turns: [32, 22], with: "마음가짐 + 뇌전의 세트 5" },
        { name: "몰래", turns: [31, 32], with: "태산(단검) + 서리의 세트 3 + 화염 장화" },
        { name: "선견지명", turns: [22, 42], with: "마음가짐 + 천하무적 + 서리의 세트 3" },
      ],
      uniques: [
        { uq: "yeouiju", turns: [11, 23], with: "마음가짐 + 천하무적 + 화염의 세트 4" },
        { uq: "fang", turns: [26, 12], with: "사자의 낫 + 레전더리" },
        { uq: "mirror", turns: [16, 31], with: "필살일격 + 천하무적 + 화염의 세트 4" },
      ],
      accUniques: [
        { uq: "ironfang", text: "불 저항 최대치만 올려요. 업경 목걸이(모든 저항 최대치)와 같은 목걸이 칸이라 밀려요" },
        { uq: "yeoui", text: "번개 저항 최대치만 올려요. 반지 칸은 여우불·명부의 반지가 더 좋아요" },
      ],
    },
  };
  if (typeof module === "object" && module.exports) module.exports = RLBuilds;
  else root.RLBuilds = RLBuilds;
})(typeof window !== "undefined" ? window : globalThis);
