// 축복·유물 (정식 v2, dc#140): 아이템 효과 대신 판(run)마다 모으는 힘
// - 축복: 한 판에서 처음 가는 층마다 3개 중 1개 (일반 75% · 희귀 20% · 전설 5%). 같은 축복은 max번까지 겹침
// - 유물: 보스를 쓰러뜨릴 때만 3개 중 1개. 능력치를 주면서 그 능력치의 상한도 같이 올림 (같은 유물 최대 3번)
// - 판에 붙음: 포탈로 마을을 오가거나 부활해도 남고, 쓰러진 뒤 새로 시작하거나 1층·웨이포인트로 새로 들어가면 사라짐.
//   던전을 깨고 "이어가기"로 다음 던전에 가면 그대로 가져감
// - 다시 뽑기: 강화석 또는 골드 (1 강화석 = REROLL.goldPerStone 골드). 그 층 한 층 수입의 1/4에서 시작해 같은 층에서 2배씩
// 숫자는 시뮬레이션으로 맞춤 (tools/sim-v2.mjs)
(function (root) {
  const I18N = () => (root && root.RLI18N) || (typeof globalThis !== "undefined" && globalThis.RLI18N) || null;
  const tx = (key, ko, ...a) => { const L = I18N(); return L ? L.tx(key, ko, ...a) : (typeof ko === "function" ? ko(...a) : ko); };

  const TIERS = { common: { weight: 75, color: "#8fd3ff" }, rare: { weight: 20, color: "#5aa9ff" }, legend: { weight: 5, color: "#ffcf5c" } };
  // fx: 한 번 고를 때 더하는 값 (stats 키). max: 겹칠 수 있는 최대 횟수
  const BLESSINGS = {
    might: { icon: "⚔", name: "전사의 맹세", tier: "common", max: 10, fx: { atkPct: 4 } },
    vigor: { icon: "❤", name: "거인의 피", tier: "common", max: 10, fx: { hpPct: 5 } },
    stone: { icon: "🪨", name: "바위 피부", tier: "common", max: 10, fx: { defPct: 5 } },
    coin: { icon: "💰", name: "황금 손", tier: "common", max: 10, fx: { gold: 10 } },
    study: { icon: "📖", name: "배움", tier: "common", max: 10, fx: { xp: 10 } },
    brew: { icon: "🧪", name: "물약 장인", tier: "common", max: 5, fx: { potPct: 15 } },
    first: { icon: "🎯", name: "첫 수", tier: "rare", max: 4, fx: { firstHit: 25 } },
    king: { icon: "👑", name: "왕 사냥", tier: "rare", max: 5, fx: { bossHp: 4 } },
    hunt: { icon: "⭐", name: "정예 사냥", tier: "rare", max: 3, fx: { elite: 20 } },
    breath: { icon: "🌬", name: "숨 고르기", tier: "rare", max: 3, fx: { floorHeal: 10 } },
    quick: { icon: "⏱", name: "빠른 손", tier: "rare", max: 4, fx: { potCd: 1 } },
    trove: { icon: "🗝", name: "보물 냄새", tier: "rare", max: 2, fx: { treasure: 1 } },
    guide: { icon: "🧭", name: "길잡이", tier: "legend", max: 1, fx: { guide: 1 } },
    eye: { icon: "👁", name: "넓은 눈", tier: "legend", max: 2, fx: { sight: 1 } },
    hero: { icon: "✨", name: "영웅의 기운", tier: "legend", max: 3, fx: { atkPct: 6, defPct: 6, hpPct: 6 } },
  };
  // 유물: 능력치 + 그 상한 (기본 상한: 치명타 75 · 흡혈 20 · 패링 40 · 받는 피해 감소 30)
  const RELICS = {
    hawk: { icon: "🦅", name: "매의 눈", max: 3, fx: { crit: 3, critCap: 3 } },
    grail: { icon: "🍷", name: "핏빛 성배", max: 3, fx: { lifesteal: 2, lsCap: 2 } },
    wall: { icon: "🛡", name: "성벽 조각", max: 3, fx: { parry: 3, parryCap: 3 } },
    heart: { icon: "🫀", name: "강철 심장", max: 3, fx: { dmgReduce: 3, drCap: 3 } },
  };
  const CAPS = { crit: 75, lifesteal: 20, parry: 40, dmgReduce: 30 };
  // 다시 뽑기: 1 강화석 = goldPerStone 골드 (한 층에서 모이는 양의 비율, 시뮬레이션). 같은 층에서 ×grow, 다음 층이면 처음 값
  //   한 층 수입(분해로 모이는 강화석, 시뮬레이션 평균): 일반 10층 약 56 · 25층 158 · 50층 467 / 나이트메어 160~390 / 헬 300~500
  //   골드는 그 던전 한 층 골드 ÷ 강화석 (일반 약 10 · 나이트메어 약 30 · 헬 약 40)
  const REROLL = {
    grow: 2, share: 0.25,
    goldPerStone: { normal: 10, nightmare: 30, hell: 40 },
    floorStones: { normal: (n) => { const L = Math.max(2, Math.round(n * 1.5)); return 0.05 * L * L + 2.5 * L; }, nightmare: (n) => 150 + 5 * n, hell: (n) => 280 + 4.5 * n },
  };
  const OFFER = 3;

  const nameOf = (id) => (BLESSINGS[id] ? tx(`bless.${id}`, BLESSINGS[id].name) : RELICS[id] ? tx(`relic.${id}`, RELICS[id].name) : id);
  const defOf = (id) => BLESSINGS[id] || RELICS[id] || null;
  const isRelic = (id) => !!RELICS[id];

  // 효과 설명 (한 번 고를 때 / n번 모았을 때)
  const FX_TEXT = {
    atkPct: (v) => tx("bfx.atkPct", (n) => `공격력 +${n}%`, v),
    hpPct: (v) => tx("bfx.hpPct", (n) => `최대 HP +${n}%`, v),
    defPct: (v) => tx("bfx.defPct", (n) => `방어력 +${n}%`, v),
    gold: (v) => tx("bfx.gold", (n) => `골드 +${n}%`, v),
    xp: (v) => tx("bfx.xp", (n) => `경험치 +${n}%`, v),
    potPct: (v) => tx("bfx.potPct", (n) => `포션 회복량 +${n}%`, v),
    firstHit: (v) => tx("bfx.firstHit", (n) => `처음 때리는 적마다 첫 공격 피해 +${n}%`, v),
    bossHp: (v) => tx("bfx.bossHp", (n) => `보스 최대 HP −${n}%`, v),
    elite: (v) => tx("bfx.elite", (n) => `정예 몬스터 +${n}%`, v),
    floorHeal: (v) => tx("bfx.floorHeal", (n) => `새 층에 들어가면 HP ${n}% 회복`, v),
    potCd: (v) => tx("bfx.potCd", (n) => `포션 대기 −${n}턴`, v),
    treasure: (v) => tx("bfx.treasure", (n) => `층마다 보물 자리 +${n}`, v),
    guide: () => tx("bfx.guide", "층에 들어가면 계단이 지도에 보임"),
    sight: (v) => tx("bfx.sight", (n) => `시야 +${n}칸`, v),
    crit: (v) => tx("bfx.crit", (n) => `치명타 확률 +${n}%`, v),
    critCap: (v) => tx("bfx.critCap", (n) => `치명타 상한 +${n}%p`, v),
    lifesteal: (v) => tx("bfx.lifesteal", (n) => `흡혈 +${n}%`, v),
    lsCap: (v) => tx("bfx.lsCap", (n) => `흡혈 상한 +${n}%p`, v),
    parry: (v) => tx("bfx.parry", (n) => `패링 확률 +${n}%`, v),
    parryCap: (v) => tx("bfx.parryCap", (n) => `패링 상한 +${n}%p`, v),
    dmgReduce: (v) => tx("bfx.dmgReduce", (n) => `받는 피해 감소 +${n}%`, v),
    drCap: (v) => tx("bfx.drCap", (n) => `피해 감소 상한 +${n}%p`, v),
  };
  const fxText = (fx, times = 1) => Object.entries(fx).map(([k, v]) => (FX_TEXT[k] ? FX_TEXT[k](v * times) : `${k} +${v * times}`)).join(", ");

  // 모은 것 { id: 횟수 } → 효과 합계 (stats 키별)
  function totals(have) {
    const sum = {};
    for (const [id, n] of Object.entries(have || {})) {
      const d = defOf(id);
      if (!d || !(n > 0)) continue;
      const k = Math.min(n, d.max);
      for (const [stat, v] of Object.entries(d.fx)) sum[stat] = (sum[stat] || 0) + v * k;
    }
    return sum;
  }
  const capsOf = (sum) => ({ crit: CAPS.crit + (sum.critCap || 0), lifesteal: CAPS.lifesteal + (sum.lsCap || 0), parry: CAPS.parry + (sum.parryCap || 0), dmgReduce: CAPS.dmgReduce + (sum.drCap || 0) });

  // 시드 rng (items.js와 같은 방식이 아니어도 됨: 서버가 검증하지 않는 판 안의 선택)
  function rng(seed) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return () => { h += 0x6d2b79f5; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  // 고를 후보 3개: 아직 최대가 아닌 것 중에서, 축복은 등급 가중치로 (seed가 같으면 같은 후보)
  function offer(seed, have = {}, relic = false) {
    const r = rng(seed);
    const pool = Object.keys(relic ? RELICS : BLESSINGS).filter(id => (have[id] || 0) < defOf(id).max);
    const out = [];
    while (out.length < OFFER && pool.length) {
      let i;
      if (relic) i = Math.floor(r() * pool.length);
      else {
        const w = pool.map(id => TIERS[BLESSINGS[id].tier].weight / Object.values(BLESSINGS).filter(b => b.tier === BLESSINGS[id].tier).length);
        let x = r() * w.reduce((a, b) => a + b, 0);
        i = 0;
        while ((x -= w[i]) > 0 && i < w.length - 1) i++;
      }
      out.push(pool.splice(i, 1)[0]);
    }
    return out;
  }
  // 다시 뽑기 값 { stones, gold }: zone "normal" | "nightmare" | "hell", floor = 그 던전 층, n = 이 층에서 이미 다시 뽑은 횟수
  const rerollCost = (zone, floor, n) => {
    const z = REROLL.floorStones[zone] ? zone : "normal";
    const stones = Math.max(5, Math.round(REROLL.floorStones[z](floor) * REROLL.share * REROLL.grow ** n / 5) * 5);
    return { stones, gold: stones * REROLL.goldPerStone[z] };
  };

  const api = { TIERS, BLESSINGS, RELICS, CAPS, REROLL, OFFER, nameOf, defOf, isRelic, fxText, totals, capsOf, offer, rerollCost, rng };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.RLBless = api;
})(typeof window !== "undefined" ? window : globalThis);
