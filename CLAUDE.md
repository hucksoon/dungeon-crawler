# 던전 크롤러 — Claude Code 작업 규칙

브라우저 로그라이크. 게임은 GitHub Pages(https://game.apacimtest.com/), 랭킹·거래소·웹훅 서버는 `ranking-php/`(사용자가 직접 서버에 올림).
사용자에게는 한국어로, 쉽게 답한다.

## 개발 일지와 블로그

개발 일지(`docs/devlog/YYYY-MM-DD.md`)를 쓰거나 고칠 때마다 **같은 PR에서** 공개 블로그 글도 맞춘다.

1. `blog/posts/YYYY-MM-DD.md`를 만들거나 고친다 (그날 일지를 공개용으로 다시 쓴 글, 하루 한 편)
   - 머리말: `title`(40자 이내) · `date`(파일 이름과 같음) · `summary`(120자 이내) · `tags`(쉼표, 2~5개)
   - 본문 Markdown은 `##`·`###`, 문단, `- ` 목록(한 단계 들여쓰기), `**굵게**`, `` `코드` ``, `[링크](https://…)`, `> 인용`, 이미지(아래)만. 표·HTML·코드 블록·`#` 제목은 안 됨
   - 해요체, 일지를 베끼지 말고 독자(게임과 Claude Code로 게임 만들기에 관심 있는 사람)를 위해 다시 쓴다. 일지에 없는 사실은 쓰지 않는다
   - **이미지 한 장 이상**: 한 줄에 `![설명](images/파일.png)` (설명은 그림 아래 글). 게임 화면은 `tools/blog-shots.mjs`에 장면을 추가해 `NODE_PATH=$(npm root -g) node tools/blog-shots.mjs <장면>`으로 찍는다 (서버 없이 가짜 응답, 이름은 게스트 번호만). 찍은 그림은 직접 열어 보고 넣는다
2. **공개하면 안 되는 내용은 쓰지 않는다** (이미지에도): 서버 주소·IP·호스트 이름·파일 경로·서버 명령, 이메일·사용자 ID·기기 ID·토큰·키·비밀값과 그 설정 이름, 운영자 계정·운영자 기기·운영자 도구(`admin.php`, `gift.php`), 테스트 계정, 보안 사고·설정 실수·취약점 패치의 자세한 내용. 서버 점검은 "서버도 점검했어요" 정도로만
3. `node tools/blog-build.mjs`로 `blog/` 페이지를 다시 만들어 함께 커밋한다 (공개하면 안 되는 내용이 보이면 멈춤)
4. 머지하고 배포가 끝나면 사용자에게 알려 준다
   - 블로그 글: `https://game.apacimtest.com/blog/YYYY-MM-DD.html`
   - 네이버 옮기기: `https://game.apacimtest.com/blog/naver/YYYY-MM-DD.html` (네이버는 자동 게시가 막혀 있어서 사용자가 제목·본문 복사 버튼으로 옮김, 한국어만)
   - 이미지는 본문 복사에 함께 들어가고, 네이버에 안 들어가면 페이지의 이미지 저장 링크로 올린다

## 테스트

- `bash test/run.sh [이름 일부]` — 결과는 `test/results/`(최근 3번만, 저장소에 안 올림). `blog-e2e`는 블로그 페이지가 글과 같은지도 확인
- 자동 테스트 (dc#106): 브랜치에 올리면 GitHub Actions(`.github/workflows/test.yml`)가 전체 회귀 테스트를 4조각으로 나눠 돌림 (약 10분, 흔들리는 테스트는 한 번 재시도). PR을 머지하기 전에 그 브랜치 마지막 커밋의 "회귀 테스트" 실행이 모두 통과했는지 확인 (`actions_list list_workflow_runs`, 실패하면 `get_job_logs`). 로컬 전체 실행은 필요할 때만
- 비밀값(`.env`, `ranking-php/config.php`, `data/`)은 커밋하지 않는다. 테스트에는 가짜 키만
