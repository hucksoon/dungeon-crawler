// 점프 던전 (dc#82~83): 옆에서 보는 실시간 발판 맵. 물리·맵·몬스터 움직임만 (화면·싸움은 index.html의 Tower)
// 좌표는 칸 단위, x는 몸 가운데, y는 발끝 (아래로 갈수록 커짐). 한 칸 = 화면의 TILE
// 맵 글자: # 돌 블록(사방이 막힘) · = 나무 발판(아래에서는 뚫고 올라가고 위에서만 밟힘) · H 사다리(↑↓로 오르내림, 맨 위는 발판)
//         S 시작 · m 몬스터 · P 포탈(몬스터를 다 잡으면 열림) · C 체크포인트 · G 깃발 · . 빈칸
(function (root) {
  "use strict";
  // 손맛: 점프 높이 약 3.3칸(꾹 누를 때), 한 번에 가로 약 4.5칸. 짧게 누르면 낮게 (0.15초 뒤부터, 떼면 올라가는 속도 절반). 공중에서 한 번 더 뛸 수 있음
  const PHYS = {
    // dc#88: 점프를 높게 (18 → 20, 약 2.7 → 3.3칸), 더블 점프도 (15.5 → 17.5, 둘 다 꾹 누르면 모두 약 5.9칸)
    gravity: 60, maxFall: 20, jumpVel: 20, cutJump: 0.5,
    airJumps: 1, airJumpVel: 17.5,
    minHold: 0.15,   // 뛰고 이만큼(초)은 손을 떼도 낮아지지 않음 (톡 쳐도 2칸 넘게: 휴대폰 버튼·공격 중 짧은 입력)
    run: 7.5, accel: 70, airAccel: 55, friction: 60,
    climb: 5,
    coyote: 0.09,     // 발판 끝을 지나고도 이만큼은 점프 가능 (초)
    buffer: 0.12,     // 내려앉기 직전에 누른 점프도 내려앉자마자 (초)
    w: 0.6, h: 0.9,   // 몸 크기 (칸)
  };
  const SOLID = "#", PLANK = "=", LADDER = "H";

  // 사냥터 1층 (dc#83 → dc#87 → dc#88): 폭 40 × 높이 25, 사다리 없이 발판 14개가 9층으로. 서너 줄 차이까지는 보통 점프, 네 줄 차이는 더블 점프로만 (맨 위 포함)
  // m 몬스터 10마리 (층마다 흩어 놓음), P 포탈(다 잡으면 열림), 맨 위 긴 발판 가운데는 보스 자리 (헬 50층)
  const HUNT1 = [
    "########################################",
    "#......................................#",
    "#.........=====================........#",
    "#......................................#",
    "#......................................#",
    "#....................m.................#",
    "#.................=======..............#",
    "#......................................#",
    "#.....=========........................#",
    "#...........................m..........#",
    "#........................=======.......#",
    "#................m.....................#",
    "#======......=========.................#",
    "#......................................#",
    "#...............................======.#",
    "#.........m............m...............#",
    "#......=========....=======............#",
    "#......................................#",
    "#............................==========#",
    "#...m...............m..................#",
    "#==========....===========.............#",
    "#......................................#",
    "#....====......................====....#",
    "#.S...........m.....P.....m.........m..#",
    "########################################",
  ];
  // zone: 몬스터·저항 기준 (normal 일반 던전 / hell 헬). hell50은 운영자 시험용 (같은 맵, 헬 50층 몬스터)
  const MAPS = { hunt1: { name: "사냥터 1층", depth: 1, rows: HUNT1 }, hell50: { name: "헬 50층 (운영자 시험)", depth: 50, zone: "hell", staff: true, rows: HUNT1, crowd: true, boss: { x: 20.5, y: 2 } } };
  // crowd: 몬스터 수는 던전 그 층과 같게 (m 자리 대신 발판 곳곳에 흩어 놓음). boss: 보스가 서는 곳 (맨 위 발판 가운데)

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
      time: 0, done: false, respawn: { ...map.start }, falls: 0, jumped: 0, landed: 0, airJumps: 0, doubled: 0 };
  }

  const solidAt = (map, tx, ty) => map.cell(tx, ty) === SOLID;
  const ladderAt = (map, tx, ty) => map.cell(tx, ty) === LADDER;
  // 위에서만 밟히는 칸: 나무 발판, 사다리 맨 위 (위 칸이 사다리가 아닐 때)
  const oneWayAt = (map, tx, ty) => map.cell(tx, ty) === PLANK || (ladderAt(map, tx, ty) && !ladderAt(map, tx, ty - 1));
  // 몸 크기: 플레이어는 PHYS.w × PHYS.h, 몬스터는 s.w × s.h (보스는 더 큼)
  const wOf = (s) => s.w ?? PHYS.w, hOf = (s) => s.h ?? PHYS.h;
  const span = (s) => [Math.floor(s.x - wOf(s) / 2 + 1e-6), Math.floor(s.x + wOf(s) / 2 - 1e-6)];
  // 몸이 사다리 칸에 걸쳐 있는지 (가운데 기준)
  const onLadder = (map, s) => ladderAt(map, Math.floor(s.x), Math.floor(s.y - 0.05)) || ladderAt(map, Math.floor(s.x), Math.floor(s.y - hOf(s) / 2));
  // 발밑에 밟을 수 있는 게 있는지 (발끝이 칸 경계에 있을 때)
  function standing(map, s) {
    if (Math.abs(s.y - Math.round(s.y)) > 1e-4) return false;
    const ty = Math.round(s.y), [x0, x1] = span(s);
    for (let tx = x0; tx <= x1; tx++) if (solidAt(map, tx, ty) || oneWayAt(map, tx, ty)) return true;
    return false;
  }

  // 한 걸음 (dt초). input = { left, right, up, down, jump (이번에 눌렀음), jumpHeld (누르고 있음), slow (달리기 배율, 얼음으로 느려질 때 1 미만) }
  function step(map, s, input, dt) {
    if (s.done) return s;
    s.time += dt;
    const P = PHYS, run = P.run * (input.slow ?? 1);
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
      s.airJumps = 0;   // 사다리를 잡으면 더블 점프가 다시 생김
      if (s.buffer > 0) { s.climbing = false; s.vy = -P.jumpVel * 0.8; s.vx = dir * run; s.buffer = 0; s.jumped++; s.ground = false; }   // 점프로 떠남
      else if (dir && !input.up && !input.down) { s.climbing = false; s.vx = dir * run * 0.5; }   // 옆으로 떨어져 나감
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
    if (dir) s.vx = clamp(s.vx + dir * acc * dt, -run, run);
    else { const f = (s.ground ? P.friction : P.airAccel * 0.5) * dt; s.vx = Math.abs(s.vx) <= f ? 0 : s.vx - Math.sign(s.vx) * f; }

    // 점프: 땅이거나 방금 떨어졌을 때(코요테)
    if (s.ground) s.coyote = P.coyote; else s.coyote = Math.max(0, s.coyote - dt);
    if (s.buffer > 0 && s.coyote > 0) { s.vy = -P.jumpVel; s.buffer = 0; s.coyote = 0; s.ground = false; s.jumped++; s.jumpT = 0; }
    // 더블 점프: 공중에서 새로 누른 순간 (발판 근처에서 미리 누른 것은 내려앉은 뒤 보통 점프로 쓰지 않게 지움)
    else if (input.jump && !s.ground && !s.noAirJump && s.airJumps < P.airJumps) { s.vy = -P.airJumpVel; s.buffer = 0; s.airJumps++; s.doubled++; s.jumpT = 0; if (dir) s.vx = dir * run; }
    s.jumpT = (s.jumpT ?? 9) + dt;
    if (!input.jumpHeld && s.vy < 0 && s.jumpT > P.minHold) s.vy *= Math.pow(P.cutJump, dt * 30);   // 일찍 떼면 낮게 (뛰고 minHold초 뒤부터)

    s.vy = Math.min(P.maxFall, s.vy + P.gravity * dt);
    moveX(map, s, s.vx * dt);
    const wasGround = s.ground;
    moveY(map, s, s.vy * dt, input.down);
    if (s.ground && !wasGround) s.landed++;
    if (s.ground) s.airJumps = 0;
    return finish(map, s);
  }

  function moveX(map, s, dx) {
    if (!dx) return;
    s.x += dx;
    const [x0, x1] = span(s), y0 = Math.floor(s.y - hOf(s) + 1e-6), y1 = Math.floor(s.y - 1e-6);
    for (let ty = y0; ty <= y1; ty++) {
      if (dx > 0 && solidAt(map, x1, ty)) { s.x = x1 - wOf(s) / 2; s.vx = 0; return; }
      if (dx < 0 && solidAt(map, x0, ty)) { s.x = x0 + 1 + wOf(s) / 2; s.vx = 0; return; }
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
      const head = s.y - hOf(s), ty = Math.floor(head);
      for (let tx = x0; tx <= x1; tx++) if (solidAt(map, tx, ty)) { s.y = ty + 1 + hOf(s); s.vy = 0; return; }
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

  // ---- 몬스터: 플레이어와 같은 물리(step)로 움직이고, 생각(mobInput)이 키 대신 입력을 만듦 ----
  // 쫓기: 가로 aggro칸 · 위아래 senseY줄 안에 플레이어가 있으면
  //   같은 높이 → 그쪽으로 달려감 (닿으면 멈춰 싸움)
  //   위에 있으면 → 위(1~4줄)의 가까운 발판 밑으로 가서 뛰어오름 (3~4줄이면 더블 점프)
  //   아래에 있으면 → 발판을 뚫고 내려가거나(↓) 발판 끝에서 뛰어내림
  // 돌아다니기: 걷다 쉬다, 발판 끝에서는 대개 돌아서고 가끔 뛰어내림, 가끔 위 발판으로 뛰거나 아래로 내려감
  // 몬스터도 더블 점프 (공중에서 한 번 더): 높은 발판과 넓은 틈
  const MOB = { w: 0.8, h: 0.9, speed: 2, chase: 3.2, aggro: 8, senseY: 7, think: 0.15, jumpHold: 0.32, djAt: 0.3 };
  // w·h: 몸 크기 (보스는 더 큼)
  function newMob(map, at, rand = Math.random, w = MOB.w, h = MOB.h) {
    return { ...newState(map), x: at.x, y: at.y, w, h, respawn: { x: at.x, y: at.y }, face: rand() < 0.5 ? -1 : 1,
      think: rand() * MOB.think, plan: {}, hold: 0, act: "walk", actT: rand() * 2 };
  }
  // 발판 곳곳에 n자리 (밟을 수 있는 칸마다 고르게, 시작 근처 avoid칸은 뺌). 칸 하나에 여러 마리도 됨
  function spawnSpots(map, n, rand = Math.random, avoid = 6) {
    const cells = [];
    for (let y = 1; y < map.h; y++) for (let x = 1; x < map.w - 1; x++) {
      const c = map.cell(x, y);
      if ((c === SOLID || oneWayAt(map, x, y)) && map.cell(x, y - 1) !== SOLID && !ladderAt(map, x, y - 1) && !(y === map.start.y && Math.abs(x + 0.5 - map.start.x) < avoid)) cells.push({ x: x + 0.5, y });
    }
    return Array.from({ length: n }, () => { const c = cells[Math.floor(rand() * cells.length)]; return { x: c.x + (rand() - 0.5) * 0.6, y: c.y }; });
  }
  const standable = (map, tx, ty) => solidAt(map, tx, ty) || oneWayAt(map, tx, ty);
  // 발밑이 뚫고 내려갈 수 있는 칸(나무 발판·사다리 맨 위)인지
  const onOneWay = (map, m) => { const [x0, x1] = span(m); for (let tx = x0; tx <= x1; tx++) if (solidAt(map, tx, m.y)) return false; return true; };
  // 위(1~4줄)에 뛰어오를 수 있는 발판이 있는 칸 { x: 가운데, rise: 몇 줄 위 } (near칸 안). 여러 개면 가깝고 낮고 플레이어(px) 쪽인 칸, 없으면 null
  function plankAbove(map, m, near, px = m.x) {
    let best = null, score = Infinity;
    for (let c = Math.floor(m.x) - near; c <= Math.floor(m.x) + near; c++) for (let r = 1; r <= 4; r++) {
      if (!oneWayAt(map, c, m.y - r)) continue;
      let blocked = false;
      for (let k = 1; k <= r + 1; k++) if (solidAt(map, c, m.y - k)) blocked = true;
      if (blocked) continue;
      const sc = Math.abs(c + 0.5 - m.x) + 0.5 * Math.abs(c + 0.5 - px) + r * 0.3;
      if (sc < score) { score = sc; best = { x: c + 0.5, rise: r }; }
      break;   // 이 열에서는 가장 낮은 발판만
    }
    return best;
  }
  // p: 플레이어 { x, y(발 디딘 높이) }. 생각은 think초마다 (덜 떨림), 입력은 매 걸음
  function plan(map, m, p, rand) {
    const dx = p ? p.x - m.x : 0, dy = p ? p.y - m.y : 0, chase = !!p && Math.abs(dx) <= MOB.aggro && Math.abs(dy) <= MOB.senseY;
    const slow = (chase ? MOB.chase : MOB.speed) / PHYS.run, toward = (x) => (Math.abs(x - m.x) < 0.15 ? 0 : Math.sign(x - m.x));
    if (!m.ground) return { dir: chase ? Math.sign(dx) : m.face, slow, down: m.y < (m.dropY ?? -9) + 0.5 };
    if (chase) return { ...chasePlan(), chase: true };
    function chasePlan() {
      if (dy < -1.2) {   // 위에 있음: 가까운(7칸) 발판 밑으로 가서 뛰어오르기 (3~4줄이면 더블 점프) → 없으면 그쪽으로 걷기
        const pa = plankAbove(map, m, 7, p.x);
        if (pa) return toward(pa.x) ? { dir: toward(pa.x), slow, jump: Math.abs(pa.x - m.x) < 0.45, rise: pa.rise } : { jump: true, slow, rise: pa.rise };
        return { dir: Math.sign(dx), slow };
      }
      if (dy > 1.2) return onOneWay(map, m) ? { down: true, slow } : { dir: Math.sign(dx) || m.face, slow };   // 아래에 있음: 뚫고 내려가기 / 끝에서 뛰어내리기
      return Math.abs(dx) < 0.3 ? { slow } : { dir: Math.sign(dx), slow };
    }
    // 돌아다니기: 쉬기 20% · 위로 가기 18% (가까운 발판 밑으로 가서 뜀) · 아래로 7% · 걷기
    m.actT -= MOB.think;
    if (m.actT <= 0) {
      const r = rand();
      m.act = "walk"; m.actT = 1.5 + rand() * 2.5;
      if (r < 0.2) { m.act = "pause"; m.actT = 0.4 + rand() * 0.8; }
      else if (r < 0.38) { const pa = plankAbove(map, m, 5); if (pa) { m.act = "up"; m.goX = pa.x; m.goRise = pa.rise; m.actT = 3; } }
      else if (r < 0.45 && onOneWay(map, m)) { m.act = "drop"; m.actT = 0.3; }
      if (m.act === "walk" && rand() < 0.5) m.face = -m.face;
    }
    if (m.act === "pause") return { slow };
    if (m.act === "drop") { m.act = "walk"; return { down: true, slow }; }
    if (m.act === "up") {
      if (toward(m.goX)) return { dir: toward(m.goX), slow };
      m.act = "walk"; m.actT = 1 + rand() * 2;
      return { jump: true, slow, rise: m.goRise };
    }
    // 발판 끝: 대개 돌아서고 가끔(10%) 그대로 뛰어내림
    const ahead = Math.floor(m.x + m.face * (wOf(m) / 2 + 0.15));
    if (!standable(map, ahead, m.y) && !m.edgeGo) { if (rand() < 0.1) m.edgeGo = true; else m.face = -m.face; }
    else if (standable(map, ahead, m.y)) m.edgeGo = false;
    return { dir: m.face, slow };
  }
  // 몬스터 한 걸음의 입력 (busy: 플레이어와 닿아 싸우는 중이면 서서 싸움)
  // 쫓는 중 발판 끝에 닿으면: 플레이어가 같은 높이나 위면 건너뛰고(점프), 아래면 그대로 뛰어내림
  function mobInput(map, m, p, dt, rand = Math.random, busy = false) {
    m.hold = Math.max(0, m.hold - dt);
    m.think -= dt;
    if (m.think <= 0) { m.think = MOB.think; m.plan = plan(map, m, p, rand); }
    const pl = m.plan || {};
    // 틈 건너기는 더블 점프까지 (rise 3)
    if (pl.chase && pl.dir && m.ground && !m.climbing && p && p.y - m.y < 0.5 && !standable(map, Math.floor(m.x + pl.dir * (wOf(m) / 2 + 0.05)), m.y)) { pl.jump = true; pl.rise = 3; }
    if (busy && !m.climbing) return { slow: pl.slow ?? 0.3, jumpHeld: m.hold > 0 };
    // ↓: 땅(발판)이나 사다리에서 누르기 시작하고, 떨어지는 중에는 발판 하나를 뚫는 동안만 (그 아래 발판에는 내려섬)
    if (pl.down && m.ground && !m.climbing) m.dropY = m.y;
    const down = !!pl.down && (m.ground || m.climbing || m.y < (m.dropY ?? -9) + 0.5);
    const inp = { left: pl.dir < 0, right: pl.dir > 0, up: !!pl.up, down, jump: false, jumpHeld: m.hold > 0, slow: pl.slow ?? 0.3 };
    if (pl.jump && m.ground && !m.climbing) { inp.jump = inp.jumpHeld = true; m.hold = MOB.jumpHold; m.djT = (pl.rise || 0) > 2 ? MOB.djAt : 0; pl.jump = false; }
    // 더블 점프: 뛰고 djAt초 뒤 (거의 꼭대기에서) 한 번 더, 그 뒤로도 꾹
    else if (m.djT > 0 && !m.ground) { m.djT -= dt; if (m.djT <= 0) { inp.jump = inp.jumpHeld = true; m.hold = MOB.jumpHold; } }
    return inp;
  }
  // 플레이어와 몬스터가 닿았는지 (가로로 몸이 겹치거나 바로 옆, 세로로 몸이 겹침)
  const touching = (s, m) => Math.abs(s.x - m.x) < (PHYS.w + wOf(m)) / 2 + 0.15 && s.y - PHYS.h < m.y + 0.05 && m.y - hOf(m) < s.y + 0.05;
  // 스킬 거리 (칸, 대각선도 1칸): 몸 가운데끼리
  const reach = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs((a.y - PHYS.h / 2) - (b.y - hOf(b) / 2)));

  const api = { PHYS, MOB, MAPS, parse, newState, step, standing, onLadder, newMob, spawnSpots, mobInput, touching, reach };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.RLJump = api;
})(typeof window !== "undefined" ? window : globalThis);
