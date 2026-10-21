<?php
// 랭킹 관리: 시즌별(v4 베타·나이트메어·v3 베타) 기록 보기·지우기. 서버에서 명령으로만 실행 (웹으로는 열리지 않음)
//
//   sudo -u www-data php admin.php list [개수] [시즌]
//     층 랭킹을 순서대로: 순위, 이름(가린 이메일), 최고 층, 공개 ID. 시즌: v4(기본), nm(나이트메어), v3
//
//   sudo -u www-data php admin.php devices
//     운영자 기기 목록 (최대 3대). 운영자 혜택(골드·강화석·보석·횟수 제한 없음)은 운영자 계정으로 로그인한 이 기기들에서만
//   sudo -u www-data php admin.php devices add <기기 ID> [이름]
//     운영자 기기 등록. 기기 ID는 운영자 계정으로 로그인한 게임의 인벤토리 위쪽에 "이 기기 ID"로 보임 (게스트 ID와 같은 값)
//     기기 ID는 그대로 저장하지 않고 HMAC만 저장
//   sudo -u www-data php admin.php devices remove <번호>
//     list에 나온 번호의 기기를 지움 (기기를 바꿀 때)
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
        foreach ($rows as $r) if (hash_equals($r['dhash'], $h)) fail('이미 등록된 기기예요.');
        if (count($rows) >= STAFF_DEVICES_MAX) fail('운영자 기기는 최대 ' . STAFF_DEVICES_MAX . '대예요. 먼저 devices remove <번호>로 하나를 지워 주세요.');
        $label = mb_substr((string)($argv[4] ?? ''), 0, 40);
        db()->prepare('INSERT INTO staff_devices (dhash, label, created_at) VALUES (?, ?, ?)')->execute([$h, $label, now_ms()]);
        echo '운영자 기기를 등록했어요 (' . (count($rows) + 1) . '/' . STAFF_DEVICES_MAX . "). 게임을 새로고침하면 적용돼요.\n";
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
$clear = !empty(SEASONS[$season]['nightmare']) ? [NM_CLEAR, NM_FLOORS] : [CLEAR_STAGE, MAX_FLOOR];

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
    $r = q_row("SELECT display, best_stage FROM {$t} WHERE pub_id = ?", [$id]);
    if (!$r) fail("{$name} 랭킹에 그 공개 ID가 없어요.");
    db()->prepare("DELETE FROM {$t} WHERE pub_id = ?")->execute([$id]);
    echo "{$name} 랭킹에서 {$r['display']} ({$r['best_stage']}층) 기록을 지웠어요. 다른 시즌 기록은 그대로예요.\n";
    exit(0);
}

fail("사용법:\n  php admin.php list [개수] [시즌]\n  php admin.php remove <공개ID> [시즌]\n  php admin.php devices [add <기기 ID> [이름] | remove <번호>]\n  시즌: v4(기본), nm(나이트메어), v3");
