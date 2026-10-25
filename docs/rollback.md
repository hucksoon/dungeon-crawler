# 베타 1.0으로 되돌리기

옆에서 보는 마을(dc#90)을 넣기 바로 전의 게임을 **베타 1.0**으로 묶어 두었어요. 새 버전에 문제가 생기면 언제든 이 상태로 돌아갈 수 있어요.

## 베타 1.0 = 어떤 상태

- GitHub 브랜치 `backup/beta-1.0` (커밋 `4c52401`, main에 PR #90을 합친 직후)
- 들어 있는 것: 위에서 보는 칸 로비, 그림으로 보기/글자로 보기 버튼, 점프 던전(시험판, 더블 점프·휴대폰 배치)까지
- 이 브랜치는 지우거나 고치지 않아요 (되돌릴 기준점)

## 게임(웹 페이지) 되돌리기

GitHub Pages는 main 브랜치를 그대로 올리므로, main을 베타 1.0 내용으로 바꾸는 커밋을 하나 만들어 올리면 돼요. (기록을 지우지 않고 "되돌린 커밋"을 더하는 방식이라 나중에 다시 앞으로 갈 수 있어요)

```bash
git fetch origin main backup/beta-1.0
git checkout -B rollback-beta-1.0 origin/main
git checkout origin/backup/beta-1.0 -- .        # 파일 내용을 베타 1.0으로
git commit -m "Roll back to beta 1.0"
git push -u origin rollback-beta-1.0            # → PR을 만들어 main에 합치면 1~2분 뒤 사이트에 반영
```

- 베타 1.0 뒤에 새로 생긴 파일(예: `test/town-e2e.mjs`)은 위 명령으로 지워지지 않아요. 깔끔하게 하려면 `git diff --name-only --diff-filter=A origin/backup/beta-1.0 origin/main` 으로 목록을 보고 `git rm`으로 지운 뒤 커밋해요
- 브라우저가 예전 파일을 잠시 기억할 수 있어요. 새로고침하면 바뀌어요

## 서버 되돌리기

베타 1.0에서 마을을 넣을 때 서버(PHP)는 바뀌지 않았어요. 로비 위치(x 0~63칸, y)는 예전 서버가 그대로 받아요. 그래서 **게임만 되돌리면 서버는 그대로 둬도 돼요.**

서버도 그 시점으로 돌려야 할 때를 위해 서버에서 코드·DB 백업을 따로 만들어 둬요 (운영자만, 서버에서 직접). 백업 파일은 저장소에 올리지 않아요.

## 다시 앞으로 (마을 버전으로)

되돌린 커밋을 `git revert`로 취소하는 PR을 만들어 main에 합치면 돼요.
