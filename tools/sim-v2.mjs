// 정식 v2 밸런스 시뮬레이션 (dc#140): 한 판을 1층부터 실제 드롭 규칙·자동 장비·축복·유물로 내려가며 싸움
//   node tools/sim-v2.mjs [판 수] [zone: normal|nm|hell|all] [옵션 JSON]
// 모델 (게임보다 단순하게):
//   층마다 몬스터의 KILL_SHARE만큼을 GROUP마리씩 상대 (모두 붙어서 동시에 때림, 둘러싸임 방어 포함). 보스 층은 마지막에 보스 1:1
//   플레이어: 한 턴에 한 번 공격 (최대 HP 45% 아래면 포션: 최대 HP 30%, 대기 10턴), 무리 사이에는 포션 대기만큼 쉬며 70%까지
//   속성 몬스터(나이트메어·헬)는 피해 × ELEM_MUL (번개 튕김·화상 평균)
//   드롭: RLItems.rollDrop / generate("golden") 그대로, 자동 장비(중복 +1 · 더 좋으면 강화 이어받아 바꿔 끼기 · 나머지 분해) + 강화석으로 +4까지
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const I = require("../items.js"), M = require("../monsters.js"), B = require("../blessings.js");

const RUNS = +(process.argv[2] || 200), ZONE = process.argv[3] || "all";
const OPT = JSON.parse(process.argv[4] || "{}");
// 넓은 지역(dc#143): 층의 몬스터를 모두 잡아야 계단(보스 층은 보스+부하)이 나오므로 모두 잡음
const KILL_SHARE = OPT.kill ?? 1, ELEM_MUL = OPT.elem ?? 1.2;
// 한 번에 붙는 몬스터 수: 일반 던전 앞쪽은 1~2마리, 깊을수록 많이 (나이트메어·헬은 몰려옴)
const GROUP = (zone, f) => OPT.group ?? (zone === "normal" ? (f <= 5 ? 1 : f <= 20 ? 2 : 3) : 4);
if (OPT.mul) Object.assign(I.POWER.mul, OPT.mul);
if (OPT.zone) Object.assign(I.POWER.zone, OPT.zone);

const between = (r, a, b) => a + Math.floor(r() * (b - a + 1));
const SLOTS9 = ["weapon", "offhand", "head", "chest", "arms", "pants", "boots", "neck", "ring1", "ring2"];
const ENH_ORDER = SLOTS9;
// 속성 스킬 축복 (dc#142)은 재미로 많이 고른다고 보고 앞쪽 (OPT.noElem: 고르지 않음)
const BLESS_PRI = OPT.bpri || [...(OPT.noElem ? [] : ["fire", "bolt", "ice"]), "hero", "might", "vigor", "stone", "first", "king", "brew", "quick", "breath", "hunt", "trove", "eye", "guide", "study", "coin"];
const RELIC_PRI = OPT.rpri || ["grail", "heart", "hawk", "wall"];

function newPlayer(level = 1) {
  const p = { lvl: 1, xp: 0, xpNext: (OPT.xpFirst ?? 6) * (OPT.xpNeed ?? 4), maxHp: 20, atk: 3, eq: {}, stones: { stones: 0, nmStones: 0, hellStones: 0 }, bl: {}, rl: {} };
  while (p.lvl < level) levelUp(p);
  return p;
}
// 레벨 (dc#143): 다음 레벨까지 ×XP_GROW (게임과 같게 1.3), 레벨이 오를 때마다 축복 하나 (p.lvBless가 있으면)
//   dc#152: 레벨마다 필요한 경험치 ×OPT.xpNeed (기본 4, 게임 XP_NEED와 같게. 1이면 예전)
const XP_GROW = OPT.xpGrow ?? 1.3;
// 경험치 구슬 (dc#151): 주워야 오름 → 줍는 몫 OPT.xpPick (기본 0.9, 멀리서 스킬로 잡은 것 일부는 못 주움)
const XP_PICK = OPT.xpPick ?? 0.9;
function levelUp(p) { p.lvl++; p.xpNext = Math.floor(p.xpNext * XP_GROW); p.maxHp += 4; p.atk += 1; if (p.lvBless) p.lvBless(p.lvl); }
function gainXp(p, n) { p.xp += n; while (p.xp >= p.xpNext) { p.xp -= p.xpNext; levelUp(p); } }

