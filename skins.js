// 스킬 스킨 (dc#172): 캐시로 사는 꾸미기. 능력치는 그대로, 속성 스킬의 모습만 바뀜
//   상점(shop.html)에서 캐시 50개로 사면 Xsolla 인벤토리에 영구로 남음 (계정당 1개, non_consumable)
//   게임(index.html)은 로그인한 계정의 Xsolla 인벤토리를 읽어 가진 스킨을 알고, 쓸지 말지는 이 기기에 저장
//   slot: 같은 칸(slot)의 스킨은 하나만 씀
//     bolt: 내 번개 공격(연쇄 번개 · 무기 번개 · 전자기장)의 색
//     aura: 내 캐릭터 둘레를 감싸는 기운 (던전 2D · 3D · 마을)
(function (root) {
  "use strict";
  const PRICE = 50;   // 캐시 (카탈로그 tools/xsolla-catalog.mjs와 같게)
  const SKINS = {
    skin_bolt_blue: {
      slot: "bolt", icon: "⚡",
      name: { ko: "푸른 번개", en: "Blue Lightning", ja: "青い稲妻" },
      desc: {
        ko: "번개 공격(연쇄 번개 · 무기 번개 · 전자기장)의 줄기가 노란색 대신 푸른색으로 바뀌어요. 능력치는 그대로예요.",
        en: "Your lightning attacks (Chain Lightning, weapon lightning, Electric Field) turn blue instead of yellow. Stats stay the same.",
        ja: "稲妻攻撃（連鎖稲妻・武器の稲妻・電磁場）の色が黄色から青に変わります。能力値はそのままです。",
      },
      color: "#4da3ff", core: "#e6f4ff", spark: "#bfe0ff", field: "rgba(77, 163, 255, 0.24)",
    },
    skin_bolt_aura: {
      slot: "aura", icon: "🌩",
      name: { ko: "번개 오라", en: "Lightning Aura", ja: "稲妻のオーラ" },
      desc: {
        ko: "내 캐릭터 둘레에 번개가 휘감기는 기운이 생겨요. 푸른 번개를 같이 쓰면 오라도 푸른색이에요. 능력치는 그대로예요.",
        en: "Crackling lightning wraps around your character. With Blue Lightning on, the aura turns blue too. Stats stay the same.",
        ja: "キャラクターの周りを稲妻がまとうオーラが付きます。青い稲妻と一緒に使うとオーラも青くなります。能力値はそのままです。",
      },
      color: "#ffe14d", core: "#fffbe6",
    },
  };
  const IDS = Object.keys(SKINS);
  const SLOTS = [...new Set(IDS.map(id => SKINS[id].slot))];
  const name = (id, lang = "ko") => SKINS[id]?.name[lang] || SKINS[id]?.name.ko || id;
  const desc = (id, lang = "ko") => SKINS[id]?.desc[lang] || SKINS[id]?.desc.ko || "";

  // 같은 씨앗이면 같은 값 (깜빡임마다 번개 모양이 바뀌게)
  const rnd = (s) => { const x = Math.sin(s * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };

  // 오라 그리기 (2D 캔버스): (cx, cy) 가운데, r 반지름(픽셀), t 시간(ms). color는 번개 색, core는 속 색
  //   뒤(back): 몸 뒤로 은은한 빛 · 위로 솟는 불꽃 / 앞(front): 몸을 감싸며 번쩍이는 번개 줄기 · 튀는 불꽃
  function drawAura(ctx, cx, cy, r, t, color, core, layer = "front") {
    const flick = Math.floor(t / 70);
    ctx.save();
    if (layer === "back") {
      const pulse = 0.75 + 0.25 * Math.sin(t / 160);
      const g = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r * 1.25);
      g.addColorStop(0, hexA(color, 0.42 * pulse)); g.addColorStop(0.6, hexA(color, 0.16 * pulse)); g.addColorStop(1, hexA(color, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(cx, cy, r * 1.25, r * 1.4, 0, 0, Math.PI * 2); ctx.fill();
      // 솟구치는 기운: 발밑에서 머리 위로 올라가는 뾰족한 불꽃 (초사이어인처럼)
      ctx.globalCompositeOperation = "lighter";
      for (let k = 0; k < 7; k++) {
        const ph = ((t / 520) + k / 7) % 1, x = cx + (rnd(k * 3.1) - 0.5) * r * 1.5, y0 = cy + r * 0.9, h = r * (0.9 + 0.7 * rnd(k + 0.7));
        const y = y0 - ph * h * 1.3, w = r * 0.12 * (1 - ph);
        ctx.fillStyle = hexA(color, 0.5 * (1 - ph));
        ctx.beginPath(); ctx.moveTo(x - w, y + r * 0.25); ctx.lineTo(x, y - r * 0.35); ctx.lineTo(x + w, y + r * 0.25); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
      return;
    }
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    const n = 3;
    for (let i = 0; i < n; i++) {
      if (rnd(flick * 7 + i) < 0.25) continue;   // 가끔 꺼져서 번쩍번쩍
      const a0 = rnd(flick * 13 + i * 5) * Math.PI * 2, span = 1.2 + rnd(flick + i) * 1.4, steps = 7;
      const pts = [];
      for (let k = 0; k <= steps; k++) {
        const a = a0 + span * k / steps, rr = r * (0.85 + (rnd(flick * 31 + i * 11 + k) - 0.5) * 0.45);
        pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 1.15]);
      }
      // 빛 번짐은 shadowBlur 대신 넓고 옅은 선 (shadowBlur는 휴대폰·소프트웨어 그리기에서 매우 느림)
      for (const [w, c, a] of [[7, color, 0.22], [3.2, color, 0.9], [1.3, core, 1]]) {
        ctx.globalAlpha = a; ctx.strokeStyle = c; ctx.lineWidth = Math.max(1, w * r / 22);
        ctx.beginPath(); pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    // 튀는 불꽃
    ctx.fillStyle = core;
    for (let k = 0; k < 6; k++) {
      const a = rnd(flick * 3 + k) * Math.PI * 2, d = r * (0.7 + rnd(flick + k * 9) * 0.6), s = Math.max(1, r / 14);
      ctx.fillRect(cx + Math.cos(a) * d - s / 2, cy + Math.sin(a) * d * 1.15 - s / 2, s, s);
    }
    ctx.restore();
  }

  // #rrggbb → rgba
  function hexA(hex, a) {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
    return m ? `rgba(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}, ${a})` : hex;
  }

  // 번개 줄기 (상점 미리보기용): a → b 들쭉날쭉한 선
  function drawBolt(ctx, a, b, t, color, core, seed = 0) {
    const flick = Math.floor(t / 60), steps = 9, pts = [a];
    const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
    for (let k = 1; k < steps; k++) { const j = (rnd(flick * 17 + k + seed) - 0.5) * L * 0.18; pts.push({ x: a.x + dx * k / steps + nx * j, y: a.y + dy * k / steps + ny * j }); }
    pts.push(b);
    ctx.save(); ctx.lineCap = "round"; ctx.lineJoin = "round";
    for (const [w, c, blur] of [[4, color, 12], [1.6, core, 0]]) {
      ctx.strokeStyle = c; ctx.lineWidth = w; ctx.shadowColor = color; ctx.shadowBlur = blur;
      ctx.beginPath(); pts.forEach((p, k) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke();
    }
    ctx.restore();
  }

  // 상점·인벤토리 미리보기: w×h 캔버스에 그 스킨의 모습을 t(ms) 시점으로 그림
  const BASE_BOLT = { color: "#ffe14d", core: "#fffbe6" };
  function preview(ctx, id, t, w, h) {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#14101c"; ctx.fillRect(0, 0, w, h);
    const S = SKINS[id];
    if (!S) return;
    if (S.slot === "bolt") {
      // 왼쪽 아래 → 가운데 → 오른쪽 위로 튕기는 연쇄 번개 (몬스터 자리는 어두운 동그라미)
      const pts = [{ x: w * 0.12, y: h * 0.72 }, { x: w * 0.45, y: h * 0.38 }, { x: w * 0.7, y: h * 0.68 }, { x: w * 0.9, y: h * 0.3 }];
      for (const p of pts.slice(1)) { ctx.fillStyle = "#3a2f4a"; ctx.beginPath(); ctx.arc(p.x, p.y, h * 0.09, 0, Math.PI * 2); ctx.fill(); }
      const k = 1 + Math.floor((t % 1400) / 260);   // 늘 한 줄기는 보이게
      for (let i = 0; i < Math.min(3, k); i++) drawBolt(ctx, pts[i], pts[i + 1], t, S.color, S.core, i * 5);
    } else {
      const cx = w / 2, cy = h * 0.55, r = Math.min(w, h) * 0.3;
      drawAura(ctx, cx, cy, r, t, S.color, S.core, "back");
      // 가운데 사람 모양 (머리 · 몸)
      ctx.fillStyle = "#e8dcc8"; ctx.beginPath(); ctx.arc(cx, cy - r * 0.45, r * 0.22, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#6a5a8a"; ctx.fillRect(cx - r * 0.25, cy - r * 0.22, r * 0.5, r * 0.75);
      drawAura(ctx, cx, cy, r, t, S.color, S.core, "front");
    }
  }

  const api = { PRICE, SKINS, IDS, SLOTS, name, desc, drawAura, drawBolt, preview, hexA, BASE_BOLT };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.RLSkins = api;
})(typeof window !== "undefined" ? window : globalThis);
