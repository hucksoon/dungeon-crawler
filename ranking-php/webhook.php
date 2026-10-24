<?php
// Xsolla 웹훅 (Store 프로젝트 config xsolla_project_id). Publisher Account → 프로젝트 → 웹훅에 이 파일 주소를 넣음
//   예: https://apacimtest.com/ranking/webhook.php
//
// 1단계: 기록만 함. 아이템·캐시는 지금처럼 상점 화면이 Xsolla 인벤토리에서 받아 감 (여기서 지급하지 않음)
//   user_validation            → 게임에 로그인한 적 있는 사용자면 204, 아니면 400 INVALID_USER
//                                 (계정 저장본이 있거나 known_users에 있음. 상점 로그인은 게임을 거치므로 사기 전에 기록됨)
//   order_paid / order_canceled → 주문 번호로 한 번만 기록 (같은 웹훅이 다시 와도 204, 두 번 기록하지 않음)
//   payment / refund           → (예전 방식 프로젝트) 거래 번호로 한 번만 기록
//   그 밖의 종류                → 204 (기다리는 다음 웹훅이 막히지 않게)
//
// 서명: Authorization: Signature <sha1(받은 본문 그대로 + 비밀 키)>. 비밀 키는 config.php의 webhook_secret
//   (Publisher Account → 프로젝트 → 웹훅의 비밀 키). 틀리면 400 INVALID_SIGNATURE
// 응답: 2xx 처리함 / 400 다시 보내지 않음(서명·형식 오류) / 500 잠시 뒤 다시 보냄(DB 오류 등)
//   400·500은 원인 코드와 웹훅 종류만 Apache 오류 로그에 남김 ([webhook] …)
// 개인정보: 이메일·IP·사용자 ID 원본은 저장하지 않음. 사용자는 게임과 같은 HMAC 키(u:<사용자 ID>)로만,
//   주문은 SKU·수량·금액·sandbox 여부만. 확인은 서버에서 admin.php webhooks

declare(strict_types=1);

if (!defined('RANKING_NO_ROUTE')) define('RANKING_NO_ROUTE', true);
require_once __DIR__ . '/api.php';

const WEBHOOK_MAX_BYTES = 262144;
const WEBHOOK_TYPES = ['order_paid', 'order_canceled', 'payment', 'refund'];

function webhook_tables(PDO $pdo): void {
    // event_key: "<종류>:<주문 번호 또는 거래 번호>" → 같은 웹훅은 한 줄만
    $pdo->exec('CREATE TABLE IF NOT EXISTS xsolla_events (
        event_key   VARCHAR(80) PRIMARY KEY,
        type        VARCHAR(24) NOT NULL,
        order_id    VARCHAR(32),
        tx_id       VARCHAR(32),
        user_key    VARCHAR(64),
        sandbox     INTEGER NOT NULL DEFAULT 0,
        items       TEXT,
        amount      VARCHAR(24),
        currency    VARCHAR(16),
        state       VARCHAR(12) NOT NULL,
        created_at  BIGINT NOT NULL
    )');
}

function webhook_fail(int $status, string $code, string $type = '-'): void {
    error_log("[webhook] {$status} {$code} type={$type}");
    http_response_code($status);
    header('Content-Type: application/json; charset=UTF-8');
    echo json_encode(['error' => ['code' => $code, 'message' => $code]]);
}

// 게임에 로그인한 적 있는 Xsolla Login 사용자인지 (게임과 같은 HMAC 키로 찾음)
function webhook_user_known(string $uid): bool {
    $key = hmac_hex('u:' . $uid);
    return (bool)q_val('SELECT 1 FROM profiles WHERE pkey = ?', [$key]) || (bool)q_val('SELECT 1 FROM known_users WHERE ukey = ?', [$key]);
}

function webhook_signature_ok(string $raw, string $secret): bool {
    $given = strtolower(trim((string)preg_replace('/^Signature\s+/i', '', header_value('Authorization'))));
    return $given !== '' && hash_equals(sha1($raw . $secret), $given);
}

// 숫자·문자 ID만 (주문·거래 번호)
function webhook_id($v): ?string {
    if (is_int($v) || (is_string($v) && preg_match('/^[0-9A-Za-z_-]{1,32}$/', $v))) return (string)$v;
    return null;
}