function stats(p) {
  const g = I.powerTotals(Object.values(p.eq)).stats, b = B.totals({ ...p.bl, ...p.rl }), cap = B.capsOf(b), lp = (p.lvl - 1) * 2;
  const pct = (v, q) => v * (1 + q / 100);
  return {
    maxHp: Math.round(pct(p.maxHp + g.hp, (b.hpPct || 0) + lp)), atk: Math.round(pct(p.atk + g.atk, (b.atkPct || 0) + lp)), def: Math.round(pct(g.def, b.defPct || 0)),
    crit: Math.min(cap.crit, b.crit || 0), ls: Math.min(cap.lifesteal, b.lifesteal || 0), dr: Math.min(cap.dmgReduce, b.dmgReduce || 0), parry: Math.min(cap.parry, b.parry || 0),
    ef: Object.fromEntries(B.ELEM_IDS.map(k => { const lv = Math.min(B.ELEM_MAX, b[`${k}Lv`] || 0); return [k, lv ? B.ELEM[k](lv) : null]; })),
    first: b.firstHit || 0, bossHp: b.bossHp || 0, pot: 0.3 * (1 + (b.potPct || 0) / 100), potCd: 10 - (b.potCd || 0), floorHeal: b.floorHeal || 0, xp: b.xp || 0, elite: b.elite || 0, treasure: b.treasure || 0,
  };
}

// ---- 자동 장비 ----
const keysFor = (it) => (it.slot === "ring" ? ["ring1", "ring2"] : [it.slot]);
function autoGear(p, it, log) {
  const keys = keysFor(it);
  // 중복: 같은 부위·던전·등급 → +1 (더 높은 레벨이면 새 것으로 바꾸고 강화 +1 이어받기)
  const dupKey = keys.filter(k => I.isDupOf(p.eq[k], it) && (p.eq[k].enh || 0) < I.ENHANCE.max).sort((a, b) => (p.eq[a].enh || 0) - (p.eq[b].enh || 0))[0];
  if (dupKey) {
    const cur = p.eq[dupKey], to = (cur.enh || 0) + 1;
    if ((it.lvl || 0) > (cur.lvl || 0)) { p.eq[dupKey] = { ...it, enh: to }; dismantle(p, cur, true); } else cur.enh = to;
    log.dup++;
    return;
  }
  // 더 좋은 것: 바탕 힘(강화 전)이 더 크면 강화 단계를 이어받아 바꿔 낌. 빈 칸이면 그냥 낌
  const empty = keys.find(k => !p.eq[k]);
  if (empty) { p.eq[empty] = { ...it, enh: 0 }; log.swap++; return; }
  const worst = keys.sort((a, b) => I.basePowerScore(p.eq[a]) - I.basePowerScore(p.eq[b]))[0];
  if (I.basePowerScore(it) > I.basePowerScore(p.eq[worst])) {
    const cur = p.eq[worst];
    p.eq[worst] = { ...it, enh: cur.enh || 0 };
    dismantle(p, cur, true);
    log.swap++;
    return;
  }
  dismantle(p, it);
  log.dis++;
}
function dismantle(p, it) { p.stones[I.stoneKey(it)] += I.sellStones(it); p.got = (p.got || 0) + I.sellStones(it); p.gold = (p.gold || 0) + I.sellGold(it); }
function autoEnhance(p) {
  for (let pass = 0; pass < 4; pass++) for (const k of ENH_ORDER) {
    const it = p.eq[k];
    if (!it || (it.enh || 0) >= 4) continue;
    const to = (it.enh || 0) + 1, cost = I.enhanceCost(to, it), sk = I.stoneKey(it);
    if (p.stones[sk] < cost) continue;
    p.stones[sk] -= cost; it.enh = to;
  }
}

