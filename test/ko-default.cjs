// 테스트 기본 브라우저 언어를 한국어로 (게임이 브라우저 언어를 따르게 된 뒤 기존 한국어 검사용). 테스트가 locale을 주면 그대로
const path = require("node:path");
const pw = require(path.join(process.env.NODE_PATH, "playwright"));
const orig = pw.chromium.launch.bind(pw.chromium);
pw.chromium.launch = async (o) => {
  const b = await orig(o);
  const nc = b.newContext.bind(b);
  b.newContext = (opts = {}) => nc({ locale: "ko-KR", ...opts });
  return b;
};
