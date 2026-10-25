// 점프 던전 물리·맵·몬스터 (jump.js): 브라우저 없이 node로
// 1) 물리 하나하나 (서기, 점프 높이, 짧은 점프, 나무 발판 뚫고 오르기·밟기·↓로 내려가기, 돌 블록 머리 부딪힘·옆 벽, 사다리, 코요테)
// 2) 사냥터 1층(사다리 없음)을 실제로 다닐 수 있는지: 밟을 수 있는 발판마다 여러 동작(제자리·좌우 점프, 짧은 점프, 더블 점프, 걸어서 떨어지기)을
//    진짜 물리로 돌려 어디에 내려서는지 이어 붙이고, 모든 발판·포탈까지 길이 있는지, 더블 점프로만 가는 층이 있는지 찾음
// 3) 몬스터: 같은 물리로 쫓아옴(같은 층·더블 점프로 위로·↓로 아래로), 싸우는 중엔 멈춤, 돌아다니며 여러 층을 오감, 닿음 판정
import { createRequire } from "node:module";
import path from "node:path";
const REPO = process.argv[2];
const J = createRequire(import.meta.url)(path.join(REPO, "jump.js"));
const results = []; const check = (n, ok, x = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x && !ok ? " — " + x : ""}`); };
const DT = 1 / 120;
const run = (m, s, input, secs, until = () => false) => { for (let t = 0; t < secs; t += DT) { J.step(m, s, typeof input === "function" ? input(t) : input, DT); if (until(s)) return true; } return false; };
const mini = (rows) => J.parse(rows);
const st = (m, x, y) => ({ ...J.newState(m), x, y });

// ---- 물리 ----
{
  const m = mini(["##########", "#........#", "#........#", "#........#", "#........#", "#...==...#", "#S.......#", "##########"]);
  const s = J.newState(m); run(m, s, {}, 0.5);
  check("stands still on the floor (start feet on the floor top)", s.ground && s.y === 7 && Math.abs(s.x - 1.5) < 1e-9, JSON.stringify([s.x, s.y]));
  let peak = s.y; run(m, s, (t) => ({ jump: t === 0, jumpHeld: true }), 1.2, (q) => { peak = Math.min(peak, q.y); return false; });
  check("full jump ≈ 3.25 tiles high and lands again", 7 - peak > 3.1 && 7 - peak < 3.4 && s.ground && s.y === 7, `${(7 - peak).toFixed(2)}`);
  const s2 = J.newState(m); let p2 = s2.y; run(m, s2, (t) => ({ jump: t === 0, jumpHeld: t < 0.06 }), 1.2, (q) => { p2 = Math.min(p2, q.y); return false; });
  check("short tap = lower jump, but still 2+ tiles (the first 0.15 s always counts)", 7 - p2 < (7 - peak) - 0.4 && 7 - p2 > 2, `${(7 - p2).toFixed(2)}`);
  // 나무 발판 (4,5),(5,5) 윗면 y=5 (바닥에서 2칸 위): 밑에서 점프하면 뚫고 올라가 그 위에 섬
  const s3 = st(m, 4.9, 7); run(m, s3, (t) => ({ jump: t === 0, jumpHeld: true }), 1.2);
  check("plank: jump up through it from below and land on top", s3.ground && s3.y === 5, JSON.stringify([s3.x, s3.y]));
  run(m, s3, { down: true }, 0.6);
  check("plank: ↓ drops back through", s3.ground && s3.y === 7, JSON.stringify(s3.y));
  const s4 = st(m, 2.5, 7); run(m, s4, { right: true }, 3);
  check("side wall stops running (body inside the room)", Math.abs(s4.x - (9 - J.PHYS.w / 2)) < 1e-6 && s4.ground, JSON.stringify(s4.x));
}
{
  const m = mini(["#######", "#.....#", "#.###.#", "#.....#", "#.....#", "#S....#", "#######"]);
  const s = st(m, 3.5, 6); let peak = 6; run(m, s, (t) => ({ jump: t === 0, jumpHeld: true }), 1, (q) => { peak = Math.min(peak, q.y); return false; });
  check("stone block: head bumps (cannot pass up through #)", peak >= 3 + J.PHYS.h - 1e-6 && s.y === 6, `${peak}`);
}
{
  // 사다리: 아래에서 ↑로 오르면 맨 위 칸 윗면에 섬, ↓로 다시 내려감. 옆키로 떨어져 나감
  const m = mini(["#######", "#.....#", "#..H..#", "#..H..#", "#..H..#", "#S.H..#", "#######"]);
  const s = st(m, 3.4, 6); run(m, s, { up: true }, 2, (q) => q.ground && q.y === 2 && !q.climbing);
  check("ladder: ↑ climbs to the top and stands on it", s.ground && s.y === 2 && !s.climbing && Math.abs(s.x - 3.5) < 1e-9, JSON.stringify([s.x, s.y, s.climbing]));
  run(m, s, { down: true }, 2, (q) => q.y === 6 && q.ground);
  check("ladder: ↓ from the top climbs back down to the floor", s.y === 6 && s.ground, JSON.stringify([s.y, s.ground, s.climbing]));
  const s2 = st(m, 3.5, 6); run(m, s2, { up: true }, 0.4); const mid = s2.y;
  run(m, s2, { right: true }, 1);
  check("ladder: holding still keeps the spot mid-ladder; ← → lets go and falls", mid < 5 && s2.ground && s2.y === 6 && s2.x > 3.6, JSON.stringify([mid, s2.x, s2.y]));
}
{
  // 코요테: 발판 끝을 지나 조금 뒤에 눌러도 점프됨
  const m = mini(["########", "#......#", "#......#", "#......#", "#......#", "####...#", "#S.....#", "########"]);
  const s = st(m, 3.5, 5); let jumped = false;
  run(m, s, (t) => ({ right: true, jump: !jumped && s.x > 4.3 + J.PHYS.w / 2 + 0.05 && (jumped = true) }), 0.5);
  check("coyote time: jump still works a moment after walking off the edge", s.jumped === 1, JSON.stringify(s.jumped));
}

{
  // 더블 점프: 공중에서 새로 누르면 한 번 더 (꾹 누르면 모두 4칸 넘게), 세 번째는 안 됨, 땅에 내려서면 다시 생김
  const m = mini(["##########", "#........#", "#........#", "#........#", "#........#", "#........#", "#........#", "#........#", "#S.......#", "##########"]);
  const s = st(m, 4.5, 9); let peak = 9;
  run(m, s, (t) => ({ jump: Math.abs(t - 0) < DT / 2 || Math.abs(t - 0.3) < DT / 2 || Math.abs(t - 0.6) < DT / 2, jumpHeld: true }), 2, (q) => { peak = Math.min(peak, q.y); return false; });
  check("double jump: a second press in the air goes higher (> 5 tiles total); a third press does nothing", 9 - peak > 5 && 9 - peak < 6.2 && s.doubled === 1 && s.ground, `${(9 - peak).toFixed(2)} doubled ${s.doubled}`);
  const q = st(m, 4.5, 9); let pq = 9;
  run(m, q, (t) => ({ jump: t === 0 || Math.abs(t - 0.3) < DT / 2, jumpHeld: t < 0.03 || (t > 0.3 && t < 0.33) }), 2, (z) => { pq = Math.min(pq, z.y); return false; });
  check("double jump with two quick taps still reaches 4 rows (≥ 4.2 tiles)", 9 - pq >= 4.2, `${(9 - pq).toFixed(2)}`);
  run(m, s, (t) => ({ jump: Math.abs(t - 0) < DT / 2 || Math.abs(t - 0.3) < DT / 2, jumpHeld: true }), 2);
  check("double jump comes back after landing", s.doubled === 2 && s.ground);
  const w = st(m, 4.5, 9); run(m, w, (t) => ({ jump: t === 0, jumpHeld: true }), 0.05);
  check("a press on the ground is the normal jump (the double jump is kept for the air)", w.jumped === 1 && w.doubled === 0 && w.airJumps === 0);
}

// ---- 맵을 실제로 깰 수 있는지 ----
const m = J.parse(J.MAPS.hunt1.rows);
const standableAt = (x, y) => { const c = m.cell(x, y); return c === "#" || c === "=" || (c === "H" && m.cell(x, y - 1) !== "H"); };
// 발판 조각: 같은 줄에서 이어진 밟을 수 있는 칸 (위 칸이 막히지 않은 곳)
const segs = [];
for (let y = 1; y < m.h; y++) {
  let x = 1;
  while (x < m.w - 1) {
    if (standableAt(x, y) && m.cell(x, y - 1) !== "#") { const x0 = x; while (x < m.w - 1 && standableAt(x, y) && m.cell(x, y - 1) !== "#") x++; segs.push({ y, x0, x1: x - 1 }); }
    else x++;
  }
}
const segOf = (s) => (s.ground ? segs.find(g => g.y === s.y && s.x >= g.x0 - 0.3 && s.x <= g.x1 + 1.3) : null);
const label = (g) => `${g.y}:${g.x0}-${g.x1}`;
const startSeg = segs.find(g => g.y === m.start.y && m.start.x >= g.x0 && m.start.x <= g.x1 + 1);
const segAt = (p) => segs.find(g => g.y === p.y && p.x >= g.x0 && p.x <= g.x1 + 1);
const mobSegs = [...new Set(m.spawns.map(segAt))], portalSeg = segAt(m.portal);
check("hunt1: start, portal, 10 monsters on standable floors (several heights)", startSeg && portalSeg && m.spawns.length === 10 && mobSegs.every(Boolean), JSON.stringify({ startSeg, portalSeg, n: m.spawns.length }));
check("hunt1: no ladders — every floor is reached by jumping", !m.rows.some(r => r.includes("H")));
// 동작: [시작 x 위치들] × [방향 −1·0·1] × [꾹 점프 / 짧은 점프 / 늦은 점프 / 더블 점프(꼭대기 근처에서 한 번 더) / 걸어 내려가기 / ↓]
const DJ = [0.2, 0.3, 0.4];
const actionsOf = (dj) => {
  const out = [];
  for (const dir of [-1, 0, 1]) {
    const lr = { left: dir < 0, right: dir > 0 };
    out.push({ name: `jump${dir}`, input: (t) => ({ ...lr, jump: t === 0, jumpHeld: true }) });
    out.push({ name: `hop${dir}`, input: (t) => ({ ...lr, jump: t === 0, jumpHeld: t < 0.08 }) });
    out.push({ name: `latejump${dir}`, input: (t) => ({ ...lr, jump: Math.abs(t - 0.25) < DT / 2, jumpHeld: t >= 0.25 }) });
    if (dj) for (const at of DJ) {
      out.push({ name: `dj${dir}@${at}`, input: (t) => ({ ...lr, jump: t === 0 || Math.abs(t - at) < DT / 2, jumpHeld: true }) });
      // 앞으로 달리다 늦게 뛰고 더블 점프 (넓은 틈)
      if (dir) out.push({ name: `rundj${dir}@${at}`, input: (t) => ({ ...lr, jump: Math.abs(t - 0.2) < DT / 2 || Math.abs(t - 0.2 - at) < DT / 2, jumpHeld: t >= 0.2 }) });
    }
    if (dir) out.push({ name: `walk${dir}`, input: () => lr });
  }
  out.push({ name: "down", input: () => ({ down: true }) });
  return out;
};
function graph(dj) {
  const edges = new Map(), actions = actionsOf(dj);
  return (g) => {
    if (edges.has(g)) return edges.get(g);
    const out = new Set();
    const xs = [g.x0 + 0.35, (g.x0 + g.x1 + 1) / 2, g.x1 + 1 - 0.35, g.x0 + 0.5, g.x1 + 0.5];
    for (const x of xs) for (const a of actions) {
      const s = st(m, x, g.y);
      let left = false, landed = null;
      run(m, s, a.input, 2.5, (q) => { if (!q.ground || Math.abs(q.x - x) > 1.2) left = true; if (left && q.ground) { landed = segOf(q); return true; } return false; });
      if (landed && landed !== g) out.add(landed);
    }
    edges.set(g, out);
    return out;
  };
}
const bfs = (from, next) => { const seen = new Map([[from, null]]), q = [from]; while (q.length) { const g = q.shift(); for (const h of next(g)) if (!seen.has(h)) { seen.set(h, g); q.push(h); } } return seen; };
const next = graph(true), seen = bfs(startSeg, next), seenNoDJ = bfs(startSeg, graph(false));
const routeTo = (goal) => { const r = []; for (let g = goal; g; g = seen.get(g)) r.unshift(label(g)); return r.join(" → "); };
const missed = segs.filter(g => g.y < m.h - 1 && !seen.has(g));
check("hunt1: every floor (all 14 platforms + ground) is reachable from the start with real physics (jumps, double jumps)", !missed.length && segs.length === 15, `missed ${missed.map(label)}; reached ${[...seen.keys()].map(label).join(" ")}`);
check("hunt1: the portal spot is reachable", seen.has(portalSeg));
const djOnly = segs.filter(g => seen.has(g) && !seenNoDJ.has(g));
check("hunt1: some floors need the double jump (unreachable with single jumps only), including the top", djOnly.length >= 3 && djOnly.some(g => g.y === 2), `${djOnly.map(label)} / single-jump reach ${[...seenNoDJ.keys()].map(label)}`);
{
  const top = segs.reduce((a, g) => (g.y < a.y ? g : a));
  check("hunt1: from the top floor you can get back down to the portal", bfs(top, next).has(portalSeg));
  console.log("route to the top:", routeTo(top));
}
// ---- 몬스터: 플레이어와 같은 물리 + 생각(mobInput) ----
{
  let rnd = 1; const rand = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647);
  const chase = (from, p, secs = 10) => { const q = J.newMob(m, from, rand); let t = 0; for (; t < secs; t += DT) { const busy = J.touching(p, q); J.step(m, q, J.mobInput(m, q, p, DT, rand, busy), DT); if (busy) break; } return { q, t, hit: J.touching(p, q) }; };
  let r = chase({ x: 12.5, y: 24 }, { x: 19, y: 24 });
  check("chase: same floor 6.5 tiles → runs over (≥ 3 tiles/s) until touching", r.hit && 6.5 / r.t >= 2.8, JSON.stringify([r.t, r.q.x]));
  r = chase({ x: 20, y: 24 }, { x: 20, y: 20 });
  check("chase up: a player 4 rows up → the monster jumps up to them (double jump if needed)", r.hit && r.q.jumped >= 1, JSON.stringify([r.t, r.q.x, r.q.y, r.q.doubled]));
  r = chase({ x: 17, y: 12 }, { x: 10, y: 8 });
  check("chase up across: walks under the next platform and double-jumps", r.hit, JSON.stringify([r.t, r.q.x, r.q.y]));
  r = chase({ x: 20, y: 2 }, { x: 21, y: 6 });
  check("chase down: drops through the plank (↓) to a player below", r.hit && r.q.y >= 5, JSON.stringify([r.t, r.q.x, r.q.y]));
  // 싸우는 중(닿음)이면 서서 싸움
  const f = J.newMob(m, { x: 12.5, y: 24 }, rand), fp = { x: 13.2, y: 24 }, fx = f.x;
  for (let t = 0; t < 2; t += DT) J.step(m, f, J.mobInput(m, f, fp, DT, rand, J.touching(fp, f)), DT);
  check("a monster touching the player stands and fights", Math.abs(f.x - fx) < 0.05 && f.ground, JSON.stringify([fx, f.x]));
  const s = { x: f.x + 0.7, y: f.y }, far = { x: f.x + 1.5, y: f.y }, above = { x: f.x, y: f.y - 2 };
  check("touching: side by side yes, a tile away no, a floor above no", J.touching(s, f) && !J.touching(far, f) && !J.touching(above, f));
  // 돌아다니기 (플레이어 없음) 2분: 맵 밖으로 안 나가고, 오르내리며 4층 넘게 다님
  const mobs = m.spawns.map(p => J.newMob(m, p, rand)), floors = new Set();
  let inside = true;
  for (let t = 0; t < 120; t += DT) for (const q of mobs) { J.step(m, q, J.mobInput(m, q, null, DT, rand, false), DT); if (q.y > m.h - 1 + 1e-6 || q.x < 1 || q.x > m.w - 1) inside = false; if (q.ground) floors.add(q.y); }
  check("wandering 2 min: monsters stay inside, go up and down over 5+ floors, not all end on the ground", inside && floors.size >= 5 && mobs.some(q => q.y < 24), JSON.stringify({ inside, floors: [...floors], ys: mobs.map(q => q.y) }));
  // 헬 50층: 발판 곳곳에 흩어 놓기 (밟을 수 있는 칸 위, 시작 근처 6칸은 비움, 여러 층에)
  const h = J.parse(J.MAPS.hell50.rows), spots = J.spawnSpots(h, 50, rand);
  const onFloor = spots.every(p => segs.some(g => g.y === p.y && p.x >= g.x0 && p.x <= g.x1 + 1));
  check("hell 50 spawns: 50 spots on standable floors, none within 6 tiles of the start, spread over 6+ floors, boss spot on the top platform",
    spots.length === 50 && onFloor && !spots.some(p => p.y === h.start.y && Math.abs(p.x - h.start.x) < 5.7) && new Set(spots.map(p => p.y)).size >= 6 && segAt(J.MAPS.hell50.boss)?.y === 2,
    JSON.stringify(spots.slice(0, 5)));
  const big = J.newMob(h, J.MAPS.hell50.boss, rand, 1.2, 1.4);
  check("a wide (boss) monster touches from farther", J.touching({ x: big.x + 1.0, y: 2 }, big) && !J.touching({ x: big.x + 1.0, y: 2 }, { ...big, w: undefined }));
  check("skill reach counts tiles (diagonal = 1)", J.reach({ x: 5, y: 10 }, { x: 7, y: 9 }) === 2 && J.reach({ x: 5, y: 10 }, { x: 5.5, y: 10 }) === 0.5);
}
console.log(`${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
