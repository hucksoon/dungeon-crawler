<?php
// 랭킹 관리: 시즌별(정식 v1·나이트메어·헬·클로즈 베타) 기록 보기·지우기. 서버에서 명령으로만 실행 (웹으로는 열리지 않음)
//
//   sudo -u www-data php admin.php list [개수] [시즌]
//     층 랭킹을 순서대로: 순위, 이름(가린 이메일), 최고 층, 공개 ID. 시즌: v4(기본), nm(나이트메어), v3
//
//   sudo -u www-data php admin.php devices
//     운영자 기기 목록 (최대 3대). 등록하면 그 기기의 게스트 랭킹 기록을 지우고, 앞으로도 게스트 기록은 랭킹에 올라가지 않음. 운영자 혜택(골드·강화석·보석·횟수 제한 없음)은 운영자 계정으로 로그인한 이 기기들에서만
//   sudo -u www-data php admin.php devices add <기기 ID> [이름]
//     운영자 기기 등록. 기기 ID는 운영자 계정으로 로그인한 게임의 인벤토리 위쪽에 "이 기기 ID"로 보임 (게스트 ID와 같은 값)
//     기기 ID는 그대로 저장하지 않고 HMAC만 저장
//   sudo -u www-data php admin.php devices remove <번호>
//     list에 나온 번호의 기기를 지움 (기기를 바꿀 때)
//
//   sudo -u www-data php admin.php geo [IP] [DB 파일]
//     게임 언어 자동 설정용 나라 DB 확인: 파일 위치·종류·만든 날짜와 그 IP(기본 8.8.8.8)의 나라. geo-update.sh가 새 DB를 쓰기 전에도 씀
//
//   sudo -u www-data php admin.php webhooks [개수]
//     Xsolla 웹훅(webhook.php)으로 받은 주문 기록 최근 순: 시각, 종류, 주문·거래 번호, [sandbox]·[실결제]·[캐시], 금액, SKU×수량,
//     사용자(HMAC 앞 8자리), 장비 상자를 우편함에 지급했는지·환불로 회수했는지
//
//   sudo -u www-data php admin.php boxes
//     장비 상자 시드 상태: 좁혔는지(서버 기록이 있는 시드만 인정), 서버 기록 수(지급·환불·예전 등록)
//   sudo -u www-data php admin.php boxes legacy [--apply]
//     웹훅 전에 상점이 브라우저에서 연 상자 아이템을 서버(계정 저장본·랭킹 장비·거래소·우편)에서 찾아 개수만 보여줌.
//     --apply: 찾은 시드를 예전 것(legacy)으로 등록하고 좁히기를 켬 → 그 뒤로는 서버 기록이 있는 상자 시드만 인정
//   sudo -u www-data php admin.php boxes strict off
//     좁히기를 끔 (문제가 생겼을 때 예전처럼 되돌리기)
//
//   sudo -u www-data php admin.php event-settle
//     교환 기간이 끝난 이벤트의 남은 재화를 모든 사람에게 한꺼번에 캐시 1:1로 바꿔 우편함에 (dc#131).
//     안 해도 각자 다음에 접속할 때 자동으로 바뀜. 몇 번 실행해도 같은 재화를 두 번 바꾸지 않음
//
//   sudo -u www-data php admin.php remove <공개ID> [시즌]
//     그 사람의 그 시즌 기록만 지움 (다른 시즌 기록은 그대로). 공개 ID는 list나 랭킹 화면 장비 보기 주소에서 확인
//     예전 장비를 끼고 올라간 기록처럼 규칙에 맞지 않는 기록을 정리할 때 씀. 그 사람이 규칙대로 다시 하면 다시 올라감

declare(strict_types=1);

if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

define('RANKING_NO_ROUTE', true);
require __DIR__ . '/api.php';

function fail(string $msg): void { fwrite(STDERR, $msg . "\n"); exit(1); }

$cmd = $argv[1] ?? '';

if ($cmd === 'event-settle') {
    $keys = db()->query('SELECT DISTINCT pkey FROM event_wallet WHERE balance > 0')->fetchAll(PDO::FETCH_COLUMN);
    $n = 0; foreach ($keys as $k) $n += event_settle((string)$k);
    echo "남은 이벤트 재화가 있는 사람 " . count($keys) . "명 중 {$n}건을 캐시로 바꿔 우편함에 넣었어요 (교환 기간이 아직 안 끝난 이벤트는 그대로).\n";
    exit(0);
}

if ($cmd === 'geo') {
    $ip = (string)($argv[2] ?? '8.8.8.8');
    $path = (string)($argv[3] ?? geo_mmdb_path());
    if (!filter_var($ip, FILTER_VALIDATE_IP)) fail('사용법: php admin.php geo [IP] [DB 파일]');
    if (!is_readable($path)) fail("나라 DB가 없어요: {$path}  (sh geo-update.sh로 받기)");
    try { $r = geo_reader($path); $m = $r->metadata(); $r->close(); }
    catch (Throwable $e) { fail('나라 DB를 읽지 못했어요: ' . $e->getMessage()); }
    printf("DB %s (%.1f MB)\n종류 %s · 만든 날 %s\n", $path, filesize($path) / 1048576, $m->databaseType, date('Y-m-d', (int)$m->buildEpoch));
    $c = geo_lookup($ip, $path);
    echo "{$ip} → " . ($c ?? '(모름)') . "\n";
    exit($c === null ? 2 : 0);
}

