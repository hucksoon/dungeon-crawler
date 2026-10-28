// 3D 화면 (dc#109, 시험판): 던전을 1인칭 3D로 그리기만 함. 게임 규칙·상태(지도, 몬스터, 아이템, 싸움)는 index.html 그대로
//   좌표: 1칸 = 1. 지도 칸 (x, y) → 3D (x + 0.5, 높이, y + 0.5). 벽 높이 WALL_H, 눈높이 EYE
//   벽·바닥은 픽셀 그림 모음(img/sprites.png)의 칸을 그대로 무늬로 (가까이 가도 뭉개지지 않게 Nearest)
//   빛: 내가 든 횃불 하나(일렁임) + 옅은 주변광 + 검은 안개 → 다크앤다커처럼 어두운 복도. 구역마다 주변광 색이 다름
//   몬스터·아이템은 늘 나를 보는 그림(빌보드). 그림은 빛을 받지 않아서 횃불과 같은 비율로 거리에 따라 직접 어둡게
//   index.html의 View3D가 import()로 처음 3D를 켤 때만 불러옴 (2D로 하는 사람은 받지 않음)
import * as THREE from "./vendor/three/three.module.min.js";
import { GLTFLoader } from "./vendor/three/addons/loaders/GLTFLoader.js";
import { EffectComposer } from "./vendor/three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "./vendor/three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "./vendor/three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "./vendor/three/addons/postprocessing/OutputPass.js";

export const WALL_H = 1.5, EYE = 0.62;
const AMBIENT = { normal: [0x5a6070, 0.85], nm: [0x5a3d80, 0.9], hell: [0x8a3018, 1.0], gold: [0x7a6420, 0.9] };
const FOG = { normal: 0.2, nm: 0.22, hell: 0.2, gold: 0.18 };
const TORCH = { color: 0xffb36b, intensity: 4.2, distance: 10, decay: 1.05 };

// 손에 드는 무기 (dc#112): KayKit Fantasy Weapons Bits (CC0) 모델. 종류 · 등급 → 모델, 화면에서의 높이(1인칭 카메라 기준)
//   등급이 높을수록 더 화려한 모양. 모델은 손잡이가 원점, 위(+y)로 서 있음
const WEAPON_MODELS = {
  longsword: [["sword_A", "common", "uncommon"], ["sword_B", "rare"], ["sword_C", "epic"], ["sword_D", "legendary", "set"], ["sword_E", "unique"]],
  axe: [["axe_A", "common", "uncommon", "rare"], ["axe_C", "epic"], ["axe_B", "legendary", "set", "unique"]],
  dagger: [["dagger_A", "common", "uncommon", "rare"], ["dagger_B", "epic", "legendary", "set", "unique"]],
  staff: [["staff_A", "common", "uncommon", "rare"], ["staff_B", "epic", "legendary", "set", "unique"]],
  shield: [["shield_A", "common", "uncommon", "rare"], ["shield_B", "epic"], ["shield_C", "legendary", "set", "unique"]],
};
const WEAPON_SIZE = { longsword: 0.56, axe: 0.46, dagger: 0.34, staff: 0.72, shield: 0.32 };
export function weaponModel(type, rarity) {
  const list = WEAPON_MODELS[type];
  if (!list) return null;
  return (list.find(([, ...r]) => r.includes(rarity)) || list[0])[0];
}

