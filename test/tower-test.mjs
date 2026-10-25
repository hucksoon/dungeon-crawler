// 점프 탑 물리·맵 (jump.js): 브라우저 없이 node로
// 1) 물리 하나하나 (서기, 점프 높이, 짧은 점프, 나무 발판 뚫고 오르기·밟기·↓로 내려가기, 돌 블록 머리 부딪힘·옆 벽, 사다리, 코요테, 깃발)
// 2) 맵을 실제로 깰 수 있는지: 밟을 수 있는 발판마다 여러 동작(제자리·좌우 점프, 짧은 점프, 걸어서 떨어지기, 사다리)을 진짜 물리로 돌려
//    어디에 내려서는지 이어 붙이고, 시작에서 깃발까지 가는 길이 있는지 찾음
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
const m = J.parse(J.MAPS.tower1.rows);
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
const goalSeg = segs.find(g => g.y === m.goal.y + 1 && m.goal.x >= g.x0 && m.goal.x <= g.x1);
check("tower1: has start, goal, 2 checkpoints, and standable floors", startSeg && goalSeg && m.checkpoints.length === 2 && segs.length > 15, JSON.stringify({ startSeg, goalSeg, n: segs.length }));
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
const route = []; for (let g = goalSeg; g; g = seen.get(g)) route.unshift(label(g));
check("tower1: the goal floor is reachable from the start with real physics (jumps, ladders)", seen.has(goalSeg), `reached ${seen.size}/${segs.length}: ${[...seen.keys()].map(label).join(" ")}`);
console.log("route:", route.join(" → "));
// 깃발: 깃발 줄 발판에 서서 깃발 쪽으로 걸으면 클리어
{
  const s = st(m, goalSeg.x0 + 0.5, goalSeg.y);
  run(m, s, { right: m.goal.x + 0.5 > s.x, left: m.goal.x + 0.5 < s.x }, 3, (q) => q.done);
  check("walking into the flag clears the tower (done, time counted)", s.done && s.time > 0);
}
// 체크포인트: 지나가면 다시 시작하는 곳이 바뀜
{
  const c = m.checkpoints[1], s = st(m, c.x - 1.5, c.y);
  run(m, s, { right: true }, 1, (q) => q.respawn.x === c.x);
  check("checkpoint: passing it sets the respawn point", s.respawn.x === c.x && s.respawn.y === c.y, JSON.stringify(s.respawn));
}
console.log(`${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
