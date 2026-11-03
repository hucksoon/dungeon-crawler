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

  // elem (dc#142): 속성 스킬 축복. 희귀보다 자주 보이게 (후보 3개 중 속성 축복이 하나라도 있을 확률 약 54%, 희귀보다 4배 자주). 꼭 나오지는 않음
  const TIERS = { common: { weight: 75, color: "#8fd3ff" }, rare: { weight: 20, color: "#5aa9ff" }, legend: { weight: 5, color: "#ffcf5c" }, elem: { weight: 26, color: "#ff8a5c" } };
  const ELEM_MAX = 10;   // 속성 스킬 최고 단계 (dc#143)
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
    // 속성 스킬 (dc#142): 처음 고르면 스킬이 생기고, 또 고르면 단계(Lv)가 올라 피해·범위·횟수가 커짐 (ELEM). 최대 Lv 10 = 마스터 (dc#143, 예전 Lv 5)
    fire: { icon: "🔥", name: "화염구", tier: "elem", max: ELEM_MAX, fx: { fireLv: 1 } },
    ice: { icon: "❄", name: "얼음 폭발", tier: "elem", max: ELEM_MAX, fx: { iceLv: 1 } },
    bolt: { icon: "⚡", name: "연쇄 번개", tier: "elem", max: ELEM_MAX, fx: { boltLv: 1 } },
  };
  // 속성 스킬 단계별 값 (dc#143: Lv 10까지, 단계마다 조금씩 세짐). 한 판에 속성 축복은 모두 합쳐 ELEM_CAP번까지 → 세 속성을 모두 마스터(Lv 10)할 수는 없음 (최대 둘)
  //   피해는 언제나 내 공격력 × mul × (1 + pct%) (공격력이 오르면 같이 셈). 숫자는 시뮬레이션으로 (tools/sim-v2.mjs)
  //   fire: every턴마다 range칸 안 가장 가까운 적 중심 (2·radius+1)² 폭발 + 화상
  //   ice: every턴마다 내 주변 radius칸 적 모두 + 느려짐
  //   bolt: every턴마다 가장 가까운 적부터 strikes번 튕김. shock: 같은 적 다시 맞힘 + 감전
  //   Lv  1  2  3  4  5  6  7  8  9  10
  //   주기 3  3  3  3  2  2  2  2  2  2   (화염구·얼음 폭발 범위: Lv 4부터 2칸, Lv 8부터 3칸 · 연쇄 번개: 1+Lv번, Lv 4부터 감전)
  //   피해 +12%씩, Lv 10 마스터는 +30% 더 (+138%) · 화염구·연쇄 번개 거리 Lv 7부터 4칸
  const ELEM_CAP = 20;
  const grow = (lv) => 12 * (lv - 1) + (lv >= ELEM_MAX ? 30 : 0);
  // dc#153: 범위 상한 — 몰려오는 광장에서 너무 넓게 쓸어서. 화염구·얼음 폭발은 Lv 7까지 1칸(3×3), Lv 8부터 2칸(5×5)이 끝
  //   (예전 Lv 4 2칸 · Lv 8 3칸 7×7), 연쇄 번개는 6번까지 (예전 1 + Lv, Lv 10 11번)
  const ELEM_AREA = { radius2: 8, maxRadius: 2, maxStrikes: 6 };
  const ELEM = {
    fire: (lv) => ({ every: lv >= 5 ? 2 : 3, range: lv >= 7 ? 4 : 3, radius: lv >= ELEM_AREA.radius2 ? ELEM_AREA.maxRadius : 1, mul: 0.5, pct: grow(lv) }),
    ice: (lv) => ({ every: lv >= 5 ? 2 : 3, radius: lv >= ELEM_AREA.radius2 ? ELEM_AREA.maxRadius : 1, mul: 0.4, pct: grow(lv) }),
    bolt: (lv) => ({ every: lv >= 5 ? 2 : 3, range: lv >= 7 ? 4 : 3, strikes: Math.min(ELEM_AREA.maxStrikes, 1 + lv), mul: 0.25, pct: grow(lv), shock: lv >= 4 }),
  };
  const ELEM_IDS = ["fire", "ice", "bolt"];
  const elemUsed = (have) => ELEM_IDS.reduce((n, id) => n + (have?.[id] || 0), 0);
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
    // 속성 스킬: v = 단계 (fxText(fx, 단계))
    fireLv: (v) => { const e = ELEM.fire(v), sq = e.radius * 2 + 1; return tx("bfx.fireLv", (n, ev, a, d) => `Lv ${n}: ${ev}턴마다 가장 가까운 적에게 ${a} 폭발, 공격력의 ${d}% 불 피해 + 화상`, v, e.every, `${sq}×${sq}`, Math.round(e.mul * (100 + e.pct))); },
    iceLv: (v) => { const e = ELEM.ice(v); return tx("bfx.iceLv", (n, ev, r, d) => `Lv ${n}: ${ev}턴마다 주변 ${r}칸의 적 모두에게 공격력의 ${d}% 얼음 피해 + 느려짐`, v, e.every, e.radius, Math.round(e.mul * (100 + e.pct))); },
    boltLv: (v) => { const e = ELEM.bolt(v); return (e.shock ? tx("bfx.boltLvS", (n, ev, k, d) => `Lv ${n}: ${ev}턴마다 번개가 ${k}번 튕김, 한 번에 공격력의 ${d}% 번개 피해 + 감전`, v, e.every, e.strikes, Math.round(e.mul * (100 + e.pct)))
      : tx("bfx.boltLv", (n, ev, k, d) => `Lv ${n}: ${ev}턴마다 번개가 ${k}번 튕김, 한 번에 공격력의 ${d}% 번개 피해`, v, e.every, e.strikes, Math.round(e.mul * (100 + e.pct)))); },
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
  // elemOnly (dc#146): 첫 레벨 업처럼 속성 스킬 축복만 (고를 수 있는 게 없으면 보통 후보)
  function offer(seed, have = {}, relic = false, elemOnly = false) {
    const r = rng(seed);
    const elemFull = !relic && elemUsed(have) >= ELEM_CAP;   // 속성 축복을 다 쓰면 더는 안 나옴
    let pool = Object.keys(relic ? RELICS : BLESSINGS).filter(id => (have[id] || 0) < defOf(id).max && !(elemFull && ELEM_IDS.includes(id)));
    if (elemOnly && !relic && pool.some(isElem)) pool = pool.filter(isElem);
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

  const isElem = (id) => ELEM_IDS.includes(id);
  // 카드·기록에 쓰는 설명: 속성 스킬은 그 단계(lv)의 설명, 나머지는 한 번 고를 때 효과
  //   atk를 주면 속성 스킬은 지금 공격력으로 한 번에 주는 피해도 (dc#143)
  const elemDmg = (id, lv, atk) => { const e = ELEM[id](Math.max(1, Math.min(ELEM_MAX, lv))); return Math.max(1, Math.round(atk * e.mul * (1 + e.pct / 100))); };
  const cardText = (id, lv = 1, atk = 0) => {
    const d = defOf(id); if (!d) return id;
    const t = fxText(d.fx, isElem(id) ? Math.max(1, lv) : 1);
    return isElem(id) && atk > 0 ? t + tx("bfx.now", (n) => ` (지금 공격력으로 한 번에 ${n})`, elemDmg(id, lv, atk)) : t;
  };
  const api = { TIERS, BLESSINGS, RELICS, CAPS, REROLL, OFFER, ELEM, ELEM_AREA, ELEM_MAX, ELEM_CAP, elemDmg, ELEM_IDS, isElem, elemUsed, cardText, nameOf, defOf, isRelic, fxText, totals, capsOf, offer, rerollCost, rng };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.RLBless = api;
})(typeof window !== "undefined" ? window : globalThis);
