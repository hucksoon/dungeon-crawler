<?php
// 테스트용 PHP 서버 설정 (가짜 키). 테스트마다 이 파일을 불러 db_dsn만 바꾼 config.<이름>.php를 만들어 씀
return [
  'hash_key' => str_repeat('k', 40),
  'dev_emails' => 'dev1@example.com, Dev2@Example.com',
  'login_project_id' => '30375188-893b-4b1a-ba1b-c8ba692fa5e3',
  'allowed_origins' => 'https://hucksoon.github.io',
  'db_dsn' => 'sqlite:' . __DIR__ . '/test.sqlite',
  'cache_dir' => __DIR__,
  'jwks_url' => 'http://127.0.0.1:8091/jwks.json',
  'xsolla_validate_url' => 'http://127.0.0.1:8091/validate',
  'jwt_secret' => getenv('TEST_JWT_SECRET') ?: '',
];