export function createView(host, { sheet, S, before = null, bloom = true }) {
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance", preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const canvas = renderer.domElement;
  canvas.id = "game3d";
  canvas.style.removeProperty("display");   // three.js가 넣는 display: block을 빼서 CSS(던전·3D일 때만 보임)를 따름
  host.insertBefore(canvas, before);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  scene.fog = new THREE.FogExp2(0x000000, FOG.normal);
  const camera = new THREE.PerspectiveCamera(72, 4 / 3, 0.05, 40);
  camera.rotation.order = "YXZ";
  const ambient = new THREE.AmbientLight(...AMBIENT.normal);
  const torch = new THREE.PointLight(TORCH.color, TORCH.intensity, TORCH.distance, TORCH.decay);
  scene.add(ambient, torch);

  // ---- 무늬: 그림 모음의 한 칸 → 텍스처 (이름마다 하나) ----
  const texCache = new Map();
  function tex(name, repeat = false) {
    const key = repeat ? name + "|r" : name;
    if (texCache.has(key)) return texCache.get(key);
    const c = S.map[name];
    if (!c) return null;
    const cv = document.createElement("canvas");
    cv.width = cv.height = S.size;
    cv.getContext("2d").drawImage(sheet, c[0] * S.size, c[1] * S.size, S.size, S.size, 0, 0, S.size, S.size);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestMipmapLinearFilter;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    texCache.set(key, t);
    return t;
  }
  // 둥근 빛 (아이템 아래 등급 빛, 스킬 번쩍임)
  const glowTex = (() => {
    const cv = document.createElement("canvas"); cv.width = cv.height = 64;
    const g = cv.getContext("2d"), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.35, "rgba(255,255,255,0.55)"); r.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();

  // ---- 층 (벽·바닥·천장·계단): 층이 바뀔 때만 다시 만듦 ----
  let level = new THREE.Group();
  scene.add(level);
  const wallGeo = new THREE.BoxGeometry(1, WALL_H, 1);
  { // 옆면 무늬를 높이만큼 반복 (늘어나 보이지 않게): 면 순서 +x, −x, +y, −y, +z, −z (면마다 꼭짓점 4개)
    const uv = wallGeo.attributes.uv;
    for (const f of [0, 1, 4, 5]) for (let i = 0; i < 4; i++) uv.setY(f * 4 + i, uv.getY(f * 4 + i) * WALL_H);
    uv.needsUpdate = true;
  }
  const floorGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  function setLevel({ map, W, H, zone, tileVar, WALL, STAIRS }) {
    scene.remove(level);
    level.traverse(o => { if (o.isMesh && o.geometry !== wallGeo && o.geometry !== floorGeo) o.geometry.dispose(); if (o.material && o.material !== stairsMat) o.material.dispose?.(); });
    level = new THREE.Group();
    const [ac, ai] = AMBIENT[zone] || AMBIENT.normal;
    ambient.color.setHex(ac); ambient.intensity = ai;
    scene.fog.density = FOG[zone] || FOG.normal;
    const open = (x, y) => x >= 0 && y >= 0 && x < W && y < H && map[y][x] !== WALL;
    const walls = [[], [], [], []], floors = [[], [], [], []], stairs = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const v = tileVar(x, y) & 3;
      if (map[y][x] === WALL) { if (open(x - 1, y) || open(x + 1, y) || open(x, y - 1) || open(x, y + 1)) walls[v].push([x, y]); }
      else { floors[v].push([x, y]); if (map[y][x] === STAIRS) stairs.push([x, y]); }
    }
    const m4 = new THREE.Matrix4();
    const inst = (geo, mat, cells, yy) => {
      if (!cells.length) return;
      const im = new THREE.InstancedMesh(geo, mat, cells.length);
      cells.forEach(([x, y], i) => im.setMatrixAt(i, m4.makeTranslation(x + 0.5, yy, y + 0.5)));
      im.instanceMatrix.needsUpdate = true;
      level.add(im);
    };
    for (let v = 0; v < 4; v++) {
      const wt = tex(`wall_${zone}_${v}`, true) || tex(`wall_normal_${v}`, true), ft = tex(`floor_${zone}_${v}`) || tex(`floor_normal_${v}`);
      inst(wallGeo, new THREE.MeshLambertMaterial({ map: wt }), walls[v], WALL_H / 2);
      inst(floorGeo, new THREE.MeshLambertMaterial({ map: ft }), floors[v], 0);
    }
    // 천장: 벽 무늬를 어둡게, 지도 전체에 한 장
    const ct = (tex(`wall_${zone}_0`, true) || tex("wall_normal_0", true)).clone();
    ct.repeat.set(W, H); ct.needsUpdate = true;
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, H).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ map: ct, color: 0x6a6258 }));
    ceil.position.set(W / 2, WALL_H, H / 2);
    level.add(ceil);
    // 계단: 바닥보다 살짝 위에, 빛을 받지 않고 은은하게 밝게 (어두워도 보이게)
    for (const [x, y] of stairs) {
      const s = new THREE.Mesh(floorGeo, stairsMat);
      s.position.set(x + 0.5, 0.004, y + 0.5);
      level.add(s);
    }
    scene.add(level);
  }
  const stairsMat = new THREE.MeshBasicMaterial({ map: tex("stairs"), color: 0xffe0a0, transparent: true, alphaTest: 0.2 });

  // ---- 빌보드 (몬스터·아이템·상점·웨이포인트 등): 매 프레임 목록으로 맞춤. key가 같으면 같은 그림을 다시 씀 ----
  const bills = new Map();
  const light = (d) => Math.max(0.1, Math.min(1, 1.5 / (1 + 0.1 * d * d)));   // 횃불 거리 감쇠와 비슷하게
  const tmpColor = new THREE.Color();
  function billboard(key, make) {
    let o = bills.get(key);
    if (!o) { o = make(); scene.add(o.root); bills.set(key, o); }
    o.used = true;
    return o;
  }
  function spriteObj(name) {
    const root = new THREE.Group();
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex(name), transparent: true, alphaTest: 0.35, fog: true }));
    s.center.set(0.5, 0);   // 발이 바닥에
    root.add(s);
    return { root, s, name };
  }
  function bar() {
    const g = new THREE.Group();
    const bg = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x000000, opacity: 0.75, transparent: true, depthTest: true, fog: false }));
    const fg = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x4fd16a, fog: false }));
    fg.center.set(0, 0.5);   // 채운 부분은 왼쪽 끝 기준 (alignBars가 막대 왼쪽 끝에 놓음)
    g.add(bg, fg);
    return { g, bg, fg };
  }
  function glowObj() {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true }));
    return s;
  }
  // list: [{ key, sprite, x, y, w, h, flash(0~1), alpha, tint, hp(0~1|null), barColor, glow(색|null), lift }]
  function syncBills(list, cx, cy) {
    for (const o of bills.values()) o.used = false;
    for (const b of list) {
      const o = billboard(b.key, () => spriteObj(b.sprite));
      if (o.name !== b.sprite) { const t = tex(b.sprite); if (t) { o.s.material.map = t; o.s.material.needsUpdate = true; } o.name = b.sprite; }
      o.root.position.set(b.x + 0.5, b.lift || 0, b.y + 0.5);
      o.s.scale.set(b.w, b.h, 1);
      const k = light(Math.hypot(b.x + 0.5 - cx, b.y + 0.5 - cy));
      tmpColor.setRGB(k, k * 0.92, k * 0.82);   // 횃불빛이라 살짝 노랗게
      if (b.tint) tmpColor.multiply(new THREE.Color(b.tint));
      if (b.flash > 0) tmpColor.lerp(new THREE.Color(1, 0.25, 0.2), Math.min(1, b.flash));
      o.s.material.color.copy(tmpColor);
      o.s.material.opacity = b.alpha ?? 1;
      // HP 막대 (맞았거나 정예·보스)
      if (b.hp != null) {
        if (!o.bar) { o.bar = bar(); o.root.add(o.bar.g); }
        o.bar.g.visible = true;
        const bw = o.bar.bw = Math.max(0.4, b.w * 0.6);
        o.bar.g.position.set(0, b.h + 0.08, 0);
        o.bar.bg.scale.set(bw, 0.04, 1);
        o.bar.fg.scale.set(Math.max(0.01, bw * b.hp), 0.026, 1);
        o.bar.fg.material.color.set(b.barColor || 0x4fd16a);
      } else if (o.bar) o.bar.g.visible = false;
      if (b.glow) {
        if (!o.glow) { o.glow = glowObj(); o.root.add(o.glow); }
        o.glow.visible = true;
        o.glow.material.color.set(b.glow);
        o.glow.material.opacity = 0.35 + 0.25 * Math.sin(performance.now() / 300 + b.x);
        o.glow.position.set(0, 0.06, 0);
        o.glow.scale.set(b.w * 1.6, b.w * 0.9, 1);
      } else if (o.glow) o.glow.visible = false;
    }
    for (const [k, o] of bills) if (!o.used) {
      scene.remove(o.root);
      o.root.traverse(c => c.material?.dispose());
      bills.delete(k);
    }
  }
  // HP 막대의 채운 부분: 막대 왼쪽 끝(화면 기준)에 놓음. 그림(Sprite)은 늘 화면과 나란해서 카메라 오른쪽 방향으로 반 칸만큼 밀면 됨
  const right = new THREE.Vector3();
  function alignBars() {
    right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    for (const o of bills.values()) if (o.bar?.g.visible) o.bar.fg.position.set(-right.x * o.bar.bw / 2, -right.y * o.bar.bw / 2, -right.z * o.bar.bw / 2);
  }

  // ---- 번쩍임 (스킬·맞음): 잠깐 커지며 사라지는 빛 ----
  const flashes = [];
  // 이펙트는 몬스터 그림(같은 자리의 빌보드)에 가려지지 않게 카메라 쪽으로 조금 당김
  function toCam(px, pz, d = 0.4) {
    const dx = camera.position.x - px, dz = camera.position.z - pz, l = Math.hypot(dx, dz) || 1;
    return [px + dx / l * Math.min(d, l * 0.5), pz + dz / l * Math.min(d, l * 0.5)];
  }
  function burst(x, y, color, r = 1, ms = 420, h = 0.5) {
    const s = glowObj();
    s.material.color.set(color);
    const [px, pz] = toCam(x + 0.5, y + 0.5);
    s.position.set(px, h, pz);
    s.renderOrder = 5;
    scene.add(s);
    flashes.push({ s, t0: performance.now(), ms, r });
  }
  function bolt(a, b, color) {   // 두 칸 사이 번개 선
    const pts = [];
    const n = 7;
    for (let i = 0; i <= n; i++) {
      const t = i / n, j = i && i < n ? (Math.random() - 0.5) * 0.35 : 0;
      pts.push(new THREE.Vector3(a.x + 0.5 + (b.x - a.x) * t + j, 0.55 + (Math.random() - 0.5) * 0.2 * (i && i < n), a.y + 0.5 + (b.y - a.y) * t - j));
    }
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color, transparent: true }));
    scene.add(line);
    flashes.push({ s: line, t0: performance.now(), ms: 280, line: true });
  }
  // 속성 입자 (dc#111): flame 불꽃(위로 피어오름) · shard 얼음 조각(튀었다 떨어짐) · spark 전기(빠르게 번쩍)
  const parts = [];
  function sparks(x, y, color, kind = "flame", n = 8) {
    for (let i = 0; i < n; i++) {
      const s = glowObj();
      s.material.color.set(color);
      const a = Math.random() * Math.PI * 2, r = Math.random() * 0.25, [cx, cz] = toCam(x + 0.5, y + 0.5, 0.3);
      s.position.set(cx + Math.cos(a) * r, 0.25 + Math.random() * 0.5, cz + Math.sin(a) * r);
      s.renderOrder = 5;
      const sp = kind === "shard" ? 1.4 : kind === "spark" ? 2.2 : 0.35;
      const v = kind === "flame" ? [Math.cos(a) * 0.15, 0.9 + Math.random() * 0.6, Math.sin(a) * 0.15]
        : [Math.cos(a) * sp * Math.random(), kind === "shard" ? 0.8 + Math.random() : (Math.random() - 0.5) * 2, Math.sin(a) * sp * Math.random()];
      const size = kind === "spark" ? 0.09 + Math.random() * 0.05 : kind === "shard" ? 0.09 + Math.random() * 0.05 : 0.14 + Math.random() * 0.08;
      s.scale.set(size, size, 1);
      scene.add(s);
      parts.push({ s, v, kind, size, t0: performance.now(), ms: kind === "spark" ? 380 + Math.random() * 200 : kind === "shard" ? 700 : 700 + Math.random() * 300 });
    }
  }
  function tickParts(now, dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i], k = (now - p.t0) / p.ms;
      if (k >= 1) { scene.remove(p.s); p.s.material.dispose(); parts.splice(i, 1); continue; }
      if (p.kind === "shard") p.v[1] -= 4 * dt;   // 얼음 조각은 떨어짐
      if (p.kind === "spark" && Math.random() < 0.4) p.v = [(Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3];   // 전기는 이리저리 튐
      p.s.position.x += p.v[0] * dt; p.s.position.y = Math.max(0.03, p.s.position.y + p.v[1] * dt); p.s.position.z += p.v[2] * dt;
      const sz = p.size * (p.kind === "flame" ? 1 - k * 0.7 : 1);
      p.s.scale.set(sz, sz, 1);
      p.s.material.opacity = (p.kind === "spark" ? (Math.random() < 0.7 ? 0.9 : 0.2) : 1 - k) * 0.85;
    }
  }
  let lastT = performance.now();
  function tickFlashes(now) {
    tickParts(now, Math.min(0.1, (now - lastT) / 1000)); lastT = now;
    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i], p = (now - f.t0) / f.ms;
      if (p >= 1) { scene.remove(f.s); f.s.material.dispose(); f.s.geometry?.dispose?.(); flashes.splice(i, 1); continue; }
      if (f.line) f.s.material.opacity = 1 - p;
      else { const k = f.r * (0.6 + 1.6 * p); f.s.scale.set(k, k, 1); f.s.material.opacity = 1 - p; }
    }
  }

  // ---- 손에 든 무기 (dc#112): 따로 그리는 장면(1인칭 손). 벽에 파묻히지 않게 던전 위에 덧그림 ----
  const vm = new THREE.Scene(), vmCam = new THREE.PerspectiveCamera(55, 4 / 3, 0.01, 10);
  const vmAmb = new THREE.AmbientLight(0xffffff, 0.9), vmTorch = new THREE.PointLight(0xffb36b, 2.2, 3, 1.2), vmGlow = new THREE.PointLight(0xffffff, 0, 1.2, 1.5);
  vmTorch.position.set(0.5, 0.2, 0.1); vm.add(vmAmb, vmTorch, vmGlow);
  const loader = new GLTFLoader(), models = new Map();
  const loadModel = (name) => {
    if (!models.has(name)) models.set(name, new Promise(ok => loader.load(`models/weapons/${name}.gltf`, g => ok(g.scene), undefined, () => ok(null))));
    return models.get(name);
  };
  // 오른손·왼손: 손 위치(rest)와 지금 든 것 { key, obj, mats }
  const hands = { r: { key: null, obj: null, mats: [], want: null, root: new THREE.Group() }, l: { key: null, obj: null, mats: [], want: null, root: new THREE.Group() } };
  vm.add(hands.r.root, hands.l.root);
  // 장갑 낀 주먹 (손잡이를 쥔 자리): 어두운 가죽 상자 두 개
  const fist = () => {
    const g = new THREE.Group(), m = new THREE.MeshLambertMaterial({ color: 0x3a281c }), m2 = new THREE.MeshLambertMaterial({ color: 0x4f535c });
    const a = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.065, 0.07), m); g.add(a);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.08, 0.075), m2); b.position.set(0, -0.07, 0.02); g.add(b);   // 손목 보호대
    return g;
  };
  const fistR = fist(), fistL = fist();
  hands.r.root.add(fistR); hands.l.root.add(fistL);
  // 무기 바꾸기: type(longsword…shield)·rarity → 모델. 불러오는 동안은 예전 것 그대로
  function setHand(side, item) {
    const h = hands[side], name = item ? weaponModel(item.type, item.rarity) : null, key = name && `${name}|${item.type}`;
    if (key === h.want) return;
    h.want = key;
    if (!key) { if (h.obj) h.root.remove(h.obj); h.obj = null; h.key = null; h.mats = []; return; }
    loadModel(name).then(src => {
      if (h.want !== key || !src) return;
      if (h.obj) h.root.remove(h.obj);
      const obj = src.clone(true), box = new THREE.Box3().setFromObject(obj), size = box.getSize(new THREE.Vector3());
      obj.scale.setScalar((WEAPON_SIZE[item.type] || 0.5) / Math.max(size.y, 0.01));
      h.mats = [];
      obj.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); h.mats.push(o.material); } });   // 속성 빛을 손마다 따로
      h.root.add(obj); h.obj = obj; h.key = key; h.type = item.type;
    });
  }
  // 손 자세 (카메라 기준 좌표). p: { kr 오른손 휘두름 0~1, kl 왼손, kb 방패 막기, bob, glowR/glowL 속성 색, t 시간 }
  function poseHands(p) {
    const t = p.t / 1000, sway = Math.sin(t * 1.3) * 0.006, bob = (p.bob || 0) * 0.6;
    const R = hands.r, L = hands.l;
    // 오른손: 비스듬히 세워 들고, 휘두르면 오른쪽 위에서 왼쪽 아래로 베어 내림
    const kr = p.kr || 0;
    R.root.visible = !!R.obj;
    R.root.position.set(0.24 - 0.2 * kr, -0.27 + bob + sway + 0.06 * Math.sin(kr * Math.PI), -0.6 - 0.1 * kr);
    R.root.rotation.set(-0.25 - 1.5 * kr, 0.3 - 0.5 * kr, -0.3 + 1.1 * kr);
    // 왼손: 방패는 앞을 막듯이, 막으면 가운데로 들어 올림. 보조 무기는 오른손의 거울
    const kb = p.kb || 0, kl = p.kl || 0;
    L.root.visible = !!L.obj;
    if (L.type === "shield") {
      L.root.position.set(-0.3 + 0.27 * kb, -0.3 + 0.18 * kb + bob - sway, -0.68 + 0.12 * kb);
      L.root.rotation.set(0.05 - 0.15 * kb, 0.55 - 0.55 * kb, 0.05);
      fistL.position.set(0, 0, 0.06);
    } else {
      L.root.position.set(-0.24 + 0.2 * kl, -0.27 + bob - sway + 0.06 * Math.sin(kl * Math.PI), -0.6 - 0.1 * kl);
      L.root.rotation.set(-0.25 - 1.5 * kl, -0.3 + 0.5 * kl, 0.3 - 1.1 * kl);
      fistL.position.set(0, 0, 0);
    }
    // 속성 빛: 무기가 그 색으로 달아오르고(번쩍임 섞어) 주변을 비춤
    const glow = (h, c) => { for (const m of h.mats) { if (c) { m.emissive.set(c); m.emissiveIntensity = 0.28 + 0.12 * Math.sin(t * 6 + (h === L ? 1 : 0)); } else m.emissive.setRGB(0, 0, 0); } };
    glow(R, p.glowR); glow(L, p.glowL);
    const gc = p.glowR || p.glowL;
    vmGlow.intensity = gc ? 0.9 + 0.3 * Math.sin(t * 6) : 0;
    if (gc) { vmGlow.color.set(gc); vmGlow.position.set(p.glowR ? 0.25 : -0.25, -0.1, -0.5); }
    vmTorch.intensity = 2.2 * (p.torch ?? 1);
  }

  // ---- 그리기: 던전 → 손(깊이만 지우고 위에) → 빛 번짐(블룸) → 색 변환 ----
  let composer = null, bloomPass = null;
  if (bloom) {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const handPass = new RenderPass(vm, vmCam); handPass.clear = false; handPass.clearDepth = true;
    composer.addPass(handPass);
    bloomPass = new UnrealBloomPass(new THREE.Vector2(320, 240), 0.55, 0.3, 0.82);   // 세기 · 퍼짐 · 밝은 곳만(문턱)
    composer.addPass(bloomPass);
    composer.addPass(new OutputPass());
  }
  let w0 = 0, h0 = 0;
  function fit() {
    const w = Math.round(canvas.parentElement ? canvas.clientWidth || host.clientWidth : 640), h = Math.round(w * 0.75);
    if (w && (w !== w0 || h !== h0)) {
      w0 = w; h0 = h; renderer.setSize(w, h, false); camera.aspect = vmCam.aspect = w / h; camera.updateProjectionMatrix(); vmCam.updateProjectionMatrix();
      if (composer) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h); bloomPass.resolution.set(w / 2, h / 2); }
    }
  }
  // st: { x, y (칸 단위, 소수), yaw (0 = 위쪽(−y), 오른쪽으로 돌면 +), pitch, bob, torch(0~1 일렁임), bills: [...] }
  function frame(st) {
    fit();
    camera.position.set(st.x, EYE + (st.bob || 0), st.y);
    camera.rotation.set(st.pitch || 0, -st.yaw, st.roll || 0);
    // 횃불: 오른손에 든 것처럼 살짝 앞·오른쪽·아래
    const fx = Math.sin(st.yaw), fz = -Math.cos(st.yaw);
    torch.position.set(st.x + fx * 0.25 - fz * 0.18, EYE + 0.15, st.y + fz * 0.25 + fx * 0.18);
    torch.intensity = TORCH.intensity * (st.torch ?? 1);
    syncBills(st.bills || [], st.x, st.y);
    alignBars();
    tickFlashes(performance.now());
    if (st.hands) { setHand("r", st.hands.right); setHand("l", st.hands.left); poseHands({ ...st.hands, bob: st.bob, torch: st.torch, t: performance.now() }); }
    if (composer) composer.render();
    else {
      renderer.autoClear = true; renderer.render(scene, camera);
      renderer.autoClear = false; renderer.clearDepth(); renderer.render(vm, vmCam); renderer.autoClear = true;
    }
  }
  // 3D의 한 점(칸 x, y, 높이 h) → 캔버스 안의 화면 좌표 (뒤에 있으면 null)
  const v3 = new THREE.Vector3();
  function project(x, y, h = 0.8) {
    v3.set(x, h, y).project(camera);
    if (v3.z > 1 || v3.z < -1) return null;
    return { x: (v3.x + 1) / 2 * canvas.clientWidth, y: (1 - v3.y) / 2 * canvas.clientHeight };
  }
  function dispose() {
    for (const t of texCache.values()) t.dispose();
    renderer.dispose();
    canvas.remove();
  }
  return { canvas, setLevel, frame, project, burst, bolt, sparks, dispose, renderer, get partCount() { return parts.length; },
    // 손에 든 모델 (시험용): 오른손·왼손 모델 이름, 다 불러왔는지
    get hands() {
      return { r: hands.r.key, l: hands.l.key, ready: hands.r.key === hands.r.want && hands.l.key === hands.l.want, bloom: !!composer,
        glow: vmGlow.intensity > 0 ? "#" + vmGlow.color.getHexString() : null, lx: hands.l.root.position.x, lrx: hands.l.root.rotation.x, rrx: hands.r.root.rotation.x };
    } };
}
