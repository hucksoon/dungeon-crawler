<?php
// Xsolla Bot in Discord: 플레이어 ID로 로그인 확인 (dc#175)
//   Publisher Account → Storefront → Xsolla Bot in Discord → Settings → "User authentication webhook"에 이 파일 주소를 넣음
//   예: https://apacimtest.com/ranking/bot_auth.php
//
// 디스코드에서 /shop → 플레이어 ID(게임 계정 줄의 "🆔 플레이어 ID" = Xsolla Login 사용자 ID)를 넣으면
// Xsolla가 이 주소로 POST {"user": {"id": "...", "country": "KR"}, "settings": {"project_id", "merchant_id"}}를 보냄
//   형식: https://developers.xsolla.com/webhooks/user-validation/user-validation-in-webshop
//   (문서: 34.102.38.178에서 보냄 → 확인되면 config의 bot_auth_ips에 넣어 다른 곳의 요청을 막을 수 있음)
//   게임에 로그인한 적 있는 사용자 → 200 {"user": {"id": "<그 ID>"}}
//   모르는 사용자 → 404 {"error": {"code": "INVALID_USER"}}
//   형식 오류 → 400
// 결제 중 확인(user_validation)과 결제 웹훅은 그대로 webhook.php (서명 필수)
//
// 서명: 문서에 이 웹훅의 서명 방식이 없어서, Authorization: Signature가 오면 webhook_secret(또는 bot_auth_secret)으로
//   확인해 맞으면 "sig=ok", 아니면 "sig=none|other"를 로그에만 남기고 그대로 처리함 (이 주소가 돌려주는 것은
//   "그 ID가 우리 게임 계정인지"뿐이고, 이메일 등 다른 정보는 주지 않음). bot_auth_require_sig = true면 서명이 맞아야만 처리
//   bot_auth_ips(쉼표로 여럿)를 config에 넣으면 그 IP에서 온 요청만 받음
// 개인정보: 받은 ID는 저장하지 않고 HMAC으로만 찾음. 로그에는 결과와 서명 상태만 (ID·IP는 남기지 않음)

declare(strict_types=1);

if (!defined('RANKING_NO_ROUTE')) define('RANKING_NO_ROUTE', true);
require_once __DIR__ . '/api.php';

const BOT_AUTH_MAX_BYTES = 16384;

function bot_auth_out(int $status, ?array $body, string $why, string $sig): void {
    error_log("[bot_auth] {$status} {$why} sig={$sig}");
    http_response_code($status);
    if ($body !== null) {
        header('Content-Type: application/json; charset=UTF-8');
        echo json_encode($body, JSON_UNESCAPED_UNICODE);
    }
}

function bot_auth_known(string $uid): bool {
    $key = hmac_hex('u:' . $uid);
    try { if (q_val('SELECT 1 FROM profiles WHERE pkey = ?', [$key])) return true; } catch (Throwable $e) {}
    try { if (q_val('SELECT 1 FROM known_users WHERE ukey = ?', [$key])) return true; } catch (Throwable $e) {}
    return false;
}

try {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') { bot_auth_out(405, ['error' => ['code' => 'METHOD_NOT_ALLOWED']], 'method', '-'); exit; }
    $cfg = config();
    $ips = array_filter(array_map('trim', explode(',', (string)($cfg['bot_auth_ips'] ?? ''))));
    if ($ips && !in_array((string)($_SERVER['REMOTE_ADDR'] ?? ''), $ips, true)) { bot_auth_out(403, ['error' => ['code' => 'FORBIDDEN']], 'ip', '-'); exit; }

    $raw = (string)file_get_contents('php://input', false, null, 0, BOT_AUTH_MAX_BYTES + 1);
    if ($raw === '' || strlen($raw) > BOT_AUTH_MAX_BYTES) { bot_auth_out(400, ['error' => ['code' => 'INVALID_PARAMETER']], 'size', '-'); exit; }

    // 서명 상태 (어떤 키로 서명하는지 문서에 없어서 알아 두기 위해)
    $given = strtolower(trim((string)preg_replace('/^Signature\s+/i', '', header_value('Authorization'))));
    $sig = 'none';
    if ($given !== '') {
        $sig = 'other';
        foreach (['webhook_secret', 'bot_auth_secret'] as $k) {
            $secret = (string)($cfg[$k] ?? '');
            if ($secret !== '' && hash_equals(sha1($raw . $secret), $given)) { $sig = 'ok:' . $k; break; }
        }
    }
    if (!empty($cfg['bot_auth_require_sig']) && strpos($sig, 'ok:') !== 0) { bot_auth_out(401, ['error' => ['code' => 'INVALID_SIGNATURE']], 'sig', $sig); exit; }

    $e = json_decode($raw, true);
    if (!is_array($e)) { bot_auth_out(400, ['error' => ['code' => 'INVALID_PARAMETER']], 'json', $sig); exit; }
    // 다른 프로젝트 요청은 받지 않음 (프로젝트 번호가 있을 때)
    $project = $e['settings']['project_id'] ?? null;
    $mine = (int)($cfg['xsolla_project_id'] ?? (defined('DEFAULT_STORE_PROJECT') ? DEFAULT_STORE_PROJECT : 317991));
    if ($project !== null && (int)$project !== $mine) { bot_auth_out(400, ['error' => ['code' => 'INVALID_PARAMETER']], 'project', $sig); exit; }

    $uid = $e['user']['id'] ?? $e['user_id'] ?? $e['id'] ?? null;
    if (!is_scalar($uid)) { bot_auth_out(400, ['error' => ['code' => 'INVALID_PARAMETER']], 'no-id', $sig); exit; }
    $uid = trim((string)$uid);
    // Xsolla Login 사용자 ID는 UUID. 앞뒤 공백·대문자로 붙여 넣어도 찾게
    if (!preg_match('/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/', $uid)) {
        bot_auth_out(404, ['error' => ['code' => 'INVALID_USER', 'message' => 'Player ID not found']], 'format', $sig); exit;
    }
    $uid = strtolower($uid);
    if (!bot_auth_known($uid)) { bot_auth_out(404, ['error' => ['code' => 'INVALID_USER', 'message' => 'Player ID not found']], 'unknown', $sig); exit; }
    bot_auth_out(200, ['user' => ['id' => $uid]], 'ok', $sig);
} catch (Throwable $err) {
    error_log('[bot_auth] ' . $err->getMessage());
    bot_auth_out(500, ['error' => ['code' => 'SERVER_ERROR']], 'error', '-');
}
