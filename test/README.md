# 회귀 테스트

게임(브라우저)·PHP 서버·아이템 규칙을 실제로 띄워서 확인하는 테스트예요. 저장소의 파일을 그대로 씀 (빌드 없음).

```sh
bash test/run.sh            # 전부 (30~40분)
bash test/run.sh market     # 이름에 market이 들어간 것만
```

- 자동 테스트: 브랜치에 올리면 GitHub Actions(`.github/workflows/test.yml`)가 4조각(`SHARD=1/4`…)으로 나눠 동시에 돌리고, 실패한 테스트는 한 번 더 돌려요(`RETRY=1`, 통과하면 요약에 "재시도"). 결과는 Actions 실행 화면의 요약에, 실패하면 로그·화면 캡처를 `test-results-<조각>`으로 내려받아요
- 결과는 `test/results/<시각>/`에 테스트마다 로그·화면 캡처·`summary.txt`. **최근 3번만 남기고**(`KEEP=3`) 저장소에는 올리지 않아요 (`.gitignore`)
- 필요한 것: node 22+, php 8 (`pdo_sqlite`), 전역 설치한 `playwright`(`NODE_PATH`), Chromium (경로가 다르면 `CHROMIUM_PATH`)
- 브라우저 기본 언어는 한국어(`ko-default.cjs`). 영어·일본어 화면은 테스트가 언어를 직접 정함
- 타이밍: 고정 시간만 기다리지 말고 응답·상태가 바뀔 때까지 기다리기. `profile-e2e`는 `PROFILE_SLOW=2000`으로 계정 저장 응답을 늦춰서 느린 환경을 흉내낼 수 있음

| 파일 | 내용 |
|---|---|
| `*-e2e.mjs` | 게임 화면 + PHP 서버 (테스트마다 포트·sqlite를 따로 씀) |
| `*-test.mjs` | 서버 API만 (`php-test`, `market-api-test` …), `worker-test`는 예전 Cloudflare 버전 |
| `parity.mjs` | JS(`items.js`)와 PHP(`rules.php`)가 같은 아이템을 만드는지 |
| `i18n-ko-same.cjs`, `namefromko.cjs`, `monster-names.cjs` | 번역 틀을 불러도 한국어가 같은지, 예전 기록 아이템 이름·저장된 층의 몬스터 이름 다시 짓기 |
| `i18n-screens.mjs` | (따로 실행) 영어·일본어 화면에 한글이 남는지 보기: `node test/i18n-screens.mjs . <캡처 폴더> en` |
| `php/` | 테스트용 서버 설정(`config.test.php`, 가짜 키)과 가짜 Xsolla(`mock.php`). 실행 중 만든 sqlite·설정은 저장소에 안 올림 |
| `event-*` | 이벤트(dc#130): `event-api-test`는 서버 날짜를 설정(`event_today`)으로, `event-e2e`는 브라우저 시계(`clock.setFixedTime`)도 할로윈 기간으로 맞춤. 다른 테스트는 `ko-default.cjs`가 `rl_event: "off"`로 이벤트 모습을 꺼 둠 |
| `town.mjs` | 테스트 도우미 `goDoor(page, 문 id)`: 마을(옆에서 보는 로비)에서 문까지 진짜 키로 걸어가 ↑ (문 id는 `jump.js`의 `TOWN.doors`) |
| `fixtures/` | 예전 v1 `items-v1.js`, 예전 주소 안내 페이지 |
