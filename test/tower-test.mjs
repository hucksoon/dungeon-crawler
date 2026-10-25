// 점프 던전 물리·맵·몬스터 (jump.js): 브라우저 없이 node로
// 1) 물리 하나하나 (서기, 점프 높이, 짧은 점프, 나무 발판 뚫고 오르기·밟기·↓로 내려가기, 돌 블록 머리 부딪힘·옆 벽, 사다리, 코요테)
// 2) 사냥터 1층을 실제로 다닐 수 있는지: 밟을 수 있는 발판마다 여러 동작(제자리·좌우 점프, 짧은 점프, 걸어서 떨어지기, 사다리)을
//    진짜 물리로 돌려 어디에 내려서는지 이어 붙이고, 몬스터가 있는 발판 모두와 포탈까지 가는 길이 있는지 찾음
// 3) 몬스터: 자기 발판 안에서만 왔다 갔다, 싸우는 중엔 멈춤, 닿음 판정
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
  check("full jump ≈ 2.7 tiles high and lands again", 7 - peak > 2.5 && 7 - peak < 2.9 && s.ground && s.y === 7, `${(7 - peak).toFixed(2)}`);
  const s2 = J.newState(m); let p2 = s2.y; run(m, s2, (t) => ({ jump: t === 0, jumpHeld: t < 0.06 }), 1.2, (q) => { p2 = Math.min(p2, q.y); return false; });
  check("short tap = lower jump (release early)", 7 - p2 < (7 - peak) * 0.7 && 7 - p2 > 0.5, `${(7 - p2).toFixed(2)}`);
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
check("hunt1: start, portal, 10 monsters, all on standable floors", startSeg && portalSeg && m.spawns.length === 10 && mobSegs.every(Boolean), JSON.stringify({ startSeg, portalSeg, n: m.spawns.length }));
// 동작: [시작 x 위치들] × [방향 −1·0·1] × [꾹 점프 / 짧은 점프 / 걸어 내려가기 / 사다리 ↑ / 사다리 ↓]
const actions = [];
for (const dir of [-1, 0, 1]) {
  actions.push({ name: `jump${dir}`, input: (t) => ({ left: dir < 0, right: dir > 0, jump: t === 0, jumpHeld: true }) });
  actions.push({ name: `hop${dir}`, input: (t) => ({ left: dir < 0, right: dir > 0, jump: t === 0, jumpHeld: t < 0.08 }) });
  actions.push({ name: `latejump${dir}`, input: (t) => ({ left: dir < 0, right: dir > 0, jump: Math.abs(t - 0.25) < DT / 2, jumpHeld: t >= 0.25 }) });
  if (dir) actions.push({ name: `walk${dir}`, input: () => ({ left: dir < 0, right: dir > 0 }) });
}
actions.push({ name: "up", input: () => ({ up: true }) }, { name: "down", input: () => ({ down: true }) });
const edges = new Map();
function next(g) {
  if (edges.has(g)) return edges.get(g);
  const out = new Set();
  const xs = [g.x0 + 0.35, (g.x0 + g.x1 + 1) / 2, g.x1 + 1 - 0.35, g.x0 + 0.5, g.x1 + 0.5];
  // 사다리 아래(몸이 사다리 칸)나 사다리 맨 위에 서서 ↑↓
  for (let x = g.x0; x <= g.x1; x++) if (m.cell(x, g.y - 1) === "H" || m.cell(x, g.y) === "H") xs.push(x + 0.5);
  for (const x of xs) for (const a of actions) {
    const s = st(m, x, g.y);
    let left = false, landed = null;
    run(m, s, a.input, 2.5, (q) => { if (!q.ground || Math.abs(q.x - x) > 1.2 || q.climbing) left = true; if (left && q.ground && !q.climbing) { landed = segOf(q); return true; } return false; });
    if (landed && landed !== g) out.add(landed);
  }
  edges.set(g, out);
  return out;
}
const seen = new Map([[startSeg, null]]), queue = [startSeg];
while (queue.length) { const g = queue.shift(); for (const h of next(g)) if (!seen.has(h)) { seen.set(h, g); queue.push(h); } }
const routeTo = (goal) => { const r = []; for (let g = goal; g; g = seen.get(g)) r.unshift(label(g)); return r.join(" → "); };
const missed = mobSegs.filter(g => !seen.has(g));
check("hunt1: every monster floor is reachable from the start with real physics (jumps, ladders)", !missed.length, `missed ${missed.map(label)}; reached ${[...seen.keys()].map(label).join(" ")}`);
check("hunt1: the portal spot is reachable", seen.has(portalSeg));
// 위에서 다시 바닥으로 내려올 수 있는지 (맨 위 몬스터 발판 → 바닥)
{
  const top = mobSegs.reduce((a, g) => (g.y < a.y ? g : a));
  const back = new Map([[top, null]]), q = [top];
  while (q.length) { const g = q.shift(); for (const h of next(g)) if (!back.has(h)) { back.set(h, g); q.push(h); } }
  check("hunt1: from the top floor you can get back down to the portal", back.has(portalSeg));
}
console.log("route to the top monster:", routeTo(mobSegs.reduce((a, g) => (g.y < a.y ? g : a))));
// ---- 몬스터 ----
{
  let rnd = 1; const rand = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647);
  const mobs = m.spawns.map(p => J.newMob(m, p, rand));
  let inside = true, moved = 0;
  const x0s = mobs.map(q => q.x);
  for (let t = 0; t < 30; t += DT) for (const q of mobs) { J.mobStep(q, DT, false, rand); const g = segAt({ x: Math.floor(q.x), y: q.y }); if (!g || q.x < q.x0 - 1e-9 || q.x > q.x1 + 1e-9) inside = false; }
  mobs.forEach((q, i) => { if (Math.abs(q.x - x0s[i]) > 0.5) moved++; });
  check("monsters patrol their own floor for 30 s: never leave it, most of them move", inside && moved >= 6, JSON.stringify({ inside, moved }));
  const q = mobs[0], x = q.x; for (let t = 0; t < 3; t += DT) J.mobStep(q, DT, true, rand);
  check("a monster in a fight stays put", q.x === x);
  const s = { x: q.x + 0.7, y: q.y }, far = { x: q.x + 1.5, y: q.y }, above = { x: q.x, y: q.y - 2 };
  check("touching: side by side yes, a tile away no, a floor above no", J.touching(s, q) && !J.touching(far, q) && !J.touching(above, q));
  // 다가오기: 같은 발판 4칸 안의 플레이어 쪽으로 (발판 끝은 못 넘음), 다른 층이면 무시
  const g = J.newMob(m, m.spawns.find(p => p.y === 17), rand), pl = { ...J.newState(m), x: g.x + 3, y: 17 };
  const sx = g.x; for (let t = 0; t < 2; t += DT) J.mobStep(g, DT, J.touching(pl, g), rand, J.sameFloor(pl, g) ? pl.x : null);
  const up = J.newMob(m, m.spawns.find(p => p.y === 13), rand), hi = { ...J.newState(m), x: up.x + 2, y: 17 };
  check("aggro: a monster walks to a player 3 tiles away on its floor and stops when touching; ignores a player on another floor", J.sameFloor(pl, g) && J.touching(pl, g) && g.x > sx + 1 && !J.sameFloor(hi, up), JSON.stringify([sx, g.x, pl.x]));
  check("skill reach counts tiles (diagonal = 1)", J.reach({ x: 5, y: 10 }, { x: 7, y: 9 }) === 2 && J.reach({ x: 5, y: 10 }, { x: 5.5, y: 10 }) === 0.5);
}
console.log(`${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
