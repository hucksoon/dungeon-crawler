# 던전 크롤러 — Claude Code 작업 규칙

브라우저 로그라이크. 게임은 GitHub Pages(https://game.apacimtest.com/), 랭킹·거래소·웹훅 서버는 `ranking-php/`(사용자가 직접 서버에 올림).
사용자에게는 한국어로, 쉽게 답한다.

## 개발 일지와 블로그

개발 일지(`docs/devlog/YYYY-MM-DD.md`)를 쓰거나 고칠 때마다 **같은 PR에서** 공개 블로그 글도 맞춘다.

1. `blog/posts/YYYY-MM-DD.md`를 만들거나 고친다 (그날 일지를 공개용으로 다시 쓴 글, 하루 한 편)
   - 머리말: `title`(40자 이내) · `date`(파일 이름과 같음) · `summary`(120자 이내) · `tags`(쉼표, 2~5개)
   - 본문 Markdown은 `##`·`###`, 문단, `- ` 목록(한 단계 들여쓰기), `**굵게**`, `` `코드` ``, `[링크](https://…)`, `> 인용`만. 표·이미지·HTML·코드 블록·`#` 제목은 안 됨
   - 해요체, 일지를 베끼지 말고 독자(게임과 Claude Code로 게임 만들기에 관심 있는 사람)를 위해 다시 쓴다. 일지에 없는 사실은 쓰지 않는다
2. **공개하면 안 되는 내용은 쓰지 않는다**: 서버 주소·IP·호스트 이름·파일 경로·서버 명령, 이메일·사용자 ID·기기 ID·토큰·키·비밀값과 그 설정 이름, 운영자 계정·운영자 기기·운영자 도구(`admin.php`, `gift.php`), 테스트 계정, 보안 사고·설정 실수·취약점 패치의 자세한 내용. 서버 점검은 "서버도 점검했어요" 정도로만
3. `node tools/blog-build.mjs`로 `blog/` 페이지를 다시 만들어 함께 커밋한다 (공개하면 안 되는 내용이 보이면 멈춤)
4. 머지하고 배포가 끝나면 사용자에게 알려 준다
   - 블로그 글: `https://game.apacimtest.com/blog/YYYY-MM-DD.html`
   - 네이버 옮기기: `https://game.apacimtest.com/blog/naver/YYYY-MM-DD.html` (네이버는 자동 게시가 막혀 있어서 사용자가 제목·본문 복사 버튼으로 옮김, 한국어만)

## 테스트

- `bash test/run.sh [이름 일부]` — 결과는 `test/results/`(최근 3번만, 저장소에 안 올림). `blog-e2e`는 블로그 페이지가 글과 같은지도 확인
- 비밀값(`.env`, `ranking-php/config.php`, `data/`)은 커밋하지 않는다. 테스트에는 가짜 키만
