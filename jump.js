// 점프 던전 (dc#82~83): 옆에서 보는 실시간 발판 맵. 물리·맵·몬스터 움직임만 (화면·싸움은 index.html의 Tower)
// 좌표는 칸 단위, x는 몸 가운데, y는 발끝 (아래로 갈수록 커짐). 한 칸 = 화면의 TILE
// 맵 글자: # 돌 블록(사방이 막힘) · = 나무 발판(아래에서는 뚫고 올라가고 위에서만 밟힘) · H 사다리(↑↓로 오르내림, 맨 위는 발판)
//         S 시작 · m 몬스터 · P 포탈(몬스터를 다 잡으면 열림) · C 체크포인트 · G 깃발 · . 빈칸
(function (root) {
  "use strict";
  // 손맛: 점프 높이 약 2.7칸(꾹 누를 때), 한 번에 가로 약 4칸. 짧게 누르면 낮게 (떼면 올라가는 속도 절반)
  const PHYS = {
    gravity: 60, maxFall: 20, jumpVel: 18, cutJump: 0.5,
    run: 7.5, accel: 70, airAccel: 55, friction: 60,
    climb: 5,
    coyote: 0.09,     // 발판 끝을 지나고도 이만큼은 점프 가능 (초)
    buffer: 0.12,     // 내려앉기 직전에 누른 점프도 내려앉자마자 (초)
    w: 0.6, h: 0.9,   // 몸 크기 (칸)
  };
  const SOLID = "#", PLANK = "=", LADDER = "H";

  // 사냥터 1층 (dc#83): 폭 40 × 높이 18. 바닥·가운데 발판 두 층·맨 위 발판, 사다리 4개. m 몬스터 10마리, P 포탈(다 잡으면 열림)
  const HUNT1 = [
    "########################################",
    "#......................................#",
    "#......................................#",
    "#......................................#",
    "#..................m...................#",
    "#.............============.............#",
    "#......................................#",
    "#...................==.................#",
    "#..............m...........m...........#",
    "#.......====H======.....====H===.......#",
    "#...........H...............H..........#",
    "#...........H...............H..........#",
    "#.......m...H.............m.H....m.....#",
    "#..==H=========.......============H==..#",
    "#....H............................H....#",
    "#....H...........==...............H....#",
    "#.S..H..m......m....P....m.....m..H....#",
    "########################################",
  ];
  const MAPS = { hunt1: { name: "사냥터 1층", depth: 1, rows: HUNT1 } };

  function parse(rows) {
    const h = rows.length, w = rows[0].length;
    const cell = (x, y) => (x < 0 || x >= w || y < 0 || y >= h ? SOLID : rows[y][x]);
    let start = null, goal = null, portal = null;
    const checkpoints = [], spawns = [];
    rows.forEach((r, y) => [...r].forEach((c, x) => {
      if (c === "S") start = { x: x + 0.5, y: y + 1 };
      else if (c === "G") goal = { x, y };
      else if (c === "C") checkpoints.push({ x: x + 0.5, y: y + 1 });
      else if (c === "m") spawns.push({ x: x + 0.5, y: y + 1 });
      else if (c === "P") portal = { x: x + 0.5, y: y + 1 };
    }));
    return { w, h, rows, cell, start, goal, checkpoints, spawns, portal };
  }

  function newState(map) {
    return { x: map.start.x, y: map.start.y, vx: 0, vy: 0, ground: true, climbing: false, coyote: 0, buffer: 0, face: 1,
      time: 0, done: false, respawn: { ...map.start }, falls: 0, jumped: 0, landed: 0 };
  }

  const solidAt = (map, tx, ty) => map.cell(tx, ty) === SOLID;
  const ladderAt = (map, tx, ty) => map.cell(tx, ty) === LADDER;
  // 위에서만 밟히는 칸: 나무 발판, 사다리 맨 위 (위 칸이 사다리가 아닐 때)
  const oneWayAt = (map, tx, ty) => map.cell(tx, ty) === PLANK || (ladderAt(map, tx, ty) && !ladderAt(map, tx, ty - 1));
  const span = (s) => [Math.floor(s.x - PHYS.w / 2 + 1e-6), Math.floor(s.x + PHYS.w / 2 - 1e-6)];
  // 몸이 사다리 칸에 걸쳐 있는지 (가운데 기준)
  const onLadder = (map, s) => ladderAt(map, Math.floor(s.x), Math.floor(s.y - 0.05)) || ladderAt(map, Math.floor(s.x), Math.floor(s.y - PHYS.h / 2));
  // 발밑에 밟을 수 있는 게 있는지 (발끝이 칸 경계에 있을 때)
  function standing(map, s) {
    if (Math.abs(s.y - Math.round(s.y)) > 1e-4) return false;
    const ty = Math.round(s.y), [x0, x1] = span(s);
    for (let tx = x0; tx <= x1; tx++) if (solidAt(map, tx, ty) || oneWayAt(map, tx, ty)) return true;
    return false;
  }

  // 한 걸음 (dt초). input = { left, right, up, down, jump (이번에 눌렀음), jumpHeld (누르고 있음) }
  function step(map, s, input, dt) {
    if (s.done) return s;
    s.time += dt;
    const P = PHYS;
    if (input.jump) s.buffer = P.buffer; else s.buffer = Math.max(0, s.buffer - dt);
    const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (dir) s.face = dir;

    // 사다리: ↑(몸이 사다리에 걸쳐 있을 때)나 ↓(사다리 맨 위에 서 있을 때)를 누르면 붙음
    const col = Math.floor(s.x);
    if (!s.climbing) {
      if (input.up && onLadder(map, s)) { s.climbing = true; s.x = col + 0.5; s.vx = 0; s.vy = 0; }
      else if (input.down && s.ground && ladderAt(map, col, Math.round(s.y))) { s.climbing = true; s.x = col + 0.5; s.vx = 0; s.vy = 0; s.y += 0.06; }
    }
    if (s.climbing) {
      if (s.buffer > 0) { s.climbing = false; s.vy = -P.jumpVel * 0.8; s.vx = dir * P.run; s.buffer = 0; s.jumped++; s.ground = false; }   // 점프로 떠남
      else if (dir && !input.up && !input.down) { s.climbing = false; s.vx = dir * P.run * 0.5; }   // 옆으로 떨어져 나감
      else if (!onLadder(map, s)) s.climbing = false;
      else {
        s.vy = ((input.down ? 1 : 0) - (input.up ? 1 : 0)) * P.climb;
        let ny = s.y + s.vy * dt;
        let top = Math.floor(s.y - 0.05);
        while (ladderAt(map, s.x | 0, top - 1)) top--;   // 이 사다리 맨 위 칸
        if (ny <= top) { ny = top; s.climbing = false; s.ground = true; s.vy = 0; }   // 맨 위에 올라섬 (맨 위 칸 윗면은 발판)
        else if (s.vy > 0) {
          const row = Math.floor(ny);   // 발끝이 지나는 칸이 사다리가 아니고 밟히면 내려섬
          if (!ladderAt(map, s.x | 0, row) && (solidAt(map, s.x | 0, row) || map.cell(s.x | 0, row) === PLANK)) { ny = row; s.climbing = false; s.ground = true; s.vy = 0; }
        }
        s.y = ny;
        return finish(map, s);
      }
    }

    // 가로: 가속·마찰
    const acc = s.ground ? P.accel : P.airAccel;
    if (dir) s.vx = clamp(s.vx + dir * acc * dt, -P.run, P.run);
    else { const f = (s.ground ? P.friction : P.airAccel * 0.5) * dt; s.vx = Math.abs(s.vx) <= f ? 0 : s.vx - Math.sign(s.vx) * f; }

    // 점프: 땅이거나 방금 떨어졌을 때(코요테)
    if (s.ground) s.coyote = P.coyote; else s.coyote = Math.max(0, s.coyote - dt);
    if (s.buffer > 0 && s.coyote > 0) { s.vy = -P.jumpVel; s.buffer = 0; s.coyote = 0; s.ground = false; s.jumped++; }
    if (!input.jumpHeld && s.vy < 0) s.vy *= Math.pow(P.cutJump, dt * 30);   // 일찍 떼면 낮게

    s.vy = Math.min(P.maxFall, s.vy + P.gravity * dt);
    moveX(map, s, s.vx * dt);
    const wasGround = s.ground;
    moveY(map, s, s.vy * dt, input.down);
    if (s.ground && !wasGround) s.landed++;
    return finish(map, s);
  }

  function moveX(map, s, dx) {
    if (!dx) return;
    s.x += dx;
    const [x0, x1] = span(s), y0 = Math.floor(s.y - PHYS.h + 1e-6), y1 = Math.floor(s.y - 1e-6);
    for (let ty = y0; ty <= y1; ty++) {
      if (dx > 0 && solidAt(map, x1, ty)) { s.x = x1 - PHYS.w / 2; s.vx = 0; return; }
      if (dx < 0 && solidAt(map, x0, ty)) { s.x = x0 + 1 + PHYS.w / 2; s.vx = 0; return; }
    }
  }

  function moveY(map, s, dy, dropThrough) {
    const oldY = s.y;
    s.y += dy;
    s.ground = false;
    const [x0, x1] = span(s);
    if (dy > 0) {
      // 아래로: 발끝이 칸 윗면을 지나면 그 위에 섬. 나무 발판·사다리 맨 위는 원래 그 위에 있었을 때만 (↓를 누르면 뚫고 내려감)
      const from = Math.floor(oldY + 1e-6), to = Math.floor(s.y);
      for (let ty = from; ty <= to; ty++) {
        if (ty < oldY - 1e-6) continue;
        for (let tx = x0; tx <= x1; tx++) {
          if (solidAt(map, tx, ty) || (!dropThrough && oneWayAt(map, tx, ty) && oldY <= ty + 1e-6)) { s.y = ty; s.vy = 0; s.ground = true; return; }
        }
      }
    } else if (dy < 0) {
      // 위로: 머리가 돌 블록에 닿으면 멈춤 (나무 발판은 뚫고 올라감)
      const head = s.y - PHYS.h, ty = Math.floor(head);
      for (let tx = x0; tx <= x1; tx++) if (solidAt(map, tx, ty)) { s.y = ty + 1 + PHYS.h; s.vy = 0; return; }
    } else if (standing(map, s)) s.ground = true;
  }

  function finish(map, s) {
    // 체크포인트·깃발은 몸이 그 칸에 닿으면
    const bx = Math.floor(s.x), by = Math.floor(s.y - PHYS.h / 2);
    for (const c of map.checkpoints) if (Math.floor(c.x) === bx && Math.abs(c.y - 1 - by) <= 1 && (s.respawn.x !== c.x || s.respawn.y !== c.y)) s.respawn = { ...c };
    if (map.goal && bx === map.goal.x && Math.abs(map.goal.y - by) <= 1) s.done = true;
    // 맵 밖으로 떨어지면 체크포인트에서 다시 (바닥이 막혀 있어 보통은 안 떨어짐)
    if (s.y > map.h + 2) { Object.assign(s, { x: s.respawn.x, y: s.respawn.y, vx: 0, vy: 0, climbing: false }); s.falls++; }
    return s;
  }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---- 몬스터: 서 있는 발판 위를 왔다 갔다 (떨어지거나 뛰지 않음), 가끔 멈춤 ----
  // aggro: 같은 발판에 선 플레이어가 이 칸 안이면 그쪽으로 걸어옴
  const MOB = { w: 0.8, h: 0.9, speed: 1.6, pauseMin: 0.6, pauseMax: 1.6, walkMin: 1.5, walkMax: 4, aggro: 4 };
  // 발판 끝: 발밑이 밟히고 몸 칸이 막히지 않은 데까지
  function patrol(map, x, y) {
    const ok = (tx) => { const c = map.cell(tx, y); return (c === SOLID || oneWayAt(map, tx, y)) && map.cell(tx, y - 1) !== SOLID; };
    let x0 = Math.floor(x), x1 = x0;
    while (ok(x0 - 1)) x0--;
    while (ok(x1 + 1)) x1++;
    return { x0: x0 + MOB.w / 2, x1: x1 + 1 - MOB.w / 2 };
  }
  function newMob(map, at, rand = Math.random) {
    return { x: at.x, y: at.y, ...patrol(map, at.x, at.y), dir: rand() < 0.5 ? -1 : 1, wait: rand() * MOB.pauseMax, walk: 0 };
  }
  // 한 걸음. busy(싸우는 중)면 제자리, toward(같은 발판의 플레이어 x)가 aggro칸 안이면 그쪽으로
  function mobStep(m, dt, busy = false, rand = Math.random, toward = null) {
    if (busy) return m;
    if (toward != null && Math.abs(toward - m.x) <= MOB.aggro) {
      m.dir = toward < m.x ? -1 : 1; m.wait = 0; m.walk = MOB.walkMin;
      m.x = clamp(m.x + m.dir * MOB.speed * dt, m.x0, m.x1);
      return m;
    }
    if (m.wait > 0) { m.wait -= dt; if (m.wait <= 0) { m.walk = MOB.walkMin + rand() * (MOB.walkMax - MOB.walkMin); if (rand() < 0.4) m.dir = -m.dir; } return m; }
    m.x += m.dir * MOB.speed * dt;
    if (m.x <= m.x0) { m.x = m.x0; m.dir = 1; }
    else if (m.x >= m.x1) { m.x = m.x1; m.dir = -1; }
    m.walk -= dt;
    if (m.walk <= 0) m.wait = MOB.pauseMin + rand() * (MOB.pauseMax - MOB.pauseMin);
    return m;
  }
  // 플레이어와 몬스터가 닿았는지 (몸이 조금이라도 겹치거나 바로 옆)
  // 플레이어가 몬스터와 같은 발판에 서 있는지 (발끝 높이가 같고 그 발판 범위 안)
  const sameFloor = (s, m) => s.ground && !s.climbing && Math.abs(s.y - m.y) < 1e-6 && s.x >= m.x0 - 0.6 && s.x <= m.x1 + 0.6;
  const touching = (s, m) => Math.abs(s.x - m.x) < (PHYS.w + MOB.w) / 2 + 0.15 && Math.abs(s.y - m.y) < (PHYS.h + MOB.h) / 2;
  // 스킬 거리 (칸, 대각선도 1칸): 몸 가운데끼리
  const reach = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs((a.y - PHYS.h / 2) - (b.y - MOB.h / 2)));

  const api = { PHYS, MOB, MAPS, parse, newState, step, standing, onLadder, patrol, newMob, mobStep, sameFloor, touching, reach };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.RLJump = api;
})(typeof window !== "undefined" ? window : globalThis);
