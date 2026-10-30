// 모든 테스트에 미리 불러오는 기본값 (run.sh: node --require)
// 1) 테스트 기본 브라우저 언어를 한국어로 (게임이 브라우저 언어를 따르게 된 뒤 기존 한국어 검사용). 테스트가 locale을 주면 그대로
// 2) 3D 화면이 기본이 된 뒤(dc#111)에도 기존 테스트는 2D 화면으로: 새 창마다 rl_3d가 없으면 "0"
//    테스트가 직접 rl_3d를 넣으면 그 값. 3D 기본값 자체를 시험할 때는 globalThis.RL_TEST_3D_DEFAULT = true로 만든 창은 건드리지 않음
//    이벤트 테마(dc#130)도 꺼 둠: rl_event가 없으면 "off" (날짜에 따라 마을·몬스터 모습이 바뀌지 않게). 이벤트 테스트는 rl_event: "auto"
// 3) 진짜 구글 광고(dc#118, ads-config.js provider h5)를 부르지 않게 광고 스크립트는 막음 → 게임은 5초 안내 화면으로 대신
//    테스트가 같은 주소에 route를 다시 걸면 그쪽이 먼저 (나중에 건 route가 이김)
const path = require("node:path");
const pw = require(path.join(process.env.NODE_PATH, "playwright"));
const orig = pw.chromium.launch.bind(pw.chromium);
const keep2D = () => { try { if (localStorage.getItem("rl_3d") === null) localStorage.setItem("rl_3d", "0"); if (localStorage.getItem("rl_event") === null) localStorage.setItem("rl_event", "off"); } catch {} };
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