if ($cmd === 'webhooks') {
    define('WEBHOOK_NO_ROUTE', true);
    require __DIR__ . '/webhook.php';
    webhook_tables(db());
    $limit = max(1, min(200, (int)($argv[2] ?? 20)));
    $rows = db()->query("SELECT * FROM xsolla_events ORDER BY created_at DESC LIMIT {$limit}")->fetchAll();
    $total = (int)q_val('SELECT COUNT(*) FROM xsolla_events');
    echo "웹훅 기록 {$total}건 (최근 " . count($rows) . "건)\n";
    foreach ($rows as $r) {
        $items = implode(', ', array_map(function ($i) { return "{$i['sku']}×{$i['quantity']}"; }, json_decode((string)$r['items'], true) ?: []));
        printf("%s  %-14s 주문 %-12s 거래 %-12s %s %s %s  %s  사용자 %s  %s\n", date('Y-m-d H:i:s', intdiv((int)$r['created_at'], 1000)), $r['type'], $r['order_id'] ?? '-', $r['tx_id'] ?? '-',
            preg_match('/^[A-Z]{3}$/', (string)$r['currency']) ? ($r['sandbox'] ? '[sandbox]' : '[실결제]') : '[캐시]', $r['amount'] ?? '', $r['currency'] ?? '', $items !== '' ? $items : '-', $r['user_key'] ? substr($r['user_key'], 0, 8) : '-', ['granted' => '→ 우편함 지급', 'revoked' => '→ 회수', 'no_user' => '→ 사용자 없음(지급 못 함)', 'canceled' => '→ 이미 취소된 주문(지급 안 함)'][$r['state']] ?? '');
    }
    exit(0);
}

if ($cmd === 'boxes') {
    $sub = $argv[2] ?? '';
    $counts = function (): string {
        $rows = db()->query('SELECT state, COUNT(*) AS n FROM box_items GROUP BY state')->fetchAll();
        $by = array_column($rows, 'n', 'state');
        return sprintf('서버 기록: 지급 %d · 환불 %d · 예전 등록 %d', $by['granted'] ?? 0, $by['revoked'] ?? 0, $by['legacy'] ?? 0);
    };
    if ($sub === '') {
        echo '장비 상자 시드: ' . (box_strict() ? '좁힘 (서버 기록이 있는 것만 인정)' : '좁히기 전 (환불된 것만 빼고 인정)') . "\n" . $counts() . "\n";
        exit(0);
    }
    if ($sub === 'legacy') {
        $found = box_legacy_scan();
        $new = array_filter($found, function ($seed) { return !q_val('SELECT 1 FROM box_items WHERE seed = ?', [$seed]); }, ARRAY_FILTER_USE_KEY);
        $where = array_count_values(array_column($new, 2));
        $owners = count(array_unique(array_column($new, 0)));
        printf("예전 상자 아이템 %d개 (이미 등록 %d개 제외, %d명) · 계정 저장본 %d · 랭킹 %d · 거래소 %d · 우편 %d\n", count($new), count($found) - count($new), $owners,
            $where['profile'] ?? 0, $where['ranking'] ?? 0, $where['market'] ?? 0, $where['mail'] ?? 0);
        if (($argv[3] ?? '') !== '--apply') { echo "확인만 했어요. 등록하고 좁히려면: php admin.php boxes legacy --apply\n"; exit(0); }
        $n = box_legacy_register($new);
        set_flag('box_strict', '1');
        echo "예전 상자 시드 {$n}개를 등록하고 좁혔어요. 이제 서버 기록이 있는 상자 시드만 인정해요.\n" . $counts() . "\n";
        exit(0);
    }
    if ($sub === 'strict' && ($argv[3] ?? '') === 'off') {
        set_flag('box_strict', '0');
        echo "좁히기를 껐어요. 환불된 것만 빼고 상자 시드를 인정해요 (등록한 기록은 그대로).\n";
        exit(0);
    }
    fail("사용법:\n  php admin.php boxes\n  php admin.php boxes legacy [--apply]\n  php admin.php boxes strict off");
}