// ---- 몬스터 ----
function floorMonsters(zone, f, r) {
  const L = M.effLevel(f), deep = zone !== "normal";
  const count = (deep ? M.nmMonsterCount(f) : between(r, 4 + L, 6 + L * 2)) * SW.count;
  const rOn = RG && (deep || f >= RG.from), rShare = deep ? RG?.deepShare : RG?.share;
  return { count: Math.round(count * KILL_SHARE), make: (kind) => { const m = swarmM(mk(kind)); if (rOn && r() < rShare) { m.ranged = true; m.rcd = 1 + Math.floor(r() * RG.every); } return m; } };
  function mk(kind) {
    if (zone === "hell") return zm("hell", M.makeHell(M.pickNightmareType(r), kind, f));
    if (zone === "nm") return zm("nm", M.makeNightmare(M.pickNightmareType(r), kind, f, M.pickElement(r)));
    if (OPT.nramp != null) { const m = M.makeMonster(M.pickType(L, r), kind, L), k = 1 + OPT.nramp * (f - 1) / 49; m.hp = Math.round(m.hp * k); m.atk = Math.round(m.atk * k); return m; }
    return OPT.nmul ? (() => { const m = M.makeMonster(M.pickType(L, r), kind, L); m.hp = Math.round(m.hp * OPT.nmul.hp); m.atk = Math.round(m.atk * OPT.nmul.atk); return m; })() : M.makeNormal(M.pickType(L, r), kind, f);
  }
}
function eliteBaseOf(zone, f) { return M.eliteChance(zone !== "normal" ? M.NIGHTMARE.base : M.effLevel(f)); }
// 몬스터 무리 (dc#146): 몬스터 ×count, 한 마리당 경험치 ×xp · 드롭 ×drop (OPT.swarm: false면 예전)
const SW = OPT.swarm === false ? { count: 1, xp: 1, drop: 1 } : { ...M.SWARM, ...(OPT.sw || {}) };
const swarmM = (m) => ({ ...m, xp: Math.max(1, Math.round(m.xp * SW.xp)) });
// 원거리 몬스터 (dc#149): 붙지 않고 every턴마다 저주 구슬 (공격력 ×mul). 표시를 보고 벗어나면 안 맞음 → 피할 확률 OPT.rdodge (기본 0.5,
//   몰려오는 무리 사이라 다 피하지는 못한다고 봄). 멀리 있어 맨 나중에 잡고, 둘러싸임 방어의 마릿수에는 넣지 않음. OPT.ranged: false면 없음
const RG = OPT.ranged === false ? null : { ...M.RANGED, ...(OPT.rg || {}) }, R_DODGE = OPT.rdodge ?? 0.5;
// OPT.zmul: { nm: { hp, atk }, hell: { hp, atk } } 나이트메어·헬 몬스터에 더 곱해 보기 (시험용)
function zm(zone, m) { const k = OPT.zmul?.[zone]; if (!k) return m; const hp = Math.round(m.hp * (k.hp || 1)); return { ...m, hp, maxHp: hp, atk: Math.round(m.atk * (k.atk || 1)) }; }
function makeBoss(zone, f, r) {
  if (zone === "hell") return zm("hell", M.makeHellBoss(f, M.pickElement(r)));
  if (zone === "nm") return zm("nm", M.makeNightmareBoss(f, M.pickElement(r)));
  if (OPT.nramp != null) { const b = M.makeBoss(f, M.effLevel(f)), k = 1 + OPT.nramp * (f - 1) / 49; b.hp = Math.round(b.hp * k); b.atk = Math.round(b.atk * k); return b; }
  return OPT.nmul ? (() => { const b = M.makeBoss(f, M.effLevel(f)); b.hp = Math.round(b.hp * OPT.nmul.hp); b.atk = Math.round(b.atk * OPT.nmul.atk); return b; })() : M.makeNormalBoss(f);
}
const itemLevel = (zone, f) => (zone === "hell" ? I.UNIQUE ? 125 + f : 125 + f : zone === "nm" ? 75 + f : M.effLevel(f));
const tag = (zone) => (zone === "hell" ? "j" : zone === "nm" ? "n" : "e");

