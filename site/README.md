# apacimtest.com 첫 화면 (게임 소개)

구글 AdSense 신청용 사이트예요. AdSense는 **최상위 도메인(apacimtest.com)** 을 등록하고 심사해요. 그래서 게임(game.apacimtest.com)과 별도로 여기에 다음을 올려요.

- `index.html`: 게임 소개, 플레이 방법, 스크린샷
- `privacy.html`: 개인정보처리방침. 게임의 `privacy.html`을 그대로 복사해서 올려요 (원본은 하나)
- `ads.txt`: AdSense 게시자 확인 파일 (`pub-6503525638904411`). `index.html` 머리에도 같은 ID의 확인 코드가 있어요

서버는 `/ranking/` 게임 서버와 같은 Apache(`/var/www/html`)예요.

## 올리기

```bash
cd /tmp && rm -rf dungeon && git clone --depth 1 https://github.com/hucksoon/dungeon-crawler.git dungeon
ls /var/www/html                     # 지금 있는 파일 확인 (웹훅 등 다른 파일은 그대로 둬요)
sudo cp -n /var/www/html/index.html /var/www/html/index.html.bak 2>/dev/null   # 예전 첫 화면 백업 (한 번만)
sudo cp /tmp/dungeon/site/index.html /tmp/dungeon/privacy.html /var/www/html/
sudo mkdir -p /var/www/html/img && sudo cp /tmp/dungeon/site/img/*.png /var/www/html/img/
sudo cp /tmp/dungeon/site/ads.txt /var/www/html/
```

확인: https://apacimtest.com/ , https://apacimtest.com/privacy.html , https://apacimtest.com/ads.txt

## 스크린샷 다시 찍기

`img/`의 그림은 게임 화면을 그대로 찍은 거예요. 화면이 많이 바뀌면 다시 찍어서 바꿔요.
