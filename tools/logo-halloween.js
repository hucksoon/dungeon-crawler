// 할로윈 로고 그리기 (dc#133). tools/logo-halloween.mjs가 브라우저에 넣어 씀: window.buildHW(원본 로고 dataURL, { letters }) → PNG dataURL
//   원본 로고(배경 투명 1734×907) 위에서 색을 바꾸고(글자 호박색, 횃불 초록, 등불·방패 보라, 보석·물약), 도트 그림을 덧그림
//   덧그림: 글자 윗면 초록 점액, O 자리 잭오랜턴, D 위 마녀 모자, 뒤에 보름달, 박쥐·유령, 바닥 호박·사탕
//   좌표는 원본 1734×907 기준
(function () {
  const P = 6; // 덧그림 한 칸 크기 (원본 1734px 기준 도트 크기와 비슷하게)

  function rgb2hsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
    let h = 0, s = 0;
    if (mx !== mn) {
      const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      if (mx === r) h = (g - b) / d + (g < b ? 6 : 0); else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
      h *= 60;
    }
    return [h, s, l];
  }
  function hsl2rgb(h, s, l) {
    h = ((h % 360) + 360) % 360 / 360;
    if (s === 0) return [l * 255, l * 255, l * 255];
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    const f = (t) => { t = (t + 1) % 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; };
    return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
  }
  const inR = (x, y, r) => x >= r[0] && x < r[2] && y >= r[1] && y < r[3];
  const hueN = (h) => (h > 300 ? h - 360 : h); // 빨강 근처를 -60~60으로

  // 픽셀 다시 칠하기 (불꽃·등불·보석·물약·방패·글자)
  function recolor(ctx, W, H, opts) {
    const img = ctx.getImageData(0, 0, W, H), D = img.data;
    const mask = new Uint8Array(W * H); // 글자 픽셀
    const torchHandle = [100, 304, 275, 420];
    const gems = [
      { r: [655, 90, 755, 175], h: 285 }, { r: [570, 200, 645, 265], h: 125 }, { r: [1095, 155, 1175, 225], h: 285 },
      { r: [460, 775, 535, 845], h: 125 }, { r: [1330, 775, 1405, 850], h: 285 },
      { r: [840, 15, 910, 80], h: 125 }, { r: [835, 150, 905, 215], h: 125 },
    ];
    const notLetters = [[735, 140, 1015, 228], [1062, 655, 1335, 870], [495, 648, 815, 885], [940, 665, 1050, 830], [795, 735, 1110, 890]];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const k = (y * W + x) * 4; if (D[k + 3] < 8) continue;
      const r = D[k], g = D[k + 1], b = D[k + 2];
      let [h, s, l] = rgb2hsl(r, g, b); const hn = hueN(h);
      let out = null;
      // 횃불 불꽃·불티 → 초록 마녀 불
      if (((x < 320 && y < 255) || (x < 265 && y < 410) || (y < 304 && x < 265 && hn < 25 && s > 0.5)) && !inR(x, y, torchHandle) && hn > -40 && hn < 65 && (s > 0.3 || l > 0.8)) {
        const t = Math.max(0, Math.min(1, (hn + 10) / 65)); // 빨강 0 → 노랑 1
        out = hsl2rgb(150 - t * 70, Math.min(1, s * 1.05 + 0.1), l > 0.85 ? 0.88 : l);
      }
      // 등불 → 보라 불빛
      else if (inR(x, y, [105, 600, 300, 830]) && hn > -30 && hn < 65 && s > 0.4 && l > 0.3) {
        const t = Math.max(0, Math.min(1, (hn + 10) / 65));
        out = hsl2rgb(290 - t * 25, s, Math.min(0.92, l * 1.02));
      }
      else {
        const gem = gems.find(G => inR(x, y, G.r));
        if (gem && (hn < 15 && hn > -40) && s > 0.35) out = hsl2rgb(gem.h, s, l);
        // 물약 → 초록
        else if (inR(x, y, [940, 715, 1050, 830]) && hn < 20 && hn > -40 && s > 0.35) out = hsl2rgb(105, s, Math.min(0.85, l * 1.1));
        // 방패 파랑 → 보라
        else if (inR(x, y, [1470, 415, 1734, 775]) && h > 190 && h < 250 && s > 0.2) out = hsl2rgb(h + 60, Math.min(1, s * 1.1), l);
        // 글자
        else if (x >= 265 && x < 1510 && y >= 200 && y < 725 && !notLetters.some(R => inR(x, y, R)) && hn > -25 && hn < 50 && s > 0.45 && r > 100) {
          mask[y * W + x] = 1;
          if (opts.letters === 'purple') {
            // 줄마다 위 주황 → 아래 보라
            const band = y < 470 && !(y > 440 && x < 1500 && opts._crawlTop && y >= opts._crawlTop[x]) ? [215, 470] : [455, 715];
            const t = Math.max(0, Math.min(1, (y - band[0]) / (band[1] - band[0])));
            const hh = 38 - t * t * 115; // 38 → -77(=283)
            out = hsl2rgb(hh, Math.min(1, s * 1.05), Math.min(0.75, l * (1 + 0.15 * (1 - t))));
          } else {
            // 호박색: 빨강을 주황으로
            out = hsl2rgb(Math.max(18, hn * 0.55 + 20), Math.min(1, s * 1.05), Math.min(0.78, l * 1.08));
          }
        }
      }
      if (out) { D[k] = out[0]; D[k + 1] = out[1]; D[k + 2] = out[2]; }
    }
    ctx.putImageData(img, 0, 0);
    return mask;
  }

  // 작은 해상도 판에 그린 뒤 도트처럼 키워 붙임 (외곽선 자동)
  function layer(main, W, H, draw, opts = {}) {
    const w = Math.ceil(W / P), h = Math.ceil(H / P);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d'); x.save(); x.scale(1 / P, 1 / P); draw(x); x.restore();
    const img = x.getImageData(0, 0, w, h), D = img.data, A = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) { A[i] = D[i * 4 + 3] >= 110 ? 1 : 0; D[i * 4 + 3] = A[i] ? (opts.alpha || 255) : 0; }
    if (opts.outline !== false) {
      const oc = opts.outline || [20, 10, 28];
      for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
        const i = yy * w + xx; if (A[i]) continue;
        const n = (xx > 0 && A[i - 1]) || (xx < w - 1 && A[i + 1]) || (yy > 0 && A[i - w]) || (yy < h - 1 && A[i + w]);
        if (n) { D[i * 4] = oc[0]; D[i * 4 + 1] = oc[1]; D[i * 4 + 2] = oc[2]; D[i * 4 + 3] = 255; }
      }
    }
    x.putImageData(img, 0, 0);
    main.save(); main.imageSmoothingEnabled = false;
    if (opts.behind) main.globalCompositeOperation = 'destination-over';
    main.drawImage(c, 0, 0, w * P, h * P); main.restore();
  }

  const poly = (x, pts, fill) => { x.beginPath(); pts.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b))); x.closePath(); x.fillStyle = fill; x.fill(); };
  const ell = (x, cx, cy, rx, ry, fill, rot = 0) => { x.beginPath(); x.ellipse(cx, cy, rx, ry, rot, 0, Math.PI * 2); x.fillStyle = fill; x.fill(); };

  // 잭오랜턴
  function pumpkin(x, cx, cy, rx, ry, o = {}) {
    // 꼭지
    poly(x, [[cx - rx * 0.12, cy - ry * 0.8], [cx + rx * 0.1, cy - ry * 0.8], [cx + rx * 0.22, cy - ry * 1.18], [cx + rx * 0.05, cy - ry * 1.22]], '#4f7a22');
    poly(x, [[cx - rx * 0.02, cy - ry * 0.85], [cx + rx * 0.06, cy - ry * 0.85], [cx + rx * 0.14, cy - ry * 1.15], [cx + rx * 0.06, cy - ry * 1.17]], '#7fb23a');
    if (o.leaf) { ell(x, cx - rx * 0.32, cy - ry * 0.98, rx * 0.2, ry * 0.09, '#5f9a2a', -0.4); }
    ell(x, cx, cy, rx, ry, '#c2520e');
    ell(x, cx - rx * 0.06, cy - ry * 0.04, rx * 0.93, ry * 0.92, '#f07a14');
    // 골
    x.lineWidth = Math.max(P, rx * 0.07); x.strokeStyle = '#b8480c';
    x.beginPath(); x.ellipse(cx, cy, rx * 0.5, ry * 0.96, 0, 0, Math.PI * 2); x.stroke();
    x.beginPath(); x.moveTo(cx, cy - ry * 0.92); x.lineTo(cx, cy + ry * 0.92); x.stroke();
    ell(x, cx - rx * 0.62, cy - ry * 0.42, rx * 0.14, ry * 0.2, '#ffae4a', 0.5);
    if (o.face === false) return;
    const glow = '#ffcf2e', core = '#fff4a0';
    const eye = (sx) => {
      poly(x, [[cx + sx * rx * 0.62, cy - ry * 0.02], [cx + sx * rx * 0.12, cy - ry * 0.02], [cx + sx * rx * 0.4, cy - ry * 0.5]], glow);
      poly(x, [[cx + sx * rx * 0.5, cy - ry * 0.08], [cx + sx * rx * 0.26, cy - ry * 0.08], [cx + sx * rx * 0.38, cy - ry * 0.3]], core);
    };
    eye(-1); eye(1);
    poly(x, [[cx - rx * 0.08, cy + ry * 0.14], [cx + rx * 0.08, cy + ry * 0.14], [cx, cy + ry * 0.02]], glow);
    // 입 (이빨 두 개)
    const m = [[-0.66, 0.22], [-0.42, 0.34], [-0.3, 0.26], [-0.18, 0.4], [0.18, 0.4], [0.3, 0.26], [0.42, 0.34], [0.66, 0.22],
      [0.5, 0.6], [0.22, 0.72], [0.14, 0.58], [0.02, 0.58], [-0.06, 0.74], [-0.24, 0.74], [-0.5, 0.6]];
    poly(x, m.map(([a, b]) => [cx + a * rx, cy + b * ry]), glow);
    poly(x, [[cx - rx * 0.4, cy + ry * 0.46], [cx + rx * 0.4, cy + ry * 0.46], [cx + rx * 0.2, cy + ry * 0.6], [cx - rx * 0.2, cy + ry * 0.6]], core);
  }

  function bat(x, cx, cy, w, rot = 0) {
    x.save(); x.translate(cx, cy); x.rotate(rot); const s = w / 100; x.scale(s, s);
    const wing = (d) => {
      poly(x, [[0, -4], [d * 14, -16], [d * 30, -28], [d * 52, -14], [d * 46, -8], [d * 40, 6], [d * 32, -2], [d * 24, 10], [d * 16, 0], [d * 8, 8]], '#6a3d9e');
      poly(x, [[d * 14, -12], [d * 30, -22], [d * 44, -12], [d * 38, -6], [d * 32, 0], [d * 26, -4], [d * 20, 4]], '#9466d6');
    };
    wing(-1); wing(1);
    ell(x, 0, 2, 9, 13, '#4a2a72');
    poly(x, [[-8, -6], [-6, -20], [-1, -9]], '#3a1f5a'); poly(x, [[8, -6], [6, -20], [1, -9]], '#3a1f5a');
    x.fillStyle = '#ff5a2a'; x.fillRect(-6, -4, 4, 4); x.fillRect(2, -4, 4, 4);
    x.restore();
  }

  function ghost(x, cx, cy, s) {
    x.save(); x.translate(cx, cy); x.scale(s, s);
    x.beginPath(); x.moveTo(-40, 0); x.arc(0, 0, 40, Math.PI, 0); x.lineTo(42, 50);
    // 꼬리 물결
    x.quadraticCurveTo(36, 66, 26, 52); x.quadraticCurveTo(16, 70, 6, 54); x.quadraticCurveTo(-4, 72, -14, 56); x.quadraticCurveTo(-26, 72, -34, 56); x.quadraticCurveTo(-44, 64, -40, 48);
    x.closePath(); x.fillStyle = '#f3f0ff'; x.fill();
    // 그늘
    x.beginPath(); x.moveTo(18, -34); x.arc(0, 0, 40, -1.1, 0); x.lineTo(42, 50); x.quadraticCurveTo(36, 66, 26, 52); x.lineTo(26, 0); x.closePath(); x.fillStyle = '#cbc3ee'; x.fill();
    // 팔
    ell(x, -46, 22, 12, 7, '#f3f0ff', -0.6); ell(x, 46, 18, 12, 7, '#cbc3ee', 0.6);
    // 얼굴
    ell(x, -14, -4, 7, 11, '#1a1024'); ell(x, 14, -4, 7, 11, '#1a1024');
    ell(x, 0, 22, 9, 11, '#1a1024');
    x.fillStyle = '#ffffff'; x.fillRect(-17, -11, 4, 4); x.fillRect(11, -11, 4, 4);
    ell(x, -26, 12, 6, 3, '#ffb6d9'); ell(x, 26, 12, 6, 3, '#ffb6d9');
    x.restore();
  }

  function hat(x) {
    // 챙
    ell(x, 392, 236, 132, 24, '#2c1648', -0.1);
    ell(x, 390, 230, 124, 16, '#4b2a7a', -0.1);
    // 고깔 (끝이 왼쪽으로 꺾임)
    poly(x, [[312, 232], [470, 216], [432, 150], [400, 100], [362, 66], [318, 48], [286, 56], [322, 74], [344, 104], [334, 160]], '#4a2a78');
    poly(x, [[420, 220], [470, 216], [432, 150], [400, 100], [380, 84], [404, 140]], '#33195a');
    poly(x, [[318, 48], [286, 56], [300, 66], [322, 60]], '#6a43a8');
    // 띠·버클
    poly(x, [[318, 196], [458, 182], [466, 210], [314, 226]], '#ff8a1c');
    poly(x, [[318, 196], [458, 182], [460, 190], [317, 204]], '#ffb347');
    x.fillStyle = '#ffd23f'; x.fillRect(372, 186, 34, 32); x.fillStyle = '#ff8a1c'; x.fillRect(381, 194, 16, 16);
    // 별
    x.fillStyle = '#ffe680'; x.fillRect(356, 128, 8, 8); x.fillRect(394, 156, 6, 6);
  }

  function candyCorn(x, cx, cy, s, rot) {
    x.save(); x.translate(cx, cy); x.rotate(rot); x.scale(s, s);
    poly(x, [[-12, 12], [12, 12], [0, -16]], '#ff8a1c');
    poly(x, [[-12, 12], [12, 12], [9, 4], [-9, 4]], '#ffd23f');
    poly(x, [[-4, -6], [4, -6], [0, -16]], '#fffbe8');
    x.restore();
  }

  function wrapped(x, cx, cy, s, col) {
    x.save(); x.translate(cx, cy); x.scale(s, s);
    poly(x, [[-24, -10], [-12, 0], [-24, 10]], col); poly(x, [[24, -10], [12, 0], [24, 10]], col);
    ell(x, 0, 0, 13, 10, col); x.fillStyle = '#ffffff'; x.fillRect(-6, -6, 4, 12); x.fillRect(4, -6, 4, 12);
    x.restore();
  }

  function moon(x) {
    ell(x, 1585, 190, 134, 134, 'rgba(255,170,60,0.55)');
    ell(x, 1585, 190, 120, 120, '#ffcf6e');
    ell(x, 1600, 205, 108, 108, '#ffb84a');
    ell(x, 1585, 190, 100, 100, '#ffd98a');
    ell(x, 1545, 150, 20, 16, '#f2b45c'); ell(x, 1620, 230, 28, 22, '#f2b45c'); ell(x, 1630, 145, 12, 10, '#f2b45c'); ell(x, 1555, 240, 10, 9, '#f2b45c');
  }

  // 글자 윗면에 초록 점액 + 흘러내림
  function slime(main, W, H, mask) {
    const w = Math.ceil(W / P), h = Math.ceil(H / P), cell = new Uint8Array(w * h);
    for (let cy = 0; cy < h; cy++) for (let cx = 0; cx < w; cx++) {
      let n = 0, t = 0;
      for (let yy = cy * P; yy < Math.min(H, cy * P + P); yy++) for (let xx = cx * P; xx < Math.min(W, cx * P + P); xx++) { t++; n += mask[yy * W + xx]; }
      cell[cy * w + cx] = n * 2 >= t ? 1 : 0;
    }
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
    const img = x.createImageData(w, h), D = img.data;
    const set = (cx, cy, col) => { const i = (cy * w + cx) * 4; D[i] = col[0]; D[i + 1] = col[1]; D[i + 2] = col[2]; D[i + 3] = 255; };
    const HI = [196, 255, 120], MID = [104, 214, 58], LO = [52, 140, 34], DK = [22, 64, 16];
    const bands = [[Math.floor(200 / P), Math.floor(330 / P)], [Math.floor(445 / P), Math.floor(560 / P)]];
    let drip = 0, dripLeft = 0;
    for (const [y0, y1] of bands) {
      for (let cx = 0; cx < w; cx++) {
        let top = -1;
        for (let cy = y0; cy < y1; cy++) if (cell[cy * w + cx] && !cell[(cy - 1) * w + cx]) { top = cy; break; }
        if (top < 0) { dripLeft = 0; continue; }
        const isTop = (xx) => xx >= 0 && xx < w && [-1, 0, 1].some(d => cell[(top + d) * w + xx] && !cell[(top + d - 1) * w + xx]);
        const inner = isTop(cx - 1) && isTop(cx + 1);
        if (!inner) { if (cell[top * w + cx]) set(cx, top, HI); dripLeft = 0; continue; }
        if (dripLeft <= 0 && rnd() < 0.16) { drip = 2 + Math.floor(rnd() * 5); dripLeft = 2; }
        const len = 2 + (dripLeft > 0 ? drip : (rnd() < 0.5 ? 1 : 0)); dripLeft--;
        let cy = top, i = 0;
        for (; i < len && cell[cy * w + cx]; i++, cy++) set(cx, cy, i === 0 ? HI : (i === len - 1 ? LO : MID));
        if (i > 3 && cy < h) set(cx, cy - 1, DK);
      }
    }
    x.putImageData(img, 0, 0);
    main.save(); main.imageSmoothingEnabled = false; main.drawImage(c, 0, 0, w * P, h * P); main.restore();
  }

  window.buildHW = async function (dataUrl, opts = {}) {
    const im = new Image(); im.src = dataUrl; await im.decode();
    const W = im.width, H = im.height;
    const c = document.createElement('canvas'); c.width = W; c.height = H; const ctx = c.getContext('2d');
    ctx.drawImage(im, 0, 0);
    const mask = recolor(ctx, W, H, opts);
    if (opts.slime !== false) slime(ctx, W, H, mask);
    // 뒤: 달
    layer(ctx, W, H, moon, { behind: true, outline: false });
    // 앞: 박쥐·모자·호박·유령·사탕
    layer(ctx, W, H, (x) => {
      bat(x, 1555, 150, 120, -0.15); bat(x, 1665, 268, 80, 0.2); bat(x, 1080, 70, 110, 0.12); bat(x, 1300, 125, 84, -0.2); bat(x, 735, 46, 80, 0.1);
      bat(x, 62, 468, 72, -0.25);
    });
    layer(ctx, W, H, hat);
    layer(ctx, W, H, (x) => ghost(x, 592, 104, 1.1));
    layer(ctx, W, H, (x) => {
      pumpkin(x, 1170, 360, 86, 80, { leaf: true });           // O → 잭오랜턴
      pumpkin(x, 452, 838, 44, 36);
      pumpkin(x, 1405, 808, 56, 46, { leaf: true });
      pumpkin(x, 1665, 820, 34, 28, { face: false });
      pumpkin(x, 300, 860, 30, 24, { face: false });
    });
    layer(ctx, W, H, (x) => {
      candyCorn(x, 862, 786, 1.9, -0.3); candyCorn(x, 1048, 830, 1.8, 0.4); candyCorn(x, 1140, 866, 1.7, -0.5);
      wrapped(x, 975, 866, 1.8, '#8a4fd0'); wrapped(x, 800, 846, 1.6, '#45b83a');
    });
    return c.toDataURL('image/png');
  };
})();
