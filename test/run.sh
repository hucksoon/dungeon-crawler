#!/bin/bash
# 회귀 테스트 전체 실행
#   bash test/run.sh            # 전부
#   bash test/run.sh market     # 이름에 market이 들어간 테스트만
# 결과: test/results/<시각>/ 에 테스트마다 로그(<이름>.log), 화면 캡처(shots/), 요약(summary.txt)
#   결과는 저장소에 올리지 않고(.gitignore), 최근 3번(KEEP=3)만 남기고 지움
# 필요: node 22+, php 8(pdo_sqlite), playwright(전역 설치 → NODE_PATH), Chromium(경로가 다르면 CHROMIUM_PATH)
set -u
T=$(cd "$(dirname "$0")" && pwd); REPO=$(dirname "$T")
export NODE_PATH=${NODE_PATH:-$(npm root -g)}
KEEP=${KEEP:-3}
FILTER=${1:-}
RUN="$T/results/$(date +%Y%m%d-%H%M%S)"; mkdir -p "$RUN/shots"
SUM="$RUN/summary.txt"
row() { echo "$1" | tee -a "$SUM"; }

for f in "$T"/*-e2e.mjs "$T"/*-test.mjs "$T"/parity.mjs; do
  n=$(basename "$f" .mjs)
  [ -n "$FILTER" ] && [[ "$n" != *"$FILTER"* ]] && continue
  arg="$RUN/shots"
  case "$n" in php-test|parity) arg="$T/fixtures";; move-e2e) arg="$T/fixtures/old-address-index.html";; esac
  timeout 600 node --require "$T/ko-default.cjs" "$f" "$REPO" "$arg" > "$RUN/$n.log" 2>&1; code=$?
  p=$(grep -c '^PASS' "$RUN/$n.log"); x=$(grep -c '^FAIL' "$RUN/$n.log")
  st=ok; [ "$x" -gt 0 ] && st=FAIL; [ "$p" -eq 0 ] && [ "$x" -eq 0 ] && [ "$code" -ne 0 ] && st=ERROR
  row "$st $n: pass $p fail $x $(grep -m3 '^FAIL' "$RUN/$n.log" | cut -c1-150 | tr '\n' '|')"
done

# 번역: 빠진 문구 / 한국어 문구가 번역 틀 없이와 같은지 / 예전 기록 이름 다시 조립 / 저장된 층의 몬스터 이름
if [ -z "$FILTER" ] || [[ "i18n" == *"$FILTER"* ]]; then
  node "$REPO/tools/i18n-check.mjs" > "$RUN/i18n-check.log" 2>&1 && row "ok i18n-check" || row "FAIL i18n-check: $(head -2 "$RUN/i18n-check.log" | tr '\n' ' ')"
  node "$T/i18n-ko-same.cjs" "$REPO" 0 > "$RUN/ko0.txt" && node "$T/i18n-ko-same.cjs" "$REPO" 1 > "$RUN/ko1.txt" && cmp -s "$RUN/ko0.txt" "$RUN/ko1.txt" && row "ok i18n-ko-same ($(wc -l < "$RUN/ko0.txt") lines)" || row "FAIL i18n-ko-same"
  for l in en ja; do node "$T/namefromko.cjs" "$REPO" $l > "$RUN/namefromko-$l.log" 2>&1 && row "ok namefromko $l" || row "FAIL namefromko $l: $(head -3 "$RUN/namefromko-$l.log" | tr '\n' ' ')"; done
  for l in en ja; do node "$T/monster-names.cjs" "$REPO" $l > "$RUN/monster-names-$l.log" 2>&1 && row "ok monster-names $l" || row "FAIL monster-names $l: $(grep FAIL "$RUN/monster-names-$l.log" | head -3 | tr '\n' ' ')"; done
fi

echo "결과: $RUN  (실패 $(grep -c -E '^(FAIL|ERROR)' "$SUM")개)"
# 최근 KEEP번만 남김
ls -1d "$T"/results/*/ 2>/dev/null | sort | head -n -"$KEEP" | xargs -r rm -rf
grep -q -E '^(FAIL|ERROR)' "$SUM" && exit 1 || exit 0
