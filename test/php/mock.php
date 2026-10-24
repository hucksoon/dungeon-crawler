<?php
// 테스트용 가짜 Xsolla: /jwks.json, /validate (good 토큰 목록 파일로 판정)
$dir = __DIR__;
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if ($uri === '/jwks.json') { header('Content-Type: application/json'); readfile("$dir/jwks.json"); return; }
if ($uri === '/validate') {
    file_put_contents("$dir/validate-calls.txt", "x", FILE_APPEND);
    $body = json_decode(file_get_contents('php://input'), true);
    $good = is_file("$dir/good-tokens.txt") ? file("$dir/good-tokens.txt", FILE_IGNORE_NEW_LINES) : [];
    http_response_code(in_array($body['token'] ?? '', $good, true) ? 204 : 422);
    return;
}
http_response_code(404);
