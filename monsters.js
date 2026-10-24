// 몬스터 규칙: 종류, 출현 층, 정예, 보스, 황금 고블린.
// 게임(index.html), 도감, 문서 생성기(tools/gen-monster-docs.mjs)가 모두 이 파일을 읽는다.
// 브라우저(window.RLMonsters)와 Node(require) 양쪽에서 쓸 수 있게 작성.
(function (root) {
  "use strict";

  // 다국어 (i18n.js가 있으면 그 언어, 없으면 한국어 원문)
  const I18N = () => (root && root.RLI18N) || (typeof globalThis !== "undefined" && globalThis.RLI18N) || null;
  const tx = (key, ko, ...a) => { const L = I18N(); return L ? L.tx(key, ko, ...a) : (typeof ko === "function" ? ko(...a) : ko); };

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
  // 골드 던전 (일반 던전 완료 후, 로비 나이트메어 옆): 75층과 같은 몬스터·보스가 있는 한 층.
  // 보스를 쓰러뜨리고 계단을 밟으면 완료 보상 = 75레벨 레전더리 고대 굴리기 rewardRolls번 비용 (items.js에서 계산)
  // 장비·보물·황금 고블린은 나오지 않음. presence: 접속자 목록에 보내는 층 번호 (2000 + 층)
  const GOLD_DUNGEON = { floor: MAX_FLOOR, rewardRolls: 20, presence: 2000 };
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
        name: tx("mon.elite", (n) => `정예 ${n}`, t.name),
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

  // ---- 나이트메어 던전: 일반 던전(최대 층)을 완료하고 v4 이후 장비만 낀 사람이 들어가는 50층 던전 ----
  // 몬스터 = 최대 층(75층) 몬스터 × 배율 × 층 배율. 아이템 레벨 = 75 + 나이트메어 층 (76~125)
  // 층 배율 = 1 + 2% × (층 − 1) + 0.3% × (층 − 1)²: 앞쪽 층은 천천히, 깊을수록 가파르게 (5층 ×1.13, 10층 ×1.42, 25층 ×3.2, 50층 ×9.2)
  // 배율은 시뮬레이션으로 맞춤 (나이트메어 아이템 공격력·방어력·HP ×3, items.js NM_POWER와 함께):
  //   보통 나이트메어 장비(1~5층에서 얻은 것 중 부위별로 고름, +4)로 5층 보스를 잡을 수 있게 (무기가 괜찮으면 쓰러질 확률 0%)
  //   잘 맞춘 장비(+10)는 40층까지 꾸준히, 50층에서 벽 (보스 4%, 몬스터 3마리 21%)
  //   예전(일반 ×1.6·HP ×4, 보스 공격 ×1.1·HP ×2.5, 층마다 9%)은 보통 장비로 1층 보스에게도 거의 쓰러졌음
  // 몬스터에 속성이 붙으면서(3단계) 일반·정예 공격 배율 2 → 1.6: 75층 장비로 들어가도 한 층 포션이 속성 전과 비슷하게(약 4~6개).
  // 보스 공격 1.3 → 1.1: 포션을 마시는 데 한 턴이 드는 것까지 넣고 다시 보니 1층 보스에게 3번 중 1번 쓰러짐 → 1.1이면 4%, 50층 9%
  const NIGHTMARE = {
    floors: 50, perFloor: 0.02, perFloor2: 0.003, base: MAX_FLOOR, itemBase: MAX_FLOOR,
    // 공격력만 층 배율의 제곱 항을 낮게 (HP는 perFloor2 그대로): 40층 ×6.3 → ×4.8, 50층 ×9.2 → ×6.8
    // 장비는 아이템 레벨만큼만(완만하게) 강해져서, 고대 장비로도 40층에서 몰려오는 몬스터에게 100% 쓰러졌음 (시뮬레이션)
    atkPerFloor2: 0.002,
    // 한 층 몬스터 수: 1층 20마리에서 4층마다 3마리씩 늘어 41층부터 50마리 (±3)
    // 처음부터 50마리면 시작 6칸 안에 평균 9마리가 있어서 들어가자마자 둘러싸였음
    monsters: { start: 20, perFloor: 0.75, max: 50, spread: 3 },
    // dc#54: 방어력이 올라가면 내 피해가 약 4% 줄고, 한 번에 덜 때리는 만큼 흡혈도 덜 들어옴 → HP × 0.96·공격력 × 0.98로 맞춤
    //   (2.5·1.0·1.5·0.6 → 2.4·0.98·1.44·0.588). 시뮬레이션: 나이트메어 50층 추천 27% → 26%, 헬 50층 레전더리 15% → 13%, 턴은 그대로
    //   헬 몬스터도 이걸 바탕으로 만들어서 같이 바뀜
    hp: 2.4, atk: 0.98, bossHp: 1.44, bossAtk: 0.588,
    // 방어력 (dc#54): 일반 75층 방어력(약 40)에 × def × 공격력 층 배율 → 플레이어 공격력의 약 10% (전에는 40으로 멈춰 있어서 거의 소용없었음)
    def: 1.8,
    // 골드 배율: 몬스터 처치(보스·황금 고블린 포함) ×3, 바닥의 골드 더미($) ×8
    // 예전에는 한 층 몬스터가 일반 75층보다 적어서 나이트메어 한 층 골드(약 1,000~4,600)가 75층 한 층(약 5,300)보다 적었음
    // → 1층 약 3,900, 10층 7,700, 25층 10,700, 50층 15,300, 1~50층 합계 약 42만 (일반 1~75층 한 번 약 13만)
    // floor: 층 돌파 보상 — 계단을 밟아 다음 층으로 갈 때(50층은 완료할 때) 그 층 나이트메어 레전더리 상점 가격 × floor
    //   (몬스터가 적은 앞쪽 층도 확실히 모이게: 1층 약 5,100 ~ 50층 약 8,000. 5층 보스까지 누적 약 4만 9천)
    gold: { kill: 3, pile: 8, floor: 0.75 },
    clearStage: 51,     // 랭킹 기록값: 50층 보스까지 쓰러뜨리면 51 ("50층 완료")
    presence: 1000,     // 로비 접속자 목록에 보내는 층: 1000 + 나이트메어 층 (일반 층과 구분)
  };
  // 둘러싸임 방어: 플레이어 주변 8칸에 몬스터가 from마리 이상 붙어 있으면 받는 피해(방어력으로 줄어든 뒤) −per × (수 − from + 1), 최대 max
  // (3마리 −8% … 8마리 −40%). 몬스터가 계속 몰려오면 흡혈·포션으로 버틸 수 없어서 고대 장비로도 나이트메어 40층에서 쓰러졌음
  const CROWD = { from: 3, per: 0.08, max: 0.4 };
  const crowdCut = (n) => (n >= CROWD.from ? Math.min(CROWD.max, (n - CROWD.from + 1) * CROWD.per) : 0);

  // ---- 속성: 불·얼음·번개 ----
  // 나이트메어 몬스터·보스는 속성을 하나씩 가짐. 플레이어는 나이트메어 아이템의 속성 피해(items.js ELEMENT_LINES)로 같은 효과를 냄
  // 불: 맞으면 화상 — 10턴 동안 2턴마다 1/10 피해. 다시 맞으면 남은 횟수만 처음으로(갱신, 2턴 박자는 그대로)
  // 얼음: 맞으면 25% 확률로 4턴 동안 느려짐(2턴에 한 번만 행동). 풀리면 4턴 동안은 다시 안 걸림. 얼음 저항은 걸릴 확률을 줄임
  // 번개: 플레이어의 번개는 맞은 몬스터에서 가까운 몬스터 2마리에게 차례로 튕김(공격력 × 1/3, 한 마리에 한 번).
  //       몬스터의 번개는 플레이어에게 한 번 더 튕겨서 2번 맞음 (두 번째는 1/3 피해, 번개 저항으로 줄어듦)
  // 피해의 기준: 플레이어가 걸면 플레이어 공격력, 몬스터가 걸면 그 공격이 실제로 들어간 피해(방어력으로 줄어든 뒤).
  //   몬스터 공격력 그대로면 방어력을 무시해서 너무 아팠음 (시뮬레이션: 입장 장비로 한 층 포션 4개 → 17개)
  // 저항은 화상·튕김 피해와 얼음 확률을 줄이고, 속성마다 최대 75%
  const ELEMENTS = {
    list: ["fire", "ice", "bolt"],
    names: { fire: "불", ice: "얼음", bolt: "번개" },
    prefix: { fire: "불꽃", ice: "서리", bolt: "번개" },    // 몬스터 이름 앞에: 악몽의 불꽃 대악마
    colors: { fire: "#ff7a3d", ice: "#6fd3ff", bolt: "#ffe14d" },
    burn: { ticks: 5, every: 2, mul: 0.1 },
    ice: { chance: 0.25, turns: 4, immune: 4 },
    bolt: { mul: 1 / 3, jumps: 2, range: 3 },
    resCap: 75,
    // 던전마다 내 속성 저항 감소 (dc#54): 장비 저항 합에서 먼저 빼고, 그 뒤 최대치(75%). 저항 줄을 더 모아야 최대치에 닿음
    //   (전에는 최대치로 자른 뒤 헬만 −10 → 저항이 넘쳐서(나이트메어 추천 장비 합 111%, 헬 130~158%) 파밍할 이유가 없었음)
    zonePenalty: { normal: 0, nightmare: 40, hell: 70 },
  };
  // 그 던전에서의 내 속성 저항: min(최대치, 장비 저항 합 − 던전 감소)
  const playerRes = (raw, cap, zone) => Math.min(cap, raw - (ELEMENTS.zonePenalty[zone] || 0));
  const pickElement = (rand) => ELEMENTS.list[Math.floor(rand() * ELEMENTS.list.length)];
  // 나이트메어·헬 몬스터 이름: 악몽의 (불꽃) 대악마 / 지옥의 (서리) 고블린 왕. base = 정예까지 붙은 원래 이름
  const zoneName = (zone, el, base) => tx("mon.zone", (z, p, b) => `${z} ${p ? p + " " : ""}${b}`,
    zone === "hell" ? tx("mon.hell", "지옥의") : tx("mon.nm", "악몽의"), el ? ELEMENTS.prefix[el] : "", base);
  const withElement = (m, el) => ({ ...m, name: zoneName(m.hell ? "hell" : "nm", el, m.base), ...(el ? { el } : {}) });

  const nmMonsterCount = (n) => Math.min(NIGHTMARE.monsters.max, Math.floor(NIGHTMARE.monsters.start + NIGHTMARE.monsters.perFloor * (Math.max(1, n) - 1)));
  const nmScale = (n) => { const k = Math.max(1, n) - 1; return 1 + NIGHTMARE.perFloor * k + (NIGHTMARE.perFloor2 || 0) * k * k; };
  const nmAtkScale = (n) => { const k = Math.max(1, n) - 1; return 1 + NIGHTMARE.perFloor * k + NIGHTMARE.atkPerFloor2 * k * k; };
  // 75층에 나오는 몬스터 + 그 뒤에 나오는 몬스터(대악마·타이탄·공허의 군주·고룡). 뒤쪽일수록 자주
  const nightmarePool = () => MONSTERS.filter(m => (m.until ?? Infinity) >= NIGHTMARE.base);
  function pickNightmareType(rand) {
    const list = nightmarePool(), total = 2 ** list.length - 1;
    let r = rand() * total;
    for (let i = 0; i < list.length; i++) if ((r -= 2 ** i) < 0) return list[i];
    return list[list.length - 1];
  }
  // el: 속성 ("fire" | "ice" | "bolt", 없으면 속성 없음)
  function makeNightmare(t, kind, n, el = null) {
    const m = makeMonster(t, kind, NIGHTMARE.base), k = nmScale(n);
    const hp = Math.round(m.hp * NIGHTMARE.hp * k);
    return withElement({ ...m, base: m.name, hp, maxHp: hp, atk: Math.round(m.atk * NIGHTMARE.atk * nmAtkScale(n)), def: Math.round(m.def * NIGHTMARE.def * nmAtkScale(n)), nm: 1 }, el);
  }
  function makeNightmareBoss(n, el = null) {
    const b = makeBoss(NIGHTMARE.base), k = nmScale(n);
    const hp = Math.round(b.hp * NIGHTMARE.bossHp * k);
    return withElement({ ...b, base: b.name, hp, maxHp: hp, atk: Math.round(b.atk * NIGHTMARE.bossAtk * nmAtkScale(n)), def: Math.round(b.def * NIGHTMARE.def * nmAtkScale(n)), nm: 1 }, el);
  }

  // ---- 헬 던전: 나이트메어를 완료한 사람이 들어가는 마지막 50층 던전 (최종 목적지) ----
  // 몬스터 = 나이트메어 startNm층 몬스터 × 배율 × 층 배율 (나이트메어와 같은 모양의 곡선). 아이템 레벨 = 125 + 헬 층 (126~175, "지옥의" 아이템)
  // 모든 몬스터가 속성과 속성 저항을 가짐: 자기 속성 own%, 다른 속성은 층에 따라 otherFrom% → otherTo%, 보스는 +boss%
  // 헬에서는 플레이어의 속성 저항도 ELEMENTS.zonePenalty.hell%p 낮아짐 (장비 저항 합에서 먼저). 10·20·30·40·50층 보스는 네임드 (아래 NAMED)
  const HELL = {
    floors: 50, itemBase: NIGHTMARE.itemBase + NIGHTMARE.floors, startNm: NIGHTMARE.floors,
    // 층 배율: 나이트메어 곡선(50층 ×9.2) 그대로면 지옥의 장비가 따라가지 못해 헬 25층에서 고대 +10도 몰려오는 몬스터에게 100% 쓰러짐
    //   → 완만하게. 처음(0.017 / 0.0003 / 0.00023, 50층 ×2.55)은 40층부터 가팔라서 줄 품질 90% 장비가 40층 48% → 50층 99%
    //   → 4단계: 앞을 조금 올리고 뒤를 낮춤 (50층 HP ×2.32·공격 ×2.15). 시뮬레이션 (그 층 추천 조합 +10, 몰려오는 20마리, 줄 품질 90 · 95 · 100%):
    //   30층 4 · 0 · 0%, 40층 25 · 6 · 0%, 50층 42 · 23 · 3% (유니크·룬워드로 넘는 벽)
    //   → 장신구 3단계(세 힘 빼고 장신구 3칸) 뒤 줄 품질 95%가 헬 50층 13% / 14%로 쉬워져서, 공격력 제곱 항만 0.00003 → 0.00005 (50층 공격 ×2.15 → ×2.20)
    //     예전 목표(95% 약 20% / 25%)로. 고대는 7% / 14% → 12% / 13%, 30층 이하는 거의 그대로
    perFloor: 0.022, perFloor2: 0.0001, atkPerFloor2: 0.00005,
    hp: 1.0, atk: 1.0, bossHp: 1.0, bossAtk: 1.0,
    // 입구: 1~until층 몬스터 HP·공격 × mul. 나이트메어 장비(악몽의 힘 ×3)로 들어오는 층이라, 그대로면 나이트메어 50층보다 어려웠음
    //   (줄 품질 95% 장비로 몰려오는 20마리 48% vs 나이트메어 50층 37%). 5층 보스부터 지옥의 장비(×5)가 나와서 그 뒤로는 그대로
    entry: { until: 4, mul: 0.9 },
    monsters: NIGHTMARE.monsters,
    res: { own: 50, otherFrom: 10, otherTo: 40, boss: 10 },
    gold: { kill: 5, pile: 12, floor: 0.75 },
    milestones: [10, 20, 30, 40, 50],   // 완료하면 로비 오른쪽 문으로 골라서 들어갈 수 있는 층
    clearStage: 51,
    presence: 3000,     // 로비 접속자 목록: 3000 + 헬 층 (골드 던전 2000번대와 구분)
  };
  const hellScale = (n) => { const k = Math.max(1, n) - 1; return 1 + HELL.perFloor * k + HELL.perFloor2 * k * k; };
  const hellAtkScale = (n) => { const k = Math.max(1, n) - 1; return 1 + HELL.perFloor * k + HELL.atkPerFloor2 * k * k; };
  // 헬 몬스터의 속성 저항 { fire, ice, bolt }
  function hellRes(n, el, boss = false) {
    const other = Math.round(HELL.res.otherFrom + (HELL.res.otherTo - HELL.res.otherFrom) * (Math.max(1, Math.min(HELL.floors, n)) - 1) / (HELL.floors - 1));
    const add = boss ? HELL.res.boss : 0;
    return Object.fromEntries(ELEMENTS.list.map(k => [k, (k === el ? HELL.res.own : other) + add]));
  }
  const toHell = (m, n, el, boss) => ({ ...m, name: zoneName("hell", m.el || null, m.base), nm: 0, hell: 1, res: hellRes(n, el, boss) });
  function makeHell(t, kind, n, el = pickElement(Math.random)) {
    const m = makeNightmare(t, kind, HELL.startNm, el), e = n <= HELL.entry.until ? HELL.entry.mul : 1;
    const hp = Math.round(m.hp * HELL.hp * hellScale(n) * e);
    return toHell({ ...m, hp, maxHp: hp, atk: Math.round(m.atk * HELL.atk * hellAtkScale(n) * e), def: Math.round(m.def * hellAtkScale(n) * e) }, n, el, false);
  }
  function makeHellBoss(n, el = pickElement(Math.random)) {
    const b = makeNightmareBoss(HELL.startNm, el);
    const hp = Math.round(b.hp * HELL.bossHp * hellScale(n));
    return toHell({ ...b, hp, maxHp: hp, atk: Math.round(b.atk * HELL.bossAtk * hellAtkScale(n)), def: Math.round(b.def * hellAtkScale(n)) }, n, el, true);
  }

  // ---- 헬 네임드 보스: 10·20·30·40·50층 보스 자리에 나옴 (헬 보스 × hpMul·atkMul, 보스 속성 저항) ----
  // atkMul은 시뮬레이션으로 하나씩 (그 층 추천 조합 +10, 1:1): 줄 품질 95% 장비로 10층 3% · 20층 11% · 30층 16% · 40층 15% · 50층 30%
  //   (고대면 1~7%, 90%면 22~57%). 처음(3단계)에는 고대 기준이라 줄 품질 90%가 49~97% 쓰러졌음
  // 쓰러뜨리면 룬 runes개 (RLItems.rollRunes). 패턴은 index.html 전투에서:
  //   shred  불가사리: 공격이 들어갈 때마다 내 방어력 −per% (최대 max%, 이 층을 떠나거나 쓰러뜨리면 풀림)
  //   clones 구미호: HP가 at 이하로 처음 내려가면 분신 count마리 (HP = 구미호 최대 HP × hp, 공격 × atk, 장비·골드 없음)
  //   sweep  이무기: every턴마다 보통 공격 대신 꼬리 휩쓸기 — radius칸 안이면 공격 × mul, 방패로 막을 수 없음
  //   reaper 저승사자: 한 번 보면 쓰러뜨릴 때까지 포탈 불가, 내 흡혈(스킬 흡혈 포함) × lifesteal
  //   judge  염라대왕: every턴마다 속성이 불 → 얼음 → 번개로 바뀜 (속성 저항도 따라 바뀜), HP enrageAt 이하면 공격 × enrageMul
  const NAMED_COLOR = "#ff4fd8";
  const NAMED = {
    runes: 2,
    bosses: {
      10: { id: "bulgasari", ch: "B", name: "불가사리", title: "쇠를 먹는 괴수", el: "fire", hpMul: 3, atkMul: 3.1, pattern: "shred", shred: { per: 5, max: 25 } },
      20: { id: "gumiho", ch: "F", name: "구미호", title: "아홉 꼬리 여우", el: "ice", hpMul: 3, atkMul: 1.9, pattern: "clones", clones: { at: 0.5, count: 2, hp: 0.15, atk: 0.6 } },
      30: { id: "imugi", ch: "S", name: "이무기", title: "용이 되지 못한 뱀", el: "bolt", hpMul: 3, atkMul: 2.15, pattern: "sweep", sweep: { every: 3, radius: 2, mul: 1.5 } },
      40: { id: "jeoseung", ch: "R", name: "저승사자", title: "명부의 사자", el: "ice", hpMul: 3, atkMul: 1.7, pattern: "reaper", reaper: { lifesteal: 0.5 } },
      50: { id: "yeomra", ch: "Y", name: "염라대왕", title: "저승의 왕", el: "fire", hpMul: 3, atkMul: 1.35, pattern: "judge", judge: { every: 3, enrageAt: 0.3, enrageMul: 2 } },
    },
  };
  const namedAt = (n) => NAMED.bosses[n] || null;
  function makeNamedBoss(n) {
    const N = namedAt(n);
    if (!N) return null;
    const b = makeHellBoss(n, N.el);
    const hp = Math.round(b.hp * N.hpMul);
    return {
      ...b, id: N.id, ch: N.ch, name: N.name, title: N.title, color: NAMED_COLOR, named: n, pattern: N.pattern, [N.pattern]: N[N.pattern],
      hp, maxHp: hp, atk: Math.round(b.atk * N.atkMul), xp: Math.round(b.xp * N.hpMul),
    };
  }
  // 염라대왕: 지금 턴의 속성 (every턴마다 다음 속성)
  const judgeElement = (turn, every) => ELEMENTS.list[Math.floor(Math.max(0, turn) / every) % ELEMENTS.list.length];

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
    MONSTERS, FLOOR, floorScale, DEFENSE_K, damageToPlayer, ELITE, BOSSES, BOSS_EVERY, MAX_FLOOR, CLEAR_STAGE, BOSS_SCALE,
    NIGHTMARE, GOLD_DUNGEON, ELEMENTS, playerRes, pickElement, nmScale, nmAtkScale, CROWD, crowdCut, nmMonsterCount, nightmarePool, pickNightmareType, makeNightmare, makeNightmareBoss,
    HELL, hellScale, hellAtkScale, hellRes, makeHell, makeHellBoss, NAMED, NAMED_COLOR, namedAt, makeNamedBoss, judgeElement, BOSS_COLOR, GOLDEN, GOLD, STAIRS_BLOCK_RADIUS,
    pool, spawnRates, pickType, eliteChance, makeMonster, isBossFloor, makeBoss, makeGolden, goldenRank,
    goldMultiplier, rollGold,
  };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.RLMonsters = api;
})(typeof self !== "undefined" ? self : this);