// 속성 스킬 (dc#142): 게임과 같은 주기·피해. 몰려온 적은 서로 붙어 있다고 보고 폭발 3×3은 3마리, 5×5는 6마리까지
//   피해 = 공격력 × mul × (1 + pct%) × (1 − 그 속성 저항) (방어력 무시), 치명타 가능. 화상은 공격력 10% × 5번을 한 번에, 얼음은 느려짐(2턴에 한 번 행동)
const ELKEY = { fire: "fire", ice: "ice", bolt: "bolt" };
// 누가 얼마나 잡았는지 (dc#153): 몬스터에게 들어간 피해(넘친 피해 빼고) 합
const DMG = {}, DMGN = {};
// 속성 스킬 범위에 걸리는 몬스터 수: 화염구 (2r+1)² 폭발에 3·6·9마리, 얼음 폭발은 무리 전부 (OPT.aoe: 배수, 몰려드는 광장에서 무리가 더 클 때)
function castElem(s, foes, st, r, killed) {
  const res = (m, k) => Math.max(0, 1 - ((m.res?.[k] || 0) / 100));
  const hit = (m, d, k) => { const v = Math.round(d * res(m, k)); DMG[k] = (DMG[k] || 0) + Math.min(v, Math.max(0, m.hp)); DMGN[k] = (DMGN[k] || 0) + 1; m.hp -= v; };
  const roll = (e) => s.atk * e.mul * (1 + e.pct / 100) * (r() * 100 < s.crit ? 2 : 1);
  // 기본 스킬 마력탄 (dc#146): 2턴마다 하나에게 공격력 60% (방어 무시)
  if (!OPT.noStarter && foes.length) { st.scd = (st.scd || 0) - 1; if (st.scd <= 0) { st.scd = 2; const m = foes[foes.length > 1 ? 1 : 0]; const v = Math.round(s.atk * 0.6 * (r() * 100 < s.crit ? 2 : 1)); DMG.starter = (DMG.starter || 0) + Math.min(v, Math.max(0, m.hp)); m.hp -= v; if (m.hp <= 0) killed.push(foes.splice(foes.indexOf(m), 1)[0]); } }
  for (const k of B.ELEM_IDS) {
    const e = s.ef[k];
    if (!e) continue;
    st.ecd[k] = (st.ecd[k] || 0) - 1;
    if (st.ecd[k] > 0 || !foes.length) continue;
    st.ecd[k] = e.every;
    const d = roll(e);
    if (k === "fire") for (const m of foes.slice(0, Math.round((e.radius >= 3 ? 9 : e.radius >= 2 ? 6 : 3) * (OPT.aoe || 1)))) hit(m, d + s.atk * 0.5, k);
    else if (k === "ice") for (const m of foes) { hit(m, d, k); if (!(m.slowImm > 0)) { m.slow = M.ELEMENTS.ice.turns; m.slowImm = M.ELEMENTS.ice.turns + M.ELEMENTS.ice.immune; } }
    else { let n = 0; for (let i = 0; i < e.strikes; i++) { const m = foes[i < foes.length ? i : 0]; if (i >= foes.length && !e.shock) break; hit(m, d * (e.shock && i > 0 ? 1.2 : 1), k); n++; } }
    for (let i = foes.length - 1; i >= 0; i--) if (foes[i].hp <= 0) killed.push(foes.splice(i, 1)[0]);
  }
}

