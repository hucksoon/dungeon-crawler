// 광고 설정
//
// 구글 AdSense H5 게임 광고(보상형, Ad Placement API)를 써요 (dc#118부터).
//   - client: AdSense 게시자 ID (ca-pub-로 시작). apacimtest.com/ads.txt · game.apacimtest.com/ads.txt와 같음
//   - test: true면 구글의 테스트 광고 (수익 없음). 실제 사이트에서 잠깐 확인할 때는 주소 뒤에 ?adtest=1
// 구글 광고를 못 불러오면(H5 게임 광고 승인 전·보여 줄 광고 없음·광고 차단) 5초 안내 화면으로 대신하고 보상은 그대로 줘요.
//   예전 테스트 광고(안내 화면만)로 돌리려면: window.ADS = { provider: "test" };
// 광고 상품·정책: 보상형 광고는 H5 게임 광고(Ad Placement API)로만 써야 해요. 일반 배너를 "보면 보상"으로 쓰면 정책 위반이에요.
window.ADS = { provider: "h5", client: "ca-pub-6503525638904411", test: false };
