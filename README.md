# ⚔ 던전 크롤러 ⚔

브라우저에서 바로 하는 턴제 로그라이크예요. Claude와 라이브 코딩으로 만들고 있어요.

- **게임**: https://game.apacimtest.com/
- **랭킹**: https://game.apacimtest.com/ranking.html
- **개발 일기**: [docs/devlog.md](docs/devlog.md)
- **규칙 문서**: [아이템](docs/items.md) · [몬스터](docs/monsters.md) · [경제](docs/economy.md)
- **용어집 (한국어·English·日本語)**: [docs/i18n-glossary.md](docs/i18n-glossary.md)

## 무엇이 있나요

- 자동 생성 던전, 시야와 안개, 5층마다 보스, 보스 전 층에 상점
- 장비(등급·세트·고대), 강화, 도감
- 로비: 같이 접속한 사람 보기, 던전 입구(1층부터 / 포탈 층으로), 거래소와 우편함
- Xsolla 로그인(이메일·문자 인증)과 결제, 캐시로 부활·거래 수수료, 광고 보상
- 로그인하면 가방과 진행 상황을 서버에 저장해서 다른 기기에서도 이어서 해요

## 폴더

| 경로 | 내용 |
| --- | --- |
| `index.html` | 게임 (HTML 파일 하나) |
| `items.js`, `monsters.js` | 아이템·몬스터 규칙 (게임과 서버 검증이 같이 씀) |
| `shop.html`, `ranking.html`, `privacy.html` | 상점, 랭킹, 개인정보처리방침 |
| `i18n.js`, `i18n/` | 다국어 틀과 영어·일본어 문구 ([용어집](docs/i18n-glossary.md)). 화면 문구는 한국어 원문이 키(`T("…")`), 빠진 번역은 `node tools/i18n-check.mjs` (안 쓰는 문구는 `--unused`). 게임 번역이 끝나기 전에는 `?lang=en` / `?lang=ja` 미리 보기로만 |
| `ranking-config.js`, `ads-config.js` | 게임 서버 주소, 광고 설정 |
| `ranking-php/` | 게임 서버 (PHP): 랭킹, 로비, 거래소, 하루 입장·광고, 계정 저장 → [README](ranking-php/README.md) |
| `ranking/` | 랭킹 서버 Cloudflare Workers 버전 (예전) |
| `site/` | apacimtest.com 첫 화면 (게임 소개, AdSense 신청용) → [README](site/README.md) |
| `tools/` | 문서 생성, Xsolla 카탈로그 관리 |
| `vendor/` | Xsolla Headless Checkout SDK |

## 배포

`main` 브랜치가 GitHub Pages로 바로 올라가요 (`CNAME` = `game.apacimtest.com`). 게임 서버는 [ranking-php/README.md](ranking-php/README.md)의 "업데이트"를 보세요.

비밀값(`.env`, `ranking-php/config.php`, DB)은 저장소에 올리지 않아요.
