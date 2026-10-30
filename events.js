// 이벤트 일정과 내용 (dc#130). 게임(index.html)·상점(shop.html)·테스트가 함께 씀
// 서버(ranking-php/event.php의 EVENTS)에도 같은 일정이 있음 → event-api-test가 둘이 같은지 확인
//
// 날짜는 한국 시간. start 0시부터 end 24시까지 열림 (2주)
//   - 이벤트 기간: 테마(로비·몬스터 모습)가 바뀌고 (끝나면 저절로 원래 모습), 상점에서 하루 한 번 이벤트 재화를 무료로 받음
//     하루 한 번은 Xsolla 구매 제한(무료 아이템 event_coin, 1인당 1개)이 막고 매일 한국 시간 오전 10시(RESET_HOUR)에 초기화 (dc#131)
//     그래서 받기의 하루(xday)는 오전 10시에 바뀌고, 받기 기간·기념일도 이 하루로 셈
//   - 재화 SKIN_PRICE개 → 스킨 하나 (계정에 영구), 남은 재화는 캐시와 1:1 교환
//   - 교환은 이벤트가 끝나고 EXCHANGE_DAYS일 더. 그 뒤에 남은 재화는 서버가 자동으로 캐시 1:1로 바꿔 우편함에 넣음
//   - days: 기간 안의 작은 기념일 → 그날은 재화를 bonus개 더 받음
// ready: 테마·스킨이 준비된 이벤트만 열림. 나머지는 일정만 잡아 둔 칸 (내용을 만들면 true로)
(function (root) {
  const DAILY = 1, SKIN_PRICE = 6, EXCHANGE_DAYS = 7, RESET_HOUR = 10;   // dc#131: 스킨 10 → 6개 (14일이면 2개 다)
  // 스킨: 머리(투구 자리)·무기의 모습만 바꿈 (능력치는 그대로). sprite는 img/sprites.png의 그림
  const SKINS = {
    pumpkin_head: { slot: "head", theme: "halloween", sprite: "skin_pumpkin_head", name: { ko: "호박 머리", en: "Pumpkin Head", ja: "かぼちゃ頭" } },
    reaper_scythe: { slot: "weapon", theme: "halloween", sprite: "skin_scythe", name: { ko: "사신의 낫", en: "Reaper's Scythe", ja: "死神の鎌" } },
  };
  // 테마: 이벤트 재화 이름과 교환할 수 있는 스킨
  const THEMES = {
    halloween: { coin: { ko: "호박 사탕", en: "Pumpkin Candy", ja: "かぼちゃキャンディ" }, skins: ["pumpkin_head", "reaper_scythe"] },
  };
  const EVENTS = [
    { id: "halloween-2026", theme: "halloween", ready: true, start: "2026-10-31", end: "2026-11-13", name: { ko: "할로윈", en: "Halloween", ja: "ハロウィン" },
      days: { "2026-11-11": { bonus: 1, name: { ko: "빼빼로데이", en: "Pepero Day", ja: "ポッキーの日" } } } },
    { id: "exam-2026", theme: null, ready: false, start: "2026-11-19", end: "2026-12-02", name: { ko: "수능 끝 + 블랙프라이데이", en: "Exams Over + Black Friday", ja: "受験おつかれ + ブラックフライデー" } },
    { id: "winter-2026", theme: null, ready: false, start: "2026-12-21", end: "2027-01-03", name: { ko: "겨울 (크리스마스·새해)", en: "Winter (Christmas & New Year)", ja: "冬 (クリスマス・お正月)" } },
    { id: "seollal-2027", theme: null, ready: false, start: "2027-02-01", end: "2027-02-14", name: { ko: "설날", en: "Lunar New Year", ja: "旧正月" },
      days: { "2027-02-14": { bonus: 1, name: { ko: "밸런타인데이", en: "Valentine's Day", ja: "バレンタインデー" } } } },
    { id: "whiteday-2027", theme: null, ready: false, start: "2027-03-08", end: "2027-03-21", name: { ko: "화이트데이", en: "White Day", ja: "ホワイトデー" } },
    { id: "golden-2027", theme: null, ready: false, start: "2027-04-25", end: "2027-05-08", name: { ko: "골든위크·어린이날", en: "Golden Week", ja: "ゴールデンウィーク" } },
    { id: "summer-2027", theme: null, ready: false, start: "2027-08-03", end: "2027-08-16", name: { ko: "여름", en: "Summer", ja: "夏" } },
    { id: "chuseok-2027", theme: null, ready: false, start: "2027-09-08", end: "2027-09-21", name: { ko: "추석", en: "Chuseok", ja: "秋夕 (チュソク)" } },
    { id: "halloween-2027", theme: "halloween", ready: false, start: "2027-10-31", end: "2027-11-13", name: { ko: "할로윈", en: "Halloween", ja: "ハロウィン" } },
  ];

  // 한국 시간 날짜 "YYYY-MM-DD"
  const today = (ms = Date.now()) => new Date(ms + 9 * 3600000).toISOString().slice(0, 10);
  // 받기의 하루: 한국 시간 오전 10시에 바뀜 (Xsolla 구매 제한 초기화)
  const xday = (ms = Date.now()) => today(ms - RESET_HOUR * 3600000);
  const addDays = (day, n) => new Date(Date.parse(day + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
  // 그날 열린 이벤트 (ready만)
  const active = (day = today()) => EVENTS.find(e => e.ready && e.start <= day && day <= e.end) || null;
  // 그날 교환할 수 있는 이벤트 (기간 + EXCHANGE_DAYS일)
  const exchange = (day = today()) => EVENTS.find(e => e.ready && e.start <= day && day <= addDays(e.end, EXCHANGE_DAYS)) || null;
  // 그날 받는 재화 개수 (기간 밖이면 0)
  const dailyAmount = (e, day = today()) => (e && e.start <= day && day <= e.end ? DAILY + ((e.days || {})[day]?.bonus || 0) : 0);
  const byId = (id) => EVENTS.find(e => e.id === id) || null;
  const text = (o, lang) => (o ? o[lang] || o.ko : "");

  const API = { DAILY, SKIN_PRICE, EXCHANGE_DAYS, RESET_HOUR, SKINS, THEMES, EVENTS, today, xday, addDays, active, exchange, dailyAmount, byId, text };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.RLEvents = API;
})(typeof window !== "undefined" ? window : globalThis);
