// 모든 테스트에 미리 불러오는 기본값 (run.sh: node --require)
// 1) 테스트 기본 브라우저 언어를 한국어로 (게임이 브라우저 언어를 따르게 된 뒤 기존 한국어 검사용). 테스트가 locale을 주면 그대로
// 2) 3D 화면이 기본이 된 뒤(dc#111)에도 기존 테스트는 2D 화면으로: 새 창마다 rl_3d가 없으면 "0"
//    테스트가 직접 rl_3d를 넣으면 그 값. 3D 기본값 자체를 시험할 때는 globalThis.RL_TEST_3D_DEFAULT = true로 만든 창은 건드리지 않음
//    이벤트 테마(dc#130)도 꺼 둠: rl_event가 없으면 "off" (날짜에 따라 마을·몬스터 모습이 바뀌지 않게). 이벤트 테스트는 rl_event: "auto"
//    정식 v2(dc#140)의 축복 고르기·자동 장비도 기존 테스트에서는 꺼 둠: rl_bless "off", rl_autogear "0", 정식 v2 안내 창 rl_v2notice "off", 점검 중인 거래소도 예전처럼 rl_market "open" (v2 테스트는 직접 넣음)
// 3) 진짜 구글 광고(dc#118, ads-config.js provider h5)를 부르지 않게 광고 스크립트는 막음 → 게임은 5초 안내 화면으로 대신
//    테스트가 같은 주소에 route를 다시 걸면 그쪽이 먼저 (나중에 건 route가 이김)
const path = require("node:path");
const pw = require(path.join(process.env.NODE_PATH, "playwright"));
const orig = pw.chromium.launch.bind(pw.chromium);
const keep2D = () => { try { if (localStorage.getItem("rl_3d") === null) localStorage.setItem("rl_3d", "0"); if (localStorage.getItem("rl_event") === null) localStorage.setItem("rl_event", "off"); if (localStorage.getItem("rl_bless") === null) localStorage.setItem("rl_bless", "off"); if (localStorage.getItem("rl_autogear") === null) localStorage.setItem("rl_autogear", "0"); if (localStorage.getItem("rl_v2notice") === null) localStorage.setItem("rl_v2notice", "off"); if (localStorage.getItem("rl_market") === null) localStorage.setItem("rl_market", "open"); } catch {} };
pw.chromium.launch = async (o) => {
  const b = await orig(o);
  const nc = b.newContext.bind(b);
  b.newContext = async (opts = {}) => {
    const c = await nc({ locale: "ko-KR", ...opts });
    if (!globalThis.RL_TEST_3D_DEFAULT) await c.addInitScript(keep2D);
    await c.route(/googlesyndication\.com|googleads\.g\.doubleclick\.net/, r => r.abort());
    return c;
  };
  return b;
};
