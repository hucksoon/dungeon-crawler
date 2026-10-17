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
  const RULES_REV = 1;
  const ANCIENT = { chance: 0.03 };

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
  // 무기처럼 쓰는 아이템: 무기 칸, 또는 보조 손의 방패가 아닌 것
  const isWeaponLike = (item) => item.slot === "weapon" || (item.slot === "offhand" && !!item.type && item.type !== "shield");
  // 아이템 종류 이름: 단검 / 보조 단검 / 방패 / 투구…
  function kindName(item) {
    if (item.slot === "offhand") return item.type === "shield" ? OFFHAND.shieldName : `${OFFHAND.weaponPrefix} ${WEAPONS[item.type].name}`;
    return item.type ? WEAPONS[item.type].name : ARMOR[item.slot].name;
  }

  // 기본 능력치는 아이템 레벨에 따라 커짐
  // base는 v1 아이템용. v2에서는 atkMul(주 능력치 공격력 배율)만 씀
  const WEAPONS = {
    dagger: { name: "단검", base: { atk: 2, crit: 6 }, atkMul: 1 },
    staff: { name: "지팡이", base: { atk: 2, hp: 6 }, atkMul: 1 },
    axe: { name: "도끼", base: { atk: 4 }, atkMul: 1.3 },
  };
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
  const TABLES = {
    box: { common: 40, uncommon: 30, rare: 18, epic: 8, legendary: 3, set: 1 },
    drop: { common: 60, uncommon: 25, rare: 10, epic: 3.5, legendary: 1, set: 0.5 },
    boss: { common: 20, uncommon: 30, rare: 28, epic: 15, legendary: 5, set: 2 },
    golden: { rare: 65, epic: 25, legendary: 7, set: 3 },  // 황금 고블린: 레어 이상만
  };
  // 장비를 떨어뜨릴 확률과 등급표. normal은 일반 몬스터와 포션 자리
  const DROPS = {
    normal: { chance: 0.08, table: "drop" },
    elite: { chance: 0.4, table: "drop" },
    boss: { chance: 1, table: "boss" },
    golden: { chance: 1, table: "golden" },  // 한 마리당 2번 굴림 (처치 순번 2개 사용)
  };
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
    splash: { name: "주변 1칸 피해", pct: false },
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
  };
  // 추가 능력치 (모든 부위). 공격력·방어력·HP는 지금처럼 레벨에 비례 (STATS[..].line)
  const PCT_LINE = {
    crit: byRarity([1, 1], [1, 2], [2, 3], [3, 4], [4, 6], [4, 5]),
    critDmg: byRarity([3, 5], [5, 7], [7, 9], [9, 12], [12, 15], [11, 14]),
    atkPct: byRarity([1, 2], [2, 3], [3, 4], [4, 6], [6, 8], [5, 7]),
    lifesteal: byRarity([1, 1], [1, 1], [1, 2], [2, 3], [3, 4], [3, 3]),
    gold: byRarity([3, 6], [5, 8], [8, 12], [12, 16], [18, 25], [15, 20]),
    xp: byRarity([3, 6], [5, 8], [8, 12], [12, 16], [18, 25], [15, 20]),
  };
  // v4 % 능력치 강화: 주 능력치는 2단계마다 +1%p (+10이면 +5), 추가 능력치는 +4·6·8·10 때 최대치의 20%(최소 +1)
  const PCT_LINE_BOOST = 0.2;
  const fixedPct = (item, table, stat) => (item.v >= 4 && table[stat] ? table[stat][item.rarity] : null);

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
    },
    // 주 능력치 줄 수 (후보 수가 상한)
    count: { common: [1, 1], uncommon: [1, 2], rare: [2, 2], epic: [2, 3], legendary: [2, 3], set: [2, 3] },
  };
  const mainPoolV4 = (item) => MAIN_V4.pool[item.slot === "offhand" ? (item.type === "shield" ? "shield" : "offhandWeapon") : item.slot];
  const scaleRange = ([lo, hi], mul) => {
    const a = Math.max(1, Math.round(lo * mul));
    return [a, Math.max(a, Math.round(hi * mul))];
  };
  function mainRange(stat, item) {
    const fixed = fixedPct(item, PCT_MAIN, stat);
    if (fixed) return fixed;
    let mul = MAIN.rarityMul[item.rarity] || 1;
    const weaponLike = isWeaponLike(item);
    if (weaponLike && stat === "atk" && item.type) mul *= WEAPONS[item.type].atkMul;
    const off = weaponLike ? stat === "hp" : (stat === "atk" || stat === "crit");
    if (off) mul *= MAIN.offSlotMul;
    return scaleRange(MAIN.range[stat](item.lvl), mul);
  }
  const lineRange = (stat, lv) => STATS[stat].line(lv);
  // 그 아이템의 추가 능력치 범위 (v4 % 능력치는 등급별 고정)
  const lineRangeOf = (stat, item) => fixedPct(item, PCT_LINE, stat) || lineRange(stat, item.lvl);
  // 최대치 20%, 그 외에는 최소 ~ (최대 − 1)
  function rollRange(rng, [lo, hi]) {
    if (hi <= lo || rng() < MAX_ROLL_CHANCE) return hi;
    return randInt(rng, lo, hi - 1);
  }

  // ---- 세트 ----
  // 시험의 세트: 2·4·5개를 입을 때마다 효과가 하나씩 켜짐 (6부위 중 아무거나 5개면 전부 켜짐 → 무기는 자유롭게 고를 수 있음)
  // 광란의 세트: 오른손·왼손 무기 2개 → 때린 적 주변 1칸의 적도 같은 피해
  // 견고의 세트: 무기·방패 2개 → 패링 확률 +15% (방패 최대 25%와 합쳐 최대 40%)
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
        { count: 4, text: "공격력 +25%, 치명타 확률 +10%", stats: { atkPct: 25, crit: 10 } },
        { count: 5, text: "치명타 피해 +100%, 흡혈 +8%, 적을 쓰러뜨리면 최대 HP의 15% 회복", stats: { critDmg: 100, lifesteal: 8, killHealPct: 15 } },
      ],
    },
    frenzy: {
      name: "광란의 세트",
      weapon: "dagger", offhand: "dagger",
      pieces: { weapon: "광란의 오른손무기", offhand: "광란의 왼손무기" },
      bonuses: [
        { count: 2, text: "공격하면 대상 주변 1칸의 적도 같은 피해를 입어요", stats: { splash: 1 } },
      ],
    },
    sturdy: {
      name: "견고의 세트",
      weapon: "axe", offhand: "shield",
      pieces: { weapon: "견고의 도끼", offhand: "견고의 방패" },
      bonuses: [
        { count: 2, text: "패링 확률 +15% (방패와 합쳐 최대 40%)", stats: { parry: 15 } },
      ],
    },
  };
  // 그 부위로 나올 수 있는 세트 (정해진 순서: trial, frenzy, sturdy)
  const setsFor = (slot) => Object.keys(SETS).filter(id => SETS[id].pieces[slot]);
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
    if (rev !== 0 && !(rev === 1 && version === 4)) throw new Error(`unsupported item rev ${rev}`);
    const lv = Math.max(1, Math.floor(level));
    const rng = rngFrom(`v${version}|${seed}`);
    const rarity = pickWeighted(rng, TABLES[source]);
    let slot, set, type = null;
    if (version === 2) {
      slot = pick(rng, SLOTS_V2);
      set = rarity === "set" ? "trial" : null;
      if (slot === "weapon") type = set ? SETS[set].weapon : pick(rng, Object.keys(WEAPONS));
    } else {
      slot = pick(rng, SLOTS);
      set = rarity === "set" ? pick(rng, setsFor(slot)) : null;
      if (slot === "weapon") type = set ? SETS[set].weapon : pick(rng, Object.keys(WEAPONS));
      else if (slot === "offhand") type = set ? SETS[set].offhand : (rng() < OFFHAND.shieldChance ? "shield" : pick(rng, Object.keys(WEAPONS)));
    }

    const item = { v: version, seed, src: source, lvl: lv, slot, type, rarity, set };

    // 주 능력치: 첫 번째는 고정, 나머지는 후보에서 무작위 (v2·v3는 무기/방어구 후보, v4는 부위별 후보)
    const pool = version >= 4 ? mainPoolV4(item) : MAIN.pool[isWeaponLike(item) ? "weapon" : "armor"];
    const [cLo, cHi] = (version >= 4 ? MAIN_V4 : MAIN).count[rarity];
    const count = Math.min(pool.length, randInt(rng, cLo, cHi));
    const rest = pool.slice(1);
    const mainStats = [pool[0]];
    while (mainStats.length < count) mainStats.push(rest.splice(Math.floor(rng() * rest.length), 1)[0]);
    item.main = mainStats.map(stat => [stat, rollRange(rng, mainRange(stat, item))]);

    // 추가 능력치: 등급별 줄 수만큼, 서로 다른 종류
    const stats = (version >= 4 ? STAT_KEYS_V4 : STAT_KEYS).slice();
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
      if ((rarity === "legendary" || rarity === "set") && rngFrom(`anc|${item.id}`)() < ANCIENT.chance) {
        item.main = item.main.map(([k]) => [k, mainRange(k, item)[1]]);
        item.lines = item.lines.map(([k]) => [k, lineRangeOf(k, item)[1]]);
        if (item.parry != null) item.parry = PARRY.ranges[rarity][1];
      }
    }
    item.ancient = isAncient(item);
    return item;
  }

  // ---- 주 능력치 / 범위 / 고대 ----
  // v1 아이템은 main 대신 base(부위 고정 기본 능력치)를 씀
  const mainStatsOf = (item) => item.main || Object.entries(item.base || {});
  // 범위를 알 수 없으면(v1의 기본 능력치) null
  function statRange(item, kind, stat) {
    if (kind === "line") return fixedPct(item, PCT_LINE, stat) || (STATS[stat]?.line ? lineRange(stat, item.lvl) : null);
    return item.main && (MAIN.range[stat] || fixedPct(item, PCT_MAIN, stat)) ? mainRange(stat, item) : null;
  }
  // 고대: 최고 등급(레전더리·세트)이면서 모든 능력치(방패는 패링도)가 범위의 최대치 (v2 이후 아이템)
  function isAncient(item) {
    if (!item.main || (item.rarity !== "legendary" && item.rarity !== "set")) return false;
    if (item.parry != null && item.parry !== PARRY.ranges[item.rarity][1]) return false;
    return item.main.every(([k, v]) => v === mainRange(k, item)[1]) &&
      item.lines.every(([k, v]) => v === lineRangeOf(k, item)[1]);
  }

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

  // +N으로 강화할 때: 강화석 N개. +4까지는 항상 성공, +5는 50%, 이후 10%p씩 낮아져 최저 5%.
  // 실패해도 장비와 강화 단계는 그대로이고 강화석만 사라짐. 강화 1단계마다 주 능력치 +10% (최소 +1, % 능력치는 2단계마다 +1)
  // +4, +6, +8, +10이 되면 추가 능력치 중 하나가 그 능력치 최대치의 50%(최소 +1)만큼 오름
  const ENHANCE = { max: 10, statPerLevel: 0.1, lineSteps: [4, 6, 8, 10], lineBoost: 0.5 };
  const enhanceCost = (to) => to;
  const enhanceChance = (to) => (to <= 4 ? 1 : Math.max(0.05, 0.5 - (to - 5) * 0.1));

  // 강화 결과는 (아이템 ID, 몇 번째 시도) 시드로 정해짐 → 새로고침해도 같은 결과, 서버에서 다시 계산 가능
  function rollEnhance(item) {
    const to = (item.enh || 0) + 1;
    // 아이템이 만들어진 규칙 버전으로 (규칙이 바뀌어도 예전 아이템의 강화 결과는 그대로)
    const rng = rngFrom(`v${item.v || RULES_VERSION}|enh|${item.id}|${item.tries || 0}`);
    return { to, chance: enhanceChance(to), ok: rng() < enhanceChance(to) };
  }

  // 강화가 반영된 주 능력치 { stat: 값 }
  function enhancedBase(item) {
    const n = item.enh || 0;
    const out = {};
    for (const [k, v] of mainStatsOf(item)) {
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
  function effectiveLines(item) {
    return enhancedLines(item).map(([k, v, plus]) => { const cap = oldCap(item, "line", k); return [k, cap != null ? Math.min(v, cap) : v, plus]; });
  }

  // 강화가 반영된 추가 능력치 [[stat, 값, 강화로 오른 양]]. 어느 줄이 오를지는 (아이템 ID, 단계) 시드로 정해짐
  function enhancedLines(item) {
    const lines = item.lines.map(([k, v]) => [k, v, 0]);
    if (!lines.length) return lines;
    for (const step of ENHANCE.lineSteps) {
      if ((item.enh || 0) < step) break;
      const i = Math.floor(rngFrom(`enhline|${item.id}|${step}`)() * lines.length);
      const add = lineBoost(item, lines[i][0]);
      lines[i][1] += add;
      lines[i][2] += add;
    }
    return lines;
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
  function shopStock(runId, depth, reroll = 0) {
    const r = reroll ? `|r${reroll}` : "";
    return Array.from({ length: SHOP.slots }, (_, i) => generate(`${runId}|shop|d${depth}${r}|s${i}`, SHOP.table, depth));
  }

  // 레벨(층)에 따른 보정: × (1 + 레벨당 10%), 5골드 단위
  const levelPrice = (base, lvl) => Math.round(base * (1 + (lvl - 1) * 0.1) / 5) * 5;
  const shopPrice = (item) => levelPrice(SHOP.prices[item.rarity], item.lvl);
  // n번째(0부터) 진열 바꾸기 비용: 기본값 × (1 + 0.25 × (층 − 1)), 5골드 단위. 더 바꿀 수 없으면 null
  const rerollCost = (depth, n) => (n < SHOP.rerolls.max
    ? Math.round(SHOP.rerolls.costs[n] * (1 + SHOP.rerolls.perFloor * (depth - 1)) / 5) * 5
    : null);

  // ---- 표시 ----
  function itemName(item) {
    const plus = (item.ancient ? "고대 " : "") + (item.enh ? `+${item.enh} ` : "");
    if (item.set) return plus + SETS[item.set].pieces[item.slot];
    return `${plus}${RARITIES[item.rarity].name} ${kindName(item)}`;
  }

  function formatStat(stat, value) {
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
      atkPct: 0, defPct: 0, hpPct: 0, critDmg: 0, killHealPct: 0, parry: 0, splash: 0, dual: 0 };
    const setCounts = {};
    for (const item of equipped) {
      if (!item) continue;
      for (const [k, v] of Object.entries(effectiveBase(item))) sum[k] += v;
      for (const [k, v] of effectiveLines(item)) sum[k] += v;
      if (item.parry) sum.parry += item.parry;
      if (item.slot === "offhand" && isWeaponLike(item)) sum.dual = 1;
      if (item.set) setCounts[item.set] = (setCounts[item.set] || 0) + 1;
    }
    const activeSets = [];
    for (const [id, count] of Object.entries(setCounts)) {
      const set = SETS[id];
      const active = set.bonuses.filter(b => count >= b.count);
      for (const b of active) for (const [k, v] of Object.entries(b.stats)) sum[k] += v;
      activeSets.push({ id, name: set.name, count, full: setFull(id), bonuses: set.bonuses.map(b => ({ ...b, on: count >= b.count })) });
    }
    sum.parry = Math.min(PARRY.max, sum.parry);
    sum.splash = sum.splash ? 1 : 0;
    return { stats: sum, sets: activeSets };
  }

  const api = {
    RULES_VERSION, RULES_REV, ANCIENT, SLOTS, SLOT_NAMES, WEAPONS, ARMOR, RARITIES, TABLES, DROPS, DROP_CHANCE, STATS, STAT_KEYS, SETS,
    OFFHAND, PARRY, DUAL_WIELD, isWeaponLike, kindName, setsFor, setFull,
    STAT_KEYS_V4, PCT_MAIN, PCT_LINE, PCT_LINE_BOOST, MAIN_V4, mainPoolV4, lineRangeOf, lineBoost, oldCap, effectiveBase, effectiveLines,
    MAIN, MAX_ROLL_CHANCE, SELL_STONES, SELL_PER_LEVEL, sellStones, ENHANCE, SHOP, isShopFloor,
    rngFrom, generate, rollDrop, itemName, formatStat, formatRange, totals,
    mainStatsOf, statRange, mainRange, lineRange, isAncient,
    enhanceCost, enhanceChance, rollEnhance, enhancedBase, enhancedLines, shopStock, shopPrice, rerollCost,
  };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.RLItems = api;
})(typeof self !== "undefined" ? self : this);