// 싸움: foes 배열과 동시에. 이기면 true
function fight(p, s, foes, st, r, zone) {
  let turn = 0;
  st.ecd = st.ecd || {};
  foes.sort((a, b) => (a.ranged ? 1 : 0) - (b.ranged ? 1 : 0));   // 원거리는 멀리 있어 맨 나중에
  while (foes.length) {
    turn++;
    if (st.cd > 0) st.cd--;
    castElem(s, foes, st, r, st.killed);
    if (!foes.length) break;
    if (st.hp < s.maxHp * 0.45 && st.cd === 0) { st.hp = Math.min(s.maxHp, st.hp + Math.max(8, Math.round(s.maxHp * s.pot))); st.cd = s.potCd; }
    else {
      const t = foes[0];
      const crit = r() * 100 < s.crit;
      let dmg = Math.max(1, Math.round((s.atk + Math.floor(r() * 3)) * (crit ? 2 : 1)) - t.def);
      if (!t.hitOnce && s.first) dmg = Math.round(dmg * (1 + s.first / 100));
      t.hitOnce = true;
      const taken = Math.min(dmg, t.hp);
      DMG.melee = (DMG.melee || 0) + Math.max(0, taken);
      t.hp -= dmg;
      if (s.ls) st.hp = Math.min(s.maxHp, st.hp + Math.floor(taken * s.ls / 100));
      if (t.hp <= 0) { foes.shift(); st.killed.push(t); }
    }
    const crowd = M.crowdCut(foes.filter(m => !m.ranged).length);
    for (const m of foes) {
      if (m.slowImm > 0) m.slowImm--;
      if (m.slow > 0) { m.slow--; if (turn % 2) continue; }   // 느려짐: 2턴에 한 번
      if (m.ranged && foes.length > 1) {   // 다른 몬스터가 남아 있는 동안은 떨어져서 던짐 (혼자 남으면 붙어서 싸움)
        if (--m.rcd > 0) continue;
        m.rcd = RG.every + RG.windup;
        if (r() < R_DODGE) continue;
        let d = M.damageToPlayer(m.atk * RG.mul + Math.floor(r() * 2), s.def) * (1 - s.dr / 100);
        if (zone !== "normal") d *= ELEM_MUL;
        st.hp -= Math.max(1, Math.round(d));
        continue;
      }
      if (s.parry && r() * 100 < s.parry) continue;
      let d = M.damageToPlayer(m.atk + Math.floor(r() * 3), s.def) * (1 - s.dr / 100) * (1 - crowd);
      if (zone !== "normal") d *= ELEM_MUL;
      st.hp -= Math.max(1, Math.round(d));
    }
    if (st.hp <= 0) return false;
    if (turn > 400) return false;   // 못 잡음
  }
  return true;
}

const priOf = (pri, id) => { const i = pri.indexOf(id); return i < 0 ? 1e9 : i; };   // 목록에 없는 것은 맨 뒤 (noElem이면 속성 축복은 다른 게 없을 때만)
function pickBest(list, pri) { return [...list].sort((a, b) => priOf(pri, a) - priOf(pri, b))[0]; }

