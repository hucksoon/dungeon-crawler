// 몬스터 규칙: 종류, 출현 층, 정예, 보스, 황금 고블린.
// 게임(index.html), 도감, 문서 생성기(tools/gen-monster-docs.mjs)가 모두 이 파일을 읽는다.
// 브라우저(window.RLMonsters)와 Node(require) 양쪽에서 쓸 수 있게 작성.
(function (root) {
  "use strict";

  // from~until 층에서 나옴. 그 층에 나올 수 있는 종류 중 뒤(강한) 종류일수록 2배씩 자주 나옴
  const MONSTERS = [
    { id: "rat",        ch: "r", name: "쥐",          color: "#a58b6f", hp: 3,  atk: 1,  def: 0, xp: 2,  from: 1,  until: 5 },
    { id: "bat",        ch: "b", name: "박쥐",        color: "#9a9ab5", hp: 4,  atk: 2,  def: 0, xp: 3,  from: 1,  until: 6 },
    { id: "kobold",     ch: "k", name: "코볼트",      color: "#c9a26b", hp: 5,  atk: 2,  def: 0, xp: 4,  from: 2,  until: 7 },
    { id: "goblin",     ch: "g", name: "고블린",      color: "#7bce6b", hp: 6,  atk: 2,  def: 1, xp: 5,  from: 2,  until: 8 },
    { id: "skeleton",   ch: "s", name: "해골 병사",   color: "#e8e2cf", hp: 8,  atk: 3,  def: 1, xp: 7,  from: 3,  until: 10 },
    { id: "zombie",     ch: "z", name: "좀비",        color: "#8fa86b", hp: 12, atk: 3,  def: 1, xp: 8,  from: 4,  until: 11 },
    { id: "orc",        ch: "o", name: "오크",        color: "#5fae4e", hp: 10, atk: 3,  def: 1, xp: 9,  from: 4,  until: 12 },
    { id: "wolf",       ch: "w", name: "늑대",        color: "#b0b0b0", hp: 11, atk: 4,  def: 1, xp: 10, from: 5,  until: 12 },
    { id: "spider",     ch: "S", name: "거대 거미",   color: "#a0522d", hp: 13, atk: 5,  def: 2, xp: 13, from: 6,  until: 14 },
    { id: "troll",      ch: "T", name: "트롤",        color: "#9b7bce", hp: 16, atk: 5,  def: 2, xp: 16, from: 6,  until: 15 },
    { id: "harpy",      ch: "h", name: "하피",        color: "#e39bd1", hp: 14, atk: 6,  def: 2, xp: 18, from: 7,  until: 16 },
    { id: "wraith",     ch: "W", name: "망령",        color: "#7fd0e8", hp: 18, atk: 7,  def: 3, xp: 22, from: 8,  until: 18 },
    { id: "dark_knight", ch: "A", name: "암흑 기사",  color: "#6f7fa8", hp: 22, atk: 8,  def: 4, xp: 27, from: 9,  until: 20 },
    { id: "minotaur",   ch: "M", name: "미노타우로스", color: "#c8743c", hp: 28, atk: 9,  def: 4, xp: 32, from: 10, until: 22 },
    { id: "chimera",    ch: "C", name: "키메라",      color: "#d4a83c", hp: 26, atk: 10, def: 4, xp: 36, from: 11, until: 24 },
    { id: "lich",       ch: "L", name: "리치",        color: "#c27bff", hp: 24, atk: 12, def: 5, xp: 42, from: 12, until: 30 },
    { id: "fire_spirit", ch: "E", name: "화염 정령", color: "#ff8a3d", hp: 30, atk: 12, def: 6, xp: 48, from: 13, until: 34 },
    { id: "vampire",    ch: "V", name: "뱀파이어",    color: "#d23c5a", hp: 32, atk: 13, def: 6, xp: 52, from: 14, until: 38 },
    { id: "drake",      ch: "D", name: "어린 드래곤", color: "#ff6b4a", hp: 40, atk: 14, def: 7, xp: 60, from: 15, until: 42 },
    { id: "hydra",      ch: "H", name: "히드라",      color: "#3cc8a0", hp: 50, atk: 16, def: 8, xp: 75, from: 17, until: 50 },
    // 18층부터: 깊은 층을 위한 몬스터. 강해지는 건 대부분 층 보정이 맡고, 기본 능력치는 히드라 언저리에서 천천히 오름
    // (한 번에 너무 세지면 지금 깊은 층에 있는 사람이 갑자기 막히므로). 몇몇은 단단하거나(골렘·베히모스) 아프게(밴시·스펙터) 때림
    { id: "ghoul",      ch: "u", name: "구울",        color: "#9fb07a", hp: 46, atk: 15, def: 7,  xp: 78,  from: 18, until: 40 },
    { id: "basilisk",   ch: "B", name: "바실리스크",  color: "#8bc34a", hp: 50, atk: 15, def: 8,  xp: 82,  from: 20, until: 44 },
    { id: "gargoyle",   ch: "Y", name: "가고일",      color: "#8d99ae", hp: 48, atk: 15, def: 10, xp: 86,  from: 22, until: 48 },
    { id: "naga",       ch: "N", name: "나가",        color: "#26a69a", hp: 50, atk: 17, def: 7,  xp: 90,  from: 25, until: 52 },
    { id: "wyvern",     ch: "y", name: "와이번",      color: "#e07a5f", hp: 54, atk: 16, def: 8,  xp: 95,  from: 28, until: 56 },
    { id: "death_knight", ch: "X", name: "데스 나이트", color: "#7986cb", hp: 56, atk: 17, def: 9, xp: 100, from: 31, until: 60 },
    { id: "banshee",    ch: "n", name: "밴시",        color: "#b39ddb", hp: 48, atk: 19, def: 7,  xp: 105, from: 34, until: 64 },
    { id: "golem",      ch: "R", name: "바위 골렘",   color: "#a1887f", hp: 66, atk: 15, def: 11, xp: 110, from: 37, until: 68 },
    { id: "manticore",  ch: "m", name: "만티코어",    color: "#ef6c00", hp: 56, atk: 18, def: 9,  xp: 116, from: 40, until: 72 },
    { id: "frost_giant", ch: "F", name: "서리 거인",  color: "#81d4fa", hp: 62, atk: 18, def: 9,  xp: 122, from: 44, until: 78 },
    { id: "specter",    ch: "p", name: "스펙터",      color: "#cfd8dc", hp: 52, atk: 20, def: 8,  xp: 128, from: 48, until: 84 },
    { id: "demon",      ch: "U", name: "악마",        color: "#e53935", hp: 58, atk: 19, def: 9,  xp: 134, from: 52, until: 90 },
    { id: "behemoth",   ch: "Q", name: "베히모스",    color: "#8d6e63", hp: 70, atk: 17, def: 12, xp: 140, from: 56, until: 96 },
    { id: "kraken",     ch: "q", name: "크라켄",      color: "#42a5f5", hp: 62, atk: 19, def: 10, xp: 146, from: 60, until: 102 },
    { id: "phoenix",    ch: "P", name: "불사조",      color: "#ffa726", hp: 58, atk: 21, def: 9,  xp: 152, from: 65, until: 110 },
    { id: "shadow_dragon", ch: "Z", name: "그림자 드래곤", color: "#78909c", hp: 64, atk: 20, def: 10, xp: 158, from: 70 },
    { id: "archdemon",  ch: "J", name: "대악마",      color: "#c62828", hp: 64, atk: 21, def: 10, xp: 164, from: 78 },
    { id: "titan",      ch: "I", name: "타이탄",      color: "#fdd835", hp: 72, atk: 20, def: 11, xp: 170, from: 86 },
    { id: "void_lord",  ch: "v", name: "공허의 군주", color: "#9575cd", hp: 64, atk: 22, def: 10, xp: 176, from: 95 },
    { id: "ancient_dragon", ch: "d", name: "고룡",    color: "#ff5252", hp: 70, atk: 22, def: 11, xp: 185, from: 105 },
  ];

  // 층 보정: 같은 몬스터도 깊은 층일수록 강해짐. from층부터 n = 층 − from + 1 단계
  //   HP × (1 + hp × n), 공격력 × (1 + atk × n), 방어력 + 내림(def × n)
  // 몬스터가 플레이어를 때릴 때 방어력은 비율로 줄임: 피해 = 공격 × 2공격 / (2공격 + 방어력)
  const DEFENSE_K = 2;
  const FLOOR = { from: 3, hp: 0.2, atk: 0.15, def: 0.4 };
  const floorScale = (d) => {
    const n = Math.max(0, d - FLOOR.from + 1);
    return { hp: 1 + FLOOR.hp * n, atk: 1 + FLOOR.atk * n, def: Math.floor(FLOOR.def * n) };
  };

  // 방어력이 공격력과 같으면 피해 2/3, 2배면 1/2, 4배면 1/3. 방어력이 아무리 높아도 최소 1
  const damageToPlayer = (atk, def) => Math.max(1, Math.round(atk * DEFENSE_K * atk / (DEFENSE_K * atk + Math.max(0, def))));

  // 정예: 2층부터 8%, 층마다 1%p씩 올라 최대 20%
  const ELITE = { from: 2, base: 0.08, perFloor: 0.01, max: 0.2, hpMul: 2, atkMul: 1.5, defAdd: 1, xpMul: 3 };

  // 보스: 5층마다 계단 방에서 계단을 지킴. 준비된 보스를 다 지나면 마지막 보스가 5층마다 30%씩 강해짐
  const BOSS_EVERY = 5;
  // 일반 던전 최대 층: 이 층 보스를 쓰러뜨리면 완료 → 로비로, 포탈 문으로 같은 층의 새 구역에 들어가 계속 파밍
  // 아이템은 얻은 층이 레벨이라 이 층보다 강한 아이템은 나오지 않음. 그 뒤는 나이트메어 던전
  // (150층 → 75층: 끝까지 가는 시간을 1/4로 줄이고, 대신 드롭을 늘려 75층까지 예전 150층만큼 좋은 장비가 나오게 함)
  const MAX_FLOOR = 75;
  // 랭킹 기록값: 최대 층 보스까지 쓰러뜨리면 MAX_FLOOR + 1 ("75층 완료")
  const CLEAR_STAGE = MAX_FLOOR + 1;
  const BOSS_SCALE = 0.3;
  const BOSS_COLOR = "#ff5a5a";
  const BOSSES = [
    { id: "goblin_king", ch: "G", name: "고블린 왕",   hp: 45,  atk: 6,  def: 2, xp: 60 },
    { id: "ogre_chief",  ch: "O", name: "오우거 족장", hp: 90,  atk: 10, def: 4, xp: 140 },
    { id: "lich_lord",   ch: "K", name: "리치 군주",   hp: 150, atk: 15, def: 7, xp: 260 },
  ];

  // 황금 고블린: 2층부터 층마다 12% 확률로 1마리. 공격하지 않고 플레이어에게서 달아나며,
  // 처음 보인 뒤 정해진 턴이 지나면 도망침. 방어력은 그 층 몬스터 중 가장 높은 방어력 + defAdd
  // 등급: 깊은 층에서는 정예(10층부터)와 왕(30층부터)이 나옴. 더 단단하고, 더 빨리 도망치고,
  //   맞고 살아남으면 확률로 연막을 터뜨려 순간이동함. 대신 장비를 더 많이 떨어뜨림
  //   moves: [n, m] = m턴에 n번 움직임. blink: 맞았을 때 순간이동 확률, blinkRange: 순간이동 거리
  const GOLDEN = {
    id: "golden_goblin", ch: "g", name: "황금 고블린", color: "#ffd700",
    from: 2, chance: 0.2, defAdd: 2, blinkRange: [4, 7],
    // HP: 6 + 층, 또는 그 층에서 가장 튼튼한 몬스터 HP(층 보정 포함)의 절반 중 큰 쪽 (깊은 층에서 한 방에 잡히지 않게)
    hp: (d) => 6 + d,
    hpOfPool: 0.5,
    xp: (d) => 10 + d * 4,
    ranks: {
      normal: { name: "황금 고블린",      from: 2,  chance: 1,    hpMul: 1, defAdd: 0, fleeTurns: 24, moves: [1, 2], blink: 0,    drops: 2, goldMul: 1, xpMul: 1 },
      elite:  { name: "정예 황금 고블린", from: 10, chance: 0.3,  hpMul: 3, defAdd: 2, fleeTurns: 20, moves: [1, 2], blink: 0.3,  drops: 3, goldMul: 2, xpMul: 2 },
      king:   { name: "황금 고블린 왕",   from: 30, chance: 0.12, hpMul: 6, defAdd: 4, fleeTurns: 16, moves: [2, 3], blink: 0.5,  drops: 4, goldMul: 4, xpMul: 4 },
    },
  };
  // 그 층에 나올 황금 고블린 등급. 왕 → 정예 → 보통 순서로 확률을 봄 (30층부터 왕 12%, 정예 30%)
  function goldenRank(d, rand) {
    const R = GOLDEN.ranks;
    const r = rand();
    const king = d >= R.king.from ? R.king.chance : 0;
    if (r < king) return "king";
    if (d >= R.elite.from && r < king + R.elite.chance) return "elite";
    return "normal";
  }

  // 골드: 바닥의 골드 더미와 몬스터 처치로 얻음. 층이 깊을수록 많아짐 (층 배율 = 1 + 0.15 × (층 − 1))
  // 범위 [최소, 최대]에서 무작위로 정한 뒤 층 배율을 곱함. 장비의 "골드 획득 +%"는 그 위에 더해짐
  const GOLD = {
    perFloor: 0.15,
    piles: { count: [2, 4], amount: [2, 8] },
    kill: { normal: [1, 2], elite: [6, 12], boss: [50, 80], golden: [20, 30] },
  };
  const goldMultiplier = (d) => 1 + GOLD.perFloor * (d - 1);
  function rollGold(range, d, rand) {
    const [lo, hi] = range;
    return Math.round((lo + Math.floor(rand() * (hi - lo + 1))) * goldMultiplier(d));
  }

  function pool(d) {
    return MONSTERS.filter(m => d >= m.from && d <= (m.until ?? Infinity));
  }

  // 그 층의 출현 비율 [{ monster, p }]
  function spawnRates(d) {
    const list = pool(d);
    const total = 2 ** list.length - 1;
    return list.map((m, i) => ({ monster: m, p: 2 ** i / total }));
  }

  // rand: 0 이상 1 미만을 돌려주는 함수
  function pickType(d, rand) {
    let r = rand();
    const rates = spawnRates(d);
    for (const { monster, p } of rates) {
      if ((r -= p) < 0) return monster;
    }
    return rates[rates.length - 1].monster;
  }

  const eliteChance = (d) => (d < ELITE.from ? 0 : Math.min(ELITE.max, ELITE.base + (d - ELITE.from) * ELITE.perFloor));

  // d: 지금 층 (층 보정을 적용)
  function makeMonster(t, kind = "normal", d = 1) {
    const f = floorScale(d);
    const m = {
      id: t.id, ch: t.ch, name: t.name, color: t.color, kind,
      hp: Math.round(t.hp * f.hp), atk: Math.round(t.atk * f.atk), def: t.def + f.def, xp: t.xp,
    };
    if (kind === "elite") {
      Object.assign(m, {
        name: `정예 ${t.name}`,
        hp: m.hp * ELITE.hpMul,
        atk: Math.ceil(m.atk * ELITE.atkMul),
        def: m.def + ELITE.defAdd,
        xp: t.xp * ELITE.xpMul,
      });
    }
    m.maxHp = m.hp;
    return m;
  }

  const isBossFloor = (d) => d > 0 && d % BOSS_EVERY === 0;

  // 계단: 플레이어 주변 이 거리(가로 칸 + 세로 칸) 안에 몬스터가 있으면 내려갈 수 없음
  const STAIRS_BLOCK_RADIUS = 4;

  function makeBoss(d) {
    const i = d / BOSS_EVERY - 1;
    const base = BOSSES[Math.min(i, BOSSES.length - 1)];
    const scale = 1 + BOSS_SCALE * Math.max(0, i - (BOSSES.length - 1));
    // 보스도 일반 몬스터와 같은 층 보정을 받음
    const f = floorScale(d);
    const stat = (v, mul = 1) => Math.round(v * scale * mul);
    const hp = stat(base.hp, f.hp);
    return {
      id: base.id, ch: base.ch, name: base.name, color: BOSS_COLOR, kind: "boss",
      hp, maxHp: hp, atk: stat(base.atk, f.atk), def: stat(base.def) + f.def, xp: stat(base.xp),
    };
  }

  // rank: "normal" | "elite" | "king". kind는 모두 "golden" (드롭 등급표·서버 검증은 같음)
  function makeGolden(d, rank = "normal") {
    const R = GOLDEN.ranks[rank];
    const def = Math.max(0, ...pool(d).map(m => m.def)) + floorScale(d).def + GOLDEN.defAdd + R.defAdd;
    const toughest = Math.max(0, ...pool(d).map(m => m.hp)) * floorScale(d).hp;
    const hp = Math.round(Math.max(GOLDEN.hp(d), GOLDEN.hpOfPool * toughest) * R.hpMul);
    return {
      id: GOLDEN.id, ch: GOLDEN.ch, name: R.name, color: GOLDEN.color, kind: "golden", rank,
      hp, maxHp: hp, atk: 0, def, xp: Math.round(GOLDEN.xp(d) * R.xpMul),
      fleeTurns: R.fleeTurns, moves: R.moves, blink: R.blink, drops: R.drops, goldMul: R.goldMul,
    };
  }

  const api = {
    MONSTERS, FLOOR, floorScale, DEFENSE_K, damageToPlayer, ELITE, BOSSES, BOSS_EVERY, MAX_FLOOR, CLEAR_STAGE, BOSS_SCALE, BOSS_COLOR, GOLDEN, GOLD, STAIRS_BLOCK_RADIUS,
    pool, spawnRates, pickType, eliteChance, makeMonster, isBossFloor, makeBoss, makeGolden, goldenRank,
    goldMultiplier, rollGold,
  };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.RLMonsters = api;
})(typeof self !== "undefined" ? self : this);
