// 소리 (dc#99): 효과음과 배경 음악을 파일 없이 Web Audio로 합성 (8비트 느낌, 저작권 걱정 없음)
// - 효과음: RLSound.play("hit") 처럼 이름으로. 같은 소리는 짧은 간격 안에 한 번만, 동시에 너무 많이 울리지 않게
// - 배경 음악: RLSound.music("town" | "dungeon" | "nightmare" | "hell" | "gold" | "boss"). 같은 곡이면 그대로, 바뀌면 천천히 넘어감
// - 브라우저는 사용자가 한 번 누르기 전에는 소리를 못 내므로, 첫 키·클릭·터치 때 소리를 켬
// - 설정(효과음·음악 켜기와 크기)은 이 기기에 저장 (rl_sound)
(function (root) {
  "use strict";
  const KEY = "rl_sound";
  const DEFAULTS = { sfxOn: true, bgmOn: true, sfx: 0.7, bgm: 0.45 };
  let cfg = { ...DEFAULTS };
  try { cfg = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch {} };

  let ctx = null, master = null, sfxBus = null, bgmBus = null, noiseBuf = null, unlocked = false, outNode = null;
  const recent = [];   // 최근에 낸 효과음 이름 (테스트·확인용)
  const lastAt = {};   // 같은 소리 너무 자주 내지 않기
  let voices = 0;
  const MAX_VOICES = 28;

  function init() {
    if (ctx) return ctx;
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
    master.connect(comp).connect(ctx.destination);
    outNode = comp;
    sfxBus = ctx.createGain(); sfxBus.connect(master);
    bgmBus = ctx.createGain(); bgmBus.connect(master);
    applyVolumes();
    // 소음 (1초, 계속 다시 씀)
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  }
  function applyVolumes() {
    if (!ctx) return;
    const t = ctx.currentTime;
    sfxBus.gain.setTargetAtTime(cfg.sfxOn ? cfg.sfx : 0, t, 0.03);
    bgmBus.gain.setTargetAtTime(cfg.bgmOn ? cfg.bgm * 0.9 : 0, t, 0.1);
  }
  // 첫 누르기에 소리 켜기 (그 전에는 만들지 않음: 브라우저 경고 막기)
  function unlock() {
    if (!init()) return;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    unlocked = true;
    if (want) startMusic(want);
  }
  for (const ev of ["keydown", "pointerdown", "touchstart"]) root.addEventListener?.(ev, unlock, { capture: true, passive: true });
  // 다른 탭으로 가면 멈춤 (배터리)
  root.document?.addEventListener("visibilitychange", () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend().catch(() => {}); else if (unlocked) ctx.resume().catch(() => {});
  });

  // ---- 소리 조각 ----
  const ready = () => ctx && unlocked && ctx.state !== "closed";
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  // 음 하나: 파형, 시작·끝 주파수, 길이, 크기, 시작 시각(지금부터 초), 나가는 곳
  function tone(type, f0, f1, dur, vol, at = 0, out = sfxBus, opt = {}) {
    const t = ctx.currentTime + at, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(20, f0), t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    if (opt.detune) o.detune.value = opt.detune;
    const a = opt.attack ?? 0.004;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o;
    if (opt.lp) { const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = opt.lp; node.connect(f); node = f; }
    node.connect(g).connect(out);
    o.start(t); o.stop(t + dur + 0.02);
    if (out === sfxBus) { voices++; o.onended = () => { voices--; }; }
  }
  // 소음: 필터 종류, 필터 주파수 시작·끝, 길이, 크기
  function noise(ftype, f0, f1, dur, vol, at = 0, out = sfxBus, q = 1) {
    const t = ctx.currentTime + at, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; s.loop = true;
    f.type = ftype; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(out);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
    if (out === sfxBus) { voices++; s.onended = () => { voices--; }; }
  }
  const jit = (f, p = 0.08) => f * (1 + (Math.random() * 2 - 1) * p);

  // ---- 효과음 ----
  const SFX = {
    // 휘두르기: 바람 가르는 소리
    swing() { noise("bandpass", jit(1400), 380, 0.11, 0.22, 0, sfxBus, 1.4); },
    // 맞힘: 둔탁한 타격
    hit() { tone("square", jit(190), 55, 0.08, 0.2, 0, sfxBus, { lp: 1400 }); noise("lowpass", 1800, 300, 0.06, 0.28); },
    // 치명타: 타격 + 쇳소리 두 번
    crit() {
      tone("square", jit(220), 50, 0.1, 0.24, 0, sfxBus, { lp: 1600 }); noise("lowpass", 2600, 300, 0.08, 0.34);
      tone("triangle", 1250, 1900, 0.14, 0.16, 0.01); tone("triangle", 1900, 2500, 0.12, 0.1, 0.06);
    },
    // 내가 맞음: 낮고 거친 소리
    hurt() { tone("sawtooth", jit(150), 60, 0.16, 0.16, 0, sfxBus, { lp: 900 }); noise("lowpass", 900, 200, 0.12, 0.22); },
    // 방패로 막음: 금속 '쨍'
    block() { tone("square", 1180, 1100, 0.2, 0.09); tone("square", 1660, 1580, 0.24, 0.07, 0.005); noise("highpass", 3000, 2500, 0.08, 0.18); },
    // 피함: 짧게 올라가는 바람
    dodge() { noise("bandpass", 400, 2200, 0.12, 0.18, 0, sfxBus, 2); },
    // 처치: 내려가는 '뿅'
    kill() { tone("triangle", jit(520), 110, 0.2, 0.2); tone("square", 260, 70, 0.12, 0.06, 0.02, sfxBus, { lp: 1200 }); },
    // 보스·네임드 처치: 폭발 + 올라가는 음
    bossKill() {
      noise("lowpass", 1200, 60, 0.9, 0.5); tone("sine", 110, 35, 0.8, 0.4);
      [60, 64, 67, 72, 76].forEach((m, i) => tone("square", mtof(m), mtof(m), 0.18, 0.08, 0.25 + i * 0.09, sfxBus, { lp: 3000 }));
    },
    // ---- 속성 ----
    // 불: 지글지글 + 낮은 '훅'
    fire() {
      noise("bandpass", 1800, 900, 0.22, 0.2, 0, sfxBus, 0.8); tone("sawtooth", 130, 70, 0.18, 0.08, 0, sfxBus, { lp: 600 });
      for (let i = 0; i < 4; i++) noise("highpass", 3500, 3500, 0.025, 0.12, 0.03 + Math.random() * 0.15);
    },
    // 얼음: 맑은 '찡' (유리 소리)
    ice() { tone("triangle", 2300, 2100, 0.2, 0.12); tone("sine", 3150, 2900, 0.26, 0.08, 0.02); noise("highpass", 6000, 6000, 0.08, 0.06); },
    // 번개: '지직'
    bolt() {
      tone("sawtooth", 1900, 180, 0.13, 0.11, 0, sfxBus, { lp: 4500 });
      for (let i = 0; i < 3; i++) noise("highpass", 2500, 2500, 0.03, 0.2, i * 0.035);
    },
    // ---- 세트·룬워드 스킬 ----
    // 파이어볼: 날아가는 '휘익' → 터지는 '쾅' (날아가는 시간 뒤)
    fireball(fly = 0.17) {
      noise("bandpass", 300, 1600, fly, 0.22, 0, sfxBus, 1.2);
      noise("lowpass", 1400, 90, 0.5, 0.48, fly); tone("sine", 120, 38, 0.45, 0.38, fly);
      for (let i = 0; i < 5; i++) noise("highpass", 3000, 3000, 0.03, 0.12, fly + 0.05 + Math.random() * 0.3);
    },
    // 프로스트 노바: 퍼지는 얼음 결정 소리
    nova() {
      noise("highpass", 2500, 7000, 0.35, 0.12);
      [84, 88, 91, 96, 100].forEach((m, i) => tone("triangle", mtof(m), mtof(m) * 0.97, 0.3, 0.07, i * 0.035));
      tone("sine", 600, 200, 0.4, 0.12, 0, sfxBus);
    },
    // 체인 라이트닝: 튕길 때마다 '지직' (step = 한 번 튕기는 시간)
    chain(n = 3, step = 0.07) {
      for (let k = 0; k <= n; k++) {
        tone("sawtooth", jit(2000 - k * 150, 0.05), 200, 0.1, 0.1, k * step, sfxBus, { lp: 5000 });
        noise("highpass", 2800, 2800, 0.05, 0.22, k * step);
      }
    },
    // 회전 베기: 두 번 도는 바람
    whirl() { noise("bandpass", 500, 1800, 0.14, 0.22, 0, sfxBus, 1.3); noise("bandpass", 1800, 500, 0.14, 0.2, 0.12, sfxBus, 1.3); },
    // 처치 폭발
    blast() { noise("lowpass", 1600, 80, 0.45, 0.42); tone("sine", 140, 40, 0.35, 0.3); },
    // ---- 아이템·진행 ----
    gold() { tone("square", 988, 988, 0.07, 0.07, 0, sfxBus, { lp: 3500 }); tone("square", 1319, 1319, 0.16, 0.07, 0.06, sfxBus, { lp: 3500 }); },
    pickup() { tone("triangle", 660, 990, 0.09, 0.12); },
    // 좋은 장비가 떨어짐: 등급마다 다르게 (rare 화음, legendary·set·unique 반짝이는 아르페지오)
    drop(rarity = "rare") {
      if (rarity === "rare") { [76, 79].forEach((m, i) => tone("triangle", mtof(m), mtof(m), 0.25, 0.1, i * 0.06)); return; }
      if (rarity === "epic") { [72, 76, 79, 84].forEach((m, i) => tone("triangle", mtof(m), mtof(m), 0.3, 0.1, i * 0.06)); return; }
      const notes = rarity === "unique" ? [74, 78, 81, 86, 90] : rarity === "set" ? [71, 76, 80, 83, 88] : [72, 76, 79, 84, 88];
      notes.forEach((m, i) => { tone("square", mtof(m), mtof(m), 0.32, 0.07, i * 0.07, sfxBus, { lp: 4000 }); tone("sine", mtof(m + 12), mtof(m + 12), 0.4, 0.05, i * 0.07 + 0.02); });
      noise("highpass", 6000, 9000, 0.6, 0.05, 0.1);
    },
    potion() { [0, 0.07, 0.14].forEach((at, i) => tone("sine", 320 + i * 90, 620 + i * 90, 0.07, 0.14, at)); },
    levelup() { [60, 64, 67, 72, 67, 72, 76].forEach((m, i) => tone("square", mtof(m), mtof(m), i === 6 ? 0.5 : 0.12, 0.08, i * 0.08, sfxBus, { lp: 3200 })); },
    stairs() { [0, 0.11, 0.22].forEach((at, i) => { tone("triangle", 330 - i * 60, 260 - i * 60, 0.08, 0.14, at); noise("lowpass", 700, 300, 0.05, 0.12, at); }); },
    portal() { tone("sine", 200, 1300, 0.6, 0.14, 0, sfxBus, { detune: 0 }); tone("triangle", 300, 1800, 0.6, 0.06, 0.04); noise("bandpass", 600, 3000, 0.6, 0.08, 0, sfxBus, 3); },
    waypoint() { [67, 74, 79, 86].forEach((m, i) => tone("sine", mtof(m), mtof(m), 0.6, 0.1, i * 0.1)); },
    tomb() { for (let i = 0; i < 6; i++) tone("square", jit(1200 + i * 120, 0.03), 1500 + i * 120, 0.08, 0.06, i * 0.06, sfxBus, { lp: 4000 }); },
    death() { [64, 60, 57, 52].forEach((m, i) => tone("triangle", mtof(m), mtof(m) * 0.98, 0.45, 0.14, i * 0.28)); tone("sine", 80, 40, 1.4, 0.2, 0.2); },
    buy() { tone("square", 1568, 1568, 0.06, 0.06, 0, sfxBus, { lp: 4000 }); tone("square", 2093, 2093, 0.18, 0.06, 0.06, sfxBus, { lp: 4000 }); },
    enhance() { tone("square", 400, 400, 0.05, 0.1, 0, sfxBus, { lp: 2000 }); noise("highpass", 2000, 2000, 0.05, 0.15); tone("triangle", 1500, 2400, 0.25, 0.1, 0.05); },
  };
  // 같은 소리를 다시 낼 수 있는 최소 간격 (초). 여러 마리를 한 번에 때려도 귀가 아프지 않게
  const GAP = { hit: 0.05, crit: 0.06, kill: 0.06, fire: 0.12, ice: 0.12, bolt: 0.09, gold: 0.08, pickup: 0.06, hurt: 0.08, swing: 0.05, blast: 0.1 };

  function play(name, ...args) {
    recent.push(name); if (recent.length > 60) recent.shift();
    if (!cfg.sfxOn || !ready() || !SFX[name]) return false;
    if (voices > MAX_VOICES) return false;
    const now = ctx.currentTime, gap = GAP[name] ?? 0.03;
    if (lastAt[name] != null && now - lastAt[name] < gap) return false;
    lastAt[name] = now;
    try { SFX[name](...args); } catch { return false; }
    return true;
  }

  // ---- 배경 음악: 화음 진행으로 베이스·아르페지오·멜로디·드럼을 만들어 반복 ----
  // 곡마다 같은 씨앗이면 같은 멜로디 (반복해도 같은 곡)
  const rng = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  // chords: 한 마디에 하나 (근음 MIDI, 단조면 m). scale: 멜로디가 쓰는 음. drums: 16칸 (k 킥, s 스네어, h 하이햇)
  const TRACKS = {
    town:      { bpm: 92,  seed: 11, chords: ["C", "G", "Am", "F", "C", "G", "F", "G"], key: 60, scale: [0, 2, 4, 7, 9], lead: "triangle", arp: "triangle", bass: "triangle", drums: "k.....h.k.h...h.", density: 0.55, leadVol: 0.11, arpVol: 0.035 },
    dungeon:   { bpm: 80,  seed: 23, chords: ["Am", "F", "G", "Em", "Am", "F", "Dm", "E"], key: 57, scale: [0, 2, 3, 7, 8], lead: "triangle", arp: "square", bass: "triangle", drums: "k.......k...s...", density: 0.32, leadVol: 0.08, arpVol: 0.022 },
    nightmare: { bpm: 96,  seed: 37, chords: ["Dm", "A#", "Gm", "A", "Dm", "A#", "C", "A"], key: 62, scale: [0, 1, 3, 5, 7, 8], lead: "square", arp: "square", bass: "sawtooth", drums: "k...s..hk.k.s..h", density: 0.4, leadVol: 0.06, arpVol: 0.025 },
    hell:      { bpm: 124, seed: 53, chords: ["Em", "F", "Em", "D", "Em", "F", "G", "F#"], key: 64, scale: [0, 1, 4, 5, 7, 8], lead: "sawtooth", arp: "square", bass: "sawtooth", drums: "k.hkk.h.s.hkk.hs", density: 0.5, leadVol: 0.05, arpVol: 0.025, eighthBass: true },
    gold:      { bpm: 112, seed: 71, chords: ["D", "A", "Bm", "G", "D", "A", "G", "A"], key: 62, scale: [0, 2, 4, 7, 9], lead: "square", arp: "triangle", bass: "triangle", drums: "k...s...k.k.s..h", density: 0.6, leadVol: 0.06, arpVol: 0.03 },
    boss:      { bpm: 136, seed: 89, chords: ["Am", "Am", "F", "G", "Am", "Am", "A#", "E"], key: 57, scale: [0, 1, 3, 5, 7, 8], lead: "sawtooth", arp: "square", bass: "sawtooth", drums: "k.hsk.hsk.hsk.ss", density: 0.6, leadVol: 0.05, arpVol: 0.03, eighthBass: true },
  };
  const NOTE = { C: 0, "C#": 1, D: 2, "D#": 3, E: 4, F: 5, "F#": 6, G: 7, "G#": 8, A: 9, "A#": 10, B: 11 };
  const chordOf = (name) => { const m = name.endsWith("m"), r = NOTE[m ? name.slice(0, -1) : name]; return { root: r, tones: [r, r + (m ? 3 : 4), r + 7] }; };
  // 곡을 칸(16분음표) 단위 악보로 미리 만듦
  function compose(tr) {
    const r = rng(tr.seed), steps = [];
    tr.chords.forEach((cn) => {
      const c = chordOf(cn);
      for (let i = 0; i < 16; i++) {
        const st = { bass: null, arp: null, lead: null, dur: 1, drum: tr.drums[i] };
        // 베이스: 마디 첫 칸·가운데 (빠른 곡은 8분음표마다)
        if (tr.eighthBass ? i % 2 === 0 : (i === 0 || i === 8 || (i === 14 && r() < 0.4))) st.bass = 36 + c.root;
        // 아르페지오: 화음을 차례로
        if (i % 2 === 0) st.arp = 60 + c.tones[(i / 2) % 3] + (i >= 8 ? 12 : 0);
        // 멜로디: 화음 음을 중심으로, 곡마다 정해진 밀도로 (마디 끝은 쉼)
        if (i % 2 === 0 && i < 14 && r() < tr.density) {
          const deg = tr.scale[Math.floor(r() * tr.scale.length)];
          const near = r() < 0.6 ? c.tones[Math.floor(r() * 3)] : (tr.key % 12) + deg;
          st.lead = 72 + (near % 12) - (near % 12 > 7 ? 12 : 0);
          st.dur = r() < 0.3 ? 4 : 2;
        }
        steps.push(st);
      }
    });
    return steps;
  }
  const SCORES = {};
  let want = null, playing = null, step = 0, nextAt = 0, timer = null, trackGain = null;

  function drum(kind, t, out) {
    if (kind === "k") {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sine"; o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
      g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      o.connect(g).connect(out); o.start(t); o.stop(t + 0.18);
    } else {
      const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = noiseBuf; f.type = kind === "h" ? "highpass" : "bandpass"; f.frequency.value = kind === "h" ? 7000 : 1800;
      const len = kind === "h" ? 0.04 : 0.12, v = kind === "h" ? 0.08 : 0.2;
      g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      s.connect(f).connect(g).connect(out); s.start(t, Math.random() * 0.5); s.stop(t + len + 0.02);
    }
  }
  function note(type, midi, t, dur, vol, out, lp) {
    const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    o.type = type; o.frequency.value = mtof(midi);
    f.type = "lowpass"; f.frequency.value = lp;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.setTargetAtTime(vol * 0.6, t + 0.02, dur * 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g).connect(out); o.start(t); o.stop(t + dur + 0.03);
  }
  function tick() {
    if (!ctx || !playing) return;
    const tr = TRACKS[playing], sc = SCORES[playing] || (SCORES[playing] = compose(tr)), spb = 60 / tr.bpm / 4;
    while (nextAt < ctx.currentTime + 0.15) {
      const st = sc[step % sc.length], t = Math.max(nextAt, ctx.currentTime);
      if (st.bass != null) note(tr.bass, st.bass, t, spb * (tr.eighthBass ? 1.8 : 6), 0.16, trackGain, 700);
      if (st.arp != null) note(tr.arp, st.arp, t, spb * 1.6, tr.arpVol, trackGain, 2200);
      if (st.lead != null) note(tr.lead, st.lead, t, spb * st.dur * 0.95, tr.leadVol, trackGain, 3000);
      if (st.drum && st.drum !== ".") drum(st.drum, t, trackGain);
      nextAt += spb; step++;
    }
  }
  function startMusic(name) {
    if (!ctx || !unlocked || playing === name) return;
    const t = ctx.currentTime;
    if (trackGain) { const old = trackGain; old.gain.setTargetAtTime(0.0001, t, 0.35); setTimeout(() => old.disconnect(), 2500); }
    trackGain = ctx.createGain(); trackGain.gain.setValueAtTime(0.0001, t); trackGain.gain.setTargetAtTime(1, t + 0.15, 0.5);
    trackGain.connect(bgmBus);
    playing = name; step = 0; nextAt = t + 0.1;
    if (!timer) timer = setInterval(tick, 40);
  }
  function music(name) {
    if (!TRACKS[name]) name = null;
    if (want === name) return;
    want = name;
    if (!name) { if (trackGain && ctx) trackGain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.3); playing = null; return; }
    startMusic(name);
  }

  function set(patch) { cfg = { ...cfg, ...patch }; cfg.sfx = Math.min(1, Math.max(0, +cfg.sfx || 0)); cfg.bgm = Math.min(1, Math.max(0, +cfg.bgm || 0)); save(); applyVolumes(); }

  root.RLSound = {
    play, music, set, unlock,
    get settings() { return { ...cfg }; },
    state: () => ({ ...cfg, track: want, playing, running: !!ctx && ctx.state === "running", unlocked }),
    recent: () => recent.slice(),
    names: Object.keys(SFX), tracks: Object.keys(TRACKS),
    // 나가는 소리를 녹음용으로 (tools/sound-preview.mjs: 미리 듣기 파일 만들기)
    tap: () => { if (!init()) return null; const d = ctx.createMediaStreamDestination(); outNode.connect(d); return d.stream; },
  };
})(typeof window !== "undefined" ? window : globalThis);