if ($cmd === 'devices') {
    $sub = $argv[2] ?? 'list';
    $rows = db()->query('SELECT dhash, label, created_at FROM staff_devices ORDER BY created_at')->fetchAll();
    if ($sub === 'list') {
        echo '운영자 기기 ' . count($rows) . '/' . STAFF_DEVICES_MAX . "대\n";
        foreach ($rows as $i => $r) printf("%d. %-20s 등록 %s\n", $i + 1, $r['label'] !== '' ? $r['label'] : '(이름 없음)', date('Y-m-d H:i', intdiv((int)$r['created_at'], 1000)));
        exit(0);
    }
    if ($sub === 'add') {
        $device = (string)($argv[3] ?? '');
        if (!preg_match(DEVICE_ID_RE, $device)) fail('사용법: php admin.php devices add <기기 ID> [이름]  (기기 ID는 게임 인벤토리 위쪽의 "이 기기 ID")');
        $h = device_hash($device);
        // 이 기기에서 게스트로 남긴 랭킹 기록은 지움 (이미 등록된 기기도 다시 add 하면 지움)
        $purged = purge_board_rows(hmac_hex('g:' . $device));
        $note = $purged ? " 이 기기의 게스트 랭킹 기록 {$purged}줄을 지웠어요." : '';
        foreach ($rows as $r) if (hash_equals($r['dhash'], $h)) { echo '이미 등록된 기기예요.' . $note . "\n"; exit(0); }
        if (count($rows) >= STAFF_DEVICES_MAX) fail('운영자 기기는 최대 ' . STAFF_DEVICES_MAX . '대예요. 먼저 devices remove <번호>로 하나를 지워 주세요.');
        $label = mb_substr((string)($argv[4] ?? ''), 0, 40);
        db()->prepare('INSERT INTO staff_devices (dhash, label, created_at) VALUES (?, ?, ?)')->execute([$h, $label, now_ms()]);
        echo '운영자 기기를 등록했어요 (' . (count($rows) + 1) . '/' . STAFF_DEVICES_MAX . ').' . $note . " 게임을 새로고침하면 적용돼요.\n";
        exit(0);
    }
    if ($sub === 'remove') {
        $n = (int)($argv[3] ?? 0);
        if ($n < 1 || $n > count($rows)) fail('사용법: php admin.php devices remove <번호>  (번호는 devices 목록에서)');
        db()->prepare('DELETE FROM staff_devices WHERE dhash = ?')->execute([$rows[$n - 1]['dhash']]);
        echo "{$n}번 운영자 기기를 지웠어요.\n";
        exit(0);
    }
    fail("사용법:\n  php admin.php devices\n  php admin.php devices add <기기 ID> [이름]\n  php admin.php devices remove <번호>");
}

$season = $argv[3] ?? CURRENT_SEASON;
if (!isset(SEASONS[$season])) fail('시즌은 ' . implode(', ', array_keys(SEASONS)) . ' 중 하나예요.');
$t = season_table($season);
$name = SEASONS[$season]['name'];
$clear = !empty(SEASONS[$season]['abyss']) ? [ABYSS_CLEAR, ABYSS_FLOORS] : (!empty(SEASONS[$season]['nightmare']) ? [NM_CLEAR, NM_FLOORS] : [CLEAR_STAGE, MAX_FLOOR]);

if ($cmd === 'list') {
    $limit = max(1, min(200, (int)($argv[2] ?? 20)));
    $rows = db()->query("SELECT pub_id, display, best_stage, item_name FROM {$t} WHERE " . BOARDS['stage']['where'] . ' ORDER BY ' . BOARDS['stage']['order'] . " LIMIT {$limit}")->fetchAll();
    echo "{$name} 층 랭킹 (" . count($rows) . "명)\n";
    foreach ($rows as $i => $r) {
        $stage = $season !== 'v3' && (int)$r['best_stage'] >= $clear[0] ? $clear[1] . '층 완료' : $r['best_stage'] . '층';
        printf("%3d. %-24s %-10s %s\n", $i + 1, $r['display'], $stage, $r['pub_id'] ?? '(ID 없음)');
    }
    exit(0);
}

if ($cmd === 'remove') {
    $id = (string)($argv[2] ?? '');
    if (!preg_match('/^[0-9a-f]{16}$/', $id)) fail('사용법: php admin.php remove <공개ID 16자리> [시즌]');
    $r = q_row("SELECT pkey, display, best_stage FROM {$t} WHERE pub_id = ?", [$id]);
    if (!$r) fail("{$name} 랭킹에 그 공개 ID가 없어요.");
    db()->prepare("DELETE FROM {$t} WHERE pub_id = ?")->execute([$id]);
    echo "{$name} 랭킹에서 {$r['display']} ({$r['best_stage']}층) 기록을 지웠어요. 다른 시즌 기록은 그대로예요.\n";
    // 구멍 기록을 지우면 그 기록으로 받은 칭호도 거둠 (다음에 가장 먼저 완료한 사람이 받음)
    if ($season === 'abyss') {
        $st = db()->prepare('DELETE FROM titles WHERE pkey = ?');
        $st->execute([$r['pkey']]);
        if ($st->rowCount()) echo "그 사람의 칭호도 거뒀어요.\n";
    }
    exit(0);
}

fail("사용법:\n  php admin.php list [개수] [시즌]\n  php admin.php remove <공개ID> [시즌]\n  php admin.php devices [add <기기 ID> [이름] | remove <번호>]\n  php admin.php webhooks [개수]\n  php admin.php boxes [legacy [--apply] | strict off]\n  php admin.php event-settle\n  시즌: v4(기본), nm(나이트메어), hell(헬), abyss(끝이 없는 구멍), v3");