// 한 줄로 정리: 무엇을 얼마에 샀는지만 (이메일·IP 등은 버림)
function webhook_event(string $type, array $e): ?array {
    $billing = is_array($e['billing'] ?? null) ? $e['billing'] : [];
    $order = is_array($e['order'] ?? null) ? $e['order'] : [];
    $user = is_array($e['user'] ?? null) ? $e['user'] : [];
    $txId = webhook_id($billing['transaction']['id'] ?? $e['transaction']['id'] ?? null);
    $orderId = webhook_id($order['id'] ?? null);
    $key = in_array($type, ['order_paid', 'order_canceled'], true) ? $orderId : $txId;
    if ($key === null) return null;
    $uid = $user['external_id'] ?? $user['id'] ?? null;
    $items = [];
    foreach (is_array($e['items'] ?? null) ? $e['items'] : [] as $it) {
        if (!is_array($it) || !is_string($it['sku'] ?? null)) continue;
        $items[] = ['sku' => mb_substr($it['sku'], 0, 64), 'quantity' => (int)($it['quantity'] ?? 1), 'type' => is_string($it['type'] ?? null) ? $it['type'] : null];
    }
    $purchase = $billing['purchase'] ?? $e['purchase'] ?? [];
    $amount = $order['amount'] ?? $purchase['total']['amount'] ?? null;
    $currency = $order['currency'] ?? $purchase['total']['currency'] ?? null;
    $tx = $billing['transaction'] ?? $e['transaction'] ?? [];
    return [
        'event_key' => "{$type}:{$key}",
        'type' => $type,
        'order_id' => $orderId,
        'tx_id' => $txId,
        'user_key' => is_scalar($uid) && (string)$uid !== '' ? hmac_hex('u:' . $uid) : null,
        'sandbox' => (($order['mode'] ?? '') === 'sandbox' || (int)($tx['dry_run'] ?? 0) === 1) ? 1 : 0,
        'items' => $items ? json_encode($items, JSON_UNESCAPED_UNICODE) : null,
        'amount' => is_scalar($amount) ? mb_substr((string)$amount, 0, 24) : null,
        'currency' => is_string($currency) ? mb_substr($currency, 0, 16) : null,
        'state' => 'recorded',
        'created_at' => now_ms(),
    ];
}

// 처음이면 true, 이미 기록한 웹훅이면 false
function webhook_record(array $row): bool {
    $cols = implode(', ', array_keys($row));
    $marks = implode(', ', array_fill(0, count($row), '?'));
    try {
        db()->prepare("INSERT INTO xsolla_events ({$cols}) VALUES ({$marks})")->execute(array_values($row));
        return true;
    } catch (PDOException $e) {
        if ((string)$e->getCode() === '23000') return false;  // 같은 event_key (SQLite·MySQL 공통)
        throw $e;
    }
}

// 서버 명령(admin.php)이 함수만 빌려 쓸 때
if (defined('WEBHOOK_NO_ROUTE')) return;

try {
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') { http_response_code(404); exit; }
    $secret = (string)(config()['webhook_secret'] ?? '');
    if ($secret === '') { webhook_fail(500, 'NOT_CONFIGURED'); exit; }  // config.php에 webhook_secret이 없음
    $raw = (string)file_get_contents('php://input', false, null, 0, WEBHOOK_MAX_BYTES + 1);
    if (strlen($raw) > WEBHOOK_MAX_BYTES) { webhook_fail(400, 'INVALID_PARAMETER'); exit; }
    if (!webhook_signature_ok($raw, $secret)) { webhook_fail(400, 'INVALID_SIGNATURE'); exit; }
    $e = json_decode($raw, true);
    $type = is_array($e) ? ($e['notification_type'] ?? null) : null;
    if (!is_string($type)) { webhook_fail(400, 'INVALID_PARAMETER'); exit; }
    $type = mb_substr(preg_replace('/[^a-z_]/', '', $type), 0, 32);
    // 다른 프로젝트의 웹훅은 받지 않음 (프로젝트 번호가 있을 때)
    $project = $e['settings']['project_id'] ?? $e['billing']['settings']['project_id'] ?? null;
    $mine = (int)(config()['xsolla_project_id'] ?? DEFAULT_STORE_PROJECT);
    if ($project !== null && (int)$project !== $mine) { webhook_fail(400, 'INVALID_PARAMETER', $type); exit; }

    if ($type === 'user_validation') {
        $uid = $e['user']['id'] ?? null;
        if (!is_scalar($uid) || (string)$uid === '' || strlen((string)$uid) > 128 || !webhook_user_known((string)$uid)) { webhook_fail(400, 'INVALID_USER', $type); exit; }
        http_response_code(204);
        exit;
    }
    if (in_array($type, WEBHOOK_TYPES, true)) {
        $row = webhook_event($type, $e);
        if ($row === null) { webhook_fail(400, 'INVALID_PARAMETER', $type); exit; }
        webhook_tables(db());
        webhook_record($row);
    }
    http_response_code(204);
} catch (Throwable $err) {
    error_log('[webhook] ' . $err->getMessage());
    webhook_fail(500, 'SERVER_ERROR');
}
