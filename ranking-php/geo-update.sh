#!/bin/sh
# 게임 언어 자동 설정용 나라 DB 받기: DB-IP "IP to Country Lite" (무료, CC BY 4.0, 한 달에 한 번 새로 나옴)
#   https://db-ip.com/db/download/ip-to-country-lite  — 출처 표기: "IP Geolocation by DB-IP" (privacy.html)
#
#   sudo -u www-data sh geo-update.sh [저장할 파일]
#     기본 저장 위치는 api.php가 읽는 곳 (config geo_mmdb, 없으면 data/geo-country.mmdb)
#     이번 달 파일이 아직 없으면 지난달 것. 받은 DB를 읽어 보고(8.8.8.8 → US) 문제가 없을 때만 바꿔 넣음
#   cron (매달 3일 04:17): 17 4 3 * * cd /var/www/html/ranking && sh geo-update.sh >/dev/null
set -eu
cd "$(dirname "$0")"
DEST=${1:-$(php -r 'define("RANKING_NO_ROUTE", true); require "api.php"; echo geo_mmdb_path();')}
TMP="$DEST.tmp"
got=""
for m in "$(date +%Y-%m)" "$(date -d "$(date +%Y-%m-01) -1 day" +%Y-%m)"; do
  if curl -fsSL --max-time 120 "https://download.db-ip.com/free/dbip-country-lite-$m.mmdb.gz" -o "$TMP.gz"; then got=$m; break; fi
done
[ -n "$got" ] || { echo "나라 DB를 받지 못했어요" >&2; rm -f "$TMP.gz"; exit 1; }
gunzip -f "$TMP.gz"
CHECK=${GEO_CHECK_IP:-8.8.8.8}
if ! php admin.php geo "$CHECK" "$TMP" | grep -q "→ US"; then echo "받은 나라 DB가 이상해요 ($CHECK → US가 아님)" >&2; rm -f "$TMP"; exit 1; fi
mv -f "$TMP" "$DEST"
echo "나라 DB $got → $DEST"
