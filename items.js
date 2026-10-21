// 장비 규칙: 부위, 무기 종류, 등급, 추가 능력치, 세트 효과, 등급 확률.
// 같은 시드로 만들면 항상 같은 아이템이 나온다. 획득 로그의 시드로 서버에서 다시 계산해 검증할 수 있도록
// 브라우저(window.RLItems)와 Node(require) 양쪽에서 쓸 수 있게 작성.
(function (root) {
  "use strict";

  // 생성 규칙이 바뀌면 올린다. 검증할 때는 아이템에 기록된 버전의 규칙으로 다시 계산해야 함
  // v1: 기본 능력치는 부위로 고정, 추가 능력치만 무작위
  // v2: 주 능력치(강화로 오름)도 등급별 개수만큼 무작위, 모든 능력치는 [최소~최대] 범위에서 최대치 20%
  // v3: 보조 손(보조무기·방패) 부위, 방패의 패링 확률, 광란·견고 세트
  // v4: 부위마다 붙을 수 있는 주 능력치가 다름, % 능력치(치명타·치명타 피해·공격력%·흡혈·골드·경험치 등)는
  //     레벨과 상관없이 등급별 고정 범위, 추가 능력치에 치명타 피해·공격력% 추가.
  //     예전(v2·v3) 아이템의 % 능력치는 효과를 계산할 때 v4 기준 최대치로 잘림 (아이템 자체는 그대로)
  // 게임은 v4만 새로 만들고(거래소·우편함용으로 v2·v3도 다시 만들 수 있음), 서버는 v1~v4를 모두 검증
  const RULES_VERSION = 4;
  // 같은 버전 안의 규칙 개정 (아이템 r). 버전 표기·랭킹 시즌은 그대로 두고, 그 뒤에 얻은 아이템에만 적용
  // r1: 레전더리·세트의 3%가 고대 (모든 능력치 최대치). r이 없는 v4 아이템은 예전 그대로
  // r2: 일반 던전이 75층으로 줄면서 드롭을 늘림 — 몬스터·보스 등급표가 좋아지고(TABLES), 드롭 확률이 오름(DROPS)
  // r3: 나이트메어에서 얻은 아이템(시드에 나이트메어 층)의 추가 능력치에 속성 피해·속성 저항이 붙을 수 있음 (ELEMENT_LINES).
  //     일반 던전 아이템은 r2와 똑같이 나옴 (ID만 다름). 같은 때부터 포션 자리(시드 |p)는 보물 자리: 황금 고블린 등급표로 1개 (서버도 r3부터 인정)
  // r4: 나이트메어 아이템의 세트 방어구는 시험의 세트 또는 속성 세트(화염의 세트…) 중 하나 (일반 던전 아이템은 r3과 똑같이 나옴, ID만 다름)
  // r5: 무기 칸에 장검(방패 전용)이 나올 수 있음 (WEAPONS.longsword). 견고의 세트 무기는 개정과 상관없이 장검 (예전 견고의 도끼도)
  // r6: 추가 능력치 후보에 홈(SOCKETS)이 들어감 — 바지 빼고. 홈에는 보석(GEMS)을 넣음
  const RULES_REV = 6;
  const ANCIENT = { chance: 0.03 };
  // 고대 다시 굴리기: 고대가 아닌 레전더리·세트(v4)를 골드로 다시 굴려 고대를 노림. 한 번에 5%, 아이템마다 최대 20번(최대 64%)
  // 비용은 그 아이템의 상점 가격 (레벨이 높을수록 비쌈, 53층 레전더리 약 2,500골드 ≈ 그 층에서 한 층 동안 모이는 골드)
  // 결과는 (아이템 ID, 몇 번째) 시드로 정해짐 → 서버가 아이템 참조의 ar(굴린 횟수)로 똑같이 다시 계산
  // 비용: 그 아이템 상점 가격의 1/3 (처음엔 상점 가격 그대로였는데, 20번 다 실패하면 끝이라 너무 비쌌음)
  const ANCIENT_REROLL = { chance: 0.05, max: 20, costMul: 1 / 3 };

  // ---- 시드 기반 난수 ----
  function hashSeed(str) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 2654435761);
      h2 = Math.imul(h2 ^ c, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return [h1 >>> 0, h2 >>> 0];
  }

  function rngFrom(seed) {
    let a = hashSeed(seed)[0];
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const randInt = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
  const pick = (rng, list) => list[Math.floor(rng() * list.length)];

  function pickWeighted(rng, weights) {
    const entries = Object.entries(weights).filter(([, w]) => w > 0);
    const total = entries.reduce((s, [, w]) => s + w, 0);
    let r = rng() * total;
    for (const [key, w] of entries) {
      if ((r -= w) < 0) return key;
    }
    return entries[entries.length - 1][0];
  }

  // ---- 부위와 무기 ----
  const SLOTS = ["head", "chest", "arms", "pants", "boots", "weapon", "offhand"];
  const SLOT_NAMES = { head: "머리", chest: "가슴", arms: "팔", pants: "바지", boots: "장화", weapon: "무기", offhand: "보조" };

  // 보조 손: 절반은 방패, 절반은 보조무기(왼손에 드는 무기 — 끼면 한 턴에 두 번 공격)
  // 방패는 막기(패링) 확률이 붙음: 등급마다 정해진 3가지 값 중 하나, 강화로 오르지 않음. 세트 효과까지 합쳐 최대 40%
  // 두 손 무기: 두 번째(왼손) 공격은 공격력의 secondHit 배
  const OFFHAND = { shieldChance: 0.5, shieldName: "방패", weaponPrefix: "보조" };
  const PARRY = {
    ranges: { common: [9, 11], uncommon: [9, 11], rare: [9, 11], epic: [16, 18], legendary: [23, 25], set: [23, 25] },
    max: 40,
  };
  const DUAL_WIELD = { secondHit: 0.6 };
  // 흡혈: 장비·세트를 합쳐 최대 20% (치명타 75%·패링 40%·저항 75%처럼). 실제로 깎은 HP만큼만 회복 (넘친 피해는 회복 안 함)
  // 40레벨 세트로 흡혈 38%가 되어 75층까지 버티던 것 → 깊은 층은 높은 레벨 장비로 바꾸게
  const LIFESTEAL = { max: 20 };
  // 광란의 세트: 때린 적 주변 1칸의 다른 적도 이 배율만큼 피해 (100% → 50%: 무리를 다른 무기보다 2배 빨리 잡던 것을 줄임)
  const SPLASH = { mul: 0.5 };
  // 무기처럼 쓰는 아이템: 무기 칸, 또는 보조 손의 방패가 아닌 것
  const isWeaponLike = (item) => item.slot === "weapon" || (item.slot === "offhand" && !!item.type && item.type !== "shield");
  // 방패 전용 무기(장검)를 낀 무기 칸: 보조 손에는 방패만 (보조무기를 같이 끼면 그 보조무기는 효과 없음)
  const isShieldOnly = (item) => !!item && item.slot === "weapon" && !!WEAPONS[item.type]?.shieldOnly;
  // 아이템 종류 이름: 단검 / 보조 단검 / 방패 / 투구…
  function kindName(item) {
    if (item.slot === "offhand") return item.type === "shield" ? OFFHAND.shieldName : `${OFFHAND.weaponPrefix} ${WEAPONS[item.type].name}`;
    return item.type ? WEAPONS[item.type].name : ARMOR[item.slot].name;
  }

  // 기본 능력치는 아이템 레벨에 따라 커짐
  // base는 v1 아이템용. v2에서는 atkMul(주 능력치 공격력 배율)만 씀
  // 장검 (r5): 무기 칸에만, 보조 손에는 방패만 낄 수 있음. 방패를 끼면 두 번째 공격이 없어서 공격력이 절반 가까이 떨어지던 것을 메움
  //   공격력 ×1.5, v4 주 능력치 후보는 공격력·방어력·치명타 확률·모든 속성 저항 (공격력 말고도 다른 부위 범위의 mainMul배)
  const WEAPONS = {
    dagger: { name: "단검", base: { atk: 2, crit: 6 }, atkMul: 1 },
    staff: { name: "지팡이", base: { atk: 2, hp: 6 }, atkMul: 1 },
    axe: { name: "도끼", base: { atk: 4 }, atkMul: 1.3 },
    longsword: { name: "장검", base: { atk: 4 }, atkMul: 1.5, mainMul: 1.5, shieldOnly: true },
  };
  // 무작위로 나오는 무기 종류: 장검은 r5부터 무기 칸에만 (예전 아이템은 예전 종류에서 골라야 같은 아이템이 나옴)
  const WEAPON_TYPES_OLD = ["dagger", "staff", "axe"];
  const weaponTypes = (rev) => (rev >= 5 ? Object.keys(WEAPONS) : WEAPON_TYPES_OLD);
  const ARMOR = {
    head: { name: "투구", base: { def: 1, hp: 2 } },
    chest: { name: "갑옷", base: { def: 2, hp: 4 } },
    arms: { name: "팔보호구", base: { def: 1 } },
    pants: { name: "바지", base: { def: 1, hp: 2 } },
    boots: { name: "장화", base: { def: 1 } },
  };

  // ---- 등급 ----
  const RARITIES = {
    common: { name: "커먼", lines: 1, color: "#cfd3da" },
    uncommon: { name: "언커먼", lines: 2, color: "#6bd36b" },
    rare: { name: "레어", lines: 3, color: "#5aa9ff" },
    epic: { name: "에픽", lines: 4, color: "#b77bff" },
    legendary: { name: "레전더리", lines: 5, color: "#ff9f2e" },
    set: { name: "세트", lines: 4, color: "#2fd6b5" },
  };

  // 등급 확률(가중치). 임시 값 — 확정된 확률표를 받으면 여기만 바꾸고 RULES_VERSION을 올린다
  // 등급표 (지금 규칙 r2). 75층까지만 가도 예전 150층만큼 레전더리·세트가 나오게 몬스터·보스 표를 올림
  const TABLES = {
    box: { common: 40, uncommon: 30, rare: 18, epic: 8, legendary: 3, set: 1 },
    drop: { common: 45, uncommon: 28, rare: 17, epic: 6.5, legendary: 2.5, set: 1 },
    boss: { common: 10, uncommon: 25, rare: 32, epic: 20, legendary: 9, set: 4 },
    golden: { rare: 65, epic: 25, legendary: 7, set: 3 },  // 황금 고블린: 레어 이상만
  };
  // r2 전 규칙의 등급표 (예전 아이템을 똑같이 다시 만들 때)
  const TABLES_OLD = {
    ...TABLES,
    drop: { common: 60, uncommon: 25, rare: 10, epic: 3.5, legendary: 1, set: 0.5 },
    boss: { common: 20, uncommon: 30, rare: 28, epic: 15, legendary: 5, set: 2 },
  };
  const tablesFor = (version, rev) => (version === 4 && rev >= 2 ? TABLES : TABLES_OLD);
  // 장비를 떨어뜨릴 확률과 등급표. normal은 일반 몬스터와 포션 자리. rolls: 한 마리당 굴리는 횟수
  const DROPS = {
    normal: { chance: 0.15, table: "drop" },
    elite: { chance: 0.6, table: "drop" },
    boss: { chance: 1, table: "boss", rolls: 2 },
    golden: { chance: 1, table: "golden" },  // 황금 고블린은 등급만큼 굴림 (monsters.js GOLDEN.ranks[].drops)
  };
  const DROP_CHANCE_OLD = { normal: 0.08, elite: 0.4 };  // r2 전 규칙 (서버가 예전 드롭을 검증할 때)
  const DROP_CHANCE = DROPS.normal.chance;

  // ---- 능력치 ----
  // 모든 능력치는 아이템 레벨(lv)로 정해지는 [최소, 최대] 범위에서 굴림. 최대치가 나올 확률은 20%,
  // 나머지 80%는 최소 ~ (최대 − 1)에서 고르게. 모든 능력치가 최대치인 아이템은 "고대" 아이템
  const MAX_ROLL_CHANCE = 0.2;
  const STATS = {
    atk: { name: "공격력", pct: false, line: (lv) => [1, 1 + Math.floor(lv / 2)] },
    def: { name: "방어력", pct: false, line: (lv) => [1, 1 + Math.floor(lv / 3)] },
    hp: { name: "최대 HP", pct: false, line: (lv) => [2, 4 + lv * 2] },
    crit: { name: "치명타 확률", pct: true, line: (lv) => [1, 2 + Math.floor(lv / 3)] },
    parry: { name: "패링 확률", pct: true },  // 방패와 견고 세트에만
    lifesteal: { name: "흡혈", pct: true, line: (lv) => [1, 2 + Math.floor(lv / 4)] },
    gold: { name: "골드 획득", pct: true, line: (lv) => [3, 8 + lv] },
    xp: { name: "경험치 획득", pct: true, line: (lv) => [3, 8 + lv] },
    // 아래는 세트 효과(와 v4 아이템의 % 능력치)에만 있음
    atkPct: { name: "공격력", pct: true },
    defPct: { name: "방어력", pct: true },
    hpPct: { name: "최대 HP", pct: true },
    critDmg: { name: "치명타 피해", pct: true },
    killHealPct: { name: "처치 시 최대 HP 회복", pct: true },
    dmgReduce: { name: "받는 피해 감소", pct: true },  // 시험의 세트 5세트
    splash: { name: "주변 1칸 피해", pct: false },
    // 나이트메어 아이템(r3)의 추가 능력치에만 있음. 속성 피해: 공격할 때 공격력의 N%를 그 속성 피해로 더함
    fireDmg: { name: "불 피해", pct: true },
    iceDmg: { name: "얼음 피해", pct: true },
    boltDmg: { name: "번개 피해", pct: true },
    fireRes: { name: "불 저항", pct: true },
    iceRes: { name: "얼음 저항", pct: true },
    boltRes: { name: "번개 저항", pct: true },
    allRes: { name: "모든 속성 저항", pct: true },
    socket: { name: "홈", pct: false },   // 추가 능력치 한 줄 (r6). 값 = 홈 개수
  };
  const STAT_KEYS = ["atk", "def", "hp", "crit", "lifesteal", "gold", "xp"];  // 추가 능력치로 붙을 수 있는 것 (v2·v3)
  const STAT_KEYS_V4 = ["atk", "def", "hp", "crit", "critDmg", "atkPct", "lifesteal", "gold", "xp"];  // v4: 치명타 피해·공격력% 추가

  // ---- v4: % 능력치는 레벨과 상관없이 등급별 고정 범위 [최소, 최대] ----
  // 순서: 커먼, 언커먼, 레어, 에픽, 레전더리, 세트
  const byRarity = (...ranges) => Object.fromEntries(["common", "uncommon", "rare", "epic", "legendary", "set"].map((r, i) => [r, ranges[i]]));
  // 주 능력치 (부위별로만 붙음 — MAIN_V4.pool)
  const PCT_MAIN = {
    crit: byRarity([1, 2], [2, 3], [3, 5], [5, 7], [8, 10], [7, 9]),            // 갑옷·손
    critDmg: byRarity([5, 10], [10, 15], [15, 25], [25, 35], [40, 50], [35, 45]),  // 무기·보조무기
    atkPct: byRarity([2, 3], [3, 5], [5, 8], [8, 12], [13, 15], [12, 14]),       // 무기·손
    lifesteal: byRarity([1, 1], [1, 2], [2, 3], [3, 4], [5, 6], [4, 5]),          // 무기·보조무기
    defPct: byRarity([2, 3], [3, 5], [5, 8], [8, 12], [13, 15], [12, 14]),       // 바지
    xp: byRarity([5, 8], [8, 12], [12, 18], [18, 25], [28, 35], [25, 30]),       // 투구
    gold: byRarity([5, 8], [8, 12], [12, 18], [18, 25], [28, 35], [25, 30]),     // 장화
    allRes: byRarity([4, 7], [4, 7], [4, 7], [4, 7], [4, 7], [4, 7]),            // 장검 (× mainMul, 강화로 오르지 않음)
  };
  // 추가 능력치 (모든 부위). 공격력·방어력·HP는 지금처럼 레벨에 비례 (STATS[..].line)
  const PCT_LINE = {
    crit: byRarity([1, 1], [1, 2], [2, 3], [3, 4], [4, 6], [4, 5]),
    critDmg: byRarity([3, 5], [5, 7], [7, 9], [9, 12], [12, 15], [11, 14]),
    atkPct: byRarity([1, 2], [2, 3], [3, 4], [4, 6], [6, 8], [5, 7]),
    lifesteal: byRarity([1, 1], [1, 1], [1, 2], [2, 3], [3, 4], [3, 3]),
    gold: byRarity([3, 6], [5, 8], [8, 12], [12, 16], [18, 25], [15, 20]),
    xp: byRarity([3, 6], [5, 8], [8, 12], [12, 16], [18, 25], [15, 20]),
    // 나이트메어 아이템(r3)만: 속성 피해는 등급별, 속성 저항 11~34%, 모든 속성 저항 6~11% (등급과 상관없이)
    fireDmg: byRarity([1, 2], [2, 3], [3, 4], [4, 6], [6, 8], [5, 7]),
    iceDmg: byRarity([1, 2], [2, 3], [3, 4], [4, 6], [6, 8], [5, 7]),
    boltDmg: byRarity([1, 2], [2, 3], [3, 4], [4, 6], [6, 8], [5, 7]),
    fireRes: byRarity([11, 34], [11, 34], [11, 34], [11, 34], [11, 34], [11, 34]),
    iceRes: byRarity([11, 34], [11, 34], [11, 34], [11, 34], [11, 34], [11, 34]),
    boltRes: byRarity([11, 34], [11, 34], [11, 34], [11, 34], [11, 34], [11, 34]),
    allRes: byRarity([6, 11], [6, 11], [6, 11], [6, 11], [6, 11], [6, 11]),
  };
  // ---- 속성 (나이트메어 아이템, r3) ----
  // 나이트메어에서 얻은 아이템에만 속성 피해·저항 줄이 붙음 (기존 v4 아이템의 추가 능력치 확률은 그대로)
  // 속성 피해는 강화하거나 고대여도 한 줄 최대 11%. 저항은 속성마다 (그 속성 저항 + 모든 속성 저항) 최대 75%
  // 효과(불 화상·얼음 느려짐·번개 튕김)는 monsters.js ELEMENTS
  const ELEMENT_LINES = {
    keys: ["fireDmg", "iceDmg", "boltDmg", "fireRes", "iceRes", "boltRes", "allRes"],
    dmg: { fire: "fireDmg", ice: "iceDmg", bolt: "boltDmg" },
    res: { fire: "fireRes", ice: "iceRes", bolt: "boltRes" },
    dmgCap: 11,
    resCap: 75,
    names: { fire: "불", ice: "얼음", bolt: "번개" },
    none: "",       // 속성 피해 줄이 없는 나이트메어 아이템은 속성 이름 없이 "악몽의 …" (예전 "악몽의 무속 …"은 이름만 길어서 뺌)
  };
  const STAT_KEYS_NM = [...STAT_KEYS_V4, ...ELEMENT_LINES.keys];
  const isElementDmg = (stat) => stat === "fireDmg" || stat === "iceDmg" || stat === "boltDmg";
  // 나이트메어에서 얻은 아이템: 시드에 나이트메어 층(|n12| 또는 |shop|n9|)이 있음 (속성 줄은 r3부터)
  const NM_SEED = /\|(shop\|)?n\d+\|/;
  const isNightmareItem = (item) => item.v === 4 && NM_SEED.test(item.seed || "");
  // 나이트메어 아이템의 속성: 속성 피해 줄 중 가장 큰 것 (같으면 먼저 붙은 줄). 강화 전 값으로 정해서 강화해도 이름이 안 바뀜. 없으면 null
  function itemElement(item) {
    let best = null, bestV = 0;
    for (const [k, v] of item.lines || []) {
      if (!isElementDmg(k) || v <= bestV) continue;
      best = k.slice(0, -3); bestV = v;   // "fireDmg" → "fire"
    }
    return best;
  }
  // v4 % 능력치 강화: 주 능력치는 2단계마다 +1%p (+10이면 +5), 추가 능력치는 +4·6·8·10 때 최대치의 20%(최소 +1)
  const PCT_LINE_BOOST = 0.2;
  // 속성 저항 줄 (r4부터): 속성 저항 7~20%, 모든 속성 저항 4~7%. 강화(+4·6·8·10)로는 오르지 않음 (오를 줄을 고를 때 저항 줄은 빼고 고름)
  // 예전(11~34%, 6~11%)에는 저항만 노리면 아이템 70개쯤으로 세 저항 모두 75%를 쉽게 맞췄음. r3까지 얻은 아이템은 효과를 계산할 때 새 최대치까지만
  const RES_R4 = { fireRes: [7, 20], iceRes: [7, 20], boltRes: [7, 20], allRes: [4, 7] };
  const isResLine = (stat) => !!RES_R4[stat];

  // ---- 홈 (r6) ----
  // 추가 능력치 후보 중 하나: 뽑히면 "홈 N개" 한 줄 (그만큼 다른 능력치 한 줄이 빠짐). N은 부위별 범위에서 다른 줄처럼 굴림
  // (최대치 20%, 나머지는 최소 ~ 최대−1). 바지에는 없음. 세트 장비는 같은 종류를 따름. 강화로 오르지 않음
  // 홈에는 보석을 넣음 (넣는 건 공짜, 뺄 수 없음). 레벨과 상관없이 등급별 고정 %
  const SOCKETS = {
    head: [1, 2], chest: [1, 4], arms: [1, 2], boots: [1, 2],
    weapon: [1, 2], offhandWeapon: [1, 2], longsword: [4, 6], shield: [1, 4],
  };
  const socketKey = (item) => item.slot === "offhand" ? (item.type === "shield" ? "shield" : "offhandWeapon") : isShieldOnly(item) ? "longsword" : item.slot;
  const socketRange = (item) => SOCKETS[socketKey(item)] || null;
  const socketCount = (item) => (item.lines || []).find(([k]) => k === "socket")?.[1] || 0;
  const fixedPct = (item, table, stat) => (item.v >= 4 && table[stat]
    ? (table === PCT_LINE && RES_R4[stat] && (item.r || 0) >= 4 ? RES_R4[stat] : table[stat][item.rarity]) : null);

  // 주 능력치: 강화하면 함께 오르는 능력치. 무기는 공격력, 방어구는 방어력이 항상 첫 번째로 붙고
  // 나머지는 부위별 후보에서 무작위. 개수는 커먼·언커먼 1~2개, 레어 이상 3~4개
  const MAIN = {
    pool: { weapon: ["atk", "crit", "lifesteal", "hp"], armor: ["def", "hp", "atk", "crit"] },
    count: { common: [1, 2], uncommon: [1, 2], rare: [3, 4], epic: [3, 4], legendary: [3, 4], set: [3, 4] },
    // 아이템 레벨 lv에서의 범위 (등급 배율 적용 전)
    range: {
      atk: (lv) => [1 + Math.floor(lv * 0.3), 3 + Math.floor(lv * 0.6)],
      def: (lv) => [1 + Math.floor(lv * 0.2), 2 + Math.floor(lv * 0.5)],
      hp: (lv) => [2 + lv, 4 + lv * 2],
      crit: (lv) => [1, 2 + Math.floor(lv / 4)],
      lifesteal: (lv) => [1, 1 + Math.floor(lv / 5)],
    },
    // 등급이 높을수록 범위 자체가 커짐
    rarityMul: { common: 1, uncommon: 1.15, rare: 1.3, epic: 1.5, legendary: 1.75, set: 1.6 },
    offSlotMul: 0.5,  // 방어구에 붙은 공격력·치명타, 무기에 붙은 최대 HP는 절반
  };
  // v4 주 능력치 후보 (첫 번째는 항상 붙음): 부위마다 다르게 → 원하는 옵션을 맞추려면 그 부위를 파밍해야 함
  const MAIN_V4 = {
    pool: {
      weapon: ["atk", "critDmg", "atkPct", "lifesteal"],
      offhandWeapon: ["atk", "critDmg", "lifesteal"],
      chest: ["def", "crit", "hp"],
      arms: ["def", "crit", "atkPct"],
      head: ["def", "hp", "xp"],
      pants: ["def", "hp", "defPct"],
      boots: ["def", "hp", "gold"],
      shield: ["def", "hp"],
      longsword: ["atk", "def", "crit", "allRes"],
    },
    // 주 능력치 줄 수 (후보 수가 상한)
    count: { common: [1, 1], uncommon: [1, 2], rare: [2, 2], epic: [2, 3], legendary: [2, 3], set: [2, 3] },
  };
  const mainPoolV4 = (item) => MAIN_V4.pool[item.slot === "offhand" ? (item.type === "shield" ? "shield" : "offhandWeapon") : isShieldOnly(item) ? item.type : item.slot];
  const scaleRange = ([lo, hi], mul) => {
    const a = Math.max(1, Math.round(lo * mul));
    return [a, Math.max(a, Math.round(hi * mul))];
  };
  function mainRange(stat, item) {
    // 장검(v4): 공격력 말고 다른 주 능력치도 다른 부위 범위의 mainMul배 (공격력은 atkMul)
    const lsMul = item.v >= 4 && stat !== "atk" && isShieldOnly(item) ? WEAPONS[item.type].mainMul : 1;
    const fixed = fixedPct(item, PCT_MAIN, stat);
    if (fixed) return lsMul !== 1 ? scaleRange(fixed, lsMul) : fixed;
    let mul = (MAIN.rarityMul[item.rarity] || 1) * lsMul;
    const weaponLike = isWeaponLike(item);
    if (weaponLike && stat === "atk" && item.type) mul *= WEAPONS[item.type].atkMul;
    const off = weaponLike ? stat === "hp" : (stat === "atk" || stat === "crit");
    if (off) mul *= MAIN.offSlotMul;
    return scaleRange(MAIN.range[stat](item.lvl), mul);
  }
  const lineRange = (stat, lv) => STATS[stat].line(lv);
  // 그 아이템의 추가 능력치 범위 (v4 % 능력치는 등급별 고정)
  const lineRangeOf = (stat, item) => (stat === "socket" ? socketRange(item) : fixedPct(item, PCT_LINE, stat) || lineRange(stat, item.lvl));
  // 최대치 20%, 그 외에는 최소 ~ (최대 − 1)
  function rollRange(rng, [lo, hi]) {
    if (hi <= lo || rng() < MAX_ROLL_CHANCE) return hi;
    return randInt(rng, lo, hi - 1);
  }

  // ---- 세트 ----
  // 시험의 세트: 2·3·5개를 입을 때마다 효과가 하나씩 켜짐 (6부위 중 아무거나 5개면 전부 켜짐 → 무기는 자유롭게 고를 수 있음)
  // 방어구 세트는 모두 2·3·5 (예전 2·4·5: 방어구 5부위를 세트 둘로 나누면 2+3이라 두 세트 모두 2세트 효과뿐이었음 → 이제 2세트 + 3세트 효과)
  // 광란의 세트: 오른손·왼손 무기 2개 → 때린 적 주변 1칸의 적도 같은 피해
  // 견고의 세트: 장검·방패 2개 → 패링 확률 +15% (방패 최대 25%와 합쳐 최대 40%)
  //   무기는 도끼였다가 장검으로 바뀜. 세트 무기 종류는 굴리지 않아서 예전에 얻은 견고의 도끼도 다시 만들면 견고의 장검 (ID는 같음)
  // weapon / offhand: 그 세트의 무기·보조 손 아이템 종류. 직업이 생기면 직업별 세트를 여기에 추가
  const SETS = {
    trial: {
      name: "시험의 세트",
      weapon: "axe",
      pieces: {
        head: "시험의 투구", chest: "시험의 갑옷", arms: "시험의 팔보호구",
        pants: "시험의 바지", boots: "시험의 장화", weapon: "시험의 도끼",
      },
      // 구하기 아주 어려운 만큼 강하게: 전체 능력치에 % 로 붙음
      bonuses: [
        { count: 2, text: "최대 HP +20%, 방어력 +20%", stats: { hpPct: 20, defPct: 20 } },
        { count: 3, text: "공격력 +25%, 치명타 확률 +10%", stats: { atkPct: 25, crit: 10 } },
        // 5세트: 흡혈 +8% → 받는 피해 −10% (흡혈이 최대 20%가 되면서 묻히지 않게)
        { count: 5, text: "치명타 피해 +100%, 받는 피해 −10%, 적을 쓰러뜨리면 최대 HP의 15% 회복", stats: { critDmg: 100, dmgReduce: 10, killHealPct: 15 } },
      ],
    },
    frenzy: {
      name: "광란의 세트",
      weapon: "dagger", offhand: "dagger",
      pieces: { weapon: "광란의 오른손무기", offhand: "광란의 왼손무기" },
      bonuses: [
        { count: 2, text: "공격하면 대상 주변 1칸의 적도 피해의 50%를 입어요", stats: { splash: 1 } },
      ],
    },
    // 화염의 세트 (나이트메어 전용, r4): 방어구 5부위. 2세트부터 파이어볼 스킬이 자동으로 나감 (FIREBALL)
    inferno: {
      name: "화염의 세트",
      nightmare: true,
      element: "fire",
      pieces: { head: "화염의 투구", chest: "화염의 갑옷", arms: "화염의 팔보호구", pants: "화염의 바지", boots: "화염의 장화" },
      bonuses: [
        { count: 2, text: "파이어볼: 2턴마다 3칸 안의 가장 가까운 적을 중심으로 3×3 폭발 (공격력의 80% 불 피해, 방어력 무시)", stats: { fireball: 1 } },
        { count: 3, text: "파이어볼 피해 +50%, 최대 HP +15%, 불 저항 +20%", stats: { fireballPct: 50, hpPct: 15, fireRes: 20 } },
        { count: 5, text: "파이어볼에 맞은 적이 모두 화상을 입어요", stats: { fireballBurn: 1 } },
      ],
    },
    // 서리의 세트 (나이트메어 전용, r4): 2세트부터 프로스트 노바 (FROST_NOVA). 생존 쪽
    frost: {
      name: "서리의 세트",
      nightmare: true,
      element: "ice",
      pieces: { head: "서리의 투구", chest: "서리의 갑옷", arms: "서리의 팔보호구", pants: "서리의 바지", boots: "서리의 장화" },
      bonuses: [
        { count: 2, text: "프로스트 노바: 2턴마다 내 주변 8칸의 적 모두에게 공격력의 70% 얼음 피해 (방어력 무시)", stats: { nova: 1 } },
        { count: 3, text: "프로스트 노바 피해 +50%, 방어력 +10%, 얼음 저항 +20%", stats: { novaPct: 50, defPct: 10, iceRes: 20 } },
        { count: 5, text: "프로스트 노바에 맞은 적이 모두 느려져요 (얼음 면역 중인 적 빼고)", stats: { novaSlow: 1 } },
      ],
    },
    // 뇌전의 세트 (나이트메어 전용, r4): 2세트부터 체인 라이트닝 (CHAIN). 보스·단일 대상 쪽
    storm: {
      name: "뇌전의 세트",
      nightmare: true,
      element: "bolt",
      pieces: { head: "뇌전의 투구", chest: "뇌전의 갑옷", arms: "뇌전의 팔보호구", pants: "뇌전의 바지", boots: "뇌전의 장화" },
      bonuses: [
        { count: 2, text: "체인 라이트닝: 2턴마다 3칸 안의 가장 가까운 적부터 번개가 2번 튕겨요 (서로 다른 적, 한 번에 공격력의 40% 번개 피해, 방어력 무시)", stats: { chain: 1 } },
        { count: 3, text: "체인 라이트닝 피해 +50%, 치명타 확률 +10%, 번개 저항 +20%", stats: { chainPct: 50, crit: 10, boltRes: 20 } },
        { count: 5, text: "번개가 4번 튕기고, 튕길 다른 적이 없으면 같은 적이 다시 맞아요 (한 마리면 4번). 맞은 적은 감전: 3턴 동안 받는 피해 +20%", stats: { chainMax: 1 } },
      ],
    },
    sturdy: {
      name: "견고의 세트",
      weapon: "longsword", offhand: "shield",
      pieces: { weapon: "견고의 장검", offhand: "견고의 방패" },
      bonuses: [
        { count: 2, text: "패링 확률 +15% (방패와 합쳐 최대 40%)", stats: { parry: 15 } },
      ],
    },
  };
  // 그 부위로 나올 수 있는 세트 (정해진 순서: trial, frenzy, inferno, sturdy). nm4: 나이트메어 아이템(r4 이후)이면 나이트메어 전용 세트도
  const setsFor = (slot, nm4 = false) => Object.keys(SETS).filter(id => SETS[id].pieces[slot] && (!SETS[id].nightmare || nm4));
  // 파이어볼 (화염의 세트 2세트): every턴마다, range칸 안(가로·세로·대각 모두 한 칸) 가장 가까운 적을 중심으로 (2·radius+1)² 칸
  // 피해 = 공격력 × mul × (1 + 파이어볼 피해% + 불 피해%) — 방어력 무시, 치명타 가능. 5세트면 맞은 적에게 화상
  const FIREBALL = { every: 2, range: 3, radius: 1, mul: 0.8 };
  // 프로스트 노바 (서리의 세트 2세트): every턴마다, 내 주변 radius칸(대각선 포함 8칸)에 적이 있으면 그 적 모두에게
  // 피해 = 공격력 × mul × (1 + 노바 피해% + 얼음 피해%). 5세트면 맞은 적이 느려짐 (얼음 면역 규칙 그대로)
  const FROST_NOVA = { every: 2, radius: 1, mul: 0.7 };
  // 체인 라이트닝 (뇌전의 세트 2세트): every턴마다, range칸 안 가장 가까운 적부터 strikes번 (다음은 앞에 맞은 적에서 range칸 안 가장 가까운 다른 적)
  // 한 번에 공격력 × mul × (1 + 체인 피해% + 번개 피해%). 5세트: strikesMax번, 다른 적이 없으면 같은 적이 다시 맞음 + 감전(받는 피해 +shock.pct%, shock.turns턴)
  const CHAIN = { every: 2, range: 3, strikes: 2, strikesMax: 4, mul: 0.4, shock: { turns: 3, pct: 20 } };
  // 세트를 다 맞추는 개수 (효과가 모두 켜지는 개수)
  const setFull = (id) => Math.max(...SETS[id].bonuses.map(b => b.count));

  // v1 아이템 생성 규칙에서 쓰던 함수 (예전 아이템 검증용으로 남겨 둠)
  function scaleBase(base, level) {
    const out = {};
    for (const [k, v] of Object.entries(base)) out[k] = Math.max(v, Math.round(v * (1 + (level - 1) * 0.2)));
    return out;
  }

  // 장비 1개 생성. source: "box" | "drop" | "boss" | "golden", level: 아이템 레벨(1 이상)
  // version: 새로 얻는 아이템은 지금 규칙(RULES_VERSION). 거래소·우편함에서 예전(v2) 아이템을 다시 만들 때만 2
  const SLOTS_V2 = SLOTS.slice(0, 6);
  // rev: 규칙 개정. 버전을 생략하면(새로 얻는 아이템) 지금 개정, 버전을 적으면(저장된 참조를 다시 만들 때) 적은 개정(없으면 0)
  function generate(seed, source, level, version, rev) {
    const latest = version === undefined;
    if (latest) version = RULES_VERSION;
    rev = rev ?? (latest ? RULES_REV : 0);
    if (version < 2 || version > 4) throw new Error(`unsupported item version ${version}`);
    if (rev !== 0 && !(rev >= 1 && rev <= RULES_REV && version === 4)) throw new Error(`unsupported item rev ${rev}`);
    const lv = Math.max(1, Math.floor(level));
    const rng = rngFrom(`v${version}|${seed}`);
    const rarity = pickWeighted(rng, tablesFor(version, rev)[source]);
    let slot, set, type = null;
    if (version === 2) {
      slot = pick(rng, SLOTS_V2);
      set = rarity === "set" ? "trial" : null;
      if (slot === "weapon") type = set ? SETS[set].weapon : pick(rng, WEAPON_TYPES_OLD);
    } else {
      slot = pick(rng, SLOTS);
      set = rarity === "set" ? pick(rng, setsFor(slot, version === 4 && rev >= 4 && NM_SEED.test(seed))) : null;
      if (slot === "weapon") type = set ? SETS[set].weapon : pick(rng, weaponTypes(version === 4 ? rev : 0));
      else if (slot === "offhand") type = set ? SETS[set].offhand : (rng() < OFFHAND.shieldChance ? "shield" : pick(rng, WEAPON_TYPES_OLD));
    }

    const item = { v: version, seed, src: source, lvl: lv, slot, type, rarity, set };
    if (rev) item.r = rev;   // 줄 범위가 개정마다 다를 수 있어서 먼저 (저항 줄 r4)

    // 주 능력치: 첫 번째는 고정, 나머지는 후보에서 무작위 (v2·v3는 무기/방어구 후보, v4는 부위별 후보)
    const pool = version >= 4 ? mainPoolV4(item) : MAIN.pool[isWeaponLike(item) ? "weapon" : "armor"];
    const [cLo, cHi] = (version >= 4 ? MAIN_V4 : MAIN).count[rarity];
    const count = Math.min(pool.length, randInt(rng, cLo, cHi));
    const rest = pool.slice(1);
    const mainStats = [pool[0]];
    while (mainStats.length < count) mainStats.push(rest.splice(Math.floor(rng() * rest.length), 1)[0]);
    item.main = mainStats.map(stat => [stat, rollRange(rng, mainRange(stat, item))]);

    // 추가 능력치: 등급별 줄 수만큼, 서로 다른 종류 (나이트메어 아이템은 속성 피해·저항도 후보)
    const nightmare = version === 4 && rev >= 3 && NM_SEED.test(seed);
    const stats = (nightmare ? STAT_KEYS_NM : version >= 4 ? STAT_KEYS_V4 : STAT_KEYS).slice();
    if (version === 4 && rev >= 6 && socketRange(item)) stats.push("socket");
    item.lines = [];
    for (let i = 0; i < RARITIES[rarity].lines; i++) {
      const stat = stats.splice(Math.floor(rng() * stats.length), 1)[0];
      item.lines.push([stat, rollRange(rng, lineRangeOf(stat, item))]);
    }
    // 방패: 패링 확률 (등급별 3가지 값 중 하나, 강화로 오르지 않음)
    if (type === "shield") item.parry = randInt(rng, ...PARRY.ranges[rarity]);

    const [h1, h2] = hashSeed(`${version}${rev ? "r" + rev : ""}|${source}|${lv}|${seed}`);
    item.id = h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
    if (rev) {
      item.r = rev;
      // 고대 굴림: (아이템 ID) 시드로 따로. 걸리면 주 능력치·추가 능력치·패링을 모두 최대치로
      if ((rarity === "legendary" || rarity === "set") && rngFrom(`anc|${item.id}`)() < ANCIENT.chance) maxOut(item);
    }
    if (nightmare) oneElementDmg(item, stats, `v${version}|${seed}`);
    item.ancient = isAncient(item);
    return item;
  }

  // 속성 피해 줄은 하나만: 가장 큰 것(같으면 먼저 붙은 것)만 남기고, 나머지 속성 피해 줄은 아직 안 붙은 다른 능력치로 다시 굴림
  // (따로 시드 el1|… 를 써서 원래 굴림 순서는 그대로 → 패링 등 다른 값은 안 바뀜). 아이템 이름의 속성(itemElement)도 그대로.
  // 고대 굴림 뒤에 고름(고대면 모두 최대치라 먼저 붙은 것 = 예전 이름의 속성), 고대면 새 줄도 최대치.
  // 개정과 상관없이 모든 나이트메어 아이템에 적용 → 예전에 얻은 아이템도 다시 만들면 바뀜 (ID는 같음)
  function oneElementDmg(item, left, seed) {
    const dmg = item.lines.map((l, i) => i).filter(i => isElementDmg(item.lines[i][0]));
    if (dmg.length < 2) return;
    let keep = dmg[0];
    for (const i of dmg) if (item.lines[i][1] > item.lines[keep][1]) keep = i;
    const maxed = isAncient(item);
    const pool = left.filter(k => !isElementDmg(k) && k !== "socket");
    const rng = rngFrom(`el1|${seed}`);
    for (const i of dmg) {
      if (i === keep) continue;
      const stat = pool.splice(Math.floor(rng() * pool.length), 1)[0], range = lineRangeOf(stat, item), v = rollRange(rng, range);
      item.lines[i] = [stat, maxed ? range[1] : v];
    }
  }

  // 모든 능력치(주·추가·패링)를 범위의 최대치로
  function maxOut(item) {
    item.main = item.main.map(([k]) => [k, mainRange(k, item)[1]]);
    item.lines = item.lines.map(([k]) => [k, lineRangeOf(k, item)[1]]);
    if (item.parry != null) item.parry = PARRY.ranges[item.rarity][1];
  }

  // ---- 고대 다시 굴리기 ----
  // unlimited: 운영자(테스트)는 횟수 제한 없이
  const canRerollAncient = (item, unlimited = false) => item.v === 4 && !!item.main && (item.rarity === "legendary" || item.rarity === "set") &&
    !item.ancient && (unlimited || (item.ar || 0) < ANCIENT_REROLL.max);
  // 나이트메어 아이템은 × NM_SHOP.priceMul (상점 가격처럼)
  const ancientRerollCost = (item) => Math.max(5, Math.round(levelPrice(SHOP.prices[item.rarity], item.lvl) * ANCIENT_REROLL.costMul / 5) * 5) * nmCostMul(item);
  // n번째 굴림이 고대인지 (1부터)
  // (횟수 상한 max는 굴릴 수 있는지(canRerollAncient)·서버 검증에서만 봄 — 운영자는 테스트로 max번 넘게 굴릴 수 있음)
  const ancientRerollHit = (item, n) => n >= 1 && rngFrom(`anc|${item.id}|re${n}`)() < ANCIENT_REROLL.chance;
  // 한 번 굴림: 아이템을 바꾸고 { ok, n }
  // sure: 운영자 테스트 — 고대가 나오는 다음 횟수까지 건너뛰어 기록 (항상 성공. 결과는 시드 그대로라 서버 검증과 맞음)
  function rerollAncient(item, sure = false) {
    let n = (item.ar || 0) + 1;
    if (sure) while (n < 100000 && !ancientRerollHit(item, n)) n++;
    const ok = ancientRerollHit(item, n);
    item.ar = n;
    if (ok) { maxOut(item); item.ancient = isAncient(item); }
    return { ok, n };
  }
  // 참조(ar)로 다시 만들 때: 마지막 굴림이 고대였으면 최대치로 (고대가 되면 더 굴리지 않으므로 마지막 굴림만 보면 됨)
  function applyAncientRerolls(item, ar) {
    if (!(ar > 0) || item.v !== 4 || !item.main || (item.rarity !== "legendary" && item.rarity !== "set")) return item;
    item.ar = ar;
    if (!item.ancient && ancientRerollHit(item, ar)) { maxOut(item); item.ancient = isAncient(item); }
    return item;
  }

  // ---- 주 능력치 / 범위 / 고대 ----
  // v1 아이템은 main 대신 base(부위 고정 기본 능력치)를 씀
  const mainStatsOf = (item) => item.main || Object.entries(item.base || {});
  // 범위를 알 수 없으면(v1의 기본 능력치) null
  function statRange(item, kind, stat) {
    if (kind === "line") return stat === "socket" ? socketRange(item) : fixedPct(item, PCT_LINE, stat) || (STATS[stat]?.line ? lineRange(stat, item.lvl) : null);
    return item.main && (MAIN.range[stat] || fixedPct(item, PCT_MAIN, stat)) ? mainRange(stat, item) : null;
  }
  // 고대: 최고 등급(레전더리·세트)이면서 모든 능력치(방패는 패링도)가 범위의 최대치 (v2 이후 아이템)
  function isAncient(item) {
    if (!item.main || (item.rarity !== "legendary" && item.rarity !== "set")) return false;
    if (item.parry != null && item.parry !== PARRY.ranges[item.rarity][1]) return false;
    return item.main.every(([k, v]) => v === mainRange(k, item)[1]) &&
      item.lines.every(([k, v]) => v === lineRangeOf(k, item)[1]);
  }

  // ---- 전설의 힘 (v4 레전더리, 세트 아님) ----
  // 완성도 = 주 능력치·추가 능력치(방패는 패링도)가 각자 범위 안에서 얼마나 높은지의 평균 (0~1, 고대 = 1)
  // 레전더리 하나마다 공격력·방어력·최대 HP +max% × c², c = (완성도 − start) / (1 − start) (start 아래는 0)
  //   → 평범한 레전더리(완성도 50% 안팎)는 그대로, 거의 완벽한 레전더리만 세트보다 좋아짐 (고대 레전더리 5부위 = 각 +12%)
  //   시뮬레이션: 나이트메어 25층 고대 레전더리 5부위가 보스 6턴·5마리 0%로 가장 고르게 강함 (+20%면 모든 세트를 압도해서 12%)
  // allRes: 모든 속성 저항도 +allRes% × c² (고대 레전더리 5부위 = +20%. 하나에 +20%면 고대 4개만으로 세 저항이 모두 75%라 저항 줄이 쓸모없어짐)
  const LEGEND = { start: 0.6, max: 12, allRes: 4 };
  function completeness(item) {
    if (!item.main) return 0;
    let sum = 0, n = 0;
    const add = ([lo, hi], v) => { sum += hi > lo ? (v - lo) / (hi - lo) : 1; n++; };
    for (const [k, v] of item.main) add(mainRange(k, item), v);
    for (const [k, v] of item.lines) add(lineRangeOf(k, item), v);
    if (item.parry != null) add(PARRY.ranges[item.rarity], item.parry);
    return n ? sum / n : 0;
  }
  // c² (0~1): 완성도 start 아래는 0, 100%(고대)면 1
  function legendCurve(item) {
    if (item.v !== 4 || item.rarity !== "legendary" || !item.main) return 0;
    const c = Math.max(0, Math.min(1, (completeness(item) - LEGEND.start) / (1 - LEGEND.start)));
    return c * c;
  }
  const legendPower = (item) => Math.round(LEGEND.max * legendCurve(item));    // 공격력·방어력·최대 HP +%
  const legendRes = (item) => Math.round(LEGEND.allRes * legendCurve(item));   // 모든 속성 저항 +%

  // 처치 1회(또는 포션 자리 1곳)의 결과: 드롭 없으면 null. kind: "normal" | "elite" | "boss"
  function rollDrop(seed, level, kind = "normal") {
    const { chance, table } = DROPS[kind];
    const rng = rngFrom(`v${RULES_VERSION}|drop?|${seed}`);
    return rng() < chance ? generate(seed, table, level) : null;
  }

  // ---- 판매 / 강화 ----
  // 판매하면 등급에 따라 강화석을 줌. 아이템 레벨이 높을수록 더 줌: × (1 + 레벨당 5%) — 120레벨 레전더리면 16 × 6.95 ≈ 111개
  const SELL_STONES = { common: 1, uncommon: 2, rare: 4, epic: 8, legendary: 16, set: 12 };
  const SELL_PER_LEVEL = 0.05;
  const sellStones = (item) => Math.max(1, Math.round(SELL_STONES[item.rarity] * (1 + SELL_PER_LEVEL * ((item.lvl || 1) - 1))));
  // 판매하면 골드도 조금 (상점 가격처럼 레벨당 10%씩, 5골드 단위. 50레벨 레전더리 약 235골드 ≈ 상점 가격의 1/10)
  const SELL_GOLD = { common: 2, uncommon: 4, rare: 8, epic: 15, legendary: 40, set: 30 };
  const sellGold = (item) => Math.max(1, levelPrice(SELL_GOLD[item.rarity] || 1, item.lvl || 1)) * (isNightmareItem(item) ? NM_SHOP.sellMul : 1);

  // +N으로 강화할 때: 강화석 N개. +4까지는 항상 성공, +5는 50%, 이후 10%p씩 낮아져 최저 5%.
  // 실패해도 장비와 강화 단계는 그대로이고 강화석만 사라짐. 강화 1단계마다 주 능력치 +10% (최소 +1, % 능력치는 2단계마다 +1)
  // +4, +6, +8, +10이 되면 추가 능력치 중 하나가 그 능력치 최대치의 50%(최소 +1)만큼 오름
  // +11·+12 (대장간 업데이트): 강화석에 골드도 듦 (enhanceGold), 성공 확률은 +10처럼 최저 5%. +12에서 추가 능력치 하나 더 오름
  const ENHANCE = { max: 12, statPerLevel: 0.1, lineSteps: [4, 6, 8, 10, 12], lineBoost: 0.5, goldFrom: 11, goldBase: 300 };
  // 나이트메어 아이템은 강화석도 × NM_SHOP.priceMul
  const enhanceCost = (to, item) => to * (item ? nmCostMul(item) : 1);
  // 강화석 종류: 나이트메어 아이템은 "악몽 강화석"(나이트메어 아이템을 판매해야 나옴)으로만 강화. 일반 아이템은 일반 강화석
  // (일반 던전에서 모아 둔 강화석으로 나이트메어 아이템을 얻자마자 +10까지 올리던 것을 막음)
  const STONE_NAMES = { stones: "강화석", nmStones: "악몽 강화석" };
  const stoneKey = (item) => (isNightmareItem(item) ? "nmStones" : "stones");
  const enhanceChance = (to) => (to <= 4 ? 1 : Math.max(0.05, 0.5 - (to - 5) * 0.1));
  // +11부터 한 번 시도할 때 드는 골드: 기본값 × (+N − 10) × 레벨 보정 (나이트메어 아이템 × NM_SHOP.priceMul). 100레벨 나이트메어 +11 약 6,000
  const enhanceGold = (to, item) => (to >= ENHANCE.goldFrom ? levelPrice(ENHANCE.goldBase * (to - 10), item.lvl || 1) * nmCostMul(item) : 0);

  // 강화 결과는 (아이템 ID, 몇 번째 시도) 시드로 정해짐 → 새로고침해도 같은 결과, 서버에서 다시 계산 가능
  function rollEnhance(item) {
    const to = (item.enh || 0) + 1;
    // 아이템이 만들어진 규칙 버전으로 (규칙이 바뀌어도 예전 아이템의 강화 결과는 그대로)
    const rng = rngFrom(`v${item.v || RULES_VERSION}|enh|${item.id}|${item.tries || 0}`);
    return { to, chance: enhanceChance(to), ok: rng() < enhanceChance(to) };
  }

  // 강화가 반영된 주 능력치 { stat: 값 }
  // 나이트메어 아이템의 힘: 주 능력치 공격력·방어력·최대 HP가 mul배 (시험의 세트 효과를 잃어도 바꿔 낄 만하게).
  // 아이템에 저장된 값(굴린 값)은 그대로이고, 효과와 화면에 보여줄 때 곱함 → 이미 가진 나이트메어 아이템도 바로 적용
  // 시뮬레이션: 고대 시험의 세트 5부위(+10)에서 방어구를 나이트메어 레전더리(+5)로 1·2·5부위 바꿔도 1층 보스에게 덜 쓰러짐
  // (세트 54% → 2·14·3%). 대신 나이트메어 몬스터가 층마다 더 세짐 (monsters.js NIGHTMARE.perFloor)
  const NM_POWER = { mul: 3, stats: ["atk", "def", "hp"] };
  // 나이트메어 아이템 비용 배율 (NM_SHOP은 상점 쪽에 있음)
  const nmCostMul = (item) => (isNightmareItem(item) ? NM_SHOP.priceMul : 1);
  const nmPower = (item, stat) => (isNightmareItem(item) && NM_POWER.stats.includes(stat) ? NM_POWER.mul : 1);

  function enhancedBase(item) {
    const n = item.enh || 0;
    const out = {};
    for (let [k, v] of mainStatsOf(item)) {
      v = Math.round(v * nmPower(item, k));
      // 저항(장검의 모든 속성 저항)은 강화로 오르지 않음 (추가 능력치의 저항 줄처럼)
      if (isResLine(k)) { out[k] = v; continue; }
      // v4 % 능력치: 2단계마다 +1%p만
      if (item.v >= 4 && STATS[k].pct) { out[k] = v + Math.floor(n / 2); continue; }
      // 최소 보장: 수치 능력치는 단계마다 +1, % 능력치(치명타·흡혈)는 2단계마다 +1
      const floor = STATS[k].pct ? Math.floor(n / 2) : n;
      out[k] = v + (n ? Math.max(floor, Math.round(v * ENHANCE.statPerLevel * n)) : 0);
    }
    return out;
  }

  // +4·6·8·10에서 추가 능력치 한 줄이 오르는 양 (v4 % 능력치는 고정 최대치의 20%, 나머지는 레벨 범위 최대치의 50%)
  function lineBoost(item, stat) {
    const fixed = fixedPct(item, PCT_LINE, stat);
    if (fixed) return Math.max(1, Math.round(fixed[1] * PCT_LINE_BOOST));
    return Math.max(1, Math.round(lineRange(stat, item.lvl)[1] * ENHANCE.lineBoost));
  }

  // 예전(v2·v3) 아이템의 % 능력치는 효과를 계산할 때 같은 등급 v4 최대치(강화로 오를 수 있는 만큼 포함)로 자름.
  // 예전엔 % 능력치가 레벨에 비례해서 깊은 층 아이템 하나로 상한을 넘었음. 아이템과 표시되는 원래 값은 그대로
  function oldCap(item, kind, stat) {
    if (!(item.v >= 2 && item.v < 4)) return null;
    const n = item.enh || 0;
    if (kind === "main") {
      const r = PCT_MAIN[stat]?.[item.rarity];
      return r ? r[1] + Math.floor(n / 2) : null;
    }
    const r = PCT_LINE[stat]?.[item.rarity];
    if (!r) return null;
    const steps = ENHANCE.lineSteps.filter(s => n >= s).length;
    return r[1] + Math.max(1, Math.round(r[1] * PCT_LINE_BOOST)) * steps;
  }
  // 효과에 실제로 쓰이는 주 능력치·추가 능력치 (예전 아이템은 위 상한 적용)
  function effectiveBase(item) {
    const out = enhancedBase(item);
    for (const k of Object.keys(out)) { const cap = oldCap(item, "main", k); if (cap != null) out[k] = Math.min(out[k], cap); }
    return out;
  }
  // r3까지 얻은 나이트메어 아이템의 저항 줄: 새 최대치(RES_R4)까지만 적용
  const oldResCap = (item, stat) => (item.v === 4 && RES_R4[stat] && (item.r || 0) < 4 ? RES_R4[stat][1] : null);
  function effectiveLines(item) {
    return enhancedLines(item).map(([k, v, plus]) => { const cap = oldCap(item, "line", k) ?? oldResCap(item, k); return [k, cap != null ? Math.min(v, cap) : v, plus]; });
  }

  // 강화가 반영된 추가 능력치 [[stat, 값, 강화로 오른 양]]. 어느 줄이 오를지는 (아이템 ID, 단계) 시드로 정해짐
  function enhancedLines(item) {
    const lines = item.lines.map(([k, v]) => [k, v, 0]);
    if (!lines.length) return lines;
    // 오를 줄: 저항 줄은 빼고 고름 (저항 줄이 없는 아이템은 예전과 똑같음)
    const can = lines.map((_, i) => i).filter(i => !isResLine(lines[i][0]) && lines[i][0] !== "socket");   // 홈도 안 오름
    for (const step of ENHANCE.lineSteps) {
      if ((item.enh || 0) < step || !can.length) break;
      const i = can[Math.floor(rngFrom(`enhline|${item.id}|${step}`)() * can.length)];
      const add = lineBoost(item, lines[i][0]);
      lines[i][1] += add;
      lines[i][2] += add;
    }
    // 속성 피해는 강화해도 한 줄 최대 11%
    for (const l of lines) if (isElementDmg(l[0]) && l[1] > ELEMENT_LINES.dmgCap) { l[2] -= l[1] - ELEMENT_LINES.dmgCap; l[1] = ELEMENT_LINES.dmgCap; }
    return lines;
  }

  // ---- 대장간 ----
  // 옵션 재련: 골드를 내고 추가 능력치 한 줄(홈 빼고)을 골라 다시 굴림. 아이템마다 할 때마다 growth배씩 비싸짐 (끝없이 골드를 쓸 곳)
  //   새 능력치는 그 아이템이 가질 수 있는 후보 중 다른 줄에 없는 것 (지금 줄의 능력치도 다시 나올 수 있음). 속성 피해 줄은 하나만 규칙 그대로
  //   고대 아이템이면 새 줄도 최대치 (고대가 풀리지 않게). 결과는 (아이템 ID, 몇 번째 재련) 시드 → 서버가 rf(고른 줄 번호 목록)로 다시 계산
  // 홈 초기화: 수수료를 내고 홈에 넣은 보석을 모두 지움 (보석은 사라짐, 홈 개수는 그대로)
  const FORGE = { reforge: { mul: 0.5, growth: 1.5 }, socketReset: { base: 500 } };
  const canReforge = (item) => item.v === 4 && !!item.main && (item.rarity === "legendary" || item.rarity === "set");
  const reforgeableLine = (item, i) => !!item.lines?.[i] && item.lines[i][0] !== "socket";
  const reforgeCost = (item) => Math.round(ancientRerollCost(item) * FORGE.reforge.mul * FORGE.reforge.growth ** (item.rf || []).length / 5) * 5;
  const socketResetCost = (item) => levelPrice(FORGE.socketReset.base, item.lvl || 1) * nmCostMul(item);
  function reforgeLine(item, i) {
    if (!canReforge(item) || !reforgeableLine(item, i)) return null;
    const n = (item.rf || []).length + 1;
    const rng = rngFrom(`rf|${item.id}|${n}`);
    const nightmare = isNightmareItem(item) && (item.r || 0) >= 3;
    const others = item.lines.filter((_, j) => j !== i).map(([k]) => k);
    const elemTaken = others.some(isElementDmg);
    const pool = (nightmare ? STAT_KEYS_NM : STAT_KEYS_V4).filter(k => !others.includes(k) && !(elemTaken && isElementDmg(k)));
    const stat = pool[Math.floor(rng() * pool.length)], range = lineRangeOf(stat, item), v = rollRange(rng, range);
    item.lines[i] = [stat, item.ancient ? range[1] : v];
    item.rf = [...(item.rf || []), i];
    item.ancient = isAncient(item);
    return item.lines[i];
  }
  // 참조(rf)로 다시 만들 때: 고른 줄 번호를 차례로 다시 재련 (고대 굴림 ar 다음에). 줄 번호가 이상하면 아이템을 바꾸지 않고 null
  // (재련은 줄 수·홈 줄 자리를 바꾸지 않아서 미리 다 확인할 수 있음 — 서버 r_apply_reforges와 같음)
  function applyReforges(item, rf) {
    if (!Array.isArray(rf) || !rf.length) return item;
    if (!canReforge(item) || !rf.every(i => Number.isInteger(i) && reforgeableLine(item, i))) return null;
    for (const i of rf) reforgeLine(item, i);
    return item;
  }

  // ---- 상점 ----
  // 보스 층(5층마다) 바로 전 층(4, 9, 14…층)의 계단 방에 열림. 보스와 싸우기 전에 장비를 갖추라고
  // 황금 고블린과 같은 등급표(레어 이상)로 6개를 진열, 골드로 구매
  // 진열 바꾸기: 상점마다 최대 3번, 비용은 바꿀 때마다 2배이고 층마다 25%씩 비싸짐
  const SHOP = {
    every: 5, slots: 6, table: "golden",  // every: 보스 간격. 상점은 그 전 층
    prices: { rare: 60, epic: 150, legendary: 400, set: 300 },
    rerolls: { max: 3, costs: [40, 80, 160], perFloor: 0.25 },
  };

  const isShopFloor = (depth) => depth % SHOP.every === SHOP.every - 1;

  // 진열품은 (판 ID, 층, 진열 바꾼 횟수, 칸 번호) 시드로 정해짐. 처음 진열(0번)은 바꾼 횟수 없이 씀
  // 나이트메어 상점: opt = { tag: "n", level: 아이템 레벨 } (시드의 층 표시가 d 대신 n, 아이템 레벨은 75 + 나이트메어 층)
  function shopStock(runId, depth, reroll = 0, opt = {}) {
    const r = reroll ? `|r${reroll}` : "";
    const tag = opt.tag || "d", level = opt.level || depth;
    return Array.from({ length: SHOP.slots }, (_, i) => generate(`${runId}|shop|${tag}${depth}${r}|s${i}`, SHOP.table, level));
  }


  // 골드 던전 완료 보상: 그 레벨 레전더리 하나를 고대 굴리기 n번 할 수 있는 골드. 나이트메어 난이도면 × NM_SHOP.priceMul
  // (= 그 레벨 나이트메어 레전더리 고대 굴리기 n번)
  const goldDungeonReward = (level, rolls, nm = false) => rolls * ancientRerollCost({ rarity: "legendary", lvl: level }) * (nm ? NM_SHOP.priceMul : 1);

  // 로비 시간 상점: 매 시간 정각(UTC 기준 시간 번호)에 진열이 바뀜. 던전 상점과 같은 등급표·가격·진열 바꾸기
  // 시드: lobby|(사람마다 다른 8글자)|h(시간 번호)[|r바꾼 횟수]|s칸 → 사람마다 진열이 다르고, 서버가 같은 아이템을 다시 만들어 검증
  // 나이트메어 기록이 있으면(nm = 나이트메어 최고 층) lobby|…|n층|h… → 나이트메어 아이템 (레벨 75 + 층, 속성 줄·악몽의 힘)
  const hourIndex = (ms = Date.now()) => Math.floor(ms / 3600000);
  const ownerTag = (owner) => hashSeed(`owner|${owner}`)[0].toString(16).padStart(8, "0");
  function lobbyShopStock(tag, hour, level, reroll = 0, nm = 0) {
    const r = reroll ? `|r${reroll}` : "", n = nm ? `|n${nm}` : "";
    return Array.from({ length: SHOP.slots }, (_, i) => generate(`lobby|${tag}${n}|h${hour}${r}|s${i}`, SHOP.table, level));
  }

  // 레벨(층)에 따른 보정: × (1 + 레벨당 10%), 5골드 단위
  const levelPrice = (base, lvl) => Math.round(base * (1 + (lvl - 1) * 0.1) / 5) * 5;
  // 나이트메어 아이템(공격력·방어력·HP ×3)은 상점 가격·진열 바꾸기·강화석·고대 굴리기 비용이 priceMul배. 나이트메어 골드 던전 보상도 같은 배율
  // sellMul: 나이트메어 아이템을 판매할 때 받는 골드 배율 (나이트메어에서 버는 골드도 처치 ×3이라 같이)
  const NM_SHOP = { priceMul: 2, sellMul: 3 };
  const shopPrice = (item) => levelPrice(SHOP.prices[item.rarity], item.lvl) * nmCostMul(item);
  // n번째(0부터) 진열 바꾸기 비용: 기본값 × (1 + 0.25 × (층 − 1)), 5골드 단위. 더 바꿀 수 없으면 null. nm: 나이트메어 아이템 상점
  const rerollCost = (depth, n, nm = false) => (n < SHOP.rerolls.max
    ? Math.round(SHOP.rerolls.costs[n] * (1 + SHOP.rerolls.perFloor * (depth - 1)) / 5) * 5 * (nm ? NM_SHOP.priceMul : 1)
    : null);

  // ---- 보석 (홈에 넣음) ----
  // 5종류 × 3등급 (조각·보석·완벽한 보석). 같은 보석 3개 = 한 등급 위 (넣을 때 가진 것을 자동으로 합치거나 쪼갬: gemPlan)
  // 무기(보조무기 포함)에 넣을 때와 방어구·방패에 넣을 때 효과가 다름. 값은 [조각, 보석, 완벽한 보석]
  const GEM_GRADES = ["조각", "보석", "완벽한 보석"];
  const GEMS = {
    ruby: { name: "루비", color: "#ff5a6e", weapon: { atkPct: [2, 4, 6] }, armor: { hpPct: [2, 4, 6] } },
    sapphire: { name: "사파이어", color: "#5aa9ff", weapon: { critDmg: [5, 10, 15] }, armor: { defPct: [2, 4, 6] } },
    emerald: { name: "에메랄드", color: "#4fd17a", weapon: { crit: [1, 2, 3] }, armor: { dmgReduce: [1, 2, 3] } },
    topaz: { name: "토파즈", color: "#ffcf5c", weapon: { gold: [5, 10, 15] }, armor: { xp: [5, 10, 15] } },
    diamond: { name: "다이아몬드", color: "#e8f4ff", weapon: { allRes: [2, 3, 4] }, armor: { allRes: [2, 3, 4] } },
  };
  const GEM_KINDS = Object.keys(GEMS);
  // 받는 피해 감소는 모두 합쳐 최대 30% (에메랄드를 방어구 홈 14개에 다 넣으면 42%라서)
  const GEM_CAPS = { dmgReduce: 30 };
  const isGem = (g) => Array.isArray(g) && !!GEMS[g[0]] && Number.isInteger(g[1]) && g[1] >= 0 && g[1] < GEM_GRADES.length;
  const gemName = (kind, grade) => grade === 0 ? `${GEMS[kind].name} 조각` : grade === 2 ? `완벽한 ${GEMS[kind].name}` : GEMS[kind].name;
  const gemPlace = (item) => (isWeaponLike(item) ? "weapon" : "armor");
  // 그 아이템에 넣으면 붙는 능력치 { stat: 값 }
  const gemEffect = (kind, grade, item) => Object.fromEntries(Object.entries(GEMS[kind][gemPlace(item)]).map(([k, v]) => [k, v[grade]]));
  // 아이템에 넣은 보석들의 능력치 합 (홈 개수까지만)
  function gemStats(item) {
    const out = {};
    for (const g of (item.gems || []).slice(0, socketCount(item))) {
      if (!isGem(g)) continue;
      for (const [k, v] of Object.entries(gemEffect(g[0], g[1], item))) out[k] = (out[k] || 0) + v;
    }
    return out;
  }
  // 보석 주머니에서 (kind, grade) 하나를 만드는 방법. have: [조각, 보석, 완벽한 보석] 개수
  // 1) 그 등급이 있으면 그대로 2) 아래 등급을 합쳐서 (높은 것부터 3:1) 3) 위 등급 하나를 쪼개서 (남은 건 돌려받음). 못 만들면 null
  // { left: 넣은 뒤 주머니, used: 쓴 개수, got: 쪼개서 생긴 개수 }
  function gemPlan(have, grade) {
    const n = [0, 1, 2].map(i => have?.[i] || 0), used = [0, 0, 0], got = [0, 0, 0];
    if (n[grade] > 0) { used[grade] = 1; n[grade]--; return { left: n, used, got }; }
    let need = 3 ** grade, low = 0;
    for (let i = 0; i < grade; i++) low += n[i] * 3 ** i;
    if (low >= need) {
      for (let i = grade - 1; i >= 0 && need > 0; i--) { const t = Math.min(n[i], Math.floor(need / 3 ** i)); n[i] -= t; used[i] += t; need -= t * 3 ** i; }
      return { left: n, used, got };
    }
    const j = [1, 2].map(d => grade + d).find(k => k < GEM_GRADES.length && n[k] > 0);
    if (j == null) return null;
    n[j]--; used[j] = 1;
    // 하나를 쪼개면 아래 등급 3개: 하나는 더 쪼개거나(넣을 등급이면 넣고) 나머지 2개는 주머니에
    for (let k = j - 1; k >= grade; k--) { got[k] += 2; n[k] += 2; }
    return { left: n, used, got };
  }
  // 보석 드롭: 장비 드롭과 따로 굴림 (반드시 떨어지지는 않음). 일반 던전은 거의 조각, 나이트메어는 높은 등급도
  const GEM_DROP = {
    chance: { normal: 0.02, elite: 0.08, boss: 0.3, golden: 0.3 },
    grades: { normal: [85, 14, 1], nightmare: [40, 45, 15] },
  };
  function rollGem(seed, kind = "normal", nightmare = false) {
    const rng = rngFrom(`gem|${seed}`);
    if (rng() >= (GEM_DROP.chance[kind] || 0)) return null;
    const gem = pick(rng, GEM_KINDS);
    const w = GEM_DROP.grades[nightmare ? "nightmare" : "normal"];
    const grade = Number(pickWeighted(rng, { 0: w[0], 1: w[1], 2: w[2] }));
    return [gem, grade];
  }

  // ---- 표시 ----
  // 나이트메어 아이템은 "악몽의 (속성)"이 붙음: 고대 +3 악몽의 불 레전더리 단검, 악몽의 레어 바지 (속성 피해 줄이 없으면 속성 이름 없이)
  function itemName(item) {
    const el = ELEMENT_LINES.names[itemElement(item)] || ELEMENT_LINES.none;
    const nm = isNightmareItem(item) ? `악몽의 ${el ? el + " " : ""}` : "";
    const plus = (item.ancient ? "고대 " : "") + (item.enh ? `+${item.enh} ` : "") + nm;
    if (item.set) return plus + SETS[item.set].pieces[item.slot];
    return `${plus}${RARITIES[item.rarity].name} ${kindName(item)}`;
  }

  function formatStat(stat, value) {
    if (stat === "socket") return `홈 ${value}개`;
    const s = STATS[stat];
    return `${s.name} +${value}${s.pct ? "%" : ""}`;
  }
  // 범위 표시: "3~7" 또는 "2~5%"
  function formatRange(stat, range) {
    if (!range) return "";
    const unit = STATS[stat].pct ? "%" : "";
    return range[0] === range[1] ? `${range[1]}${unit}` : `${range[0]}~${range[1]}${unit}`;
  }

  // 장착한 아이템들의 능력치 합계와 세트 효과
  function totals(equipped) {
    // parry: 패링 확률(최대 PARRY.max), dual: 보조 손에 무기(한 턴에 두 번 공격), splash: 주변 1칸 피해
    const sum = { atk: 0, def: 0, hp: 0, crit: 0, lifesteal: 0, gold: 0, xp: 0, killHeal: 0,
      atkPct: 0, defPct: 0, hpPct: 0, critDmg: 0, killHealPct: 0, dmgReduce: 0, parry: 0, splash: 0, dual: 0,
      legend: 0, fireball: 0, fireballPct: 0, fireballBurn: 0, nova: 0, novaPct: 0, novaSlow: 0, chain: 0, chainPct: 0, chainMax: 0,
      fireDmg: 0, iceDmg: 0, boltDmg: 0, fireRes: 0, iceRes: 0, boltRes: 0, allRes: 0 };
    const setCounts = {};
    const shieldOnly = equipped.some(isShieldOnly);
    for (const item of equipped) {
      if (!item) continue;
      if (shieldOnly && item.slot === "offhand" && isWeaponLike(item)) continue;   // 장검과 보조무기는 같이 못 씀
      for (const [k, v] of Object.entries(effectiveBase(item))) sum[k] += v;
      for (const [k, v] of effectiveLines(item)) if (k !== "socket") sum[k] += v;
      for (const [k, v] of Object.entries(gemStats(item))) sum[k] += v;
      if (item.parry) sum.parry += item.parry;
      if (item.slot === "offhand" && isWeaponLike(item)) sum.dual = 1;
      if (item.set) setCounts[item.set] = (setCounts[item.set] || 0) + 1;
      // 전설의 힘: 공격력·방어력·최대 HP +%
      const lp = legendPower(item);
      if (lp) { sum.atkPct += lp; sum.defPct += lp; sum.hpPct += lp; sum.legend += lp; }
      sum.allRes += legendRes(item);
    }
    const activeSets = [];
    for (const [id, count] of Object.entries(setCounts)) {
      const set = SETS[id];
      const active = set.bonuses.filter(b => count >= b.count);
      for (const b of active) for (const [k, v] of Object.entries(b.stats)) sum[k] += v;
      activeSets.push({ id, name: set.name, count, full: setFull(id), bonuses: set.bonuses.map(b => ({ ...b, on: count >= b.count })) });
    }
    sum.parry = Math.min(PARRY.max, sum.parry);
    sum.lifesteal = Math.min(LIFESTEAL.max, sum.lifesteal);
    sum.dmgReduce = Math.min(GEM_CAPS.dmgReduce, sum.dmgReduce);
    sum.splash = sum.splash ? 1 : 0;
    return { stats: sum, sets: activeSets };
  }

  const api = {
    RULES_VERSION, RULES_REV, ANCIENT, ANCIENT_REROLL, canRerollAncient, ancientRerollCost, ancientRerollHit, rerollAncient, applyAncientRerolls, SLOTS, SLOT_NAMES, WEAPONS, ARMOR, RARITIES, TABLES, TABLES_OLD, tablesFor, DROPS, DROP_CHANCE, DROP_CHANCE_OLD, STATS, STAT_KEYS, SETS, setsFor, FIREBALL, FROST_NOVA, CHAIN,
    OFFHAND, PARRY, DUAL_WIELD, LIFESTEAL, SPLASH, isWeaponLike, isShieldOnly, weaponTypes, kindName,
    SOCKETS, socketRange, socketCount, GEMS, GEM_KINDS, GEM_GRADES, GEM_CAPS, GEM_DROP, isGem, gemName, gemPlace, gemEffect, gemStats, gemPlan, rollGem, setsFor, setFull,
    STAT_KEYS_V4, STAT_KEYS_NM, ELEMENT_LINES, isElementDmg, isNightmareItem, itemElement, PCT_MAIN, PCT_LINE, PCT_LINE_BOOST, MAIN_V4, mainPoolV4, lineRangeOf, lineBoost, oldCap, effectiveBase, effectiveLines,
    MAIN, MAX_ROLL_CHANCE, SELL_STONES, SELL_PER_LEVEL, sellStones, SELL_GOLD, sellGold, ENHANCE, SHOP, isShopFloor,
    rngFrom, generate, rollDrop, itemName, formatStat, formatRange, totals,
    mainStatsOf, statRange, mainRange, lineRange, isAncient,
    enhanceCost, enhanceChance, enhanceGold, rollEnhance, FORGE, canReforge, reforgeableLine, reforgeCost, socketResetCost, reforgeLine, applyReforges, enhancedBase, enhancedLines, shopStock, shopPrice, rerollCost, RES_R4, isResLine, LEGEND, completeness, legendPower, legendRes, hourIndex, ownerTag, lobbyShopStock, goldDungeonReward, NM_POWER, nmPower, NM_SHOP, STONE_NAMES, stoneKey,
  };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.RLItems = api;
})(typeof self !== "undefined" ? self : this);
