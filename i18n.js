// 게임 다국어: 한국어(원문) · English · 日本語. 용어는 docs/i18n-glossary.md
// 브라우저(window.RLI18N)와 Node(require) 양쪽에서 씀. 언어별 문구는 i18n/en.js · i18n/ja.js가 RLI18N.add로 넣음
//
// - 원문은 코드 안의 한국어. 번역이 없으면 한국어를 그대로 보여 줌 (빠진 문구가 있어도 깨지지 않게)
// - 언어는 상점과 같은 localStorage "rl_lang". 게임 번역이 끝나기 전(READY = false)에는 게임이 항상 한국어이고,
//   주소에 ?lang=en / ?lang=ja를 붙이면 그 탭에서만 미리 보기 (?lang=ko로 끔)
// - 언어를 바꾸면 페이지를 다시 읽음 (아이템·몬스터 이름은 페이지를 열 때 한 번 바꿔 둠: apply)
(function (root) {
  "use strict";

  const LANGS = ["ko", "en", "ja"];
  const LANG_NAMES = { ko: "한국어", en: "English", ja: "日本語" };
  const READY = false;   // 게임 화면 번역이 끝나면 true (그때부터 상점에서 고른 언어를 게임도 따름)
  const packs = {};      // { en: { data, text }, ja: … }

  const store = {
    get(s, k) { try { return s.getItem(k); } catch { return null; } },
    set(s, k, v) { try { if (v == null) s.removeItem(k); else s.setItem(k, v); } catch {} },
  };
  const hasDom = typeof window !== "undefined" && typeof document !== "undefined";

  // 미리 보기: ?lang=en → 이 탭(sessionStorage)에서만. ?lang=ko → 미리 보기 끝
  function detect() {
    if (!hasDom) return { lang: "ko", preview: false };
    let preview = null;
    try {
      const q = new URLSearchParams(location.search).get("lang");
      if (q && LANGS.includes(q)) store.set(sessionStorage, "rl_lang_preview", q === "ko" ? null : q);
      preview = store.get(sessionStorage, "rl_lang_preview");
    } catch {}
    if (preview && LANGS.includes(preview)) return { lang: preview, preview: true };
    if (!READY) return { lang: "ko", preview: false };
    const saved = store.get(localStorage, "rl_lang");
    if (LANGS.includes(saved)) return { lang: saved, preview: false };
    const nav = String(navigator.language || "ko").slice(0, 2);
    return { lang: LANGS.includes(nav) ? nav : "ko", preview: false };
  }
  const start = detect();
  let lang = start.lang;

  const pack = () => (lang === "ko" ? null : packs[lang] || null);
  // 문장 하나: key의 번역(문자열이나 함수), 없으면 한국어 원문 ko(문자열이나 함수)
  function tx(key, ko, ...args) {
    const p = pack(), v = p ? p.text[key] : undefined;
    const use = v !== undefined ? v : ko;
    return typeof use === "function" ? use(...args) : use;
  }
  // 번역 함수가 있으면 그것 (이름 짓기처럼 언어마다 순서가 다른 것), 없으면 null
  const fmt = (name) => { const p = pack(); return (p && p.fmt && p.fmt[name]) || null; };

  // 아이템·몬스터 데이터의 이름을 그 언어로 바꿔 둠 (페이지를 열 때 한 번). 룬워드는 이름이 룬 조합의 키라서 label만
  function apply(I, M) {
    const p = pack();
    const put = (obj, key, val) => { if (obj && val != null) obj[key] = val; };
    if (I) {
      for (const w of I.RUNEWORDS) w.label = w.name;
      for (const u of Object.values(I.UNIQUE.items)) u.label = u.name;
    }
    if (!p || !p.data) return;
    const d = p.data;
    if (I) {
      for (const [k, v] of Object.entries(d.rarity || {})) put(I.RARITIES[k], "name", v);
      for (const [k, v] of Object.entries(d.slot || {})) if (k in I.SLOT_NAMES) I.SLOT_NAMES[k] = v;
      for (const [k, v] of Object.entries(d.stat || {})) put(I.STATS[k], "name", v);
      for (const [k, v] of Object.entries(d.weapon || {})) put(I.WEAPONS[k], "name", v);
      for (const [k, v] of Object.entries(d.armor || {})) put(I.ARMOR[k], "name", v);
      for (const [k, v] of Object.entries(d.accessory || {})) if (k in I.ACCESSORY.names) I.ACCESSORY.names[k] = v;
      if (d.offhand) { put(I.OFFHAND, "shieldName", d.offhand.shield); put(I.OFFHAND, "weaponPrefix", d.offhand.prefix); }
      for (const [k, v] of Object.entries(d.set || {})) {
        const S = I.SETS[k];
        if (!S) continue;
        put(S, "name", v.name);
        for (const [slot, n] of Object.entries(v.pieces || {})) if (slot in S.pieces) S.pieces[slot] = n;
      }
      for (const [k, v] of Object.entries(d.gem || {})) put(I.GEMS[k], "name", v);
      for (const w of I.RUNEWORDS) if (d.runeword && d.runeword[w.name]) w.label = d.runeword[w.name];
      for (const [k, v] of Object.entries(d.unique || {})) {
        const U = I.UNIQUE.items[k];
        if (!U) continue;
        put(U, "name", v.name); put(U, "label", v.name); put(U, "text", v.text);
      }
      for (const [k, v] of Object.entries((d.element && d.element.names) || {})) if (k in I.ELEMENT_LINES.names) I.ELEMENT_LINES.names[k] = v;
      for (const [k, v] of Object.entries(d.stone || {})) if (k in I.STONE_NAMES) I.STONE_NAMES[k] = v;
      for (const [k, v] of Object.entries(d.base || {})) if (k in I.BASE_NAMES) I.BASE_NAMES[k] = v;
    }
    if (M) {
      for (const m of M.MONSTERS) if (d.monster && d.monster[m.id]) m.name = d.monster[m.id];
      for (const b of M.BOSSES) if (d.monster && d.monster[b.id]) b.name = d.monster[b.id];
      if (d.golden) {
        put(M.GOLDEN, "name", d.golden.normal);
        for (const [r, n] of Object.entries(d.golden)) put(M.GOLDEN.ranks[r], "name", n);
      }
      for (const N of Object.values(M.NAMED.bosses)) {
        const v = d.named && d.named[N.id];
        if (v) { put(N, "name", v.name); put(N, "title", v.title); }
      }
      if (d.element) {
        for (const [k, v] of Object.entries(d.element.names || {})) if (k in M.ELEMENTS.names) M.ELEMENTS.names[k] = v;
        for (const [k, v] of Object.entries(d.element.prefix || {})) if (k in M.ELEMENTS.prefix) M.ELEMENTS.prefix[k] = v;
      }
    }
  }

  // 언어 바꾸기: 저장하고 다시 읽음. 미리 보기 중이면 미리 보기 언어만 바꿈
  function setLang(next, { reload = true } = {}) {
    if (!LANGS.includes(next)) return;
    if (!hasDom) { lang = next; return; }   // Node(테스트): 바로 바꿈 (그다음 apply)
    if (start.preview || !READY) store.set(sessionStorage, "rl_lang_preview", next === "ko" ? null : next);
    else store.set(localStorage, "rl_lang", next);
    if (reload) location.reload();
  }

  const api = {
    LANGS, LANG_NAMES, READY,
    get lang() { return lang; },
    get preview() { return start.preview; },
    add(code, p) { packs[code] = { data: p.data || {}, text: p.text || {}, fmt: p.fmt || {} }; },
    has: (code) => code === "ko" || !!packs[code],
    tx, fmt, apply, setLang,
  };
  if (typeof module === "object" && module.exports) module.exports = api;
  root.RLI18N = api;
  if (typeof globalThis !== "undefined") globalThis.RLI18N = api;
})(typeof self !== "undefined" ? self : this);
