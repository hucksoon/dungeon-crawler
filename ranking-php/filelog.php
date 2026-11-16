<?php
// 운영자 로그 파일 (dc#181): 운영자 로그 보기 페이지(logch.php)가 읽는 곳에 요청·응답을 남김
//   파일: <로그 폴더>/연/월/<종류>-YYYY-MM-DD.log (한국 시간 하루 한 파일). 종류: webhook · bot_auth
//   한 건: [시각][알림 종류][상태 코드]{ "request": 받은 내용, "response": 보낸 내용, "meta": 보낸 곳·서명·이유 }
//   개인정보는 가림 (사용자 정보는 운영자도 긴급할 때만 봄): 이메일 ab***@도메인, ID 앞 8자리만, IP 앞 두 자리만,
//   이름·전화·주소 같은 값은 첫 글자만. 토큰·서명·카드 값은 지움. 상품·금액·주문 번호·알림 종류는 그대로
//   폴더: config의 file_log_dir (예전 이름 bot_auth_log_dir도 됨). 없으면 ranking 폴더 옆 logs (그 폴더가 있을 때만). ''면 끔
declare(strict_types=1);

const FILELOG_MAX_BYTES = 65536;

// 키 이름 (소문자)으로 가리는 방식을 정함
function filelog_mask_value(string $key, $v, string $path) {
    $k = strtolower($key);
    if (!is_scalar($v) || $v === '' || $v === null) return $v;
    $s = (string)$v;
    // 지우는 것: 토큰·서명·비밀번호·카드
    if (preg_match('/token|secret|password|passwd|signature|authorization|card|cvv|pan$|iban|account_number/', $k)) return '[지움]';
    if ($k === 'email' || substr($k, -6) === '_email' || strpos($s, '@') !== false && preg_match('/^[^@\s]+@[^@\s]+$/', $s)) return function_exists('mask_email') ? mask_email($s) : '***@***';
    if ($k === 'ip' || substr($k, -3) === '_ip' || $k === 'ip_address') {
        if (preg_match('/^(\d+)\.(\d+)\.\d+\.\d+$/', $s, $m)) return "{$m[1]}.{$m[2]}.*.*";
        return substr($s, 0, 4) . '****';
    }
    // 사용자를 가리키는 ID: 앞 8자리만 (user.id · user_id · external_id 등. 주문·거래·상품 id는 그대로)
    $parent = substr($path, 0, max(0, strrpos($path, '.') ?: 0));
    $parentKey = strtolower((string)substr($parent, (int)strrpos('.' . $parent, '.')));
    if (($k === 'id' && $parentKey === 'user') || in_array($k, ['user_id', 'external_id', 'public_id', 'player_id', 'sub', 'uid'], true)) {
        return strlen($s) > 8 ? substr($s, 0, 8) . '****' : substr($s, 0, 2) . '***';
    }
    if (in_array($k, ['name', 'first_name', 'last_name', 'nickname', 'username', 'phone', 'phone_number', 'zip', 'postal_code', 'address', 'street', 'city', 'tax_id', 'birthdate'], true)) {
        return mb_substr($s, 0, 1) . '***';
    }
    return $v;
}
function filelog_mask($v, string $path = '') {
    if (!is_array($v)) return $v;
    $out = [];
    foreach ($v as $k => $x) {
        $p = $path === '' ? (string)$k : "{$path}.{$k}";
        $out[$k] = is_array($x) ? filelog_mask($x, $p) : filelog_mask_value((string)$k, $x, $p);
    }
    return $out;
}

function filelog_dir(): string {
    try { $cfg = config(); } catch (Throwable $e) { return ''; }
    if (array_key_exists('file_log_dir', $cfg)) return (string)$cfg['file_log_dir'];
    if (array_key_exists('bot_auth_log_dir', $cfg)) return (string)$cfg['bot_auth_log_dir'];
    return dirname(__DIR__) . '/logs';
}

// 한 건 쓰기. $request·$response: 받은 글·보낸 글 (JSON이면 가려서 보기 좋게, 아니면 길이만)
function filelog_write(string $prefix, string $type, int $status, string $request, string $response, array $meta = []): void {
    try {
        $dir = filelog_dir();
        if ($dir === '' || !is_dir($dir)) return;
        $now = new DateTime('now', new DateTimeZone('Asia/Seoul'));
        $sub = $dir . '/' . $now->format('Y') . '/' . $now->format('m');
        if (!is_dir($sub)) @mkdir($sub, 0775, true);
        $body = fn(string $raw) => $raw === '' ? null : (is_array($j = json_decode($raw, true)) ? filelog_mask($j) : '(JSON 아님, ' . strlen($raw) . '바이트)');
        $entry = ['request' => $body($request), 'response' => $body($response), 'meta' => $meta];
        $json = json_encode($entry, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT | JSON_PARTIAL_OUTPUT_ON_ERROR);
        $type = preg_replace('/[^A-Za-z0-9_\-]/', '', $type) ?: '-';
        @file_put_contents($sub . '/' . $prefix . '-' . $now->format('Y-m-d') . '.log',
            '[' . $now->format('Y-m-d H:i:s') . "][{$type}][{$status}]" . $json . "\n", FILE_APPEND | LOCK_EX);
    } catch (Throwable $e) {}
}

// 요청이 끝날 때 한 번: 받은 내용(php://input)과 보낸 내용(출력 버퍼), 상태 코드를 씀
//   $meta(): 끝날 때 부를 함수 → ['type' => 알림 종류, 그 밖의 meta]
function filelog_begin(string $prefix, callable $meta): void {
    ob_start();
    register_shutdown_function(function () use ($prefix, $meta) {
        $out = (string)ob_get_contents();
        $raw = (string)file_get_contents('php://input', false, null, 0, FILELOG_MAX_BYTES);
        $m = [];
        try { $m = (array)$meta(); } catch (Throwable $e) {}
        $type = (string)($m['type'] ?? '-'); unset($m['type']);
        $clean = fn($s) => preg_replace('/[^\x20-\x7E]/', '?', substr((string)$s, 0, 120));
        $m = ['ip' => $clean($_SERVER['REMOTE_ADDR'] ?? '-'), 'ua' => $clean($_SERVER['HTTP_USER_AGENT'] ?? '-')] + $m;
        filelog_write($prefix, $type, (int)(http_response_code() ?: 200), $raw, $out, $m);
    });
}
