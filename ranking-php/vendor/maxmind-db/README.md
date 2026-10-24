# MaxMind DB Reader (PHP)

- 출처: https://github.com/maxmind/MaxMind-DB-Reader-php `v1.13.1` (`src/MaxMind/Db`만 그대로 복사)
- 라이선스: Apache License 2.0 (`LICENSE`)
- 쓰는 곳: `api.php`의 `geo_country()` — IP 나라 DB(`.mmdb`)에서 접속한 IP의 나라 코드만 찾음 (게임 언어 자동 설정)
- 서버에 PHP `maxminddb` 확장이 있으면 그쪽 클래스를 먼저 씀
