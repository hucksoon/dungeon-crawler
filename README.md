# ⚔ 던전 크롤러 ⚔

브라우저에서 바로 하는 턴제 로그라이크예요. Claude와 라이브 코딩으로 만들고 있어요.

- **게임**: https://game.apacimtest.com/
- **랭킹**: https://game.apacimtest.com/ranking.html
- **개발 블로그**: https://game.apacimtest.com/blog/ (일지를 공개용으로 다시 쓴 글, `blog/posts/` → `node tools/blog-build.mjs`. 작업 규칙은 [CLAUDE.md](CLAUDE.md))
- **개발 일기**: [docs/devlog.md](docs/devlog.md)
- **되돌리기 (베타 1.0 백업)**: [docs/rollback.md](docs/rollback.md)
- **규칙 문서**: [아이템](docs/items.md) · [몬스터](docs/monsters.md) · [경제](docs/economy.md)
- **용어집 (한국어·English·日本語)**: [docs/i18n-glossary.md](docs/i18n-glossary.md)

## 무엇이 있나요

- 자동 생성 던전, 시야와 안개, 5층마다 보스, 보스 전 층에 상점
- 32×32 픽셀 그림 (지역마다 다른 바닥·벽, 몬스터 모두 그림). 늘 그림으로 보여요 (그림 파일을 못 받을 때만 글자로)
- 던전은 플레이어 주변을 2배로 가까이 보기(16×12칸), `전체 지도 (M)`로 지도 전체
- 걷기·공격·맞음·피함·막음·쓰러짐 움직임, 플레이어는 낀 장비를 등급 색으로 입음 (아무것도 없으면 속옷만)
- 세트 스킬 이펙트(파이어볼·프로스트 노바·체인 라이트닝), 흡혈로 찬 HP는 초록 숫자
- 처음 하는 사람 안내 말풍선(게임을 막지 않음, 종류마다 한 번), 내 머리 위 HP 막대(30% 이하 빨강·깜빡임), 인벤토리 장비 그림과 장비 비교(끼면 바뀌는 능력치 ▲▼, 가방 목록의 ▲▼)
- 던전 이동: 방향키·버튼 말고도 화면 밀기(휴대폰, 누르고 있으면 계속)와 칸 누르기·클릭(가 본 바닥이면 길을 찾아 자동으로 걸어감, 몬스터는 따라가 공격, 맞거나 새 몬스터가 보이면 멈춤). 지도 겹쳐 보기: Tab · 휴대폰 지도 버튼 (디아블로처럼 가 본 곳의 벽 윤곽을 반투명 선으로)
- 휴대폰 버튼: 어느 화면이든 왼손 = 방향(던전 십자 · 마을·점프 던전 ◀ ▶), 오른손 = 큰 버튼(던전 포션·점프 · 마을·점프 던전 점프), 위 줄 = 인벤토리·도감·포탈
- 점프 (Space + 방향, 휴대폰은 점프 버튼): 몬스터를 넘어 2칸, 5턴마다. 제자리 대기는 마침표(.)
- 점프 던전 (시험판, 1층): 마을 왼쪽 끝 건물. 옆에서 보는 실시간 사냥 맵을 ← → 와 Space 점프(공중에서 한 번 더: 더블 점프)로 여러 층을 (사다리 없이, 높은 층은 더블 점프로만) 다니며, 0.5초마다 무기를 휘두르는 자동 공격과 멀리 닿는 세트 스킬로 쫓아오는 몬스터를 잡고 10마리를 다 잡으면 포탈이 열림 (최고 기록, 지금 판과는 따로). 휴대폰은 왼손 ◀ ▶ · 오른손 큰 점프 버튼. 물리·맵·몬스터 움직임은 `jump.js`
- 장비(등급·세트·고대), 강화, 도감
- 로비(마을): 점프 던전처럼 옆에서 보는 마을 거리. ← → 걷기 · Space 점프(더블 점프) · 문 앞에서 ↑(Enter) 들어가기, 휴대폰은 왼손 ◀ ▶ · ▲ 들어가기 · 오른손 큰 점프 버튼. 같이 접속한 사람도 거리에 보이고, 건물 문으로 던전 입구(1층부터 / 최고 − 10층부터 / 파란 포탈 = 포탈 층으로)·대장간·거래소·우편함·시간 상점·골드 던전·나이트메어·헬. 지도·건물·문 자리는 `jump.js`의 `TOWN`
- Xsolla 로그인(이메일·문자 인증)과 결제, 캐시로 부활·거래 수수료, 광고 보상
- 로그인하면 가방과 진행 상황을 서버에 저장해서 다른 기기에서도 이어서 해요

## 폴더

| 경로 | 내용 |
| --- | --- |
| `index.html` | 게임 (HTML 파일 하나) |
| `items.js`, `monsters.js` | 아이템·몬스터 규칙 (게임과 서버 검증이 같이 씀) |
| `img/sprites.png`, `sprites.js` | 픽셀 그림 모음과 칸 위치. `node tools/sprites-build.mjs`로 만듦 (CC0 타일 + 직접 그린 그림, 출처는 [CREDITS.md](CREDITS.md)) |
| `shop.html`, `ranking.html`, `privacy.html` | 상점, 랭킹, 개인정보처리방침 |
| `i18n.js`, `i18n/` | 다국어 틀과 영어·일본어 문구 ([용어집](docs/i18n-glossary.md)). 화면 문구는 한국어 원문이 키(`T("…")`), 빠진 번역은 `node tools/i18n-check.mjs` (안 쓰는 문구는 `--unused`). 게임 언어는 직접 고른 언어 → IP 나라(서버 `r=geo`) → 브라우저 언어, `?lang=en` / `?lang=ja` / `?lang=ko`로 그 탭만 미리 보기 |
| `ranking-config.js`, `ads-config.js` | 게임 서버 주소, 광고 설정 |
| `ranking-php/` | 게임 서버 (PHP): 랭킹, 로비, 거래소, 하루 입장·광고, 계정 저장 → [README](ranking-php/README.md) |
| `ranking/` | 랭킹 서버 Cloudflare Workers 버전 (예전) |
| `test/` | 회귀 테스트 (게임 화면·PHP 서버·아이템 규칙). `bash test/run.sh`, 결과는 `test/results/`에 최근 3번만 ([test/README.md](test/README.md)) |
| `site/` | apacimtest.com 첫 화면 (게임 소개, AdSense 신청용) → [README](site/README.md) |
| `tools/` | 문서 생성, 블로그, 픽셀 그림 모음 만들기, Xsolla 카탈로그 관리 |
| `vendor/` | Xsolla Headless Checkout SDK |

## 배포

`main` 브랜치가 GitHub Pages로 바로 올라가요 (`CNAME` = `game.apacimtest.com`). 게임 서버는 [ranking-php/README.md](ranking-php/README.md)의 "업데이트"를 보세요.

비밀값(`.env`, `ranking-php/config.php`, DB)은 저장소에 올리지 않아요.
