<?php
// 랭킹 관리: 시즌별(v4 베타·나이트메어·v3 베타) 기록 보기·지우기. 서버에서 명령으로만 실행 (웹으로는 열리지 않음)
//
//   sudo -u www-data php admin.php list [개수] [시즌]
//     층 랭킹을 순서대로: 순위, 이름(가린 이메일), 최고 층, 공개 ID. 시즌: v4(기본), nm(나이트메어), v3
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

fail("사용법:\n  php admin.php list [개수] [시즌]\n  php admin.php remove <공개ID> [시즌]\n  시즌: v4(기본), nm(나이트메어), v3");
