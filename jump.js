// 점프 탑 (dc#82): 옆에서 보는 실시간 발판 맵. 물리와 맵만 (화면은 index.html의 Tower)
// 좌표는 칸 단위, x는 몸 가운데, y는 발끝 (아래로 갈수록 커짐). 한 칸 = 화면의 TILE
// 맵 글자: # 돌 블록(사방이 막힘) · = 나무 발판(아래에서는 뚫고 올라가고 위에서만 밟힘) · H 사다리(↑↓로 오르내림, 맨 위는 발판)
//         S 시작 · C 체크포인트(지나가면 떨어졌을 때 여기서 다시) · G 깃발(닿으면 클리어) · . 빈칸
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

  // 점프 탑 1: 지그재그로 올라가고, 가운데 사다리, 체크포인트 두 곳, 맨 위 깃발 (폭 22 × 높이 40)
  const TOWER1 = [
    "######################",
    "#..........G.........#",
    "#.......######.......#",
    "#....................#",
    "#....===.............#",
    "#.........C..........#",
    "#........===.........#",
    "#....................#",
    "#.............===....#",
    "#....................#",
    "#..................==#",
    "#....................#",
    "#...............##...#",
    "#....................#",
    "#...........==.......#",
    "#....................#",
    "#......====..........#",
    "#.....H..............#",
    "#.....H..............#",
    "#.....H..............#",
    "#.....H..............#",
    "#.....H..............#",
    "#.....H..............#",
    "#.....H..............#",
    "#..C..H..............#",
    "#.=====..............#",
    "#....................#",
    "#.......===..........#",
    "#....................#",
    "#...........===......#",
    "#....................#",
    "#................#####",
    "#....................#",
    "#...........====.....#",
    "#....................#",
    "#......====..........#",
    "#....................#",
    "#..====..............#",
    "#.S..................#",
    "######################",
  ];
  const MAPS = { tower1: { name: "점프 탑 1", rows: TOWER1 } };

  function parse(rows) {
    const h = rows.length, w = rows[0].length;
    const cell = (x, y) => (x < 0 || x >= w || y < 0 || y >= h ? SOLID : rows[y][x]);
    let start = null, goal = null;
    const checkpoints = [];
    rows.forEach((r, y) => [...r].forEach((c, x) => {
      if (c === "S") start = { x: x + 0.5, y: y + 1 };
      else if (c === "G") goal = { x, y };
      else if (c === "C") checkpoints.push({ x: x + 0.5, y: y + 1 });
    }));
    return { w, h, rows, cell, start, goal, checkpoints };
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

  const api = { PHYS, MAPS, parse, newState, step, standing, onLadder };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.RLJump = api;
})(typeof window !== "undefined" ? window : globalThis);