// 한 던전 50층 (p를 이어서 씀). 쓰러지면 쓰러진 층, 다 깨면 0
function runZone(p, zone, r, rid, out, from = 1) {
  const st = { hp: stats(p).maxHp, cd: 0, killed: [] };
  p.lvBless = OPT.noBless || OPT.noLvBless ? null : (lvl) => { const off = B.offer(`${rid}|lv|${lvl}`, p.bl, false, lvl === 2 && !B.elemUsed(p.bl)); if (off.length) { const id = pickBest(off, BLESS_PRI); p.bl[id] = (p.bl[id] || 0) + 1; } };
  for (let f = from; f <= 50; f++) {
    // 새 층: 축복 하나
    const off = B.offer(`${rid}|${zone}|${f}`, p.bl);
    if (off.length && !OPT.noBless) { const id = pickBest(off, BLESS_PRI); p.bl[id] = (p.bl[id] || 0) + 1; }
    // 축복 상점 (dc#151): 상점 층(보스 층 바로 전)에서 축복 하나 더 (OPT.shrine: false면 없음)
    if (OPT.shrine !== false && !OPT.noBless && I.isShopFloor(f)) { const so = B.offer(`${rid}|${zone}|${f}|sh`, p.bl); if (so.length) { const id = pickBest(so, BLESS_PRI); p.bl[id] = (p.bl[id] || 0) + 1; } }
    let s = stats(p);
    st.hp = Math.min(s.maxHp, st.hp + Math.round(s.maxHp * s.floorHeal / 100));
    const fm = floorMonsters(zone, f, r), L = itemLevel(zone, f), log = out.log;
    const eliteP = Math.min(1, eliteBaseOf(zone, f) * (1 + s.elite / 100));
    let left = fm.count, kills = 0;
    while (left > 0) {
      const n = Math.min(GROUP(zone, f), left); left -= n;
      const foes = Array.from({ length: n }, () => fm.make(r() < eliteP ? "elite" : "normal"));
      st.killed = [];
      if (!fight(p, s, foes, st, r, zone)) { out.where[`${zone}${f}`] = (out.where[`${zone}${f}`] || 0) + 1; return f; }
      for (const m of st.killed) {
        gainXp(p, Math.round(m.xp * (1 + s.xp / 100) * XP_PICK));
        const it = I.rollDrop(`${rid}|${tag(zone)}${f}|k${kills++}`, L, m.kind, (zone === "normal" ? 1.5 : 1) * SW.drop);
        if (it) autoGear(p, it, log);
      }
      autoEnhance(p); s = stats(p);
      // 다음 무리 전에 쉬기: 포션 대기만큼 걸으며 70%까지
      for (let k = 0; k < 2 && st.hp < s.maxHp * 0.7; k++) st.hp = Math.min(s.maxHp, st.hp + Math.max(8, Math.round(s.maxHp * s.pot)));
      st.cd = 0;
    }
    // 보물 자리 (레어 이상)
    const got0 = p.got || 0;
    const tr = (zone === "normal" ? 3 : 2) + s.treasure;
    for (let k = 0; k < tr; k++) autoGear(p, I.generate(`${rid}|${tag(zone)}${f}|p${k}`, "golden", L), log);
    if (M.isBossFloor(f)) {
      const boss = makeBoss(zone, f, r);
      boss.hp = Math.round(boss.hp * (1 - s.bossHp / 100));
      st.killed = [];
      // 넓은 지역(dc#143): 보스는 부하 2 + 층/10마리와 함께 (부하 먼저 잡는다고 보고 앞에)
      const adds = OPT.noAdds ? [] : Array.from({ length: 2 + Math.floor(f / 10) }, () => fm.make(r() < 0.35 ? "elite" : "normal"));
      if (!fight(p, s, [...adds, boss], st, r, zone)) { out.bossDeaths = (out.bossDeaths || 0) + 1; out.where[`${zone}${f}b`] = (out.where[`${zone}${f}b`] || 0) + 1; return f; }
      for (const m of st.killed) gainXp(p, Math.round(m.xp * (1 + s.xp / 100)));
      for (let k = 0; k < 2; k++) { const it = I.rollDrop(`${rid}|${tag(zone)}${f}|b${k}`, L, "boss"); if (it) autoGear(p, it, log); }
      if (!OPT.noBless) { const ro = B.offer(`${rid}|${zone}|r${f}`, p.rl, true); if (ro.length) { const id = pickBest(ro, RELIC_PRI); p.rl[id] = (p.rl[id] || 0) + 1; } }
      autoEnhance(p);
    }
    if ([1, 10, 25, 50].includes(f)) ((out.income[`${zone}${f}`] ||= []).push((p.got || 0) - (p.gotFloor || 0)));
    p.gotFloor = p.got || 0;
    if (OPT.trace && f % 10 === 0) out.trace.push(`${zone}${f} Lv${p.lvl} ${JSON.stringify(stats(p))} gear ${Object.values(p.eq).map(i => `${i.rarity[0]}${i.enh}`).join(" ")}`);
  }
  return 0;
}

const mean = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
function report(name, deaths, extra = "") {
  const died = deaths.filter(d => d > 0);
  const buckets = [10, 20, 30, 40, 50].map(t => died.filter(d => d > t - 10 && d <= t).length);
  console.log(`${name}: 끝까지 ${Math.round((1 - died.length / deaths.length) * 100)}% · 쓰러진 층 1~10 ${buckets[0]} / 11~20 ${buckets[1]} / 21~30 ${buckets[2]} / 31~40 ${buckets[3]} / 41~50 ${buckets[4]} ${extra}`);
}

const r0 = B.rng("sim-v2");
const zones = ZONE === "all" ? ["normal", "nm", "hell"] : [ZONE];
const out = { log: { dup: 0, swap: 0, dis: 0 }, trace: [], where: {}, income: {} };
// 1) 이어가기: 일반 1층부터 한 판으로 → 나이트메어 → 헬
{
  const res = { normal: [], nm: [], hell: [] }, lv = { normal: [], nm: [], hell: [] }, saved = { normal: [], nm: [] };
  for (let i = 0; i < RUNS; i++) {
    const p = newPlayer(1), rid = `run${i}`;
    for (const z of ["normal", "nm", "hell"]) {
      const d = runZone(p, z, r0, rid, out);
      res[z].push(d); lv[z].push(p.lvl);
      if (d) break;
      if (z !== "hell") saved[z].push(JSON.parse(JSON.stringify(p)));
    }
  }
  for (const z of zones) report(`이어가기 ${z}`, res[z], `(판 ${res[z].length}, 끝 레벨 평균 ${mean(lv[z]).toFixed(0)})`);
  // 2) 따로 들어가기: 앞 던전을 깬 장비·레벨 그대로, 축복·유물 0개로 다음 던전 1층부터
  for (const [from, to] of [["normal", "nm"], ["nm", "hell"]]) {
    if (!zones.includes(to) || !saved[from].length) continue;
    const ds = saved[from].map((p0, i) => {
      const p = JSON.parse(JSON.stringify(p0)); p.bl = {}; p.rl = {};
      // 따라잡기: 건너뛴 층의 절반만큼 축복, 건너뛴 보스의 절반만큼 유물을 처음에 고름 (게임과 같은 규칙)
      const skipped = to === "hell" ? 100 : 50, picks = OPT.catchup === 0 ? 0 : Math.floor(skipped / 2), relics = OPT.catchup === 0 ? 0 : Math.floor(skipped / 10);
      for (let k = 0; k < picks; k++) { const off = B.offer(`fresh${i}|c${k}`, p.bl); if (off.length) { const id = pickBest(off, BLESS_PRI); p.bl[id] = (p.bl[id] || 0) + 1; } }
      for (let k = 0; k < relics; k++) { const off = B.offer(`fresh${i}|cr${k}`, p.rl, true); if (off.length) { const id = pickBest(off, RELIC_PRI); p.rl[id] = (p.rl[id] || 0) + 1; } }
      return runZone(p, to, r0, `fresh${i}`, out);
    });
    report(`마을에서 새로 ${to} (따라잡기 ${OPT.catchup === 0 ? '없음' : '있음'})`, ds, `(판 ${ds.length})`);
  }
}
{ const tot = Object.values(DMG).reduce((a, b) => a + b, 0); console.log("몬스터에게 들어간 피해 비율:", Object.entries(DMG).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${Math.round(v / tot * 100)}%`).join(" · ")); }
console.log("자동 장비:", out.log);
console.log("한 층에서 분해로 모이는 강화석 (평균):", Object.entries(out.income).map(([k, v]) => `${k} ${Math.round(mean(v))}`).join(" · "));
if (OPT.where) console.log("쓰러진 곳:", JSON.stringify(Object.entries(out.where).sort((a, b) => b[1] - a[1]).slice(0, 15)));
for (const t of out.trace.slice(0, 12)) console.log(t);
